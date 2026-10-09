import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { configPath, root, readConfig } from './config.js';

export async function bridgeRequest(endpoint, command, { autoStart = true } = {}) {
  const config = await readConfig();
  const request = async () => {
    const response = await fetch(`http://127.0.0.1:${config.port}${endpoint}`, {
      method: command ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: command ? JSON.stringify(command) : undefined,
      signal: AbortSignal.timeout(command?.action === 'development' ? 200000 : command ? 50000 : 1500)
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `Bridge HTTP ${response.status}`);
    if (!command && value.service !== 'codex-browser-bridge') throw new Error('Port belongs to another service');
    return command ? value.result : value;
  };
  try { return await request(); } catch (error) {
    if (!autoStart || error.cause?.code !== 'ECONNREFUSED') throw error;
  }
  const log = await open(path.join(path.dirname(configPath), 'bridge.log'), 'a', 0o600);
  const child = spawn(process.execPath, [path.join(root, 'server/daemon.js')], {
    detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, BROWSER_BRIDGE_CONFIG: configPath }
  });
  child.on('error', (error) => console.error('Bridge launch failed:', error.message));
  child.unref(); await log.close();
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try { return await request(); } catch (error) { if (error.cause?.code !== 'ECONNREFUSED') throw error; }
  }
  throw new Error('Bridge failed to start. See .local/bridge.log');
}
