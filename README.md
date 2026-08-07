# CodexPro Cloud

[中文](README_ZH.md) | English

Run one private CodexPro workspace on a Linux server and connect it to your own ChatGPT account over MCP. The Docker image includes a first-run wizard, a stable Cloudflare Tunnel, an MCP-only public gateway, persistent storage, and a local admin page.

This is not a model proxy, ChatGPT account pool, quota-sharing service, or hosted Codex replacement. ChatGPT is the MCP client. CodexPro Cloud is the MCP server that gives that client bounded access to one cloud workspace.

> Project status: single-user MVP. Use one container per user or trust boundary. Multi-user hosting requires OAuth and stronger tenant isolation.

## Architecture

```text
Your ChatGPT account
        |
        | HTTPS Streamable HTTP MCP
        v
Cloudflare named Tunnel
        |
        v
127.0.0.1:8788  MCP-only gateway  -> only /mcp
        |
        v
127.0.0.1:8787  CodexPro core      -> /mcp + local management routes
        |
        v
     /workspace
```

The public hostname terminates at port `8788`. It never points at the full CodexPro service on `8787`. The gateway validates the random MCP token before proxying, and CodexPro independently validates the same credential again.

| Port | Purpose | Public exposure |
| --- | --- | --- |
| `8787` | Full upstream CodexPro HTTP service | Never |
| `8788` | Gateway that accepts only `/mcp` | Through Cloudflare Tunnel |
| `8789` | First-run and admin UI | Host loopback only |

Cloudflare ingress always ends with `http_status:404`. There is no fallback to the core service.

## Requirements

- A Linux server with Docker Engine and Docker Compose v2
- A domain with an active Cloudflare DNS zone
- A Cloudflare API token with `Account / Cloudflare Tunnel / Edit`, `Zone / DNS / Edit`, and `Zone / Zone / Read`
- A ChatGPT surface that supports custom remote MCP apps

OpenAI's current remote MCP documentation is available at [MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).

## Deploy

```bash
git clone https://github.com/chenglu/codexpro-cloud.git
cd codexpro-cloud
cp docker-compose.example.yml docker-compose.yml
docker compose up -d
docker compose logs -f codexpro-cloud
```

The first startup prints two values:

```text
[codexpro-cloud] installation code: <random-code>
[codexpro-cloud] secure first-run setup: https://<random>.trycloudflare.com/setup
```

Open the temporary HTTPS link and enter:

1. The installation code from the log
2. A new local admin password
3. An unused hostname such as `mcp-workspace.example.com`
4. The Cloudflare API token
5. The workspace access mode

The wizard creates a named Tunnel, a proxied CNAME, the fixed `404` ingress fallback, and a random MCP token. It then closes the temporary Quick Tunnel and displays the complete ChatGPT Server URL.

The Cloudflare API token is never written to disk. Revoke it in Cloudflare after setup if it was created only for this installation.

## Connect ChatGPT

The wizard returns a URL shaped like:

```text
https://mcp-workspace.example.com/mcp?codexpro_token=<random-secret>
```

In ChatGPT, create a custom MCP app/plugin, paste the complete URL into **Server URL**, and select **No Authentication / None**. The query token is a compatibility mechanism for ChatGPT forms that cannot attach a custom bearer header. Do not share the URL.

For custom clients that support headers, use the clean endpoint and a bearer token:

```text
URL: https://mcp-workspace.example.com/mcp
Authorization: Bearer <token>
```

OAuth is the required next step before offering this as a shared multi-user service.

## Add A Repository

The default Compose file uses a persistent Docker volume for `/workspace`.

```bash
docker compose exec codexpro-cloud \
  git clone https://github.com/OWNER/REPOSITORY.git /workspace/REPOSITORY
```

Everything below `/workspace` is inside the allowed workspace boundary. CodexPro still blocks common secret, key, dependency, build, and Git-internal paths.

To use a host directory instead, replace the workspace volume in `docker-compose.yml`:

```yaml
volumes:
  - codexpro-data:/data
  - /srv/codexpro-workspace:/workspace
```

The mounted directory must be readable and writable by container UID/GID `10001:10001`.

## Access Modes

| Mode | File writes | Bash | Recommended use |
| --- | --- | --- | --- |
| Read only | Off | Off | Review and exploration |
| Edit | Workspace only | Off | Safer remote editing; default |
| Develop | Workspace only | CodexPro `safe` mode | Trusted repositories and verification |

`safe` Bash is not an OS sandbox. Repository package scripts can execute code. Keep Bash off for untrusted repositories.

## Local Admin

The admin page is published only on the server's loopback interface:

```text
http://127.0.0.1:8789/admin
```

From another machine, use SSH forwarding:

```bash
ssh -L 8789:127.0.0.1:8789 root@YOUR_SERVER
```

Then open `http://127.0.0.1:8789/admin` locally. The page can:

- show core, gateway, and public Tunnel status
- switch access modes
- rotate the MCP token and connection URL

Changing a mode or token restarts the internal CodexPro and MCP gateway processes. Tunnel and DNS configuration stay intact.

## Operations

Update:

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=100 codexpro-cloud
```

Back up both named volumes:

- `codexpro-data`: configuration, password hash, MCP token, and Tunnel connector token
- `codexpro-workspace`: source repositories and workspace files

Health:

```bash
docker inspect --format '{{.State.Health.Status}}' codexpro-cloud
docker compose logs --tail=200 codexpro-cloud
```

The health check validates the local setup page before installation and validates CodexPro plus the gateway path boundary after installation. It does not make public network calls by default.

## Security Defaults

- Runtime processes use non-root UID/GID `10001:10001`.
- The root filesystem is read-only; `/data`, `/workspace`, and `/tmp` are the only writable locations in the example Compose deployment.
- Linux capabilities are dropped and `no-new-privileges` is enabled.
- The Docker socket is never mounted.
- CPU, memory, and process limits are set in Compose.
- Public requests can reach only exact path `/mcp` with `POST`, `GET`, `DELETE`, or `OPTIONS`.
- The gateway validates the random bearer/query token before proxying, and CodexPro validates it again.
- Setup uses a random one-time code over a temporary HTTPS Quick Tunnel.
- The Cloudflare account API token is held only for the provisioning request.

Read [SECURITY.md](SECURITY.md) before putting important or private source code in the workspace.

## Development

```bash
npm ci
npm run build
npm run cloud:smoke
npm run smoke
docker build -t codexpro-cloud:dev .
```

`npm run cloud:smoke` verifies provisioning rollback, the fixed Cloudflare ingress, setup credential handling, local admin auth, token rotation, and the `/mcp`-only gateway.

## Upstream

CodexPro Cloud keeps the MCP implementation from [rebel0789/codexpro](https://github.com/rebel0789/codexpro) and adds the cloud packaging as a separate layer under `cloud/`, `Dockerfile`, Compose, tests, and deployment docs. The `upstream` Git remote tracks that repository.

See [docs/upstream-sync.md](docs/upstream-sync.md) for the merge policy. The original MIT copyright and license remain in [LICENSE](LICENSE).
