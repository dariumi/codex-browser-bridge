import { connectionIssue, retryAllowed } from './connection-health.js';
import { Scripts } from './scripts.js';
import { validateStep } from './script-actions.js';
import { Integrations, integrationList } from './integrations.js';
import { ViewProfiles } from './view.js';
import { diagnosticURL } from './diagnostics-target.js';
import { VirtualDevices } from './virtual-devices.js';
import { DeviceBridge } from './native-devices.js';
import { api as chrome, capabilities, openChat, openChatPage } from './platform.js';
import { FirefoxAutomation } from './firefox-automation.js';
import { BrowserAutomation } from './automation.js';
import { BrowserWorkspace } from './workspace.js';
import { AccessPolicy, policyInstruction } from './access-policy.js';
import { CommandGuard } from './command-guard.js';
import { extensionCommand } from './commands.js';

const workspace = new BrowserWorkspace(chrome, { owner: () => tasksState.activeTaskId, target: () => tasksState.tasks.find(task => task.id === tasksState.activeTaskId)?.tabId });
const automation = chrome.debugger ? new BrowserAutomation(chrome, workspace) : new FirefoxAutomation(chrome, workspace);
let socket = null, heartbeat = null, retry = null, handshake = null, generation = 0, authBlocked = false;
let connectionStartedAt = 0, lastMessageAt = 0;
let state = { connected: false, enabled: false, error: null, bridgeVersion: null };
const uiPending = new Map();
let tasksState = { tasks: [], activeTaskId: null, timeoutMinutes: 30 }, chatTabId = null;
chrome.storage.session.get('chatTabId').then((saved) => { chatTabId ||= saved.chatTabId || null; });
const broadcast = (message) => chrome.runtime.sendMessage(message).catch(() => {});
function uiRequest(action, args = {}) {
  if (!state.connected || socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Сначала подключите расширение к локальному мосту.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { uiPending.delete(id); reject(new Error('Мост не ответил на запрос. Проверьте состояние перед повторной отправкой.')); }, action === 'updates_apply' ? 15 * 60 * 1000 : action === 'updates_check' ? 200000 : 15000);
    uiPending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ type: 'ui_request', id, action, args }));
  });
}
const policy = new AccessPolicy(chrome, {
  scope: () => tasksState.activeTaskId || 'manual',
  changed: data => { devices?.disconnect(); virtualDevices?.disconnect(); views?.clear(); broadcast({ type: 'policy_update', data }); },
  event: event => {
    if (socket?.readyState === WebSocket.OPEN && state.connected) socket.send(JSON.stringify({ type: 'permission_event', event }));
    if (event.type === 'pending') chrome.notifications.create(`access-${event.request.id}`, { type: 'basic', iconUrl: 'assets/avatar-128.png', title: 'Codex запрашивает разрешение', message: `${event.request.host} · ${event.request.kind === 'advanced' ? 'JavaScript / CDP' : event.request.reason}. Решение доступно в чате расширения.` }).catch(() => {});
  }
});
const devices = new DeviceBridge(chrome, policy);
const virtualDevices = new VirtualDevices(chrome, policy);
const guard = new CommandGuard(chrome, automation, workspace, policy);
const views = new ViewProfiles(chrome, automation, guard);
const scripts = new Scripts(chrome, guard, browserCommand, validateStep, data => broadcast({ type: 'scripts_update', data }));
const integrations = new Integrations(chrome, guard, policy);
async function browserCommand(action, args, validate) {
  if (action === 'view') return views.run(args, validate);
  if (action === 'scripts') { if (['run', 'resume'].includes(args.action) && (!state.connected || !state.enabled)) throw new Error('Connect browser control before running scripts'); return scripts.run(args, validate); }
  if (action === 'extensions') return integrations.run(args, validate);
  if (action === 'devices') { validate(); await policy.ready; const tab = await guard.target(args.tabId, 'devices'); const result = await (args.backend === 'native' ? devices : virtualDevices).run(args, tab); validate(); return result; }
  if (action === 'workspace' && ['finish', 'release_all'].includes(args.action)) { await scripts.run({ action: 'stop' }); await views.clear(); devices.disconnect(); await virtualDevices.disconnect(); }
  const result = await guard.run(action, args, validate);
  return action === 'extension_command' && result === null ? extensionCommand(chrome, args) : result;
}
const badge = (text, color) => { chrome.action.setBadgeText({ text }); chrome.action.setBadgeBackgroundColor({ color }); };
const validate = (settings) => {
  const url = new URL(settings.url);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.protocol === 'ws:' && !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/extension' || url.search || url.username || url.password || url.hash) throw new Error('Use local ws://127.0.0.1:PORT/extension or secure wss://HOST/extension');
  if (!/^[a-f0-9]{64}$/.test(settings.token)) throw new Error('Invalid connection key');
};

async function connect() {
  const epoch = generation;
  const settings = await chrome.storage.local.get(['url', 'token', 'enabled']);
  if (epoch !== generation) return;
  state.enabled = !!settings.enabled;
  if (!settings.enabled || socket || authBlocked) return;
  try { validate(settings); } catch (error) { state.error = error.message; badge('!', '#c23c3c'); return; }
  let ws;
  try { ws = new WebSocket(settings.url); } catch (error) { state.error = error.message; badge('!', '#c23c3c'); return; }
  socket = ws; connectionStartedAt = Date.now(); lastMessageAt = connectionStartedAt;
  handshake = setTimeout(checkConnection, 15000);
  ws.onopen = () => {
    if (epoch !== generation) { ws.close(); return; }
    ws.send(JSON.stringify({ type: 'hello', token: settings.token, version: chrome.runtime.getManifest().version, browser: capabilities(chrome).browser, capabilities: capabilities(chrome) }));
    heartbeat = setInterval(() => { checkConnection(); if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 20000);
  };
  ws.onmessage = async ({ data }) => {
    if (socket !== ws || epoch !== generation) return;
    lastMessageAt = Date.now();
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'ready') { clearTimeout(handshake); handshake = null; state.connected = true; state.bridgeVersion = message.version || null; uiRequest('list').then(data => { tasksState = data; broadcast({ type: 'tasks_update', data }); }).catch(() => {}); state.error = null; badge('ON', '#168457'); return; }
    if (message.type === 'ui_result') {
      const pending = uiPending.get(message.id);
      if (pending) { clearTimeout(pending.timer); uiPending.delete(message.id); message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result); }
      return;
    }
    if (message.type === 'tasks_update') { tasksState = message.data; broadcast({ type: 'tasks_update', data: tasksState }); return; }
    if (message.type === 'task_finished') {
      const task = message.task;
      chrome.notifications.create(`task-${task.id}`, { type: 'basic', iconUrl: 'assets/avatar-128.png', title: task.status === 'completed' ? 'Codex завершил задачу' : 'Codex: выполнение остановлено', message: (task.result || task.error || task.status).slice(0, 220) }).catch(() => {});
      broadcast({ type: 'task_finished', task }); return;
    }
    if (message.type !== 'command' || !state.connected || epoch !== generation) return;
    try {
      const validateCommand = () => {
        if (epoch !== generation) throw new Error('Browser control was paused');
        if (Date.now() > message.expiresAt) throw new Error('Command expired before execution');
      };
      validateCommand();
      const result = await browserCommand(message.action, message.args, validateCommand);
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: message.id, result }));
    } catch (error) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: message.id, error: error.message }));
    }
  };
  ws.onerror = () => { state.error = 'Local bridge is unreachable. Run npm run status on the Codex host.'; };
  ws.onclose = ({ code, reason }) => {
    if (socket !== ws) return;
    clearInterval(heartbeat); clearTimeout(handshake); heartbeat = null; handshake = null; socket = null; state.connected = false; state.bridgeVersion = null;
    scripts.run({ action: 'stop' }).catch(() => {}); views.clear(); devices.disconnect(); virtualDevices.disconnect();
    for (const pending of uiPending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Соединение с мостом потеряно.')); } uiPending.clear();
    if (reason) state.error = reason;
    authBlocked = !retryAllowed(code, reason);
    badge(state.enabled ? 'OFF' : '', '#8b6470');
    // Authentication failures require a corrected key rather than endless retries.
    if (epoch === generation && !authBlocked) retry = setTimeout(connect, code === 1008 ? 10000 : 3000);
  };
}

function checkConnection() {
  const ws = socket;
  if (!ws) { connect().catch(error => { state.error = error.message; }); return; }
  const issue = connectionIssue({ readyState: ws.readyState, startedAt: connectionStartedAt, lastMessageAt, connected: state.connected });
  if (!issue) return;
  state.error = issue;
  // Browser WebSockets have no terminate(). Release stale bookkeeping immediately;
  // a delayed native close event cannot affect a newer socket (identity check).
  const closed = ws.onclose;
  try { ws.close(); } catch {}
  closed?.({ code: 1006, reason: issue });
}

async function disconnect() {
  generation++; authBlocked = false; clearTimeout(retry); clearTimeout(handshake); clearInterval(heartbeat);
  const ws = socket; socket = null;
  if (ws) ws.close();
  for (const pending of uiPending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Соединение отключено.')); } uiPending.clear();
  state.connected = false; state.bridgeVersion = null;
  await scripts.run({ action: 'stop' }); await views.clear();
  devices.disconnect(); await virtualDevices.disconnect(); await automation.detachAll();
  await workspace.releaseAll(); await policy.reset();
  badge('', '#8b6470');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'open_chat' && sender.tab?.id) {
    chatTabId = sender.tab.id; chrome.storage.session.set({ chatTabId });
    openChat(sender.tab.id, chrome).catch(() => openChatPage(sender.tab.id, chrome)).then(() => { broadcast({ type: 'chat_target', tabId: sender.tab.id }); respond({ ok: true }); }).catch((error) => respond({ error: error.message }));
    return true;
  }
  if (message.type === 'page_ready' && sender.tab?.id) {
    workspace.ready.then(() => { const item = workspace.work.get(sender.tab.id); if (item) chrome.tabs.sendMessage(sender.tab.id, { type: 'work_indicator', active: true, label: item.label }).catch(() => {}); });
    respond({ ok: true }); return;
  }
  // Content scripts cannot submit tasks or read chat, configuration, or connection keys.
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ error: 'Extension UI only' }); return; }
  (async () => {
    if (message.type === 'status') return { ...state, version: chrome.runtime.getManifest().version, attachedTabs: [...automation.attached], workingTabs: [...workspace.work.values()], activeTaskId: tasksState.activeTaskId, temporaryTabs: [...workspace.created.values()], capabilities: capabilities(chrome) };
    if (message.type === 'policy_status') { await policy.ready; return policy.state(); }
    if (message.type === 'policy_decide') return policy.decide(message.id, message.allowed === true);
    if (message.type === 'policy_set') return policy.setRule(message.domain, message.mode);
    if (message.type === 'workspace_control') {
      if (tasksState.activeTaskId && ['release_all', 'cleanup'].includes(message.action)) throw new Error('Сначала остановите текущую задачу.');
      if (!['release_all', 'collapse', 'merge', 'cleanup', 'keep'].includes(message.action)) throw new Error('Invalid workspace control');
      return browserCommand('workspace', { action: message.action, tabId: message.tabId });
    }
    if (message.type === 'studio') {
      if (message.section === 'scripts') { if (tasksState.activeTaskId && ['run', 'resume'].includes(message.args?.action)) throw new Error('Stop the managed task before starting a Studio script'); if (message.action === 'retention') return scripts.retention(message.enabled === true); return browserCommand('scripts', message.args, () => {}); }
      if (message.section === 'view') return browserCommand('view', message.args, () => {});
      if (message.section === 'integrations') { const items = integrationList(message.items); await chrome.storage.local.set({ extensionIntegrations: items }); return { saved: true }; }
      throw new Error('Unknown studio section');
    }
    if (message.type === 'diagnostics_open') {
      if (tasksState.activeTaskId) throw new Error('Сначала остановите текущую задачу.');
      return browserCommand('new_tab', { url: diagnosticURL(message.url), temporary: true, active: true }, () => {});
    }
    if (message.type === 'chat_target_set') {
      const tab = await automation.tab(message.tabId); chatTabId = tab.id;
      await chrome.storage.session.set({ chatTabId }); broadcast({ type: 'chat_target', tabId: chatTabId }); return { ok: true };
    }
    if (message.type === 'chat_context') {
      const tab = await automation.tab(message.tabId || chatTabId);
      return { tabId: tab.id, title: tab.title, url: tab.url, connected: state.connected };
    }
    if (message.type === 'chat_account') return uiRequest('account', { refresh: message.refresh === true });
    if (message.type === 'updates_control') {
      if (!['status', 'check', 'apply', 'configure'].includes(message.action)) throw new Error('Invalid update action');
      return uiRequest('updates_' + message.action, { policy: message.policy });
    }
    if (message.type === 'chat_history') {
      if (!['delete', 'clear_history', 'history_settings'].includes(message.action)) throw new Error('Invalid history action');
      tasksState = await uiRequest(message.action, { taskId: message.taskId, retention: message.retention });
      broadcast({ type: 'tasks_update', data: tasksState }); return tasksState;
    }
    if (message.type === 'chat_tasks') { tasksState = await uiRequest('list'); return tasksState; }
    if (message.type === 'chat_start') {
      if (scripts.job?.status === 'running') throw new Error('Stop the script before starting a task');
      const tab = await automation.tab(message.tabId || chatTabId);
      if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('На служебной странице браузера выполнять задачи нельзя. Откройте нужный сайт HTTP(S), затем нажмите «Использовать открытую вкладку».');
      const rule = policyInstruction(message.text, tab.url);
      if (rule) return { policyUpdated: true, ...await policy.setRule(rule.domain, rule.mode) };
      await policy.ensure(tab.url, 'chat_start');
      return uiRequest('start', { text: message.text, tabId: tab.id, title: tab.title, url: tab.url, mode: message.mode, handoff: message.handoff, longRun: message.longRun, maxHours: message.maxHours, model: message.model, effort: message.effort, language: message.language });
    }
    if (message.type === 'chat_control') {
      if (!['cancel', 'steer', 'wake'].includes(message.action)) throw new Error('Invalid task control');
      if (message.action === 'steer') {
        const task = tasksState.tasks.find(item => item.id === message.taskId);
        const tab = await automation.tab(task?.tabId || chatTabId);
        const rule = policyInstruction(message.text, tab.url);
        if (rule) return { policyUpdated: true, ...await policy.setRule(rule.domain, rule.mode) };
      }
      return uiRequest(message.action, { taskId: message.taskId, text: message.text });
    }
    if (message.type === 'open_chat') {
      const opening = chrome.sidebarAction ? openChat(null, chrome).then(() => true, () => false) : null;
      const tab = await automation.tab(); chatTabId = tab.id; await chrome.storage.session.set({ chatTabId });
      if (opening) { if (!await opening) await openChatPage(tab.id, chrome); }
      else await openChat(tab.id, chrome).catch(() => openChatPage(tab.id, chrome)); return { ok: true };
    }
    if (message.type === 'virtual_config') { await chrome.storage.local.set({ virtualDevicesEnabled: message.enabled === true }); if (!message.enabled) await virtualDevices.disconnect(); return { ok: true }; }
    if (message.type === 'native_config') { await chrome.storage.local.set({ nativeDevicesEnabled: message.enabled === true }); if (!message.enabled) devices.disconnect(); return { ok: true }; }
    if (message.type === 'reconnect') { await disconnect(); await connect(); return { ok: true }; }
    if (message.type === 'configure') {
      validate(message.settings);
      await chrome.storage.local.set({ url: message.settings.url, token: message.settings.token, enabled: true });
      await disconnect(); await connect(); return { ok: true };
    }
    if (message.type === 'toggle') {
      if (!message.enabled && tasksState.activeTaskId) await uiRequest('cancel', { taskId: tasksState.activeTaskId }).catch(() => {});
      await chrome.storage.local.set({ enabled: !!message.enabled });
      state.enabled = !!message.enabled;
      await disconnect(); if (state.enabled) await connect(); return { ok: true };
    }
    throw new Error('Unknown extension message');
  })().then(respond).catch((error) => respond({ error: error.message }));
  return true;
});
chrome.notifications.onClicked.addListener(() => {
  const opening = openChat(chatTabId, chrome);
  opening.catch(async () => { const tab = await automation.tab(chatTabId); await openChatPage(tab.id, chrome); }).catch(() => {});
});
async function injectLaunchers() {
  if (!chrome.tabs.query) return;
  for (const tab of await chrome.tabs.query({})) if (/^https?:/.test(tab.url || '')) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
  }
}
chrome.tabs.onUpdated?.addListener((tabId, change, tab) => {
  if (change.status === 'complete' && tab.url) views.navigated(tabId, tab.url).catch(() => {});
  if (change.status === 'complete' && /^https?:/.test(tab.url || '')) chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('reconnect', { periodInMinutes: 0.5 }); connect(); injectLaunchers().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('reconnect', { periodInMinutes: 0.5 }); connect(); injectLaunchers().catch(() => {}); });
injectLaunchers().catch(() => {});
chrome.alarms.onAlarm.addListener(({ name }) => { if (name === 'reconnect') checkConnection(); if (name === 'access_expiry') policy.sync().catch(() => {}); });
chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
connect().catch(error => { state.error = error.message; });

chrome.webNavigation?.onCreatedNavigationTarget.addListener(({ sourceTabId, tabId }) => {
  if (policy.tabs.has(sourceTabId)) policy.track(tabId).then(() => workspace.register(tabId, true)).catch(() => {});
});

chrome.webNavigation?.onErrorOccurred.addListener(details => {
  if (policy.tabs.has(details.tabId) && /^https?:/.test(details.url) && policy.rule(new URL(details.url).hostname)) policy.request(details.url, 'blocked_navigation').catch(() => {});
});
