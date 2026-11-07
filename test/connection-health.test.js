import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionIssue, retryAllowed } from '../extension/connection-health.js';

test('a live connection tolerates suspension intervals shorter than heartbeat timeout', () => {
  assert.equal(connectionIssue({ readyState: 1, connected: true, startedAt: 0, lastMessageAt: 60000 }, 100000), null);
  assert.match(connectionIssue({ readyState: 1, connected: true, startedAt: 0, lastMessageAt: 0 }, 66000), /heartbeat/);
});
test('connecting and open-but-unauthenticated sockets cannot block retries forever', () => {
  for (const readyState of [0,1]) {
    assert.equal(connectionIssue({ readyState, connected: false, startedAt: 0 }, 14999), null);
    assert.match(connectionIssue({ readyState, connected: false, startedAt: 0 }, 15000), /handshake/);
  }
});
test('stale closing/closed sockets are detected even without a native close event', () => {
  for (const readyState of [2,3]) assert.ok(connectionIssue({ readyState }, 1));
});
test('occupied bridge retries while invalid credentials stay blocked without guesses', () => {
  assert.equal(retryAllowed(1008, 'A browser is already connected'), true);
  for (const reason of ['Invalid key','Authentication required','Invalid JSON','unknown']) assert.equal(retryAllowed(1008,reason), false);
  assert.equal(retryAllowed(1006,''), true); assert.equal(retryAllowed(1000,''), true);
});
