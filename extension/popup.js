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
