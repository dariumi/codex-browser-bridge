import { readdir, readFile, writeFile, mkdir, copyFile, rm, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { root as projectRoot, configPath } from './config.js';

const sourceDirs = ['extension', 'server', 'scripts', 'test', '.github'];
const sourceFiles = ['package.json', 'package-lock.json', 'README.md', 'README.ru.md', 'DISCLAIMER.md', 'TESTING.md', 'ASSETS.md', 'LICENSE', '.gitignore'];
export class DevelopmentManager {
  constructor({ root = projectRoot, checkpointDir = path.join(path.dirname(configPath), 'checkpoints'), runner, authorize = () => false, apply } = {}) {
    this.root = root; this.checkpointDir = checkpointDir; this.runner = runner || this.runProcess.bind(this);
    this.authorize = authorize; this.apply = apply; this.lastValidation = null; this.currentCheckpoint = null; this.pendingApply = false;
    this.ready = this.restore();
  }
  async restore() {
    try {
      const { id } = JSON.parse(await readFile(path.join(this.checkpointDir, 'latest.json'), 'utf8'));
      if (/^[a-f0-9-]{36}$/.test(id)) this.currentCheckpoint = id;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async files() {
    const result = [];
    const visit = async (relative) => {
      const full = path.join(this.root, relative);
      let stat; try { stat = await lstat(full); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      if (stat.isSymbolicLink()) throw new Error('Source symlinks are not supported for development checkpoints');
      if (stat.isDirectory()) { for (const name of (await readdir(full)).sort()) await visit(path.join(relative, name)); }
      else if (stat.isFile()) result.push(relative);
    };
    for (const name of [...sourceDirs, ...sourceFiles]) await visit(name);
    return result.sort();
  }
  async digest() {
    const hash = createHash('sha256');
    for (const file of await this.files()) { hash.update(file); hash.update(await readFile(path.join(this.root, file))); }
    return hash.digest('hex');
  }
  async checkpoint() {
    await this.ready;
    const id = randomUUID(), files = await this.files(), base = path.join(this.checkpointDir, id);
    for (const file of files) { const destination = path.join(base, file); await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 }); await copyFile(path.join(this.root, file), destination); }
    await writeFile(path.join(base, 'checkpoint.json'), JSON.stringify({ files, createdAt: new Date().toISOString() }), { mode: 0o600 });
    await writeFile(path.join(this.checkpointDir, 'latest.json'), JSON.stringify({ id }), { mode: 0o600 });
    this.currentCheckpoint = id; this.pendingApply = false; this.lastValidation = null; return { id, files: files.length };
  }
  async runProcess(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: this.root, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output = (output + chunk.toString()).slice(-30000); });
      const timer = setTimeout(() => { child.kill('SIGTERM'); }, 90000);
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ passed: code === 0, code, output }); });
    });
  }
  async validate() {
    const before = await this.digest();
    const syntax = await this.runner('npm', ['run', 'check']);
    const tests = syntax.passed ? await this.runner('npm', ['test']) : { passed: false, output: 'Skipped because syntax validation failed' };
    const after = await this.digest();
    this.lastValidation = { passed: syntax.passed && tests.passed && before === after, digest: after, syntax, tests, checkedAt: new Date().toISOString() };
    return this.lastValidation;
  }
  async handle(action, options = {}) {
    await this.ready;
    if (action === 'status') return { enabled: this.authorize(), checkpoint: this.currentCheckpoint, validated: this.lastValidation?.passed || false, pendingApply: this.pendingApply };
    if (!this.authorize()) throw new Error('Development mode is not enabled. Select it when submitting a task in extension chat.');
    if (action === 'checkpoint') return this.checkpoint();
    if (action === 'validate') return this.validate();
    if (action === 'apply') {
      if (!this.lastValidation?.passed || this.lastValidation.digest !== await this.digest()) throw new Error('Run validation successfully after the most recent source change before applying');
      this.pendingApply = true; await this.apply?.();
      return { scheduled: true, message: 'Extension reload and bridge restart are scheduled after the active development task finishes.' };
    }
    if (action === 'rollback') {
      const id = options.checkpointId || this.currentCheckpoint;
      if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('No valid checkpoint available');
      const base = path.join(this.checkpointDir, id);
      const { files } = JSON.parse(await readFile(path.join(base, 'checkpoint.json'), 'utf8'));
      // Checkpoint file names are restricted to the known source trees, including when read from disk.
      for (const file of files) if (file.includes('..') || path.isAbsolute(file) || !(sourceFiles.includes(file) || sourceDirs.some((dir) => file.startsWith(dir + path.sep)))) throw new Error('Invalid checkpoint path');
      for (const file of await this.files()) if (!files.includes(file)) await rm(path.join(this.root, file));
      for (const file of files) { const destination = path.join(this.root, file); await mkdir(path.dirname(destination), { recursive: true }); await copyFile(path.join(base, file), destination); }
      this.lastValidation = null; this.pendingApply = false; return { restored: id };
    }
    throw new Error('Unknown development action');
  }
}
