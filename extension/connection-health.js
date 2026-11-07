// Read-only decisions: no changes to URLs, credentials, grants or browser settings.
export function connectionIssue({ readyState, startedAt, lastMessageAt, connected }, now = Date.now()) {
  if (readyState === 3) return 'WebSocket closed';
  if (readyState === 2) return 'WebSocket closing';
  if (!connected && now - startedAt >= 15000) return 'Bridge handshake timed out';
  if (readyState === 1 && connected && now - lastMessageAt >= 65000) return 'Bridge heartbeat timed out';
  return null;
}
export function retryAllowed(code, reason) {
  // Occupied bridge is temporary. Invalid credentials/other policy failures stay blocked.
  return code !== 1008 || reason === 'A browser is already connected';
}
