// User decisions live in extension UI; MCP can add restrictions but cannot grant access.
export const defaultRules = [
  ['mail.google.com', 'Почта'], ['outlook.live.com', 'Почта'], ['outlook.office.com', 'Почта'], ['mail.yahoo.com', 'Почта'], ['mail.ru', 'Почта'], ['mail.yandex.ru', 'Почта'], ['proton.me', 'Почта'],
  ['accounts.google.com', 'Аккаунт'], ['account.microsoft.com', 'Аккаунт'], ['appleid.apple.com', 'Аккаунт'], ['myaccount.google.com', 'Аккаунт'],
  ['paypal.com', 'Платежи'], ['stripe.com', 'Платежи'], ['pay.google.com', 'Платежи'], ['online.sberbank.ru', 'Банк'], ['tbank.ru', 'Банк'], ['alfabank.ru', 'Банк'], ['vtb.ru', 'Банк'], ['chase.com', 'Банк'], ['bankofamerica.com', 'Банк'],
  ['binance.com', 'Финансы'], ['coinbase.com', 'Финансы'], ['gosuslugi.ru', 'Госуслуги'], ['nalog.gov.ru', 'Госуслуги'],
  ['web.whatsapp.com', 'Сообщения'], ['web.telegram.org', 'Сообщения'], ['slack.com', 'Сообщения'], ['discord.com', 'Сообщения'],
  ['drive.google.com', 'Личные файлы'], ['dropbox.com', 'Личные файлы'], ['1password.com', 'Пароли'], ['bitwarden.com', 'Пароли']
].map(([domain, reason]) => ({ domain, reason, mode: 'ask', builtin: true }));
export function domainOf(value) {
  const text = String(value || '').trim().replace(/^\*\./, '');
  const url = new URL(text.includes('://') ? text : `https://${text}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || /[\s*]/.test(url.hostname)) throw new Error('Enter an HTTP(S) URL or domain');
  return url.hostname.toLowerCase().replace(/\.$/, '');
}
const matches = (host, domain) => host === domain || host.endsWith('.' + domain);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const types = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'];
export class AccessPolicy {
  constructor(api, { scope = () => 'manual', changed = () => {}, event = () => {} } = {}) {
    this.api = api; this.scope = scope; this.changed = changed; this.event = event;
    this.rules = []; this.requests = []; this.grants = []; this.tabs = new Map(); this.tail = Promise.resolve(); this.ready = this.restore();
    api.tabs.onRemoved?.addListener(id => { this.tabs.delete(id); this.sync().catch(() => {}); });
  }
  async restore() {
    const saved = await this.api.storage.local.get('accessRules');
    this.rules = saved.accessRules || defaultRules.map(rule => ({ ...rule }));
    const session = await this.api.storage.session.get(['accessGrants', 'accessRequests', 'accessTabs']);
    this.grants = session.accessGrants || []; this.requests = session.accessRequests || [];
    this.tabs = new Map(session.accessTabs || []); await this.sync();
  }
  state() { return { rules: this.rules, requests: this.requests.slice(-40), grants: this.grants.filter(g => g.expiresAt > Date.now()), networkGuard: !!this.api.declarativeNetRequest }; }
  rule(host) { return this.rules.filter(r => matches(host, r.domain)).sort((a, b) => (b.mode === 'deny') - (a.mode === 'deny') || b.domain.length - a.domain.length)[0]; }
  granted(host, kind, scope = this.scope() || 'manual') { return this.grants.some(g => g.host === host && g.kind === kind && (g.scope === scope || g.scope === 'manual') && g.expiresAt > Date.now()); }
  async persist() {
    await this.api.storage.session.set({ accessGrants: this.grants, accessRequests: this.requests.slice(-40), accessTabs: [...this.tabs] }); this.changed(this.state());
  }
  async setRule(domain, mode, reason = 'Правило пользователя') {
    await this.ready; domain = domainOf(domain);
    if (!['ask', 'deny', 'allow'].includes(mode)) throw new Error('Invalid access mode');
    this.rules = this.rules.filter(r => r.domain !== domain);
    if (mode !== 'allow') this.rules.push({ domain, mode, reason: String(reason).slice(0, 150), builtin: false });
    // A changed rule invalidates all relevant prior grants, including advanced permissions.
    this.grants = this.grants.filter(g => !matches(g.host, domain));
    await this.api.storage.local.set({ accessRules: this.rules }); await this.sync(); await this.persist();
    return { domain, mode };
  }
  async protect(domain, mode, reason) {
    if (!['ask', 'deny'].includes(mode)) throw new Error('MCP cannot remove restrictions or grant permissions');
    const host = domainOf(domain); await this.ready;
    if (this.rule(host)?.mode === 'deny' && mode === 'ask') throw new Error('MCP cannot weaken a deny rule');
    return this.setRule(host, mode, reason);
  }
  async request(url, action, kind = 'site') {
    await this.ready; const host = domainOf(url), scope = this.scope() || 'manual';
    const rule = this.rule(host);
    if (kind === 'site' && (!rule || this.granted(host, kind, scope))) return { allowed: true, host };
    if (kind === 'site' && rule?.mode === 'deny') throw new Error(`ACCESS_DENIED: ${host} is blocked by the user. Do not work around this rule.`);
    if (kind === 'advanced' && this.granted(host, kind, scope)) return { allowed: true, host };
    const old = this.requests.find(r => r.host === host && r.kind === kind && r.scope === scope && ['pending', 'denied'].includes(r.status));
    if (old?.status === 'denied') throw new Error(`ACCESS_DENIED: user declined ${kind} access to ${host}`);
    if (old) { this.event({ type: 'pending', request: old }); return old; }
    const request = { id: crypto.randomUUID(), host, origin: new URL(url).origin, action, kind, scope, reason: kind === 'advanced' ? 'JavaScript / CDP может выполнять произвольные действия на странице. Разрешение не отменяет ограничения доменов.' : rule.reason, status: 'pending', createdAt: new Date().toISOString() };
    this.requests.push(request); await this.sync(); await this.persist(); this.event({ type: 'pending', request }); return request;
  }
  async ensure(url, action, kind = 'site') {
    const request = await this.request(url, action, kind);
    if (!request.allowed) throw new Error(`ACCESS_APPROVAL_REQUIRED: ${request.kind} access to ${request.host}. Request ${request.id} is waiting in the extension UI. Ask the user and stop until they decide; never approve it yourself.`);
  }
  async decide(id, allowed) {
    await this.ready; const request = this.requests.find(r => r.id === id && r.status === 'pending');
    if (!request) throw new Error('Permission request is no longer pending');
    if (allowed && request.kind === 'site' && this.rule(request.host)?.mode === 'deny') throw new Error('Site is blocked. Change the rule in settings first.');
    request.status = allowed ? 'allowed' : 'denied'; request.decidedAt = new Date().toISOString();
    if (allowed) this.grants.push({ host: request.host, kind: request.kind, scope: request.scope, expiresAt: Date.now() + 15 * 60 * 1000 });
    await this.sync(); await this.persist(); this.event({ type: 'decision', allowed: !!allowed, request }); return this.state();
  }
  async track(tabId) { await this.ready; if (this.tabs.get(tabId) === (this.scope() || 'manual')) return; this.tabs.set(tabId, this.scope() || 'manual'); await this.sync(); await this.persist(); }
  async untrack(tabId) { await this.ready; this.tabs.delete(tabId); await this.sync(); await this.persist(); }
  async reset(scope) {
    await this.ready;
    this.grants = scope ? this.grants.filter(g => g.scope !== scope) : [];
    for (const request of this.requests) if (request.status === 'pending' && (!scope || request.scope === scope)) request.status = 'cancelled';
    if (scope) { for (const [tabId, owner] of this.tabs) if (owner === scope) this.tabs.delete(tabId); } else this.tabs.clear();
    await this.sync(); await this.persist();
  }
  redact(tab) {
    try { const host = domainOf(tab.url); if (this.rule(host) && !this.granted(host, 'site')) return { tabId: tab.tabId ?? tab.id, windowId: tab.windowId, active: tab.active, status: tab.status, restricted: true }; } catch { /* Internal page metadata is not controlled. */ }
    return tab;
  }
  sync() {
    const operation = this.tail.then(async () => {
      if (!this.api.declarativeNetRequest) return;
      const removeRuleIds = (await this.api.declarativeNetRequest.getSessionRules()).filter(r => r.id >= 410000 && r.id < 420000).map(r => r.id);
      const addRules = []; let id = 410000;
      const tabIds = [...this.tabs.keys()];
      for (const rule of this.rules) if (tabIds.length) addRules.push({ id: id++, priority: rule.mode === 'deny' ? 10 : 2, action: { type: 'block' }, condition: { requestDomains: [rule.domain], tabIds, resourceTypes: types } });
      for (const grant of this.grants.filter(g => g.kind === 'site' && g.expiresAt > Date.now())) {
        const allowedTabs = [...this.tabs].filter(([, owner]) => (owner === grant.scope || grant.scope === 'manual')).map(([tab]) => tab);
        if (allowedTabs.length) addRules.push({ id: id++, priority: 5, action: { type: 'allow' }, condition: { regexFilter: `^https?://${escape(grant.host)}(:[0-9]+)?(/|$)`, tabIds: allowedTabs, resourceTypes: types } });
      }
      await this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
      const expirations = this.grants.filter(g => g.expiresAt > Date.now()).map(g => g.expiresAt);
      if (expirations.length) this.api.alarms?.create('access_expiry', { when: Math.min(...expirations) });
      else await this.api.alarms?.clear?.('access_expiry');
    });
    this.tail = operation.catch(() => {}); return operation;
  }
}
export function policyInstruction(text, currentUrl) {
  const input = text.trim();
  if (input.length > 400 || !/^(?:сюда\b|сюда\s|на\s|не\s+(?:ходи|заходи|открывай)|запрети|спрашивай|do not|don't|never|ask me)/i.test(input) || !/(?:без\s+(?:моего\s+)?разрешения|не\s+(?:ходи|заходи|открывай)|запрети|спрашивай|permission|never)/i.test(input)) return null;
  const match = input.match(/https?:\/\/[^\s,;]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?::[0-9]+)?/i);
  const domain = domainOf(match?.[0] || currentUrl);
  const mode = /(?:полностью|вообще|навсегда|запрети|never)/i.test(input) && !/(?:без.*разрешения|without.*permission)/i.test(input) ? 'deny' : 'ask';
  return { domain, mode };
}
