# CodexPro Cloud FAQ

## Is ChatGPT Pro being hosted in this container?

No. The container hosts a remote MCP server and a code workspace. You sign in to ChatGPT normally with your own account; ChatGPT connects to the MCP URL as a client.

## Does this share a ChatGPT subscription or model quota?

No. It does not proxy model requests, pool accounts, or bypass account limits. The available ChatGPT models and MCP actions are determined by the user's own account and current ChatGPT product surface.

## Why is no iVNC desktop included?

No browser login occurs inside the container. CodexPro is a headless HTTP MCP server, so X11, VNC, and a managed browser would add attack surface without serving the connection flow.

## Why are there three ports?

- `8787` is the complete CodexPro core service.
- `8788` is a strict reverse proxy that forwards only `/mcp`.
- `8789` is setup and local administration.

Only `8788` belongs behind the public Tunnel. The default Compose file publishes only `8789`, and only on host loopback.

The gateway and CodexPro both validate the same random MCP token. A request must pass the gateway check before CodexPro checks it again.

## Why does the ChatGPT URL contain a token?

Some ChatGPT connector forms cannot attach an arbitrary `Authorization` header. The query token is a single-user compatibility fallback. Clients that support headers should use a bearer token instead.

## Can one instance serve several users?

Not safely. One process shares one workspace, one authorization token, and one runtime policy. Use one isolated instance per user. A true multi-user service needs OAuth, per-tenant containers or stronger sandboxes, audit logs, quotas, and revocation.

## Can one instance contain several repositories?

Yes. Repositories can live in separate directories below `/workspace`. They share the same container, token, and permissions, so only combine repositories with the same owner and trust level.

## Does `develop` mode fully sandbox commands?

No. It enables upstream CodexPro's `safe` Bash policy, which blocks broad command patterns but can still run repository scripts. Those scripts are code. Use `readonly` or `edit` mode for untrusted repositories.

## What happens to the Cloudflare API token?

It is held in memory only during first-run provisioning. The container persists only the narrower Tunnel connector token. You can revoke the account API token after installation.

## How do I change the domain?

The current MVP does not mutate an installed Tunnel hostname from the admin page. Create a fresh instance for a new hostname, or update Tunnel ingress and DNS deliberately in Cloudflare while preserving the `8788` origin and `404` fallback.

## How do I reset everything?

Back up anything needed, then remove the data volume and recreate the container. This deletes the local connector credential but does not delete the Cloudflare Tunnel or DNS record; remove those in Cloudflare separately.
