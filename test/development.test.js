import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DevelopmentManager } from '../server/development.js';

test('development validates current sources, rejects stale checks, and rolls back created files', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'bridge-dev-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'extension')); await writeFile(path.join(root, 'extension', 'main.js'), 'original');
  let enabled = false, applied = 0;
  const manager = new DevelopmentManager({ root, checkpointDir: path.join(root, '.local', 'checkpoints'), authorize: () => enabled,
    runner: async () => ({ passed: true, code: 0, output: 'OK' }), apply: async () => { applied++; } });
  await assert.rejects(manager.handle('validate'), /not enabled/); enabled = true;
  await manager.handle('checkpoint');
  await writeFile(path.join(root, 'extension', 'main.js'), 'changed');
  await manager.handle('validate');
  await writeFile(path.join(root, 'extension', 'extra.js'), 'new file');
  await assert.rejects(manager.handle('apply'), /most recent source change/);
  await manager.handle('validate'); await manager.handle('apply'); assert.equal(applied, 1);
  await manager.handle('rollback');
  assert.equal(await readFile(path.join(root, 'extension', 'main.js'), 'utf8'), 'original');
  await assert.rejects(readFile(path.join(root, 'extension', 'extra.js')), { code: 'ENOENT' });
  await symlink('/etc/passwd', path.join(root, 'extension', 'outside'));
  await assert.rejects(manager.checkpoint(), /symlinks/);
});
test('failed tests prevent development apply', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'bridge-dev-fail-')); t.after(() => rm(root, { recursive: true, force: true }));
  const manager = new DevelopmentManager({ root, authorize: () => true, runner: async () => ({ passed: false, output: 'fail' }) });
  assert.equal((await manager.handle('validate')).passed, false);
  await assert.rejects(manager.handle('apply'), /validation/);
});
