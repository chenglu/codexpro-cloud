import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  chatGptServerUrl,
  atomicWriteFile,
  atomicWriteJson,
  CLOUD_CONFIG_VERSION,
  cloudPaths,
  ensureCloudDirectories,
  ensureSetupCode,
  hashAdminPassword,
  readCloudConfig,
  readTextSecret,
  verifyAdminPassword
} from '../cloud/config.mjs';
import { CLOUDFLARE_GATEWAY_ORIGIN, provisionCloudflare } from '../cloud/cloudflare-api.mjs';
import { createGatewayServer } from '../cloud/gateway.mjs';
import { createSetupServer } from '../cloud/setup-server.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function rawHttpStatus(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: requestPath }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
  });
}

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}

function cloudflareEnvelope(response, result, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ success: status >= 200 && status < 300, result, errors: [], messages: [] }));
}

async function createCloudflareMock({ failAtToken = false } = {}) {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://cloudflare.test');
    const body = await jsonBody(request);
    calls.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      authorization: request.headers.authorization
    });

    if (request.method === 'GET' && url.pathname === '/client/v4/zones') {
      const result = url.searchParams.get('name') === 'example.test'
        ? [{ id: 'zone-id', name: 'example.test', account: { id: 'account-id' } }]
        : [];
      cloudflareEnvelope(response, result);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/client/v4/zones/zone-id/dns_records') {
      cloudflareEnvelope(response, []);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/client/v4/accounts/account-id/cfd_tunnel') {
      cloudflareEnvelope(response, { id: 'tunnel-id', name: body.name }, 201);
      return;
    }
    if (request.method === 'PUT' && url.pathname === '/client/v4/accounts/account-id/cfd_tunnel/tunnel-id/configurations') {
      cloudflareEnvelope(response, { source: 'cloudflare' });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/client/v4/zones/zone-id/dns_records') {
      cloudflareEnvelope(response, { id: 'dns-id', name: body.name, type: body.type }, 201);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/client/v4/accounts/account-id/cfd_tunnel/tunnel-id/token') {
      if (failAtToken) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ success: false, result: null, errors: [{ code: 1000, message: 'test failure' }] }));
      } else {
        cloudflareEnvelope(response, 'connector-token-for-tests');
      }
      return;
    }
    if (
      request.method === 'DELETE' &&
      (url.pathname === '/client/v4/zones/zone-id/dns_records/dns-id' ||
        url.pathname === '/client/v4/accounts/account-id/cfd_tunnel/tunnel-id')
    ) {
      cloudflareEnvelope(response, null);
      return;
    }
    cloudflareEnvelope(response, null, 404);
  });
  const port = await listen(server);
  return { server, calls, apiBase: `http://127.0.0.1:${port}/client/v4/` };
}

async function configSmoke() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cloud-config-'));
  const paths = cloudPaths(root);
  await ensureCloudDirectories(paths);
  const firstCode = await ensureSetupCode(paths);
  const secondCode = await ensureSetupCode(paths);
  assert.equal(firstCode, secondCode);
  assert.match(firstCode, /^[a-f0-9]{48}$/);

  const passwordRecord = await hashAdminPassword('a-correct-test-password');
  assert.equal(await verifyAdminPassword('a-correct-test-password', passwordRecord), true);
  assert.equal(await verifyAdminPassword('incorrect-password', passwordRecord), false);
  assert.equal(
    chatGptServerUrl('mcp.example.test', 'secret token'),
    'https://mcp.example.test/mcp?codexpro_token=secret+token'
  );
  await fs.rm(root, { recursive: true, force: true });
}

async function cloudflareSmoke() {
  const mock = await createCloudflareMock();
  try {
    const result = await provisionCloudflare({
      apiToken: 'cloudflare-api-token-for-tests',
      hostname: 'MCP.Example.Test',
      tunnelName: 'codexpro-test',
      apiBase: mock.apiBase
    });
    assert.equal(result.hostname, 'mcp.example.test');
    assert.equal(result.tunnelId, 'tunnel-id');
    assert.equal(result.connectorToken, 'connector-token-for-tests');
    assert(mock.calls.every((call) => call.authorization === 'Bearer cloudflare-api-token-for-tests'));
    const configuration = mock.calls.find((call) => call.method === 'PUT');
    assert.deepEqual(configuration.body.config.ingress, [
      { hostname: 'mcp.example.test', service: CLOUDFLARE_GATEWAY_ORIGIN },
      { service: 'http_status:404' }
    ]);
    const dns = mock.calls.find((call) => call.method === 'POST' && call.path.endsWith('/dns_records'));
    assert.equal(dns.body.content, 'tunnel-id.cfargotunnel.com');
    assert.equal(dns.body.comment, 'Managed by codexpro-cloud');
  } finally {
    await close(mock.server);
  }

  const failed = await createCloudflareMock({ failAtToken: true });
  try {
    await assert.rejects(
      provisionCloudflare({
        apiToken: 'rollback-token-for-tests',
        hostname: 'mcp.example.test',
        tunnelName: 'codexpro-rollback',
        apiBase: failed.apiBase
      }),
      /test failure/
    );
    assert(failed.calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/dns-id')));
    assert(failed.calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/tunnel-id')));
  } finally {
    await close(failed.server);
  }
}

async function gatewaySmoke() {
  const gatewayToken = 'gateway-auth-token-1234567890abcdef';
  const upstreamCalls = [];
  const upstream = http.createServer(async (request, response) => {
    const body = await jsonBody(request);
    upstreamCalls.push({ url: request.url, method: request.method, authorization: request.headers.authorization, body });
    response.writeHead(202, { 'content-type': 'application/json', 'mcp-session-id': 'session-from-upstream' });
    response.end(JSON.stringify({ ok: true, body }));
  });
  const upstreamPort = await listen(upstream);
  const gateway = createGatewayServer({
    upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
    authToken: gatewayToken,
    maxBodyBytes: 1_024
  });
  const gatewayPort = await listen(gateway);
  try {
    for (const pathname of ['/', '/setup', '/healthz', '/admin/profile', '/mcp/']) {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}${pathname}`);
      assert.equal(response.status, 404, `${pathname} must not be public`);
    }
    assert.equal(await rawHttpStatus(gatewayPort, '/not-public/../mcp'), 404);
    assert.equal(upstreamCalls.length, 0);

    const unauthorized = await fetch(`http://127.0.0.1:${gatewayPort}/mcp`, { method: 'POST' });
    assert.equal(unauthorized.status, 401);
    assert.equal(upstreamCalls.length, 0);

    const response = await fetch(`http://127.0.0.1:${gatewayPort}/mcp?codexpro_token=${gatewayToken}`, {
      method: 'POST',
      headers: { authorization: 'Bearer header-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize' })
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('mcp-session-id'), 'session-from-upstream');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(upstreamCalls[0], {
      url: `/mcp?codexpro_token=${gatewayToken}`,
      method: 'POST',
      authorization: 'Bearer header-secret',
      body: { jsonrpc: '2.0', method: 'initialize' }
    });

    const rejected = await fetch(`http://127.0.0.1:${gatewayPort}/mcp`, { method: 'PUT' });
    assert.equal(rejected.status, 405);
    assert.equal(upstreamCalls.length, 1);

    const oversized = await fetch(`http://127.0.0.1:${gatewayPort}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${gatewayToken}` },
      body: 'x'.repeat(1_025)
    });
    assert.equal(oversized.status, 413);
    assert.equal(upstreamCalls.length, 1);
  } finally {
    await close(gateway);
    await close(upstream);
  }
}

async function setupServerSmoke() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cloud-setup-'));
  const paths = cloudPaths(root);
  await ensureCloudDirectories(paths);
  const installationCode = await ensureSetupCode(paths);
  const mock = await createCloudflareMock();
  const control = createSetupServer({ dataDir: root, apiBase: mock.apiBase });
  const port = await listen(control);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(`${baseUrl}/setup`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.doesNotMatch(await page.text(), new RegExp(installationCode));

    const wrongCode = await fetch(`${baseUrl}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installationCode: 'wrong-code',
        adminPassword: 'a-correct-admin-password',
        adminPasswordConfirm: 'a-correct-admin-password',
        cloudflareApiToken: 'cloudflare-setup-api-token',
        hostname: 'mcp.example.test',
        tunnelName: 'codexpro-setup-test',
        runtimeMode: 'edit'
      })
    });
    assert.equal(wrongCode.status, 401);
    assert.equal(mock.calls.length, 0);

    const mismatchedPassword = await fetch(`${baseUrl}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installationCode,
        adminPassword: 'a-correct-admin-password',
        adminPasswordConfirm: 'a-different-admin-password',
        cloudflareApiToken: 'cloudflare-setup-api-token',
        hostname: 'mcp.example.test',
        tunnelName: 'codexpro-setup-test',
        runtimeMode: 'edit'
      })
    });
    assert.equal(mismatchedPassword.status, 400);
    assert.equal(mock.calls.length, 0);

    const setup = await fetch(`${baseUrl}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installationCode,
        adminPassword: 'a-correct-admin-password',
        adminPasswordConfirm: 'a-correct-admin-password',
        cloudflareApiToken: 'cloudflare-setup-api-token',
        hostname: 'mcp.example.test',
        tunnelName: 'codexpro-setup-test',
        runtimeMode: 'edit'
      })
    });
    assert.equal(setup.status, 201);
    const setupResult = await setup.json();
    assert.match(setupResult.serverUrl, /^https:\/\/mcp\.example\.test\/mcp\?codexpro_token=/);
    assert.equal((await readCloudConfig(paths)).runtimeMode, 'edit');
    await assert.rejects(fs.access(paths.setupCodeFile));
    assert.equal(await readTextSecret(paths.tunnelTokenFile), 'connector-token-for-tests');

    const diskContents = await Promise.all([
      fs.readFile(paths.configFile, 'utf8'),
      fs.readFile(paths.adminPasswordFile, 'utf8'),
      fs.readFile(paths.mcpTokenFile, 'utf8'),
      fs.readFile(paths.tunnelTokenFile, 'utf8')
    ]);
    assert(diskContents.every((contents) => !contents.includes('cloudflare-setup-api-token')));

    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'a-correct-admin-password' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const dashboard = await fetch(`${baseUrl}/admin`, { headers: { cookie } });
    const dashboardHtml = await dashboard.text();
    const csrfToken = dashboardHtml.match(/var csrfToken = "([^"]+)";/)?.[1];
    assert(csrfToken);

    const update = await fetch(`${baseUrl}/api/runtime`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ runtimeMode: 'readonly' })
    });
    assert.equal(update.status, 200);
    assert.equal((await readCloudConfig(paths)).runtimeMode, 'readonly');

    const oldToken = await readTextSecret(paths.mcpTokenFile);
    const rotate = await fetch(`${baseUrl}/api/token/rotate`, {
      method: 'POST',
      headers: { cookie, 'x-csrf-token': csrfToken }
    });
    assert.equal(rotate.status, 200);
    assert.notEqual(await readTextSecret(paths.mcpTokenFile), oldToken);
  } finally {
    await close(control);
    await close(mock.server);
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function waitForResponse(url, options, accepted, timeoutMs = 15_000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, options);
      if (accepted.includes(response.status)) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function supervisorSmoke() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cloud-supervisor-'));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cloud-workspace-'));
  const paths = cloudPaths(root);
  await ensureCloudDirectories(paths);
  const token = 'supervisor-mcp-token-1234567890abcdef';
  const now = new Date().toISOString();
  await atomicWriteFile(paths.mcpTokenFile, `${token}\n`);
  await atomicWriteFile(paths.tunnelTokenFile, 'disabled-tunnel-token\n');
  await atomicWriteJson(paths.adminPasswordFile, await hashAdminPassword('supervisor-admin-password'));
  await atomicWriteJson(paths.configFile, {
    version: CLOUD_CONFIG_VERSION,
    hostname: 'mcp.example.test',
    tunnelId: 'supervisor-tunnel-id',
    tunnelName: 'supervisor-tunnel',
    accountId: 'supervisor-account',
    zoneId: 'supervisor-zone',
    dnsRecordId: 'supervisor-dns',
    runtimeMode: 'edit',
    revision: 'supervisor-revision',
    createdAt: now,
    updatedAt: now
  });
  const reserved = http.createServer();
  const controlPort = await listen(reserved);
  await close(reserved);

  const child = spawn(process.execPath, ['cloud/supervisor.mjs'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      CODEXPRO_DATA_DIR: root,
      CODEXPRO_WORKSPACE_DIR: workspace,
      CODEXPRO_CONTROL_HOST: '127.0.0.1',
      CODEXPRO_CONTROL_PORT: String(controlPort),
      CODEXPRO_CLOUD_DISABLE_QUICK_TUNNEL: '1',
      CODEXPRO_CLOUD_DISABLE_NAMED_TUNNEL: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += String(chunk); });
  child.stderr.on('data', (chunk) => { logs += String(chunk); });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    await waitForResponse(
      'http://127.0.0.1:8787/healthz',
      { headers: { authorization: `Bearer ${token}` } },
      [200]
    );
    const blocked = await waitForResponse('http://127.0.0.1:8788/admin/profile', {}, [404]);
    assert.equal(blocked.status, 404);
    const initialize = await fetch(`http://127.0.0.1:8788/mcp?codexpro_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'codexpro-cloud-smoke', version: '1.0.0' }
        }
      })
    });
    assert.equal(initialize.status, 200, await initialize.text());
    assert(initialize.headers.get('mcp-session-id'));
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nSupervisor logs:\n${logs}`);
  } finally {
    child.kill('SIGTERM');
    const result = await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 12_000))
    ]);
    if (result.timeout) {
      child.kill('SIGKILL');
      throw new Error(`Supervisor did not stop after SIGTERM.\n${logs}`);
    }
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

await configSmoke();
await cloudflareSmoke();
await gatewaySmoke();
await setupServerSmoke();
await supervisorSmoke();
console.log('codexpro-cloud smoke passed');
