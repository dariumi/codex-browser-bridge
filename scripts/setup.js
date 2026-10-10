import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile } from 'node:fs/promises';
import { initConfig, configPath, root } from '../server/config.js';
import { bridgeRequest } from '../server/client.js';

const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 17863;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535');
await initConfig(port);
if (!process.argv.includes('--no-codex')) {
  const result = spawnSync('codex', ['mcp', 'add', 'browser_bridge', '--env', `BROWSER_BRIDGE_CONFIG=${configPath}`, '--', process.execPath, path.join(root, 'server/mcp.js')], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Cannot register Codex MCP. Install Codex CLI or use --no-codex and configure manually.');
  const codexConfig = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'config.toml');
  const contents = await readFile(codexConfig, 'utf8');
  const header = '[mcp_servers.browser_bridge]', start = contents.indexOf(header);
  if (start < 0) throw new Error('Registered MCP section was not found in Codex config');
  const next = contents.indexOf('\n[', start + header.length), end = next < 0 ? contents.length : next;
  const section = contents.slice(start, end);
  let updated = section;
  const settings = { startup_timeout_sec: '10', tool_timeout_sec: '900', required: 'true' };
  if (process.argv.includes('--delegate-browser')) settings.default_tools_approval_mode = '"approve"';
  for (const [key, value] of Object.entries(settings)) {
    const expression = new RegExp('^' + key + '\\s*=.*$', 'm');
    updated = expression.test(updated) ? updated.replace(expression, `${key} = ${value}`) : updated.replace(header, header + `\n${key} = ${value}`);
  }
  await writeFile(codexConfig, contents.slice(0, start) + updated + contents.slice(end));
}
const status = await bridgeRequest('/status');
console.log(`Extension directory: ${path.join(root, 'extension')}`);
console.log(`Import this file in extension settings: ${configPath}`);
console.log(`Bridge ready. Browser connected: ${status.connected}`);
console.log('Restart/reload Codex MCP to discover browser_* tools.');
console.log('Then run npm run doctor. For Firefox, run npm run package and load dist/firefox/manifest.json.');
if (process.argv.includes('--delegate-browser')) console.log('Browser-tool delegation is enabled only for browser_bridge. Extension site restrictions and user consent still apply.');
