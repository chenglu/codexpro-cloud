# Upstream Sync Policy

CodexPro Cloud tracks [rebel0789/codexpro](https://github.com/rebel0789/codexpro) as `upstream` while publishing cloud changes to `origin`.

## Check Status

```bash
git fetch --multiple --prune origin upstream
git rev-list --left-right --count main...upstream/main
git log --oneline main..upstream/main
```

Review upstream release notes, authentication changes, HTTP route changes, MCP SDK upgrades, new environment variables, and security advisories before merging.

## Merge

Use a normal merge commit so the imported upstream point remains visible:

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff upstream/main
```

Do not rebase published cloud history onto upstream.

## Current Import

The 2026-10-26 sync imports upstream `113472c` (CodexPro `0.30.3`). It includes handoff recovery and execution logging, workspace continuity, Windows lifecycle fixes, and sanitized HTTP diagnostics. Cloud deployment docs retain this distribution's Docker setup and port mapping. CI covers Node 20 and 24 on Linux and Windows, packed-package installation, and the Cloud runtime.

One core compatibility patch is carried in `src/importOps.ts`: an `EXDEV` fallback stages attachment overwrites beside the destination before an atomic rename. Docker keeps `/tmp` and `/workspace` on separate filesystems. Keep the cross-volume CI regression when merging future upstream changes, and remove the patch only once upstream handles this case. The MCP SDK and vulnerable HTTP dependencies have compatible security updates in our lockfile. Zod moves to the patched 4.x release, with an explicit string key schema for action arguments; the complete core and Cloud suites verify this compatibility change.

## Conflict Policy

The preferred ownership boundary is:

- Upstream-owned: `src/`, existing non-cloud CLI scripts, MCP protocol behavior, workspace guards, and core tests
- Cloud-owned: `cloud/`, `Dockerfile`, `.dockerignore`, `docker-compose.example.yml`, cloud workflows, cloud smoke tests, and cloud deployment/security docs
- Shared by necessity: `package.json`, README files, `SECURITY.md`, and `CHANGELOG.md`

When a core conflict grows repeatedly, move cloud behavior back into `cloud/` instead of maintaining a forked copy of an upstream module.

Never accept a merge resolution that changes the permanent Tunnel origin from `127.0.0.1:8788`, exposes the setup/admin service, removes the terminal `http_status:404` rule, persists a Cloudflare account API token, or weakens the exact `/mcp` gateway allowlist.

## Verify

```bash
npm ci
npm run build
npm run cloud:smoke
npm run smoke
npm run stress
docker build -t codexpro-cloud:upstream-check .
```

Inspect dependency advisories separately:

```bash
npm audit --audit-level=high
```

An audit failure is not permission to silently rewrite the lockfile. Confirm whether upstream has already fixed the dependency, update deliberately, and rerun all tests.
