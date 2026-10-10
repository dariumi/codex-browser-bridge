import { api as chrome } from './platform.js';
const $ = (id) => document.getElementById(id);
let context = null, taskState = { tasks: [], activeTaskId: null }, selectedId = null, displayedTask = null;
const statuses = { sleeping: 'Ожидает до следующего этапа', waking: 'Возобновляет задачу', starting: 'Запускаем Codex…', waiting_permission: 'Ждёт твоего разрешения', running: 'Codex работает', cancelling: 'Останавливаем…', completed: 'Задача завершена', failed: 'Ошибка выполнения', interrupted: 'Остановлено', blocked: 'Нужны дополнительные данные', limited: 'Достигнут лимит запуска' };
async function send(message) { const reply = await chrome.runtime.sendMessage(message); if (reply?.error) throw new Error(reply.error); return reply; }
function error(text) { $('error').textContent = text || ''; }
async function target(tabId) {
  context = await send({ type: 'chat_context', tabId });
  $('target-title').textContent = context.title || 'Без названия'; $('target-url').textContent = context.url;
}
function render() {
  const active = taskState.tasks.find((task) => task.id === taskState.activeTaskId);
  if (active && context?.tabId !== active.tabId) {
    context = { tabId: active.tabId, title: active.title, url: active.url };
    $('target-title').textContent = active.title || `Вкладка ${active.tabId}`; $('target-url').textContent = active.url;
  }
  const task = active || taskState.tasks.find((item) => item.id === selectedId) || [...taskState.tasks].reverse().find((item) => item.tabId === context?.tabId);
  const running = !!active;
  if (active) { $('mode').value = active.mode || 'browser'; $('long-run').checked = active.longRun === true; $('long-settings').hidden = !active.longRun; }
  modeHint();
  $('send').textContent = running ? 'Отправить уточнение' : 'Передать задачу';
  $('long-run').disabled = running || $('mode').value !== 'browser' || !$('handoff').checked; $('max-hours').disabled = running;
  $('mode').disabled = running; $('handoff').disabled = running; $('use-tab').disabled = running;
  displayedTask = task; renderAccount(taskState.account, task);
  $('welcome').hidden = !!task;
  $('progress').classList.toggle('running', running && !['waiting_permission', 'sleeping'].includes(active.status)); $('progress').dataset.status = task?.status || 'idle';
  $('progress').hidden = !task; $('stop').hidden = !running;
  $('task-state').textContent = statuses[task?.status] || task?.status || '';
  $('wake').hidden = active?.status !== 'sleeping';
  $('work-caption').textContent = active?.status === 'sleeping' ? 'ЗАПЛАНИРОВАННОЕ ОЖИДАНИЕ' : active?.status === 'waiting_permission' ? 'НУЖНО РАЗРЕШЕНИЕ' : running ? 'CODEX В ДЕЛЕ' : task?.status === 'completed' ? 'ГОТОВО' : 'ВЫПОЛНЕНИЕ ОСТАНОВЛЕНО';
  $('activity').textContent = task?.error || (active?.status === 'sleeping' ? task.sleepReason : active?.status === 'waiting_permission' ? 'Выбери «Разрешить» или «Отказать» выше' : running ? activityLabel(task.activity) : task?.status === 'completed' ? 'Результат проверен · отчёт ниже' : 'Ход работы сохранён');
  const completed = (task?.plan || []).filter(step => step.status === 'completed').length;
  $('step-count').textContent = task?.plan?.length ? `${completed} из ${task.plan.length} этапов` : running ? task.status === 'starting' ? 'Готовится к запуску' : 'Выполняет задачу' : '';
  $('turn-count').textContent = task?.turns ? `${task.turns} / ${task.maxTurns || 20} ходов` : '';
  $('step-fill').style.width = task?.plan?.length ? `${100 * completed / task.plan.length}%` : task?.status === 'completed' ? '100%' : '0%';
  updateElapsed();
  $('plan').replaceChildren();
  for (const step of task?.plan || []) { const el = document.createElement('li'); el.className = step.status; el.textContent = step.step; $('plan').append(el); }
  $('messages').replaceChildren();
  for (const message of task?.messages || []) {
    const el = document.createElement('div'); el.className = 'message ' + message.role;
    const role = document.createElement('span'); role.className = 'role'; role.textContent = message.role === 'user' ? 'Вы' : 'Codex';
    el.append(role, document.createTextNode(message.text)); $('messages').append(el);
  }
  $('history-count').textContent = `(${taskState.tasks.length})`;
  $('history-list').replaceChildren();
  for (const previous of [...taskState.tasks].reverse().filter((item) => item.id !== task?.id)) {
    const button = document.createElement('button'); button.textContent = `${statuses[previous.status] || previous.status} · ${previous.text.slice(0, 90)}`;
    button.onclick = () => { selectedId = previous.id; render(); }; $('history-list').append(button);
  }
}
$('composer').addEventListener('submit', async (event) => {
  event.preventDefault(); error(''); $('send').disabled = true;
  try {
    const text = $('prompt').value.trim(); if (!text) return;
    if (taskState.activeTaskId) {
      const result = await send({ type: 'chat_control', action: 'steer', taskId: taskState.activeTaskId, text });
      if (result.policyUpdated) $('policy-feedback').textContent = `${result.domain}: ${result.mode === 'deny' ? 'доступ запрещён' : 'теперь требуется разрешение'}`;
    }
    else {
      if (!context) await target();
      const task = await send({ type: 'chat_start', tabId: context.tabId, text, mode: $('mode').value, handoff: $('handoff').checked, longRun: $('long-run').checked, maxHours: Number($('max-hours').value) });
      if (task.policyUpdated) $('policy-feedback').textContent = `${task.domain}: ${task.mode === 'deny' ? 'доступ запрещён' : 'теперь требуется разрешение'}`; else selectedId = task.id;
    }
    $('prompt').value = ''; taskState = await send({ type: 'chat_tasks' }); render();
  } catch (err) { error(err.message); } finally { $('send').disabled = false; }
});
$('wake').addEventListener('click', async () => { try { await send({ type: 'chat_control', action: 'wake', taskId: taskState.activeTaskId }); } catch (err) { error(err.message); } });
$('long-run').addEventListener('change', () => { $('long-settings').hidden = !$('long-run').checked; modeHint(); });
$('handoff').addEventListener('change', syncLongMode);
function syncLongMode() { if ($('mode').value !== 'browser' || !$('handoff').checked) $('long-run').checked = false; $('long-run').disabled = $('mode').value !== 'browser' || !$('handoff').checked; $('long-settings').hidden = !$('long-run').checked; modeHint(); }
function modeHint() { $('mode-hint').textContent = $('mode').value === 'development' ? 'Codex сможет изменять исходники этого расширения. Сохраняются копия для отката и результаты проверок. Обновление применяется после завершения задачи.' : $('long-run').checked ? 'Длительная задача: до выбранного срока, 4 часов активной работы и 200 ходов. После ожидания Codex проверит фактический результат.' : 'Codex выполнит этапы и проверит результат. Лимит одного запуска: 30 минут или 20 ходов.'; }
$('stop').addEventListener('click', async () => {
  try { await send({ type: 'chat_control', action: 'cancel', taskId: taskState.activeTaskId }); } catch (err) { error(err.message); }
});
$('use-tab').addEventListener('click', async () => {
  try { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await target(tab?.id); selectedId = null; render(); } catch (err) { error(err.message); }
});
$('mode').addEventListener('change', () => {
  syncLongMode();
  modeHint();
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'tasks_update') { taskState = message.data; render(); }
  if (message.type === 'chat_target' && !taskState.activeTaskId) target(message.tabId).then(render).catch((err) => error(err.message));
});
try { await target(); taskState = await send({ type: 'chat_tasks' }); render(); refreshAccount(); } catch (err) { error(err.message); render(); }
setInterval(updateElapsed, 1000);
setInterval(refreshAccount, 60000);
setInterval(async () => {
  try { const status = await send({ type: 'status' }); $('connection').textContent = status.connected ? 'Подключено к локальному Codex' : 'Нет соединения с мостом'; $('connection').className = 'connection ' + (status.connected ? 'good' : 'error'); renderTemporary(status); $('browser-name').textContent = status.capabilities?.browser === 'firefox' ? 'Firefox' : 'Chromium'; } catch { /* Worker is reloading. */ }
}, 1500);

function activityLabel(activity) {
  const labels = { reasoning: 'Продумывает следующий шаг', agentMessage: 'Пишет ответ', mcpToolCall: 'Взаимодействует со страницей', commandExecution: 'Выполняет команду', fileChange: 'Обновляет исходники', browser_snapshot: 'Изучает страницу', browser_screenshot: 'Смотрит на страницу', browser_click: 'Нажимает на элемент', browser_fill: 'Заполняет поле', browser_type: 'Вводит текст', browser_select: 'Выбирает значение', browser_drag: 'Перемещает элемент', browser_evaluate: 'Проверяет результат', browser_wait: 'Ждёт изменения страницы', browser_tabs: 'Проверяет вкладки', browser_navigate: 'Открывает страницу' };
  return labels[activity] || (activity?.startsWith('browser_') ? 'Выполняет действие на странице' : 'Готовится к следующему шагу');
}
function updateElapsed() {
  const task = displayedTask;
  if (!task) { $('elapsed').textContent = ''; return; }
  const end = ['starting', 'running', 'cancelling', 'waiting_permission', 'sleeping', 'waking'].includes(task.status) ? Date.now() : Date.parse(task.updatedAt || task.createdAt);
  const seconds = Math.max(0, Math.floor((end - Date.parse(task.createdAt)) / 1000));
  $('sleep-until').hidden = task.status !== 'sleeping';
  if (task.status === 'sleeping') { const remaining = Math.max(0, Math.ceil((Date.parse(task.wakeAt) - Date.now()) / 1000)); $('sleep-until').textContent = `Пробуждение ${new Date(task.wakeAt).toLocaleString('ru-RU')} · осталось ${Math.floor(remaining / 3600)} ч ${Math.floor(remaining % 3600 / 60)} мин ${remaining % 60} с${task.wakeError ? ' · ' + task.wakeError : ''}`; }
  $('elapsed').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function windowLabel(minutes, key) {
  if (!minutes) return key === 'primary' ? 'Основной лимит' : 'Дополнительный лимит';
  if (minutes === 10080) return 'За неделю';
  if (minutes % 1440 === 0) return `За ${minutes / 1440} дн.`;
  if (minutes % 60 === 0) return `За ${minutes / 60} ч.`;
  return `За ${minutes} мин.`;
}
function renderAccount(account, task) {
  const model = task?.model || account?.model;
  $('model-label').textContent = task?.model ? 'МОДЕЛЬ ЗАДАЧИ' : 'МОДЕЛЬ В НАСТРОЙКАХ';
  $('model-name').textContent = model || 'Модель не указана';
  $('model-detail').textContent = [task?.effort || account?.effort ? `Рассуждение: ${task?.effort || account.effort}` : '', task?.modelReroutedFrom ? `Переключена с ${task.modelReroutedFrom}` : ''].filter(Boolean).join(' · ');
  const plan = account?.plan || account?.limits?.find(bucket => bucket.plan)?.plan;
  $('account-plan').hidden = !plan; $('account-plan').textContent = plan || '';
  $('quota-windows').replaceChildren();
  for (const bucket of account?.limits || []) for (const window of bucket.windows) {
    const card = document.createElement('div'); card.className = 'quota' + (window.remainingPercent <= 15 ? ' low' : '');
    const label = document.createElement('span'); label.className = 'quota-label'; label.textContent = `${account.limits.length > 1 ? bucket.name + ' · ' : ''}${windowLabel(window.durationMinutes, window.key)}`;
    const remaining = document.createElement('strong'); remaining.textContent = `${window.remainingPercent}%`; const small = document.createElement('small'); small.textContent = 'осталось'; remaining.append(small);
    const track = document.createElement('div'); track.className = 'quota-track'; track.setAttribute('role', 'meter'); track.setAttribute('aria-label', label.textContent + ' — осталось'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', window.remainingPercent);
    const fill = document.createElement('span'); fill.style.width = `${window.remainingPercent}%`; track.append(fill);
    const reset = document.createElement('span'); reset.className = 'quota-reset'; reset.textContent = window.resetsAt ? `Обновится ${new Date(window.resetsAt * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Время обновления неизвестно';
    card.append(label, remaining, track, reset); $('quota-windows').append(card);
  }
  $('quota-status').textContent = account?.limitsError || (account?.limits?.length ? `Данные Codex · ${new Date(account.fetchedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : account?.fetchedAt ? 'Лимиты не предоставлены аккаунтом' : 'Получаем лимиты аккаунта…');
}
async function refreshAccount(force = false) {
  $('refresh-account').disabled = true;
  try { taskState.account = await send({ type: 'chat_account', refresh: force === true }); renderAccount(taskState.account, displayedTask); }
  catch { $('quota-status').textContent = 'Лимиты недоступны. Проверь подключение.'; }
  finally { $('refresh-account').disabled = false; }
}
$('refresh-account').addEventListener('click', () => refreshAccount(true));
for (const button of document.querySelectorAll('[data-prompt]')) button.addEventListener('click', () => { $('prompt').value = button.dataset.prompt; $('prompt').focus(); });
$('prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('composer').requestSubmit(); } });

function renderTemporary(status) {
  const box = $('temporary-tabs'); if (!box) return; box.replaceChildren();
  for (const tab of status.temporaryTabs || []) if (tab.temporary) {
    const row = document.createElement('div'); row.className = 'temporary-row'; row.append(document.createTextNode(`Временная вкладка ${tab.tabId}`));
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary compact'; button.textContent = 'Сохранить';
    button.onclick = async () => { try { await send({ type: 'workspace_control', action: 'keep', tabId: tab.tabId }); row.remove(); } catch (err) { error(err.message); } }; row.append(button); box.append(row);
  }
}
