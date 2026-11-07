import { cp, mkdir, readFile, writeFile, readdir, rename, rm, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { root, configPath } from '../server/config.js';
const inventoryName = '.bridge-export.json';
async function inventory(directory) {
  const result = {};
  const visit = async relative => { for (const name of await readdir(path.join(directory, relative))) {
    if (!relative && name === inventoryName) continue;
    const item = path.join(relative, name), stat = await lstat(path.join(directory, item));
    if (stat.isSymbolicLink()) throw new Error('Extension export contains symlinks');
    if (stat.isDirectory()) await visit(item); else result[item] = createHash('sha256').update(await readFile(path.join(directory, item))).digest('hex');
  } }; await visit(''); return Object.fromEntries(Object.entries(result).sort(([a],[b]) => a.localeCompare(b)));
}
export async function exportExtensions({ browser = 'all', output, force = false } = {}) {
  if (!['all','chromium','firefox'].includes(browser) || output && browser === 'all') throw new Error('Choose chromium/firefox for --output, or use all without --output');
  const paths = {};
  for (const name of browser === 'all' ? ['chromium','firefox'] : [browser]) {
    const destination = path.resolve(output || path.join(path.dirname(configPath), 'extensions', name));
    const canonical = await realpath(destination).catch(async error => { if (error.code !== 'ENOENT') throw error; return destination; });
    const sourceRoot = await realpath(root);
    if (canonical === sourceRoot || canonical === path.join(sourceRoot, 'extension') || canonical.startsWith(path.join(sourceRoot, 'extension') + path.sep)) throw new Error('Export destination resolves into source');
    if (destination === path.resolve(root) || path.resolve(root, 'extension').startsWith(destination + path.sep) || destination.startsWith(path.resolve(root, 'extension') + path.sep) || destination === path.resolve(root, 'extension')) throw new Error('Export destination must be outside the package source');
    let existing = false;
    try {
      const stat = await lstat(destination); existing = true;
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Export destination must be a directory, not a symlink');
      if (force) {
        let manifest; try { manifest = JSON.parse(await readFile(path.join(destination, 'manifest.json'), 'utf8')); } catch {}
        if (manifest?.name !== 'Codex Browser Bridge') throw new Error('--force only replaces an existing Codex Browser Bridge export');
      }
      if (!force) {
        let saved; try { saved = JSON.parse(await readFile(path.join(destination, inventoryName), 'utf8')); } catch { throw new Error('Existing directory is not an owned export; choose another path or explicitly use --force'); }
        if (JSON.stringify(await inventory(destination)) !== JSON.stringify(saved.hashes)) throw new Error('Extension export has local edits; choose another path or explicitly use --force');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = destination + '.stage-' + randomUUID(), backup = destination + '.backup-' + randomUUID();
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await cp(path.join(root, 'extension'), temporary, { recursive: true });
      if (name === 'firefox') await writeFile(path.join(temporary, 'manifest.json'), await readFile(path.join(root, 'extension/manifest.firefox.json')));
      await rm(path.join(temporary, 'manifest.firefox.json'));
      await writeFile(path.join(temporary, inventoryName), JSON.stringify({ hashes: await inventory(temporary) }));
      if (existing) await rename(destination, backup);
      try { await rename(temporary, destination); } catch (error) { if (existing) await rename(backup, destination); throw error; }
      if (existing) await rm(backup, { recursive: true }); paths[name] = destination;
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  return paths;
}
