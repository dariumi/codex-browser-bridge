import { bridgeRequest } from '../server/client.js';
const restarting = process.argv.includes('--restart');
try {
  await bridgeRequest('/command', { action: 'lifecycle', args: { action: 'stop' } }, { autoStart: false });
} catch (error) {
  if (error.cause?.code !== 'ECONNREFUSED') throw new Error(`${error.message}. Older bridge versions may require stopping the old daemon process manually once.`);
}
const deadline = Date.now() + 8000;
while (Date.now() < deadline) {
  try { await bridgeRequest('/health', undefined, { autoStart: false }); }
  catch (error) {
    if (error.cause?.code !== 'ECONNREFUSED') throw error;
    if (restarting) { await bridgeRequest('/status'); console.log('Bridge restarted from this installation. Reload MCP and the browser extension.'); }
    else console.log('Bridge stopped.');
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}
throw new Error('Bridge did not stop in time; inspect it before retrying');
