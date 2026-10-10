import { api } from './platform.js';
const $ = id => document.getElementById(id);
let busy = false;
async function send(action, policy) { const result = await api.runtime.sendMessage({ type: 'updates_control', action, policy }); if (result?.error) throw new Error(result.error); return result; }
function render(state) {
  if (!$('updates-status')) return;
  const labels = { validating: 'Проверяем новую версию в отдельной копии…', applying: 'Устанавливаем обновление…', applied: 'Обновление установлено. Мост перезапускается…', failed: 'Обновление не применено', error: 'Проверка обновлений недоступна' };
  $('updates-status').textContent = labels[state.status] || (state.available ? `${state.critical ? 'Критическое обновление' : 'Доступно обновление'}: ${state.currentVersion} → ${state.version}` : `Установлена версия ${state.currentVersion}${state.checkedAt ? ' · проверено ' + new Date(state.checkedAt).toLocaleString('ru-RU') : ' · ещё не проверено'}`);
  if ($('updates-detail')) $('updates-detail').textContent = state.error || state.message || (state.extensionOutdated ? `Расширение ${state.extensionVersion} отстаёт от моста. Перезагрузите его; для Firefox используйте новую сборку dist/firefox.` : state.available ? state.notes : 'Источник: github.com/dariumi/codex-browser-bridge');
  if ($('updates-policy')) $('updates-policy').value = state.policy;
  if ($('updates-apply')) { $('updates-apply').hidden = !state.available; $('updates-apply').disabled = state.applying; }
}
async function action(name, policy) {
  if (busy) return; busy = true;
  for (const id of ['updates-check', 'updates-apply']) if ($(id)) $(id).disabled = true;
  try { render(await send(name, policy)); }
  catch (error) { if ($('updates-status')) $('updates-status').textContent = error.message; }
  finally { busy = false; for (const id of ['updates-check', 'updates-apply']) if ($(id)) $(id).disabled = false; }
}
$('updates-check')?.addEventListener('click', () => action('check'));
$('updates-apply')?.addEventListener('click', () => action('apply'));
$('updates-policy')?.addEventListener('change', event => action('configure', event.target.value));
if ($('updates-status')) { action('status'); setInterval(() => action('status'), 15000); }
