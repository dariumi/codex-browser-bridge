import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

for (const dir of ['server', 'extension', 'scripts', 'test']) {
  for (const file of await readdir(new URL(`../${dir}/`, import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url)));
for (const filename of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page]) await readFile(new URL(`../extension/${filename}`, import.meta.url));
console.log('JavaScript syntax and extension manifest: OK');
