// Browser-local Linux virtual devices. No shell, arbitrary commands, filesystem reads or network access.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function validateDeviceRequest(request) {
  if (!['status', 'audio', 'video', 'stop'].includes(request?.action)) throw new Error('Unsupported native device action');
  if (['audio', 'video'].includes(request.action)) {
    if (typeof request.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(request.data) || request.data.length > 680000) throw new Error('Provide a base64 media fixture under 500 KiB');
    if (!Number.isInteger(request.seconds) || request.seconds < 1 || request.seconds > 300) throw new Error('Device feed duration must be 1–300 seconds');
    if (request.action === 'video' && !/^\/dev\/video\d+$/.test(request.device || '')) throw new Error('Select an existing /dev/videoN v4l2loopback device');
  }
}
export class NativeDevices {
  constructor() { this.children = new Set(); this.modules = []; this.directories = new Set(); }
  command(name, args) { const result = spawnSync(name, args, { encoding: 'utf8', timeout: 5000 }); if (result.error || result.status !== 0) throw new Error(`${name} unavailable or command failed; install/configure browser-local prerequisites`); return result.stdout.trim(); }
  async handle(request) {
    validateDeviceRequest(request);
    if (request.action === 'status') return { platform: process.platform, audio: process.platform === 'linux' && spawnSync('pactl', ['info'], { timeout: 3000, stdio: 'ignore' }).status === 0, ffmpeg: spawnSync('ffmpeg', ['-version'], { timeout: 3000, stdio: 'ignore' }).status === 0, camera: 'Requires preconfigured v4l2loopback /dev/videoN; no drivers are installed automatically', display: 'Use the browser screen picker; native helper never bypasses it' };
    if (request.action === 'stop') { await this.stop(); return { stopped: true }; }
    if (process.platform !== 'linux') throw new Error('Virtual device feeds currently support Linux only');
    await this.stop(); const directory = await mkdtemp(path.join(tmpdir(), 'codex-device-')); this.directories.add(directory); const filename = path.join(directory, 'fixture'); await writeFile(filename, Buffer.from(request.data, 'base64'), { mode: 0o600 });
    let args;
    try {
      if (request.action === 'audio') {
        const module = this.command('pactl', ['load-module', 'module-null-sink', 'sink_name=codex_bridge', 'sink_properties=device.description=Codex_Bridge']);
        if (!/^\d+$/.test(module)) throw new Error('Invalid audio module'); this.modules.push(module);
        const input = this.command('pactl', ['load-module', 'module-remap-source', 'master=codex_bridge.monitor', 'source_name=codex_bridge_input', 'source_properties=device.description=Codex_Bridge_Microphone']);
        if (!/^\d+$/.test(input)) throw new Error('Invalid virtual microphone module'); this.modules.push(input);
        args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-re', '-i', filename, '-t', String(request.seconds), '-vn', '-f', 'pulse', 'codex_bridge'];
      } else args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-re', '-stream_loop', '-1', '-i', filename, '-t', String(request.seconds), '-an', '-vf', 'scale=640:480', '-pix_fmt', 'yuv420p', '-f', 'v4l2', request.device];
      const child = spawn('ffmpeg', args, { stdio: 'ignore' }); this.children.add(child);
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.once('exit', () => { this.children.delete(child); this.cleanup().catch(() => {}); });
      // Detect immediate decoding/device errors before claiming that the feed started.
      await new Promise(resolve => setTimeout(resolve, 400)); if (child.exitCode !== null) throw new Error('Media decoder/device rejected the fixture');
      return { started: true, expiresInSeconds: request.seconds, device: request.action === 'audio' ? 'Codex_Bridge_Microphone (select it as microphone on the page)' : request.device };
    } catch (error) { await this.stop(); throw error; }
  }
  async cleanup() { for (const module of this.modules.splice(0).reverse()) spawnSync('pactl', ['unload-module', module], { timeout: 3000, stdio: 'ignore' }); const directories = [...this.directories]; this.directories.clear(); for (const directory of directories) await rm(directory, { recursive: true, force: true }); }
  async stop() { const children = [...this.children]; this.children.clear(); await Promise.all(children.map(child => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1000).unref(); }))); await this.cleanup(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const devices = new NativeDevices(); let buffer = Buffer.alloc(0), tail = Promise.resolve();
  const reply = value => { const body = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(4); header.writeUInt32LE(body.length); process.stdout.write(header); process.stdout.write(body); };
  process.stdin.on('data', data => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 4) { const length = buffer.readUInt32LE(0); if (length > 1024 * 1024) { process.stdin.destroy(); devices.stop().finally(() => process.exit(1)); return; } if (buffer.length < length + 4) break;
      const body = buffer.subarray(4, 4 + length); buffer = buffer.subarray(4 + length);
      tail = tail.then(async () => { try { reply(await devices.handle(JSON.parse(body))); } catch (error) { reply({ error: error.message }); } });
    }
  });
  process.stdin.on('end', () => tail.finally(() => devices.stop()).finally(() => process.exit(0)));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => devices.stop().finally(() => process.exit(0)));
}
