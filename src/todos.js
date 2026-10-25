const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => text(value) === '未定' ? '' : text(value);

const todoId = () => `todo:${globalThis.crypto.randomUUID()}`;

const sourceIndexes = row => {
  const value = row?.sourceMessageIndexes ?? row?.source_message_indexes ?? row?.messageIndex ?? row?.message_index;
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(values.filter(index => Number.isInteger(index) && index >= 0))];
};

/** Convert model suggestions into candidates anchored to actual assistant messages. */
export function parseTodoCandidates(rows, { conversationId, messages = [], participantIds = [] } = {}) {
  const sourceConversationId = text(conversationId);
  const known = new Set((Array.isArray(participantIds) ? participantIds : []).map(text).filter(Boolean));
  if (!sourceConversationId || !known.size) return [];
  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const title = text(row?.title ?? row?.name);
    const people = Array.isArray(row?.participantIds) ? [...new Set(row.participantIds.map(text).filter(Boolean))] : [];
    const indexes = sourceIndexes(row);
    const source = indexes.map(index => messages[index]).filter(message => message?.role === 'assistant' && text(message.id));
    if (!title || !people.length || people.some(id => !known.has(id)) || !source.length || source.length !== indexes.length) return [];
    return [{
      id: todoId(), status: 'candidate', title,
      startAt: time(row?.startAt ?? row?.startTime), endAt: time(row?.endAt ?? row?.endTime),
      participantIds: people, sourceConversationId,
      sourceMessageIds: [...new Set(source.map(message => text(message.id)))],
    }];
  });
}

export function readTodos(state) {
  return Array.isArray(state?.todos) ? state.todos : [];
}

export function pendingTodoCount(state) {
  const fromTodos = readTodos(state).filter(todo => todo?.status === 'open').length;
  const fromCalendar = Array.isArray(state?.calendar?.items)
    ? state.calendar.items.filter(item => item?.type === 'todo' && !item?.done && !readTodos(state).some(t => t?.id === item?.id || t?.id === item?.todoId)).length
    : 0;
  return fromTodos + fromCalendar;
}

export function todoSourceMessageIds(todo) {
  return Array.isArray(todo?.sourceMessageIds) ? todo.sourceMessageIds.filter(id => typeof id === 'string' && id) : [];
}
