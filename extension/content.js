(() => {
  if (document.getElementById('codex-browser-bridge-launcher')) return;
  const host = document.createElement('div'); host.id = 'codex-browser-bridge-launcher';
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = 'button{display:flex;align-items:center;gap:9px;border:1px solid #7c66c9;border-radius:30px;background:#192139;color:#f2f4ff;padding:9px 14px 9px 9px;font:600 13px system-ui;box-shadow:0 5px 25px #0005;cursor:pointer}img{width:32px;height:32px;border-radius:50%}.active{outline:3px solid #aa8aff}';
  const button = document.createElement('button'); button.type = 'button'; button.title = 'Открыть чат Codex для этой вкладки';
  const avatar = document.createElement('img'); avatar.src = chrome.runtime.getURL('assets/avatar-128.png'); avatar.alt = '';
  const label = document.createElement('span'); label.textContent = 'Чат Codex';
  button.append(avatar, label); root.append(style, button); document.documentElement.append(host);
  button.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open_chat' }).catch(() => {}));
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'work_indicator') { button.classList.toggle('active', message.active); label.textContent = message.active ? message.label || 'Codex работает' : 'Чат Codex'; }
  });
  chrome.runtime.sendMessage({ type: 'page_ready' }).catch(() => {});
})();
