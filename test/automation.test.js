import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAutomation } from '../extension/automation.js';

function mock() {
  const commands = [], listeners = {};
  const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const api = {
    tabs: { get: async (id) => ({ id, url: 'https://example.com' }), onRemoved: event('removed') },
    debugger: {
      onDetach: event('detached'), onEvent: event('event'), attach: async () => {}, detach: async () => {},
      sendCommand: async (source, method, params) => { commands.push({ source, method, params }); return {}; }
    }
  };
  return { automation: new BrowserAutomation(api), api, commands, listeners };
}
test('trusted clicks preserve viewport coordinates and modifiers', async () => {
  const { automation, commands } = mock();
  await automation.run('click', { tabId: 3, x: 100, y: 200, button: 'right', clickCount: 2, modifiers: 8 });
  const mouse = commands.filter((c) => c.method === 'Input.dispatchMouseEvent');
  assert.deepEqual(mouse.map((c) => c.params.type), ['mouseMoved', 'mousePressed', 'mouseReleased']);
  assert.equal(mouse[1].params.button, 'right'); assert.equal(mouse[1].params.clickCount, 2);
  assert.equal(mouse[1].params.x, 100); assert.equal(mouse[1].params.modifiers, 8);
});
test('keyboard shortcuts do not insert shortcut text', async () => {
  const { automation, commands } = mock();
  await automation.key(2, 'Control+A');
  assert.equal(commands[0].params.modifiers, 2);
  assert.equal(commands[0].params.type, 'rawKeyDown');
  assert.equal(commands[0].params.text, undefined);
  assert.equal(commands[1].params.type, 'keyUp');
  await assert.rejects(() => automation.key(2, 'Wrong+A'), /Unknown modifier/);
});
test('gestures serialize and expired commands never start', async () => {
  const { automation } = mock();
  const trace = [];
  automation.execute = async (action) => { trace.push('start:' + action); await new Promise((resolve) => setTimeout(resolve, 5)); trace.push('end:' + action); };
  const first = automation.run('click', {}), second = automation.run('type', {});
  await Promise.all([first, second]);
  assert.deepEqual(trace, ['start:click', 'end:click', 'start:type', 'end:type']);
  await assert.rejects(automation.run('click', {}, () => { throw new Error('expired'); }), /expired/);
  assert.equal(trace.length, 4);
});
test('modal dialog commands bypass a blocked action', async () => {
  const { automation } = mock();
  let release;
  automation.execute = async (action) => { if (action === 'evaluate') return new Promise((resolve) => { release = resolve; }); release('unblocked'); return 'dialog handled'; };
  const evaluated = automation.run('evaluate', {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await automation.run('dialog', {}), 'dialog handled');
  assert.equal(await evaluated, 'unblocked');
});
test('dialog handling never waits on blocked tab-group UI', async () => {
  const { automation } = mock();
  automation.attached.add(2);
  automation.workspace = { mark: async () => { throw new Error('Tab-group UI is blocked'); } };
  const result = await automation.run('dialog', { tabId: 2, action: 'accept' });
  assert.equal(result.handled, true);
});
test('event capture is bounded and removed tabs release retained data', async () => {
  const { automation, listeners } = mock();
  for (let i = 0; i < 350; i++) listeners.event({ tabId: 5 }, 'Runtime.consoleAPICalled', { type: 'log', timestamp: i, args: [{ value: i }] });
  assert.equal(automation.logs.get(5).length, 300);
  assert.equal(automation.logs.get(5)[0].text, '50');
  listeners.removed(5); assert.equal(automation.logs.has(5), false);
});
test('stale element refs release remote objects even when operations fail', async () => {
  const { automation, api, commands } = mock();
  api.debugger.sendCommand = async (source, method, params) => {
    commands.push({ method, params });
    if (method === 'DOM.resolveNode') return { object: { objectId: 'object-1' } };
    if (method === 'Runtime.callFunctionOn') return { exceptionDetails: { text: 'Element is stale' } };
    return {};
  };
  await assert.rejects(automation.withElement(1, { ref: 'b42' }, function () {}), /stale/);
  assert.equal(commands.at(-1).method, 'Runtime.releaseObject');
});

test('worker recovery restores only owned debugger tabs and pause releases them', async () => {
  const { api } = mock();
  const detached = [], saved = [];
  api.storage = { session: { get: async () => ({ ownedTabs: [1, 2] }), set: async (value) => { saved.push(value); } } };
  api.debugger.getTargets = async () => [{ tabId: 1, attached: true }, { tabId: 2, attached: false }, { tabId: 3, attached: true }];
  api.debugger.detach = async ({ tabId }) => { detached.push(tabId); };
  const automation = new BrowserAutomation(api);
  await automation.ready;
  assert.deepEqual([...automation.attached], [1]);
  await automation.detachAll();
  assert.deepEqual(detached, [1]);
  assert.deepEqual(saved.at(-1), { ownedTabs: [] });
});
