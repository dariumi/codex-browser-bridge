const $ = (id) => document.getElementById(id);
let context = null, taskState = { tasks: [], activeTaskId: null }, selectedId = null;
const statuses = { starting: 'Запускаем Codex…', running: 'Codex работает', cancelling: 'Останавливаем…', completed: 'Задача завершена', failed: 'Ошибка выполнения', interrupted: 'Остановлено', blocked: 'Нужны дополнительные данные', limited: 'Достигнут лимит запуска' };
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
  const task = taskState.tasks.find((item) => item.id === selectedId) || active || [...taskState.tasks].reverse().find((item) => item.tabId === context?.tabId);
  const running = !!active;
  $('send').textContent = running ? 'Отправить уточнение' : 'Передать задачу';
  $('mode').disabled = running; $('handoff').disabled = running; $('use-tab').disabled = running;
  $('progress').hidden = !task; $('stop').hidden = !running;
  $('task-state').textContent = statuses[task?.status] || task?.status || '';
  $('activity').textContent = task?.error || (running && task.activity ? `Действие: ${task.activity}` : '');
  $('plan').replaceChildren();
  for (const step of task?.plan || []) { const el = document.createElement('li'); el.className = step.status; el.textContent = (step.status === 'completed' ? '✓ ' : '') + step.step; $('plan').append(el); }
  $('messages').replaceChildren();
  for (const message of task?.messages || []) {
    const el = document.createElement('div'); el.className = 'message ' + message.role;
    const role = document.createElement('span'); role.className = 'role'; role.textContent = message.role === 'user' ? 'Вы' : 'Codex';
    el.append(role, document.createTextNode(message.text)); $('messages').append(el);
  }
  if (!task) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Опишите задачу для открытой страницы. Ход работы и итог появятся здесь.'; $('messages').append(p); }
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
    if (taskState.activeTaskId) await send({ type: 'chat_control', action: 'steer', taskId: taskState.activeTaskId, text });
    else {
      if (!context) await target();
      const task = await send({ type: 'chat_start', tabId: context.tabId, text, mode: $('mode').value, handoff: $('handoff').checked });
      selectedId = task.id;
    }
    $('prompt').value = ''; taskState = await send({ type: 'chat_tasks' }); render();
  } catch (err) { error(err.message); } finally { $('send').disabled = false; }
});
$('stop').addEventListener('click', async () => {
  try { await send({ type: 'chat_control', action: 'cancel', taskId: taskState.activeTaskId }); } catch (err) { error(err.message); }
});
$('use-tab').addEventListener('click', async () => {
  try { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await target(tab?.id); selectedId = null; render(); } catch (err) { error(err.message); }
});
$('mode').addEventListener('change', () => {
  $('mode-hint').textContent = $('mode').value === 'development' ? 'Codex сможет изменять исходники этого расширения. Сохраняются копия для отката и результаты проверок. Обновление применяется после завершения задачи.' : 'Codex выполнит этапы и проверит результат. Лимит одного запуска: 30 минут или 20 ходов.';
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'tasks_update') { taskState = message.data; render(); }
  if (message.type === 'chat_target' && !taskState.activeTaskId) target(message.tabId).then(render).catch((err) => error(err.message));
});
try { await target(); taskState = await send({ type: 'chat_tasks' }); render(); } catch (err) { error(err.message); render(); }
setInterval(async () => {
  try { const status = await send({ type: 'status' }); $('connection').textContent = status.connected ? 'Подключено к локальному Codex' : 'Нет соединения с мостом'; $('connection').className = status.connected ? 'good' : 'error'; } catch { /* Worker is reloading. */ }
}, 1500);
