export const commands = [
  ['/new', 'Новая задача'], ['/clear', 'Удалить завершённые задачи'], ['/stop', 'Остановить задачу'], ['/wake', 'Продолжить сейчас'],
  ['/test', 'Пройти тестирование'], ['/summarize', 'Изучить страницу'], ['/media', 'Просмотреть медиа'], ['/screenshot', 'Снимок страницы']
];
export function matchingCommands(value) {
  return /^\/[a-z]*$/i.test(value) ? commands.filter(([name]) => name.startsWith(value.toLowerCase())) : [];
}
export function installCommands(input, list, translate = text => text) {
  let matches = [], selected = 0, dismissed = false;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const choose = index => { input.value = matches[index][0]; dismissed = true; close(); input.focus(); input.dispatchEvent(new Event('change', { bubbles: true })); };
  const render = () => {
    matches = matchingCommands(input.value); selected = Math.min(selected, Math.max(0, matches.length - 1));
    list.replaceChildren();
    if (dismissed || !matches.length) { close(); return; }
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    matches.forEach(([name, description], index) => {
      const item = document.createElement('button'); item.type = 'button'; item.id = `command-${name.slice(1)}`;
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(index === selected)); item.tabIndex = -1;
      const code = document.createElement('strong'); code.textContent = name;
      const label = document.createElement('span'); label.textContent = translate(description);
      item.append(code, label); item.onclick = () => choose(index); list.append(item);
      if (index === selected) input.setAttribute('aria-activedescendant', item.id);
    });
  };
  input.addEventListener('input', () => { selected = 0; dismissed = false; render(); });
  input.addEventListener('keydown', event => {
    if (list.hidden || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); dismissed = true; close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; render(); }
    else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(selected); }
  });
  input.form.addEventListener('submit', () => { dismissed = true; close(); });
  input.addEventListener('blur', () => { setTimeout(() => { if (!list.contains(document.activeElement)) close(); }, 0); });
  const resize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(140, Math.max(48, input.scrollHeight))}px`; };
  input.addEventListener('input', resize); input.form.addEventListener('submit', () => setTimeout(resize, 0));
}
