import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

export async function createBroker({ port, token, commandTimeout = 45000 }) {
  let extension = null;
  let connectedAt = null;
  const pending = new Map();
  const sockets = new Set();
  const status = () => ({ service: 'codex-browser-bridge', version: '0.1.0', connected: extension?.readyState === WebSocket.OPEN, connectedAt, pending: pending.size });
  const rejectPending = (message) => { for (const item of pending.values()) item.reject(new Error(message)); pending.clear(); };
  const server = http.createServer(async (req, res) => {
    // No web-page callers, no CORS, and no DNS-rebinding hosts.
    if (req.headers.host !== `127.0.0.1:${server.address().port}` && req.headers.host !== `localhost:${server.address().port}`) return json(res, 403, { error: 'Invalid host' });
    if (req.headers.origin) return json(res, 403, { error: 'Browser origins are not allowed on the command endpoint' });
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { service: 'codex-browser-bridge', version: '0.1.0' });
    if (!equal(req.headers.authorization, `Bearer ${token}`)) return json(res, 401, { error: 'Unauthorized' });
    if (req.method === 'GET' && req.url === '/status') return json(res, 200, status());
    if (req.method !== 'POST' || req.url !== '/command') return json(res, 404, { error: 'Not found' });
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('Command exceeds 1 MiB'); chunks.push(chunk); }
      const command = JSON.parse(Buffer.concat(chunks).toString());
      if (typeof command.action !== 'string' || !command.args || typeof command.args !== 'object' || Array.isArray(command.args)) throw new Error('Invalid command');
      if (!extension || extension.readyState !== WebSocket.OPEN) return json(res, 503, { error: 'Browser extension is not connected. Load extension/ and import connection.json in its settings.' });
      if (pending.size >= 32) return json(res, 429, { error: 'Too many pending commands' });
      const id = randomUUID();
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out; its outcome is unknown. Inspect the page before retrying.')); }, commandTimeout);
        const cleanup = () => { clearTimeout(timer); pending.delete(id); };
        pending.set(id, { resolve: (value) => { cleanup(); resolve(value); }, reject: (error) => { cleanup(); reject(error); } });
        extension.send(JSON.stringify({ type: 'command', id, action: command.action, args: command.args, expiresAt: Date.now() + commandTimeout }), (error) => { if (error) pending.get(id)?.reject(error); });
      });
      json(res, 200, { result });
    } catch (error) { if (!res.destroyed) json(res, 400, { error: error.message }); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/extension' || !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin || '')) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    let authenticated = false;
    let lastSeen = Date.now();
    const authTimer = setTimeout(() => ws.close(1008, 'Authentication required'), 5000);
    const heartbeat = setInterval(() => { if (Date.now() - lastSeen > 65000) ws.terminate(); else ws.ping(); }, 20000);
    ws.on('pong', () => { lastSeen = Date.now(); });
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      lastSeen = Date.now();
      let message;
      try { message = JSON.parse(raw.toString()); } catch { ws.close(1008, 'Invalid JSON'); return; }
      if (!authenticated) {
        if (message.type !== 'hello' || !equal(message.token, token)) { ws.close(1008, 'Invalid key'); return; }
        if (extension?.readyState === WebSocket.OPEN) { ws.close(1008, 'A browser is already connected'); return; }
        authenticated = true; clearTimeout(authTimer); extension = ws; connectedAt = new Date().toISOString();
        ws.send(JSON.stringify({ type: 'ready', version: '0.1.0' }));
        return;
      }
      if (message.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
      if (message.type === 'result') {
        const item = pending.get(message.id);
        if (item) message.error ? item.reject(new Error(String(message.error))) : item.resolve(message.result);
      }
    });
    ws.on('close', () => {
      clearTimeout(authTimer); clearInterval(heartbeat); sockets.delete(ws);
      if (extension === ws) { extension = null; connectedAt = null; rejectPending('Browser disconnected; command outcome may be unknown.'); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { port: server.address().port, status, close: async () => { rejectPending('Bridge stopped'); for (const ws of sockets) ws.terminate(); await new Promise((resolve) => server.close(resolve)); wss.close(); } };
}
