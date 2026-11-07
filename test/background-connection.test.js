import { test } from 'node:test';
import assert from 'node:assert/strict';

test('background recovers stalled sockets, retries contention, blocks wrong keys and supports explicit reconnect', async t => {
  const saved = new Map(), replace = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  let now = 1000000; const originalNow = Date.now; Date.now = () => now;
  const timers = [], noop = async () => {}, listeners = {}, sockets = [];
  const event = name => ({ addListener: fn => { listeners[name] = fn; } });
  replace('setTimeout', (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; });
  replace('clearTimeout', timer => { if (timer) timer.cancelled = true; });
  replace('setInterval', () => ({})); replace('clearInterval', () => {});
  const id = 'b'.repeat(32), base = `chrome-extension://${id}/`;
  class Socket {
    static OPEN = 1; readyState = 0;
    constructor() { sockets.push(this); }
    send(text) { const message = JSON.parse(text); if (message.type === 'ui_request') queueMicrotask(() => this.onmessage({ data: JSON.stringify({ type: 'ui_result', id: message.id, result: { tasks: [], activeTaskId: null } }) })); }
    close() { this.reject(1000, ''); }
    reject(code, reason) { this.readyState = 3; this.onclose?.({ code, reason }); }
    async ready() { this.readyState = 1; this.onopen(); await this.onmessage({ data: JSON.stringify({ type: 'ready', version: '0.8.1' }) }); }
  }
  replace('WebSocket', Socket);
  replace('chrome', {
    runtime: { id, getURL: name => base + name, getManifest: () => ({ version: '0.8.1' }), onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup'), sendMessage: noop },
    storage: { local: { get: async () => ({ enabled: true, url: 'ws://127.0.0.1:17863/extension', token: 'b'.repeat(64) }) }, session: { get: async () => ({}), set: noop } },
    tabs: { onRemoved: event('removed'), onUpdated: event('updated'), query: async () => [], get: async id => ({ id, url: 'https://example.invalid' }), sendMessage: noop },
    debugger: { onDetach: event('detach'), onEvent: event('debugger'), getTargets: async () => [] },
    action: { setBadgeText: noop, setBadgeBackgroundColor: noop }, alarms: { create: noop, onAlarm: event('alarm') }, notifications: { onClicked: event('notification') }
  });
  t.after(() => { Date.now = originalNow; for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const send = message => new Promise(resolve => listeners.message(message, { id, url: base + 'options.html' }, resolve));
  const retry = async ms => { const timer = timers.findLast(item => item.ms === ms && !item.cancelled); assert.ok(timer); timer.cancelled = true; timer.fn(); await settle(); };
  await import('../extension/background.js'); await settle(); assert.equal(sockets.length, 1);
  const stale = sockets[0]; now += 16000; listeners.alarm({ name: 'reconnect' }); await settle(); await retry(3000); assert.equal(sockets.length, 2);
  await stale.onmessage({ data: JSON.stringify({ type: 'ready', version: 'stale' }) }); assert.equal((await send({ type: 'status' })).connected, false);
  await sockets[1].ready(); assert.equal((await send({ type: 'status' })).connected, true);
  sockets[1].reject(1008, 'A browser is already connected'); await settle(); await retry(10000); assert.equal(sockets.length, 3);
  sockets[2].reject(1008, 'Invalid key'); await settle(); listeners.alarm({ name: 'reconnect' }); await settle(); assert.equal(sockets.length, 3);
  assert.equal((await send({ type: 'reconnect' })).ok, true); assert.equal(sockets.length, 4);
  await sockets[3].ready(); const status = await send({ type: 'status' }); assert.equal(status.connected, true); assert.equal(status.bridgeVersion, '0.8.1');
});
