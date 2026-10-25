import { action, escape, pageHeading } from './shared.js';
import { displayName } from '../profiles.js';

const value = (item, key) => item?.[key] || '';

function participantNames(todo, state) {
  return (todo.participantIds || []).map(id => id === '@user'
    ? (state.userProfile?.name || '我')
    : displayName((state.contacts || []).find(person => person.id === id) || { name: '已移除联系人' })).join('、');
}

function todoFields(todo, state, draft = todo) {
  const currentPeople = [{ id: '@user', name: state.userProfile?.name || '我' }, ...(state.contacts || [])];
  const currentIds = new Set(currentPeople.map(person => person.id));
  const removedIds = [...new Set([...(todo.participantIds || []), ...(draft.participantIds || [])])]
    .filter(id => !currentIds.has(id)).map(id => ({ id, name: '已移除联系人' }));
  const people = [...currentPeople, ...removedIds];
  const selected = new Set(draft.participantIds || todo.participantIds || []);
  return `<label class="todo-field"><span>事项</span><input name="title" value="${escape(value(draft, 'title'))}" required></label>
    <div class="todo-field-row"><label class="todo-field"><span>开始</span><input name="startAt" value="${escape(value(draft, 'startAt'))}" placeholder="未定"></label>
    <label class="todo-field"><span>结束</span><input name="endAt" value="${escape(value(draft, 'endAt'))}" placeholder="未定"></label></div>
    <label class="todo-field"><span>相关人</span><select name="participantIds" multiple aria-label="相关人">
      ${people.map(person => `<option value="${escape(person.id)}" ${selected.has(person.id) ? 'selected' : ''}>${escape(displayName(person))}</option>`).join('')}
    </select></label>`;
}

function todoRow(todo, state, ui, busy) {
  const editing = ui.todoEditing.has(todo.id), pending = busy.has(`todo:${todo.id}`);
  const draft = ui.todoDrafts.get(todo.id) || todo;
  const range = `${value(todo, 'startAt') || '未定'} — ${value(todo, 'endAt') || '未定'}`;
  const sourceIds = todo.sourceMessageIds || [];
  const messages = state.conversations?.[todo.sourceConversationId] || [];
  const sourceCount = sourceIds.filter(id => messages.some(message => message.id === id)).length;
  const sourceStatus = !sourceIds.length || sourceCount === 0 ? '来源短信已删除' : sourceCount < sourceIds.length ? '部分来源短信已删除' : '';
  return `<article class="todo-row ${todo.status === 'done' ? 'is-done' : ''}" data-todo-row="${escape(todo.id)}">
    <div class="todo-row-main"><div><h2>${escape(todo.title)}</h2><p>${escape(range)} · ${escape(participantNames(todo, state) || '未指定相关人')}</p></div>
      <span class="todo-status">${todo.status === 'done' ? '已完成' : '待完成'}</span></div>
    ${sourceStatus ? `<small class="todo-source-missing">${sourceStatus}</small>` : ''}
    <div class="todo-row-actions">
      ${action('todo-done', todo.status === 'done' ? '取消完成' : '完成', '', 'quiet-button', pending)}
      ${action('todo-edit', editing ? '收起编辑' : '编辑', '', 'quiet-button', pending)}
      ${action('todo-delete', '删除', '', 'quiet-button danger', pending)}
    </div>
    ${editing ? `<form class="todo-form" data-todo-form="${escape(todo.id)}">${todoFields(todo, state, draft)}<div class="form-actions"><button class="save-button" type="submit" ${pending ? 'disabled' : ''}>保存</button></div></form>` : ''}
  </article>`;
}

export function renderTodos(state, { ui, busy }) {
  const todos = (state.todos || []).filter(todo => todo.status === 'open' || todo.status === 'done');
  const open = todos.filter(todo => todo.status === 'open'), done = todos.filter(todo => todo.status === 'done');
  const heading = pageHeading('待办');
  const list = (items, title) => items.length ? `<section class="todo-section"><h2>${title}</h2>${items.map(todo => todoRow(todo, state, ui, busy)).join('')}</section>` : '';
  return `${heading}<p class="todo-note">待办需手动勾选，剧情进展不会自动同步。</p>${list(open, '未完成')}${list(done, '已完成')}${!todos.length ? '<p class="todo-empty">还没有已确认的待办。</p>' : ''}`;
}

export function renderTodoCandidate(todo, state, ui, busy) {
  if (!todo || !['candidate', 'open', 'done'].includes(todo.status)) return '';
  if (todo.status === 'open' || todo.status === 'done') {
    const range = `${value(todo, 'startAt') || '未定'} — ${value(todo, 'endAt') || '未定'}`;
    return `<aside class="todo-candidate is-added" data-todo-candidate="${escape(todo.id)}" data-action="open-todo-calendar" data-todo-id="${escape(todo.id)}" role="button" tabindex="0" aria-label="查看日历待办：${escape(todo.title)}"><strong>已加入</strong><p>${escape(todo.title)}</p><small>${escape(range)} · ${escape(participantNames(todo, state) || '未指定相关人')}</small></aside>`;
  }
  const editing = ui.todoEditing.has(todo.id), pending = busy.has(`todo:${todo.id}`), draft = ui.todoDrafts.get(todo.id) || todo;
  const range = `${value(todo, 'startAt') || '未定'} — ${value(todo, 'endAt') || '未定'}`;
  return `<aside class="todo-candidate" data-todo-candidate="${escape(todo.id)}"><div class="todo-candidate-head" data-action="open-todo-calendar" data-todo-id="${escape(todo.id)}" role="button" tabindex="0"><strong>建议加入待办</strong><p>${escape(todo.title)}</p><small>${escape(range)} · ${escape(participantNames(todo, state) || '未指定相关人')}</small></div>
    <div class="todo-candidate-actions">${action('todo-accept', pending ? '保存中…' : '加入待办', '', 'quiet-button', pending)}${action('todo-edit', editing ? '收起编辑' : '修改', '', 'quiet-button', pending)}${action('open-todo-calendar', '查看日历', '', 'quiet-button', pending)}</div>
    ${editing ? `<form class="todo-form" data-todo-form="${escape(todo.id)}">${todoFields(todo, state, draft)}<div class="form-actions"><button class="save-button" type="submit" ${pending ? 'disabled' : ''}>保存并加入</button></div></form>` : ''}
  </aside>`;
}
