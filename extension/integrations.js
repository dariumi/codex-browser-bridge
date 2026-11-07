export function integrationList(value) {
  if (!Array.isArray(value) || value.length > 30 || JSON.stringify(value).length > 64000) throw new Error('Use at most 30 bounded integration templates');
  const keys = new Set();
  return value.map(item => {
    if (!item || !/^[a-z0-9_-]{1,60}$/i.test(item.id) || !/^[\w@.{}-]{1,200}$/.test(item.extensionId) || !item.message || typeof item.message !== 'object' || Array.isArray(item.message) || !Array.isArray(item.origins) || !item.origins.length) throw new Error('Invalid integration template');
    if (keys.has(item.id)) throw new Error('Duplicate integration ID'); keys.add(item.id);
    const origins = item.origins.map(text => { const url = new URL(text); if (!/^https?:$/.test(url.protocol) || url.origin !== text) throw new Error('Specify exact HTTP(S) origins'); return text; });
    return { id: item.id, extensionId: item.extensionId, origins, message: JSON.parse(JSON.stringify(item.message)) };
  });
}
export function messageURLs(value, result = []) { if (typeof value === 'string') result.push(...(value.match(/https?:\/\/[^\s"'<>]+/gi) || [])); else if (value && typeof value === 'object') for (const child of Object.values(value)) messageURLs(child, result); return result; }
export class Integrations {
  constructor(api, guard, policy) { Object.assign(this, { api, guard, policy }); }
  async run(args, validate = () => {}) {
    const items = integrationList((await this.api.storage.local.get('extensionIntegrations')).extensionIntegrations || []);
    if (args.action === 'list') return { integrations: items.map(({ message, ...item }) => item), note: 'Only user-configured fixed messages; target must implement onMessageExternal.' };
    const item = items.find(x => x.id === args.id); if (!item || args.action !== 'invoke') throw new Error('Integration is not configured by the user');
    if (item.extensionId === this.api.runtime.id) throw new Error('Self messaging is not an external integration');
    const tab = await this.guard.target(args.tabId, 'extension_integration', { advanced: true });
    if (!item.origins.includes(new URL(tab.url).origin)) throw new Error('Integration is outside configured origins');
    for (const url of messageURLs(item.message)) await this.policy.ensure(url, 'extension_integration');
    validate(); let timer;
    try {
      const response = await Promise.race([this.api.runtime.sendMessage(item.extensionId, item.message), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Extension response timed out; outcome unknown, do not retry automatically')), 15000); })]);
      validate(); if (JSON.stringify(response ?? null).length > 16384) throw new Error('Extension response exceeds 16 KiB'); return { response: response ?? null, untrusted: true };
    } finally { clearTimeout(timer); }
  }
}
