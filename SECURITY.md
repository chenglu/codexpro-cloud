# Security Policy

CodexPro Cloud exposes tools that can read and optionally modify source code. Treat each instance as a privileged developer workstation, not as a generic shared web app.

## Supported Version

Security fixes target the latest `main` image and the immutable commit-SHA image built from the same revision.

## Reporting

Use GitHub private vulnerability reporting for `chenglu/codexpro-cloud` when available. Do not put MCP URLs, Cloudflare tokens, private repository contents, or server credentials in a public issue.

Upstream CodexPro core vulnerabilities should also be reported to [rebel0789/codexpro](https://github.com/rebel0789/codexpro/security).

## Trust Boundary

| Surface | Bind/route | Rule |
| --- | --- | --- |
| CodexPro core | `127.0.0.1:8787` | Full service; never route publicly |
| MCP gateway | `127.0.0.1:8788` | Exact `/mcp` path only |
| Setup/admin | `0.0.0.0:8789` inside the container, host `127.0.0.1:8789` | Quick Tunnel only before setup; local/SSH access afterward |
| Cloudflare fallback | `http_status:404` | Must never point to another origin |

The public Cloudflare hostname must route to `http://127.0.0.1:8788`. Routing it to `8787` exposes `/`, `/setup`, `/healthz`, and `/admin/profile` from upstream CodexPro. Routing it to `8789` exposes the control plane.

## Stored Secrets

All persistent secrets live under `/data/secrets` with mode `0600`:

- `mcp-token`: authenticates the public MCP endpoint
- `cloudflare-tunnel-token`: narrow connector credential used by `cloudflared`
- `admin-password.json`: salted `scrypt` password verifier, not the plaintext password
- `setup-code`: one-time bootstrap secret; deleted after successful setup

The Cloudflare account API token submitted to the wizard is used only in memory to create the Tunnel, ingress, and DNS record. It is not logged or persisted. Revoke it after setup when practical.

Backups of `codexpro-data` contain live credentials and must be encrypted and access-controlled.

## Public Authentication

The gateway validates a random 32-byte token before it proxies a request. CodexPro then independently validates the same forwarded credential. Both processes receive the same secret, so the gateway does not replace or disable the core authentication check.

Clients should prefer:

```text
Authorization: Bearer <token>
```

ChatGPT connector forms may require a URL token:

```text
https://hostname/mcp?codexpro_token=<token>
```

Query tokens can appear in browser history, screenshots, copied logs, and intermediary request metadata. The setup/admin pages send `no-store` and `no-referrer` headers, but the URL must still be treated as a password. Rotate it from the local admin page after suspected disclosure.

This token design is for one user and one instance. A shared or multi-user service needs OAuth, per-user authorization, revocation, and tenant-aware audit logs.

## Runtime Modes

- `readonly`: no generic writes and no Bash
- `edit`: workspace writes, no Bash
- `develop`: workspace writes and CodexPro `safe` Bash

CodexPro path guards reduce accidental access outside `/workspace`, but CodexPro is not an OS sandbox. `safe` Bash can run package scripts, and package scripts can execute arbitrary repository code. Never use `develop` mode for an untrusted repository without an additional sandbox.

## Attachment Import

In `edit` and `develop` modes, `import_file` accepts a client-supplied attachment object containing `download_url` and `file_id`. The core checks HTTPS host allowlists, redirect targets and resolved addresses, enforces a streaming size limit (5,000,000 bytes by default), and supports expected SHA-256 verification. Overwrite is disabled by default. `readonly` mode does not advertise this tool.

## Container Controls

The example Compose deployment:

- runs application processes as UID/GID `10001:10001`
- uses a read-only root filesystem
- drops every Linux capability
- enables `no-new-privileges`
- limits memory, CPU, and process count
- mounts no Docker socket or host credential directory
- keeps the admin port on host loopback

These controls limit blast radius but do not create a hardened multi-tenant sandbox. Do not place mutually untrusted users in one container or workspace.

## MCP Risk

Remote MCP tools can read data and take actions on behalf of a model. Connect only a ChatGPT account you trust, review requested tool calls, and keep the narrowest usable runtime mode. OpenAI documents remote MCP approval, prompt-injection, and data-sharing risks in [MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#risks-and-safety).

CodexPro Cloud does not bypass ChatGPT limits, share a ChatGPT subscription, proxy model APIs, or log into ChatGPT on behalf of a user.

## Release Rules

- Build from a reviewed Git commit and lockfile.
- Publish immutable SHA tags in addition to `latest`.
- Run `npm run build`, `npm run cloud:smoke`, and upstream `npm run smoke`.
- Review `npm audit` output; do not silently describe known high-severity advisories as resolved.
- Pin the `cloudflared` image version in `Dockerfile`.
- Never put real tokens or production hostnames in tests, examples, image layers, Actions logs, or repository history.
