import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class CodexAppServer extends EventEmitter {
  constructor({ spawnProcess = spawn, executable = process.env.CODEX_BIN || 'codex' } = {}) {
    super(); this.spawnProcess = spawnProcess; this.executable = executable; this.pending = new Map(); this.nextId = 1;
  }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this.initialize().catch((error) => { this.stop(); throw error; });
    return this.starting;
  }
  async initialize() {
    this.child = this.spawnProcess(this.executable, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.on('error', (error) => this.fail(error));
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('exit', (code) => { this.fail(new Error(`Codex app-server exited (${code})`)); this.emit('exit', code); });
    this.stderr = '';
    this.child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk.toString()).slice(-6000); });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.method && message.id !== undefined) { this.emit('serverRequest', message); return; }
      if (message.method) { this.emit('notification', message); return; }
      const item = this.pending.get(message.id);
      if (item) { clearTimeout(item.timer); this.pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
    });
    await this.request('initialize', { clientInfo: { name: 'codex_browser_bridge', title: 'Codex Browser Bridge', version: '0.4.0' } });
    this.send({ method: 'initialized', params: {} });
  }
  send(message) {
    if (!this.child?.stdin.writable) throw new Error('Codex app-server is unavailable');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}, timeoutMs = 45000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ method, id, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  respond(id, result) { this.send({ id, result }); }
  fail(error) {
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }
  stop() { this.fail(new Error('Codex app-server stopped')); this.lines?.close(); this.child?.kill(); this.child = null; this.starting = null; }
}
