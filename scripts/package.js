import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('dist', { recursive: true });
const result = spawnSync('python3', ['-c', `
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile('dist/codex-browser-bridge-extension.zip', 'w', ZIP_DEFLATED) as z:
    for p in sorted(Path('extension').rglob('*')):
        if p.is_file(): z.write(p, p.relative_to('extension'))
`], { stdio: 'inherit' });
if (result.status) process.exit(result.status);
console.log('dist/codex-browser-bridge-extension.zip');
