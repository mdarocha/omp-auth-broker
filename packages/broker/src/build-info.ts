import { logger } from "@oh-my-pi/pi-utils";

let cachedCommit: Promise<string> | undefined;

/**
 * The short commit hash of this repository that the running server was built from.
 *
 * Compiled builds bake this in at build time via `--define process.env.OMP_AUTH_BROKER_COMMIT=...`
 * (see `flake.nix` and the root `build` script). Uncompiled dev runs fall back to asking
 * git directly, since the working tree is right there.
 */
export function getBuildCommit(): Promise<string> {
    cachedCommit ??= resolveBuildCommit();
    return cachedCommit;
}

async function resolveBuildCommit(): Promise<string> {
    const baked = process.env.OMP_AUTH_BROKER_COMMIT;
    if (baked) {
        return baked;
    }
    try {
        const result = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
            cwd: import.meta.dir,
            stdout: "pipe",
            stderr: "ignore",
        });
        const [commit, exitCode] = await Promise.all([new Response(result.stdout).text(), result.exited]);
        if (exitCode === 0 && commit.trim()) {
            return commit.trim();
        }
    } catch (error) {
        logger.debug("omp-auth-broker could not resolve a build commit from git", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return "unknown";
}
