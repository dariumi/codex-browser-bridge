import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createBroker } from '../server/broker.js';
import { root } from '../server/config.js';

test('real stdio MCP initialization, schemas, JSON errors, and image output', async (t) => {
  const token = 'b'.repeat(64);
  const broker = await createBroker({ port: 0, token });
  const dir = await mkdtemp(path.join(tmpdir(), 'browser-bridge-test-'));
  t.after(async () => { await broker.close(); await rm(dir, { recursive: true, force: true }); });
  const configPath = path.join(dir, 'connection.json');
  await writeFile(configPath, JSON.stringify({ port: broker.port, token }));
  const ws = new WebSocket(`ws://127.0.0.1:${broker.port}/extension`, { origin: `chrome-extension://${'b'.repeat(32)}` });
  await once(ws, 'open'); const ready = once(ws, 'message'); ws.send(JSON.stringify({ type: 'hello', token })); await ready;
  ws.on('message', (raw) => {
    const command = JSON.parse(raw); if (command.type !== 'command') return;
    const result = command.action === 'screenshot'
      ? { data: 'iVBORw0KGgo=', tabId: 1, viewport: { width: 800, height: 600, devicePixelRatio: 1 } }
      : [{ tabId: 1, title: 'Test', url: 'https://example.com' }];
    ws.send(JSON.stringify({ type: 'result', id: command.id, result }));
  });
  const client = new Client({ name: 'test-client', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'server/mcp.js')], env: { ...process.env, BROWSER_BRIDGE_CONFIG: configPath }, stderr: 'pipe' });
  t.after(() => client.close());
  await client.connect(transport);
  const list = await client.listTools();
  assert.equal(list.tools.length, 31);
  assert.ok(list.tools.some((tool) => tool.name === 'browser_drag'));
  assert.match(client.getInstructions(), /screenshot viewport CSS coordinates/);
  const status = await client.callTool({ name: 'browser_status', arguments: {} });
  assert.equal(JSON.parse(status.content[0].text).connected, true);
  const tabs = await client.callTool({ name: 'browser_tabs', arguments: {} });
  assert.equal(JSON.parse(tabs.content[0].text)[0].tabId, 1);
  const screenshot = await client.callTool({ name: 'browser_screenshot', arguments: { tabId: 1 } });
  assert.equal(screenshot.content[0].type, 'image');
  assert.equal(screenshot.content[0].mimeType, 'image/png');
  assert.equal(JSON.parse(screenshot.content[1].text).viewport.width, 800);
  const invalid = await client.callTool({ name: 'browser_drag', arguments: { steps: 1 } });
  assert.equal(invalid.isError, true);
  ws.close(); await once(ws, 'close');
  const disconnected = await client.callTool({ name: 'browser_tabs', arguments: {} });
  assert.equal(disconnected.isError, true);
  assert.match(disconnected.content[0].text, /not connected/);
});
