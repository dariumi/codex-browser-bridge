import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TaskManager } from '../server/tasks.js';

class FakeApp extends EventEmitter {
  constructor() { super(); this.calls = []; this.goal = 'active'; this.turns = 0; }
  async start() {}
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'thread/start' || method === 'thread/resume') return { thread: { id: 'thread-1' }, model: 'configured-model', reasoningEffort: 'high' };
    if (method === 'turn/start') return { turn: { id: `turn-${++this.turns}` } };
    if (method === 'thread/goal/get') return { goal: { status: this.goal } };
    return {};
  }
  stop() {}
}
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'bridge-tasks-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const app = new FakeApp(), commands = [];
  const manager = new TaskManager({ app, historyPath: path.join(dir, 'tasks.json'), command: async (action, args) => { commands.push({ action, args }); }, development: { checkpoint: async () => ({ id: 'snapshot' }) } });
  await manager.ready; t.after(() => manager.stop());
  const waitRunning = async () => { for (let i = 0; i < 100; i++) { if (manager.active?.status === 'running' && manager.active.turnId) return manager.active; await new Promise((resolve) => setTimeout(resolve, 5)); } throw new Error('Task did not start'); };
  return { app, manager, commands, waitRunning };
}
test('handoff continues after an incomplete turn and succeeds only when goal completes', async (t) => {
  const { app, manager, commands, waitRunning } = await fixture(t);
  await manager.handle('start', { text: 'Complete the test', tabId: 7 }); const task = await waitRunning();
  assert.equal(app.calls.find((call) => call.method === 'thread/goal/set').params.origin, 'user');
  assert.equal(app.calls.find((call) => call.method === 'thread/start').params.config['mcp_servers.browser_bridge'].default_tools_approval_mode, 'approve');
  await manager.notification({ method: 'turn/completed', params: { threadId: task.threadId, turn: { status: 'completed' } } });
  assert.equal(task.status, 'running'); assert.equal(app.turns, 2);
  app.goal = 'complete';
  await manager.notification({ method: 'item/completed', params: { threadId: task.threadId, item: { type: 'agentMessage', id: 'message', text: 'All stages verified', phase: 'final_answer' } } });
  await manager.notification({ method: 'turn/completed', params: { threadId: task.threadId, turn: { status: 'completed' } } });
  assert.equal(task.status, 'completed'); assert.equal(task.result, 'All stages verified');
  assert.equal(commands.at(-1).args.action, 'release');
});
test('task errors and cancellation are not reported as success; simultaneous tasks rejected', async (t) => {
  const { app, manager, waitRunning } = await fixture(t);
  await manager.handle('start', { text: 'Test', tabId: 2 }); const task = await waitRunning();
  await assert.rejects(manager.handle('start', { text: 'Another task', tabId: 3 }), /already running/);
  await manager.handle('cancel', { taskId: task.id });
  assert.equal(task.status, 'interrupted'); assert.ok(app.calls.some((call) => call.method === 'turn/interrupt'));
  await manager.handle('start', { text: 'Test again', tabId: 2 }); const failed = await waitRunning();
  await manager.notification({ method: 'turn/completed', params: { threadId: failed.threadId, turn: { status: 'failed', error: { message: 'Quota exceeded' } } } });
  assert.equal(failed.status, 'failed'); assert.equal(failed.error, 'Quota exceeded');
});
test('development tasks save a checkpoint and use workspace-write; browser mode remains read-only', async (t) => {
  const { app, manager, waitRunning } = await fixture(t);
  await manager.handle('start', { text: 'Add missing support', tabId: 1, mode: 'development' }); const task = await waitRunning();
  assert.equal(task.checkpoint.id, 'snapshot');
  assert.equal(app.calls.find((call) => call.method === 'thread/start').params.sandbox, 'workspace-write');
  await manager.handle('steer', { taskId: task.id, text: 'Also test it' });
  assert.equal(task.messages.at(-1).text, 'Also test it');
  assert.ok(app.calls.some((call) => call.method === 'turn/steer'));
});

test('tasks retain the resolved model and service rerouting rather than guessing from defaults', async (t) => {
  const { manager, waitRunning } = await fixture(t);
  await manager.handle('start', { text: 'Inspect the page', tabId: 4 }); const task = await waitRunning();
  assert.equal(task.model, 'configured-model'); assert.equal(task.effort, 'high');
  await manager.notification({ method: 'model/rerouted', params: { threadId: task.threadId, fromModel: task.model, toModel: 'actual-model' } });
  assert.equal(task.model, 'actual-model'); assert.equal(task.modelReroutedFrom, 'configured-model');
});
