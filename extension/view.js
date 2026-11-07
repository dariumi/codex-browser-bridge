function documentZoom(value, origin) {
  if (location.origin !== origin) return;
  const key = Symbol.for('codex.document.zoom.v1'), style = document.documentElement.style;
  if (value === null) {
    const saved = globalThis[key];
    if (saved && style.getPropertyValue('zoom') === saved.applied) {
      if (saved.value) style.setProperty('zoom', saved.value, saved.priority); else style.removeProperty('zoom');
    }
    delete globalThis[key]; return;
  }
  globalThis[key] ||= { value: style.getPropertyValue('zoom'), priority: style.getPropertyPriority('zoom') };
  style.setProperty('zoom', String(value), 'important'); globalThis[key].applied = style.getPropertyValue('zoom');
}
function navigatorUA(value, origin) {
  if (location.origin !== origin) return;
  const key = Symbol.for('codex.ua.v1');
  if (!value) { const saved = globalThis[key]; if (saved) { if (Object.getOwnPropertyDescriptor(navigator, 'userAgent')?.get === saved.getter) { if (saved.original) Object.defineProperty(navigator, 'userAgent', saved.original); else delete navigator.userAgent; } delete globalThis[key]; } return; }
  globalThis[key] ||= { original: Object.getOwnPropertyDescriptor(navigator, 'userAgent') };
  const getter = () => value; globalThis[key].getter = getter; Object.defineProperty(navigator, 'userAgent', { get: getter, configurable: true });
}
export class ViewProfiles {
  constructor(api, automation, guard) { Object.assign(this, { api, automation, guard }); this.profiles = new Map(); this.epoch = 0; this.nextRuleId = 430000; this.tail = Promise.resolve(); this.ready = this.restore(); api.tabs.onRemoved?.addListener(id => { this.reset(id).catch(() => {}); }); }
  async persist() { await this.api.storage.session.set({ viewProfiles: [...this.profiles] }); }
  async restore() { const saved = (await this.api.storage.session.get('viewProfiles')).viewProfiles || []; for (const [id, item] of saved) { this.profiles.set(id, item); await this.reset(id); } const rules = await this.api.declarativeNetRequest?.getSessionRules?.() || []; const ids = rules.filter(x => x.id >= 430000 && x.id < 440000).map(x => x.id); if (ids.length) await this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids }); }
  run(args, validate = () => {}) { const result = this.tail.then(() => this.execute(args, validate)); this.tail = result.catch(() => {}); return result; }
  async execute(args, validate) {
    await this.ready;
    if (args.action === 'reset') { validate(); return this.reset((await this.automation.tab(args.tabId)).id); }
    const tab = await this.guard.target(args.tabId, 'view', { advanced: args.action !== 'inspect' }); validate();
    const epoch = this.epoch; const check = () => { validate(); if (epoch !== this.epoch) throw new Error('View change cancelled by policy cleanup'); };
    if (args.action === 'inspect') return { profile: this.profiles.get(tab.id)?.config || null, zoom: this.api.debugger ? await this.api.tabs.getZoom(tab.id) : this.profiles.get(tab.id)?.config.zoom ?? 1, zoomMode: this.api.debugger ? 'native-per-tab' : 'document-css', viewportEmulation: !!this.api.debugger, userAgent: this.api.debugger ? 'CDP' : 'origin-scoped HTTP header and current-document navigator override' };
    if (args.action === 'reset') return this.reset(tab.id);
    if (args.action !== 'set') throw new Error('Unknown view action');
    const currentOrigin = new URL(tab.url).origin;
    if (this.profiles.has(tab.id) && this.profiles.get(tab.id).origin !== currentOrigin) await this.reset(tab.id);
    const config = { ...(this.profiles.get(tab.id)?.config || {}), ...args }; delete config.tabId; delete config.action;
    if (config.userAgent !== undefined && (typeof config.userAgent !== 'string' || !config.userAgent || config.userAgent.length > 500 || /[\r\n]/.test(config.userAgent))) throw new Error('Invalid User-Agent');
    if (config.zoom !== undefined && (!Number.isFinite(config.zoom) || config.zoom < 0.25 || config.zoom > 3)) throw new Error('Zoom must be 0.25–3');
    for (const [key, min, max] of [['width',200,3840],['height',200,2160],['deviceScaleFactor',0.5,4]]) if (config[key] !== undefined && (!Number.isFinite(config[key]) || config[key] < min || config[key] > max)) throw new Error(`Invalid ${key}`);
    if (config.colorScheme && !['light','dark','no-preference'].includes(config.colorScheme)) throw new Error('Invalid color scheme');
    if (!this.api.debugger && ['width', 'height', 'mobile', 'touch', 'colorScheme', 'timezone', 'locale', 'deviceScaleFactor'].some(key => config[key] !== undefined)) throw new Error('Firefox supports document CSS zoom and scoped User-Agent here; CDP viewport/theme/timezone emulation is unavailable');
    const origin = new URL(tab.url).origin;
    if (!/^https?:/.test(origin)) throw new Error('View changes require HTTP(S)');
    let record = this.profiles.get(tab.id);
    if (record && record.origin !== origin) { await this.reset(tab.id); record = null; }
    const id = record?.ruleId ?? await this.ruleId();
    this.profiles.set(tab.id, { config, origin, ruleId: id, originalZoom: record?.originalZoom ?? await this.api.tabs.getZoom(tab.id), originalZoomSettings: record?.originalZoomSettings ?? (this.api.tabs.getZoomSettings ? await this.api.tabs.getZoomSettings(tab.id) : null) });
    await this.persist();
    try {
      check();
      if (config.zoom !== undefined) {
        if (this.api.debugger) { await this.api.tabs.setZoomSettings(tab.id, { mode: 'automatic', scope: 'per-tab' }); await this.api.tabs.setZoom(tab.id, config.zoom); }
        else await this.api.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: documentZoom, args: [config.zoom, origin] });
      }
      check();
      if (this.api.debugger) {
        await this.automation.attach(tab.id);
        const send = async (method, params) => { check(); const result = await this.automation.cdp(tab.id, method, params); check(); return result; };
        if (config.width !== undefined || config.height !== undefined) await send('Emulation.setDeviceMetricsOverride', { width: config.width || 1280, height: config.height || 800, deviceScaleFactor: config.deviceScaleFactor || 1, mobile: !!config.mobile });
        if (config.touch !== undefined) await send('Emulation.setTouchEmulationEnabled', { enabled: config.touch });
        if (config.colorScheme) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: config.colorScheme }] });
        if (config.timezone) await send('Emulation.setTimezoneOverride', { timezoneId: config.timezone });
        if (config.locale) await send('Emulation.setLocaleOverride', { locale: config.locale });
        if (config.userAgent) await send('Emulation.setUserAgentOverride', { userAgent: config.userAgent, ...(config.locale ? { acceptLanguage: config.locale } : {}) });
      } else if (config.userAgent) {
        await this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: [{ id, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'user-agent', operation: 'set', value: config.userAgent }] }, condition: { tabIds: [tab.id], regexFilter: '^' + origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/|$)', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'media', 'script', 'image', 'stylesheet', 'font', 'other'] } }] });
        check(); await this.api.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: navigatorUA, args: [config.userAgent, origin] });
      }
      check(); return { profile: config, reloadRequired: !!config.userAgent, note: 'Not a full device fingerprint. Firefox early page scripts/workers/client hints may retain native identity.' };
    } catch (error) { await this.reset(tab.id).catch(() => {}); throw error; }
  }
  async ruleId() { if (this.nextRuleId >= 440000) throw new Error('View rule limit reached; restart browser control'); return this.nextRuleId++; }
  async reset(tabId) {
    const item = this.profiles.get(tabId); if (!item) return { reset: true }; this.profiles.delete(tabId);
    const errors = [], attempt = async fn => { try { await fn(); } catch (error) { errors.push(error.message); } };
    if (this.api.debugger && item.config.zoom !== undefined) {
      await attempt(() => this.api.tabs.setZoomSettings(tabId, { mode: 'automatic', scope: 'per-tab' }));
      await attempt(() => this.api.tabs.setZoom(tabId, item.originalZoom));
      if (item.originalZoomSettings) await attempt(() => this.api.tabs.setZoomSettings(tabId, { mode: item.originalZoomSettings.mode, scope: item.originalZoomSettings.scope }));
    }
    if (this.api.debugger) {
      for (const [method, params] of [['Emulation.clearDeviceMetricsOverride', {}], ['Emulation.setTouchEmulationEnabled', { enabled: false }], ['Emulation.setEmulatedMedia', { features: [] }], ['Emulation.setTimezoneOverride', { timezoneId: '' }], ['Emulation.setLocaleOverride', { locale: '' }], ['Emulation.setUserAgentOverride', { userAgent: '' }]]) await attempt(() => this.automation.cdp(tabId, method, params));
    } else {
      await attempt(() => this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [item.ruleId] }));
      const tab = await this.api.tabs.get(tabId).catch(() => null);
      if (tab?.url && new URL(tab.url).origin === item.origin) {
        await attempt(() => this.api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: navigatorUA, args: [null, item.origin] }));
        await attempt(() => this.api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: documentZoom, args: [null, item.origin] }));
      }
    }
    await this.persist(); return { reset: !errors.length, errors };
  }
  clear() { this.epoch++; return Promise.allSettled([...this.profiles.keys()].map(id => this.reset(id))); }
  async navigated(tabId, url) {
    const item = this.profiles.get(tabId); if (!item) return;
    if (new URL(url).origin !== item.origin) return this.reset(tabId);
    try { await this.guard.target(tabId, 'view_reapply', { advanced: true }); } catch { await this.reset(tabId); return; }
    if (this.profiles.get(tabId) !== item) return;
    if (item.config.zoom !== undefined) {
      if (this.api.debugger) { await this.api.tabs.setZoomSettings(tabId, { mode: 'automatic', scope: 'per-tab' }); await this.api.tabs.setZoom(tabId, item.config.zoom); }
      else await this.api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: documentZoom, args: [item.config.zoom, item.origin] });
    }
    if (this.profiles.get(tabId) !== item) return;
    if (!this.api.debugger && item.config.userAgent) await this.api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: navigatorUA, args: [item.config.userAgent, item.origin] });
  }
}
