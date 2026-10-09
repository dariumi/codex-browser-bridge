import { api as chrome } from './platform.js';
let enabled = false;
async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'status' });
  enabled = state.enabled;
  document.getElementById('status').textContent = state.connected ? `Подключено · вкладок: ${state.attachedTabs.length}` : state.error || (enabled ? 'Ожидание локального моста' : 'Управление отключено');
  document.getElementById('toggle').textContent = enabled ? 'Отключить' : 'Включить';
}
document.getElementById('toggle').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'toggle', enabled: !enabled }); await refresh(); });
document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('chat').addEventListener('click', async () => { const reply = await chrome.runtime.sendMessage({ type: 'open_chat' }); if (reply.error) document.getElementById('status').textContent = reply.error; else window.close(); });
await refresh(); setInterval(refresh, 1500);

try {
  const [account, tasks] = await Promise.all([chrome.runtime.sendMessage({ type: 'chat_account' }), chrome.runtime.sendMessage({ type: 'chat_tasks' })]);
  const active = tasks.tasks?.find(task => task.id === tasks.activeTaskId);
  const box = document.getElementById('popup-account'); box.replaceChildren();
  const model = document.createElement('strong'); model.textContent = active?.model || account.model || 'Модель не указана'; box.append(model, document.createElement('br'));
  const windows = account.limits?.find(bucket => bucket.id === 'codex')?.windows || account.limits?.[0]?.windows || [];
  box.append(document.createTextNode(windows.length ? windows.map(w => `${w.durationMinutes === 10080 ? 'Неделя' : w.durationMinutes ? w.durationMinutes / 60 + ' ч.' : 'Лимит'}: ${w.remainingPercent}% осталось`).join(' · ') : account.limitsError || 'Лимиты недоступны'));
} catch { document.getElementById('popup-account').textContent = 'Модель и лимиты появятся после подключения'; }
