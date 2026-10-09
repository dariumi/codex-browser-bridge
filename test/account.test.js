import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountStatus, normalizeLimits } from '../server/account.js';

test('account limits use remaining percentages, retain buckets and never expose account identifiers', () => {
  const limits = normalizeLimits({ accountId: 'private', rateLimitsByLimitId: {
    codex: { primary: { usedPercent: 24, windowDurationMins: 300, resetsAt: 123 }, secondary: { usedPercent: 101 }, planType: 'plus' },
    other: { primary: { usedPercent: -5 }, secondary: null }
  } });
  assert.equal(limits[0].windows[0].remainingPercent, 76); assert.equal(limits[0].windows[1].remainingPercent, 0);
  assert.equal(limits[1].windows[0].remainingPercent, 100); assert.equal(limits.length, 2);
  assert.equal(JSON.stringify(limits).includes('private'), false);
  assert.deepEqual(normalizeLimits({ rateLimits: { primary: null } })[0].windows, []);
});
test('account status coalesces reads, reports unavailable quotas honestly and merges live bucket updates', async () => {
  let starts = 0, changed = 0;
  const account = new AccountStatus({ start: async () => { starts++; }, request: async method => {
    if (method === 'config/read') return { config: { model: 'test-model', model_reasoning_effort: 'high' } };
    if (method === 'account/read') return { account: { planType: 'plus', email: 'private@example.com' } };
    throw new Error('API key accounts do not expose ChatGPT limits');
  } }, () => changed++);
  const [first, second] = await Promise.all([account.read(), account.read()]);
  assert.equal(first, second); assert.equal(starts, 1); assert.equal(first.model, 'test-model');
  assert.deepEqual(first.limits, []); assert.ok(first.limitsError); assert.equal(JSON.stringify(first).includes('private@'), false);
  account.notification({ method: 'account/rateLimits/updated', params: { rateLimits: { limitId: 'codex', primary: { usedPercent: 70 } } } });
  account.notification({ method: 'account/rateLimits/updated', params: { rateLimits: { limitId: 'other', primary: { usedPercent: 10 } } } });
  assert.equal(first.limits.length, 2); assert.equal(first.limits[0].windows[0].remainingPercent, 30); assert.equal(first.limitsError, null);
  account.notification({ method: 'account/updated', params: { planType: null } });
  assert.deepEqual(first.limits, []); assert.equal(first.fetchedAt, null); assert.equal(changed, 4);
});
