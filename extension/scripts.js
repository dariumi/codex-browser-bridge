import { validateScript } from './script-actions.js';
export class Scripts {
  constructor(api, guard, execute, validateStep, changed = () => {}) { Object.assign(this, { api, guard, execute, validateStep, changed }); this.job = null; this.generation = 0; this.ready = this.restore(); }
  async restore() { const data = await this.api.storage.local.get('persistScripts'); this.persistent = data.persistScripts === true; this.area = this.persistent ? this.api.storage.local : this.api.storage.session; this.items = (await this.area.get('browserScripts')).browserScripts || []; }
  state() { return { scripts: this.items, persistent: this.persistent, job: this.job ? { ...this.job } : null }; }
  async retention(enabled) { await this.ready; if (this.job?.status === 'running') throw new Error('Stop script first'); const old = this.area; this.persistent = !!enabled; this.area = enabled ? this.api.storage.local : this.api.storage.session; await this.area.set({ browserScripts: this.items }); if (old !== this.area) await old.remove('browserScripts'); await this.api.storage.local.set({ persistScripts: this.persistent }); return this.state(); }
  async run(args, validate = () => {}) {
    await this.ready;
    if (args.action === 'list' || args.action === 'status') return this.state();
    if (args.action === 'stop') { this.generation++; if (this.job?.status === 'running') this.job.status = 'cancelled'; this.changed(this.state()); return this.state(); }
    if (this.job?.status === 'running') throw new Error('A script is already running');
    if (args.action === 'save') { const item = validateScript(args.script); if (!this.items.some(x => x.id === item.id) && this.items.length >= 50) throw new Error('Script library limit reached'); this.items = this.items.filter(x => x.id !== item.id); this.items.push(item); await this.area.set({ browserScripts: this.items }); return this.state(); }
    if (args.action === 'delete') { this.items = this.items.filter(x => x.id !== args.id); await this.area.set({ browserScripts: this.items }); return this.state(); }
    if (!['run', 'resume'].includes(args.action)) throw new Error('Unknown script action');
    validate();
    const item = validateScript(this.items.find(x => x.id === args.id));
    if (args.action === 'resume' && (this.job?.id !== item.id || this.job.status !== 'waiting_permission')) throw new Error('Only a permission-paused script can resume');
    const tabId = args.action === 'resume' ? this.job.tabId : (await this.guard.target(args.tabId, 'script')).id;
    const index = args.action === 'resume' ? this.job.index : 0;
    const epoch = ++this.generation; this.job = { id: item.id, tabId, index, total: item.steps.length, status: 'running', startedAt: Date.now() };
    const check = () => { if (Date.now() - this.job.startedAt > 600000) throw new Error('Script runtime limit reached'); if (epoch !== this.generation) throw new Error('Script cancelled'); };
    this.changed(this.state());
    this.pending = this.perform(item, check).catch(error => {
      if (epoch === this.generation) { this.job.status = error.message.includes('ACCESS_APPROVAL_REQUIRED') ? 'waiting_permission' : 'failed'; this.job.error = error.message; this.changed(this.state()); }
    });
    return this.state();
  }
  async perform(item, check) {
    const job = this.job;
    for (; job.index < item.steps.length; job.index++) {
      check(); const tab = await this.guard.target(job.tabId, 'script'); check();
      if (!item.origins.includes(new URL(tab.url).origin)) throw new Error('Current page is outside script origins');
      const step = item.steps[job.index], args = await this.validateStep(step.action, { ...step.args, tabId: job.tabId });
      await this.execute(step.action, args, check); check(); this.changed(this.state());
    }
    job.status = 'completed'; this.changed(this.state());
  }
}
