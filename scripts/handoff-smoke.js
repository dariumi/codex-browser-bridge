import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bridgeRequest } from '../server/client.js';
import { root } from '../server/config.js';
import { startFixture } from './fixture.js';

const command = (action, args) => bridgeRequest('/command', { action, args });
let fixture, tabId, taskId;
const result = { date: new Date().toISOString(), passed: false };
try {
  const status = await bridgeRequest('/status');
  if (!status.connected || status.extensionVersion !== '0.2.0') throw new Error('Reload the installed extension to version 0.2.0 first.');
  fixture = await startFixture(17864);
  tabId = (await command('new_tab', { url: fixture.url, active: true })).tabId;
  const task = await command('task', { action: 'start', tabId, mode: 'browser', handoff: true,
    text: 'Это тест передачи управления на локальной тестовой странице. Выполни все этапы сам: введи Handoff works в поле Имя, нажми Отправить, включи checkbox Согласен и выбери Второй в выпадающем списке. Затем проверь, что результат равен Handoff works, checkbox включён, значение select равно two. Не изменяй исходники и не открывай другие вкладки. После проверок отметь цель complete и сообщи итог.' });
  taskId = task.id;
  const deadline = Date.now() + 5 * 60 * 1000;
  let current;
  while (Date.now() < deadline) {
    current = await command('task', { action: 'inspect', taskId });
    console.log(`Task ${current.status}${current.activity ? ': ' + current.activity : ''}`);
    if (!['starting', 'running', 'cancelling'].includes(current.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  assert.equal(current.status, 'completed', current.error || 'Task did not complete');
  const inspected = await command('evaluate', { tabId, expression: '({result:document.querySelector("#result").textContent,checked:document.querySelector("#check").checked,choice:document.querySelector("#choice").value})' });
  assert.deepEqual(inspected.value, { result: 'Handoff works', checked: true, choice: 'two' });
  result.passed = true; result.taskStatus = current.status; result.report = current.result;
  console.log('PASS autonomous handoff through Codex app-server + MCP + installed extension');
} catch (error) { result.error = error.message; console.error(error.message); process.exitCode = 1; }
finally {
  if (taskId) await command('task', { action: 'cancel', taskId }).catch(() => {});
  if (tabId) { await command('detach', { tabId }).catch(() => {}); await command('workspace', { action: 'release', tabId }).catch(() => {}); await command('close_tab', { tabId }).catch(() => {}); }
  if (fixture) await fixture.close();
  await mkdir(path.join(root, '.local'), { recursive: true });
  await writeFile(path.join(root, '.local/handoff-results.json'), JSON.stringify(result, null, 2));
}
