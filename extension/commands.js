// Deliberately named APIs, not eval/remote extension code. Add new handlers in source.
const invocations = {
  'tabs.get': ['tabs', 'get'], 'tabs.query': ['tabs', 'query'], 'tabs.update': ['tabs', 'update'],
  'tabs.move': ['tabs', 'move'], 'tabs.duplicate': ['tabs', 'duplicate'], 'tabs.highlight': ['tabs', 'highlight'],
  'tabGroups.get': ['tabGroups', 'get'], 'tabGroups.query': ['tabGroups', 'query'],
  'tabGroups.update': ['tabGroups', 'update'], 'tabGroups.move': ['tabGroups', 'move'],
  'action.setTitle': ['action', 'setTitle'], 'action.setBadgeText': ['action', 'setBadgeText'],
  'action.setBadgeBackgroundColor': ['action', 'setBadgeBackgroundColor'],
  'sidePanel.getOptions': ['sidePanel', 'getOptions'], 'sidePanel.setOptions': ['sidePanel', 'setOptions']
};
export async function extensionCommand(api, args) {
  if (args.command === 'capabilities') return { version: api.runtime.getManifest().version, extensionId: api.runtime.id, methods: Object.keys(invocations), commands: ['capabilities', 'invoke', 'reload'] };
  if (args.command === 'reload') { setTimeout(() => api.runtime.reload(), 400); return { scheduled: true }; }
  if (args.command !== 'invoke' || !invocations[args.method]) throw new Error('Unsupported extension command. Use capabilities, or add a source handler through development mode.');
  const [domain, method] = invocations[args.method];
  if (!Array.isArray(args.arguments) || args.arguments.length > 5) throw new Error('arguments must be an array of up to five API arguments');
  return (await api[domain][method](...args.arguments)) ?? { ok: true };
}
