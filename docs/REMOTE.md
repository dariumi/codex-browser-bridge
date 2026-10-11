# Remote Codex, local browser

Codex and its MCP/bridge run on the server. Only the extension and optional native device host run on the browser computer. Browser commands, screenshots, page audio and task text are transmitted to the configured server. Site approvals remain in the user's extension; the server cannot approve them.

## SSH tunnel (simplest)

1. Install/login/register the bridge on the server using [INSTALL.md](INSTALL.md). Start `npm run bridge` there.
2. On the browser computer run `ssh -N -L 17863:127.0.0.1:17863 USER@SERVER`.
3. Load the locally copied extension and import the server's connection file privately. Its URL remains `ws://127.0.0.1:17863/extension`. Do not publish the connection key.
4. Keep SSH running, open the target page, and check connection/`npm run doctor` on the server. Start a task from browser chat or server Codex.

## Direct TLS connection

On the server, obtain a certificate trusted by the browser for your DNS hostname. Start the bridge, then:

```sh
BRIDGE_TLS_KEY=/private/path/key.pem BRIDGE_TLS_CERT=/private/path/fullchain.pem npm run remote
```

The gateway listens on port 17864 (override `BRIDGE_REMOTE_PORT` and optionally `BRIDGE_REMOTE_HOST`). Expose only this TLS port through your firewall. In extension settings enter `wss://YOUR_HOST:17864/extension` and the matching bridge key. Unencrypted remote `ws://` is rejected. A self-signed certificate requires installing its trust on the browser computer; certificate validation is never disabled.

The gateway forwards only extension WebSocket handshakes to the existing loopback broker. `/command` is not exposed. Extension-origin validation and key authentication stay enforced by the broker. One browser connects to one bridge at a time. Run the gateway and bridge as supervised services for persistent use; renew certificates and restart the gateway after renewal. A separate bridge checkout/key/port is needed for each independently controlled browser.

Automatic updates rebuild files on the server. Copy updated extension files to the browser computer and reload it. Virtual devices must be installed on the browser computer, not the cloud server.
