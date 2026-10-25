import { messageText } from './content.js';

/** Resolve a saved reply target without copying its content into the message. */
export function replyToMessage(thread, replyToId) {
  if (replyToId == null || String(replyToId).trim() === '') return {};
  const id = String(replyToId).trim();
  if (!Array.isArray(thread) || !thread.some(message => message?.id === id)) {
    throw new Error('引用的群消息不存在或不属于当前群聊，请重新选择。');
  }
  return { replyToId: id };
}

/** Derive display/model context from the current thread at read time. */
export function replyContext(message, thread) {
  const messageId = typeof message?.replyToId === 'string' ? message.replyToId : '';
  if (!messageId) return undefined;
  const source = Array.isArray(thread) ? thread.find(item => item?.id === messageId) : undefined;
  if (!source) return { messageId, missing: true };
  if (source.withdrawn) {
    return {
      messageId,
      ...(source.speakerId ? { speakerId: source.speakerId } : {}),
      ...(source.role ? { role: source.role } : {}),
      withdrawn: true,
      messageText: '原消息已撤回',
    };
  }
  return {
    messageId,
    ...(source.speakerId ? { speakerId: source.speakerId } : {}),
    ...(source.role ? { role: source.role } : {}),
    messageText: messageText(source),
    ...(source.translation ? { translation: source.translation } : {}),
  };
}
