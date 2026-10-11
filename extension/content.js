(() => {
  const chrome = globalThis.browser || globalThis.chrome;
  try { globalThis.__codexLauncherCleanup?.(); } catch {}
  document.getElementById('codex-browser-bridge-launcher')?.remove();
  const host = document.createElement('div'); host.id = 'codex-browser-bridge-launcher';
  host.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;left:auto!important;top:auto!important;display:block!important;visibility:visible!important;opacity:1!important;z-index:2147483647!important;' ;
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = 'button{display:flex;align-items:center;gap:9px;border:1px solid #7c66c9;border-radius:30px;background:#192139;color:#f2f4ff;padding:9px 14px 9px 9px;font:600 13px system-ui;box-shadow:0 5px 25px #0005;cursor:pointer}img{width:32px;height:32px;border-radius:50%}.active{outline:2px solid #bda6ff;box-shadow:0 0 0 5px #bda6ff15,0 8px 30px #0004}.active img{animation:codex-breathe 2.5s ease-in-out infinite}.active:after{content:"";width:6px;height:6px;background:#82e5ce;border-radius:50%;animation:codex-signal 1.4s ease-in-out infinite}@keyframes codex-breathe{50%{transform:translateY(-3px);filter:brightness(1.15)}}@keyframes codex-signal{50%{opacity:.3}}@media(prefers-reduced-motion:reduce){.active img,.active:after{animation:none}}';
  const button = document.createElement('button'); button.type = 'button'; button.title = 'Открыть чат Codex для этой вкладки';
  const avatar = document.createElement('img'); avatar.src = chrome.runtime.getURL('assets/avatar-128.png'); avatar.alt = '';
  const label = document.createElement('span'); label.textContent = 'Чат Codex';
  button.append(avatar, label); root.append(style, button); document.documentElement.append(host);
  let active = false, russian = navigator.language.toLowerCase().startsWith('ru');
  const idleLabel = () => russian ? 'Чат Codex' : 'Codex Chat';
  chrome.storage.local.get('language').then(saved => {
    if (saved.language === 'ru' || saved.language === 'en') russian = saved.language === 'ru';
    if (!active) label.textContent = idleLabel();
    button.title = russian ? 'Открыть чат Codex для этой вкладки' : 'Open Codex Chat for this tab';
  }).catch(() => {});
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open_chat' }).then(reply => { if (reply?.error) throw new Error(reply.error); }).catch(error => {
      button.title = error.message; label.textContent = russian ? 'Ошибка — повторить' : 'Error — retry';
    });
  });
  const onMessage = message => {
    if (message.type === 'work_indicator') { active = !!message.active; button.classList.toggle('active', active); label.textContent = active ? message.label || (russian ? 'Codex работает' : 'Codex working') : idleLabel(); }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  const mount = () => {
    const parent = document.fullscreenElement || document.documentElement;
    // Some fullscreen elements (e.g. video) cannot render children; a manual popover
    // puts the launcher in the top layer without moving focus or blocking the page.
    if (host.parentNode !== parent) parent.append(host);
    if (host.showPopover) { host.setAttribute('popover', 'manual'); try { host.showPopover(); } catch {} }
  };
  const observer = new MutationObserver(() => { if (!host.isConnected) mount(); });
  observer.observe(document, { childList: true, subtree: true });
  document.addEventListener('fullscreenchange', mount);
  const cleanup = () => { observer.disconnect(); document.removeEventListener('fullscreenchange', mount); chrome.runtime.onMessage.removeListener(onMessage); host.remove(); };
  globalThis.__codexLauncherCleanup = cleanup;
  mount();
  chrome.runtime.sendMessage({ type: 'page_ready' }).catch(() => {});
})();
