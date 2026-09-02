# Getting started: self-hosting omp-auth-broker on NixOS over Tailscale

Goal: run `omp-auth-broker` on a NixOS host, expose it to your tailnet only, and point `omp` installs on other machines (laptop, CI runner) at it.

> 🛑 There is no application authentication on any route. Network reachability is the only gate: use loopback or Tailscale. Do not expose this service directly to a public network.

The broker always binds `127.0.0.1`. There is no bind-address option. Tailscale Serve is what makes it reachable from the tailnet — the broker's own port is never opened in the firewall.

Prerequisites:

- A NixOS host you can `nixos-rebuild switch` (flakes enabled).
- A Tailscale account where you are Owner, Admin, or Network admin (required to define a Tailscale Service).
- Tailscale v1.86+ on the host (Tailscale Services requirement).

Placeholders used throughout: `your-tailnet.ts.net` for your tailnet name, `auth-broker` for the Service name. The resulting MagicDNS name is `auth-broker.your-tailnet.ts.net`.

## 1. Add the flake input

In your NixOS configuration flake:

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.omp-auth-broker.url = "github:mdarocha/omp-auth-broker";

  outputs = { self, nixpkgs, omp-auth-broker, ... }: {
    nixosConfigurations.broker-host = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ./configuration.nix
        omp-auth-broker.nixosModules.default
      ];
    };
  };
}
```

## 2. Enable the broker

In `configuration.nix`:

```nix
{
  services.omp-auth-broker = {
    enable = true;
    dataDir = "/var/lib/omp-auth-broker";
    settings = {
      port = 8765;
      hostname = "auth-broker.your-tailnet.ts.net";
    };
  };
}
```

The module has exactly four options: `enable`, `package`, `dataDir`, `settings`. `package` defaults to this flake's own build (`omp-auth-broker.packages.<system>.default`) and only needs overriding if you build the broker yourself.

- `dataDir` sets `PI_CONFIG_DIR` for the service. The vault is oh-my-pi's own SQLite credential DB at `$PI_CONFIG_DIR/agent/agent.db`.
- `settings` is a freeform attrset rendered to the JSON file passed to `serve --settings`. Keys beyond `port` and `hostname` pass through untouched (e.g. `logJson = true;` for structured logs in the journal).
- `settings.hostname` is the only name accepted in the incoming HTTP `Host` header, besides loopback names. Anything else is rejected with HTTP 421. Set it to the Service's MagicDNS name now — requests proxied in by Tailscale Serve arrive with that `Host` header. This is DNS-rebinding protection, not authentication.
- The service runs as a hardened systemd `DynamicUser`, binds `127.0.0.1`, and never opens a firewall port. There is no `openFirewall` option here.

## 3. Install Tailscale on the host with a tag-based identity

The device advertising a Tailscale Service must use a tag-based identity, not a personal user login.

Put a pre-auth key in a root-only file on the host (or provision it with sops-nix/agenix), then:

```nix
{
  services.tailscale = {
    enable = true;
    openFirewall = true;
    authKeyFile = "/run/secrets/tailscale-authkey";
    extraUpFlags = [ "--advertise-tags=tag:auth-broker" ];
  };
}
```

`authKeyFile` lets the headless host join without an interactive `tailscale login`. `openFirewall` opens the UDP Tailscale port only — it does not expose port 8765.

Create the tag in the policy file (next step) before the host tries to claim it.

## 4. Write the tailnet policy file

In the admin console, edit the tailnet policy file. Add `tagOwners` so the tag can be assigned, and `grants` so only the devices you choose can reach the Service.

```json
{
    "tagOwners": {
        "tag:auth-broker": ["autogroup:admin"]
    },
    "grants": [
        {
            "src": ["autogroup:member"],
            "dst": ["svc:auth-broker"],
            "ip": ["tcp:443"]
        }
    ]
}
```

The destination selector for a Tailscale Service is `svc:<service-name>` — no `tag:` prefix.

`autogroup:member` allows every member of the tailnet. For a personal or family tailnet, narrow `src` to a group or to specific users instead:

```json
  "grants": [
    {
      "src": ["group:laptops", "ci@example.com"],
      "dst": ["svc:auth-broker"],
      "ip": ["tcp:443"],
    },
  ],
```

Optional: auto-approve the Service host so it does not sit pending after the first rebuild.

```json
  "autoApprovers": {
    "services": {
      "svc:auth-broker": ["tag:auth-broker"],
    },
  },
```

This is a judgment call. Omit it and an admin approves the Service host once, by hand, from the admin console's Services page after the first `nixos-rebuild switch`. Include it if you would rather not do that step for a home tailnet.

You may also define the Service explicitly on the Services page beforehand. If you don't, advertising it creates a pending Service automatically.

## 5. Advertise the broker as an HTTPS Tailscale Service

The broker is HTTP-only. Use Tailscale Serve's HTTPS proxy to terminate TLS at
the Service and forward plain HTTP over loopback. `services.tailscale.serve`'s
raw `tcp:<port>` mapping does not configure that HTTPS termination.

```nix
{ pkgs, ... }:
{
  systemd.services.omp-auth-broker-tailscale-serve = {
    after = [
      "tailscaled.service"
      "omp-auth-broker.service"
    ];
    requires = [
      "tailscaled.service"
      "omp-auth-broker.service"
    ];
    partOf = [ "tailscaled.service" ];
    wantedBy = [ "multi-user.target" ];

    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };

    script = ''
      ${pkgs.tailscale}/bin/tailscale serve \
        --service=svc:auth-broker \
        --https=443 \
        http://127.0.0.1:8765
    '';

    postStop = ''
      ${pkgs.tailscale}/bin/tailscale serve \
        --service=svc:auth-broker \
        --https=443 \
        off
    '';
  };
}
```

`--service` configures and advertises the named Service in background mode.
Tailscale provisions TLS for `https://auth-broker.your-tailnet.ts.net`; the
broker remains reachable only on `127.0.0.1:8765`.

## 6. Rebuild

```bash
sudo nixos-rebuild switch --flake .#broker-host
```

If you did not add `autoApprovers`, open the admin console's Services page and approve `svc:auth-broker` now.

## 7. Verify on the host

```bash
systemctl status omp-auth-broker
journalctl -u omp-auth-broker -n 50
```

Confirm the Host-header check is doing what you expect:

```bash
# accepted (loopback name)
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/

# accepted (configured hostname)
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Host: auth-broker.your-tailnet.ts.net' http://127.0.0.1:8765/

# rejected with 421
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Host: example.com' http://127.0.0.1:8765/
```

## 8. Verify from another tailnet device

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://auth-broker.your-tailnet.ts.net/
```

The Web UI and vault are at that same URL in a browser. Anyone who can reach it can use it — the grant in step 4 is the access control.

## 9. Point oh-my-pi at the broker

This is client-side configuration on your other machines, where the full `omp` agent runs. Precedence, highest to lowest:

1. `OMP_AUTH_BROKER_URL` and `OMP_AUTH_BROKER_TOKEN` environment variables.
2. `auth.broker.url` / `auth.broker.token` in `<agent-config-dir>/config.yml` (or `config.yaml`).
3. A plain token file at `<config-root>/auth-broker.token`.

This broker never validates the bearer token's contents. Any non-empty string works. The token only exists to satisfy oh-my-pi's own client-side check. If a URL is configured and no token is found anywhere in the chain, oh-my-pi refuses to start with an actionable error.

Environment variables, simplest for CI:

```bash
export OMP_AUTH_BROKER_URL="https://auth-broker.your-tailnet.ts.net:443"
export OMP_AUTH_BROKER_TOKEN="$(cat ~/.omp/auth-broker.token)"
```

Token file, simplest for a laptop — the broker never validates the token, so any non-empty random string works:

```bash
mkdir -p ~/.omp
openssl rand -hex 32 > ~/.omp/auth-broker.token
chmod 600 ~/.omp/auth-broker.token
```

If you have this repo's `omp-auth-broker` binary on hand, `omp-auth-broker token --regenerate` writes the same file for you (`--json` for machine-readable output). Neither approach requires installing this repo's package on every client — the broker host and the oh-my-pi clients are independent; the token file just needs to exist and be non-empty on each client.

`config.yml`, if you prefer it in config:

```yaml
auth:
    broker:
        url: "https://auth-broker.your-tailnet.ts.net:443"
        token: "!cat ~/.omp/auth-broker.token"
```

`!command` values are resolved by oh-my-pi, so this reads the token at startup. Leave `token` out of `config.yml` if you prefer the fallback token file instead.

## 10. Troubleshooting

**HTTP 421 from the Service URL.** `settings.hostname` does not match the `Host` header arriving through the Tailscale proxy. It must be exactly the Service's MagicDNS name, e.g. `auth-broker.your-tailnet.ts.net`. Fix it in `services.omp-auth-broker.settings.hostname` and rebuild.

**Connection refused / name does not resolve from another device.** The Service is probably still pending. Approve it on the admin console's Services page, or add the `autoApprovers` block from step 4.

**Host refuses to advertise the Service.** The advertising device needs a tag-based identity. Confirm `tag:auth-broker` is declared in `tagOwners` and that the host actually came up tagged — re-authenticate it with `extraUpFlags = [ "--advertise-tags=tag:auth-broker" ]` in place.

**Client can resolve the name but cannot connect.** Clients on Tailscale 1.94+ discover routes to Tailscale Services automatically. On 1.93 or earlier on Linux, run `sudo tailscale set --accept-routes`.

**Access denied from a device that should have access.** Check the `grants` entry: `dst` must be `svc:auth-broker`, `ip` must include `tcp:443`, and the device's user must match `src`.

**oh-my-pi refuses to start, complaining about a missing broker token.** A URL is configured but no token was found. Set `OMP_AUTH_BROKER_TOKEN` or create `<config-root>/auth-broker.token`. Any non-empty string satisfies it.
