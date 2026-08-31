# omp-auth-broker

## Architecture

`omp-auth-broker` is a lightweight, self-hostable Bun workspace version of Oh My Pi's auth broker. It exposes the shared OAuth vault, browser UI, and `/v1/*` broker API without installing or pulling the complete omp binary.

- `packages/broker` contains the public server and CLI. Its `src/main.ts`, `src/serve.ts`, `src/token.ts`, and `src/control.ts` are deliberately small glue around Oh My Pi.
- `packages/ui` contains the Preact browser credential manager. The broker embeds `packages/ui/index.html` when it serves the UI.

The broker serves the UI and open `/api/*` control API, and transparently proxies open `/v1/*` requests to an internal `startAuthBroker` listener. That listener uses `bearerTokens: []`; the public and internal servers share one `AuthStorage` backed by omp's agent database.

The broker wiring is trimmed from `packages/coding-agent/src/cli/auth-broker-cli.ts` upstream. When upgrading `@oh-my-pi` dependencies, re-diff that upstream file rather than reimplementing provider, credential, refresh, or broker behavior locally.

`nix/module.nix` exports the NixOS service as `services.omp-auth-broker`. Its package defaults to this flake's package, its bind default is `127.0.0.1:8765`, and `openFirewall` defaults to `false`.

## Security invariants

- There is **no application authentication or Authorization handling**. The UI, `/api/*`, and proxied `/v1/*` are all deliberately open.
- The service **MUST** be exposed only on loopback or behind a reachability-restricting network gateway such as Tailscale. **NEVER** bind it directly to a publicly reachable interface.
- OAuth login is UI-only through `/api/login`. **NEVER** add a login route to `/v1/*`.
- The shared credential vault is `~/.omp/agent.db`. Set `PI_CONFIG_DIR` to isolate a development or test vault; do not introduce another default vault.
- `openFirewall = false` controls only NixOS firewall rules. It does not make the service authenticated.

## Commands

```sh
# Workspace dependencies and local artifacts
bun install
bun run dev -- --bind=127.0.0.1:8765
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
./result/bin/omp-auth-broker serve --bind=127.0.0.1:8765
```

## Nix build invariants

`pkgs.importNpmLock` derives the Bun dependency closure from `bun.lock`. It relies on import-from-derivation (IFD), so evaluators **MUST** permit IFD. There is no manual aggregate dependency hash workflow: **NEVER** add a fixed-output `nodeModules` derivation or placeholder-hash instructions.

`packages.default` **MUST** set `dontStrip = true` and `dontPatchELF = true`. Nix's default fixup phase runs `strip` and `patchelf --shrink-rpath` on every ELF in `$out/bin`, and both truncate the binary's appended Bun standalone-executable data segment (`bun build --compile` appends the bundle after the base `bun` runtime, not inside a normal ELF section), leaving a binary that behaves like plain `bun` instead of `omp-auth-broker`.

The install phase **MUST** copy `pi_natives.*.node` next to the compiled binary. `@oh-my-pi/pi-natives`'s loader resolves the native addon from `node_modules` only in non-compiled Bun processes; a `bun build --compile` binary is detected via `import.meta.url` and only searches `~/.omp/natives/<version>/` and the directory containing `process.execPath`. Shipping both CPU variants (`modern`/`baseline`) next to the binary satisfies the latter without depending on a pre-populated `~/.omp/natives` cache on the host.

## Verification

With a development server running on `127.0.0.1:8765`:

```sh
curl -sf http://127.0.0.1:8765/v1/healthz
curl -sf http://127.0.0.1:8765/v1/snapshot
curl -sf http://127.0.0.1:8765/api/providers
curl -sf http://127.0.0.1:8765/api/usage
```

Check the UI at `http://127.0.0.1:8765/`: Accounts must show credential state and refresh timing, Add must list providers, Login must display its OAuth flow, and Usage must show credential and 30-day client usage.

## Style

Keep glue small and direct. Prefer minimal comments, use braces on conditionals, and keep CSS hand-written and minimal rather than adding a styling framework.
