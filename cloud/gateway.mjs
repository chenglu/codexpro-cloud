#!/usr/bin/env node
import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const ALLOWED_METHODS = new Set(['POST', 'GET', 'DELETE', 'OPTIONS']);
const DEFAULT_MAX_BODY_BYTES = 20 * 1024 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function filteredRequestHeaders(headers, upstream) {
  const output = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) output[name] = value;
  }
  output.host = upstream.host;
  delete output['x-forwarded-host'];
  delete output['x-forwarded-proto'];
  return output;
}

function copyResponseHeaders(upstreamHeaders, response) {
  for (const [name, value] of Object.entries(upstreamHeaders)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) response.setHeader(name, value);
  }
  response.setHeader('cache-control', 'no-store');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
}

function reject(response, status, message) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff'
  });
  response.end(`${JSON.stringify({ error: message })}\n`);
}

function tokenMatches(candidate, expected) {
  if (typeof candidate !== 'string' || !candidate) return false;
  const actual = Buffer.from(candidate);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function clientAddress(request) {
  const cloudflareAddress = request.headers['cf-connecting-ip'];
  if (typeof cloudflareAddress === 'string' && cloudflareAddress.length <= 64) return cloudflareAddress;
  return request.socket.remoteAddress || 'local';
}

export function createGatewayServer({
  upstreamUrl = 'http://127.0.0.1:8787',
  authToken,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  logRequests = false
} = {}) {
  const upstream = new URL(upstreamUrl);
  if (upstream.protocol !== 'http:') throw new Error('Gateway upstream must use loopback HTTP.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(upstream.hostname)) {
    throw new Error('Gateway upstream must be a loopback address.');
  }
  const expectedToken = authToken ? Buffer.from(authToken) : null;
  if (expectedToken && expectedToken.length < 24) throw new Error('Gateway auth token must be at least 24 bytes.');
  const authFailures = new Map();

  const server = http.createServer((request, response) => {
    const startedAt = Date.now();
    const rawTarget = request.url || '/';
    const queryIndex = rawTarget.indexOf('?');
    const rawPath = queryIndex === -1 ? rawTarget : rawTarget.slice(0, queryIndex);
    if (rawPath !== '/mcp') {
      reject(response, 404, 'not_found');
      return;
    }
    if (!ALLOWED_METHODS.has(request.method || '')) {
      response.setHeader('allow', [...ALLOWED_METHODS].join(', '));
      reject(response, 405, 'method_not_allowed');
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(rawTarget, 'http://gateway.invalid');
    } catch {
      reject(response, 400, 'invalid_request_target');
      return;
    }
    if (expectedToken && request.method !== 'OPTIONS') {
      const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
      const queryToken = requestUrl.searchParams.get('codexpro_token') || requestUrl.searchParams.get('token');
      if (!tokenMatches(bearer, expectedToken) && !tokenMatches(queryToken, expectedToken)) {
        const key = clientAddress(request);
        const now = Date.now();
        const current = authFailures.get(key);
        if (!current || current.resetAt <= now) authFailures.set(key, { count: 1, resetAt: now + 60_000 });
        else current.count += 1;
        const failure = authFailures.get(key);
        if (authFailures.size > 4_096) {
          for (const [candidate, record] of authFailures) {
            if (record.resetAt <= now) authFailures.delete(candidate);
          }
        }
        if (failure.count > 20) {
          response.setHeader('retry-after', String(Math.max(1, Math.ceil((failure.resetAt - now) / 1000))));
          reject(response, 429, 'too_many_authentication_attempts');
        } else {
          reject(response, 401, 'unauthorized');
        }
        return;
      }
      authFailures.delete(clientAddress(request));
    }

    const declaredLength = Number(request.headers['content-length'] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
      reject(response, 413, 'payload_too_large');
      request.resume();
      return;
    }

    const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstream);
    let bodyBytes = 0;
    let bodyRejected = false;
    const proxyRequest = http.request(
      target,
      {
        method: request.method,
        headers: filteredRequestHeaders(request.headers, upstream)
      },
      (proxyResponse) => {
        copyResponseHeaders(proxyResponse.headers, response);
        response.writeHead(proxyResponse.statusCode || 502);
        proxyResponse.pipe(response);
      }
    );

    proxyRequest.on('error', (error) => {
      if (bodyRejected) return;
      if (!response.headersSent) reject(response, 502, 'upstream_unavailable');
      else response.destroy(error);
    });
    request.on('data', (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes <= maxBodyBytes || bodyRejected) return;
      bodyRejected = true;
      request.unpipe(proxyRequest);
      proxyRequest.destroy();
      if (!response.headersSent) reject(response, 413, 'payload_too_large');
    });
    request.on('aborted', () => proxyRequest.destroy());
    response.on('finish', () => {
      if (logRequests) {
        console.error(`[codexpro-cloud] gateway ${request.method} /mcp -> ${response.statusCode} ${Date.now() - startedAt}ms`);
      }
    });
    request.pipe(proxyRequest);
  });

  server.requestTimeout = 0;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  return server;
}

export function startGatewayFromEnvironment() {
  const host = process.env.CODEXPRO_GATEWAY_HOST || '127.0.0.1';
  const port = Number(process.env.CODEXPRO_GATEWAY_PORT || 8788);
  const server = createGatewayServer({
    upstreamUrl: process.env.CODEXPRO_UPSTREAM_URL || 'http://127.0.0.1:8787',
    authToken: process.env.CODEXPRO_GATEWAY_TOKEN,
    logRequests: process.env.CODEXPRO_CLOUD_LOG_REQUESTS === '1'
  });
  if (!process.env.CODEXPRO_GATEWAY_TOKEN) {
    throw new Error('CODEXPRO_GATEWAY_TOKEN is required when starting the public gateway.');
  }
  server.listen(port, host, () => {
    console.error(`[codexpro-cloud] MCP-only gateway listening on http://${host}:${port}/mcp`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startGatewayFromEnvironment();
}
