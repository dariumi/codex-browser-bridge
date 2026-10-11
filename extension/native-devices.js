export class DeviceBridge {
  constructor(api, policy) { this.api = api; this.policy = policy; this.port = null; this.pending = null; }
  async run(args, tab) {
    const { nativeDevicesEnabled } = await this.api.storage.local.get('nativeDevicesEnabled');
    if (!nativeDevicesEnabled) throw new Error('Enable browser-local virtual devices in extension settings and install the native host first');
    if (args.action !== 'status' && args.action !== 'stop') { await this.policy.ensure(tab.url, 'virtual_devices', 'advanced'); }
    if (this.pending) throw new Error('A virtual-device request is already running');
    if (!this.port) {
      this.port = this.api.runtime.connectNative('com.codex.browser_bridge.devices'); const port = this.port;
      this.port.onMessage.addListener(reply => { if (this.port !== port || !this.pending) return; const pending = this.pending; this.pending = null; clearTimeout(pending.timer); reply.error ? pending.reject(new Error(reply.error)) : pending.resolve(reply); });
      this.port.onDisconnect.addListener(() => { if (this.port !== port) return; this.port = null; const pending = this.pending; this.pending = null; if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Browser-local native device host disconnected. Check its installation.')); } });
    }
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending = null; this.port?.disconnect(); this.port = null; reject(new Error('Native device request timed out')); }, 15000); this.pending = { resolve, reject, timer }; this.port.postMessage(args); });
  }
  disconnect() { const port = this.port; this.port = null; const pending = this.pending; this.pending = null; if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Browser-local native device host disconnected.')); } port?.disconnect(); }
}
