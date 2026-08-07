import { randomBytes } from 'node:crypto';
import { domainToASCII } from 'node:url';

const DEFAULT_API_BASE = 'https://api.cloudflare.com/client/v4/';
const GATEWAY_ORIGIN = 'http://127.0.0.1:8788';

function cleanApiBase(value) {
  const url = new URL(value || DEFAULT_API_BASE);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback && !process.env.CODEXPRO_CLOUDFLARE_ALLOW_HTTP_API) {
    throw new Error('Cloudflare API base URL must use HTTPS.');
  }
  return url.toString().endsWith('/') ? url : new URL(`${url.toString()}/`);
}

export function normalizeHostname(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || raw.includes('://') || /[/?#:@*\s]/.test(raw)) {
    throw new Error('Enter a hostname only, for example mcp.example.com.');
  }
  const hostname = domainToASCII(raw);
  const labels = hostname.split('.');
  if (
    !hostname ||
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  ) {
    throw new Error('Enter a valid public hostname, for example mcp.example.com.');
  }
  return hostname;
}

export function normalizeTunnelName(input, hostname) {
  const raw = String(input || '').trim();
  if (raw) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(raw)) {
      throw new Error('Tunnel name must be 1-100 letters, numbers, dots, underscores, or dashes.');
    }
    return raw;
  }
  const prefix = hostname.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'workspace';
  return `codexpro-${prefix}-${randomBytes(4).toString('hex')}`;
}

export function zoneCandidates(hostname) {
  const labels = normalizeHostname(hostname).split('.');
  const candidates = [];
  for (let index = 0; index < labels.length - 1; index += 1) {
    candidates.push(labels.slice(index).join('.'));
  }
  return candidates;
}

function cloudflareDetails(envelope) {
  const messages = [...(envelope?.errors || []), ...(envelope?.messages || [])]
    .map((entry) => {
      if (entry?.code && entry?.message) return `${entry.code}: ${entry.message}`;
      return entry?.message || entry?.code || '';
    })
    .filter(Boolean);
  return messages.join('; ');
}

export class CloudflareApi {
  constructor({ apiToken, apiBase = process.env.CODEXPRO_CLOUDFLARE_API_BASE || DEFAULT_API_BASE, fetchImpl = fetch }) {
    this.apiToken = String(apiToken || '').trim();
    if (!this.apiToken) throw new Error('Cloudflare API token is required.');
    this.apiBase = cleanApiBase(apiBase);
    this.fetchImpl = fetchImpl;
  }

  async request(method, route, { query, body, action = 'Cloudflare request' } = {}) {
    const url = new URL(route.replace(/^\//, ''), this.apiBase);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
      });
    } catch (error) {
      throw new Error(`${action} failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw new Error(`${action} returned an invalid response (HTTP ${response.status}).`);
    }
    if (!response.ok || envelope?.success !== true) {
      const details = cloudflareDetails(envelope);
      throw new Error(`${action} was rejected by Cloudflare (HTTP ${response.status})${details ? `: ${details}` : '.'}`);
    }
    return envelope.result;
  }

  async findZone(hostname) {
    for (const candidate of zoneCandidates(hostname)) {
      const zones = await this.request('GET', 'zones', {
        query: { name: candidate, status: 'active', per_page: 5 },
        action: 'Find the Cloudflare DNS zone'
      });
      const zone = Array.isArray(zones)
        ? zones.find((item) => String(item?.name).toLowerCase() === candidate.toLowerCase())
        : null;
      if (zone?.id && zone?.account?.id) return zone;
    }
    throw new Error(`No active Cloudflare DNS zone accessible to this token contains ${hostname}.`);
  }

  async ensureDnsNameAvailable(zoneId, hostname) {
    const records = await this.request('GET', `zones/${encodeURIComponent(zoneId)}/dns_records`, {
      query: { 'name.exact': hostname, per_page: 100 },
      action: 'Check the requested DNS hostname'
    });
    if (Array.isArray(records) && records.length) {
      const record = records[0];
      throw new Error(
        `${hostname} already has a ${record.type || 'DNS'} record. Remove it in Cloudflare or choose another hostname.`
      );
    }
  }

  createTunnel(accountId, tunnelName) {
    return this.request('POST', `accounts/${encodeURIComponent(accountId)}/cfd_tunnel`, {
      body: { name: tunnelName, config_src: 'cloudflare' },
      action: 'Create the Cloudflare Tunnel'
    });
  }

  configureTunnel(accountId, tunnelId, hostname) {
    return this.request(
      'PUT',
      `accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}/configurations`,
      {
        body: {
          config: {
            ingress: [
              { hostname, service: GATEWAY_ORIGIN },
              { service: 'http_status:404' }
            ]
          }
        },
        action: 'Configure the Cloudflare Tunnel ingress'
      }
    );
  }

  createDnsRecord(zoneId, hostname, tunnelId) {
    return this.request('POST', `zones/${encodeURIComponent(zoneId)}/dns_records`, {
      body: {
        type: 'CNAME',
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
        ttl: 1,
        comment: 'Managed by codexpro-cloud'
      },
      action: 'Create the Cloudflare DNS record'
    });
  }

  getTunnelToken(accountId, tunnelId) {
    return this.request(
      'GET',
      `accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}/token`,
      { action: 'Get the Cloudflare Tunnel connector token' }
    );
  }

  deleteDnsRecord(zoneId, recordId) {
    return this.request('DELETE', `zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`, {
      action: 'Roll back the Cloudflare DNS record'
    });
  }

  deleteTunnel(accountId, tunnelId) {
    return this.request('DELETE', `accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}`, {
      action: 'Roll back the Cloudflare Tunnel'
    });
  }
}

export async function provisionCloudflare({ apiToken, hostname: inputHostname, tunnelName: inputTunnelName, apiBase, fetchImpl }) {
  const hostname = normalizeHostname(inputHostname);
  const tunnelName = normalizeTunnelName(inputTunnelName, hostname);
  const api = new CloudflareApi({ apiToken, apiBase, fetchImpl });
  const zone = await api.findZone(hostname);
  await api.ensureDnsNameAvailable(zone.id, hostname);

  const accountId = zone.account.id;
  const tunnel = await api.createTunnel(accountId, tunnelName);
  if (!tunnel?.id) throw new Error('Cloudflare created a Tunnel without returning its ID.');

  let dnsRecord = null;
  try {
    await api.configureTunnel(accountId, tunnel.id, hostname);
    dnsRecord = await api.createDnsRecord(zone.id, hostname, tunnel.id);
    if (!dnsRecord?.id) throw new Error('Cloudflare created DNS without returning the record ID.');
    const connectorToken = await api.getTunnelToken(accountId, tunnel.id);
    if (typeof connectorToken !== 'string' || !connectorToken.trim()) {
      throw new Error('Cloudflare returned an empty Tunnel connector token.');
    }
    return {
      hostname,
      tunnelId: tunnel.id,
      tunnelName: tunnel.name || tunnelName,
      accountId,
      zoneId: zone.id,
      dnsRecordId: dnsRecord.id,
      connectorToken: connectorToken.trim(),
      async rollback() {
        await api.deleteDnsRecord(zone.id, dnsRecord.id).catch(() => {});
        await api.deleteTunnel(accountId, tunnel.id).catch(() => {});
      }
    };
  } catch (error) {
    if (dnsRecord?.id) await api.deleteDnsRecord(zone.id, dnsRecord.id).catch(() => {});
    await api.deleteTunnel(accountId, tunnel.id).catch(() => {});
    throw error;
  }
}

export const CLOUDFLARE_GATEWAY_ORIGIN = GATEWAY_ORIGIN;
