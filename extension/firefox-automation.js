import { firefoxPageCommand } from './firefox-page.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class FirefoxAutomation {
  constructor(api, workspace) {
    this.api = api; this.workspace = workspace; this.attached = new Set(); this.tail = Promise.resolve();
    api.tabs.onRemoved.addListener((id) => this.attached.delete(id));
  }
  run(action, args = {}, validate = () => {}) {
    const result = this.tail.then(async () => { await validate(); return this.execute(action, args); });
    this.tail = result.catch(() => {}); return result;
  }
  async tab(tabId) {
    const tab = tabId ? await this.api.tabs.get(tabId) : (await this.api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab?.id) throw new Error('No active browser tab'); return tab;
  }
  async loaded(id) {
    for (let i = 0; i < 200; i++) { const tab = await this.tab(id); if (tab.status === 'complete') return { tabId: id, url: tab.url, title: tab.title }; await sleep(100); }
    throw new Error('Navigation timed out; inspect the tab before retrying');
  }
  async navigateWait(tabId, operation) {
    const api = this.api;
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); api.tabs.onUpdated.removeListener(updated); };
      const updated = (id, change, tab) => { if (id === tabId && change.status === 'complete') { cleanup(); resolve({ tabId, url: tab.url, title: tab.title }); } };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Navigation timed out; inspect the tab before retrying')); }, 20000);
      api.tabs.onUpdated.addListener(updated);
      Promise.resolve().then(operation).catch(error => { cleanup(); reject(error); });
    });
  }
  async page(tabId, action, args = {}) {
    const results = await this.api.scripting.executeScript({ target: { tabId }, func: firefoxPageCommand, args: [action, args] });
    if (results[0]?.error) throw new Error(results[0].error.message || String(results[0].error));
    const reply = results[0]?.result;
    if (reply?.error) throw new Error(reply.error);
    return reply?.value;
  }
  async execute(action, args) {
    const api = this.api;
    if (action === 'tabs') return (await api.tabs.query({})).map(({ id, windowId, title, url, active, status }) => ({ tabId: id, windowId, title, url, active, status }));
    if (action === 'new_tab') { if (!/^https?:\/\//.test(args.url)) throw new Error('Only HTTP(S) URLs can be opened'); return this.loaded((await api.tabs.create({ url: args.url, active: args.active ?? true })).id); }
    if (action === 'activate_tab') { const tab = await api.tabs.update(args.tabId, { active: true }); await api.windows.update(tab.windowId, { focused: true }); return { tabId: tab.id }; }
    if (action === 'close_tab') { await this.workspace.release(args.tabId); await api.tabs.remove(args.tabId); return { closed: args.tabId }; }
    if (action === 'detach') { this.attached.delete(args.tabId); await this.workspace.release(args.tabId); return { detached: args.tabId }; }
    if (action === 'downloads') return api.downloads.search({ limit: 30, orderBy: ['-startTime'] });
    if (['cdp', 'upload', 'dialog', 'console', 'network'].includes(action)) throw new Error(`${action} is unavailable in the Firefox DOM backend. Use Chromium for CDP, trusted input, file upload, native dialogs and network/console recording.`);
    const tab = await this.tab(args.tabId), tabId = tab.id;
    if (!/^https?:/.test(tab.url || '') && !(action === 'navigate' && tab.url === 'about:blank')) throw new Error('Open a regular HTTP(S) page to use Firefox automation');
    await this.workspace.mark(tabId); this.attached.add(tabId);
    if (action === 'navigate') { if (!/^https?:\/\//.test(args.url)) throw new Error('Only HTTP(S) URLs can be opened'); return this.navigateWait(tabId, () => api.tabs.update(tabId, { url: args.url })); }
    if (action === 'history') { return this.navigateWait(tabId, () => args.direction === 'reload' ? api.tabs.reload(tabId) : args.direction === 'back' ? api.tabs.goBack(tabId) : api.tabs.goForward(tabId)); }
    if (action === 'evaluate') {
      const [{ result, error } = {}] = await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: async (expression) => {
        try { return { value: await (0, eval)(expression) }; } catch (error) { return { error: error.message }; }
      }, args: [args.expression] });
      if (error || result?.error) throw new Error(error?.message || result.error); return { value: result?.value ?? null };
    }
    if (action === 'screenshot') {
      if (args.fullPage) throw new Error('Full-page screenshots are unavailable in Firefox. Use a viewport screenshot and scroll.');
      const viewport = await this.page(tabId, 'viewport');
      const dataUrl = await api.tabs.captureTab(tabId, { format: 'png' });
      return { data: dataUrl.split(',')[1], tabId, viewport, fullPage: false, coordinateSpace: 'viewport CSS pixels; divide image coordinates by devicePixelRatio' };
    }
    if (action === 'wait') {
      if (!args.selector && !args.text) { await sleep(args.delayMs ?? 500); return { waited: true }; }
      const deadline = Date.now() + (args.timeoutMs ?? 10000);
      do { if (await this.page(tabId, 'condition', args)) return { matched: true }; await sleep(100); } while (Date.now() < deadline);
      throw new Error('Wait condition timed out');
    }
    const value = await this.page(tabId, action, args);
    return action === 'snapshot' ? { tabId, ...value, backend: 'dom', trustedInput: false } : value;
  }
  async detachAll() { this.attached.clear(); }
}
