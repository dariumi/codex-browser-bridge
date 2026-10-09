// Only display account metadata; credentials and account identifiers never reach the UI.
export function normalizeLimits(payload) {
  const buckets = payload.rateLimitsByLimitId || (payload.rateLimits ? { [payload.rateLimits.limitId || 'codex']: payload.rateLimits } : {});
  return Object.entries(buckets).map(([id, bucket]) => ({ id, name: bucket.limitName || id, model: bucket.normalModelSlug || null,
    plan: bucket.planType || null, reached: bucket.rateLimitReachedType || null,
    windows: ['primary', 'secondary'].flatMap((key) => {
      const value = bucket[key];
      return value && Number.isFinite(value.usedPercent) ? [{ key, remainingPercent: Math.max(0, Math.min(100, 100 - value.usedPercent)), durationMinutes: value.windowDurationMins ?? null, resetsAt: value.resetsAt ?? null }] : [];
    }), credits: bucket.credits ? { balance: bucket.credits.balance ?? null, unlimited: bucket.credits.unlimited === true } : null
  }));
}
export class AccountStatus {
  constructor(app, onUpdate = () => {}) {
    this.app = app; this.onUpdate = onUpdate;
    this.value = { model: null, effort: null, plan: null, limits: [], fetchedAt: null, limitsError: null };
  }
  async read(force = false) {
    if (this.pending) return this.pending;
    if (this.value.fetchedAt && Date.now() - Date.parse(this.value.fetchedAt) < (force ? 5000 : 60000)) return this.value;
    this.pending = this.refresh().finally(() => { this.pending = null; }); return this.pending;
  }
  async refresh() {
    await this.app.start();
    const results = await Promise.allSettled([
      this.app.request('config/read', { includeLayers: false }, 10000),
      this.app.request('account/read', { refreshToken: false }, 10000),
      this.app.request('account/rateLimits/read', {}, 10000)
    ]);
    const [config, account, limits] = results;
    this.value.model = config.status === 'fulfilled' ? config.value.config?.model || null : null;
    this.value.effort = config.status === 'fulfilled' ? config.value.config?.model_reasoning_effort || null : null;
    this.value.plan = account.status === 'fulfilled' ? account.value.account?.planType || null : null;
    this.value.limits = limits.status === 'fulfilled' ? normalizeLimits(limits.value) : [];
    this.value.limitsError = limits.status === 'rejected' ? 'Лимиты недоступны для текущего подключения Codex.' : null;
    this.value.fetchedAt = new Date().toISOString(); this.onUpdate(); return this.value;
  }
  notification({ method, params }) {
    if (method === 'account/rateLimits/updated') {
      const buckets = normalizeLimits(params);
      for (const bucket of buckets) {
        const index = this.value.limits.findIndex((item) => item.id === bucket.id);
        if (index < 0) this.value.limits.push(bucket); else this.value.limits[index] = bucket;
      }
      this.value.limitsError = null; this.value.fetchedAt = new Date().toISOString(); this.onUpdate();
    }
    if (method === 'account/updated') {
      this.value.plan = params.planType || null; this.value.limits = []; this.value.fetchedAt = null;
      this.value.limitsError = 'Данные аккаунта изменились. Обновляем лимиты…'; this.onUpdate();
    }
  }
}
