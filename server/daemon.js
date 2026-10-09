import { readConfig } from './config.js';
import { createBroker } from './broker.js';
import { TaskManager } from './tasks.js';
import { DevelopmentManager } from './development.js';
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { root, configPath } from './config.js';

try {
  const config = await readConfig();
  let broker;
  const development = new DevelopmentManager({ authorize: () => tasks.active?.mode === 'development' });
  const tasks = new TaskManager({ command: (action, args) => broker.command(action, args), development });
  await tasks.ready;
  broker = await createBroker({ ...config, handlers: {
    permission: event => tasks.permissionEvent(event),
    task: (args) => tasks.handle(args.action, args),
    development: (args) => development.handle(args.action, args),
    ui: (action, args) => tasks.handle(action, args)
  } });
  tasks.on('update', (data) => broker.notify({ type: 'tasks_update', data }));
  tasks.on('finished', (task) => {
    broker.notify({ type: 'task_finished', task: { id: task.id, tabId: task.tabId, status: task.status, result: task.result, error: task.error } });
    if (task.mode === 'development' && task.status === 'completed' && development.pendingApply) setTimeout(async () => {
      try {
        await broker.command('extension_command', { command: 'reload' });
        await tasks.stop(); await broker.close();
        const log = await open(path.join(path.dirname(configPath), 'bridge.log'), 'a', 0o600);
        const child = spawn(process.execPath, [path.join(root, 'server/daemon.js')], { detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, BROWSER_BRIDGE_CONFIG: configPath } });
        child.unref(); await log.close(); process.exit(0);
      } catch (error) { console.error('Development restart failed:', error.message); }
    }, 1500);
  });
  console.error(`Browser bridge listening on 127.0.0.1:${broker.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await tasks.stop(); await broker.close(); process.exit(0); });
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? 'Bridge port already in use' : error.message);
  process.exit(1);
}
