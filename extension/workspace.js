// One Codex group per window. Existing tabs are restored; only created temporary tabs can be cleaned up.
export class BrowserWorkspace {
  constructor(api = chrome, { owner = () => null, target = () => null } = {}) { this.api = api; this.owner = owner; this.target = target; this.work = new Map(); this.created = new Map(); this.ready = this.restore(); this.tail = Promise.resolve(); }
  queue(operation) { const result = this.tail.then(operation); this.tail = result.catch(() => {}); return result; }
  async restore() {
    const { workTabs = [], createdTabs = [] } = await this.api.storage.session.get(['workTabs', 'createdTabs']);
    for (const item of workTabs) this.work.set(item.tabId, item);
    for (const item of createdTabs) this.created.set(item.tabId, item);
  }
  async persist() { await this.api.storage.session.set({ workTabs: [...this.work.values()], createdTabs: [...this.created.values()] }); }
  async register(tabId, temporary = true) { await this.ready; this.created.set(tabId, { tabId, temporary, owner: this.owner() || null }); await this.persist(); return this.mark(tabId); }
  async keep(tabId) { await this.ready; const item = this.created.get(tabId); if (!item) throw new Error('Only tabs created by this extension can be marked temporary/kept'); item.temporary = false; await this.persist(); return item; }
  mark(tabId, label, owner) { return this.queue(() => this.markTab(tabId, label, owner)); }
  async markTab(tabId, label, owner) {
    await this.ready; const tab = await this.api.tabs.get(tabId); let item = this.work.get(tabId);
    owner ||= this.owner() || item?.owner || null;
    label ||= item?.label || 'Codex работает';
    if (item && item.label === label && item.owner === owner && (!this.api.tabs.group || tab.groupId === item.groupId)) return { ...item };
    if (!item) {
      const originalGroup = this.api.tabGroups && tab.groupId >= 0 ? await this.api.tabGroups.get(tab.groupId).catch(() => null) : null;
      let groupId = null;
      if (this.api.tabs.group && this.api.tabGroups) {
        const sibling = [...this.work.values()].find(w => w.windowId === tab.windowId && w.groupId !== null);
        if (sibling) { try { await this.api.tabGroups.get(sibling.groupId); groupId = await this.api.tabs.group({ tabIds: [tabId], groupId: sibling.groupId }); } catch { /* Group was manually closed. */ } }
        if (groupId === null) groupId = await this.api.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } });
      }
      item = { tabId, windowId: tab.windowId, originalGroupId: tab.groupId ?? -1, originalGroup, groupId, label, owner }; this.work.set(tabId, item);
    }
    item.owner = owner; item.label = label; await this.persist();
    if (item.groupId !== null) await this.api.tabGroups.update(item.groupId, { title: label.slice(0, 60), color: 'purple', collapsed: false });
    await this.api.action.setBadgeText({ tabId, text: 'AI' }); await this.api.action.setBadgeBackgroundColor({ tabId, color: '#7958dd' }); await this.api.action.setTitle({ tabId, title: label });
    await this.api.tabs.sendMessage(tabId, { type: 'work_indicator', active: true, label }).catch(() => {}); return { ...item };
  }
  release(tabId) { return this.queue(() => this.releaseTab(tabId)); }
  async releaseTab(tabId) {
    await this.ready; const item = this.work.get(tabId); if (!item) return { released: tabId };
    try {
      const tab = await this.api.tabs.get(tabId);
      const created = this.created.get(tabId);
      if (created?.temporary && (tab.pinned || (item.groupId !== null && tab.groupId !== item.groupId))) created.temporary = false;
      if (item.groupId !== null && tab.groupId === item.groupId) {
        if (item.originalGroupId >= 0) {
          try { await this.api.tabGroups.get(item.originalGroupId); await this.api.tabs.group({ tabIds: [tabId], groupId: item.originalGroupId }); }
          catch {
            if (item.originalGroup?.title !== undefined) { const restored = await this.api.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } }); const { title, color, collapsed } = item.originalGroup; await this.api.tabGroups.update(restored, { title, color, collapsed }); }
            else await this.api.tabs.ungroup([tabId]);
          }
        } else await this.api.tabs.ungroup([tabId]);
      }
      await this.api.action.setBadgeText({ tabId, text: '' }); await this.api.action.setTitle({ tabId, title: 'Codex Browser Bridge' });
      await this.api.tabs.sendMessage(tabId, { type: 'work_indicator', active: false }).catch(() => {});
      if (created) created.releasedGroupId = (await this.api.tabs.get(tabId)).groupId;
    } catch { /* Closed tab. */ }
    this.work.delete(tabId); await this.persist(); return { released: tabId };
  }
  async cleanup(owner, exclude = []) {
    await this.ready; exclude = [...exclude, this.target()]; const closed = [], kept = [];
    for (const item of [...this.created.values()]) {
      if (!item.temporary || exclude.includes(item.tabId) || (owner && item.owner !== owner)) continue;
      try {
        const tab = await this.api.tabs.get(item.tabId), work = this.work.get(item.tabId);
        const expectedGroup = work?.groupId ?? item.releasedGroupId;
        if (tab.pinned || (expectedGroup != null && tab.groupId !== expectedGroup)) { kept.push(item.tabId); item.temporary = false; continue; }
        await this.api.tabs.remove(item.tabId); this.work.delete(item.tabId); closed.push(item.tabId);
      } catch { /* Already closed. */ }
      this.created.delete(item.tabId);
    }
    await this.persist(); return { closed, kept };
  }
  async finish(owner, target) { if (this.created.has(target)) await this.keep(target); const result = await this.cleanup(owner, [target]); for (const item of [...this.work.values()]) if (item.owner === owner || item.tabId === target) await this.release(item.tabId); return result; }
  async merge() {
    await this.ready; const groups = new Map();
    for (const item of this.work.values()) {
      const tab = await this.api.tabs.get(item.tabId).catch(() => null); if (!tab || !this.api.tabs.group || !this.api.tabGroups) continue;
      if (tab.groupId !== item.groupId) continue; // Respect a user's regrouping.
      const groupId = groups.get(tab.windowId) ?? item.groupId;
      await this.api.tabs.group({ tabIds: [tab.id], groupId }); item.groupId = groupId; item.windowId = tab.windowId; groups.set(tab.windowId, groupId);
    }
    await this.persist(); return { groups: [...groups.values()] };
  }
  async collapse() { await this.ready; const groups = [...new Set([...this.work.values()].map(w => w.groupId).filter(id => id != null))]; for (const groupId of groups) await this.api.tabGroups.update(groupId, { collapsed: true }); return { collapsed: groups.length > 0, groups, supported: !!this.api.tabGroups }; }
  async releaseAll() { await this.ready; for (const id of [...this.work.keys()]) await this.release(id); return { released: true, tabsKept: true }; }
}
