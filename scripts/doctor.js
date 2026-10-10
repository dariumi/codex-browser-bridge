import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readConfig, root, configPath } from '../server/config.js';
import { bridgeRequest } from '../server/client.js';

const checks = [];
const record = (name, ok, detail) => checks.push({ name, ok, detail });
const cli = args => spawnSync('codex', args, { encoding: 'utf8', timeout: 10000 });
record('Node.js', Number(process.versions.node.split('.')[0]) >= 22, process.versions.node);
const version = cli(['--version']); record('Codex CLI', version.status === 0, version.status === 0 ? version.stdout.trim() : 'Install Codex CLI and ensure codex is on PATH');
const login = cli(['login', 'status']); record('Codex login', login.status === 0, login.status === 0 ? 'Signed in (account identifiers omitted)' : 'Run codex login');
const registration = cli(['mcp', 'get', 'browser_bridge', '--json']);
let registered;
try { registered = JSON.parse(registration.stdout); } catch { /* Missing registration. */ }
const transport = registered?.transport;
record('Codex MCP registration', registration.status === 0 && registered?.enabled !== false,
  registration.status === 0 ? 'browser_bridge is registered' : 'Run npm run setup; restart the Codex MCP client afterward');
if (transport) {
  const valid = path.isAbsolute(transport.command || '') && existsSync(transport.command) && transport.args?.some(arg => path.resolve(arg) === path.join(root, 'server/mcp.js'));
  record('MCP executable and source path', !!valid, valid ? 'Absolute executable and project paths match' : 'Re-run npm run setup from this checkout');
  if (transport.env?.BROWSER_BRIDGE_CONFIG) record('MCP connection path', path.resolve(transport.env.BROWSER_BRIDGE_CONFIG) === path.resolve(configPath), 'Registered connection file must match this checkout');
}
let client;
try {
  await readConfig(); record('Connection file', true, 'Valid private key; key contents omitted');
  const status = await bridgeRequest('/status'); record('Local bridge', true, `Version ${status.version}`);
  record('Browser extension', status.connected, status.connected ? `${status.browser} ${status.extensionVersion}` : 'Load the extension and import .local/connection.json in its settings');
  const local = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  record('Version alignment', status.version === local.version && (!status.connected || status.extensionVersion === local.version), 'Restart the bridge and reload/rebuild the extension if versions differ');
  client = new Client({ name: 'browser-bridge-doctor', version: local.version });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'server/mcp.js')], env: { ...process.env, BROWSER_BRIDGE_CONFIG: configPath }, stderr: 'pipe' }));
  const listed = await client.listTools(); record('Real MCP handshake', listed.tools.some(tool => tool.name === 'browser_updates') && listed.tools.some(tool => tool.name === 'browser_snapshot'), `${listed.tools.length} tools available`);
  if (status.connected) { const policy = await bridgeRequest('/command', { action: 'policy', args: { action: 'inspect' } }); record('Browser access guard', policy.networkGuard, policy.networkGuard ? 'Network guard available' : 'Reload the extension and accept browser permissions'); }
} catch (error) { record('Connection/MCP', false, error.message); }
finally { await client?.close(); }
if (process.argv.includes('--json')) console.log(JSON.stringify({ healthy: checks.every(c => c.ok), checks }, null, 2));
else for (const check of checks) console.log(`${check.ok ? 'OK' : 'FIX'} ${check.name}: ${check.detail}`);
if (checks.some(c => !c.ok)) process.exitCode = 1;
