import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccessPolicy, domainOf, policyInstruction } from '../extension/access-policy.js';
import { CommandGuard } from '../extension/command-guard.js';
function fixture() {
  let sessionRules = []; const local = {}, session = {}, events = [];
  const api = { tabs: { onRemoved: { addListener() {} } }, storage: { local: { get: async () => local, set: async value => Object.assign(local, value) }, session: { get: async () => session, set: async value => Object.assign(session, value) } },
    declarativeNetRequest: { getSessionRules: async () => sessionRules, updateSessionRules: async value => { sessionRules = sessionRules.filter(r => !value.removeRuleIds.includes(r.id)).concat(value.addRules); } } };
  const policy = new AccessPolicy(api, { scope: () => 'task-1', event: event => events.push(event) });
  return { policy, api, events, session, get rules() { return sessionRules; } };
}
test('site policy matches normalized hosts and subdomains, never URL substrings; MCP cannot weaken bans', async () => {
  const { policy } = fixture(); await policy.ready;
  await policy.protect('BANK.EXAMPLE.', 'deny');
  await assert.rejects(policy.ensure('https://login.bank.example/path', 'snapshot'), /ACCESS_DENIED/);
  await policy.ensure('https://bank.example.attacker.test/', 'snapshot');
  await policy.ensure('https://attacker.test/?url=https://bank.example/', 'snapshot');
  await assert.rejects(policy.protect('bank.example', 'ask'), /cannot weaken/);
  await assert.rejects(policy.protect('bank.example', 'allow'), /cannot remove/);
  assert.equal(domainOf('https://пример.рф/a'), 'xn--e1afmkfd.xn--p1ai');
  assert.equal(domainOf('localhost:17864'), 'localhost');
  for (const url of ['about:debugging#/runtime/this-firefox', 'about:blank', 'chrome://extensions', 'file:///tmp/test']) assert.throws(() => domainOf(url), /HTTP\(S\)/);
  assert.deepEqual(policyInstruction('Сюда без моего разрешения не ходи', 'https://safe.example/page'), { domain: 'safe.example', mode: 'ask' });
  assert.deepEqual(policyInstruction('Запрети доступ к bank.example навсегда', 'https://safe.example'), { domain: 'bank.example', mode: 'deny' });
  assert.equal(policyInstruction('Пройди тест на этой странице', 'https://safe.example'), null);
});
test('permission approval is scoped, expires, preserves bans and generates per-tab network rules', async () => {
  const f = fixture(); await f.policy.ready; await f.policy.protect('bank.example', 'ask'); await f.policy.track(7);
  await assert.rejects(f.policy.ensure('https://bank.example', 'click'), /ACCESS_APPROVAL_REQUIRED/);
  const request = f.policy.requests.at(-1); assert.equal(f.events.at(-1).type, 'pending');
  await f.policy.decide(request.id, true); await f.policy.ensure('https://bank.example', 'click');
  await assert.rejects(f.policy.ensure('https://sub.bank.example', 'click'), /APPROVAL_REQUIRED/);
  assert.equal(f.rules.find(r => r.action.type === 'allow').condition.tabIds[0], 7);
  assert.ok(f.rules.find(r => r.action.type === 'block').condition.resourceTypes.includes('main_frame'));
  let alarm;
  f.api.alarms = { create: (_name, options) => { alarm = options.when; } };
  const laterExpiry = Date.now() + 60000;
  f.policy.grants.push({ host: 'later.example', kind: 'site', scope: 'task-1', expiresAt: laterExpiry });
  f.policy.grants[0].expiresAt = Date.now() - 1; await f.policy.sync();
  assert.equal(alarm, laterExpiry); assert.equal(f.rules.filter(r => r.action.type === 'allow').length, 1);
  await assert.rejects(f.policy.ensure('https://bank.example', 'click'), /APPROVAL_REQUIRED/);
  await f.policy.reset('task-1'); assert.equal(f.rules.length, 0);
});
test('declining a request prevents repeated prompts; advanced access is separate from site consent', async () => {
  const f = fixture(); await f.policy.ready; await f.policy.protect('sensitive.example', 'ask');
  const request = await f.policy.request('https://sensitive.example', 'navigate'); await f.policy.decide(request.id, false);
  await assert.rejects(f.policy.request('https://sensitive.example', 'navigate'), /ACCESS_DENIED/);
  const advanced = await f.policy.request('https://ordinary.example', 'evaluate', 'advanced');
  assert.equal(advanced.kind, 'advanced'); await f.policy.decide(advanced.id, true);
  await f.policy.ensure('https://ordinary.example', 'evaluate', 'advanced');
  await assert.rejects(f.policy.ensure('https://sensitive.example', 'evaluate'), /ACCESS_DENIED/);
});
test('guard catches named API navigation, raw CDP and frame reads; original cleanup cannot manufacture ownership', async () => {
  const f = fixture(); await f.policy.ready; await f.policy.protect('bank.example', 'deny');
  const tab = { id: 7, url: 'https://ordinary.example', windowId: 1 }; let ran = false;
  f.api.webNavigation = { getAllFrames: async () => [{ url: 'https://bank.example/private', frameId: 1 }] };
  const automation = { tab: async () => tab, run: async () => { ran = true; } };
  const guard = new CommandGuard(f.api, automation, {}, f.policy);
  await assert.rejects(guard.run('snapshot', { tabId: 7 }), /ACCESS_DENIED/); assert.equal(ran, false);
  f.api.webNavigation.getAllFrames = async () => [];
  await assert.rejects(guard.run('extension_command', { command: 'invoke', method: 'tabs.update', arguments: [7, { url: 'https://bank.example' }] }), /ACCESS_DENIED/);
  await assert.rejects(guard.run('evaluate', { tabId: 7, expression: 'location.href' }), /APPROVAL_REQUIRED/);
  const request = f.policy.requests.at(-1); await f.policy.decide(request.id, true);
  await assert.rejects(guard.run('cdp', { tabId: 7, method: 'Target.createTarget', params: { url: 'https://bank.example' } }), /disabled/);
  await assert.rejects(guard.run('policy', { action: 'approve', allowed: true }), /cannot grant/);
});

test('guard rechecks the current page inside the execution queue', async () => {
  const f = fixture(); await f.policy.ready; await f.policy.protect('bank.example', 'deny');
  const tab = { id: 7, url: 'https://ordinary.example' }; let executed = false;
  const automation = { tab: async () => tab, run: async (_action, _args, validate) => { tab.url = 'https://bank.example'; await validate(); executed = true; } };
  const guard = new CommandGuard(f.api, automation, {}, f.policy);
  await assert.rejects(guard.run('snapshot', { tabId: 7 }), /ACCESS_DENIED/); assert.equal(executed, false);
});

test('new tabs fail closed before creation when the network guard is unavailable', async () => {
  const f = fixture(); await f.policy.ready; delete f.api.declarativeNetRequest;
  let created = false; f.api.tabs.create = async () => { created = true; };
  const guard = new CommandGuard(f.api, {}, {}, f.policy);
  await assert.rejects(guard.run('new_tab', { url: 'https://ordinary.example' }), /network guard is unavailable/);
  assert.equal(created, false);
});
