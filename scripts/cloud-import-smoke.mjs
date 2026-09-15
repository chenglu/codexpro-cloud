import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { PathGuard, WorkspaceManager } from '../dist/guard.js';
import { importAttachmentFile } from '../dist/importOps.js';

const root = await fs.mkdtemp(path.join(process.env.CODEXPRO_TEST_WORKSPACE_ROOT || os.tmpdir(), 'cloud-import-'));
const fixture = http.createServer((request, response) => {
  response.setHeader('content-type', 'text/plain');
  response.end(request.url === '/new' ? 'replacement attachment\n' : 'original attachment\n');
});

try {
  if (process.env.CODEXPRO_TEST_REQUIRE_SEPARATE_FILESYSTEMS === '1') {
    assert.notEqual((await fs.stat(root)).dev, (await fs.stat(os.tmpdir())).dev,
      'The Docker regression must use separate download and workspace filesystems.');
  }
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${fixture.address().port}`;
  const config = loadConfig(['--root', root, '--write', 'workspace', '--bash', 'off']);
  const guard = new PathGuard(config);
  const workspace = new WorkspaceManager(config).defaultWorkspace();
  const destination = 'attachments/example.txt';
  const target = path.join(root, destination);
  const importFile = (route, extra = {}) => importAttachmentFile(config, guard, workspace, {
    file: { download_url: `${baseUrl}/${route}`, file_id: 'file_cloud_import_fixture' },
    destination,
    env: { CODEXPRO_IMPORT_ALLOW_LOOPBACK: '1' },
    ...extra
  });

  const first = await importFile('original');
  assert.equal(first.overwritten, false);
  assert.equal(await fs.readFile(target, 'utf8'), 'original attachment\n');
  await assert.rejects(importFile('new'), /already exists/);
  assert.equal(await fs.readFile(target, 'utf8'), 'original attachment\n');

  await assert.rejects(importFile('new', { overwrite: true, expectedSha256: '0'.repeat(64) }), /SHA-256 mismatch/);
  assert.equal(await fs.readFile(target, 'utf8'), 'original attachment\n');

  const expectedSha256 = createHash('sha256').update('replacement attachment\n').digest('hex');
  const replaced = await importFile('new', { overwrite: true, expectedSha256 });
  assert.equal(replaced.overwritten, true);
  assert.equal(replaced.verified, true);
  assert.equal(replaced.sha256, expectedSha256);
  assert.equal(await fs.readFile(target, 'utf8'), 'replacement attachment\n');
  assert.deepEqual(await fs.readdir(path.dirname(target)), ['example.txt']);
  console.log('cloud attachment import smoke passed');
} finally {
  await new Promise((resolve) => fixture.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
