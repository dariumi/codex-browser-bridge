import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import webExt from 'web-ext';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createBroker } from '../server/broker.js';
import { startFixture } from './fixture.js';

const dir = await mkdtemp(path.join(tmpdir(), 'codex-firefox-'));
let broker, fixture, runner, tabId, client;
const connectionPath = dir + '.connection.json';
const results = [];
try {
  const token = randomBytes(32).toString('hex');
  broker = await createBroker({ port: 0, token }); fixture = await startFixture(0);
  await cp('extension', dir, { recursive: true });
  await writeFile(path.join(dir, 'manifest.json'), await readFile('extension/manifest.firefox.json'));
  await rm(path.join(dir, 'manifest.firefox.json'));
  // Test-only bootstrap lives in an isolated temporary add-on, never in the distributable.
  const background = await readFile(path.join(dir, 'background.js'), 'utf8');
  await writeFile(path.join(dir, 'background.js'), `await (globalThis.browser || globalThis.chrome).storage.local.set(${JSON.stringify({ url: `ws://127.0.0.1:${broker.port}/extension`, token, enabled: true })});\n` + background);
  runner = await webExt.cmd.run({ sourceDir: dir, artifactsDir: path.join(dir, 'artifacts'), firefox: process.env.FIREFOX_BIN || 'firefox', noReload: true, noInput: true, startUrl: [fixture.url], args: ['-headless'], target: ['firefox-desktop'] }, { shouldExitProgram: false });
  const deadline = Date.now() + 30000;
  while (!broker.status().connected && Date.now() < deadline) await new Promise(r => setTimeout(r, 200));
  assert.equal(broker.status().connected, true, 'Firefox extension did not authenticate'); assert.equal(broker.status().browser, 'firefox');
  await writeFile(connectionPath, JSON.stringify({ port: broker.port, token }), { mode: 0o600 });
  client = new Client({ name: 'firefox-smoke', version: '0.3.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('server/mcp.js')], env: { ...process.env, BROWSER_BRIDGE_CONFIG: connectionPath }, stderr: 'inherit' }));
  const call = async (action, args = {}) => {
    const reply = await client.callTool({ name: `browser_${action}`, arguments: { ...(tabId ? { tabId } : {}), ...args } });
    if (reply.isError) throw new Error(reply.content[0].text);
    const metadata = JSON.parse(reply.content.find(item => item.type === 'text').text);
    return action === 'screenshot' ? { ...metadata, data: reply.content.find(item => item.type === 'image').data } : metadata;
  };
  const value = async expression => (await call('evaluate', { expression })).value;
  async function step(name, fn) { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  await step('Firefox authentication and capabilities', async () => { const info = await call('extension_command', { command: 'capabilities' }); assert.equal(info.browser, 'firefox'); assert.equal(info.trustedInput, false); });
  const tabs = await call('tabs'); tabId = tabs.find(tab => tab.url.startsWith(fixture.url))?.tabId; assert.ok(tabId);
  await step('snapshot refs and form actions', async () => {
    const snapshot = await call('snapshot'); const field = snapshot.nodes.find(n => n.role === 'textbox' && n.name === 'Имя'); assert.ok(field?.ref);
    await call('fill', { ref: field.ref, text: 'Firefox работает' }); await call('click', { selector: '#submit' });
    assert.equal(await value('document.querySelector("#result").textContent'), 'Firefox работает'); assert.equal(await value('fixture.trusted'), false);
  });
  await step('text, keyboard selection, checkbox and select', async () => {
    await call('fill', { selector: '#notes', text: 'first' }); await call('press_key', { key: 'Control+A' }); await call('type', { text: 'Привет Firefox' });
    assert.equal(await value('document.querySelector("#notes").value'), 'Привет Firefox');
    await call('click', { selector: '#check' }); assert.equal(await value('document.querySelector("#check").checked'), true);
    await call('select', { selector: '#choice', values: ['two'] }); assert.equal(await value('document.querySelector("#choice").value'), 'two');
  });
  await step('open Shadow DOM and HTML5 drag', async () => {
    await call('fill', { selector: '#shadow-input', text: 'Shadow Firefox' }); assert.equal(await value('document.querySelector("#shadow-host").shadowRoot.querySelector("input").value'), 'Shadow Firefox');
    await call('drag', { from: { selector: '#source' }, to: { selector: '#drop' } }); assert.equal(await value('fixture.drop'), true);
  });
  await step('pointer drag, waits and scroll', async () => {
    await call('drag', { from: { selector: '#pointer' }, to: { selector: '#pointer-result' } }); assert.equal(await value('fixture.pointer'), true);
    await call('wait', { text: 'Moved: true', timeoutMs: 1000 }); await call('scroll', { deltaY: 700 }); assert.ok(await value('scrollY') > 0);
  });
  await step('viewport screenshot and honest unsupported actions', async () => {
    const screenshot = await call('screenshot'); assert.ok(screenshot.data.length > 1000); assert.ok(screenshot.viewport.width > 0);
    await mkdir('.local', { recursive: true }); await writeFile('.local/firefox-viewport.png', Buffer.from(screenshot.data, 'base64'));
    await assert.rejects(call('cdp', { method: 'Page.enable' }), /unavailable/); await assert.rejects(call('screenshot', { fullPage: true }), /Full-page/);
  });
  await step('workspace release and navigation', async () => {
    assert.ok((await call('workspace', { action: 'inspect' })).tabs.some(t => t.tabId === tabId));
    await call('navigate', { url: fixture.url + '/next' }); await call('history', { direction: 'back' });
    await call('detach'); assert.equal((await call('workspace', { action: 'inspect' })).tabs.length, 0);
    await call('close_tab');
  });
  await writeFile('.local/firefox-results.json', JSON.stringify({ browser: 'Firefox', passed: true, results }, null, 2));
} finally {
  await client?.close(); await runner?.exit(); await broker?.close(); await fixture?.close(); await rm(dir, { recursive: true, force: true }); await rm(connectionPath, { force: true });
}
