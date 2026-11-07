import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScript, validateStep } from '../extension/script-actions.js';
import { Scripts } from '../extension/scripts.js';
import { Integrations, integrationList } from '../extension/integrations.js';
import { ViewProfiles } from '../extension/view.js';
function area() { const data = {}; return { data, get: async () => ({ ...data }), set: async value => Object.assign(data, value), remove: async key => { delete data[key]; } }; }
const script = { id: 'test', name: 'Test', origins: ['https://example.com'], steps: [{ action: 'fill', args: { selector: '#field', text: 'test' } }, { action: 'click', args: { selector: '#submit' } }] };
test('script definitions reject arbitrary code, cross-origin navigation and unbounded input', () => {
  assert.equal(validateScript(script).steps.length, 2);
  for (const step of [{ action: 'evaluate', args: { expression: 'alert(1)' } }, { action: 'navigate', args: { url: 'https://other.invalid/' } }, { action: 'wait', args: { delayMs: 100000 } }, { action: 'click', args: { selector: 'a', tabId: 99 } }]) assert.throws(() => validateScript({ ...script, steps: [step] }));
});
test('scripts stop at permission failure, resume same step only on request and keep library session-only', async () => {
  const api = { storage: { local: area(), session: area() } }; let approved = false; const calls = [];
  const runner = new Scripts(api, { target: async () => ({ id: 1, url: 'https://example.com/' }) }, async action => { if (action === 'click' && !approved) throw new Error('ACCESS_APPROVAL_REQUIRED: test'); calls.push(action); }, validateStep);
  await runner.run({ action: 'save', script }); await runner.run({ action: 'run', id: 'test', tabId: 1 }); await runner.pending;
  assert.equal(runner.job.status, 'waiting_permission'); assert.equal(runner.job.index, 1); assert.equal(api.storage.local.data.browserScripts, undefined);
  approved = true; await runner.run({ action: 'resume', id: 'test' }); await runner.pending;
  assert.deepEqual(calls, ['fill','click']); assert.equal(runner.job.status, 'completed');
  await runner.retention(true); assert.equal(api.storage.session.data.browserScripts, undefined); assert.equal(api.storage.local.data.browserScripts.length, 1);
  await runner.retention(false); assert.equal(api.storage.local.data.browserScripts, undefined);
});
test('script cancellation prevents subsequent steps and origin changes fail closed', async () => {
  const api = { storage: { local: area(), session: area() } }; let release; const calls = [];
  const runner = new Scripts(api, { target: async () => ({ id: 1, url: 'https://example.com/' }) }, async action => { calls.push(action); await new Promise(resolve => { release = resolve; }); }, validateStep);
  await runner.run({ action: 'save', script }); await runner.run({ action: 'run', id: 'test' });
  while (!release) await new Promise(resolve => setTimeout(resolve, 0)); await runner.run({ action: 'stop' }); release(); await runner.pending;
  assert.deepEqual(calls, ['fill']); assert.equal(runner.job.status, 'cancelled');
  runner.guard.target = async () => ({ id: 1, url: 'https://other.invalid/' }); await runner.run({ action: 'run', id: 'test' }); await runner.pending; assert.equal(runner.job.status, 'failed'); assert.match(runner.job.error, /outside/);
});
test('extension integrations only send exact user templates after origin and referenced-site checks', async () => {
  const api = { storage: { local: area() }, runtime: { id: 'self', sendMessage: async (...args) => args } };
  api.storage.local.data.extensionIntegrations = [{ id: 'ping', extensionId: 'target@example', origins: ['https://example.com'], message: { type: 'ping', url: 'https://protected.invalid/' } }];
  let allowed = false, sent = 0;
  const external = new Integrations(api, { target: async () => ({ url: 'https://example.com/' }) }, { ensure: async () => { if (!allowed) throw new Error('ACCESS_DENIED'); } });
  const original = api.runtime.sendMessage; api.runtime.sendMessage = (...args) => { sent++; return original(...args); };
  await assert.rejects(external.run({ action: 'invoke', id: 'ping' }), /ACCESS_DENIED/); assert.equal(sent, 0);
  allowed = true; const response = await external.run({ action: 'invoke', id: 'ping' }); assert.equal(sent, 1); assert.deepEqual(response.response[1], { type: 'ping', url: 'https://protected.invalid/' });
  await assert.rejects(external.run({ action: 'invoke', id: 'unknown' }), /not configured/); assert.throws(() => integrationList([{ id: 'bad' }]));
});
test('Firefox view profiles scope UA rules and CSS zoom without changing native shared zoom', async () => {
  const rules = [], calls = []; let zoom = 1.25;
  const tab = { id: 4, url: 'https://example.com/page' };
  const api = { storage: { session: area() }, tabs: { onRemoved: { addListener() {} }, get: async () => tab, getZoomSettings: async () => ({ mode: 'automatic', scope: 'per-origin' }), setZoomSettings: async () => {}, getZoom: async () => zoom, setZoom: async (id, value) => { zoom = value; } }, scripting: { executeScript: async args => { calls.push(args); } }, declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async args => { rules.push(args); } } };
  const view = new ViewProfiles(api, { tab: async () => tab }, { target: async () => tab });
  await view.run({ action: 'set', tabId: 4, zoom: 0.8, userAgent: 'Bridge/Test' });
  const rule = rules.find(x => x.addRules)?.addRules[0]; assert.deepEqual(rule.condition.tabIds, [4]); assert.ok(new RegExp(rule.condition.regexFilter).test('https://example.com/page')); assert.ok(!new RegExp(rule.condition.regexFilter).test('https://example.com.evil/'));
  assert.equal(zoom, 1.25); assert.ok(calls.some(x => x.func.name === 'documentZoom' && x.args[0] === 0.8)); await view.run({ action: 'reset', tabId: 4 }); assert.equal(zoom, 1.25); assert.ok(rules.some(x => x.removeRuleIds.includes(rule.id)));
  await view.run({ action: 'set', zoom: 0.9, userAgent: 'Bridge/Reapply' }); view.guard.target = async () => { throw new Error('ACCESS_APPROVAL_REQUIRED'); }; await view.navigated(4, tab.url); assert.equal(view.profiles.size, 0); assert.equal(zoom, 1.25);
  view.guard.target = async () => tab;
  await assert.rejects(view.run({ action: 'set', width: 390 }), /Firefox/); await assert.rejects(view.run({ action: 'set', userAgent: 'bad\r\nheader' }), /User-Agent/);
});
test('Chromium profiles issue bounded CDP emulation commands and restore on reset', async () => {
  const calls = [], tab = { id: 7, url: 'https://example.com' }; let zoom = 1;
  const api = { debugger: {}, storage: { session: area() }, tabs: { onRemoved: { addListener() {} }, getZoomSettings: async () => ({ mode: 'automatic', scope: 'per-origin' }), setZoomSettings: async (id, settings) => { calls.push(['tabs.setZoomSettings', settings]); }, getZoom: async () => zoom, setZoom: async (id, value) => { zoom = value; } } };
  const engine = { tab: async () => tab, attach: async () => {}, cdp: async (id, method, params) => { calls.push([method, params]); } };
  const views = new ViewProfiles(api, engine, { target: async () => tab });
  await views.run({ action: 'set', width: 390, height: 844, mobile: true, touch: true, userAgent: 'Bridge/Mobile', colorScheme: 'dark', zoom: 0.9 });
  assert.deepEqual(calls.find(x => x[0] === 'Emulation.setDeviceMetricsOverride')[1], { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(calls.find(x => x[0] === 'Emulation.setUserAgentOverride')[1].userAgent, 'Bridge/Mobile');
  assert.equal(calls.find(x => x[0] === 'tabs.setZoomSettings')[1].scope, 'per-tab');
  await views.run({ action: 'reset' }); assert.equal(zoom, 1); assert.ok(calls.some(x => x[0] === 'Emulation.clearDeviceMetricsOverride')); assert.deepEqual(api.storage.session.data.viewProfiles, []);
});
test('script permission checks are not removed by a stored origin allowlist', async () => {
  const api = { storage: { local: area(), session: area() } }; let deny = false, actions = 0;
  const runner = new Scripts(api, { target: async () => { if (deny) throw new Error('ACCESS_DENIED'); return { id: 1, url: 'https://example.com' }; } }, async () => { actions++; deny = true; }, validateStep);
  await runner.run({ action: 'save', script }); await runner.run({ action: 'run', id: 'test' }); await runner.pending;
  assert.equal(actions, 1); assert.equal(runner.job.status, 'failed'); assert.match(runner.job.error, /ACCESS_DENIED/);
});
