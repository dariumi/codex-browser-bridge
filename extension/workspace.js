// Visual ownership is persisted across MV3 restarts; original tab groups are restored.
export class BrowserWorkspace {
  constructor(api = chrome) { this.api = api; this.work = new Map(); this.ready = this.restore(); this.tail = Promise.resolve(); }
  queue(operation) { const result = this.tail.then(operation); this.tail = result.catch(() => {}); return result; }
  async restore() {
    const { workTabs = [] } = await this.api.storage.session.get('workTabs');
    for (const item of workTabs) this.work.set(item.tabId, item);
  }
  async persist() { await this.api.storage.session.set({ workTabs: [...this.work.values()] }); }
  mark(tabId, label) { return this.queue(() => this.markTab(tabId, label)); }
  async markTab(tabId, label) {
    await this.ready;
    const tab = await this.api.tabs.get(tabId);
    let item = this.work.get(tabId);
    label = label || item?.label || 'Codex работает';
    if (item && item.label === label && tab.groupId === item.groupId) return { ...item, label };
    if (!item) {
      const originalGroup = tab.groupId >= 0 ? await this.api.tabGroups.get(tab.groupId).catch(() => null) : null;
      const groupId = await this.api.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } });
      item = { tabId, originalGroupId: tab.groupId ?? -1, originalGroup, groupId, label };
      this.work.set(tabId, item); await this.persist();
    }
    item.label = label;
    await this.api.tabGroups.update(item.groupId, { title: label.slice(0, 60), color: 'purple', collapsed: false });
    await this.api.action.setBadgeText({ tabId, text: 'AI' });
    await this.api.action.setBadgeBackgroundColor({ tabId, color: '#7958dd' });
    await this.api.action.setTitle({ tabId, title: label });
    await this.api.tabs.sendMessage(tabId, { type: 'work_indicator', active: true, label }).catch(() => {});
    return { ...item, label };
  }
  release(tabId) { return this.queue(() => this.releaseTab(tabId)); }
  async releaseTab(tabId) {
    await this.ready;
    const item = this.work.get(tabId);
    if (!item) return { released: tabId };
    try {
      const tab = await this.api.tabs.get(tabId);
      // Respect regrouping done by the user while Codex was working.
      if (tab.groupId === item.groupId) {
        if (item.originalGroupId >= 0) {
          try { await this.api.tabGroups.get(item.originalGroupId); await this.api.tabs.group({ tabIds: [tabId], groupId: item.originalGroupId }); }
          catch {
            if (item.originalGroup?.title !== undefined) {
              const restored = await this.api.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } });
              const { title, color, collapsed } = item.originalGroup;
              await this.api.tabGroups.update(restored, { title, color, collapsed });
            } else await this.api.tabs.ungroup([tabId]);
          }
        } else await this.api.tabs.ungroup([tabId]);
      }
      await this.api.action.setBadgeText({ tabId, text: '' });
      await this.api.action.setTitle({ tabId, title: 'Codex Browser Bridge' });
      await this.api.tabs.sendMessage(tabId, { type: 'work_indicator', active: false }).catch(() => {});
    } catch { /* Closed tab. */ }
    this.work.delete(tabId); await this.persist();
    return { released: tabId };
  }
  async releaseAll() { await this.ready; for (const id of [...this.work.keys()]) await this.release(id); }
}
