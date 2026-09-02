# omp-auth-broker

## Architecture

`omp-auth-broker` is a lightweight, self-hostable Bun workspace version of Oh My Pi's auth broker. It exposes the shared OAuth vault, browser UI, and `/v1/*` broker API without installing or pulling the complete omp binary.

- `packages/broker` contains the public server and CLI. Its `src/main.ts`, `src/serve.ts`, `src/token.ts`, and `src/control.ts` are deliberately small glue around Oh My Pi.
- `packages/ui` contains the Preact browser credential manager. The broker embeds `packages/ui/index.html` when it serves the UI.

The broker serves the UI and open `/api/*` control API, and transparently proxies open `/v1/*` requests to an internal `startAuthBroker` listener. That listener uses `bearerTokens: []`; the public and internal servers share one `AuthStorage` backed by omp's agent database.

The broker wiring is trimmed from `packages/coding-agent/src/cli/auth-broker-cli.ts` upstream. Its serve storage must keep the `mcp_oauth:*` refresh override because the headless broker does not load the MCP manager; re-diff the upstream broker and MCP refresh code when upgrading `@oh-my-pi` dependencies.

The `serve` command accepts only `--settings=<path>`. That JSON file carries `port` (default `8765`), the optional `hostname`, and the optional `logJson` (default `false`); `packages/broker/src/serve.ts` binds `LOOPBACK_HOSTNAME` unconditionally. `startServe` takes parsed `BrokerSettings`, so tests bind an ephemeral port with `startServe({ port: 0 })` and only `runServe` reads the file.

`nix/module.nix` exports the NixOS service as `services.omp-auth-broker` with exactly four options: `enable`, `package`, `dataDir` (default `/var/lib/omp-auth-broker`), and `settings`. `settings.port` defaults to `8765`; `settings.hostname` defaults to `null` and, when set, is the external name accepted in the Host header for DNS-rebinding protection, not authentication. `settings.logJson` defaults to `false`. The unit always binds `127.0.0.1` using the configured port; the address is not configurable, and the module never touches `networking.firewall`.

`packages/broker/src/logging.ts` takes over console rendering from `@oh-my-pi/pi-utils`'s logger (`setTransports({ console: false, file: false })` plus a `registerLogSink`), because both this package's own `logger.*` calls and the vendored `startAuthBroker` listener's calls go through that same process-wide singleton. It tags each line's source as `[gateway]` (this package's own code — UI, `/api/*`, proxying, CLI) or `[auth-broker]` (the vendored internal listener). That distinction is structural, not text-based: `serve.ts` calls `startBroker` — which invokes the synchronous `startAuthBroker` — inside `runAsAuthBroker`, an `AsyncLocalStorage.run()`. Both `Bun.serve()`'s `fetch` handler and `setTimeout`/`setInterval` capture the AsyncLocalStorage context active when they're _created_, so every request the internal listener later handles and every timer it schedules (its token refresher, its external-change poller) inherits the tag, however upstream ever words its log lines. `AUTH_BROKER_MESSAGE_PATTERN` (matching the `auth-broker`/`Auth broker` prefix every log line inside `@oh-my-pi/pi-ai`'s auth-broker submodule is written with) is only a fallback for that submodule's logs that fire outside `runAsAuthBroker`'s scope, e.g. peer-discovery polling triggered by `AuthStorage` itself. `main.ts` calls `initLogging()` once, before parsing args, so failures during settings loading still render; `runServe` calls `setLogFormat("json" | "pretty")` once settings are known. `packages/broker/src/request-log.ts` logs every request the public server receives (`incoming request`) and every request `packages/broker/src/proxy.ts` makes to the internal listener (`outgoing request`); e2e tests that call `startServe` directly (via `packages/e2e/src/fixture.ts`) never touch `initLogging`/`setLogFormat`, so they stay quiet unless `runServe`/the CLI is exercised.

## Security invariants

- There is **no application authentication or Authorization handling**. The UI, `/api/*`, and proxied `/v1/*` are all deliberately open.
- The service **MUST** be exposed only on loopback or behind a reachability-restricting network gateway such as Tailscale. **NEVER** bind it directly to a publicly reachable interface.
- OAuth login is UI-only through `/api/login`. **NEVER** add a login route to `/v1/*`.
- The shared credential vault is omp's own `~/.omp/agent/agent.db`, resolved through `getAgentDbPath()`. Set `PI_CONFIG_DIR` to isolate a development or test vault; do not introduce another default vault.
- The listen address is hardcoded to loopback and the CLI exposes no bind flag; **NEVER** add one. There is no `openFirewall` option and the module never opens a firewall port.

## Commands

```sh
# Workspace dependencies and local artifacts
bun install
bun run dev
bun run check
bun run build-ui
bun run build

# Compatibility token for clients that insist on one.
# The server does not validate this token.
bun --cwd packages/broker ./src/main.ts token
bun --cwd packages/broker ./src/main.ts token --regenerate
bun --cwd packages/broker ./src/main.ts token --json

# Build and run the Nix binary
nix build
./result/bin/omp-auth-broker serve
```

## Nix build invariants

`pkgs.importNpmLock` derives the Bun dependency closure from `bun.lock`. It relies on import-from-derivation (IFD), so evaluators **MUST** permit IFD. There is no manual aggregate dependency hash workflow: **NEVER** add a fixed-output `nodeModules` derivation or placeholder-hash instructions.

`packages.default` **MUST** set `dontStrip = true` and `dontPatchELF = true`. Nix's default fixup phase runs `strip` and `patchelf --shrink-rpath` on every ELF in `$out/bin`, and both truncate the binary's appended Bun standalone-executable data segment (`bun build --compile` appends the bundle after the base `bun` runtime, not inside a normal ELF section), leaving a binary that behaves like plain `bun` instead of `omp-auth-broker`.

The install phase **MUST** copy `pi_natives.*.node` next to the compiled binary. `@oh-my-pi/pi-natives`'s loader resolves the native addon from `node_modules` only in non-compiled Bun processes; a `bun build --compile` binary is detected via `import.meta.url` and only searches `~/.omp/natives/<version>/` and the directory containing `process.execPath`. Shipping both CPU variants (`modern`/`baseline`) next to the binary satisfies the latter without depending on a pre-populated `~/.omp/natives` cache on the host.

`checks.e2e` is `e2eBuild` in `flake.nix`: a single sandboxed derivation running the full `packages/e2e` suite (`bun test --max-concurrency=1`) with no ambient nixpkgs and no host network — Chromium, the broker server, and the mock provider all run loopback-only, and its `installPhase` copies `docs/screenshots/*.png` into `$out/screenshots`. `packages.screenshots` is a trivial `runCommand` that copies those PNGs out of `e2eBuild` — Nix reuses the already-built `e2eBuild` store path, so `nix build .#screenshots` **NEVER** reruns the e2e suite when `checks.e2e` already built it. `packages.screenshots` **MUST** stay a thin consumer of `e2eBuild`; **NEVER** give it its own `buildPhase` that re-runs `bun test`.

CI's screenshot-refresh step runs `nix build .#screenshots` — it no longer uses `nix develop`, so the browser suite runs in the identical hermetic sandbox locally and in CI. It is two-fold based on trigger. On `push` to `main` — which a branch ruleset blocks from direct pushes — it resets a single `chore/refresh-screenshots` branch to `origin/main`, force-pushes the new screenshots, and opens at most one PR against `main` (checked via `gh pr list` first); that PR is merged manually, never auto-merged.

On `pull_request` (same-repo branches only; forks and `dependabot[bot]` are skipped since their `GITHUB_TOKEN` is read-only), the step **MUST NOT** commit to `github.head_ref`: a `GITHUB_TOKEN` push moves the PR's HEAD to a new SHA but never triggers a new workflow run (GitHub's loop-prevention, not a bug), so the required status check never gets reported against that SHA and the PR is stuck "expected" forever. Instead it pushes the new PNGs to a throwaway `screenshots/pr-<number>` branch (orphaned, force-pushed each run, never merged) and links them via `raw.githubusercontent.com` in a single PR comment, updated in place across runs by matching a `<!-- omp-auth-broker:screenshot-preview -->` marker as the comment's first line through `gh api`. The step skips entirely (no branch push, no comment) when the freshly built PNGs are byte-identical to what's already in `docs/screenshots` on that PR.

`GITHUB_TOKEN`-authored commits and PRs (the `chore/refresh-screenshots` branch/PR included) **NEVER** trigger new workflow runs — this is GitHub's loop-prevention, not a bug. `chore/refresh-screenshots` therefore opens with no Check run and shows "blocked" until a human manually re-runs `✅ Lint & test` (`workflow_dispatch`, ref `chore/refresh-screenshots`) or pushes a commit to it from a real account; only then does the required status check populate and the PR become mergeable.

`packages/e2e/src/screenshots.e2e.test.ts` normalizes every volatile, time-dependent DOM value (absolute timestamps, "in 3 secs"/"5 mins ago" subtitles, the Usage "Updated ... ago" label) to fixed placeholders immediately before each capture, so the PNGs are byte-identical across runs when the UI itself hasn't changed — verified by forcing an independent rebuild of `checks.e2e` and diffing output hashes. This is what makes the `cmp -s` skip check above meaningful instead of always seeing a diff.

`packages/ui/src/fonts/*.woff2` are vendored Geist and JetBrains Mono variable-font files (OFL-licensed), loaded via local `@font-face` rules in `app.css`. The UI has zero external network dependencies; `index.html` carries no Google Fonts `<link>`. Provider brand marks come from `@lobehub/icons-static-svg` (curated specifically for AI/LLM inference vendors — plain `simple-icons` has no OpenAI mark and misses most inference providers), imported as raw SVG text (`with { type: "text" }`) and rendered through the shared `<Icon>` component; providers with no dedicated mark fall back to a plain initial (`ProviderIcon.tsx`). Interface icons (e.g. the account-removal trash icon) come from `lucide-static` through the same `<Icon>` component. Both are MIT-licensed static SVG sets pulled from `node_modules`, never fetched from a CDN.

Both `packages.default` and the root `build` script bake this repository's short commit hash into the compiled binary via `bun build --compile --define process.env.OMP_AUTH_BROKER_COMMIT="'<hash>'"`; `packages/broker/src/build-info.ts` reads that at runtime and falls back to shelling out to `git rev-parse --short HEAD` for uncompiled `bun run dev` runs. **NEVER** read the commit from a bind-mounted `.git` directory at runtime — the compiled binary must work standalone.

## Verification

With a development server running on `127.0.0.1:8765`:

```sh
curl -sf http://127.0.0.1:8765/v1/healthz
curl -sf http://127.0.0.1:8765/v1/snapshot
curl -sf http://127.0.0.1:8765/api/providers
curl -sf http://127.0.0.1:8765/api/usage
curl -sf http://127.0.0.1:8765/api/version
```

Check the UI at `http://127.0.0.1:8765/`: Accounts must show credential state and refresh timing, Add must list providers, Login must display its OAuth flow, and Usage must show credential and 30-day client usage (refreshing itself every 30s). There is no header or numbered subheads; the only footer content is the short build commit from `/api/version`, sourced from `packages/broker/src/build-info.ts`.

## Style

Keep glue small and direct. Prefer minimal comments, use braces on conditionals, and keep CSS hand-written and minimal rather than adding a styling framework. **Never hand-roll icon SVG paths** — source every icon from an existing library (`@lobehub/icons-static-svg` for AI/LLM provider brand marks, `lucide-static` for interface icons) and render it through `packages/ui/src/components/Icon.tsx`.
