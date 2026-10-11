import { readFile } from 'node:fs/promises';
const assets = new Map([
  ['/complex', ['lab.html', 'text/html; charset=utf-8']], ['/complex.html', ['lab.html', 'text/html; charset=utf-8']],
  ['/lab.js', ['lab.js', 'text/javascript; charset=utf-8']], ['/lab.css', ['lab.css', 'text/css; charset=utf-8']],
  ['/complex-frame.html', ['complex-frame.html', 'text/html; charset=utf-8']], ['/complex-frame.js', ['complex-frame.js', 'text/javascript; charset=utf-8']]
]);
// Public, synthetic assets only. No file-path interpolation, connection data or command access.
export async function serveLab(req, res) {
  const asset = req.method === 'GET' && assets.get(req.url);
  if (!asset) return false;
  const body = await readFile(new URL(`../extension/${asset[0]}`, import.meta.url));
  res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" });
  res.end(body); return true;
}
