import assert from 'node:assert/strict';
import { createServer } from 'node:http';
export async function policySmoke(call, step) {
  let protectedHits = 0;
  const sockets = new Set();
  const server = createServer((req, res) => {
    if (req.headers.host.startsWith('localhost:')) protectedHits++;
    if (req.url === '/redirect') { res.writeHead(302, { Location: `http://localhost:${server.address().port}/protected` }); res.end(); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(`<html><title>Policy fixture</title><a id="sensitive" href="http://localhost:${server.address().port}/protected">Private</a><input id="field"></html>`); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, protectedUrl = base.replace('127.0.0.1', 'localhost');
  const owned = [];
  try {
    await step('site access waits for extension UI consent before creating a tab', async () => {
      await call('policy', { action: 'protect', domain: 'localhost', mode: 'ask' });
      await assert.rejects(call('new_tab', { url: protectedUrl, active: false }), /ACCESS_APPROVAL_REQUIRED/);
      assert.equal(protectedHits, 0);
      const deadline = Date.now() + 10000;
      while (!(await call('policy', { action: 'inspect' })).grants.some(g => g.host === 'localhost') && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
      assert.ok((await call('policy', { action: 'inspect' })).grants.some(g => g.host === 'localhost'), 'production consent card did not grant access');
      const tab = await call('new_tab', { url: protectedUrl, active: false }); owned.push(tab.tabId); assert.ok(protectedHits > 0);
      await call('close_tab', { tabId: tab.tabId }); owned.pop();
    });
    const kept = await call('new_tab', { url: base, temporary: false, active: false }); owned.push(kept.tabId);
    const temporary = await call('new_tab', { url: base, active: false }); owned.push(temporary.tabId);
    await step('group release keeps tabs; temporary cleanup preserves a kept tab', async () => {
      await call('workspace', { action: 'merge' }); await call('workspace', { action: 'collapse' });
      await call('workspace', { action: 'release_all' });
      const tabs = await call('tabs'); assert.ok(tabs.some(t => t.tabId === kept.tabId)); assert.ok(tabs.some(t => t.tabId === temporary.tabId));
      const result = await call('workspace', { action: 'cleanup' }); assert.ok(result.closed.includes(temporary.tabId)); assert.ok(!result.closed.includes(kept.tabId));
      assert.ok((await call('tabs')).some(t => t.tabId === kept.tabId));
    });
    await step('deny rules stop direct navigation, named API and link clicks', async () => {
      await call('policy', { action: 'protect', domain: 'localhost', mode: 'deny' });
      await assert.rejects(call('new_tab', { url: protectedUrl }), /ACCESS_DENIED/);
      await assert.rejects(call('navigate', { tabId: kept.tabId, url: protectedUrl }), /ACCESS_DENIED/);
      await assert.rejects(call('extension_command', { command: 'invoke', method: 'tabs.update', arguments: [kept.tabId, { url: protectedUrl }] }), /ACCESS_DENIED/);
      await assert.rejects(call('click', { tabId: kept.tabId, selector: '#sensitive' }), /ACCESS_DENIED/);
      await assert.rejects(call('policy', { action: 'protect', domain: 'localhost', mode: 'ask' }), /cannot weaken/);
    });
    await step('network guard blocks an HTTP redirect before protected server receives it', async () => {
      const before = protectedHits;
      try { await call('navigate', { tabId: kept.tabId, url: base + '/redirect' }); } catch (error) { assert.match(error.message, /ACCESS_DENIED|ERR_BLOCKED|Navigation/); }
      await new Promise(r => setTimeout(r, 300)); assert.equal(protectedHits, before);
    });
  } finally {
    await call('workspace', { action: 'release_all' }).catch(() => {});
    for (const tabId of owned) await call('close_tab', { tabId }).catch(() => {});
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}
