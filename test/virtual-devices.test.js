import { test } from 'node:test';
import assert from 'node:assert/strict';
import { virtualMediaPage } from '../extension/virtual-media-page.js';
import { VirtualDevices } from '../extension/virtual-devices.js';

function environment(t) {
  const originals = new Map();
  const set = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  class Track { constructor(kind) { this.kind = kind; this.stopped = false; } clone() { return new Track(this.kind); } stop() { this.stopped = true; } addEventListener() {} }
  class Stream { constructor(tracks) { this.tracks = tracks; } getTracks() { return this.tracks; } }
  let physicalRequests = 0;
  const media = { enumerateDevices: async () => [{ deviceId: 'physical' }], getUserMedia: async () => { physicalRequests++; return 'native'; }, getDisplayMedia: async () => 'native-picker' };
  const native = { ...media };
  set('navigator', { mediaDevices: media, userActivation: { isActive: false } });
  set('MediaStream', Stream); set('addEventListener', () => {}); set('removeEventListener', () => {});
  set('AudioContext', class { state = 'suspended'; createMediaStreamDestination() { return { stream: new Stream([new Track('audio')]) }; } createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {}, disconnect() {} }; } async close() { this.state = 'closed'; } });
  set('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }), captureStream: () => new Stream([new Track('video')]) }) });
  t.after(async () => { await virtualMediaPage({ action: 'stop' }); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { media, native, physicalRequests: () => physicalRequests };
}

test('extension media supplies cloned audio/camera tracks, respects explicit hardware and restores APIs', async t => {
  const { media, native, physicalRequests } = environment(t);
  const audio = await virtualMediaPage({ action: 'audio', seconds: 30 });
  assert.equal(audio.requiresPageGesture, true);
  await virtualMediaPage({ action: 'video', seconds: 30 });
  const devices = await media.enumerateDevices();
  assert.equal(devices.length, 3); assert.equal(devices[1].kind, 'audioinput');
  const stream = await media.getUserMedia({ audio: true, video: true });
  assert.deepEqual(stream.getTracks().map(t => t.kind), ['audio', 'video']);
  assert.equal(await media.getUserMedia({ video: { deviceId: { exact: 'physical' } } }), 'native');
  assert.equal(physicalRequests(), 1);
  await virtualMediaPage({ action: 'stop' });
  assert.ok(stream.getTracks().every(t => t.stopped)); assert.equal(media.getUserMedia, native.getUserMedia);
  assert.deepEqual((await virtualMediaPage({ action: 'status' })).configured, []);
});

test('virtual screen uses supplied stream while incomplete mixed requests fail without hardware access', async t => {
  const { media, physicalRequests } = environment(t);
  await virtualMediaPage({ action: 'audio', seconds: 30 });
  await assert.rejects(media.getUserMedia({ audio: true, video: true }), { name: 'NotFoundError' });
  assert.equal(physicalRequests(), 0);
  assert.equal(await media.getDisplayMedia({ video: true }), 'native-picker');
  await virtualMediaPage({ action: 'screen', seconds: 30 });
  assert.deepEqual((await media.getDisplayMedia({ video: true, audio: true })).getTracks().map(t => t.kind), ['video', 'audio']);
  await assert.rejects(media.getDisplayMedia({ video: false }), TypeError);
});

test('virtual feed expires, stops consumer tracks and does not overwrite subsequent page API changes', async t => {
  const { media } = environment(t);
  await virtualMediaPage({ action: 'video', seconds: 1 });
  const stream = await media.getUserMedia({ video: true });
  const replacement = async () => 'page-owned'; media.getUserMedia = replacement;
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(stream.getTracks()[0].stopped, true); assert.equal(media.getUserMedia, replacement);
  assert.deepEqual((await virtualMediaPage({ action: 'status' })).configured, []);
});

test('virtual device settings and advanced approval gate injection; cleanup never injects into another origin', async () => {
  let enabled = false, calls = 0, approval = 0;
  const api = { storage: { local: { get: async () => ({ virtualDevicesEnabled: enabled }) } }, scripting: { executeScript: async () => { calls++; return [{ result: { started: true } }]; } }, tabs: { get: async () => ({ url: 'https://other.invalid/' }) } };
  const devices = new VirtualDevices(api, { ensure: async () => { approval++; } });
  await assert.rejects(devices.run({ action: 'audio' }, { id: 1, url: 'https://test.invalid/' }), /Enable/);
  assert.equal(calls, 0); enabled = true;
  await devices.run({ action: 'audio' }, { id: 1, url: 'https://test.invalid/' });
  assert.equal(approval, 1); await devices.disconnect(); assert.equal(calls, 1); assert.equal(devices.tabs.size, 0);
});
