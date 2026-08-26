# omp-auth-broker

A Bun workspace that puts Oh My Pi's auth broker and a browser-based credential manager on one port. `packages/broker` runs the public service and CLI; `packages/ui` provides the Preact credential manager that the broker embeds. They share omp's credential vault and expose the upstream `/v1/*` broker API alongside the UI and control API.

> [!WARNING]
> **This service has no application authentication or Authorization handling.** Anyone who can reach its UI, `/api/*`, or `/v1/*` can use and change the shared credentials. Keep it on loopback or behind a reachability-restricting network gateway such as Tailscale. Never bind it directly to a public interface.

## Web UI

Open the server root in a browser to manage the shared vault:

- **Accounts** lists stored credentials with provider, identity, status, expiry, and refresh timing. Removing an account removes that provider's credentials from the shared vault.
- **Add** presents every supported OAuth provider.
- **Login** opens the provider's OAuth flow, including a paste-code prompt when required. OAuth login exists only in this UI flow through `/api/login`; it is never available through `/v1/*`.
- **Usage** shows per-credential reports and per-client request/token totals for the last 30 days.

The broker's internal listener uses `bearerTokens: []`, and the UI, `/api/*`, and `/v1/*` are intentionally open. The shared vault is omp's `~/.omp/agent.db`; set `PI_CONFIG_DIR` before starting the service when an isolated vault is needed.

## CLI

```sh
omp-auth-broker serve --bind=127.0.0.1:8765

# This compatibility token is not validated by the broker.
omp-auth-broker token
omp-auth-broker token --regenerate
omp-auth-broker token --json
```

`serve` accepts `--bind=<host:port>`. Use a loopback bind address unless Tailscale or another gateway restricts reachability.

## Development

Install the workspace dependencies, then use the root coordinator commands:

```sh
nix develop
bun install

# Run the public broker workspace
bun run dev -- --bind=127.0.0.1:8765

# Type-check both workspace configs
bun run check

# Build the browser bundle into packages/ui/dist
bun run build-ui

# Compile the broker binary from packages/broker/src/main.ts
bun run build
```

The default development shell provides matching `broker:dev`, `broker:check`, `ui:build`, and `broker:build` tasks.

## Nix build and run

Build the self-contained binary:

```sh
nix build
./result/bin/omp-auth-broker serve --bind=127.0.0.1:8765
```

The fixed-output workspace `nodeModules` derivation initially uses a placeholder hash. The first `nix build` reports the required hash; replace `outputHash` in `flake.nix` with that value and build again.
