import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { openChat, openChatPage } from '../extension/platform.js';

test('panel API runs before the handler yields and fallback reuses only extension chat', async () => {
  const events = [], api = { sidePanel: { open: options => { events.push(options.tabId); return Promise.reject(new Error('Gesture rejected')); } } };
  const opening = openChat(7, api); events.push('after'); await assert.rejects(opening, /Gesture/); assert.deepEqual(events, [7, 'after']);
  let update, created = false;
  api.runtime = { getURL: file => `moz-extension://own/${file}` };
  api.tabs = { query: async () => [{ id: 1, url: 'https://user.invalid/chat.html' }, { id: 2, url: 'moz-extension://own/chat.html?tabId=1' }], update: async (id, options) => { update = { id, ...options }; }, create: async () => { created = true; } };
  await openChatPage(7, api); assert.equal(update.id, 2); assert.equal(update.url, 'moz-extension://own/chat.html?tabId=7'); assert.equal(created, false);
});

test('launcher survives DOM removal and reinjection without duplicated listeners; opening errors are visible', async () => {
  const hosts = [], listeners = new Set(), observers = [];
  class Element {
    style = {}; children = []; parentNode = null; listeners = {}; classList = { toggle() {} };
    get isConnected() { return !!this.parentNode; }
    append(...children) { for (const child of children) { child.remove?.(); child.parentNode = this; this.children.push(child); } }
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; } }
    attachShadow() { this.shadow = new Element(); return this.shadow; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
  }
  const root = new Element();
  const document = { documentElement: root, createElement: () => { const e = new Element(); hosts.push(e); return e; }, getElementById: id => root.children.find(x => x.id === id), addEventListener() {}, removeEventListener() {} };
  const api = { storage: { local: { get: async () => ({ language: 'en' }) } }, runtime: { getURL: x => x, sendMessage: async request => request.type === 'open_chat' ? { error: 'Opening failed' } : {}, onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
  const context = vm.createContext({ document, chrome: api, navigator: { language: 'en' }, MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } } });
  const script = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  vm.runInContext(script, context); let host = root.children[0]; assert.ok(host);
  host.remove(); observers[0].fn(); assert.equal(root.children[0], host);
  vm.runInContext(script, context); assert.equal(root.children.length, 1); assert.equal(listeners.size, 1); assert.equal(observers[0].disconnected, true);
  host = root.children[0]; const button = host.shadow.children[1]; button.listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(button.title, 'Opening failed'); assert.equal(button.children[1].textContent, 'Error — retry');
});
