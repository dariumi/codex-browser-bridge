import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticURL } from '../extension/diagnostics-target.js';
import { serveLab } from '../server/lab-assets.js';
import { closeChat } from '../extension/platform.js';

test('closing the chat invokes Firefox synchronously and leaves the tested page open', async () => {
  const calls = [], api = { sidebarAction: { close: () => { calls.push('close'); return Promise.resolve(); } }, tabs: { remove: id => { calls.push(id); } } };
  const closing = closeChat({ tabId: 20, windowId: 2 }, api); calls.push('after'); await closing; assert.deepEqual(calls, ['close', 'after']);
  await closeChat({ pageTabId: 7, tabId: 20 }, api); assert.equal(calls.at(-1), 7); assert.ok(!calls.includes(20));
});
test('Chromium global-panel fallback handles newer tab-specific close semantics without disabling the panel', async () => {
  const calls = [], api = { sidePanel: { close: async options => { calls.push(options); if (options.tabId) throw new Error('Global panel open'); } } };
  await closeChat({ tabId: 20, windowId: 2 }, api); assert.deepEqual(calls, [{ tabId: 20 }, { windowId: 2 }]);
  await assert.rejects(closeChat({}, {}), /штатной кнопкой/);
});
test('diagnostics only opens the dedicated loopback fixture without credentials or redirected destinations', () => {
  assert.equal(diagnosticURL('http://127.0.0.1:17863/complex'), 'http://127.0.0.1:17863/complex');
  assert.equal(diagnosticURL('http://localhost:17864/complex.html'), 'http://localhost:17864/complex.html');
  for (const url of ['https://public.invalid/complex', 'http://localhost.evil.invalid/complex', 'http://user:pass@localhost/complex', 'http://localhost/command', 'http://localhost/complex?redirect=foo', 'http://localhost/complex#foo', 'file:///complex']) assert.throws(() => diagnosticURL(url));
});
test('public lab routes expose only allowlisted synthetic assets, never commands or local files', async () => {
  for (const url of ['/complex', '/lab.js', '/complex-frame.html']) {
    let response; const res = { writeHead: (status, headers) => { response = { status, headers }; }, end: body => { response.body = body.toString(); } };
    assert.equal(await serveLab({ method: 'GET', url }, res), true); assert.equal(response.status, 200);
    assert.match(response.headers['Content-Security-Policy'], /script-src 'self'/); assert.match(response.headers['Content-Security-Policy'], /object-src 'none'/);
    assert.ok(response.body.length > 100); assert.doesNotMatch(response.body, /connection\.json|Bearer /);
  }
  for (const url of ['/command', '/status', '/.local/connection.json', '/../server/config.js', '/%2e%2e/server/config.js', '/complex?path=foo']) assert.equal(await serveLab({ method: 'GET', url }, {}), false);
  assert.equal(await serveLab({ method: 'POST', url: '/complex' }, {}), false);
});
