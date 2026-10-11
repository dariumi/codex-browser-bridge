import { mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { root } from '../server/config.js';
const extensionId = process.argv[2];
if (!/^[a-p]{32}$/.test(extensionId || '')) { console.error('Usage: node scripts/native-setup.js CHROMIUM_EXTENSION_ID'); process.exit(1); }
const directory = path.join(root, '.local/native'); await mkdir(directory, { recursive: true, mode: 0o700 });
const launcher = path.join(directory, 'codex-devices');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(root, 'scripts/native-host.js'))}\n`, { mode: 0o700 }); await chmod(launcher, 0o700);
const base = { name: 'com.codex.browser_bridge.devices', description: 'Browser-local Codex virtual device fixtures', path: launcher, type: 'stdio' };
await writeFile(path.join(directory, 'chromium.json'), JSON.stringify({ ...base, allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2), { mode: 0o600 });
await writeFile(path.join(directory, 'firefox.json'), JSON.stringify({ ...base, allowed_extensions: ['codex-browser-bridge@dariumi'] }, null, 2), { mode: 0o600 });
console.log('Generated native host manifests in .local/native. Copy the matching JSON as com.codex.browser_bridge.devices.json to your browser NativeMessagingHosts directory. Enable virtual devices in extension settings. No system drivers or browser settings were changed.');
