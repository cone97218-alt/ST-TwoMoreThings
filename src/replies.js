import { messageText, shortenMessageId } from './content.js';

/** Resolve a saved reply target without copying its content into the message. */
export function replyToMessage(thread, replyToId) {
  if (replyToId == null || String(replyToId).trim() === '') return {};
  const id = String(replyToId).trim();
  const shortId = shortenMessageId(id);
  const matched = Array.isArray(thread) && thread.find(message => message?.id === id || (message?.id && shortenMessageId(message.id) === shortId));
  if (!matched) {
    throw new Error('引用的群消息不存在或不属于当前群聊，请重新选择。');
  }
  return { replyToId: matched.id };
}

/** Derive display/model context from the current thread at read time. */
export function replyContext(message, thread) {
  const messageId = typeof message?.replyToId === 'string' ? message.replyToId : '';
  if (!messageId) return undefined;
  const shortMessageId = shortenMessageId(messageId);
  const source = Array.isArray(thread) ? thread.find(item => item?.id === messageId || (item?.id && shortenMessageId(item.id) === shortMessageId)) : undefined;
  if (!source) return { messageId: shortMessageId, missing: true };
  if (source.withdrawn) {
    return {
      messageId: shortMessageId,
      ...(source.speakerId ? { speakerId: source.speakerId } : {}),
      ...(source.role ? { role: source.role } : {}),
      withdrawn: true,
      messageText: '原消息已撤回',
    };
  }
  return {
    messageId: shortMessageId,
    ...(source.speakerId ? { speakerId: source.speakerId } : {}),
    ...(source.role ? { role: source.role } : {}),
    messageText: messageText(source),
    ...(source.translation ? { translation: source.translation } : {}),
  };
}
