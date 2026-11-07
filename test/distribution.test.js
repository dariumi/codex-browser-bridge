import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportExtensions } from '../scripts/export-extension.js';

test('extension export switches Firefox manifest and upgrades unmodified owned exports', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bridge-export-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'firefox');
  await exportExtensions({ browser: 'firefox', output });
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json')));
  assert.equal(manifest.permissions.includes('debugger'), false); assert.ok(manifest.sidebar_action);
  assert.equal((await exportExtensions({ browser: 'firefox', output })).firefox, output);
  await writeFile(path.join(output, 'content.js'), '// user edit');
  await assert.rejects(exportExtensions({ browser: 'firefox', output }), /local edits/);
  assert.equal(await readFile(path.join(output, 'content.js'), 'utf8'), '// user edit');
  await exportExtensions({ browser: 'firefox', output, force: true }); assert.notEqual(await readFile(path.join(output, 'content.js'), 'utf8'), '// user edit');
});
test('extension export never force-replaces an unrelated populated directory', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bridge-export-guard-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'user.txt'), 'keep');
  await assert.rejects(exportExtensions({ browser: 'chromium', output: directory, force: true }), /existing Codex/);
  assert.equal(await readFile(path.join(directory, 'user.txt'), 'utf8'), 'keep');
  await assert.rejects(exportExtensions({ browser: 'all', output: directory }), /Choose/);
});

test('graceful stop refuses active tasks/updates and schedules idle shutdown only once', async () => {
  const { stopHandler } = await import('../server/lifecycle.js'); let busy = true, scheduled = [], stopped = 0;
  const handle = stopHandler({ busy: () => busy, stop: () => { stopped++; }, schedule: fn => scheduled.push(fn) });
  assert.throws(() => handle({ action: 'stop' }), /Finish active/); assert.equal(scheduled.length, 0);
  busy = false; handle({ action: 'stop' }); handle({ action: 'stop' }); assert.equal(scheduled.length, 1); scheduled[0](); assert.equal(stopped, 1);
});
