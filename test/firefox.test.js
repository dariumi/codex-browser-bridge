import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserWorkspace } from '../extension/workspace.js';
import { FirefoxAutomation } from '../extension/firefox-automation.js';
import { capabilities, openChat } from '../extension/platform.js';

test('Firefox workspace retains visual ownership without Chromium tab-group APIs', async () => {
  const messages = [], badges = [], stored = {};
  const api = { storage: { session: { get: async () => stored, set: async value => Object.assign(stored, value) } },
    tabs: { get: async id => ({ id }), sendMessage: async (id, message) => messages.push(message) },
    action: { setBadgeText: async value => badges.push(value.text), setBadgeBackgroundColor: async () => {}, setTitle: async () => {} } };
  const work = new BrowserWorkspace(api); const marked = await work.mark(4);
  assert.equal(marked.groupId, null); assert.equal(messages[0].active, true);
  await work.mark(4); assert.equal(messages.length, 1);
  await work.release(4); assert.equal(messages[1].active, false); assert.deepEqual(badges, ['AI', '']); assert.deepEqual(stored.workTabs, []);
});
test('Firefox reports backend limits, rejects unsupported commands and serializes expired actions', async () => {
  const api = { tabs: { onRemoved: { addListener() {} }, get: async id => ({ id, url: 'https://example.com', windowId: 1 }) }, scripting: {}, sidebarAction: { open: async () => 'opened' } };
  const automation = new FirefoxAutomation(api, { mark: async () => {} });
  assert.equal(capabilities(api).trustedInput, false); assert.equal(capabilities(api).browser, 'firefox');
  assert.equal(await openChat(4, api), 'opened');
  await assert.rejects(automation.run('cdp', { tabId: 4 }), /unavailable/);
  await assert.rejects(automation.run('screenshot', { tabId: 4, fullPage: true }), /Full-page/);
  await assert.rejects(automation.run('click', {}, () => { throw new Error('expired'); }), /expired/);
});
