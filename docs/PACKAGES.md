# Package installation and publishing

npm and Python artifacts are prepared by this repository. Publication and package-name ownership are not established by a successful build. Until an authorized registry release exists, install the local `.tgz` or `.whl` files. The README marks registry commands accordingly.

## npm users

Requirements: Node.js >=22 and npm. Codex CLI/login is needed for built-in chat. Install a release artifact:

```sh
npm install --global ./codex-browser-bridge-0.8.1.tgz
codex-browser-bridge setup
codex-browser-bridge doctor
```

After npm publication, use `npm install --global codex-browser-bridge`. The CLI defaults to stdio MCP when no command is given; stdout is reserved for protocol traffic. `--help` lists setup, extension export, doctor, status, bridge, fixture and optional native-host setup.

No global install permission? Use `npm install --prefix /your/writable/prefix ./codex-browser-bridge-0.8.1.tgz` and run that prefix's `node_modules/.bin/codex-browser-bridge`. Keep the installed package at a stable path. Avoid registering an ephemeral `npx` cache path when a global/local permanent install is available.

## Python users

Requirements: Python >=3.10, Node.js >=22 and npm. Prefer pipx:

```sh
pipx install ./codex_browser_bridge-0.8.1-py3-none-any.whl
codex-browser-bridge setup
codex-browser-bridge doctor
```

A virtual environment also works:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install ./codex_browser_bridge-0.8.1-py3-none-any.whl
.venv/bin/python -m codex_browser_bridge setup
```

On Windows, use the environment's `Scripts/python.exe`. After PyPI publication, the pipx install target becomes `codex-browser-bridge`.

The wheel contains a locally built npm runtime archive and SHA-256/version metadata. It never fetches an unrelated package of the same name from npm. `setup` (or explicit `bootstrap`) verifies the archive and installs its locked production dependencies through npm, with lifecycle scripts disabled. Initial dependency installation needs registry access or a complete npm cache. The package itself has no Python runtime dependencies. Installing the wheel does not run npm, register Codex or load a browser extension.

Runtime files live in a version/hash-specific user cache. Override it with `BROWSER_BRIDGE_PY_CACHE`; Linux normally uses `$XDG_CACHE_HOME/codex-browser-bridge` or `~/.cache/codex-browser-bridge`. Keep old runtime directories while an MCP registration points to them. `setup` registers the actual absolute Node executable and installed JS server, so ordinary MCP startup does not download dependencies or print installation logs on stdout. `python -m codex_browser_bridge` is also available.

## Browser files and persistent state

For package installations, connection and task state live outside code directories:

| Platform | Default state directory |
| --- | --- |
| Linux | `$XDG_STATE_HOME/codex-browser-bridge` or `~/.local/state/codex-browser-bridge` |
| macOS | `~/Library/Application Support/codex-browser-bridge` |
| Windows | `%LOCALAPPDATA%/codex-browser-bridge` |

`BROWSER_BRIDGE_HOME` selects a different state directory; `BROWSER_BRIDGE_CONFIG` selects the exact connection-file path. Use absolute paths. Existing Git checkouts keep `.local/connection.json` unless overridden. When migrating from Git, point the package at the existing connection file rather than generating a second token/port. Use `codex-browser-bridge restart` after setup and reload MCP; older versions without graceful stop may require stopping the old daemon manually once.

`setup` exports both add-ons into stable `extensions/chromium` and `extensions/firefox` directories next to the connection file. Load those paths in the browser; do not load directly from `node_modules`, a wheel resource or an ephemeral package cache.

```sh
codex-browser-bridge extension
codex-browser-bridge extension --browser firefox --output /your/addons/browser-bridge-firefox
```

An owned export has an inventory of file hashes. Re-exporting replaces only an unmodified owned export. Edits or unknown files cause refusal. `--force` explicitly replaces a bridge export with local edits; it never force-replaces an unrelated directory. Source extension files are protected. Browser installation/reload is still a user browser action, and Firefox's temporary installation is not permanent signing.

`setup --no-codex --no-start` prepares private connection files and add-ons without registering Codex or starting a local server. This is useful for explicit manual setup and isolated tests.

## Updating package installs

Use the same package manager that installed the launcher. After the first registry release:

```sh
npm install --global codex-browser-bridge@latest
# OR
pipx upgrade codex-browser-bridge
```

Then run `codex-browser-bridge setup` and `codex-browser-bridge restart`, and reload both MCP and the exported browser add-on. Upgrading the package does not itself modify your browser profile or cancel tasks; finish/stop tasks before restarting. A previously running daemon keeps its old code until restarted, and `doctor` reports version mismatches. Keep the same configuration path and exported extension paths. `stop` and `restart` refuse active/sleeping managed tasks or updates. A stopped connection also cancels standalone scripts and clears bridge-owned view/device settings.

Git self-updates and source-development checkpoints/apply are disabled in package installs. They require a separate source checkout. This protects package-manager files and allows upgrades in read-only system installations. Domain rules, script retention and site consent are unchanged. Exported extension edits are preserved by refusing overwrite.

## Build distributions

```sh
npm ci
npm run check
npm test
npm run package
npm run lint:firefox
npm run pack:npm
python3 -m pip install build
python3 -m build
npm run test:python
npm run test:packages
python3 scripts/test-packages.py --install
```

`npm run pack:python` builds only the wheel using already installed setuptools >=77 and wheel. `python -m build` uses an isolated build environment and produces both sdist and wheel. Source builds need Node/npm; installing the built wheel does not need Git or Python build tools. The sdist includes JS source needed to rebuild the exact runtime. The npm artifact includes a production runtime, browser assets, docs and `npm-shrinkwrap.json`; it excludes private configuration, node_modules, test history and logs. No `postinstall` hook runs setup.

The distribution check scans both archives, validates bundled integrity, runs the packed CLI and prepares both add-ons in an isolated state directory. `--install` additionally performs a real clean npm dependency installation. CI runs that online check; an offline or network-restricted development machine must not claim it passed if dependencies are missing from cache.

## First publication (maintainer)

1. Verify that you own the exact npm and PyPI names. If a name is taken by someone else, choose an owned name/scope and update metadata and launcher paths/tests before publishing. Do not install or overwrite another publisher's similarly named project.
2. Build and review the artifacts, run all checks and inspect the package file list. Confirm no connection file, token, task/script history or browser artifacts are included.
3. For manual npm publication, authenticate with your own account and publish the reviewed artifact:

   ```sh
   npm login
   npm publish ./dist/codex-browser-bridge-0.8.1.tgz --access public
   ```

4. For PyPI, configure the repository's trusted publisher (preferred), or use your authorized publishing environment. Never commit registry tokens. For a manual upload after configuring credentials:

   ```sh
   python3 -m pip install build twine
   python3 -m build
   python3 -m twine check dist/codex_browser_bridge-*.whl dist/codex_browser_bridge-*.tar.gz
   python3 -m twine upload dist/codex_browser_bridge-*.whl dist/codex_browser_bridge-*.tar.gz
   ```

5. `.github/workflows/packages.yml` builds/checks packages on push/PR. Publication is manual via `workflow_dispatch` with `publish: true` on `main`, and uses separate `npm` / `pypi` environments and OIDC permissions. Configure the registry trusted publishers for this repository/workflow and those environment names. npm requires a compatible CLI and an allowed direct-publish action. No registry account/project is created by committing this workflow.
6. Only after publication, confirm the installed version from each registry and update the README's package-availability notice.

References: [npm package files/bin](https://docs.npmjs.com/cli/configuring-npm/package-json/), [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [Python packaging](https://packaging.python.org/en/latest/tutorials/packaging-projects/), [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/using-a-publisher/).

## Кратко по-русски

Установите локальный `.tgz` через npm или `.whl` через pipx, затем выполните `codex-browser-bridge setup`. Для Python-варианта также нужны Node.js >=22 и npm: он запускает общий JS-движок. Git не требуется.

Команда выводит пути к расширениям и приватному файлу подключения. Загрузите соответствующее дополнение в браузере, импортируйте файл и перезапустите MCP. Ключ, история и экспортированные дополнения хранятся вне установленного пакета. При переносе с Git сохраните прежний путь `BROWSER_BRIDGE_CONFIG` и остановите старый мост.

Пакеты в реестры ещё не опубликованы; владение именами нужно проверить. Для публикации нужны ваш npm-аккаунт и настройки PyPI/Trusted Publisher. В workflow публикация включается только вручную. Создание архивов не означает успешную публикацию или проверку чистой онлайн-установки.
