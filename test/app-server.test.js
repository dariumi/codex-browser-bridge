import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { CodexAppServer } from '../server/app-server.js';

test('app-server client performs JSONL handshake, streams notifications, and handles errors/timeouts', async (t) => {
  const client = new CodexAppServer({ spawnProcess: (_, args, options) => spawn(process.execPath, [fileURLToPath(new URL('./app-server-fixture.js', import.meta.url))], options) });
  t.after(() => client.stop());
  await client.start(); const notification = once(client, 'notification');
  assert.equal((await client.request('thread/start')).thread.id, 'test-thread');
  assert.equal((await notification)[0].method, 'thread/started');
  await assert.rejects(client.request('unsupported'), /Unsupported test method/);
  await assert.rejects(client.request('hang', {}, 20), /timed out/);
  assert.equal(client.pending.size, 0);
});
