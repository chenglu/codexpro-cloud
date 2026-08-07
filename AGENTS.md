# CodexPro Cloud Agent Guide

This repository is a maintained cloud distribution of upstream CodexPro. Preserve the upstream core and keep cloud-specific behavior in the cloud layer.

## Non-Negotiable Network Boundary

| Port | Service | Rule |
| --- | --- | --- |
| `8787` | Full CodexPro HTTP server | Loopback only; never a public Tunnel origin |
| `8788` | MCP-only gateway | The only permanent Cloudflare Tunnel origin |
| `8789` | Setup/admin server | Host loopback only after first setup |

Permanent Tunnel configuration must be exactly equivalent to:

```json
{
  "ingress": [
    { "hostname": "<configured-hostname>", "service": "http://127.0.0.1:8788" },
    { "service": "http_status:404" }
  ]
}
```

Never add a fallback to `8787`, `8789`, another local port, or an external service. The gateway must continue to accept only exact path `/mcp` and methods `POST`, `GET`, `DELETE`, and `OPTIONS`.

## First Run

- Before configuration, the supervisor creates a random one-time installation code.
- An account-less Cloudflare Quick Tunnel exposes only the setup server over HTTPS.
- Successful setup creates one named Tunnel and one proxied DNS CNAME, writes the narrower connector token, removes the setup code, and closes the Quick Tunnel.
- The Cloudflare account API token must remain request-local. Never write it to config, a file, an environment file, logs, status output, test snapshots, or error reports.
- A failed provisioning transaction must remove DNS and Tunnel resources created by that transaction.

## Persistence And Secrets

- `/data/config/cloud.json`: non-secret desired state and revision
- `/data/secrets/admin-password.json`: salted password verifier
- `/data/secrets/mcp-token`: CodexPro HTTP credential
- `/data/secrets/cloudflare-tunnel-token`: connector credential
- `/workspace`: the only allowed source workspace root

Secret files use mode `0600`; secret directories use `0700`. Write configuration atomically and write `cloud.json` last during first setup because its presence marks the transaction committed.

## Runtime Modes

- `readonly` maps to writes off and Bash off.
- `edit` maps to workspace writes and Bash off.
- `develop` maps to workspace writes and upstream `safe` Bash.

Do not describe `safe` Bash, path guards, Docker, or the gateway as an OS sandbox.

## Upstream Sync

- `upstream` is `rebel0789/codexpro`.
- Prefer unchanged upstream files and cloud-only additions under `cloud/`.
- Do not resolve an upstream conflict by deleting cloud path tests or weakening the network boundary.
- After merging upstream, run the complete upstream and cloud verification suites.
- Record the upstream commit in the merge commit message or PR description.

See `docs/upstream-sync.md` for the command sequence and conflict policy.

## Required Verification

```bash
npm ci
npm run build
npm run cloud:smoke
npm run smoke
npm run stress
docker build -t codexpro-cloud:test .
```

For Tunnel or gateway changes, explicitly verify public `/`, `/setup`, `/healthz`, `/admin/profile`, `/mcp/`, and unknown paths return `404`, while authenticated `/mcp` still initializes a Streamable HTTP MCP session.
