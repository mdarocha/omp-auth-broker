import { basename, join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { z } from "zod";

const tokenResponseSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const nativeModuleNames = ["pi_natives.linux-x64-modern.node", "pi_natives.linux-x64-baseline.node"] as const;
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

function reserveLoopbackPort(): number {
    const reservation = Bun.serve({
        fetch: () => new Response(null, { status: 204 }),
        hostname: "127.0.0.1",
        port: 0,
    });
    const { port } = reservation;
    void reservation.stop(true);
    if (typeof port !== "number") {
        throw new Error("Could not reserve a loopback TCP port");
    }
    return port;
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
        // The external compiled process has no readiness event available to this test.
        await Bun.sleep(pollIntervalMs);
    }
    throw new Error(`Timed out waiting for ${url}/v1/healthz`, { cause: lastError });
}

async function terminate(process: Bun.Subprocess | undefined): Promise<void> {
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
    let server: Bun.Subprocess | undefined;
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

        const port = reserveLoopbackPort();
        const baseUrl = `http://127.0.0.1:${port}`;
        server = Bun.spawn({
            cmd: [executablePath, "serve", `--bind=127.0.0.1:${port}`],
            env,
            stderr: "pipe",
            stdout: "pipe",
        });
        await waitForHealth(baseUrl);

        const root = await fetch(baseUrl);
        expect(root.status).toBe(200);
        expect(await root.text()).toContain("<title>omp auth broker</title>");
    } finally {
        await terminate(server);
        await rm(tempDir, { force: true, recursive: true });
    }
}, 30_000);
