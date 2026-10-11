import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
async function lab() {
  const nodes = new Map(), scheduled = []; let physicalRequests = 0;
  class Element {
    value = ''; checked = false; hidden = false; children = []; listeners = {}; dataset = {}; style = {};
    set id(value) { this.key = value; nodes.set(value, this); } get id() { return this.key; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    emit(name, data = {}) { for (const fn of this.listeners[name] || []) fn({ target: this, ...data }); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    attachShadow() { return new Element(); }
    getContext() { return {}; }
    checkValidity() { return this.value === 'test@example.invalid'; }
    focus() {} setSelectionRange() {}
    async play() {}
  }
  const html = await readFile(new URL('../extension/lab.html', import.meta.url), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) { const node = new Element(); node.id = id; }
  nodes.get('pro-settings').hidden = true; nodes.get('final-step').hidden = true;
  const frame = new Element(); frame.contentWindow = {};
  const document = { getElementById: id => nodes.get(id), createElement: () => new Element(), querySelector: () => frame, addEventListener() {}, body: new Element() };
  const window = { addEventListener() {} };
  const context = vm.createContext({ document, window, navigator: { mediaDevices: { enumerateDevices: async () => [{ deviceId: 'physical' }], getUserMedia: async () => { physicalRequests++; throw new Error('Should not request hardware'); } } }, location: { origin: 'http://127.0.0.1' }, isSecureContext: true, Blob, URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} }, setTimeout: fn => { scheduled.push(fn); }, clearInterval() {} });
  vm.runInContext(await readFile(new URL('../extension/lab.js', import.meta.url), 'utf8'), context);
  return { nodes, fixture: window.complexFixture, scheduled, physicalRequests: () => physicalRequests };
}
test('lab refuses incomplete forms and stale search responses, and reports no entered data', async () => {
  const { nodes, fixture, scheduled } = await lab();
  nodes.get('validate-form').onclick(); assert.equal(nodes.get('final-step').hidden, true); assert.equal(fixture.results.form, false);
  nodes.get('lab-name').value = 'Bridge Test'; nodes.get('lab-name').emit('input'); assert.equal(fixture.results.controlled, true);
  nodes.get('lab-email').value = 'test@example.invalid'; nodes.get('lab-plan').value = 'pro'; nodes.get('lab-plan').emit('change'); nodes.get('lab-agree').checked = true;
  nodes.get('validate-form').onclick(); assert.equal(nodes.get('final-step').hidden, false);
  nodes.get('lab-code').value = 'wrong'; nodes.get('finish-form').onclick(); assert.equal(fixture.results.form, false);
  nodes.get('lab-code').value = 'BRIDGE-OK'; nodes.get('finish-form').onclick(); assert.equal(fixture.results.form, true);
  nodes.get('lab-search').value = 'obsolete'; nodes.get('lab-search').emit('input'); nodes.get('lab-search').value = 'bridge'; nodes.get('lab-search').emit('input');
  scheduled.shift()(); assert.equal(nodes.get('search-results').children.length, 0); scheduled.shift()(); nodes.get('lab-search-result').onclick(); assert.equal(fixture.results.search, true);
  const report = JSON.stringify(fixture.report()); assert.doesNotMatch(report, /test@example|Bridge Test|BRIDGE-OK/);
});
test('optional virtual-device lab never asks for physical microphone/camera when virtual streams are absent', async () => {
  const { nodes, fixture, physicalRequests } = await lab(); await nodes.get('request-devices').onclick();
  assert.equal(physicalRequests(), 0); assert.equal(fixture.results.devices, false); assert.match(nodes.get('device-status').textContent, /Configure extension virtual/);
});
