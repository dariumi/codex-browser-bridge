import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createBroker } from '../server/broker.js';
import { prepareTestAddon } from './test-addon.js';
import { policySmoke } from './policy-smoke.js';
const dir = await mkdtemp(path.join(tmpdir(), 'codex-chromium-'));
let broker, browser, client;
try {
  const token = randomBytes(32).toString('hex'); broker = await createBroker({ port: 0, token });
  const addon = path.join(dir, 'addon'), connection = path.join(dir, 'connection.json');
  await prepareTestAddon(addon, { url: `ws://127.0.0.1:${broker.port}/extension`, token, enabled: true });
  await writeFile(connection, JSON.stringify({ port: broker.port, token }), { mode: 0o600 });
  browser = spawn(process.env.CHROMIUM_BIN || '/bin/brave-browser', ['--headless=new', '--no-sandbox', '--disable-gpu', '--enable-extensions', `--user-data-dir=${path.join(dir, 'profile')}`, `--disable-extensions-except=${addon}`, `--load-extension=${addon}`, 'about:blank'], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let browserErrors = ''; browser.stderr.on('data', chunk => { browserErrors = (browserErrors + chunk).slice(-5000); });
  const deadline = Date.now() + 30000;
  while (!broker.status().connected && Date.now() < deadline) await new Promise(r => setTimeout(r, 200));
  assert.equal(broker.status().connected, true, `Isolated Chromium extension did not authenticate: ${browserErrors}`);
  await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['scripts/browser-smoke.js'], { env: { ...process.env, BROWSER_BRIDGE_CONFIG: connection }, stdio: 'inherit' }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Baseline smoke failed: ${code}`))); });
  client = new Client({ name: 'isolated-policy-smoke', version: '0.4.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('server/mcp.js')], env: { ...process.env, BROWSER_BRIDGE_CONFIG: connection }, stderr: 'inherit' }));
  const call = async (action, args = {}) => { const reply = await client.callTool({ name: `browser_${action}`, arguments: args }); if (reply.isError) throw Error(reply.content[0].text); return JSON.parse(reply.content.find(c => c.type === 'text').text); };
  await policySmoke(call, async (name, fn) => { await fn(); console.log(`PASS ${name}`); });
} finally {
  await client?.close();
  // Browser launchers can wrap a child process; terminate this isolated process group only.
  if (browser) { try { process.kill(-browser.pid, 'SIGTERM'); } catch { /* Already exited. */ } }
  await broker?.close();
  if (browser && browser.exitCode === null) await new Promise(resolve => { browser.once('exit', resolve); setTimeout(resolve, 3000); });
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
