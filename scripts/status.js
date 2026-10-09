import { bridgeRequest } from '../server/client.js';
try { console.log(JSON.stringify(await bridgeRequest('/status'), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
