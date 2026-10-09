import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createBroker } from '../server/broker.js';

const token = 'a'.repeat(64);
const origin = `chrome-extension://${'a'.repeat(32)}`;
async function context(t, options = {}) {
  const broker = await createBroker({ port: 0, token, ...options });
  t.after(() => broker.close());
  const base = `http://127.0.0.1:${broker.port}`;
  const request = (route, body, headers = {}) => fetch(base + route, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...headers }, body: body ? JSON.stringify(body) : undefined
  });
  const connect = async (key = token) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/extension', { origin });
    await once(ws, 'open');
    const next = once(ws, 'message'); ws.send(JSON.stringify({ type: 'hello', token: key }));
    if (key === token) await next;
    else { next.catch(() => {}); }
    return ws;
  };
  return { broker, base, request, connect };
}

test('authenticated status and disconnected-browser errors', async (t) => {
  const { request } = await context(t);
  assert.equal((await (await request('/status')).json()).connected, false);
  const response = await request('/command', { action: 'tabs', args: {} });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not connected/);
});
test('rejects invalid credentials, web origins, and DNS rebinding', async (t) => {
  const { request, base } = await context(t);
  assert.equal((await request('/status', null, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await request('/command', { action: 'tabs', args: {} }, { Origin: 'https://evil.example' })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    const req = http.get(base + '/status', { headers: { Host: 'evil.example', Authorization: `Bearer ${token}` } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(reboundStatus, 403);
});
test('WebSocket rejects regular website origins', async (t) => {
  const { base } = await context(t);
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/extension', { origin: 'https://evil.example' });
  const [error] = await once(ws, 'error');
  assert.match(error.message, /403/);
});
test('extension requires correct key and one connected browser', async (t) => {
  const { connect, base, request } = await context(t);
  const bad = new WebSocket(base.replace('http:', 'ws:') + '/extension', { origin });
  await once(bad, 'open');
  const closed = once(bad, 'close'); bad.send(JSON.stringify({ type: 'hello', token: 'bad' }));
  assert.equal((await closed)[0], 1008);
  const good = await connect();
  assert.equal((await (await request('/status')).json()).connected, true);
  const second = new WebSocket(base.replace('http:', 'ws:') + '/extension', { origin });
  await once(second, 'open'); const secondClosed = once(second, 'close'); second.send(JSON.stringify({ type: 'hello', token }));
  assert.equal((await secondClosed)[0], 1008);
  good.close();
});
test('correlates concurrent command results and surfaces browser errors', async (t) => {
  const { connect, request } = await context(t);
  const ws = await connect();
  const commands = [];
  ws.on('message', (raw) => {
    const command = JSON.parse(raw);
    if (command.type !== 'command') return;
    commands.push(command);
    if (commands.length === 2) {
      assert.ok(command.expiresAt > Date.now());
      ws.send(JSON.stringify({ type: 'result', id: commands[1].id, result: { answer: 2 } }));
      ws.send(JSON.stringify({ type: 'result', id: commands[0].id, error: 'No matching element' }));
    }
  });
  const [first, second] = await Promise.all([
    request('/command', { action: 'click', args: {} }), request('/command', { action: 'tabs', args: {} })
  ]);
  assert.equal(first.status, 400);
  assert.equal((await first.json()).error, 'No matching element');
  assert.deepEqual((await second.json()).result, { answer: 2 });
});
test('disconnect rejects in-flight commands without waiting for timeout', async (t) => {
  const { connect, request } = await context(t);
  const ws = await connect();
  ws.on('message', () => ws.close());
  const response = await request('/command', { action: 'click', args: {} });
  assert.match((await response.json()).error, /disconnected/);
});
test('timeout cleans pending requests and warns about uncertain outcome', async (t) => {
  const { connect, request, broker } = await context(t, { commandTimeout: 30 });
  await connect();
  const response = await request('/command', { action: 'click', args: {} });
  assert.match((await response.json()).error, /outcome is unknown/);
  assert.equal(broker.status().pending, 0);
});
test('Firefox extension origin authenticates and exposes its actual backend capabilities', async (t) => {
  const { base, broker } = await context(t);
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/extension', { origin: 'moz-extension://12345678-1234-1234-1234-123456789abc' });
  await once(ws, 'open'); const ready = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'hello', token, version: '0.3.0', browser: 'firefox', capabilities: { trustedInput: false, backend: 'dom' } }));
  await ready; assert.equal(broker.status().browser, 'firefox'); assert.equal(broker.status().capabilities.trustedInput, false);
  ws.close();
});
