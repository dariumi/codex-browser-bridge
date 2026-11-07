"""Verify built distributions. Optional --install performs real npm dependency installation."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
parser = argparse.ArgumentParser()
parser.add_argument('--install', action='store_true')
args = parser.parse_args()
archive = root / 'dist' / f'codex-browser-bridge-{version}.tgz'
wheel = root / 'dist' / f'codex_browser_bridge-{version}-py3-none-any.whl'
with tarfile.open(archive) as package:
    names = package.getnames()
    assert all(name.startswith('package/') and '..' not in Path(name).parts for name in names)
    assert not any(part in {'.local', '.git', 'node_modules', '__pycache__'} for name in names for part in Path(name).parts)
    assert not any(name.endswith('connection.json') or name.endswith('.log') for name in names)
    metadata = json.load(package.extractfile('package/package.json'))
    assert metadata['version'] == version and not metadata.get('private')
    assert 'codex-browser-bridge' in metadata['bin']
    assert 'package/npm-shrinkwrap.json' in names
    for item in ['bin/codex-browser-bridge.js','server/mcp.js','extension/manifest.firefox.json','scripts/export-extension.js']:
        assert 'package/' + item in names
    with tempfile.TemporaryDirectory(prefix='bridge-distribution-') as directory:
        temporary = Path(directory)
        # Python >=3.12 filter; this archive was built locally and all entries were checked above.
        for member in package.getmembers():
            assert member.isfile() or member.isdir()
        if sys.version_info >= (3, 12):
            package.extractall(temporary, filter='data')
        else:
            assert all('\\' not in member.name and ':' not in member.name and (temporary / member.name).resolve().is_relative_to(temporary.resolve()) for member in package.getmembers())
            package.extractall(temporary)
        runtime = temporary / 'package'
        env = {**os.environ, 'BROWSER_BRIDGE_HOME': str(temporary / 'state')}
        env.pop('BROWSER_BRIDGE_CONFIG', None)
        cli = runtime / 'bin/codex-browser-bridge.js'
        assert subprocess.check_output(['node',str(cli),'--version'], text=True, env=env).strip() == version
        subprocess.run(['node',str(cli),'setup','--no-codex','--no-start'], check=True, env=env, stdout=subprocess.DEVNULL)
        config = json.loads((temporary / 'state/connection.json').read_text())
        assert len(config['token']) == 64
        assert (temporary / 'state/extensions/firefox/manifest.json').is_file()
        assert not (runtime / '.local').exists()
        inspection = f"import {{UpdateManager}} from {json.dumps((runtime / 'server/updates.js').as_uri())}; import {{DevelopmentManager}} from {json.dumps((runtime / 'server/development.js').as_uri())}; const updates=new UpdateManager(); await updates.ready; const state=await updates.check(); if(state.status!=='package_managed'||state.available)throw Error('Unsafe package updater'); const dev=new DevelopmentManager({{authorize:()=>true}}); await dev.ready; let denied=false;try{{await dev.checkpoint();}}catch{{denied=true;}}if(!denied)throw Error('Package source editing allowed');"
        subprocess.run(['node','--input-type=module','-e',inspection], check=True, env=env)
        if args.install:
            subprocess.run(['npm','install','--prefix',str(temporary / 'installed'),'--ignore-scripts','--omit=dev','--no-audit','--no-fund','--fetch-retries=0','--fetch-timeout=8000',str(archive)], check=True)
            installed = temporary / 'installed/node_modules/codex-browser-bridge'
            handshake = "import {Client} from '@modelcontextprotocol/sdk/client/index.js'; import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'; import assert from 'node:assert/strict'; const client=new Client({name:'package-check',version:'1.0.0'}); try {await client.connect(new StdioClientTransport({command:process.execPath,args:['bin/codex-browser-bridge.js','mcp'],env:process.env,stderr:'inherit'})); assert.equal((await client.listTools()).tools.length,38);}finally{await client.close();}"
            subprocess.run(['node','--input-type=module','-e',handshake], cwd=installed, check=True, env=env, timeout=30)
with zipfile.ZipFile(wheel) as package:
    names = package.namelist()
    assert 'codex_browser_bridge/_bundle/runtime.tgz' in names
    data = package.read('codex_browser_bridge/_bundle/runtime.tgz')
    metadata = json.loads(package.read('codex_browser_bridge/_bundle/runtime.json'))
    assert metadata['version'] == version and hashlib.sha256(data).hexdigest() == metadata['sha256']
    with tarfile.open(fileobj=io.BytesIO(data)) as bundled:
        assert json.load(bundled.extractfile('package/package.json'))['version'] == version
    assert not any('.local/' in name or name.endswith('.log') for name in names)
sdist = root / 'dist' / f'codex_browser_bridge-{version}.tar.gz'
if sdist.exists():
    with tarfile.open(sdist) as source:
        entries = source.getnames()
        assert not any(part in {'.local','.git','node_modules','__pycache__'} for name in entries for part in Path(name).parts)
        assert any(name.endswith('/scripts/build-npm.js') for name in entries)
        assert any(name.endswith('/extension/manifest.json') for name in entries)
print('Distribution contents, CLI setup/export and bundled runtime integrity: OK')
