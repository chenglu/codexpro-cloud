#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { provisionCloudflare } from './cloudflare-api.mjs';
import {
  CLOUD_CONFIG_VERSION,
  RUNTIME_MODES,
  atomicWriteFile,
  atomicWriteJson,
  chatGptServerUrl,
  cloudPaths,
  ensureCloudDirectories,
  generateSecret,
  hashAdminPassword,
  publicMcpUrl,
  readAdminPasswordRecord,
  readCloudConfig,
  readTextSecret,
  secretMatches,
  verifyAdminPassword
} from './config.mjs';
import { dashboardPage, loginPage, setupPage } from './ui.mjs';

const MAX_BODY_BYTES = 64 * 1024;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPTS = 8;

function securityHeaders(response) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader(
    'content-security-policy',
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
}

function sendJson(response, status, value) {
  securityHeaders(response);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendHtml(response, status, html) {
  securityHeaders(response);
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}

function redirect(response, location) {
  securityHeaders(response);
  response.writeHead(303, { location });
  response.end();
}

async function readJsonBody(request) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw Object.assign(new Error('Request body must be JSON.'), { status: 415 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

function parseCookies(request) {
  const cookies = new Map();
  for (const part of String(request.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return cookies;
}

function requestKey(request) {
  return request.socket.remoteAddress || 'local';
}

function setupPayload(input) {
  const installationCode = typeof input.installationCode === 'string' ? input.installationCode.trim() : '';
  const adminPassword = typeof input.adminPassword === 'string' ? input.adminPassword : '';
  const adminPasswordConfirm = typeof input.adminPasswordConfirm === 'string' ? input.adminPasswordConfirm : '';
  const cloudflareApiToken = typeof input.cloudflareApiToken === 'string' ? input.cloudflareApiToken.trim() : '';
  const hostname = typeof input.hostname === 'string' ? input.hostname.trim() : '';
  const tunnelName = typeof input.tunnelName === 'string' ? input.tunnelName.trim() : '';
  const runtimeMode = typeof input.runtimeMode === 'string' ? input.runtimeMode : '';
  if (!installationCode) throw new Error('Installation code is required.');
  if (adminPassword.length < 12 || adminPassword.length > 256) {
    throw new Error('Admin password must be 12-256 characters.');
  }
  if (adminPassword !== adminPasswordConfirm) throw new Error('Admin password confirmation does not match.');
  if (!cloudflareApiToken) throw new Error('Cloudflare API token is required.');
  if (!Object.hasOwn(RUNTIME_MODES, runtimeMode)) throw new Error('Choose a valid workspace access mode.');
  return { installationCode, adminPassword, cloudflareApiToken, hostname, tunnelName, runtimeMode };
}

async function probe(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(4_000) });
    return response.status;
  } catch {
    return 0;
  }
}

export function createSetupServer({
  dataDir = process.env.CODEXPRO_DATA_DIR || '/data',
  apiBase = process.env.CODEXPRO_CLOUDFLARE_API_BASE,
  fetchImpl = fetch
} = {}) {
  const paths = cloudPaths(dataDir);
  const sessions = new Map();
  const loginFailures = new Map();
  let setupInProgress = false;

  function pruneSessions() {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
  }

  function adminSession(request) {
    pruneSessions();
    const token = parseCookies(request).get('codexpro_admin');
    return token ? sessions.get(token) || null : null;
  }

  function requireAdmin(request, response, { csrf = false } = {}) {
    const session = adminSession(request);
    if (!session) {
      sendJson(response, 401, { error: 'Authentication required.' });
      return null;
    }
    if (csrf && !secretMatches(String(request.headers['x-csrf-token'] || ''), session.csrfToken)) {
      sendJson(response, 403, { error: 'Invalid request token. Refresh the admin page and try again.' });
      return null;
    }
    return session;
  }

  function loginAllowed(request) {
    const key = requestKey(request);
    const now = Date.now();
    const current = loginFailures.get(key);
    if (!current || current.resetAt <= now) return true;
    return current.count < LOGIN_ATTEMPTS;
  }

  function recordLoginFailure(request) {
    const key = requestKey(request);
    const now = Date.now();
    const current = loginFailures.get(key);
    if (!current || current.resetAt <= now) loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    else current.count += 1;
  }

  async function handleSetup(request, response) {
    if (setupInProgress) {
      sendJson(response, 409, { error: 'Setup is already running. Wait for the current request to finish.' });
      return;
    }
    if (await readCloudConfig(paths)) {
      sendJson(response, 410, { error: 'First setup is already complete.' });
      return;
    }
    setupInProgress = true;
    let provisioned;
    let committed = false;
    try {
      const input = setupPayload(await readJsonBody(request));
      const expectedCode = await readTextSecret(paths.setupCodeFile);
      if (!secretMatches(input.installationCode, expectedCode)) {
        throw Object.assign(new Error('Invalid installation code.'), { status: 401 });
      }

      provisioned = await provisionCloudflare({
        apiToken: input.cloudflareApiToken,
        hostname: input.hostname,
        tunnelName: input.tunnelName,
        apiBase,
        fetchImpl
      });
      const mcpToken = generateSecret(32);
      const passwordRecord = await hashAdminPassword(input.adminPassword);
      const now = new Date().toISOString();
      const config = {
        version: CLOUD_CONFIG_VERSION,
        hostname: provisioned.hostname,
        tunnelId: provisioned.tunnelId,
        tunnelName: provisioned.tunnelName,
        accountId: provisioned.accountId,
        zoneId: provisioned.zoneId,
        dnsRecordId: provisioned.dnsRecordId,
        runtimeMode: input.runtimeMode,
        revision: generateSecret(8),
        createdAt: now,
        updatedAt: now
      };

      await ensureCloudDirectories(paths);
      await atomicWriteJson(paths.adminPasswordFile, passwordRecord);
      await atomicWriteFile(paths.mcpTokenFile, `${mcpToken}\n`);
      await atomicWriteFile(paths.tunnelTokenFile, `${provisioned.connectorToken}\n`);
      await atomicWriteJson(paths.configFile, config);
      committed = true;
      await fs.rm(paths.setupCodeFile, { force: true }).catch(() => {});

      sendJson(response, 201, {
        ok: true,
        hostname: config.hostname,
        publicUrl: publicMcpUrl(config.hostname),
        serverUrl: chatGptServerUrl(config.hostname, mcpToken),
        runtimeMode: config.runtimeMode
      });
    } catch (error) {
      if (provisioned && !committed) await provisioned.rollback().catch(() => {});
      if (!(await readCloudConfig(paths).catch(() => null))) {
        await Promise.all([
          fs.rm(paths.adminPasswordFile, { force: true }),
          fs.rm(paths.mcpTokenFile, { force: true }),
          fs.rm(paths.tunnelTokenFile, { force: true })
        ]).catch(() => {});
      }
      const status = Number(error?.status) || 400;
      sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setupInProgress = false;
    }
  }

  async function handleLogin(request, response) {
    if (!loginAllowed(request)) {
      response.setHeader('retry-after', String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
      sendJson(response, 429, { error: 'Too many failed attempts. Try again later.' });
      return;
    }
    const body = await readJsonBody(request);
    const password = typeof body.password === 'string' ? body.password : '';
    const record = await readAdminPasswordRecord(paths);
    if (!(await verifyAdminPassword(password, record))) {
      recordLoginFailure(request);
      sendJson(response, 401, { error: 'Incorrect admin password.' });
      return;
    }
    loginFailures.delete(requestKey(request));
    const token = randomBytes(32).toString('base64url');
    const session = {
      csrfToken: randomBytes(24).toString('base64url'),
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    sessions.set(token, session);
    response.setHeader(
      'set-cookie',
      `codexpro_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    );
    sendJson(response, 200, { ok: true });
  }

  async function handleStatus(request, response) {
    if (!requireAdmin(request, response)) return;
    const config = await readCloudConfig(paths);
    const token = await readTextSecret(paths.mcpTokenFile);
    const [coreStatus, gatewayStatus, publicStatus] = await Promise.all([
      probe('http://127.0.0.1:8787/healthz', { headers: { authorization: `Bearer ${token}` } }),
      probe('http://127.0.0.1:8788/not-public'),
      probe(publicMcpUrl(config.hostname), { headers: { authorization: `Bearer ${token}` } })
    ]);
    sendJson(response, 200, {
      hostname: config.hostname,
      tunnelName: config.tunnelName,
      runtimeMode: config.runtimeMode,
      publicUrl: publicMcpUrl(config.hostname),
      serverUrl: chatGptServerUrl(config.hostname, token),
      services: {
        codexpro: coreStatus === 200,
        gateway: gatewayStatus === 404,
        public: publicStatus > 0 && publicStatus < 500 && publicStatus !== 401 && publicStatus !== 403 && publicStatus !== 404
      }
    });
  }

  async function handleRuntimeUpdate(request, response) {
    if (!requireAdmin(request, response, { csrf: true })) return;
    const body = await readJsonBody(request);
    const runtimeMode = typeof body.runtimeMode === 'string' ? body.runtimeMode : '';
    if (!Object.hasOwn(RUNTIME_MODES, runtimeMode)) {
      sendJson(response, 400, { error: 'Choose a valid workspace access mode.' });
      return;
    }
    const config = await readCloudConfig(paths);
    const next = {
      ...config,
      runtimeMode,
      revision: generateSecret(8),
      updatedAt: new Date().toISOString()
    };
    await atomicWriteJson(paths.configFile, next);
    sendJson(response, 200, { ok: true, runtimeMode });
  }

  async function handleTokenRotation(request, response) {
    if (!requireAdmin(request, response, { csrf: true })) return;
    const config = await readCloudConfig(paths);
    const token = generateSecret(32);
    await atomicWriteFile(paths.mcpTokenFile, `${token}\n`);
    await atomicWriteJson(paths.configFile, {
      ...config,
      revision: generateSecret(8),
      updatedAt: new Date().toISOString()
    });
    sendJson(response, 200, { ok: true, serverUrl: chatGptServerUrl(config.hostname, token) });
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://control.invalid');
      const method = request.method || 'GET';
      const config = await readCloudConfig(paths);

      if (method === 'GET' && url.pathname === '/') {
        redirect(response, config ? '/admin' : '/setup');
        return;
      }
      if (method === 'GET' && url.pathname === '/setup') {
        if (config) redirect(response, '/admin');
        else sendHtml(response, 200, setupPage());
        return;
      }
      if (method === 'POST' && url.pathname === '/api/setup') {
        await handleSetup(request, response);
        return;
      }
      if (method === 'GET' && url.pathname === '/admin') {
        if (!config) {
          redirect(response, '/setup');
          return;
        }
        const session = adminSession(request);
        sendHtml(response, 200, session ? dashboardPage(session.csrfToken) : loginPage());
        return;
      }
      if (method === 'POST' && url.pathname === '/api/login') {
        if (!config) {
          sendJson(response, 409, { error: 'Complete first setup before signing in.' });
          return;
        }
        await handleLogin(request, response);
        return;
      }
      if (method === 'POST' && url.pathname === '/api/logout') {
        const session = requireAdmin(request, response, { csrf: true });
        if (!session) return;
        const token = parseCookies(request).get('codexpro_admin');
        if (token) sessions.delete(token);
        response.setHeader('set-cookie', 'codexpro_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        sendJson(response, 200, { ok: true });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/status') {
        await handleStatus(request, response);
        return;
      }
      if (method === 'POST' && url.pathname === '/api/runtime') {
        await handleRuntimeUpdate(request, response);
        return;
      }
      if (method === 'POST' && url.pathname === '/api/token/rotate') {
        await handleTokenRotation(request, response);
        return;
      }
      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      console.error(`[codexpro-cloud] control request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!response.headersSent) sendJson(response, Number(error?.status) || 500, { error: 'Request failed.' });
      else response.destroy();
    }
  });
  server.requestTimeout = 35_000;
  server.headersTimeout = 15_000;
  return server;
}

export async function startSetupServerFromEnvironment() {
  const paths = cloudPaths();
  await ensureCloudDirectories(paths);
  const server = createSetupServer();
  const host = process.env.CODEXPRO_CONTROL_HOST || '127.0.0.1';
  const port = Number(process.env.CODEXPRO_CONTROL_PORT || 8789);
  server.listen(port, host, () => {
    console.error(`[codexpro-cloud] local control server listening on http://${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSetupServerFromEnvironment().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
