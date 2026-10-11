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
    return { results, page: { observedText: await text() } };
  } finally {
    if (tabId) await call('close_tab', { tabId }).catch(() => {});
    await fixture.close();
  }
}
