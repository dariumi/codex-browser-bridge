import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserWorkspace } from '../extension/workspace.js';
import { extensionCommand } from '../extension/commands.js';

function fixture(original = 8) {
  let tab = { id: 2, windowId: 1, groupId: original }, saved = [], restored;
  const api = {
    storage: { session: { get: async () => ({ workTabs: [] }), set: async (data) => { saved = data.workTabs; } } },
    tabs: { get: async () => ({ ...tab }), group: async (args) => { restored = args; tab.groupId = args.groupId ?? 90; return tab.groupId; }, ungroup: async () => { tab.groupId = -1; }, sendMessage: async () => {} },
    tabGroups: { update: async () => {}, get: async () => ({ id: 8 }) },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} }
  };
  return { api, workspace: new BrowserWorkspace(api), get saved() { return saved; }, get restored() { return restored; }, tab };
}
test('working tab is grouped once and its original group restored', async () => {
  const f = fixture();
  await f.workspace.mark(2, 'Task'); await f.workspace.mark(2);
  assert.equal(f.saved[0].originalGroupId, 8); assert.equal(f.tab.groupId, 90);
  assert.equal(f.workspace.work.get(2).label, 'Task');
  await f.workspace.release(2); assert.equal(f.restored.groupId, 8); assert.equal(f.saved.length, 0);
});
test('release respects regrouping done by the user', async () => {
  const f = fixture(-1); await f.workspace.mark(2); f.tab.groupId = 77;
  await f.workspace.release(2); assert.equal(f.tab.groupId, 77);
});
test('extension API commands reject token access and remote code', async () => {
  const api = { runtime: { id: 'test', getManifest: () => ({ version: '0.2.0' }) }, tabs: { query: async (options) => [{ id: options.id }] } };
  const info = await extensionCommand(api, { command: 'capabilities' }); assert.ok(info.methods.includes('tabs.query'));
  assert.deepEqual(await extensionCommand(api, { command: 'invoke', method: 'tabs.query', arguments: [{ id: 7 }] }), [{ id: 7 }]);
  await assert.rejects(extensionCommand(api, { command: 'invoke', method: 'storage.local.get', arguments: ['token'] }), /Unsupported/);
  await assert.rejects(extensionCommand(api, { command: 'eval', code: 'chrome.runtime.reload()' }), /Unsupported/);
});
