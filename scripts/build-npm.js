import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export async function buildNpm(output = path.resolve('dist')) {
  const root = fileURLToPath(new URL('../', import.meta.url)), stage = await mkdtemp(path.join(tmpdir(), 'bridge-npm-'));
  const destination = path.resolve(output); await mkdir(destination, { recursive: true });
  try {
    for (const name of ['bin','server','extension','docs','LICENSE','README.md','README.ru.md','DISCLAIMER.md','RELEASE_NOTES.md','ASSETS.md','update.json']) await cp(path.join(root, name), path.join(stage, name), { recursive: true });
    await mkdir(path.join(stage, 'scripts'));
    for (const name of ['lifecycle.js','setup.js','doctor.js','status.js','fixture.js','native-setup.js','native-host.js','export-extension.js']) await cp(path.join(root, 'scripts', name), path.join(stage, 'scripts', name));
    const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    metadata.files = [...metadata.files, 'npm-shrinkwrap.json'];
    delete metadata.devDependencies; delete metadata.private;
    metadata.scripts = { setup: 'node scripts/setup.js', start: 'node server/mcp.js', bridge: 'node server/daemon.js', doctor: 'node scripts/doctor.js', status: 'node scripts/status.js', fixture: 'node scripts/fixture.js' };
    await writeFile(path.join(stage, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
    const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
    lock.version = metadata.version; lock.packages[''] = { ...lock.packages[''], version: metadata.version, bin: metadata.bin }; delete lock.packages[''].devDependencies;
    await writeFile(path.join(stage, 'npm-shrinkwrap.json'), JSON.stringify(lock, null, 2) + '\n');
    const npmArgs = ['pack','--silent','--ignore-scripts','--pack-destination',destination];
    const npmCLI = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const result = spawnSync(process.platform === 'win32' ? process.execPath : 'npm', process.platform === 'win32' ? [npmCLI, ...npmArgs] : npmArgs, { cwd: stage, stdio: 'inherit', env: { ...process.env, npm_config_cache: path.join(destination, '.npm-cache'), npm_config_update_notifier: 'false' } });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || 'npm pack failed');
    const filename = metadata.name.replace(/^@/, '').replace('/', '-') + '-' + metadata.version + '.tgz';
    return path.join(destination, filename);
  } finally { await rm(stage, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildNpm(process.argv[2]));
