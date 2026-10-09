import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('dist', { recursive: true });
await rm('dist/firefox', { recursive: true, force: true });
await cp('extension', 'dist/firefox', { recursive: true });
await writeFile('dist/firefox/manifest.json', await readFile('extension/manifest.firefox.json'));
await rm('dist/firefox/manifest.firefox.json');
const result = spawnSync('python3', ['-c', `
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
for source, archive in [('extension', 'codex-browser-bridge-extension.zip'), ('dist/firefox', 'codex-browser-bridge-firefox.zip')]:
    with ZipFile('dist/' + archive, 'w', ZIP_DEFLATED) as z:
        for p in sorted(Path(source).rglob('*')):
            if p.is_file() and p.name != 'manifest.firefox.json': z.write(p, p.relative_to(source))
`], { stdio: 'inherit' });
if (result.status) process.exit(result.status);
console.log('dist/codex-browser-bridge-extension.zip\ndist/codex-browser-bridge-firefox.zip\ndist/firefox/ (unpacked temporary Firefox add-on)');
