import './i18n.js';
import { api as chrome, openChat, openChatPage } from './platform.js';
let enabled = false;
async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'status' });
  enabled = state.enabled;
  document.getElementById('status').textContent = state.connected ? `Подключено · вкладок: ${state.attachedTabs.length}` : state.error || (enabled ? 'Ожидание локального моста' : 'Управление отключено');
  document.getElementById('toggle').textContent = enabled ? 'Отключить' : 'Включить';
}
document.getElementById('toggle').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'toggle', enabled: !enabled }); await refresh(); });
document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
const chatButton = document.getElementById('chat');
let targetTab;
chatButton.disabled = true;
chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => { targetTab = tabs[0]; chatButton.disabled = !targetTab; }).catch(error => { document.getElementById('status').textContent = error.message; });
chatButton.addEventListener('click', () => {
  // Invoke in the click handler, before messaging or any await loses user activation.
  const opening = openChat(targetTab.id, chrome);
  chatButton.disabled = true;
  const saving = chrome.runtime.sendMessage({ type: 'chat_target_set', tabId: targetTab.id }).then(reply => { if (reply?.error) throw new Error(reply.error); });
  Promise.all([saving, opening.catch(() => openChatPage(targetTab.id, chrome))]).then(() => window.close()).catch(error => {
    document.getElementById('status').textContent = error.message; chatButton.disabled = false;
  });
});
await refresh(); setInterval(refresh, 1500);

try {
  const [account, tasks] = await Promise.all([chrome.runtime.sendMessage({ type: 'chat_account' }), chrome.runtime.sendMessage({ type: 'chat_tasks' })]);
  const active = tasks.tasks?.find(task => task.id === tasks.activeTaskId);
  const box = document.getElementById('popup-account'); box.replaceChildren();
  const model = document.createElement('strong'); model.textContent = active?.model || account.model || 'Модель не указана'; box.append(model, document.createElement('br'));
  const windows = account.limits?.find(bucket => bucket.id === 'codex')?.windows || account.limits?.[0]?.windows || [];
  box.append(document.createTextNode(windows.length ? windows.map(w => `${w.durationMinutes === 10080 ? 'Неделя' : w.durationMinutes ? w.durationMinutes / 60 + ' ч.' : 'Лимит'}: ${w.remainingPercent}% осталось`).join(' · ') : account.limitsError || 'Лимиты недоступны'));
} catch { document.getElementById('popup-account').textContent = 'Модель и лимиты появятся после подключения'; }
