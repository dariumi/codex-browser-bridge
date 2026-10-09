import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const configPath = process.env.BROWSER_BRIDGE_CONFIG || path.join(root, '.local', 'connection.json');

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
