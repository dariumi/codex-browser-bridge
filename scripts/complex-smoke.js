import assert from 'node:assert/strict';
import { startFixture } from './fixture.js';

// Use only with an isolated test extension, or after the user's ordinary site/advanced decisions.
export async function complexSmoke(call, step) {
  const fixture = await startFixture(0); let tabId;
  const action = (name, args = {}) => call(name, { ...args, tabId });
  const text = async () => (await action('snapshot')).text;
  const passed = async label => assert.ok((await text()).includes(`✓ ${label}`), `Expected actual page result: ${label}`);
  const results = [];
  const check = async (name, fn) => { await step(`complex: ${name}`, fn); results.push({ name, status: 'PASS' }); };
  try {
    tabId = (await call('new_tab', { url: fixture.url + '/complex', temporary: true })).tabId;
    await action('wait', { selector: '#lab-name' });
    await check('controlled and conditional multi-stage form', async () => {
      await action('fill', { selector: '#lab-name', text: 'Bridge Test' }); await action('snapshot');
      await action('fill', { selector: '#lab-email', text: 'test@example.invalid' }); await action('select', { selector: '#lab-plan', values: ['pro'] });
      await action('click', { selector: '#lab-agree' }); await action('click', { selector: '#validate-form' }); await action('wait', { selector: '#lab-code' });
      await action('fill', { selector: '#lab-code', text: 'BRIDGE-OK' }); await action('click', { selector: '#finish-form' });
      await passed('Controlled input'); await passed('Conditional multi-stage form');
    });
    await check('async search discards stale responses', async () => {
      await action('fill', { selector: '#lab-search', text: 'obsolete' }); await action('fill', { selector: '#lab-search', text: 'bridge' });
      await action('wait', { selector: '#lab-search-result' }); await action('click', { selector: '#lab-search-result' }); await passed('Async search');
    });
    await check('open Shadow DOM', async () => { await action('fill', { selector: '#lab-shadow-input', text: 'shadow-ok' }); await passed('Shadow DOM'); });
    await check('HTML drag payload', async () => { await action('drag', { from: { selector: '#lab-source' }, to: { selector: '#lab-drop' } }); await passed('HTML drag'); });
    await check('pointer drag', async () => { await action('drag', { from: { selector: '#lab-handle' }, to: { selector: '#pointer-target' } }); await passed('Pointer drag'); });
    await check('iframe isolation remains explicit', async () => {
      await action('wait', { selector: 'iframe' });
      assert.ok((await text()).includes('○ Nested frame'));
    });
    const capabilities = (await call('status')).capabilities;
    results.push({ name: 'frame-targeted input', status: capabilities?.cdp ? 'NOT_RUN' : 'UNSUPPORTED', reason: 'Higher-level input tools have no frame target. Chromium CDP frame input is not exercised; no handler/eval substitute is counted as a pass.' });
    await check('actual video frame and animation metadata', async () => {
      const media = await action('media', { action: 'inspect' }); assert.ok(media.media.some(item => item.kind === 'video')); assert.ok(Array.isArray(media.animations));
      await action('wait', { selector: '#lab-video' });
      const deadline = Date.now() + 5000;
      while (!(await action('media', { action: 'inspect' })).media.some(item => item.kind === 'video' && item.width > 0) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      const frame = await action('media', { action: 'frame', selector: '#lab-video' }); assert.ok(frame.data && frame.width > 0 && frame.mimeType === 'image/png');
    });
    results.push({ name: 'virtual media devices', status: 'NOT_RUN', reason: 'Requires explicit opt-in and user approval; never activate in the installed extension during tests.' });
    const observedText = await text();
    await check('saved script executes guarded steps', async () => {
      const id = 'isolated-complex-review';
      try {
        await action('scripts', { action: 'save', script: { id, name: 'Isolated complex review', origins: [fixture.url], steps: [{ action: 'snapshot', args: {} }, { action: 'wait', args: { delayMs: 50 } }] } });
        await action('scripts', { action: 'run', id }); const deadline = Date.now() + 5000; let job;
        do { job = (await action('scripts', { action: 'status' })).job; if (job.status !== 'running') break; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
        assert.equal(job.status, 'completed'); assert.equal(job.index, 2);
      } finally { await action('scripts', { action: 'stop' }); await action('scripts', { action: 'delete', id }); }
    });
    await check('view zoom and actual HTTP User-Agent', async () => {
      const before = await action('view', { action: 'inspect' });
      try {
        await action('view', { action: 'set', zoom: 0.9, userAgent: 'Bridge-Isolated-Test/0.7', ...(capabilities?.cdp ? { width: 800, height: 600, colorScheme: 'dark' } : {}) });
        await action('navigate', { url: fixture.url + '/agent' }); assert.ok((await text()).includes('Bridge-Isolated-Test/0.7'));
      } finally { const reset = await action('view', { action: 'reset' }); assert.equal(reset.reset, true); }
      const after = await action('view', { action: 'inspect' }); assert.equal(after.zoom, before.zoom);
    });
    return { results, page: { observedText } };
  } finally {
    if (tabId) await call('close_tab', { tabId }).catch(() => {});
    await fixture.close();
  }
}
