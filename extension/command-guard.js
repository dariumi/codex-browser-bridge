const cdpMethods = new Set(['Page.getLayoutMetrics', 'Page.getFrameTree', 'Page.captureScreenshot', 'Page.printToPDF', 'Page.navigate', 'Page.reload', 'DOM.getDocument', 'DOM.getFlattenedDocument', 'DOM.querySelector', 'DOM.querySelectorAll', 'DOM.describeNode', 'DOM.resolveNode', 'DOM.getBoxModel', 'DOM.getOuterHTML', 'DOM.setAttributeValue', 'DOM.removeAttribute', 'DOM.focus', 'Runtime.evaluate', 'Runtime.callFunctionOn', 'Runtime.getProperties', 'Runtime.releaseObject', 'Accessibility.getFullAXTree', 'Emulation.setDeviceMetricsOverride', 'Emulation.clearDeviceMetricsOverride']);
export class CommandGuard {
  constructor(api, automation, workspace, policy) { Object.assign(this, { api, automation, workspace, policy }); }
  async target(tabId, action, { advanced = false, frames = true } = {}) {
    const tab = await this.automation.tab(tabId);
    if (/^https?:/.test(tab.url || '')) {
      await this.policy.ensure(tab.url, action);
      if (!this.api.declarativeNetRequest) throw new Error('Access network guard is unavailable. Reload the extension and grant its new permissions.');
      await this.policy.track(tab.id);
      if (frames && this.api.webNavigation) for (const frame of await this.api.webNavigation.getAllFrames({ tabId: tab.id }) || []) if (/^https?:/.test(frame.url)) await this.policy.ensure(frame.url, action);
      if (advanced) await this.policy.ensure(tab.url, action, 'advanced');
    }
    return tab;
  }
  async destination(action, args, tabId) {
    if (!['click', 'press_key'].includes(action)) return;
    if (this.automation.withElement) await this.automation.attach(tabId);
    // Resolve ordinary links/forms before dispatching even a trusted click, including target=_blank.
    const code = function () { const link = this.closest?.('a[href]'); return link?.href || (this.form && (this.type === 'submit' || this.tagName === 'BUTTON') ? this.form.action : null); };
    let url;
    if (this.automation.withElement && (args.ref || args.selector)) url = await this.automation.withElement(tabId, args, code);
    else if (this.automation.page) url = await this.automation.page(tabId, 'destination', args);
    else if (this.automation.evaluate) url = await this.automation.evaluate(tabId, `(() => { const el = ${args.x === undefined ? 'document.activeElement' : `document.elementFromPoint(${Number(args.x)},${Number(args.y)})`}; return (${code.toString()}).call(el || document.body); })()`);
    if (url && /^https?:/.test(url)) await this.policy.ensure(url, action);
  }
  async run(action, args = {}, validate = () => {}) {
    validate(); await this.policy.ready;
    if (action === 'policy') {
      if (args.action === 'inspect') return this.policy.state();
      if (args.action === 'protect') return this.policy.protect(args.domain, args.mode || 'ask', args.reason);
      if (args.action === 'request') return this.policy.request(args.url, 'policy_request', args.kind || 'site');
      throw new Error('MCP cannot grant permissions or weaken restrictions');
    }
    if (action === 'tabs') return (await this.automation.run(action, args, validate)).map(tab => this.policy.redact(tab));
    if (action === 'downloads') return (await this.automation.run(action, args, validate)).map(item => { try { const redacted = this.policy.redact({ url: item.url }); return redacted.restricted ? { id: item.id, state: item.state, restricted: true } : item; } catch { return item; } });
    if (action === 'workspace') {
      if (args.action === 'inspect') { await this.workspace.ready; return { tabs: [...this.workspace.work.values()], created: [...this.workspace.created.values()] }; }
      if (args.action === 'release_all') { const result = await this.workspace.releaseAll(); await this.policy.reset(); return result; }
      if (args.action === 'cleanup') { const result = await this.workspace.cleanup(args.taskId); for (const id of result.closed) await this.policy.untrack(id); return result; }
      if (args.action === 'finish') { const result = await this.workspace.finish(args.taskId, args.tabId); await this.policy.reset(args.taskId); return result; }
      if (args.action === 'merge') return this.workspace.merge();
      if (args.action === 'collapse') return this.workspace.collapse();
      if (args.action === 'keep') return this.workspace.keep(args.tabId);
      if (args.action === 'release') { await this.policy.untrack(args.tabId); return this.workspace.release(args.tabId); }
      const tab = await this.target(args.tabId, 'workspace'); return this.workspace.mark(tab.id, args.label, args.taskId);
    }
    if (action === 'new_tab') {
      await this.policy.ensure(args.url, action); validate();
      const tab = await this.api.tabs.create({ url: 'about:blank', active: args.active ?? true });
      try { await this.policy.track(tab.id); await this.workspace.register(tab.id, args.temporary !== false); validate();
        const result = await this.automation.run('navigate', { tabId: tab.id, url: args.url }, async () => { validate(); await this.policy.ensure(args.url, action); }); await this.target(tab.id, action); return result;
      } catch (error) { throw new Error(`${error.message} (created tab ${tab.id}; cleanup can close it)`); }
    }
    if (['detach', 'close_tab'].includes(action)) { if (action === 'close_tab') await this.target(args.tabId, action, { frames: false }); const result = await this.automation.run(action, args, validate); await this.policy.untrack(args.tabId); this.workspace.created.delete(args.tabId); await this.workspace.persist(); return result; }
    if (action === 'extension_command') {
      if (args.command !== 'invoke') return null; // Caller runs capabilities/reload only.
      const method = args.method, input = args.arguments || [];
      if (method === 'tabs.query') return (await this.api.tabs.query(input[0] || {})).map(tab => this.policy.redact(tab));
      if (method === 'tabs.get') return this.policy.redact(await this.api.tabs.get(input[0]));
      if (method === 'tabs.update') {
        const id = typeof input[0] === 'number' ? input[0] : undefined, properties = input[id === undefined ? 0 : 1];
        const tab = await this.target(id, method); if (properties?.url) await this.policy.ensure(properties.url, method);
        return this.api.tabs.update(tab.id, properties);
      }
      if (method === 'tabs.duplicate') throw new Error('Use browser_new_tab so creation and temporary ownership are tracked');
      if (method === 'tabs.highlight') { const options = input[0]; const tabs = await this.api.tabs.query({ windowId: options?.windowId }); for (const index of [].concat(options?.tabs ?? [])) { const tab = tabs.find(t => t.index === index); if (tab) await this.target(tab.id, method); } }
      if (method === 'tabs.move') for (const id of [].concat(input[0] || [])) await this.target(id, method);
      return null;
    }
    const tab = await this.target(args.tabId, action, { advanced: ['evaluate', 'cdp'].includes(action), frames: action !== 'dialog' });
    if (action === 'navigate') await this.policy.ensure(args.url, action);
    if (action === 'cdp') {
      if (!cdpMethods.has(args.method)) throw new Error('This raw CDP method is disabled by the access guard; use a scoped browser tool.');
      if (args.method === 'Page.navigate') await this.policy.ensure(args.params?.url, action);
    }
    validate();
    const result = await this.automation.run(action, { ...args, tabId: tab.id }, async () => {
      validate(); // Recheck after waiting in the action queue: the user may have navigated meanwhile.
      await this.target(tab.id, action, { advanced: ['evaluate', 'cdp'].includes(action), frames: action !== 'dialog' });
      if (action === 'navigate') await this.policy.ensure(args.url, action);
      if (action === 'cdp' && args.method === 'Page.navigate') await this.policy.ensure(args.params?.url, action);
      await this.destination(action, args, tab.id);
      validate();
    });
    if (['navigate', 'history'].includes(action)) await this.target(tab.id, action);
    return result;
  }
}
