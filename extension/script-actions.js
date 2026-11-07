export const scriptActions = ['click', 'fill', 'type', 'press_key', 'hover', 'scroll', 'select', 'wait', 'navigate', 'snapshot', 'media'];
export function validateScript(value) {
  if (!value || typeof value !== 'object' || !/^[a-z0-9_-]{1,60}$/i.test(value.id || '') || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) throw new Error('Script needs id and name');
  if (!Array.isArray(value.origins) || !value.origins.length || value.origins.length > 20) throw new Error('Specify 1–20 HTTP(S) script origins');
  const origins = value.origins.map(text => { const url = new URL(text); if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.origin !== text) throw new Error('Use exact HTTP(S) origins'); return text; });
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 50) throw new Error('Use 1–50 steps');
  const steps = value.steps.map(step => {
    if (!scriptActions.includes(step.action) || !step.args || typeof step.args !== 'object' || Array.isArray(step.args) || ['tabId', 'sessionId', '__proto__', 'constructor', 'prototype'].some(key => Object.hasOwn(step.args, key))) throw new Error('Unsupported action or step arguments');
    validateStep(step.action, step.args);
    if (step.action === 'wait' && ((step.args.timeoutMs ?? 10000) > 30000 || (step.args.delayMs ?? 0) > 5000)) throw new Error('Use bounded waits');
    if (step.action === 'navigate' && !origins.includes(new URL(step.args.url).origin)) throw new Error('Navigation is outside script origins');
    return { action: step.action, args: JSON.parse(JSON.stringify(step.args)) };
  });
  const result = { id: value.id, name: value.name.trim(), origins: [...new Set(origins)], steps };
  if (JSON.stringify(result).length > 64000) throw new Error('Script exceeds 64 KiB'); return result;
}
export function validateStep(action, args) {
  if (!scriptActions.includes(action)) throw new Error('Unsupported script action');
  if (['click', 'fill', 'type', 'hover', 'select'].includes(action) && !args.selector && !args.ref && !(Number.isFinite(args.x) && Number.isFinite(args.y)) && action !== 'type') throw new Error('Step requires a target');
  for (const key of ['selector', 'ref', 'text', 'key']) if (args[key] !== undefined && (typeof args[key] !== 'string' || args[key].length > (key === 'text' ? 12000 : 1000))) throw new Error(`Invalid ${key}`);
  if (['fill', 'type'].includes(action) && typeof args.text !== 'string' || action === 'press_key' && !args.key) throw new Error('Missing step text/key');
  if (action === 'select' && (!Array.isArray(args.values) || args.values.length > 100 || !args.values.every(x => typeof x === 'string'))) throw new Error('Invalid selected values');
  for (const key of ['x', 'y', 'deltaX', 'deltaY', 'delayMs', 'timeoutMs']) if (args[key] !== undefined && (!Number.isFinite(args[key]) || Math.abs(args[key]) > 100000 || (['x', 'y', 'delayMs', 'timeoutMs'].includes(key) && args[key] < 0))) throw new Error(`Invalid ${key}`);
  for (const [key, min, max] of [['maxNodes',10,3000],['maxText',0,100000],['clickCount',1,3],['modifiers',0,15]]) if (args[key] !== undefined && (!Number.isInteger(args[key]) || args[key] < min || args[key] > max)) throw new Error(`Invalid ${key}`);
  if (action === 'wait' && ((args.delayMs ?? 0) > 5000 || (args.timeoutMs ?? 10000) > 30000)) throw new Error('Unbounded wait');
  if (action === 'scroll' && !Number.isFinite(args.deltaY)) throw new Error('Scroll needs deltaY');
  if (action === 'media' && !['inspect', 'play', 'pause', 'seek', 'rate', 'mute', 'frame'].includes(args.action)) throw new Error('Unsupported scripted media operation');
  return args;
}
