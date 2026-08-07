# Cloudflare Domain Setup

CodexPro Cloud's first-run wizard creates the Tunnel and DNS record. No `wrangler` login or `cloudflared tunnel login` is required on the server.

## Before The Wizard

1. Add the apex domain to Cloudflare and wait until the zone is active.
2. Preserve any existing MX, SPF, DKIM, DMARC, or application records.
3. Choose an unused subdomain, for example `mcp-workspace.example.com`.
4. Create a scoped Cloudflare API token at <https://dash.cloudflare.com/profile/api-tokens>.

The token needs:

| Scope | Access |
| --- | --- |
| Account / Cloudflare Tunnel | Edit |
| Zone / DNS | Edit |
| Zone / Zone | Read |

Limit account and zone resources to the installation whenever possible.

## What The Wizard Creates

- one remotely managed named Cloudflare Tunnel
- one proxied CNAME pointing to `<tunnel-id>.cfargotunnel.com`
- one ingress hostname routed to `http://127.0.0.1:8788`
- one final catch-all ingress rule returning `404`
- one local connector token used by `cloudflared`

It does not create Cloudflare Access policies, Workers, Pages, WAF rules, or an admin hostname.

## Existing DNS Record

The wizard refuses to overwrite any existing record at the requested hostname. This prevents accidental takeover of another service. Remove the old record deliberately in Cloudflare or choose a new hostname, then submit again.

## Setup Failure

When an operation fails after creating a Tunnel, the wizard attempts to delete the DNS record and Tunnel created by that request. It never deletes resources that existed before the request.

Check the container log for the Cloudflare error:

```bash
docker compose logs --tail=200 codexpro-cloud
```

Common causes are missing account-level Tunnel permission, missing zone-level DNS permission, an inactive zone, an existing DNS record, or a duplicate custom Tunnel name.

## Manual Audit

After setup, verify in Cloudflare Zero Trust that the public hostname service is:

```text
http://127.0.0.1:8788
```

Verify the final ingress rule is:

```text
http_status:404
```

The service must not point to ports `8787` or `8789`.

## API Token Cleanup

The account API token is not persisted by CodexPro Cloud. Once setup succeeds, revoke it if it was created only for installation. Revoking that token does not stop the Tunnel because the running connector uses a separate, narrower connector token.
