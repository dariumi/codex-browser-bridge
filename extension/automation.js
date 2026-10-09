const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const supportedUrl = (url) => /^(https?:|file:|about:blank)/.test(url || '');

export class BrowserAutomation {
  constructor(api = chrome, workspace = null) {
    this.api = api;
    this.workspace = workspace;
    this.attached = new Set();
    this.logs = new Map();
    this.requests = new Map();
    this.dialogs = new Map();
    this.drags = new Map();
    this.tail = Promise.resolve();
    this.ready = this.restoreAttachments();
    api.debugger.onDetach.addListener(({ tabId }) => { this.attached.delete(tabId); this.dialogs.delete(tabId); this.persistAttachments(); });
    api.tabs.onRemoved.addListener((tabId) => { this.attached.delete(tabId); this.logs.delete(tabId); this.requests.delete(tabId); this.dialogs.delete(tabId); this.drags.delete(tabId); this.persistAttachments(); });
    api.debugger.onEvent.addListener((source, method, params) => this.event(source.tabId, method, params));
  }

  async restoreAttachments() {
    if (!this.api.storage?.session) return;
    const { ownedTabs = [] } = await this.api.storage.session.get('ownedTabs');
    const targets = await this.api.debugger.getTargets();
    for (const id of ownedTabs) if (targets.some((target) => target.tabId === id && target.attached)) this.attached.add(id);
  }

  persistAttachments() {
    this.api.storage?.session?.set({ ownedTabs: [...this.attached] }).catch(() => {});
  }

  event(tabId, method, params) {
    const append = (map, value) => { const values = map.get(tabId) || []; values.push(value); if (values.length > 300) values.shift(); map.set(tabId, values); };
    if (method === 'Runtime.consoleAPICalled') append(this.logs, { level: params.type, timestamp: params.timestamp, text: params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ') });
    if (method === 'Runtime.exceptionThrown') append(this.logs, { level: 'error', timestamp: params.timestamp, text: params.exceptionDetails.exception?.description || params.exceptionDetails.text });
    if (method === 'Network.requestWillBeSent') append(this.requests, { requestId: params.requestId, event: 'request', url: params.request.url, method: params.request.method, type: params.type, timestamp: params.timestamp });
    if (method === 'Network.responseReceived') append(this.requests, { requestId: params.requestId, event: 'response', url: params.response.url, status: params.response.status, mimeType: params.response.mimeType, timestamp: params.timestamp });
    if (method === 'Network.loadingFailed') append(this.requests, { requestId: params.requestId, event: 'failed', error: params.errorText });
    if (method === 'Page.javascriptDialogOpening') this.dialogs.set(tabId, { type: params.type, message: params.message, defaultPrompt: params.defaultPrompt });
    if (method === 'Page.javascriptDialogClosed') this.dialogs.delete(tabId);
    if (method === 'Input.dragIntercepted') this.drags.set(tabId, params.data);
  }

  // Serial execution prevents simultaneous gestures and unexpected focus changes.
  run(action, args, validate = () => {}) {
    // Dialog control must unblock an evaluate/click waiting for a modal dialog.
    if (action === 'dialog') { validate(); return this.execute(action, args); }
    const result = this.tail.then(() => { validate(); return this.execute(action, args); });
    this.tail = result.catch(() => {});
    return result;
  }

  async tab(tabId) {
    const tab = tabId ? await this.api.tabs.get(tabId) : (await this.api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab?.id) throw new Error('No active browser tab');
    return tab;
  }

  async attach(tabId) {
    await this.ready;
    if (this.attached.has(tabId)) return;
    const tab = await this.tab(tabId);
    if (!supportedUrl(tab.url)) throw new Error('This browser page cannot be controlled. Open a regular HTTP(S) page.');
    try { await this.api.debugger.attach({ tabId }, '1.3'); }
    catch (error) { throw new Error(`Cannot attach to tab ${tabId}. Close its DevTools and retry. ${error.message}`); }
    this.attached.add(tabId);
    this.persistAttachments();
    try {
      for (const method of ['Page.enable', 'Runtime.enable', 'DOM.enable', 'Network.enable', 'Accessibility.enable']) await this.cdp(tabId, method);
    } catch (error) {
      this.attached.delete(tabId);
      this.persistAttachments();
      await this.api.debugger.detach({ tabId }).catch(() => {});
      throw error;
    }
  }

  cdp(tabId, method, params = {}, sessionId) {
    return this.api.debugger.sendCommand(sessionId ? { tabId, sessionId } : { tabId }, method, params);
  }

  async evaluate(tabId, expression, awaitPromise = true) {
    const result = await this.cdp(tabId, 'Runtime.evaluate', { expression, awaitPromise, returnByValue: true, timeout: 30000 });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    if (result.result.subtype === 'error') throw new Error(result.result.description);
    return result.result.value ?? (result.result.type === 'undefined' ? null : result.result.unserializableValue);
  }

  async withElement(tabId, target, fn, args = [], command) {
    let object;
    if (target.ref) {
      if (!/^b[1-9]\d*$/.test(target.ref)) throw new Error('Invalid element ref');
      object = (await this.cdp(tabId, 'DOM.resolveNode', { backendNodeId: Number(target.ref.slice(1)) })).object;
    } else if (target.selector) {
      const lookup = `(() => {
        const found = [];
        function visit(root) {
          found.push(...root.querySelectorAll(${JSON.stringify(target.selector)}));
          for (const el of root.querySelectorAll('*')) if (el.shadowRoot) visit(el.shadowRoot);
        }
        visit(document);
        if (found.length !== 1) throw new Error('Selector must match exactly one element; matched ' + found.length);
        return found[0];
      })()`;
      const result = await this.cdp(tabId, 'Runtime.evaluate', { expression: lookup });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      object = result.result;
    } else throw new Error('Provide a CSS selector or snapshot ref');
    if (!object?.objectId) throw new Error('Element not found; refresh the snapshot');
    try {
      const result = await this.cdp(tabId, 'Runtime.callFunctionOn', {
        objectId: object.objectId, functionDeclaration: fn.toString(), arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return command ? await command(object.objectId) : result.result.value;
    } finally { await this.cdp(tabId, 'Runtime.releaseObject', { objectId: object.objectId }).catch(() => {}); }
  }

  async point(tabId, target, scroll = true) {
    if (target.selector || target.ref) return this.withElement(tabId, target, function () {
      if (!this.isConnected || typeof this.getBoundingClientRect !== 'function') throw new Error('Element is stale or not an HTML element');
      if (arguments[0]) this.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const rect = this.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(this).visibility === 'hidden') throw new Error('Element is not visible');
      const left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
      const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
      if (right <= left || bottom <= top) throw new Error('Element is outside the viewport');
      return { x: (left + right) / 2, y: (top + bottom) / 2 };
    }, [scroll]);
    if (Number.isFinite(target.x) && Number.isFinite(target.y)) return { x: target.x, y: target.y };
    throw new Error('Provide a ref, selector, or both x and y');
  }

  async click(tabId, args) {
    const p = await this.point(tabId, args);
    const button = args.button || 'left', clickCount = args.clickCount || 1, modifiers = args.modifiers || 0;
    await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, modifiers });
    await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button, clickCount, modifiers });
    await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button, clickCount, modifiers });
    return p;
  }

  async key(tabId, chord) {
    const parts = chord.split('+');
    const key = parts.pop();
    let modifiers = 0;
    for (const part of parts) {
      const flag = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Command: 4, Shift: 8 }[part];
      if (!flag) throw new Error(`Unknown modifier ${part}`);
      modifiers |= flag;
    }
    const named = {
      Enter: [13, 'Enter', '\r'], Tab: [9, 'Tab', '\t'], Escape: [27, 'Escape'], Backspace: [8, 'Backspace'],
      Delete: [46, 'Delete'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'],
      Home: [36, 'Home'], End: [35, 'End'], PageUp: [33, 'PageUp'], PageDown: [34, 'PageDown'], Space: [32, 'Space', ' ']
    };
    let spec = named[key];
    if (!spec && /^F([1-9]|1[0-2])$/.test(key)) spec = [111 + Number(key.slice(1)), key];
    if (!spec && /^[A-Za-z0-9]$/.test(key)) spec = [key.toUpperCase().charCodeAt(0), /[0-9]/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`, key];
    if (!spec && key.length === 1) spec = [0, '', key];
    if (!spec) throw new Error(`Unsupported key ${key}`);
    const [virtual, code, character] = spec;
    const text = character && !(modifiers & 7) ? character : undefined;
    const params = { key: key === 'Space' ? ' ' : key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual, modifiers };
    await this.cdp(tabId, 'Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...params, ...(text ? { text, unmodifiedText: character } : {}) });
    await this.cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    return { key: chord };
  }

  async loaded(tabId, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const tab = await this.api.tabs.get(tabId);
      if (tab.status === 'complete') return { tabId, url: tab.url, title: tab.title };
      await sleep(100);
    }
    throw new Error('Navigation did not finish in 20s; inspect the tab before retrying');
  }

  async execute(action, args = {}) {
    const api = this.api;
    if (action === 'tabs') return (await api.tabs.query({})).map(({ id, windowId, title, url, active, status }) => ({ tabId: id, windowId, title, url, active, status }));
    if (action === 'new_tab') {
      if (!/^https?:\/\//.test(args.url)) throw new Error('Only HTTP(S) URLs can be opened');
      const tab = await api.tabs.create({ url: args.url, active: args.active ?? true });
      return this.loaded(tab.id);
    }
    if (action === 'activate_tab') { const tab = await api.tabs.update(args.tabId, { active: true }); await api.windows.update(tab.windowId, { focused: true }); return { tabId: tab.id }; }
    if (action === 'close_tab') { await this.workspace?.release(args.tabId); await api.tabs.remove(args.tabId); return { closed: args.tabId }; }
    if (action === 'downloads') return (await api.downloads.search({ limit: 30, orderBy: ['-startTime'] })).map(({ id, filename, url, state, bytesReceived, totalBytes, error }) => ({ id, filename, url, state, bytesReceived, totalBytes, error }));
    if (action === 'detach') { await api.debugger.detach({ tabId: args.tabId }); this.attached.delete(args.tabId); this.persistAttachments(); await this.workspace?.release(args.tabId); return { detached: args.tabId }; }
    const tabId = (await this.tab(args.tabId)).id;
    // Modal control must not wait for browser UI operations (grouping/badges).
    if (action !== 'dialog') await this.workspace?.mark(tabId);
    if (action === 'navigate') {
      if (!/^https?:\/\//.test(args.url)) throw new Error('Only HTTP(S) URLs can be opened');
      await api.tabs.update(tabId, { url: args.url }); return this.loaded(tabId);
    }
    if (action === 'history') {
      if (args.direction === 'reload') await api.tabs.reload(tabId);
      else if (args.direction === 'back') await api.tabs.goBack(tabId);
      else await api.tabs.goForward(tabId);
      return this.loaded(tabId);
    }
    await this.attach(tabId);
    switch (action) {
      case 'screenshot': {
        const viewport = await this.evaluate(tabId, '({width:innerWidth,height:innerHeight,devicePixelRatio,scrollX,scrollY})');
        const params = { format: 'png', captureBeyondViewport: !!args.fullPage };
        let documentSize;
        if (args.fullPage) {
          const metrics = await this.cdp(tabId, 'Page.getLayoutMetrics');
          documentSize = metrics.cssContentSize;
          if (documentSize.width * documentSize.height * viewport.devicePixelRatio ** 2 > 32000000) throw new Error('Full page exceeds 32 million pixels; use viewport screenshots');
          params.clip = { x: 0, y: 0, width: documentSize.width, height: documentSize.height, scale: 1 };
        }
        const { data } = await this.cdp(tabId, 'Page.captureScreenshot', params);
        return { data, tabId, viewport, documentSize, coordinateSpace: args.fullPage ? 'document CSS pixels; subtract scrollX/scrollY for clicks' : 'viewport CSS pixels; divide image coordinates by devicePixelRatio', fullPage: !!args.fullPage };
      }
      case 'snapshot': {
        const { nodes } = await this.cdp(tabId, 'Accessibility.getFullAXTree');
        const maxNodes = args.maxNodes ?? 500;
        const visible = nodes.filter((node) => !node.ignored);
        const selected = visible.slice(0, maxNodes);
        const result = selected.map((node) => {
          const role = node.role?.value;
          const properties = Object.fromEntries((node.properties || []).filter((p) => ['checked', 'disabled', 'expanded', 'focused', 'selected', 'required', 'level', 'multiselectable'].includes(p.name)).map((p) => [p.name, p.value.value]));
          return { nodeId: node.nodeId, parentId: node.parentId, ref: node.backendDOMNodeId ? `b${node.backendDOMNodeId}` : undefined, role, name: node.name?.value, value: role === 'textbox' || role === 'searchbox' ? undefined : node.value?.value, ...properties };
        });
        const page = await this.evaluate(tabId, `({url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,${args.maxText ?? 15000})})`);
        return { tabId, ...page, nodes: result, truncated: visible.length > maxNodes, totalNodes: visible.length };
      }
      case 'click': return this.click(tabId, args);
      case 'hover': { const p = await this.point(tabId, args); await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...p }); return p; }
      case 'fill': return this.withElement(tabId, args, function (text) {
        if (!this.isConnected) throw new Error('Element is stale');
        if (this.disabled || this.readOnly) throw new Error('Element is disabled or readonly');
        this.focus();
        if (this.isContentEditable) this.textContent = text;
        else {
          if (!['INPUT', 'TEXTAREA'].includes(this.tagName)) throw new Error('Target is not a text field');
          if (this.tagName === 'INPUT' && !['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'time', 'month', 'week'].includes(this.type)) throw new Error('Input type cannot be filled');
          const proto = this.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(this, text);
        }
        this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return { filled: true };
      }, [args.text]);
      case 'type': {
        if (args.selector || args.ref || args.x !== undefined) await this.click(tabId, args);
        await this.cdp(tabId, 'Input.insertText', { text: args.text }); return { typed: true };
      }
      case 'press_key': return this.key(tabId, args.key);
      case 'scroll': {
        const viewport = await this.evaluate(tabId, '({width:innerWidth,height:innerHeight})');
        await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: args.x ?? viewport.width / 2, y: args.y ?? viewport.height / 2, deltaX: args.deltaX ?? 0, deltaY: args.deltaY });
        await sleep(120); return this.evaluate(tabId, '({scrollX,scrollY})');
      }
      case 'mouse': { const { tabId: ignored, ...params } = args; await this.cdp(tabId, 'Input.dispatchMouseEvent', { ...params, clickCount: args.type === 'mouseMoved' ? 0 : 1 }); return { dispatched: true }; }
      case 'drag': {
        // Resolve both endpoints first, then resolve the source again after target scrolling.
        await this.point(tabId, args.to);
        const from = await this.point(tabId, args.from), to = await this.point(tabId, args.to, false);
        const steps = args.steps ?? 20;
        this.drags.delete(tabId);
        await this.cdp(tabId, 'Input.setInterceptDrags', { enabled: true });
        let pressed = false;
        try {
          await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
          await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1 });
          pressed = true;
          let nativeDrag = false;
          for (let i = 1; i <= steps; i++) {
            const p = { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps };
            const data = this.drags.get(tabId);
            if (data) {
              if (!nativeDrag) { await this.cdp(tabId, 'Input.dispatchDragEvent', { type: 'dragEnter', ...p, data }); nativeDrag = true; }
              await this.cdp(tabId, 'Input.dispatchDragEvent', { type: 'dragOver', ...p, data });
            } else await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, button: 'left', buttons: 1 });
            await sleep(15);
          }
          if (this.drags.has(tabId)) {
            const data = this.drags.get(tabId);
            if (!nativeDrag) await this.cdp(tabId, 'Input.dispatchDragEvent', { type: 'dragEnter', ...to, data });
            await this.cdp(tabId, 'Input.dispatchDragEvent', { type: 'dragOver', ...to, data });
            await this.cdp(tabId, 'Input.dispatchDragEvent', { type: 'drop', ...to, data });
          }
          await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1 });
          pressed = false; return { from, to, nativeDrag: this.drags.has(tabId) };
        } finally {
          if (pressed) await this.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1 }).catch(() => {});
          await this.cdp(tabId, 'Input.setInterceptDrags', { enabled: false }).catch(() => {});
          this.drags.delete(tabId);
        }
      }
      case 'select': return this.withElement(tabId, args, function (values) {
        if (this.tagName !== 'SELECT' || this.disabled) throw new Error('Target must be an enabled select');
        if (!this.multiple && values.length !== 1) throw new Error('Select accepts only one value');
        for (const value of values) if (![...this.options].some((option) => option.value === value && !option.disabled)) throw new Error('Option not found or disabled: ' + value);
        for (const option of this.options) option.selected = values.includes(option.value);
        this.dispatchEvent(new Event('input', { bubbles: true })); this.dispatchEvent(new Event('change', { bubbles: true }));
        return { values: [...this.selectedOptions].map((option) => option.value) };
      }, [args.values]);
      case 'wait': {
        if (!args.selector && args.text === undefined) { await sleep(args.delayMs ?? 500); return { waited: args.delayMs ?? 500 }; }
        const deadline = Date.now() + (args.timeoutMs ?? 10000);
        do {
          const ready = await this.evaluate(tabId, `(() => {
            const selector = ${JSON.stringify(args.selector ?? null)}, text = ${JSON.stringify(args.text ?? null)};
            const el = selector ? document.querySelector(selector) : null;
            const visible = !!el && !!(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
            return (!selector || ${args.state === 'hidden' ? '!visible' : 'visible'}) && (text === null || (document.body?.innerText||'').includes(text));
          })()`);
          if (ready) return { ready: true };
          await sleep(100);
        } while (Date.now() < deadline);
        throw new Error('Wait condition timed out');
      }
      case 'evaluate': return { value: await this.evaluate(tabId, args.expression, args.awaitPromise ?? true) };
      case 'console': { const messages = [...(this.logs.get(tabId) || [])]; if (args.clear) this.logs.set(tabId, []); return { messages }; }
      case 'network': { const events = [...(this.requests.get(tabId) || [])]; if (args.clear) this.requests.set(tabId, []); return { events }; }
      case 'dialog': {
        if (!args.action || args.action === 'inspect') return { dialog: this.dialogs.get(tabId) || null };
        await this.cdp(tabId, 'Page.handleJavaScriptDialog', { accept: args.action === 'accept', ...(args.promptText !== undefined ? { promptText: args.promptText } : {}) }); return { handled: true };
      }
      case 'upload': {
        if (args.files.some((file) => !/^(\/|[A-Za-z]:[\\/])/.test(file))) throw new Error('Upload file paths must be absolute');
        await this.withElement(tabId, args, function () {
          if (this.tagName !== 'INPUT' || this.type !== 'file') throw new Error('Target must be input[type=file]');
          return true;
        }, [], (objectId) => this.cdp(tabId, 'DOM.setFileInputFiles', { objectId, files: args.files }));
        return { uploaded: args.files.length };
      }
      case 'cdp': return this.cdp(tabId, args.method, args.params || {}, args.sessionId);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  async detachAll() {
    await this.ready;
    for (const tabId of this.attached) await this.api.debugger.detach({ tabId }).catch(() => {});
    this.attached.clear();
    this.persistAttachments();
  }
}
