import { createInterface } from 'node:readline';
let initialized = false;
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.method === 'initialize') { initialized = true; console.log(JSON.stringify({ id: message.id, result: { userAgent: 'test' } })); }
  else if (message.method === 'initialized') {}
  else if (message.method === 'thread/start' && initialized) {
    console.log(JSON.stringify({ id: message.id, result: { thread: { id: 'test-thread' } } }));
    console.log(JSON.stringify({ method: 'thread/started', params: { thread: { id: 'test-thread' } } }));
  } else if (message.method === 'unsupported') console.log(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unsupported test method' } }));
  else if (message.method === 'hang') {}
}
