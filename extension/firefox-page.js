// Serialized into an isolated content-script world. No credentials or extension APIs.
export async function firefoxPageCommand(action, args) {
  try {
    const state = globalThis.__codexDomState ||= { refs: new Map(), ids: new WeakMap(), next: 1 };
    const all = (selector, base = document) => {
      const found = [...base.querySelectorAll(selector)];
      for (const node of base.querySelectorAll('*')) if (node.shadowRoot) found.push(...all(selector, node.shadowRoot));
      return found;
    };
    const resolve = (target = {}) => {
      let el;
      if (target.ref) el = state.refs.get(target.ref);
      else if (target.selector) { const found = all(target.selector); if (found.length !== 1) throw new Error(`Selector must match one element; found ${found.length}`); el = found[0]; }
      else if (target.x !== undefined) el = document.elementFromPoint(target.x, target.y);
      else el = document.activeElement;
      if (!el?.isConnected) throw new Error('Element ref is stale or target missing. Refresh browser_snapshot.');
      return el;
    };
    const point = (target) => { if (target.x !== undefined) return { x: target.x, y: target.y }; const el = resolve(target); el.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const mouse = (el, type, p, extra = {}) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: p.x, clientY: p.y, view: window, ...extra }));
    const pointer = (el, type, p, buttons = 0) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons }));
    const setText = (el, text) => {
      if (el.disabled || el.readOnly) throw new Error('Element is disabled or readonly');
      el.focus();
      if (el.isContentEditable) el.textContent = text;
      else {
        if (!['INPUT', 'TEXTAREA'].includes(el.tagName) || ['file', 'checkbox', 'radio', 'button', 'submit', 'reset', 'hidden'].includes(el.type)) throw new Error('Target is not a text field');
        Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, text);
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    let value;
    if (action === 'destination') { const el = resolve(args); value = el.closest?.('a[href]')?.href || (el.form && (el.type === 'submit' || el.tagName === 'BUTTON') ? el.form.action : null); }
    else if (action === 'viewport') value = { width: innerWidth, height: innerHeight, devicePixelRatio, scrollX, scrollY };
    else if (action === 'snapshot') {
      state.refs.clear();
      const elements = all('a,button,input,textarea,select,[contenteditable],[role],h1,h2,h3,h4,h5,h6');
      const visible = elements.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      const nodes = visible.slice(0, args.maxNodes ?? 500).map(el => {
        const roles = { A: 'link', BUTTON: 'button', TEXTAREA: 'textbox', SELECT: 'combobox' };
        let role = el.getAttribute('role') || roles[el.tagName] || (/^H[1-6]$/.test(el.tagName) ? 'heading' : 'textbox');
        if (el.tagName === 'INPUT') role = ['checkbox', 'radio'].includes(el.type) ? el.type : ['button', 'submit', 'reset'].includes(el.type) ? 'button' : el.type === 'file' ? 'button' : 'textbox';
        const name = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || [...(el.labels || [])].map(label => label.textContent).join(' ').trim() || el.getAttribute('placeholder') || el.textContent.trim().slice(0, 300) || el.title || '';
        let ref = state.ids.get(el); if (!ref) { ref = `f${state.next++}`; state.ids.set(el, ref); } state.refs.set(ref, el);
        return { ref, role, name, disabled: !!el.disabled, ...(el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked } : {}), ...(el.tagName === 'SELECT' ? { value: el.value } : {}) };
      });
      value = { title: document.title, url: location.href, text: (document.body?.innerText || '').slice(0, args.maxText ?? 15000), nodes, totalNodes: visible.length, truncated: visible.length > nodes.length };
    } else if (action === 'fill') { setText(resolve(args), args.text); value = { filled: true, trustedInput: false }; }
    else if (action === 'type') {
      const el = resolve(args), text = el.isContentEditable ? el.textContent : el.value;
      const start = el.selectionStart ?? text.length, end = el.selectionEnd ?? start;
      setText(el, text.slice(0, start) + args.text + text.slice(end));
      el.setSelectionRange?.(start + args.text.length, start + args.text.length); value = { typed: true, trustedInput: false };
    } else if (action === 'click') {
      const p = point(args), el = resolve(args), button = { left: 0, middle: 1, right: 2 }[args.button || 'left'];
      el.focus(); pointer(el, 'pointerdown', p, 1); mouse(el, 'mousedown', p, { button }); pointer(el, 'pointerup', p); mouse(el, 'mouseup', p, { button });
      for (let i = 0; i < (args.clickCount || 1); i++) { if (button === 0) el.click(); else mouse(el, button === 2 ? 'contextmenu' : 'auxclick', p, { button }); }
      if ((args.clickCount || 1) > 1) mouse(el, 'dblclick', p); value = { ...p, trustedInput: false };
    } else if (action === 'hover') { const p = point(args), el = resolve(args); pointer(el, 'pointermove', p); mouse(el, 'mouseover', p); mouse(el, 'mousemove', p); value = p; }
    else if (action === 'select') {
      const el = resolve(args); if (el.tagName !== 'SELECT') throw new Error('Target is not a select');
      if (args.values.some(v => ![...el.options].some(o => o.value === v))) throw new Error('Select value does not exist');
      for (const option of el.options) option.selected = args.values.includes(option.value);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); value = { values: [...el.selectedOptions].map(o => o.value) };
    } else if (action === 'press_key') {
      const parts = args.key.split('+'), key = parts.pop(), el = document.activeElement;
      const init = { key, bubbles: true, cancelable: true, ctrlKey: parts.includes('Control'), metaKey: parts.includes('Meta'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt') };
      const proceed = el.dispatchEvent(new KeyboardEvent('keydown', init));
      if (proceed) {
        if ((init.ctrlKey || init.metaKey) && key.toLowerCase() === 'a') el.select?.();
        else if (key === 'Tab') { const list = all('a[href],button,input,textarea,select,[tabindex]').filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length); list[(list.indexOf(el) + (init.shiftKey ? -1 : 1) + list.length) % list.length]?.focus(); }
        else if (key === 'Enter') { if (el.tagName === 'TEXTAREA') setText(el, el.value + '\n'); else if (el.form) el.form.requestSubmit(); else el.click(); }
        else if (key === 'Backspace' && typeof el.value === 'string') { const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start; setText(el, el.value.slice(0, start === end ? Math.max(0, start - 1) : start) + el.value.slice(end)); }
        else if (key.length === 1 && !init.ctrlKey && !init.metaKey && !init.altKey) { const start = el.selectionStart ?? el.value?.length ?? 0, end = el.selectionEnd ?? start; setText(el, (el.value || '').slice(0, start) + key + (el.value || '').slice(end)); }
        else if (!['Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(key)) throw new Error(`Default action for ${key} is unavailable in Firefox DOM input`);
      }
      el.dispatchEvent(new KeyboardEvent('keyup', init)); value = { pressed: args.key, trustedInput: false };
    } else if (action === 'scroll') { const el = args.x === undefined ? null : document.elementFromPoint(args.x, args.y); let scroller = el; while (scroller && scroller !== document.body && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement; if (scroller && scroller !== document.body) scroller.scrollBy(args.deltaX || 0, args.deltaY); else window.scrollBy(args.deltaX || 0, args.deltaY); value = { scrollX, scrollY }; }
    else if (action === 'drag') {
      const from = point(args.from), to = point(args.to), source = resolve(args.from), dest = resolve(args.to), data = new DataTransfer();
      const drag = (el, type, p) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, dataTransfer: data }));
      pointer(source, 'pointerdown', from, 1); mouse(source, 'mousedown', from, { buttons: 1 });
      if (source.draggable) drag(source, 'dragstart', from);
      for (let i = 1; i <= (args.steps || 20); i++) { const p = { x: from.x + (to.x - from.x) * i / (args.steps || 20), y: from.y + (to.y - from.y) * i / (args.steps || 20) }; pointer(source, 'pointermove', p, 1); mouse(source, 'mousemove', p, { buttons: 1 }); }
      if (source.draggable) { drag(dest, 'dragenter', to); drag(dest, 'dragover', to); drag(dest, 'drop', to); drag(source, 'dragend', to); }
      pointer(source, 'pointerup', to); mouse(source, 'mouseup', to); value = { dragged: true, trustedInput: false };
    } else if (action === 'mouse') { const el = resolve(args), p = point(args); const type = { mouseMoved: 'mousemove', mousePressed: 'mousedown', mouseReleased: 'mouseup' }[args.type]; mouse(el, type, p, { buttons: args.buttons || 0, button: { left: 0, middle: 1, right: 2 }[args.button] ?? 0 }); pointer(el, { mousemove: 'pointermove', mousedown: 'pointerdown', mouseup: 'pointerup' }[type], p, args.buttons || 0); value = { dispatched: true, trustedInput: false }; }
    else if (action === 'condition') {
      const matches = args.selector ? all(args.selector) : [];
      const visible = matches.some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      value = (!args.selector || (args.state === 'hidden' ? !visible : visible)) && (!args.text || document.body.innerText.includes(args.text));
    } else throw new Error(`Unsupported Firefox page action: ${action}`);
    return { value };
  } catch (error) { return { error: error.message }; }
}
