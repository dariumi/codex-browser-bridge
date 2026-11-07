#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const [command = 'mcp', ...args] = process.argv.slice(2);
const commands = { mcp: '../server/mcp.js', setup: '../scripts/setup.js', doctor: '../scripts/doctor.js', status: '../scripts/status.js', bridge: '../server/daemon.js', fixture: '../scripts/fixture.js', 'native-setup': '../scripts/native-setup.js' };
if (['--version','-v','version'].includes(command)) console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version);
else if (['--help','-h','help'].includes(command)) console.log(`Codex Browser Bridge
Usage: codex-browser-bridge [command] [options]
  mcp                  Start stdio MCP (default; stdout reserved for MCP)
  setup                Create private config, register Codex, export extensions
    --no-codex         Skip Codex registration
    --no-start         Skip daemon startup
    --port PORT        Initial local bridge port
  extension            Export Chromium/Firefox add-ons outside the package
    --browser NAME     chromium, firefox or all (default)
    --output PATH      Explicit output directory (one browser only)
    --force            Replace an existing export, including local edits
  doctor [--json]      Check runtime, registration and browser
  status               Inspect bridge connection
  stop                 Gracefully stop an idle bridge
  restart              Stop an idle bridge and start this installation
  bridge               Run bridge daemon in foreground
  fixture              Start local browser test pages
  native-setup ID      Prepare optional Linux native messaging host
  --version            Print package version`);
else if (command === 'extension') {
  const { exportExtensions } = await import('../scripts/export-extension.js');
  const option = name => { const index = args.indexOf(name); if (index < 0) return undefined; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${name}`); return args[index + 1]; };
  const paths = await exportExtensions({ browser: option('--browser') || 'all', output: option('--output'), force: args.includes('--force') });
  for (const [browser, directory] of Object.entries(paths)) console.log(`${browser}: ${directory}`);
} else if (command === 'stop' || command === 'restart') {
  process.argv = [process.execPath, '', ...(command === 'restart' ? ['--restart'] : [])]; await import('../scripts/lifecycle.js');
} else if (commands[command]) {
  const target = new URL(commands[command], import.meta.url); process.argv = [process.execPath, fileURLToPath(target), ...args]; await import(target.href);
} else { console.error(`Unknown command: ${command}. Use --help.`); process.exitCode = 2; }
