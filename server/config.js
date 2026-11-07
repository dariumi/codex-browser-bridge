import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const isSourceInstall = existsSync(path.join(root, '.git'));
const userState = (process.env.BROWSER_BRIDGE_HOME && path.resolve(process.env.BROWSER_BRIDGE_HOME)) || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || homedir(), 'codex-browser-bridge') : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Application Support', 'codex-browser-bridge') : path.join(process.env.XDG_STATE_HOME || path.join(homedir(), '.local', 'state'), 'codex-browser-bridge'));
export const configPath = (process.env.BROWSER_BRIDGE_CONFIG && path.resolve(process.env.BROWSER_BRIDGE_CONFIG)) || (isSourceInstall ? path.join(root, '.local', 'connection.json') : path.join(userState, 'connection.json'));

export async function readConfig() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      !/^[a-f0-9]{64}$/.test(config.token)) throw new Error('Invalid bridge connection configuration');
  return config;
}

export async function initConfig(port = 17863) {
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  try { return await readConfig(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = { version: 1, port, url: `ws://127.0.0.1:${port}/extension`, token: randomBytes(32).toString('hex') };
  try { await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await chmod(configPath, 0o600);
  return readConfig();
}
