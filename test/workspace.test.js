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

function multiFixture() {
  const tabs = new Map(Array.from({ length: 7 }, (_, n) => [n + 1, { id: n + 1, windowId: 1, groupId: -1 }]));
  const groups = new Map(); let nextGroup = 90;
  const api = {
    storage: { session: { get: async () => ({}), set: async () => {} } },
    tabs: { get: async id => { if (!tabs.has(id)) throw Error('closed'); return { ...tabs.get(id) }; },
      group: async ({ tabIds, groupId }) => { groupId ??= nextGroup++; groups.set(groupId, groups.get(groupId) || {}); for (const id of tabIds) tabs.get(id).groupId = groupId; return groupId; },
      ungroup: async ids => { for (const id of ids) tabs.get(id).groupId = -1; }, remove: async id => tabs.delete(id), sendMessage: async () => {} },
    tabGroups: { get: async id => { if (!groups.has(id)) throw Error('missing'); return groups.get(id); }, update: async (id, value) => Object.assign(groups.get(id), value) },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} }
  };
  return { tabs, groups, workspace: new BrowserWorkspace(api, { owner: () => 'task', target: () => 1 }) };
}
test('working tabs share a group; collapsing and dissolving it preserves every tab', async () => {
  const f = multiFixture(); await f.workspace.mark(1); await f.workspace.mark(2);
  assert.equal(f.tabs.get(1).groupId, f.tabs.get(2).groupId);
  await f.workspace.merge(); await f.workspace.collapse(); assert.equal(f.groups.get(f.tabs.get(1).groupId).collapsed, true);
  await f.workspace.releaseAll(); assert.equal(f.tabs.size, 7); assert.equal(f.tabs.get(1).groupId, -1); assert.equal(f.tabs.get(2).groupId, -1);
});
test('cleanup closes only agent-created temporary tabs and preserves targets, kept, pinned and regrouped tabs', async () => {
  const f = multiFixture(); await f.workspace.mark(1); await f.workspace.mark(7);
  for (const id of [2, 3, 4, 5, 6]) await f.workspace.register(id);
  await f.workspace.keep(3); f.tabs.get(4).pinned = true; f.tabs.get(5).groupId = 555;
  f.workspace.created.get(6).owner = 'other-task';
  const result = await f.workspace.finish('task', 1);
  assert.deepEqual(result.closed, [2]); assert.deepEqual(result.kept, [4, 5]);
  assert.deepEqual([...f.tabs.keys()], [1, 3, 4, 5, 6, 7]); assert.equal(f.tabs.get(5).groupId, 555);
  await assert.rejects(f.workspace.keep(7), /Only tabs created/);
});

test('manual regrouping after dissolving the work group preserves temporary tabs', async () => {
  const f = multiFixture(); await f.workspace.register(2); await f.workspace.register(3);
  await f.workspace.releaseAll(); f.tabs.get(3).groupId = 555;
  const result = await f.workspace.cleanup(); assert.deepEqual(result.closed, [2]); assert.deepEqual(result.kept, [3]);
});
