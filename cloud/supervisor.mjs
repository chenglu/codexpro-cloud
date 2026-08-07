#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  cloudPaths,
  ensureCloudDirectories,
  ensureSetupCode,
  readCloudConfig,
  readTextSecret,
  runtimePolicy
} from './config.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = cloudPaths();
const workspace = path.resolve(process.env.CODEXPRO_WORKSPACE_DIR || '/workspace');
const cloudflared = process.env.CLOUDFLARED_BIN || 'cloudflared';
const controlPort = Number(process.env.CODEXPRO_CONTROL_PORT || 8789);
const children = new Map();
const retryAfter = new Map();
const intentionalStops = new WeakSet();
let shuttingDown = false;
let quickTunnelUrl = '';
let runtimeSnapshot = '';
let lastConfigError = '';

function childEnvironment(extra = {}) {
  return { ...process.env, ...extra };
}

function attachQuickTunnelOutput(child) {
  const consume = (stream) => {
    if (!stream) return;
    const lines = readline.createInterface({ input: stream });
    lines.on('line', (line) => {
      const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && match[0] !== quickTunnelUrl) {
        quickTunnelUrl = match[0];
        console.error(`[codexpro-cloud] secure first-run setup: ${quickTunnelUrl}/setup`);
      }
      if (process.env.CODEXPRO_CLOUD_DEBUG === '1') console.error(`[cloudflared/setup] ${line}`);
    });
  };
  consume(child.stdout);
  consume(child.stderr);
}

function launch(name, command, args, { env, captureQuickTunnel = false } = {}) {
  const current = children.get(name);
  if (current && current.exitCode === null && !current.killed) return current;
  if ((retryAfter.get(name) || 0) > Date.now()) return null;

  console.error(`[codexpro-cloud] starting ${name}`);
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: env || process.env,
    stdio: captureQuickTunnel ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit']
  });
  children.set(name, child);
  if (captureQuickTunnel) attachQuickTunnelOutput(child);
  let stopped = false;
  const recordStop = (detail) => {
    if (stopped) return;
    stopped = true;
    if (children.get(name) === child) children.delete(name);
    if (!shuttingDown && !intentionalStops.has(child)) {
      console.error(`[codexpro-cloud] ${name} stopped (${detail}); retrying`);
      retryAfter.set(name, Date.now() + 2_000);
    }
  };
  child.once('error', (error) => {
    console.error(`[codexpro-cloud] ${name} failed to start: ${error.message}`);
    recordStop('spawn error');
  });
  child.once('exit', (code, signal) => {
    recordStop(signal || code);
  });
  return child;
}

async function stop(name) {
  const child = children.get(name);
  if (!child) return;
  children.delete(name);
  retryAfter.delete(name);
  if (child.exitCode !== null || child.killed) return;
  intentionalStops.add(child);
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 7_000);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function ensureControlServer() {
  launch('local control server', process.execPath, ['cloud/setup-server.mjs'], {
    env: childEnvironment({
      CODEXPRO_DATA_DIR: paths.root,
      CODEXPRO_CONTROL_PORT: String(controlPort)
    })
  });
}

function ensureQuickTunnel() {
  if (process.env.CODEXPRO_CLOUD_DISABLE_QUICK_TUNNEL === '1') return;
  launch(
    'temporary setup tunnel',
    cloudflared,
    [
      'tunnel',
      '--config',
      '/dev/null',
      '--no-autoupdate',
      '--url',
      `http://127.0.0.1:${controlPort}`,
      '--metrics',
      '127.0.0.1:0',
      '--grace-period',
      '5s',
      '--loglevel',
      'info'
    ],
    { captureQuickTunnel: true }
  );
}

function codexProEnvironment(config, mcpToken) {
  const policy = runtimePolicy(config.runtimeMode);
  return childEnvironment({
    HOME: paths.homeDir,
    CODEXPRO_HOME: paths.codexproHome,
    CODEXPRO_ROOT: workspace,
    CODEXPRO_ALLOWED_ROOTS: workspace,
    CODEXPRO_HOST: '127.0.0.1',
    CODEXPRO_PORT: '8787',
    CODEXPRO_HTTP_TOKEN: mcpToken,
    CODEXPRO_REQUIRE_HTTP_TOKEN: '1',
    CODEXPRO_TUNNEL_MODE: '1',
    CODEXPRO_WRITE_MODE: policy.writeMode,
    CODEXPRO_BASH_MODE: policy.bashMode,
    CODEXPRO_TOOL_MODE: 'standard',
    CODEXPRO_TOOL_CARDS: process.env.CODEXPRO_TOOL_CARDS || '0',
    CODEXPRO_CODEX_SESSIONS: 'off',
    CODEXPRO_INHERIT_ENV: '0'
  });
}

function ensureRuntime(config, mcpToken) {
  launch('CodexPro', process.execPath, ['dist/http.js'], { env: codexProEnvironment(config, mcpToken) });
  launch('MCP-only gateway', process.execPath, ['cloud/gateway.mjs'], {
    env: childEnvironment({
      CODEXPRO_GATEWAY_HOST: '127.0.0.1',
      CODEXPRO_GATEWAY_PORT: '8788',
      CODEXPRO_UPSTREAM_URL: 'http://127.0.0.1:8787',
      CODEXPRO_GATEWAY_TOKEN: mcpToken
    })
  });
  if (process.env.CODEXPRO_CLOUD_DISABLE_NAMED_TUNNEL !== '1') {
    launch(
      'Cloudflare named tunnel',
      cloudflared,
      ['tunnel', '--no-autoupdate', 'run', '--token-file', paths.tunnelTokenFile]
    );
  }
}

async function reconcile() {
  if (shuttingDown) return;
  ensureControlServer();

  let config;
  try {
    config = await readCloudConfig(paths);
    lastConfigError = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastConfigError) {
      console.error(`[codexpro-cloud] invalid cloud configuration: ${message}`);
      lastConfigError = message;
    }
    return;
  }

  if (!config) {
    await Promise.all([stop('CodexPro'), stop('MCP-only gateway'), stop('Cloudflare named tunnel')]);
    ensureQuickTunnel();
    return;
  }

  await stop('temporary setup tunnel');
  quickTunnelUrl = '';

  try {
    const [mcpToken, tunnelToken] = await Promise.all([
      readTextSecret(paths.mcpTokenFile),
      readTextSecret(paths.tunnelTokenFile)
    ]);
    if (!tunnelToken) throw new Error('Cloudflare Tunnel connector token is empty.');
    const snapshot = `${JSON.stringify(config)}\n${mcpToken}`;
    if (runtimeSnapshot && runtimeSnapshot !== snapshot) {
      await Promise.all([stop('CodexPro'), stop('MCP-only gateway')]);
    }
    runtimeSnapshot = snapshot;
    ensureRuntime(config, mcpToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastConfigError) {
      console.error(`[codexpro-cloud] cannot start runtime: ${message}`);
      lastConfigError = message;
    }
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[codexpro-cloud] received ${signal}; stopping`);
  clearInterval(reconcileTimer);
  await Promise.all([...children.keys()].map((name) => stop(name)));
}

await ensureCloudDirectories(paths);
await fs.mkdir(workspace, { recursive: true, mode: 0o750 });
const existingConfig = await readCloudConfig(paths);
if (!existingConfig) {
  const setupCode = await ensureSetupCode(paths);
  console.error(`[codexpro-cloud] installation code: ${setupCode}`);
  console.error(`[codexpro-cloud] local first-run setup: http://127.0.0.1:${controlPort}/setup`);
} else {
  console.error(`[codexpro-cloud] local admin: http://127.0.0.1:${controlPort}/admin`);
}

await reconcile();
const reconcileTimer = setInterval(() => {
  reconcile().catch((error) => {
    console.error(`[codexpro-cloud] supervisor reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}, 1_000);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    shutdown(signal).finally(() => process.exit(0));
  });
}

await new Promise(() => {});
