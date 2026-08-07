#!/usr/bin/env node
import { cloudPaths, publicMcpUrl, readCloudConfig, readTextSecret } from './config.mjs';

async function requestOk(url, options, accepted) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(3_000) });
  if (!accepted.includes(response.status)) throw new Error(`${url} returned HTTP ${response.status}`);
}

const paths = cloudPaths();
const config = await readCloudConfig(paths);
if (!config) {
  const port = Number(process.env.CODEXPRO_CONTROL_PORT || 8789);
  await requestOk(`http://127.0.0.1:${port}/setup`, {}, [200]);
  process.exit(0);
}

const token = await readTextSecret(paths.mcpTokenFile);
await requestOk('http://127.0.0.1:8787/healthz', { headers: { authorization: `Bearer ${token}` } }, [200]);
await requestOk('http://127.0.0.1:8788/not-public', {}, [404]);

if (process.env.CODEXPRO_CLOUD_HEALTHCHECK_PUBLIC === '1') {
  await requestOk(publicMcpUrl(config.hostname), { headers: { authorization: `Bearer ${token}` } }, [400, 405]);
}
