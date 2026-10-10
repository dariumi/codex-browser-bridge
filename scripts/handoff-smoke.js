import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bridgeRequest } from '../server/client.js';
import { root } from '../server/config.js';
import { startFixture } from './fixture.js';

const command = (action, args) => bridgeRequest('/command', { action, args });
let fixture, tabId, taskId;
const longRun = process.argv.includes('--long');
const result = { date: new Date().toISOString(), passed: false };
try {
  const status = await bridgeRequest('/status');
  if (!status.connected || status.extensionVersion !== '0.5.0') throw new Error('Reload the installed extension to version 0.5.0 first.');
  fixture = await startFixture(17864);
  tabId = (await command('new_tab', { url: fixture.url, active: true })).tabId;
  const task = await command('task', { action: 'start', tabId, mode: 'browser', handoff: true, longRun, maxHours: 1,
    text: (longRun ? 'Это тест запланированного ожидания. Сначала изучи страницу. Затем ОБЯЗАТЕЛЬНО вызови browser_task action=sleep seconds=2 reason=Тест таймера resumeInstruction=Заполни форму и проверь результат. После результата sleep не вызывай инструменты: дождись нового сообщения моста о пробуждении. Только после пробуждения выполни действия ниже. ' : '') + 'Это тест передачи управления на локальной тестовой странице. Выполни все этапы сам: введи Handoff works в поле Имя, нажми Отправить, включи checkbox Согласен и выбери Второй в выпадающем списке. Затем проверь, что результат равен Handoff works, checkbox включён, выбран видимый вариант Второй. Проверяй только через browser_snapshot, не используй evaluate/CDP, потому что для них нужно отдельное разрешение. Не изменяй исходники и не открывай другие вкладки. После проверок отметь цель complete и сообщи итог.' });
  taskId = task.id;
  const deadline = Date.now() + 5 * 60 * 1000;
  let current, observedSleep = false, lastActivity = '';
  while (Date.now() < deadline) {
    current = await command('task', { action: 'inspect', taskId });
    observedSleep ||= current.status === 'sleeping';
    const activity = `Task ${current.status}${current.activity ? ': ' + current.activity : ''}`; if (activity !== lastActivity) { console.log(activity); lastActivity = activity; }
    if (!['starting', 'running', 'cancelling', 'sleeping', 'waking', 'waiting_permission'].includes(current.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(current.status, 'completed', current.error || 'Task did not complete');
  const snapshot = await command('snapshot', { tabId });
  assert.ok(snapshot.nodes.some(node => node.name === 'Handoff works'), 'Submitted result missing from accessibility tree');
  assert.ok(snapshot.nodes.some(node => node.role === 'checkbox' && String(node.checked) === 'true'), 'Checkbox not checked');
  assert.ok(snapshot.nodes.some(node => node.role === 'combobox' && node.value === 'Второй'), 'Second choice not selected');
  if (longRun) { assert.ok(observedSleep || current.wokeAt, 'No scheduled sleep was observed'); assert.ok(current.wokeAt, 'Task never woke'); }
  result.longRun = longRun; result.wokeAt = current.wokeAt; result.observedSleep = observedSleep;
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
