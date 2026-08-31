> ⚠️ **100% vibecoded codebase**

# omp-auth-broker

`omp-auth-broker` is a lightweight, self-hostable version of Oh My Pi's auth broker. It exposes a shared OAuth vault, the `/v1/*` API, and a browser UI without installing or pulling the complete omp binary.

> [!WARNING]
> **This service has no application authentication or Authorization handling.** Anyone who can reach its UI, `/api/*`, or `/v1/*` can use and change the shared credentials. Keep it on loopback or behind a reachability-restricting network gateway such as Tailscale. Never bind it directly to a public interface.

The UI, `/api/*`, and `/v1/*` are intentionally open; the broker's internal listener uses `bearerTokens: []`. The shared vault is omp's `~/.omp/agent.db`. Set `PI_CONFIG_DIR` before starting the service when an isolated vault is needed.

## Web UI

Open the server root in a browser to manage the shared vault:

- **Accounts** lists stored credentials with provider, identity, status, expiry, and refresh timing. Removing an account removes that provider's credentials from the shared vault.
- **Add** presents every supported OAuth provider.
- **Login** opens the provider's OAuth flow, including a paste-code prompt when required. OAuth login exists only in this UI flow through `/api/login`; it is never available through `/v1/*`.
- **Usage** shows per-credential reports and per-client request/token totals for the last 30 days.

## CLI

```sh
omp-auth-broker serve --bind=127.0.0.1:8765

# This compatibility token is not validated by the broker.
omp-auth-broker token
omp-auth-broker token --regenerate
omp-auth-broker token --json
```

`serve` accepts `--bind=<host:port>`. Use a loopback bind address unless Tailscale or another gateway restricts reachability.

## Workspace commands

Install the Bun workspace dependencies, then use the root scripts:

```sh
bun install

# Run the public broker workspace
bun run dev -- --bind=127.0.0.1:8765

# Type-check both workspace configurations
bun run check

# Build the browser bundle into packages/ui/dist
bun run build-ui

# Compile the broker binary from packages/broker/src/main.ts
bun run build
```

## Nix build and run

```sh
nix build
./result/bin/omp-auth-broker serve --bind=127.0.0.1:8765
```

Nix derives the Bun dependency closure directly from `bun.lock` with `importNpmLock`; there is no manual aggregate dependency hash to calculate or update. This uses import-from-derivation (IFD), so the evaluator must allow IFD.

## NixOS module

Import the module from the flake and enable the service:

```nix
{
  inputs.omp-auth-broker.url = "github:mdarocha/omp-auth-broker";

  outputs = { nixpkgs, omp-auth-broker, ... }: {
    nixosConfigurations.example = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        omp-auth-broker.nixosModules.default
        ({ pkgs, ... }: {
          services.omp-auth-broker = {
            enable = true;
            package = omp-auth-broker.packages.${pkgs.stdenv.hostPlatform.system}.default;
            bind = "127.0.0.1:8765";
          };
        })
      ];
    };
  };
}
```

`package` normally defaults to this flake's package; set it when pinning or overriding the broker. `openFirewall` defaults to `false`, so enabling the module does not open a port. That does not add application authentication: the broker remains open to every client that can reach its bind address. Keep the default loopback bind, or use Tailscale or another reachability-restricting gateway.
