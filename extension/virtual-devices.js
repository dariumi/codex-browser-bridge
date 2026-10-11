import { virtualMediaPage } from './virtual-media-page.js';
export class VirtualDevices {
  constructor(api, policy) { this.api = api; this.policy = policy; this.tabs = new Map(); this.generation = 0; }
  async run(args, tab) {
    if (args.action === 'stop') return this.stop(tab.id);
    let generation = this.generation;
    if (args.action !== 'status') {
      const settings = await this.api.storage.local.get('virtualDevicesEnabled');
      if (!settings.virtualDevicesEnabled) throw new Error('Enable page-scoped virtual devices in extension settings first');
      await this.policy.ensure(tab.url, 'virtual_media', 'advanced');
      // A newly granted approval also triggers policy cleanup. Start the feed in
      // that new generation, then detect cancellation during script execution.
      generation = this.generation;
      if (!(await this.api.storage.local.get('virtualDevicesEnabled')).virtualDevicesEnabled) throw new Error('Virtual device request cancelled');
    }
    const [{ result, error } = {}] = await this.api.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: virtualMediaPage, args: [{ ...args, expectedOrigin: new URL(tab.url).origin }] });
    if (error) throw new Error(error.message || String(error));
    if (args.action !== 'status') {
      this.tabs.set(tab.id, new URL(tab.url).origin);
      if (generation !== this.generation) { await this.stop(tab.id); throw new Error('Virtual device request cancelled'); }
    }
    return result;
  }
  async stop(tabId) {
    const origin = this.tabs.get(tabId); this.tabs.delete(tabId);
    if (!origin) return { stopped: true, backend: 'virtual' };
    const tab = await this.api.tabs.get(tabId).catch(() => null);
    // Cleanup only our recorded document origin, never read a newly navigated protected page.
    if (tab?.url && new URL(tab.url).origin === origin) await this.api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: virtualMediaPage, args: [{ action: 'stop', expectedOrigin: origin }] });
    return { stopped: true, backend: 'virtual' };
  }
  disconnect() { this.generation++; const ids = [...this.tabs.keys()]; return Promise.allSettled(ids.map(id => this.stop(id))); }
}
