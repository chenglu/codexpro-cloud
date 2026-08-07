import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const CLOUD_CONFIG_VERSION = 1;
export const RUNTIME_MODES = Object.freeze({
  readonly: Object.freeze({ writeMode: 'off', bashMode: 'off' }),
  edit: Object.freeze({ writeMode: 'workspace', bashMode: 'off' }),
  develop: Object.freeze({ writeMode: 'workspace', bashMode: 'safe' })
});

export function cloudPaths(dataDir = process.env.CODEXPRO_DATA_DIR || '/data') {
  const root = path.resolve(dataDir);
  const secretsDir = path.join(root, 'secrets');
  return {
    root,
    configDir: path.join(root, 'config'),
    configFile: path.join(root, 'config', 'cloud.json'),
    secretsDir,
    setupCodeFile: path.join(secretsDir, 'setup-code'),
    adminPasswordFile: path.join(secretsDir, 'admin-password.json'),
    mcpTokenFile: path.join(secretsDir, 'mcp-token'),
    tunnelTokenFile: path.join(secretsDir, 'cloudflare-tunnel-token'),
    codexproHome: path.join(root, 'codexpro'),
    homeDir: path.join(root, 'home')
  };
}

export async function ensureCloudDirectories(paths = cloudPaths()) {
  await fs.mkdir(paths.configDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.secretsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.codexproHome, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.homeDir, { recursive: true, mode: 0o700 });
  await Promise.all([
    fs.chmod(paths.configDir, 0o700),
    fs.chmod(paths.secretsDir, 0o700),
    fs.chmod(paths.codexproHome, 0o700),
    fs.chmod(paths.homeDir, 0o700)
  ]);
}

export async function atomicWriteFile(filePath, contents, mode = 0o600) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  );
  try {
    await fs.writeFile(temporary, contents, { encoding: 'utf8', mode, flag: 'wx' });
    await fs.chmod(temporary, mode);
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function atomicWriteJson(filePath, value, mode = 0o600) {
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`, mode);
}

export async function readTextSecret(filePath) {
  const value = await fs.readFile(filePath, 'utf8');
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Secret file is empty: ${filePath}`);
  return trimmed;
}

export async function readCloudConfig(paths = cloudPaths()) {
  let raw;
  try {
    raw = await fs.readFile(paths.configFile, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const parsed = JSON.parse(raw);
  validateCloudConfig(parsed);
  return parsed;
}

export function validateCloudConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Cloud configuration must be a JSON object.');
  }
  if (config.version !== CLOUD_CONFIG_VERSION) {
    throw new Error(`Unsupported cloud configuration version: ${config.version}`);
  }
  for (const field of ['hostname', 'tunnelId', 'tunnelName', 'accountId', 'zoneId', 'runtimeMode']) {
    if (typeof config[field] !== 'string' || !config[field].trim()) {
      throw new Error(`Cloud configuration is missing ${field}.`);
    }
  }
  if (!Object.hasOwn(RUNTIME_MODES, config.runtimeMode)) {
    throw new Error(`Unsupported runtime mode: ${config.runtimeMode}`);
  }
  return config;
}

export function runtimePolicy(mode) {
  const policy = RUNTIME_MODES[mode];
  if (!policy) throw new Error(`Unsupported runtime mode: ${mode}`);
  return policy;
}

export function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export async function ensureSetupCode(paths = cloudPaths()) {
  try {
    return await readTextSecret(paths.setupCodeFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const code = generateSecret(24);
  try {
    await fs.writeFile(paths.setupCodeFile, `${code}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.chmod(paths.setupCodeFile, 0o600);
    return code;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return readTextSecret(paths.setupCodeFile);
  }
}

export async function hashAdminPassword(password) {
  const salt = randomBytes(16);
  const cost = 16_384;
  const blockSize = 8;
  const parallelization = 1;
  const keyLength = 32;
  const derived = await scrypt(password, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024
  });
  return {
    version: 1,
    algorithm: 'scrypt',
    salt: salt.toString('base64'),
    hash: Buffer.from(derived).toString('base64'),
    cost,
    blockSize,
    parallelization,
    keyLength
  };
}

export async function verifyAdminPassword(password, record) {
  if (
    !record ||
    record.version !== 1 ||
    record.algorithm !== 'scrypt' ||
    typeof record.salt !== 'string' ||
    typeof record.hash !== 'string'
  ) {
    return false;
  }
  const expected = Buffer.from(record.hash, 'base64');
  if (!expected.length || expected.length !== record.keyLength) return false;
  const actual = await scrypt(password, Buffer.from(record.salt, 'base64'), record.keyLength, {
    N: record.cost,
    r: record.blockSize,
    p: record.parallelization,
    maxmem: 64 * 1024 * 1024
  });
  const actualBuffer = Buffer.from(actual);
  return actualBuffer.length === expected.length && timingSafeEqual(actualBuffer, expected);
}

export async function readAdminPasswordRecord(paths = cloudPaths()) {
  const raw = await fs.readFile(paths.adminPasswordFile, 'utf8');
  return JSON.parse(raw);
}

export function secretMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function publicMcpUrl(hostname) {
  return `https://${hostname}/mcp`;
}

export function chatGptServerUrl(hostname, token) {
  const url = new URL(publicMcpUrl(hostname));
  url.searchParams.set('codexpro_token', token);
  return url.toString();
}
