import { api } from './platform.js';
let current;
async function send(message) { const result = await api.runtime.sendMessage(message); if (result?.error) throw new Error(result.error); return result; }
function text(tag, className, value) { const node = document.createElement(tag); node.className = className; node.textContent = value; return node; }
export function renderPolicy(state) {
  current = state;
  const container = document.getElementById('permission-requests');
  if (container) {
    container.replaceChildren();
    for (const request of state.requests.filter(item => item.status === 'pending')) {
      const card = document.createElement('section'); card.className = 'permission-card';
      card.append(text('span', 'eyebrow', request.kind === 'advanced' ? 'НУЖНО РАЗРЕШЕНИЕ · JAVASCRIPT / CDP' : 'НУЖНО РАЗРЕШЕНИЕ · ДОСТУП К САЙТУ'), text('strong', '', request.host), text('p', 'hint', request.reason), text('p', 'hint', `Действие: ${request.action}. Разрешение на 15 минут${request.scope === 'manual' ? ' в текущем сеансе браузера' : ' для текущей задачи'}.`));
      const controls = document.createElement('div'); controls.className = 'actions';
      for (const allowed of [true, false]) {
        const button = text('button', allowed ? '' : 'secondary', allowed ? 'Разрешить на 15 мин' : 'Отказать'); button.type = 'button'; button.dataset.permissionHost = request.host; button.dataset.permissionDecision = allowed ? 'allow' : 'deny';
        button.onclick = async () => { for (const child of controls.children) child.disabled = true; try { renderPolicy(await send({ type: 'policy_decide', id: request.id, allowed })); } catch (error) { card.append(text('p', 'error', error.message)); for (const child of controls.children) child.disabled = false; } };
        controls.append(button);
      }
      card.append(controls); container.append(card);
    }
    container.hidden = !container.children.length;
  }
  const rules = document.getElementById('access-rules');
  if (rules) {
    rules.replaceChildren();
    for (const rule of state.rules.sort((a, b) => a.domain.localeCompare(b.domain))) {
      const row = document.createElement('div'); row.className = 'rule-row';
      row.append(text('strong', '', rule.domain), text('span', 'hint', `${rule.mode === 'deny' ? 'Запрещён' : 'Спрашивать'} · ${rule.reason}`));
      const button = text('button', 'secondary compact', 'Удалить правило'); button.type = 'button';
      button.onclick = async () => { try { await send({ type: 'policy_set', domain: rule.domain, mode: 'allow' }); renderPolicy(await send({ type: 'policy_status' })); } catch (error) { document.getElementById('policy-feedback').textContent = error.message; } };
      row.append(button); rules.append(row);
    }
  }
}
api.runtime.onMessage.addListener(message => { if (message.type === 'policy_update') renderPolicy(message.data); });
try { renderPolicy(await send({ type: 'policy_status' })); } catch { /* Worker may be reloading. */ }
const form = document.getElementById('access-form');
form?.addEventListener('submit', async event => {
  event.preventDefault();
  try { const result = await send({ type: 'policy_set', domain: document.getElementById('access-domain').value, mode: document.getElementById('access-mode').value }); document.getElementById('policy-feedback').textContent = `${result.domain}: правило сохранено`; renderPolicy(await send({ type: 'policy_status' })); }
  catch (error) { document.getElementById('policy-feedback').textContent = error.message; }
});
for (const button of document.querySelectorAll('[data-workspace-action]')) button.addEventListener('click', async () => {
  button.disabled = true;
  try { const result = await send({ type: 'workspace_control', action: button.dataset.workspaceAction }); const feedback = document.getElementById('workspace-feedback'); if (feedback) feedback.textContent = result.supported === false ? 'Этот браузер не предоставляет API групп вкладок.' : result.closed ? `Закрыто временных вкладок: ${result.closed.length}` : 'Группа обновлена. Вкладки сохранены.'; }
  catch (error) { const feedback = document.getElementById('workspace-feedback'); if (feedback) feedback.textContent = error.message; }
  finally { button.disabled = false; }
});
