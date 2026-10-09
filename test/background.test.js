import { test } from 'node:test';
import assert from 'node:assert/strict';

test('content scripts cannot submit tasks or read extension status; launcher only opens chat', async (t) => {
  const listeners = {}, noop = async () => {}, event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  let opened;
  const id = 'a'.repeat(32), url = `chrome-extension://${id}/`;
  globalThis.chrome = {
    runtime: { id, getURL: (path) => url + path, getManifest: () => ({ version: '0.2.0' }), onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup'), sendMessage: noop },
    storage: { session: { get: async () => ({}), set: noop }, local: { get: async () => ({ enabled: false }) } },
    tabs: { onRemoved: event('removed'), sendMessage: noop },
    debugger: { onDetach: event('detached'), onEvent: event('debuggerEvent'), getTargets: async () => [] },
    action: { setBadgeText: noop, setBadgeBackgroundColor: noop },
    alarms: { onAlarm: event('alarm') }, notifications: { onClicked: event('notification') },
    sidePanel: { open: async ({ tabId }) => { opened = tabId; } }
  };
  t.after(() => { delete globalThis.chrome; });
  await import('../extension/background.js');
  const send = (message, sender) => new Promise((resolve) => { listeners.message(message, sender, resolve); });
  const content = { id, url: 'https://example.com', tab: { id: 9 } };
  assert.equal((await send({ type: 'chat_start', text: 'untrusted task' }, content)).error, 'Extension UI only');
  assert.equal((await send({ type: 'status' }, content)).error, 'Extension UI only');
  assert.equal((await send({ type: 'policy_decide', id: 'forged', allowed: true }, content)).error, 'Extension UI only');
  assert.equal((await send({ type: 'policy_set', domain: 'bank.example', mode: 'allow' }, content)).error, 'Extension UI only');
  assert.equal((await send({ type: 'open_chat' }, content)).ok, true); assert.equal(opened, 9);
  const status = await send({ type: 'status' }, { id, url: url + 'chat.html' });
  assert.equal(status.version, '0.2.0'); assert.equal(status.enabled, false);
});
