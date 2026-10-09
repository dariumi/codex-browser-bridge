import { BrowserAutomation } from './automation.js';

const automation = new BrowserAutomation();
let socket = null, heartbeat = null, retry = null, generation = 0, authBlocked = false;
let state = { connected: false, enabled: false, error: null };
const badge = (text, color) => { chrome.action.setBadgeText({ text }); chrome.action.setBadgeBackgroundColor({ color }); };
const validate = (settings) => {
  const url = new URL(settings.url);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/extension' || url.search || url.username || url.password || url.hash) throw new Error('Use ws://127.0.0.1:PORT/extension');
  if (!/^[a-f0-9]{64}$/.test(settings.token)) throw new Error('Invalid connection key');
};

async function connect() {
  const epoch = generation;
  const settings = await chrome.storage.local.get(['url', 'token', 'enabled']);
  if (epoch !== generation) return;
  state.enabled = !!settings.enabled;
  if (!settings.enabled || socket || authBlocked) return;
  try { validate(settings); } catch (error) { state.error = error.message; badge('!', '#c23c3c'); return; }
  const ws = new WebSocket(settings.url);
  socket = ws;
  ws.onopen = () => {
    if (epoch !== generation) { ws.close(); return; }
    ws.send(JSON.stringify({ type: 'hello', token: settings.token }));
    heartbeat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 20000);
  };
  ws.onmessage = async ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'ready') { state.connected = true; state.error = null; badge('ON', '#168457'); return; }
    if (message.type !== 'command' || !state.connected || epoch !== generation) return;
    try {
      const result = await automation.run(message.action, message.args, () => {
        if (epoch !== generation) throw new Error('Browser control was paused');
        if (Date.now() > message.expiresAt) throw new Error('Command expired before execution');
      });
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: message.id, result }));
    } catch (error) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: message.id, error: error.message }));
    }
  };
  ws.onerror = () => { state.error = 'Local bridge is unreachable. Run npm run status on the Codex host.'; };
  ws.onclose = ({ code, reason }) => {
    if (socket !== ws) return;
    clearInterval(heartbeat); heartbeat = null; socket = null; state.connected = false;
    if (reason) state.error = reason;
    if (code === 1008) authBlocked = true;
    badge(state.enabled ? 'OFF' : '', '#8b6470');
    // Authentication failures require a corrected key rather than endless retries.
    if (epoch === generation && code !== 1008) retry = setTimeout(connect, 3000);
  };
}

async function disconnect() {
  generation++; authBlocked = false; clearTimeout(retry); clearInterval(heartbeat);
  const ws = socket; socket = null;
  if (ws) ws.close();
  state.connected = false;
  await automation.detachAll();
  badge('', '#8b6470');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    if (message.type === 'status') return { ...state, attachedTabs: [...automation.attached] };
    if (message.type === 'configure') {
      validate(message.settings);
      await chrome.storage.local.set({ url: message.settings.url, token: message.settings.token, enabled: true });
      await disconnect(); await connect(); return { ok: true };
    }
    if (message.type === 'toggle') {
      await chrome.storage.local.set({ enabled: !!message.enabled });
      state.enabled = !!message.enabled;
      await disconnect(); if (state.enabled) await connect(); return { ok: true };
    }
    throw new Error('Unknown extension message');
  })().then(respond).catch((error) => respond({ error: error.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('reconnect', { periodInMinutes: 0.5 }); connect(); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('reconnect', { periodInMinutes: 0.5 }); connect(); });
chrome.alarms.onAlarm.addListener(({ name }) => { if (name === 'reconnect' && !socket) connect(); });
connect();
