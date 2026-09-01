import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;
type BunPackage = [string, string, JsonRecord, string];

type PackageDescriptor = {
    key: string;
    name: string;
    version: string;
    metadata: JsonRecord;
    integrity: string;
};

type ManifestSpec = {
    path: string;
    dev: boolean;
};

const metadataFields = ["dependencies", "optionalDependencies", "os", "cpu", "bin", "peerDependencies"] as const;

function fail(message: string): never {
    throw new Error(`bun-lock-to-package-lock: ${message}`);
}

function record(value: unknown, context: string): JsonRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        fail(`${context} must be an object`);
    }
    return value as JsonRecord;
}

function stringMap(value: unknown, context: string): Record<string, string> {
    const result = record(value, context);
    for (const [name, version] of Object.entries(result)) {
        if (typeof version !== "string") {
            fail(`${context}.${name} must be a string`);
        }
    }
    return result as Record<string, string>;
}

function packageNameAndVersion(locator: string, key: string): [string, string] {
    const separator = locator.lastIndexOf("@");
    if (separator <= 0 || separator === locator.length - 1) {
        fail(`unsupported package locator ${JSON.stringify(locator)} for ${JSON.stringify(key)}`);
    }

    const name = locator.slice(0, separator);
    const version = locator.slice(separator + 1);
    if (!/^@?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/i.test(name)) {
        fail(`unsupported registry or git package locator ${JSON.stringify(locator)} for ${JSON.stringify(key)}`);
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
        fail(`unsupported registry or git package locator ${JSON.stringify(locator)} for ${JSON.stringify(key)}`);
    }
    return [name, version];
}

function descriptor(key: string, value: unknown): PackageDescriptor {
    if (!Array.isArray(value) || value.length !== 4) {
        fail(`package ${JSON.stringify(key)} must be a Bun lock v1 package tuple`);
    }

    const [locator, resolution, metadata, integrity] = value;
    if (typeof locator !== "string" || typeof resolution !== "string" || typeof integrity !== "string") {
        fail(`package ${JSON.stringify(key)} has an invalid Bun lock v1 package tuple`);
    }
    if (resolution !== "") {
        fail(`unsupported registry or git resolution ${JSON.stringify(resolution)} for ${JSON.stringify(key)}`);
    }
    if (!integrity.startsWith("sha512-")) {
        fail(`package ${JSON.stringify(key)} must provide a sha512 integrity value`);
    }

    const [name, version] = packageNameAndVersion(locator, key);
    return { key, name, version, metadata: record(metadata, `package ${JSON.stringify(key)} metadata`), integrity };
}

function assertNpmDependency(name: string, specifier: string, source: string): void {
    if (/^(?:workspace:|file:|link:|git\+|git:|github:|https?:)/.test(specifier)) {
        fail(`unsupported workspace, registry, or git dependency ${JSON.stringify(name)} from ${source}`);
    }
}

function addDependencies(
    destination: Record<string, string>,
    dependencies: Record<string, string>,
    source: string,
): void {
    for (const [name, specifier] of Object.entries(dependencies)) {
        if (destination[name] !== undefined && destination[name] !== specifier) {
            fail(`ambiguous direct dependency ${JSON.stringify(name)} from ${source}`);
        }
        assertNpmDependency(name, specifier, source);
        destination[name] = specifier;
    }
}

function tarballUrl(name: string, version: string): string {
    const basename = name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
    return `https://registry.npmjs.org/${name}/-/${basename}-${version}.tgz`;
}

function packageMetadata(descriptor: PackageDescriptor, optionalOnly: boolean): JsonRecord {
    const result: JsonRecord = {
        version: descriptor.version,
        resolved: tarballUrl(descriptor.name, descriptor.version),
        integrity: descriptor.integrity,
    };

    for (const field of metadataFields) {
        const value = descriptor.metadata[field];
        if (value !== undefined) {
            result[field] = value;
        }
    }

    const optionalPeers = descriptor.metadata.optionalPeers;
    if (optionalPeers !== undefined) {
        if (!Array.isArray(optionalPeers) || optionalPeers.some((name) => typeof name !== "string")) {
            fail(`package ${JSON.stringify(descriptor.key)} optionalPeers must be an array of names`);
        }
        const peerDependenciesMeta =
            descriptor.metadata.peerDependenciesMeta === undefined
                ? {}
                : {
                      ...record(
                          descriptor.metadata.peerDependenciesMeta,
                          `package ${JSON.stringify(descriptor.key)} peerDependenciesMeta`,
                      ),
                  };
        for (const name of optionalPeers) {
            peerDependenciesMeta[name] = {
                ...record(
                    peerDependenciesMeta[name] ?? {},
                    `package ${JSON.stringify(descriptor.key)} peerDependenciesMeta.${name}`,
                ),
                optional: true,
            };
        }
        result.peerDependenciesMeta = peerDependenciesMeta;
    } else if (descriptor.metadata.peerDependenciesMeta !== undefined) {
        result.peerDependenciesMeta = descriptor.metadata.peerDependenciesMeta;
    }

    if (optionalOnly && (descriptor.metadata.os !== undefined || descriptor.metadata.cpu !== undefined)) {
        result.optional = true;
    }

    return result;
}

async function manifestDependencies(root: string, spec: ManifestSpec): Promise<Record<string, string>> {
    const manifest = record(JSON.parse(await Bun.file(resolve(root, spec.path)).text()), spec.path);
    const dependencies =
        manifest.dependencies === undefined ? {} : stringMap(manifest.dependencies, `${spec.path} dependencies`);
    if (!spec.dev) {
        return dependencies;
    }
    const devDependencies =
        manifest.devDependencies === undefined
            ? {}
            : stringMap(manifest.devDependencies, `${spec.path} devDependencies`);
    return { ...dependencies, ...devDependencies };
}

async function convert(lockPath: string, root: string, manifests: ManifestSpec[]): Promise<JsonRecord> {
    const lock = record(Bun.JSON5.parse(await Bun.file(lockPath).text()), "bun.lock");
    if (lock.lockfileVersion !== 1) {
        fail(`expected Bun lockfileVersion 1, got ${JSON.stringify(lock.lockfileVersion)}`);
    }

    const catalog = new Map<string, PackageDescriptor>();
    const packageEntries = Object.entries(record(lock.packages, "bun.lock packages")).filter(
        ([, value]) => !Array.isArray(value) || !String(value[0]).includes("@workspace:"),
    );
    for (const [key, value] of packageEntries) {
        const entry = descriptor(key, value);
        const previous = catalog.get(entry.name);
        if (previous !== undefined && previous.version !== entry.version) {
            fail(
                `ambiguous duplicate versions for ${JSON.stringify(entry.name)}: ${previous.version} and ${entry.version}`,
            );
        }
        if (previous !== undefined && previous.key !== entry.key) {
            fail(`ambiguous duplicate package entries for ${JSON.stringify(entry.name)}`);
        }
        catalog.set(entry.name, entry);
    }

    const dependencies: Record<string, string> = {};
    for (const spec of manifests) {
        addDependencies(dependencies, await manifestDependencies(root, spec), spec.path);
    }

    const reached = new Map<string, boolean>();
    const queue: Array<{ name: string; optional: boolean }> = Object.keys(dependencies).map((name) => ({
        name,
        optional: false,
    }));

    for (let index = 0; index < queue.length; index += 1) {
        const { name, optional } = queue[index];
        const previous = reached.get(name);
        if (previous !== undefined && (!previous || optional)) {
            continue;
        }
        reached.set(name, optional);

        const entry = catalog.get(name);
        if (entry === undefined) {
            fail(`dependency ${JSON.stringify(name)} is absent from bun.lock packages`);
        }

        const regularDependencies =
            entry.metadata.dependencies === undefined
                ? {}
                : stringMap(entry.metadata.dependencies, `package ${JSON.stringify(entry.key)} dependencies`);
        const optionalDependencies =
            entry.metadata.optionalDependencies === undefined
                ? {}
                : stringMap(
                      entry.metadata.optionalDependencies,
                      `package ${JSON.stringify(entry.key)} optionalDependencies`,
                  );

        for (const [dependency, specifier] of Object.entries(regularDependencies)) {
            assertNpmDependency(dependency, specifier, `package ${JSON.stringify(entry.key)}`);
            queue.push({ name: dependency, optional });
        }
        for (const [dependency, specifier] of Object.entries(optionalDependencies)) {
            assertNpmDependency(dependency, specifier, `package ${JSON.stringify(entry.key)}`);
            queue.push({ name: dependency, optional: true });
        }
    }

    const packages: Record<string, JsonRecord> = {
        "": {
            name: "omp-auth-broker",
            version: "0.1.0",
            dependencies,
        },
    };
    for (const [name, optionalOnly] of reached) {
        const entry = catalog.get(name);
        if (entry === undefined) {
            fail(`dependency ${JSON.stringify(name)} is absent from bun.lock packages`);
        }
        packages[`node_modules/${name}`] = packageMetadata(entry, optionalOnly);
    }

    return {
        name: "omp-auth-broker",
        version: "0.1.0",
        lockfileVersion: 3,
        requires: true,
        packages,
    };
}

function parseManifests(value: string): ManifestSpec[] {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) {
        fail("dependency-root manifests argument must be a non-empty JSON array");
    }
    return parsed.map((entry, index) => {
        const context = `dependency-root manifests[${index}]`;
        const object = record(entry, context);
        if (typeof object.path !== "string" || typeof object.dev !== "boolean") {
            fail(`${context} must have a string "path" and a boolean "dev"`);
        }
        return { path: object.path, dev: object.dev };
    });
}

const lockPath = Bun.argv[2];
if (lockPath === undefined) {
    fail("expected the bun.lock path as the first argument");
}
const root = Bun.argv[3] ?? dirname(resolve(lockPath));
const manifestsArg = Bun.argv[4];
if (manifestsArg === undefined) {
    fail("expected a JSON array of dependency-root manifests as the third argument");
}
const manifests = parseManifests(manifestsArg);

try {
    console.log(JSON.stringify(await convert(lockPath, root, manifests)));
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
