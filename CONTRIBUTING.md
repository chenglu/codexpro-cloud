# Contributing

CodexPro Cloud keeps upstream CodexPro code and the cloud deployment layer deliberately separate. Changes should preserve that separation so upstream updates remain reviewable.

## Local Checks

```bash
npm ci
npm run build
npm run cloud:smoke
npm run smoke
docker build -t codexpro-cloud:dev .
```

## Ownership

- `src/`, existing CLI scripts, and upstream product docs originate in `rebel0789/codexpro`.
- `cloud/`, `Dockerfile`, `docker-compose.example.yml`, cloud tests, and cloud deployment docs belong to this project.
- Fix cloud-only behavior in the cloud layer whenever possible.
- Submit reusable CodexPro core fixes upstream first when practical.

## Security Checklist

- The public Tunnel still targets `http://127.0.0.1:8788`.
- The gateway still accepts only exact path `/mcp`.
- Cloudflare ingress still ends with `http_status:404`.
- No API token, connector token, MCP token, admin password, or private hostname appears in code or logs.
- Setup failure rolls back newly created Tunnel and DNS resources.
- Container runtime remains non-root and does not mount the Docker socket.
- New write or command capability has an explicit mode and test.

## Pull Requests

Keep changes scoped, explain their security impact, update both README languages for user-facing behavior, and include the exact verification commands run.

See [docs/upstream-sync.md](docs/upstream-sync.md) before merging from upstream.
