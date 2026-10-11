import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingCommands, installCommands } from '../extension/chat-commands.js';

test('slash suggestions filter commands and leave regular prompts alone', () => {
  assert.equal(matchingCommands('/').length, 8);
  assert.deepEqual(matchingCommands('/SU').map(item => item[0]), ['/summarize']);
  for (const value of ['normal text', '/test extra', 'https://example.invalid/', '/unknown']) assert.deepEqual(matchingCommands(value), []);
});

test('keyboard and click selection fill a command without executing it; Escape and submission dismiss suggestions', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  class Element {
    children = []; attributes = {}; listeners = {}; hidden = true; value = ''; style = {}; scrollHeight = 48;
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    emit(name, event = {}) { for (const fn of this.listeners[name] || []) fn(event); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    focus() { globalThis.document.activeElement = this; }
    dispatchEvent(event) { this.emit(event.type, event); }
    contains(item) { return this.children.includes(item); }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original); else delete globalThis.document; });
  const input = new Element(), list = new Element(); input.form = new Element(); let submitted = 0;
  input.form.addEventListener('submit', () => { submitted++; }); installCommands(input, list);
  const key = name => { let prevented = false; input.emit('keydown', { key: name, preventDefault() { prevented = true; } }); return prevented; };
  input.value = '/'; input.emit('input'); assert.equal(list.hidden, false); assert.equal(list.children.length, 8);
  assert.equal(key('ArrowDown'), true); assert.equal(key('Enter'), true); assert.equal(input.value, '/clear'); assert.equal(list.hidden, true); assert.equal(submitted, 0);
  input.value = '/s'; input.emit('input'); list.children[0].onclick(); assert.equal(input.value, '/stop'); assert.equal(submitted, 0);
  input.value = '/'; input.emit('input'); assert.equal(key('Escape'), true); assert.equal(input.attributes['aria-expanded'], 'false');
  input.emit('input'); input.form.emit('submit'); assert.equal(list.hidden, true); assert.equal(submitted, 1);
});
