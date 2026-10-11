import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TaskManager } from '../server/tasks.js';
import { validateDeviceRequest } from '../scripts/native-host.js';
class App extends EventEmitter {
  constructor() { super(); this.calls = []; }
  async start() {}
  async request(method, params) { this.calls.push({ method, params }); return method === 'thread/start' ? { thread: { id: 'owned-thread' }, model: params.model || 'fixture' } : method === 'turn/start' ? { turn: { id: 'turn' } } : {}; }
  stop() {}
}
async function fixture(t) { const directory = await mkdtemp(path.join(tmpdir(), 'privacy-test-')); t.after(() => rm(directory, { recursive: true, force: true })); const app = new App(), historyPath = path.join(directory, 'tasks.json'); const manager = new TaskManager({ app, historyPath, command: async () => ({}) }); await manager.ready; t.after(() => manager.stop()); return { manager, app, historyPath }; }
test('session history defaults to memory and completed records are absent on disk or restart', async t => {
  const { manager, app, historyPath } = await fixture(t);
  const task = await manager.startTask({ text: 'Private fixture task', tabId: 1, handoff: false });
  for (let i = 0; i < 50 && !task.turnId; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(app.calls.find(call => call.method === 'thread/start').params.ephemeral, true);
  assert.deepEqual(JSON.parse(await readFile(historyPath, 'utf8')), []);
  await manager.handle('cancel', { taskId: task.id });
  await manager.handle('delete', { taskId: task.id }); assert.equal(manager.list().tasks.length, 0);
  const restored = new TaskManager({ app: new App(), historyPath, command: async () => ({}) }); await restored.ready; assert.equal(restored.tasks.length, 0); await restored.stop();
});
test('persistent history is opt-in; active records cannot be deleted and owned saved threads are deleted', async t => {
  const { manager, app, historyPath } = await fixture(t); await manager.handle('history_settings', { retention: 'persistent' });
  const task = await manager.startTask({ text: 'Saved fixture', tabId: 2, handoff: false });
  for (let i = 0; i < 50 && !task.turnId; i++) await new Promise(resolve => setTimeout(resolve, 2));
  await assert.rejects(manager.handle('delete', { taskId: task.id }), /Stop/);
  assert.equal((await manager.handle('clear_history')).deleted, 0);
  await manager.handle('cancel', { taskId: task.id }); assert.equal(JSON.parse(await readFile(historyPath, 'utf8')).length, 1);
  const result = await manager.handle('clear_history'); assert.equal(result.deleted, 1); assert.equal(result.deletionErrors, 0);
  assert.ok(app.calls.some(call => call.method === 'thread/delete' && call.params.threadId === task.threadId));
});
test('model/effort selection validates the catalog and token usage uses the current context rather than lifetime totals', async t => {
  const { manager, app } = await fixture(t); manager.account.value = { model: 'fixture', models: [{ model: 'fixture', efforts: ['high'] }], fetchedAt: new Date().toISOString() };
  await assert.rejects(manager.startTask({ text: 'Task', tabId: 1, model: 'unknown' }), /Unsupported/);
  const task = await manager.startTask({ text: 'Task', tabId: 1, model: 'fixture', effort: 'high' });
  for (let i = 0; i < 50 && !task.turnId; i++) await new Promise(resolve => setTimeout(resolve, 2));
  const params = app.calls.find(call => call.method === 'thread/start').params; assert.equal(params.model, 'fixture'); assert.equal(params.config.model_reasoning_effort, 'high');
  await manager.notification({ method: 'thread/tokenUsage/updated', params: { threadId: task.threadId, tokenUsage: { last: { totalTokens: 300 }, total: { totalTokens: 9000 }, modelContextWindow: 1000 } } });
  assert.deepEqual(task.tokenUsage, { used: 300, limit: 1000, total: 9000 });
});
test('native fixtures reject arbitrary paths, commands, excessive payloads and unbounded durations', () => {
  assert.throws(() => validateDeviceRequest({ action: 'exec' }), /Unsupported/);
  assert.throws(() => validateDeviceRequest({ action: 'video', data: 'AAAA', seconds: 2, device: '/etc/passwd' }), /video/);
  assert.throws(() => validateDeviceRequest({ action: 'audio', data: 'AAAA', seconds: 301 }), /duration/);
  assert.throws(() => validateDeviceRequest({ action: 'audio', data: 'A'.repeat(700001), seconds: 2 }), /fixture/);
  validateDeviceRequest({ action: 'audio', data: 'AAAA', seconds: 2 });
});

test('legacy bridge history migrates to session memory without leaving ordinary records on disk', async t => {
  const { manager, historyPath } = await fixture(t); await manager.stop();
  await writeFile(historyPath, JSON.stringify([{id:'legacy', status:'completed', text:'Legacy private fixture', messages:[]}]), {mode:0o600});
  const restored = new TaskManager({ app:new App(), historyPath, command:async()=>({}) }); await restored.ready; t.after(()=>restored.stop());
  assert.equal(restored.tasks[0].id,'legacy'); assert.deepEqual(JSON.parse(await readFile(historyPath,'utf8')),[]);
  await restored.handle('history_settings',{retention:'persistent'}); assert.equal(JSON.parse(await readFile(historyPath,'utf8'))[0].id,'legacy');
});
