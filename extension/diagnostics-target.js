export function diagnosticURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !['/complex', '/complex.html'].includes(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error('Use http://127.0.0.1:PORT/complex for the local test page');
  return url.href;
}
