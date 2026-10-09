import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { root, configPath } from '../server/config.js';
import { startFixture } from './fixture.js';

const client = new Client({ name: 'browser-smoke', version: '0.1.0' });
const results = [];
let fixture, tabId;
async function call(name, args = {}) {
  const response = await client.callTool({ name: `browser_${name}`, arguments: { ...(tabId ? { tabId } : {}), ...args } });
  if (response.isError) throw new Error(`${name}: ${response.content[0].text}`);
  return response;
}
async function json(name, args) { const response = await call(name, args); return JSON.parse(response.content.find((item) => item.type === 'text').text); }
async function value(expression) { return (await json('evaluate', { expression })).value; }
async function step(name, fn) { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }

try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'server/mcp.js')], env: { ...process.env, BROWSER_BRIDGE_CONFIG: configPath }, stderr: 'inherit' }));
  const status = await json('status');
  if (!status.connected) throw new Error('Install the extension and import .local/connection.json first.');
  fixture = await startFixture(17864);
  const opened = await json('new_tab', { url: fixture.url }); tabId = opened.tabId;
  await mkdir(path.join(root, '.local'), { recursive: true });
  await step('tabs and activation', async () => {
    assert.ok((await json('tabs')).some((tab) => tab.tabId === tabId)); await call('activate_tab', { tabId });
  });
  await step('snapshot refs, form fill, and trusted click', async () => {
    const snapshot = await json('snapshot');
    const field = snapshot.nodes.find((node) => node.role === 'textbox' && node.name === 'Имя');
    assert.ok(field?.ref); await call('fill', { ref: field.ref, text: 'Codex Привет' });
    await call('click', { selector: '#submit' });
    assert.equal(await value('document.querySelector("#result").textContent'), 'Codex Привет');
    assert.equal(await value('fixture.trusted'), true);
  });
  await step('trusted typing, keyboard selection, and textarea', async () => {
    await call('click', { selector: '#notes' });
    await call('type', { text: 'first' }); await call('press_key', { key: 'Control+A' });
    await call('type', { text: 'Привет, браузер' }); await call('press_key', { key: 'Enter' });
    await call('type', { text: 'second line' });
    assert.equal(await value('document.querySelector("#notes").value'), 'Привет, браузер\nsecond line');
  });
  await step('checkbox and native select', async () => {
    await call('click', { selector: '#check' }); assert.equal(await value('document.querySelector("#check").checked'), true);
    await call('select', { selector: '#choice', values: ['two'] }); assert.equal(await value('document.querySelector("#choice").value'), 'two');
  });
  await step('open shadow DOM', async () => {
    await call('fill', { selector: '#shadow-input', text: 'Shadow works' });
    assert.equal(await value('document.querySelector("#shadow-host").shadowRoot.querySelector("input").value'), 'Shadow works');
  });
  await step('HTML5 drag-and-drop', async () => {
    await call('drag', { from: { selector: '#source' }, to: { selector: '#drop' } });
    assert.equal(await value('fixture.drop'), true);
  });
  await step('pointer drag', async () => {
    await call('hover', { selector: '#pointer' });
    const point = await value('(() => {const r=document.querySelector("#pointer").getBoundingClientRect();return {x:r.left+35,y:r.top+35};})()');
    await call('drag', { from: point, to: { x: point.x + 150, y: point.y + 20 } });
    assert.equal(await value('fixture.pointer'), true);
  });
  await step('file upload', async () => {
    const filename = path.join(root, '.local', 'upload-fixture.txt'); await writeFile(filename, 'Browser Bridge upload test');
    await call('upload', { selector: '#file', files: [filename] });
    assert.equal(await value('document.querySelector("#file").files[0].name'), 'upload-fixture.txt');
  });
  await step('JavaScript dialog', async () => {
    await call('click', { selector: '#dialog' }); await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await json('dialog', { action: 'inspect' })).dialog.type, 'confirm');
    await call('dialog', { action: 'accept' });
    assert.equal(await value('fixture.dialog'), true);
  });
  await step('console and network capture', async () => {
    assert.ok((await json('console')).messages.some((message) => message.text.includes('fixture submit')));
    assert.ok((await json('network')).events.some((event) => event.url?.endsWith('/ping')));
  });
  await step('wait and scrolling', async () => {
    await call('wait', { text: 'Конец страницы', timeoutMs: 1000 });
    await call('scroll', { deltaY: 700 });
    assert.ok(await value('scrollY') > 0);
    await call('evaluate', { expression: 'scrollTo(0,0)' });
  });
  await step('viewport and full-page MCP screenshots', async () => {
    for (const fullPage of [false, true]) {
      const shot = await call('screenshot', { fullPage });
      const img = shot.content.find((item) => item.type === 'image');
      assert.equal(img.mimeType, 'image/png'); const data = Buffer.from(img.data, 'base64');
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      await writeFile(path.join(root, '.local', fullPage ? 'smoke-full-page.png' : 'smoke-viewport.png'), data);
    }
  });
  await step('CDP escape hatch and navigation', async () => {
    assert.ok((await json('cdp', { method: 'Page.getLayoutMetrics' })).cssLayoutViewport);
    await call('navigate', { url: fixture.url + '/second' });
    await call('history', { direction: 'back' });
    assert.equal(await value('location.pathname'), '/');
    await call('history', { direction: 'forward' });
    assert.equal(await value('location.pathname'), '/second');
    await call('history', { direction: 'reload' });
  });
  console.log(`Real browser smoke tests passed: ${results.length}`);
} catch (error) {
  results.push({ name: 'failure', passed: false, error: error.message });
  console.error(error.message); process.exitCode = 1;
} finally {
  if (tabId) {
    await call('dialog', { action: 'dismiss' }).catch(() => {});
    await call('detach', { tabId }).catch(() => {});
    await call('close_tab', { tabId }).catch(() => {});
  }
  await client.close().catch(() => {});
  if (fixture) await fixture.close();
  await mkdir(path.join(root, '.local'), { recursive: true });
  await writeFile(path.join(root, '.local', 'smoke-results.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
}
