import { readConfig } from './config.js';
import { createBroker } from './broker.js';
import { TaskManager } from './tasks.js';
import { DevelopmentManager } from './development.js';
import { UpdateManager } from './updates.js';
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { root, configPath } from './config.js';

try {
  const config = await readConfig();
  let broker, updates, restarting = false;
  const restart = async () => {
    if (restarting) return; restarting = true;
    setTimeout(async () => {
      try {
        await broker.command('extension_command', { command: 'reload' }).catch(() => {});
        await tasks.stop({ preserveSleeping: true }); await broker.close();
        const log = await open(path.join(path.dirname(configPath), 'bridge.log'), 'a', 0o600);
        const child = spawn(process.execPath, [path.join(root, 'server/daemon.js')], { detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, BROWSER_BRIDGE_CONFIG: configPath } });
        child.unref(); await log.close(); process.exit(0);
      } catch (error) { restarting = false; console.error('Bridge restart failed:', error.message); }
    }, 1500);
  };
  const development = new DevelopmentManager({ authorize: () => tasks.active?.mode === 'development' });
  const tasks = new TaskManager({ command: (action, args) => broker ? broker.command(action, args) : Promise.reject(new Error('Browser is not connected yet')), development, canStart: () => !updates?.applying && !restarting });
  await tasks.ready;
  updates = new UpdateManager({ idle: () => !tasks.active && !restarting, installed: () => broker?.status(false) || {}, restart }); await updates.ready;
  broker = await createBroker({ ...config, handlers: {
    updateStatus: () => updates.status(),
    permission: event => tasks.permissionEvent(event),
    task: (args) => tasks.handle(args.action, args),
    development: (args) => development.handle(args.action, args),
    updates: args => updates.handle(args.action),
    ui: (action, args) => {
      if (action === 'updates_status') return updates.handle('status');
      if (action === 'updates_check') return updates.handle('check');
      if (action === 'updates_apply') return updates.apply({ userInitiated: true });
      if (action === 'updates_configure') return updates.configure(args.policy);
      return tasks.handle(action, args);
    }
  } });
  tasks.on('update', (data) => broker.notify({ type: 'tasks_update', data }));
  tasks.on('finished', (task) => {
    broker.notify({ type: 'task_finished', task: { id: task.id, tabId: task.tabId, status: task.status, result: task.result, error: task.error } });
    if (task.mode === 'development' && task.status === 'completed' && development.pendingApply) restart();
    else if (updates.status().eligible) updates.apply().catch(error => console.error('Deferred update:', error.message));
  });
  const checkUpdates = () => updates.automatic().catch(error => console.error('Automatic update:', error.message));
  setTimeout(checkUpdates, 10000).unref(); setInterval(checkUpdates, 6 * 60 * 60 * 1000).unref();
  console.error(`Browser bridge listening on 127.0.0.1:${broker.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await tasks.stop({ preserveSleeping: true }); await broker.close(); process.exit(0); });
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? 'Bridge port already in use' : error.message);
  process.exit(1);
}
