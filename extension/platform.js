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
  if (browserApi.sidePanel) return browserApi.sidePanel.open({ tabId });
  if (browserApi.sidebarAction) return browserApi.sidebarAction.open();
  return Promise.reject(new Error('Боковая панель недоступна в этом браузере.'));
}
