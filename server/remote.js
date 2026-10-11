// Optional TLS WebSocket gateway. Local HTTP/MCP endpoints remain loopback-only.
import https from 'node:https';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { readConfig } from './config.js';
export async function createRemoteGateway({ key, cert, bridgePort, port = 17864, host = '0.0.0.0' }) {
  const server = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, (_req, res) => { res.writeHead(404); res.end(); });
  const sockets = new Set();
  server.on('upgrade', (req, socket, head) => {
    if (sockets.size >= 128 || req.url !== '/extension' || req.method !== 'GET' || !/^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[a-f0-9-]{36})$/.test(req.headers.origin || '')) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const upstream = net.connect({ host: '127.0.0.1', port: bridgePort }); sockets.add(socket); sockets.add(upstream);
    socket.setTimeout(70000, () => socket.destroy()); upstream.setTimeout(70000, () => upstream.destroy());
    const close = () => { socket.destroy(); upstream.destroy(); sockets.delete(socket); sockets.delete(upstream); };
    socket.on('error', close); upstream.on('error', close); socket.on('close', close); upstream.on('close', close);
    upstream.once('connect', () => {
      let headers = `GET /extension HTTP/1.1\r\nHost: 127.0.0.1:${bridgePort}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n`;
      for (const name of ['origin', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions']) if (req.headers[name]) headers += `${name}: ${req.headers[name]}\r\n`;
      upstream.write(headers + '\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream).pipe(socket);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { port: server.address().port, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1]?.endsWith('/server/remote.js')) {
  try {
    if (!process.env.BRIDGE_TLS_KEY || !process.env.BRIDGE_TLS_CERT) throw new Error('Set BRIDGE_TLS_KEY and BRIDGE_TLS_CERT to trusted TLS certificate files');
    const config = await readConfig(); const gateway = await createRemoteGateway({ key: await readFile(process.env.BRIDGE_TLS_KEY), cert: await readFile(process.env.BRIDGE_TLS_CERT), bridgePort: config.port, port: Number(process.env.BRIDGE_REMOTE_PORT || 17864), host: process.env.BRIDGE_REMOTE_HOST || '0.0.0.0' });
    console.error(`TLS extension gateway listening on port ${gateway.port}. HTTP commands remain local.`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await gateway.close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
