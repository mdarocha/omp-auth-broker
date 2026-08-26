# omp-auth-broker

## Architecture

`omp-auth-broker` is a Bun workspace:

- `packages/broker` contains the public server and CLI. Its `src/main.ts`, `src/serve.ts`, `src/token.ts`, and `src/control.ts` are deliberately small glue around Oh My Pi.
- `packages/ui` contains the Preact browser credential manager. The broker embeds `packages/ui/index.html` when it serves the UI.

The broker serves the UI and open `/api/*` control API, and transparently proxies open `/v1/*` requests to an internal `startAuthBroker` listener. That listener uses `bearerTokens: []`; the public and internal servers share one `AuthStorage` backed by omp's agent database.

The broker wiring is trimmed from `packages/coding-agent/src/cli/auth-broker-cli.ts` upstream. When upgrading `@oh-my-pi` dependencies, re-diff that upstream file rather than reimplementing provider, credential, refresh, or broker behavior locally.

## Security invariants

- There is **no application authentication or Authorization handling**. The UI, `/api/*`, and proxied `/v1/*` are all deliberately open.
- The service **MUST** be exposed only on loopback or behind a reachability-restricting network gateway such as Tailscale. **NEVER** bind it directly to a publicly reachable interface.
- OAuth login is UI-only through `/api/login`. **NEVER** add a login route to `/v1/*`.
- The shared credential vault is `~/.omp/agent.db`. Set `PI_CONFIG_DIR` to isolate a development or test vault; do not introduce another default vault.

## Commands

```sh
# Development shell and workspace dependencies
nix develop
bun install

# Run the single public server from the broker workspace
bun run dev -- --bind=127.0.0.1:8765

# Print a compatibility token for clients that insist on one.
# The server does not validate this token.
bun --cwd packages/broker run src/main.ts token
bun --cwd packages/broker run src/main.ts token --regenerate
bun --cwd packages/broker run src/main.ts token --json

# Type-check workspaces and build local artifacts
bun run check
bun run build-ui
bun run build

# Build and run the Nix binary
nix build
./result/bin/omp-auth-broker serve --bind=127.0.0.1:8765
```

The fixed-output `nodeModules` derivation begins with `pkgs.lib.fakeHash`. On the first `nix build`, replace `outputHash` in `flake.nix` with Nix's reported hash, then build again.

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
