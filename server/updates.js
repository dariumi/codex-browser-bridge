import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root as projectRoot, configPath } from './config.js';

const officialRemote = 'https://github.com/dariumi/codex-browser-bridge.git';
const ref = 'refs/remotes/bridge-update/main';
const version = value => {
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Invalid update version');
  return value.split('.').map(Number);
};
export function newer(a, b) { const left = version(a), right = version(b); for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i]; return false; }
export function releaseMetadata(value) {
  version(value.version); version(value.minimumSupportedVersion);
  if (typeof value.critical !== 'boolean' || typeof value.notes !== 'string' || value.notes.length > 4000) throw new Error('Invalid release metadata');
  return { version: value.version, critical: value.critical, minimumSupportedVersion: value.minimumSupportedVersion, notes: value.notes };
}
export class UpdateManager {
  constructor({ root = projectRoot, statePath = path.join(path.dirname(configPath), 'updates.json'), runner, idle = () => true, installed = () => ({}), restart = async () => {}, remote = officialRemote } = {}) {
    this.root = root; this.statePath = statePath; this.runner = runner || this.run.bind(this); this.idle = idle; this.installed = installed; this.restart = restart;
    this.remote = remote; this.policy = 'critical'; this.state = { source: officialRemote, status: 'unknown', available: false }; this.applying = false; this.ready = this.restore();
  }
  async restore() {
    this.currentVersion = JSON.parse(await readFile(path.join(this.root, 'package.json'), 'utf8')).version;
    try { const saved = JSON.parse(await readFile(this.statePath, 'utf8')); if (['manual', 'critical', 'all'].includes(saved.policy)) this.policy = saved.policy; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  status() {
    const installed = this.installed();
    return { ...this.state, currentVersion: this.currentVersion, policy: this.policy, applying: this.applying, extensionVersion: installed.extensionVersion || null,
      extensionOutdated: !!installed.extensionVersion && newer(this.currentVersion, installed.extensionVersion), restartRequired: this.state.status === 'applied',
      eligible: this.state.available && (this.policy === 'all' || this.policy === 'critical' && this.state.critical) };
  }
  async persist() { await mkdir(path.dirname(this.statePath), { recursive: true, mode: 0o700 }); await writeFile(this.statePath, JSON.stringify({ policy: this.policy, ...this.state }, null, 2), { mode: 0o600 }); }
  async configure(policy) { await this.ready; if (!['manual', 'critical', 'all'].includes(policy)) throw new Error('Invalid update policy'); this.policy = policy; await this.persist(); return this.status(); }
  async run(command, args, cwd = this.root) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      let output = '';
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-20000); });
      const timeout = setTimeout(() => { child.kill('SIGTERM'); }, 180000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', code => { clearTimeout(timeout); code === 0 ? resolve(output.trim()) : reject(new Error(`${command} failed (${code}): ${output.trim()}`)); });
    });
  }
  async check() {
    await this.ready;
    if (this.applying) return this.status();
    if (this.checking) return this.checking;
    this.checking = this.checkOnce().finally(() => { this.checking = null; }); return this.checking;
  }
  async checkOnce() {
    try {
      const top = await this.runner('git', ['rev-parse', '--show-toplevel']);
      if (path.resolve(top) !== path.resolve(this.root)) throw new Error('Automatic updates require this project to be its own Git checkout. Reinstall using git clone.');
      await this.runner('git', ['fetch', '--no-tags', this.remote, `main:${ref}`]);
      const release = releaseMetadata(JSON.parse(await this.runner('git', ['show', `${ref}:update.json`])));
      const commit = await this.runner('git', ['rev-parse', ref]);
      if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Invalid update commit');
      const packageVersion = JSON.parse(await this.runner('git', ['show', `${commit}:package.json`])).version;
      if (packageVersion !== release.version) throw new Error('Release metadata does not match package version');
      this.state = { source: officialRemote, status: 'checked', ...release, critical: release.critical || newer(release.minimumSupportedVersion, this.currentVersion), commit,
        available: newer(release.version, this.currentVersion), checkedAt: new Date().toISOString() };
    } catch (error) { this.state = { ...this.state, status: 'error', error: error.message, available: false, checkedAt: new Date().toISOString() }; }
    await this.persist(); return this.status();
  }
  async clean() { if (await this.runner('git', ['status', '--porcelain'])) throw new Error('Local changes found. Commit or save them before updating; no changes were overwritten.'); }
  async apply({ userInitiated = false } = {}) {
    await this.ready;
    if (this.applying) throw new Error('An update is already in progress');
    if (!this.idle()) return { ...this.status(), deferred: true, message: 'Update waits until the current task finishes, including scheduled sleep.' };
    const checked = await this.check();
    if (!checked.available) return checked;
    if (!userInitiated && !checked.eligible) return { ...checked, requiresUserAction: true, message: 'This release is outside the user’s automatic update policy. Apply it in extension settings.' };
    this.applying = true; let stage, merged = false, before;
    try {
      await this.clean();
      const branch = await this.runner('git', ['branch', '--show-current']); if (branch !== 'main') throw new Error('Automatic updates require the main branch');
      before = await this.runner('git', ['rev-parse', 'HEAD']);
      await this.runner('git', ['merge-base', '--is-ancestor', before, checked.commit]);
      this.state.status = 'validating'; await this.persist();
      stage = path.join(path.dirname(this.statePath), 'update-stage-' + randomUUID());
      await this.runner('git', ['worktree', 'add', '--detach', stage, checked.commit]);
      for (const args of [['ci'], ['run', 'check'], ['test'], ['run', 'package'], ['run', 'lint:firefox']]) await this.runner('npm', args, stage);
      await this.clean();
      if (!this.idle() || before !== await this.runner('git', ['rev-parse', 'HEAD'])) throw new Error('Repository or task state changed while validating. Update was not applied.');
      this.state.status = 'applying'; this.state.previousCommit = before; await this.persist();
      await this.runner('git', ['merge', '--ff-only', checked.commit]); merged = true;
      await this.runner('npm', ['ci']); await this.runner('npm', ['run', 'package']);
      this.state.status = 'applied'; this.state.available = false; this.state.appliedAt = new Date().toISOString(); await this.persist();
      await this.restart(); return this.status();
    } catch (error) {
      this.state.status = 'failed'; this.state.error = error.message;
      // Roll back only our own fast-forward when the tracked checkout is still clean.
      if (merged) {
        try {
          await this.clean();
          if (await this.runner('git', ['rev-parse', 'HEAD']) !== checked.commit) throw new Error('HEAD changed');
          await this.runner('git', ['reset', '--hard', before]); await this.runner('npm', ['ci']); await this.runner('npm', ['run', 'package']);
          this.state.rolledBack = true;
        } catch { this.state.recoveryCommit = before; this.state.error += ' Automatic rollback could not safely finish; inspect local changes before recovery.'; }
      }
      await this.persist(); throw new Error(this.state.error);
    } finally {
      if (stage) await this.runner('git', ['worktree', 'remove', '--force', stage]).catch(() => {});
      this.applying = false;
    }
  }
  async handle(action) { await this.ready; if (action === 'status') return this.status(); if (action === 'check') return this.check(); if (action === 'apply') return this.apply(); throw new Error('Unknown update action'); }
  async automatic() { const state = await this.check(); if (state.eligible && this.idle()) await this.apply(); return this.status(); }
}
