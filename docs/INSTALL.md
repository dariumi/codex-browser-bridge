# Install, connect and verify

[Русская инструкция](INSTALL.ru.md) · [Agent setup](AGENT_SETUP.md) · [README](../README.md)

You install two parts: a **local Node.js bridge** on the Codex machine, and a **browser extension** on the browser machine. They share one private connection file. Installing only the extension does not provide MCP tools.

## 1. Prepare the computer

Install Git, Node.js 22 or newer, and [Codex CLI](https://learn.chatgpt.com/docs/cli). Open a terminal and check:

```bash
git --version
node --version
npm --version
codex --version
codex login
```

You need a signed-in Codex account to run extension chat. MCP browser tools can be used by another compatible MCP client independently of that chat login.

## 2. Install and register the bridge

```bash
git clone https://github.com/dariumi/codex-browser-bridge.git
cd codex-browser-bridge
npm ci
npm run setup
npm run package
```

Use a Git clone for automatic updates. A downloaded source ZIP can run, but cannot update itself through Git.

Setup creates `.local/connection.json`, registers `browser_bridge` in the Codex configuration and starts the bridge. It prints the exact extension/configuration paths without printing the key. Keep this project folder at that location; after moving it, rerun setup.

Setup configures an absolute Node executable and MCP source path, a 10-second startup timeout, a 900-second tool timeout for update validation, and `required = true`. It does **not** change your global approval policy.

If you want browser actions from ordinary Codex conversations to run under delegated authorization without separate Codex approval for each MCP call, explicitly choose:

```bash
npm run setup -- --delegate-browser
```

This sets `default_tools_approval_mode = "approve"` **only for browser_bridge**. Extension domain rules and JavaScript/CDP consent still apply. Built-in extension chat already scopes delegated tool access to its own authorized task.

Without Codex CLI, use `npm run setup -- --no-codex` and configure your MCP client manually. On first setup, `--port 17865` selects another port. `BROWSER_BRIDGE_CONFIG` selects another connection-file path. These settings must match the file imported into the browser.

## 3. Load the extension

### Chrome / Chromium / Brave / Edge

1. Open `chrome://extensions`, `brave://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select the project's `extension` folder. Select the folder, not a manifest file or ZIP.
4. Open the extension's **Settings** from its toolbar icon.
5. Use the connection-file import picker and choose `.local/connection.json`. Linux Ctrl+H shows hidden folders; use the full path printed by setup on other systems.
6. Wait for **Connected**.

### Firefox Desktop 142+

1. Run `npm run package` if you have not built the add-on.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `dist/firefox/manifest.json`.
4. Open add-on settings, for example through `about:addons` → Codex Browser Bridge → Preferences.
5. Import the same `.local/connection.json` file and wait for **Connected**.
6. Open the **actual website you want to work with** in another tab. `about:debugging`, `about:addons` and other internal pages are installation screens, not automation targets.

A temporary Firefox add-on must be loaded again after restarting Firefox. A permanent add-on needs Mozilla signing; the project does not distribute a signed XPI. Do not load the Chromium manifest in Firefox.

One bridge connects one browser at a time. Disconnect the extension in the other browser before switching.

## 4. Connect Codex and verify the whole chain

After registration, restart/reload Codex MCP or start a new Codex session. A running conversation may retain its previous tool list.

```bash
codex mcp get browser_bridge
npm run doctor
```

Doctor checks Node, Codex login, MCP registration and paths, the private connection file, daemon/browser versions, a **real stdio MCP handshake**, the tool list and network access guard. It never prints the connection key or account identifiers. `npm run doctor -- --json` produces an agent-readable report. Follow each `FIX` line until all checks say `OK`.

Then tell Codex: “Use browser_bridge, check browser_status, list browser_tabs, and inspect the tab I select.” An ordinary HTTP(S) tab should appear. A protected tab's metadata stays hidden until you approve access.

To use extension chat, open the website, click **Chat Codex**, and check its target title/URL. If the panel still points at an installation page, select the website tab and press **Use open tab** in chat. Send a small task first, such as inspecting the page without changing it.

When a permission card appears, **you** choose Allow or Deny in extension chat, popup or settings. The agent cannot approve itself. Approvals expire; denied access must not be worked around.

## 5. Long-running tasks

Enable **Complete all stages autonomously** and **Long-running work with waiting and wake-up** in chat. Choose a wall-clock limit of 1–72 hours; the default is 24 hours. This mode permits up to four hours of active work and 200 turns. The usual mode remains 30 minutes / 20 turns.

Describe the condition to wait for and what to verify afterward. Codex can call `browser_task` → `sleep` for 1–86400 seconds, with a reason and next instruction. The tool returns immediately; the bridge pauses inference and resumes the same conversation when the wait ends. Chat shows the wake time/countdown and **Continue now**. You can send clarifications while sleeping or cancel it.

The bridge and target tab must remain available. Closing a terminal is fine for the automatically detached bridge; shutting down the computer stops physical progress. Sleeping tasks are restored after a bridge restart. If the browser is disconnected, wake retries without recreating your target. Wall-clock/active/turn limits still apply. Expired site permissions require a new user decision.

Waiting does not itself watch, listen to, or prove completion of a video. The agent must recheck actual playback, timer or page state; websites can pause playback in background tabs. Only managed bridge tasks are automatically woken; a separate desktop Codex conversation is not resumed by this timer.

## 6. Updates

Settings offer **Critical only** (default), **Manual**, and **All official updates**. The daemon checks at startup and every six hours. Chat shows current/latest versions and extension mismatch; **Check** forces a fresh check. The agent uses `browser_updates` → `check` / `apply` under the same policy. Manual installation is available in settings.

A release is critical if the maintainer marks `update.json` critical, or your version is older than its minimum supported version. A release's version must match its package version. Only the official repository's `main` branch is fetched; MCP cannot replace the update source or change the automatic-update policy.

Updates wait until active/sleeping tasks finish, require a clean `main` checkout and a fast-forward, and run dependency installation, syntax checks, tests and packaging in a separate Git worktree **before** changing your project. After installation the bridge reloads the extension and restarts. Private keys and ignored local history are retained. Install failures roll back the updater's own changes only while the tracked checkout is still clean; otherwise the error includes the recovery commit without overwriting local edits.

For this first upgrade from an older version without the update mechanism:

```bash
git pull --ff-only
npm ci
npm run setup
npm run package
```

Stop the old bridge before restarting it (see below), then reload Chromium's extension or reload the rebuilt Firefox add-on. Accept any browser permission prompt and rerun doctor. Do not delete `.local/connection.json` to fix a version mismatch.

## Manual configuration and troubleshooting

The local bridge is auto-started by MCP. Use `npm run bridge` only if you want foreground operation; do not start a second daemon on the same port. `npm run status` checks connectivity. Logs are in `.local/bridge.log`.

To stop it on Linux/macOS, find its PID with `lsof -iTCP:17863 -sTCP:LISTEN` and send `kill -TERM PID`. Use your chosen port if different. On Windows, identify the listening Node PID with `Get-NetTCPConnection -LocalPort 17863 -State Listen` in PowerShell and stop that process. The next MCP request starts the updated daemon. A graceful restart preserves scheduled sleep, while an interrupted active turn is not automatically replayed.

For manual Codex configuration use your own absolute paths (forward slashes also work in Windows TOML):

```toml
[mcp_servers.browser_bridge]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/project/server/mcp.js"]
startup_timeout_sec = 10
tool_timeout_sec = 900
required = true
# Optional, explicitly delegated browser actions only:
# default_tools_approval_mode = "approve"

[mcp_servers.browser_bridge.env]
BROWSER_BRIDGE_CONFIG = "/absolute/path/to/project/.local/connection.json"
```

The stdio MCP entry point is **server/mcp.js**, not server/daemon.js. See the [official MCP configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

| Symptom | Fix |
| --- | --- |
| No `browser_*` tools | Confirm registration, then reload MCP or start a new Codex session. |
| Extension disconnected | Start/check the bridge; import the matching file; disconnect the other browser. |
| URL constructor / internal page | Update to 0.5.0 and select the actual HTTP(S) website in chat. |
| Bridge and extension versions differ | Restart the daemon and reload the extension; rebuild Firefox's folder first. |
| Missing browser guard permission | Reload and accept the browser's extension-permission prompt. |
| Codex tool approval blocks execution | Authorize that tool in Codex, or explicitly select scoped delegation above. |
| Site / JavaScript consent pending | Decide in the extension UI; Codex approval does not replace site consent. |
| Update refuses local changes/divergence | Save/commit your changes and reconcile `main`; the updater will not discard them. |
| Cannot attach debugger | Close tab DevTools; keep the browser's debugger-control notification open. |
| Unavailable Firefox action | Use a supported DOM action; native input/CDP/upload/dialog/console/network are unavailable. |

For a browser on another machine, forward the bridge with an SSH tunnel, securely copy the connection file, and install the extension there. Automatic source updates on the Codex machine cannot replace files on a separate browser machine: transfer the updated browser package and reload it there. Upload file paths refer to the browser machine. Never share or commit the private connection file.
