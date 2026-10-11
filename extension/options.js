import './i18n.js';
import { api as chrome } from './platform.js';
const byId = (id) => document.getElementById(id);
const report = (text, error = false) => { byId('status').textContent = text; byId('status').className = error ? 'error' : 'good'; };
byId('close-settings').onclick = async () => {
  try { const tab = await chrome.tabs.getCurrent(); if (tab?.id) await chrome.tabs.remove(tab.id); else window.close(); }
  catch { window.close(); }
};
const saved = await chrome.storage.local.get(['url', 'token']);
if (saved.url) byId('url').value = saved.url;
if (saved.token) byId('token').value = saved.token;
byId('file').addEventListener('change', async () => {
  try {
    const config = JSON.parse(await byId('file').files[0].text());
    byId('url').value = config.url;
    byId('token').value = config.token;
    const reply = await chrome.runtime.sendMessage({ type: 'configure', settings: { url: config.url, token: config.token } });
    if (reply.error) throw new Error(reply.error);
    report('Параметры импортированы. Подключаемся…');
  } catch (error) { report(error.message, true); }
});
byId('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'configure', settings: { url: byId('url').value.trim(), token: byId('token').value.trim() } });
    if (reply.error) throw new Error(reply.error);
    report('Параметры сохранены. Подключаемся…');
  } catch (error) { report(error.message, true); }
});
byId('pause').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'toggle', enabled: false }); report('Управление отключено.'); });
setInterval(async () => {
  const state = await chrome.runtime.sendMessage({ type: 'status' });
  report(state.connected ? `Подключено. Вкладок под управлением: ${state.attachedTabs.length}` : state.error || (state.enabled ? 'Ожидание локального моста…' : 'Управление отключено.'), !!state.error);
}, 1500);

const deviceSettings = await chrome.storage.local.get('nativeDevicesEnabled'); byId('native-devices').checked = deviceSettings.nativeDevicesEnabled === true; byId('native-devices').onchange = () => chrome.runtime.sendMessage({ type: 'native_config', enabled: byId('native-devices').checked });

const virtualSettings = await chrome.storage.local.get('virtualDevicesEnabled'); byId('virtual-devices').checked = virtualSettings.virtualDevicesEnabled === true; byId('virtual-devices').onchange = () => chrome.runtime.sendMessage({ type: 'virtual_config', enabled: byId('virtual-devices').checked });
