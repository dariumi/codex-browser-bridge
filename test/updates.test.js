import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { UpdateManager, newer, releaseMetadata } from '../server/updates.js';

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'bridge-update-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.4.0' }));
  const old = 'a'.repeat(40), latest = 'b'.repeat(40), calls = []; let head = old, dirty = false, restarted = false;
  const release = { version: '0.5.0', critical: true, minimumSupportedVersion: '0.4.0', notes: 'Fix' };
  const runner = async (command, args, cwd = root) => {
    calls.push({ command, args, cwd });
    if (options.fail && options.fail(command, args, cwd, root)) throw Error('Fixture validation failed');
    const text = args.join(' ');
    if (text === 'rev-parse --show-toplevel') return root;
    if (text === 'status --porcelain') return dirty ? ' M local.js' : '';
    if (text === 'branch --show-current') return 'main';
    if (text === 'rev-parse HEAD') return head;
    if (args[0] === 'rev-parse') return latest;
    if (args[0] === 'show') return JSON.stringify(args[1].endsWith('update.json') ? release : { version: '0.5.0' });
    if (args[0] === 'merge') head = latest;
    if (args[0] === 'reset') head = old;
    return '';
  };
  const manager = new UpdateManager({ root, statePath: path.join(root, '.local', 'updates.json'), runner, idle: options.idle || (() => true), restart: async () => { restarted = true; }, installed: () => ({ extensionVersion: '0.3.0' }) });
  await manager.ready;
  return { manager, release, calls, root, set dirty(value) { dirty = value; }, get head() { return head; }, get restarted() { return restarted; } };
}
test('update check validates versions, official source, policy and installed extension', async t => {
  assert.equal(newer('0.10.0', '0.9.9'), true); assert.throws(() => releaseMetadata({ version: 'evil' }), /version/);
  const f = await fixture(t); const state = await f.manager.check();
  assert.equal(state.available, true); assert.equal(state.critical, true); assert.equal(state.extensionOutdated, true);
  assert.ok(f.calls.some(c => c.args[0] === 'fetch' && c.args[2] === 'https://github.com/dariumi/codex-browser-bridge.git'));
  await f.manager.configure('manual'); assert.equal(f.manager.status().eligible, false);
  const result = await f.manager.apply(); assert.equal(result.requiresUserAction, true); assert.equal(f.restarted, false);
});
test('updates defer active tasks, reject dirty work and do not merge failed staging validation', async t => {
  const active = await fixture(t, { idle: () => false }); assert.equal((await active.manager.apply()).deferred, true); assert.equal(active.calls.length, 0);
  const dirty = await fixture(t); dirty.dirty = true; await assert.rejects(dirty.manager.apply(), /Local changes/); assert.equal(dirty.head, 'a'.repeat(40));
  const failed = await fixture(t, { fail: (command, args, cwd, root) => command === 'npm' && args[0] === 'test' && cwd !== root });
  await assert.rejects(failed.manager.apply(), /Fixture validation failed/); assert.equal(failed.head, 'a'.repeat(40)); assert.equal(failed.restarted, false);
  assert.ok(failed.calls.some(c => c.args[0] === 'worktree' && c.args[1] === 'remove'));
});
test('eligible update validates before fast-forward and restarts; install failure safely rolls back', async t => {
  const f = await fixture(t); await f.manager.apply(); assert.equal(f.head, 'b'.repeat(40)); assert.equal(f.restarted, true);
  const validated = f.calls.findIndex(c => c.command === 'npm' && c.args[0] === 'test');
  assert.ok(validated < f.calls.findIndex(c => c.args[0] === 'merge')); assert.equal(f.manager.status().status, 'applied');
  let failed = false;
  const rollback = await fixture(t, { fail: (command, args, cwd, root) => { if (!failed && command === 'npm' && args[0] === 'ci' && cwd === root) { failed = true; return true; } return false; } });
  await assert.rejects(rollback.manager.apply(), /Fixture validation failed/); assert.equal(rollback.head, 'a'.repeat(40)); assert.equal(rollback.manager.status().rolledBack, true); assert.equal(rollback.restarted, false);
});
test('minimum supported release makes an otherwise ordinary update critical', async t => {
  const f = await fixture(t); f.release.critical = false; f.release.minimumSupportedVersion = '0.5.0';
  assert.equal((await f.manager.check()).critical, true);
});

test('real Git update stages, validates, fast-forwards and preserves private local configuration', async t => {
  const exec = promisify(execFile), base = await mkdtemp(path.join(tmpdir(), 'bridge-real-update-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const upstream = path.join(base, 'upstream'), checkout = path.join(base, 'checkout');
  const { mkdir, readFile } = await import('node:fs/promises'); await mkdir(upstream);
  const git = async (args, cwd = upstream) => (await exec('git', args, { cwd })).stdout.trim();
  await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Update fixture']); await git(['config', 'user.email', 'fixture@example.invalid']); await git(['config', 'core.hooksPath', path.join(base, 'no-hooks')]);
  const pkg = { name: 'bridge-update-fixture', version: '0.4.0', scripts: { 'lint:firefox': 'node -e "process.exit(0)"', check: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"', package: 'node -e "require(\'fs\').mkdirSync(\'dist\',{recursive:true})"' } };
  await writeFile(path.join(upstream, 'package.json'), JSON.stringify(pkg));
  await writeFile(path.join(upstream, '.gitignore'), '.local/\ndist/\nnode_modules/\n');
  await exec('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: upstream });
  await git(['add', '.']); await git(['commit', '-m', 'Initial']); await git(['clone', upstream, checkout], base);
  pkg.version = '0.5.0'; await writeFile(path.join(upstream, 'package.json'), JSON.stringify(pkg));
  await writeFile(path.join(upstream, 'update.json'), JSON.stringify({ version: '0.5.0', critical: true, minimumSupportedVersion: '0.4.0', notes: 'Fixture release' }));
  await exec('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: upstream });
  await git(['add', '.']); await git(['commit', '-m', 'Release']);
  await mkdir(path.join(checkout, '.local')); const privateConfig = path.join(checkout, '.local', 'connection.json'); await writeFile(privateConfig, '{"fixtureSecret":"preserve-me"}');
  let restarted = false;
  const updater = new UpdateManager({ root: checkout, remote: upstream, statePath: path.join(checkout, '.local', 'updates.json'), restart: async () => { restarted = true; } });
  await updater.apply(); assert.equal(restarted, true); assert.equal(await git(['rev-parse', 'HEAD'], checkout), await git(['rev-parse', 'HEAD']));
  assert.equal(await readFile(privateConfig, 'utf8'), '{"fixtureSecret":"preserve-me"}'); assert.equal(await git(['status', '--porcelain'], checkout), '');
  assert.equal((await git(['worktree', 'list', '--porcelain'], checkout)).split('worktree ').length, 2);
});
