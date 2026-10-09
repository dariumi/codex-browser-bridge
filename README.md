# Codex Browser Bridge

<img src="extension/assets/avatar-128.png" width="96" alt="Codex Browser Bridge avatar">

[Русская документация](README.ru.md)

A local MCP server and Chromium/Firefox extensions that let Codex work with tabs in **your regular browser**, including signed-in sessions. Chromium uses `chrome.debugger`; Firefox uses a separate DOM backend. No remote debugging port is needed for your browser profile.

**Responsibility notice:** an agent can change data and perform actions using your signed-in accounts. You are responsible for the tasks you authorize and for reviewing their results. The project is provided without warranties; to the extent permitted by applicable law, its authors and contributors accept no liability for agent actions or their consequences. See [Disclaimer](DISCLAIMER.md) and [MIT License](LICENSE).

## What's new in 0.4.0

- Persistent domain restrictions: ask before access, or block completely. Common mail, banking, payments, government services, messaging, personal files and password-manager domains require consent by default.
- Permission cards in the chat, popup and settings. Only the user can approve them; MCP can inspect, request or strengthen restrictions. Autonomous tasks pause while waiting and resume after consent. Refusal stops the task with a blocked result.
- One Codex working group per browser window, buttons to merge, collapse or dissolve the group while keeping its tabs open.
- Automatic cleanup of agent-created temporary tabs, with a **Keep** button. Existing user tabs, the main task tab, pinned tabs and manually regrouped tabs are preserved.

Previous releases added Firefox, model and quota cards, an animated activity display, page-launched chat, task handoff, a project avatar and extension development mode.

## Install

Requires Node.js 22+, Codex CLI signed in with `codex login`, and Chromium 120+ or Firefox Desktop 142+.

```bash
npm ci
npm run setup
```

Setup creates a private key in `.local/connection.json`, registers `browser_bridge` with Codex and starts the loopback bridge on `127.0.0.1:17863`. The key is not printed. `.local/`, logs, screenshots and packages are excluded from Git. Setup is repeatable and retains the key.

### Chromium, Brave and Edge

1. Open `chrome://extensions`, `brave://extensions` or `edge://extensions` and enable Developer mode.
2. Load the unpacked `extension` folder.
3. Open the extension's settings and import `.local/connection.json`. On Linux, Ctrl+H shows hidden folders in the file picker.
4. Wait for **Connected**. Restart the MCP client or Codex session to discover `browser_*` tools.

### Firefox

```bash
npm run package
```

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Import `.local/connection.json` in the add-on's settings. The page launcher and popup open the Firefox sidebar.

Temporary add-ons must be loaded again after restarting Firefox. Permanent installation requires Mozilla signing; this project does not currently distribute a signed XPI. One bridge connects one browser at a time: disconnect the other browser's extension before switching.

### Updating

Reload the extension after updating its files. Accept the new browser permissions if prompted, and verify version **0.4.0**. The connection key and saved access rules are retained. Restart the local bridge to load server changes, and restart the Codex MCP client to discover new tools. For Firefox, rebuild and reload the add-on from `dist/firefox`.

Verify your setup:

```bash
codex mcp get browser_bridge
npm run status
```

Use `npm run setup -- --no-codex` to configure the bridge without registering Codex, or `--port 17865` for a different port on first setup. Existing configuration is not overwritten. `BROWSER_BRIDGE_CONFIG` selects another configuration file. To change an existing port, stop the bridge, edit both `port` and `url`, and import the file again.

Manual Codex configuration uses absolute paths:

```toml
[mcp_servers.browser_bridge]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/project/server/mcp.js"]
startup_timeout_sec = 10
tool_timeout_sec = 240

[mcp_servers.browser_bridge.env]
BROWSER_BRIDGE_CONFIG = "/absolute/path/to/project/.local/connection.json"
```

Setup uses the actual absolute Node executable path. See [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Access rules and consent

Settings include a domain rule editor. Rules apply to the domain and its subdomains, match host names rather than text in URLs, and persist across browser restarts. **Ask** requires approval; **Block** prevents access until you change the rule in settings. Removing a rule restores ordinary access unless a parent-domain rule still applies.

In extension chat you can write **«Сюда без моего разрешения не ходи»** for the selected tab, or **«Не открывай example.com без разрешения»**. Short recognized restriction commands are saved directly without starting an agent. More complex instructions can be handled by Codex using `browser_policy` → `protect`.

Protected tabs have their titles and URLs hidden from MCP tab listings until approved. Before a protected read, action or navigation, the extension shows the destination, reason and permission kind. Choose **Allow** or **Deny** in its own interface. Site content cannot issue decisions; MCP has no approval operation. External Codex conversations receive an approval-required error and must wait; the built-in chat also pauses its autonomous task automatically.

An approval applies to the **exact host**, not all subdomains, for at most **15 minutes**. Approvals issued during a chat task belong to that task; approvals issued outside a task belong to the current manual browser-control session. Task grants are revoked at completion; disconnecting or releasing all work revokes grants and pending requests. A declined request is not asked repeatedly in the same scope. Editing a domain rule revokes its prior grants.

`browser_evaluate` and raw `browser_cdp` require an additional **JavaScript / CDP** approval, even on ordinary sites. This consent does not remove domain restrictions. Raw CDP is restricted to an allowlist; arbitrary target creation and unrestricted extension code execution are disabled. Named extension navigation APIs use the same access checks.

The extension installs session network rules on controlled tabs before navigation, blocking protected top-level requests, frames and common resource requests, including HTTP redirects. These rules are removed when control is released; they do not restrict your ordinary browsing in unrelated tabs. Chromium and Firefox require the new `declarativeNetRequestWithHostAccess` and `webNavigation` permissions for this feature.

**Limits:** this is an access guard, not a complete browser or operating-system sandbox. The default domain list is not exhaustive. Already loaded data, cached content, arbitrary page scripts, service workers, popup-creation timing and approved JavaScript/CDP actions have limits beyond this mechanism. A site approval authorizes access, not a separate confirmation for every purchase, message, deletion or other action; describe those boundaries in your task. Local source changes and development mode can change the guard itself, so review such changes. See [Responsibility notice](DISCLAIMER.md).

## Chat and autonomous tasks

The **Chat Codex** button on HTTP(S) pages opens the extension panel. Chat uses your local [Codex app-server](https://learn.chatgpt.com/docs/app-server) and existing Codex login/configuration; no separate API key is required. It is a separate conversation, not an existing desktop-client thread.

1. Open the page and launch chat.
2. Check the selected target tab.
3. Describe the task, for example: “Complete every stage of this test and report the results.”
4. Enable handoff until completion if needed, and send the task.

The target is bound to `tabId`; switching tabs yourself does not move the task. A new message while running steers the current task. You can stop it, follow its plan, read messages and inspect action progress. One chat task runs at a time. History is stored locally in `.local/tasks.json`; a new task for the same tab and mode resumes its previous conversation. After a bridge restart, incomplete tasks are marked interrupted and do not resume automatically.

Handoff uses a [Codex thread goal](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal), continuing until verified completion, a real blocker, user cancellation or the **30-minute / 20-turn** limit. Waiting for access consent is shown separately. Browser notifications report the result; failures and blocked tasks are not reported as success.

The model card reports the configured model before a task, and the resolved or rerouted model while running. Quotas come from `account/rateLimits/read` and updates: remaining percentages and reset times are shown for each available window, without guessing request counts. Unavailable quota data is explicitly marked. The avatar and progress display animate only during work and respect reduced-motion preferences.

## Groups and temporary tabs

Working tabs share one purple **Codex** group per window, an `AI` badge and a page indicator. Group controls merge work tabs, collapse the group, dissolve the work group without closing tabs, or clean up temporary tabs. Existing original groups are restored where possible; manual regrouping is respected.

Tabs created by `browser_new_tab` are temporary by default. Pass `temporary: false`, use `browser_workspace` → `keep`, or click **Keep** in chat to preserve a result tab. Cleanup only closes tabs recorded as created by this extension, excluding the main task tab, pinned tabs and manually regrouped tabs. Finishing a task cleans its temporary tabs and releases its work markers. Firefox uses native groups when its APIs are available, otherwise the badge and page indicator remain available.

## Extension development mode

Choose extension development mode in chat to ask Codex to update this project. The bridge saves a checkpoint, validates source syntax/manifests and tests, and can apply a reload/restart after the task finishes. `browser_development` also exposes inspection, validation, application and rollback. Browser tasks use a read-only local-files sandbox; development tasks allow writes to the project workspace.

New abilities are added as source handlers and applied by reloading. MCP cannot run arbitrary JavaScript inside the extension. `browser_extension_command` exposes only named, allowlisted browser APIs. Connection keys, browser storage and arbitrary script injection are not exposed through that API.

## MCP tools

32 tools:

| Purpose | Tools |
| --- | --- |
| Connection and tabs | `browser_status`, `browser_tabs`, `browser_new_tab`, `browser_activate_tab`, `browser_close_tab` |
| Navigation | `browser_navigate`, `browser_history` |
| Observation | `browser_screenshot`, `browser_snapshot` |
| Mouse | `browser_click`, `browser_hover`, `browser_drag`, `browser_mouse`, `browser_scroll` |
| Forms and keyboard | `browser_fill`, `browser_type`, `browser_press_key`, `browser_select`, `browser_upload` |
| Waiting and dialogs | `browser_wait`, `browser_dialog` |
| Diagnostics | `browser_evaluate`, `browser_console`, `browser_network`, `browser_downloads` |
| Advanced actions | `browser_cdp`, `browser_detach` |
| Policy, chat and development | `browser_policy`, `browser_workspace`, `browser_task`, `browser_extension_command`, `browser_development` |

Recommended flow: status → tabs → explicit `tabId` → snapshot/screenshot → action → verification. Never work around an approval-required or denied result.

Screenshots return MCP image content plus viewport size, pixel ratio and scroll position. Clicks use viewport CSS pixels: divide screenshot coordinates by `devicePixelRatio`, and subtract scroll offsets for full-page screenshots. Full-page images are limited to 32 million pixels.

Chromium snapshots provide accessibility roles, names and refs such as `b42`; Firefox provides DOM roles and refs. References must be refreshed after navigation. Text/password field values are excluded from snapshots; page text and accessible names remain visible. CSS selectors must match exactly one element and support open shadow roots. High-level selectors do not automatically address iframe contents.

| Capability | Chromium | Firefox |
| --- | --- | --- |
| Chat, tasks, model and quotas, access rules | Yes | Yes |
| Tabs, forms, keyboard, scrolling | Yes | Yes |
| Drag | Trusted events | DOM events |
| Screenshot | Viewport/full page | Tab viewport |
| Page JavaScript | CDP | MAIN execution world |
| Tab groups | Yes | When APIs are available |
| Trusted input, native dialogs, uploads, console/network, raw CDP | Yes | Unavailable |

Firefox synthetic events have `isTrusted=false` and may be rejected by some sites. Unsupported operations return explicit errors. Chromium console/network collection begins at debugger attachment and retains up to 300 events per kind; request bodies and cookies are not collected automatically. File upload uses absolute paths on the browser's machine. Neither backend controls OS dialogs, browser menus or the address bar.

## Testing and packages

```bash
npm run check
npm test
npm run package
npm run lint:firefox
```

Unit/protocol tests cover real stdio MCP transport, schemas, image output, authentication, origins/Host, timeouts, serial actions, modal dialogs, access policy, consent pause/resume and safe cleanup. Browser tests run real automation:

```bash
npm run test:isolated    # Temporary Chromium profile; set CHROMIUM_BIN if needed
npm run test:firefox     # Temporary Firefox profile; set FIREFOX_BIN if needed
```

The isolated suites use separate ports, keys and temporary add-ons. They simulate user consent only for local fixtures, exercise the production permission UI, and verify that blocked redirects never reach the protected test server. They do not grant permissions in your installed extension.

`npm run test:browser` tests the installed Chromium extension and needs your JavaScript/CDP consent for the local fixture. `npm run test:handoff` starts a real Codex task using your login and model, and needs the corresponding local diagnostic consent for verification. These tests create their own fixture tabs and close them afterward. `npm run fixture` starts the page for manual testing. Results/screenshots are stored under `.local/`; inspect images with the built-in image viewer. CI runs checks, unit tests, packaging and Firefox lint on Node 22 and 24.

Packages are `dist/codex-browser-bridge-extension.zip` and `dist/codex-browser-bridge-firefox.zip`; install the MCP server separately from this repository. Connection keys and test artifacts are never packaged.

## Connection and troubleshooting

```text
Codex → MCP / stdio → server/mcp.js
                           ↓ authenticated loopback HTTP
                      server/daemon.js
                           ↓ authenticated WebSocket
                      browser extension → controlled tabs
```

The bridge starts automatically on the first MCP request and survives individual client sessions. Browser gestures are serialized; modal-dialog handling can bypass the queue to unblock an action. Expired queued commands do not start. Disconnecting releases debugging, work groups and access grants and cancels unstarted commands. An action already in progress may have changed the page: inspect before retrying after a timeout or disconnect.

Use `npm run bridge` for foreground operation. To stop an existing bridge, find its PID with `lsof -iTCP:17863 -sTCP:LISTEN` and send `SIGTERM`. The next MCP request starts it again. Logs are in `.local/bridge.log`.

- **No connection:** run `npm run status`, check the imported key/port, and disconnect any other extension using this bridge.
- **No tools:** check `codex mcp get browser_bridge` and restart the MCP client.
- **Cannot attach:** close the tab's DevTools. Dismissing Chromium's debugger-control notification can detach automation.
- **Approval required:** open extension chat, popup or settings and decide the pending request. Never bypass it with another tool.
- **Access guard unavailable:** reload the updated extension and accept its new browser permissions.
- **Internal pages:** `chrome://`, extension stores and other restricted browser pages are unavailable; use HTTP(S).
- **Stale element:** refresh the snapshot or screenshot.
- **Secrets:** never publish `.local/connection.json`. Anyone with its key and access to the bridge can control the connected browser, subject to extension policy. Website origins are rejected, HTTP Host is validated, and authentication is mandatory.

For a browser on another machine, forward the bridge from that machine with `ssh -N -L 17863:127.0.0.1:17863 user@codex-host`, securely transfer the connection file and ensure upload files exist there. Installed-browser smoke tests also need port 17864 forwarded.
