// Isolated-browser fixtures only. Nothing here changes the installed extension or user grants.
import { cp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
export async function prepareTestAddon(dir, connection, firefox = false) {
  await cp('extension', dir, { recursive: true });
  if (firefox) await writeFile(path.join(dir, 'manifest.json'), await readFile('extension/manifest.firefox.json'));
  await rm(path.join(dir, 'manifest.firefox.json'));
  const background = await readFile(path.join(dir, 'background.js'), 'utf8');
  const imports = background.split('\n').filter(line => line.startsWith('import ')).join('\n');
  const body = background.split('\n').filter(line => !line.startsWith('import ')).join('\n');
  await writeFile(path.join(dir, 'background.js'), imports + `
const testApi = globalThis.browser || globalThis.chrome;
Promise.all([testApi.storage.local.set(${JSON.stringify(connection)}),
// Simulate consent for diagnostic JavaScript on the local fixture, never on public sites.
testApi.storage.session.set({ accessGrants: [{host:'127.0.0.1',kind:'advanced',scope:'manual',expiresAt:Date.now()+900000}] })]).then(() => {
` + body + `\nsetTimeout(() => testApi.tabs.create({url:testApi.runtime.getURL('test-consent.html'),active:false}), 500);\n});\n`);
  await writeFile(path.join(dir, 'test-consent.html'), '<!doctype html><div id="permission-requests"></div><script type="module" src="test-consent.js"></script>');
  // Exercise the production permission cards and trusted runtime sender from a fixture UI.
  await writeFile(path.join(dir, 'test-consent.js'), `import './policy-ui.js';
const fixtureApi=globalThis.browser || globalThis.chrome;
setInterval(() => { const button=document.querySelector('[data-permission-host="localhost"][data-permission-decision="allow"]'); if(button && !button.disabled) button.click(); }, 500);
try {
const internal=(await fixtureApi.tabs.query({})).find(tab=>tab.url?.startsWith(${JSON.stringify(firefox ? 'about:debugging' : 'about:blank')})) || await fixtureApi.tabs.create({url:'about:blank',active:false});
const reply=await fixtureApi.runtime.sendMessage({type:'chat_start',tabId:internal.id,text:'Пройди тест'});
document.title='INTERNAL_PAGE_TEST: '+internal.url+' '+(reply.error || 'FAILED');
await fixtureApi.tabs.remove(internal.id);
} catch(error) { document.title='INTERNAL_PAGE_TEST: FAILED '+error.message; }
`);
}
