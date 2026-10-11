export const api = globalThis.browser || globalThis.chrome;
export const isFirefox = !!globalThis.browser?.runtime?.getBrowserInfo;
export function capabilities(browserApi = api) {
  const debuggerAvailable = !!browserApi.debugger;
  return { browser: debuggerAvailable ? 'chromium' : 'firefox', backend: debuggerAvailable ? 'cdp' : 'dom',
    trustedInput: debuggerAvailable, cdp: debuggerAvailable, fullPageScreenshot: debuggerAvailable,
    fileUpload: debuggerAvailable, dialogs: debuggerAvailable, console: debuggerAvailable, network: debuggerAvailable,
    tabGroups: !!(browserApi.tabs.group && browserApi.tabGroups), sidebar: !!(browserApi.sidePanel || browserApi.sidebarAction) };
}
// Call synchronously from the message handler to retain Firefox's user gesture.
export function openChat(tabId, browserApi = api) {
  try {
    if (browserApi.sidePanel) return Promise.resolve(browserApi.sidePanel.open({ tabId }));
    if (browserApi.sidebarAction) return Promise.resolve(browserApi.sidebarAction.open());
    return Promise.reject(new Error('Боковая панель недоступна в этом браузере.'));
  } catch (error) { return Promise.reject(error); }
}
export async function openChatPage(tabId, browserApi = api) {
  const base = browserApi.runtime.getURL('chat.html');
  const url = `${base}?tabId=${encodeURIComponent(tabId)}`;
  const existing = (await browserApi.tabs.query({})).find(tab => tab.url?.split('?')[0] === base);
  if (existing) return browserApi.tabs.update(existing.id, { url, active: true });
  return browserApi.tabs.create({ url, active: true });
}
// Keep Firefox's close call in the original click stack. Closing the UI never
// cancels its task and never closes the page under test.
export function closeChat({ pageTabId, tabId, windowId } = {}, browserApi = api) {
  try {
    if (pageTabId) return Promise.resolve(browserApi.tabs.remove(pageTabId));
    if (browserApi.sidebarAction?.close) return Promise.resolve(browserApi.sidebarAction.close());
    if (browserApi.sidePanel?.close) {
      if (tabId) return browserApi.sidePanel.close({ tabId }).catch(error => {
        if (windowId === undefined) throw error;
        return browserApi.sidePanel.close({ windowId });
      });
      return Promise.resolve(browserApi.sidePanel.close({ windowId }));
    }
    return Promise.reject(new Error('В этой версии браузера закройте панель её штатной кнопкой ✕.'));
  } catch (error) { return Promise.reject(error); }
}
