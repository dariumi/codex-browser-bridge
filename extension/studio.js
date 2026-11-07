import { t } from './i18n.js';
import { api } from './platform.js';
import { validateScript } from './script-actions.js';
const $ = id => document.getElementById(id);
let firefox = false;
let lastJob = null;
let context, selected = '', items = [];
const report = error => { $('feedback').textContent = error?.message || error || ''; };
async function send(message) { const value = await api.runtime.sendMessage(message); if (value?.error) throw new Error(value.error); return value; }
const studio = (section, args) => send({ type: 'studio', section, args });
function state(data) {
  items = data.scripts; $('persist').checked = data.persistent;
  $('library').replaceChildren(new Option(t('Выберите сценарий'), ''), ...items.map(item => new Option(item.name, item.id))); $('library').value = selected;
  const job = data.job; lastJob = job; $('job').textContent = job ? `${job.id} · ${job.status} · ${job.index} / ${job.total}${job.error ? '\n' + job.error : ''}` : '';
  $('resume').disabled = job?.status !== 'waiting_permission'; $('stop-script').disabled = job?.status !== 'running'; $('run').disabled = job?.status === 'running';
}
async function target() { context = await send({ type: 'chat_context', tabId: Number($('studio-tab').value) || undefined }); $('target').textContent = context.title + ' · ' + context.url; return context; }
function example() {
  let origin = 'https://example.com'; try { const url = new URL(context.url); if (/^https?:$/.test(url.protocol)) origin = url.origin; } catch {}
  selected = ''; $('script-json').value = JSON.stringify({ id: 'page-review', name: 'Page review', origins: [origin], steps: [{ action: 'snapshot', args: {} }, { action: 'scroll', args: { deltaY: 500 } }, { action: 'snapshot', args: {} }] }, null, 2);
}
$('close').onclick = async () => { const tab = await api.tabs.getCurrent(); if (tab?.id) await api.tabs.remove(tab.id); else window.close(); };
$('library').onchange = () => { selected = $('library').value; const item = items.find(x => x.id === selected); if (item) $('script-json').value = JSON.stringify(item, null, 2); };
$('new').onclick = example;
function bind(id, fn) { $(id).onclick = async () => { $(id).disabled = true; report(''); try { await fn(); } catch (error) { report(error); } finally { $(id).disabled = id === 'run' && lastJob?.status === 'running' || id === 'resume' && lastJob?.status !== 'waiting_permission' || id === 'stop-script' && lastJob?.status !== 'running'; } }; }
async function save() { const item = validateScript(JSON.parse($('script-json').value)); selected = item.id; const result = await studio('scripts', { action: 'save', script: item }); state(result); return item; }
bind('save', save);
bind('delete', async () => { state(await studio('scripts', { action: 'delete', id: selected })); selected = ''; example(); });
bind('run', async () => { const item = await save(); await target(); state(await studio('scripts', { action: 'run', id: item.id, tabId: context.tabId })); });
bind('resume', async () => state(await studio('scripts', { action: 'resume', id: lastJob?.id })));
bind('stop-script', async () => state(await studio('scripts', { action: 'stop' })));
$('persist').onchange = async () => { try { state(await send({ type: 'studio', section: 'scripts', action: 'retention', enabled: $('persist').checked })); } catch (error) { report(error); } };
bind('export', async () => { const item = validateScript(JSON.parse($('script-json').value)), url = URL.createObjectURL(new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = item.id + '.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
$('import').onchange = async () => { try { const file = $('import').files[0]; if (!file || file.size > 64000) throw new Error('Use JSON under 64 KiB'); $('script-json').value = JSON.stringify(validateScript(JSON.parse(await file.text())), null, 2); report(t('Импорт подготовлен. Нажмите «Сохранить».')); } catch (error) { report(error); } };
$('preset').onchange = () => { const mobile = $('preset').value === 'mobile'; $('width').value = mobile ? 390 : 1280; $('height').value = mobile ? 844 : 800; };
bind('apply-view', async () => { await target(); const args = { action: 'set', tabId: context.tabId, zoom: Number($('zoom').value) / 100 }; if (!firefox && $('preset').value !== 'zoom') Object.assign(args, { width: Number($('width').value), height: Number($('height').value), mobile: $('preset').value === 'mobile', touch: $('preset').value === 'mobile' }); if (!firefox && $('theme').value) args.colorScheme = $('theme').value; if ($('user-agent').value.trim()) args.userAgent = $('user-agent').value.trim(); const result = await studio('view', args); report(result.note); });
bind('reset-view', async () => { await target(); const result = await studio('view', { action: 'reset', tabId: context.tabId }); if (result.errors?.length) throw new Error(result.errors.join('\n')); report(t('Представление сброшено')); });
bind('save-integrations', async () => { await send({ type: 'studio', section: 'integrations', items: JSON.parse($('integration-json').value) }); report(t('Интеграции сохранены')); });
async function launcher(patch) { const saved = (await api.storage.local.get('launcherSettings')).launcherSettings || {}; await api.storage.local.set({ launcherSettings: { ...saved, ...patch } }); }
$('launcher-hidden').onchange = () => launcher({ hidden: $('launcher-hidden').checked }).catch(report);
$('launcher-compact').onchange = () => launcher({ compact: $('launcher-compact').checked }).catch(report);
bind('reset-launcher', () => launcher({ x: null, y: null, hidden: false }));
api.runtime.onMessage.addListener(message => { if (message.type === 'scripts_update') state(message.data); });
$('studio-tab').onchange = () => target().catch(report);
try { const tabs = (await api.tabs.query({})).filter(tab => /^https?:/.test(tab.url || '')); $('studio-tab').replaceChildren(...tabs.map(tab => new Option(tab.title || new URL(tab.url).hostname, tab.id))); const previous = await send({ type: 'chat_context' }); if (tabs.some(tab => tab.id === previous.tabId)) $('studio-tab').value = previous.tabId; const status = await send({ type: 'status' }); firefox = status.capabilities?.browser === 'firefox'; if (firefox) { $('preset').value = 'zoom'; $('preset').disabled = true; for (const id of ['width','height','theme']) $(id).disabled = true; } await target(); } catch (error) { report(error); }
try { state(await studio('scripts', { action: 'list' })); example(); const saved = await api.storage.local.get(['extensionIntegrations', 'launcherSettings']); $('integration-json').value = JSON.stringify(saved.extensionIntegrations || [], null, 2); $('launcher-hidden').checked = !!saved.launcherSettings?.hidden; $('launcher-compact').checked = saved.launcherSettings?.compact !== false; } catch (error) { report(error); }
