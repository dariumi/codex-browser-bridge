import { t } from './i18n.js';
import { api } from './platform.js';
import { diagnosticURL } from './diagnostics-target.js';
const $ = id => document.getElementById(id);
$('diagnostics-close').onclick = async () => { const tab = await api.tabs.getCurrent(); if (tab?.id) await api.tabs.remove(tab.id); else window.close(); };
async function refresh() {
  $('diagnostics-refresh').disabled = true; $('diagnostics-checks').replaceChildren();
  try {
    const [status, policy] = await Promise.all([api.runtime.sendMessage({ type: 'status' }), api.runtime.sendMessage({ type: 'policy_status' })]);
    if (status.error && !status.version || policy.error) throw new Error(status.error || policy.error);
    const checks = [
      [status.enabled, 'Управление включено'], [status.connected, 'Расширение подключено к мосту'], [status.connected && status.bridgeVersion === status.version, 'Версии моста и расширения совпадают'], [policy.networkGuard, 'Защита доступа к сайтам работает'],
      [!!status.capabilities?.sidebar, 'Боковая панель доступна']
    ];
    for (const [ok, text] of checks) { const row = document.createElement('li'); row.className = ok ? 'good' : 'error'; row.textContent = `${ok ? '✓' : '○'} ${t(text)}`; $('diagnostics-checks').append(row); }
    const info = document.createElement('li'); info.textContent = `${status.version} · ${status.capabilities?.browser || 'unknown'} · ${status.capabilities?.backend || 'unknown'}`; $('diagnostics-checks').append(info);
  } catch (error) { $('diagnostics-status').textContent = error.message; }
  finally { $('diagnostics-refresh').disabled = false; }
}
$('diagnostics-refresh').onclick = refresh;
$('diagnostics-open').onclick = async () => {
  $('diagnostics-open').disabled = true;
  try { const reply = await api.runtime.sendMessage({ type: 'diagnostics_open', url: diagnosticURL($('diagnostics-url').value.trim()) }); if (reply.error) throw new Error(reply.error); $('diagnostics-status').textContent = t('Тестовая страница открыта. Поручите Codex пройти её этапы.'); }
  catch (error) { $('diagnostics-status').textContent = error.message; }
  finally { $('diagnostics-open').disabled = false; }
};
const { url } = await api.storage.local.get('url');
try { const bridge = new URL(url); if (bridge.protocol === 'ws:' && ['127.0.0.1', 'localhost'].includes(bridge.hostname)) { bridge.protocol = 'http:'; bridge.pathname = '/complex'; bridge.search = ''; bridge.hash = ''; $('diagnostics-url').value = diagnosticURL(bridge.href); } else $('diagnostics-url').value = 'http://127.0.0.1:17864/complex'; } catch {}
refresh();
