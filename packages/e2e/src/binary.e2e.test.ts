import { basename, join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { assertLoopbackHttpUrl } from "./loopback";
import { tmpdir } from "node:os";
import { z } from "zod";

const tokenResponseSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const nativeModuleNames = ["pi_natives.linux-x64-modern.node", "pi_natives.linux-x64-baseline.node"] as const;
type ServerProcess = Bun.Subprocess<"ignore", "pipe", "pipe">;

const readinessTimeoutMs = 5000;
const pollIntervalMs = 50;

interface CommandResult {
    exitCode: number;
    stderr: string;
    stdout: string;
}

async function runCommand(command: string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
    const process = Bun.spawn({ cmd: command, env, stderr: "pipe", stdout: "pipe" });
    const stderr = process.stderr ? new Response(process.stderr).text() : Promise.resolve("");
    const stdout = process.stdout ? new Response(process.stdout).text() : Promise.resolve("");
    const [exitCode, errorOutput, standardOutput] = await Promise.all([process.exited, stderr, stdout]);
    return { exitCode, stderr: errorOutput, stdout: standardOutput };
}

async function copyNativeModules(repoRoot: string, destination: string): Promise<void> {
    for (const nativeModuleName of nativeModuleNames) {
        const glob = new Bun.Glob(`node_modules/**/${nativeModuleName}`);
        let sourcePath: string | undefined;
        for await (const path of glob.scan({ cwd: repoRoot, onlyFiles: true, dot: true })) {
            sourcePath = path;
            break;
        }
        if (!sourcePath) {
            throw new Error(`Could not find ${nativeModuleName} in repository node_modules`);
        }
        await Bun.write(join(destination, basename(sourcePath)), Bun.file(join(repoRoot, sourcePath)));
    }
}

async function readListeningUrl(output: ReadableStream<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    const reader = output.getReader();
    let text = "";
    try {
        while (true) {
            const result = await reader.read();
            if (result.done) {
                break;
            }
            text = `${text}${decoder.decode(result.value, { stream: true })}`.slice(-4096);
            const listeningUrl = /omp-auth-broker listening[\s\S]*?(http:\/\/[^\s"]+)/.exec(text)?.[1];
            if (listeningUrl) {
                return assertLoopbackHttpUrl(listeningUrl).origin;
            }
        }
    } finally {
        reader.releaseLock();
    }
    throw new Error("Compiled server output ended without reporting its listening URL");
}

async function waitForListeningUrl(process: ServerProcess): Promise<string> {
    const output = Promise.any([readListeningUrl(process.stdout), readListeningUrl(process.stderr)]).catch(() => {
        throw new Error("Compiled server output ended without reporting its listening URL");
    });
    const deadline = new Promise<never>((_, reject) => {
        AbortSignal.timeout(readinessTimeoutMs).addEventListener(
            "abort",
            () =>
                reject(
                    new Error(
                        `Timed out waiting for compiled server to report its listening URL after ${readinessTimeoutMs}ms`,
                    ),
                ),
            { once: true },
        );
    });
    const exited = process.exited.then((exitCode) => {
        throw new Error(`Compiled server exited before becoming ready with code ${exitCode}`);
    });
    return await Promise.race([output, exited, deadline]);
}

async function waitForHealth(url: string): Promise<void> {
    const deadline = Date.now() + readinessTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/v1/healthz`, { signal: AbortSignal.timeout(pollIntervalMs) });
            if (response.status === 200) {
                return;
            }
        } catch (error) {
            lastError = error;
        }
        await Bun.sleep(pollIntervalMs);
    }
    throw new Error(`Timed out waiting for ${url}/v1/healthz`, { cause: lastError });
}

async function terminate(process: ServerProcess | undefined): Promise<void> {
    if (!process) {
        return;
    }
    if (process.exitCode === null) {
        process.kill("SIGTERM");
    }
    await process.exited;
}

test("compiled executable generates a token and serves the UI", async () => {
    const repoRoot = resolve(import.meta.dir, "../../..");
    const tempDir = await mkdtemp(join(tmpdir(), "omp-auth-broker-binary-e2e-"));
    let server: ServerProcess | undefined;
    try {
        const executablePath = join(tempDir, "omp-auth-broker");
        const build = await runCommand(
            [
                process.execPath,
                "build",
                "--compile",
                join(repoRoot, "packages/broker/src/main.ts"),
                "--outfile",
                executablePath,
            ],
            process.env,
        );
        expect(build.exitCode, build.stderr).toBe(0);
        await copyNativeModules(repoRoot, tempDir);

        const configDir = join(tempDir, "config");
        const env = { ...process.env, PI_CONFIG_DIR: configDir };
        const token = await runCommand([executablePath, "token", "--json"], env);
        expect(token.exitCode, token.stderr).toBe(0);
        tokenResponseSchema.parse(JSON.parse(token.stdout));

        server = Bun.spawn({
            cmd: [executablePath, "serve", "--bind=127.0.0.1:0"],
            env,
            stdin: "ignore",
            stderr: "pipe",
            stdout: "pipe",
        });
        const baseUrl = await waitForListeningUrl(server);
        await waitForHealth(baseUrl);

        const root = await fetch(baseUrl);
        expect(root.status).toBe(200);
        expect(await root.text()).toContain("<title>omp auth broker</title>");
    } finally {
        await terminate(server);
        await rm(tempDir, { force: true, recursive: true });
    }
}, 30_000);
