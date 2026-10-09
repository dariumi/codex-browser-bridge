import { readConfig } from './config.js';
import { createBroker } from './broker.js';

try {
  const config = await readConfig();
  const broker = await createBroker(config);
  console.error(`Browser bridge listening on 127.0.0.1:${broker.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await broker.close(); process.exit(0); });
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? 'Bridge port already in use' : error.message);
  process.exit(1);
}
