import { findSticker } from './stickers.js';
import { replyContext } from './replies.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const states = { pending: '待收款', accepted: '已收下', returned: '已退回' };

export function shortenMessageId(id) {
  if (typeof id !== 'string') return '';
  const trimmed = id.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.slice(0, 8);
  }
  return trimmed;
}

export function generateMessageId() {
  const uuid = globalThis.crypto?.randomUUID?.() || (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2));
  return uuid.replace(/-/g, '').slice(0, 8);
}

export function messageText(message) {
  if (!message) return '';
  if (message.withdrawn) return '[消息已撤回]';
  switch (message.type) {
    case 'sticker': return `[表情：${findSticker(message.stickerId)?.label || '贴纸'}]`;
    case 'location': return `[定位：${message.location.name}${message.location.address ? `，${message.location.address}` : ''}]`;
    case 'transfer': return `[转账：${message.transfer.amount} ${message.transfer.currency || 'CNY'}${message.transfer.note ? `，${message.transfer.note}` : ''}；${states[message.transfer.status] || states.pending}]`;
    case 'image': return `[图片：${message.image.description}]`;
    case 'poke': return `[拍一拍：${message.poke?.actorName || '对方'}拍了拍${message.poke?.targetName || '你'}${message.poke?.suffix || '的头像'}]`;
    default: return message.text || '';
  }
}

export function normalizeContent(item) {
  if (typeof item === 'string') return item.trim() ? { text: item.trim() } : null;
  if (!item || typeof item !== 'object') return null;
  const plain = text(item.text ?? item.content ?? item.message), translation = text(item.translation ?? item.translatedText);
  const rawReplyTo = text(item.replyToId ?? item.replyTo?.messageId ?? item.replyTo?.id ?? (typeof item.replyTo === 'string' ? item.replyTo : ''));
  const thought = text(item.thought ?? item.innerThought);
  const reasoning = text(item.reasoning ?? item.reasoningContent ?? item.thoughtChain);
  const edited = Boolean(item.edited || item.editedAt);

  // 转发元数据归一化
  const forwardedFromObj = typeof item.forwardedFrom === 'string' && text(item.forwardedFrom)
    ? { senderName: text(item.forwardedFrom) }
    : (item.forwardedFrom && typeof item.forwardedFrom === 'object'
      ? {
          senderName: text(item.forwardedFrom.senderName ?? item.forwardedFrom.name ?? item.forwardedFrom.sender) || '他人',
          ...(text(item.forwardedFrom.chatName ?? item.forwardedFrom.groupName) ? { chatName: text(item.forwardedFrom.chatName ?? item.forwardedFrom.groupName) } : {}),
          ...(item.forwardedFrom.isGroup != null ? { isGroup: Boolean(item.forwardedFrom.isGroup) } : {}),
        }
      : null);
  const isForwarded = Boolean(item.forwarded || forwardedFromObj || item.type === 'forward');

  // 主动撤回（本轮欲言又止/秒撤回）
  if (item.withdrawn === true || item.type === 'withdraw' || item.type === 'withdrawn') {
    const withdrawnText = plain && plain !== '[消息已撤回]' ? plain : text(item.withdrawnText);
    return {
      text: '[消息已撤回]',
      withdrawn: true,
      ...(withdrawnText ? { withdrawnText } : {}),
      ...(thought ? { thought } : {}),
    };
  }

  const extraMeta = {
    ...(rawReplyTo ? { replyToId: rawReplyTo } : {}),
    ...(thought ? { thought } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(edited ? { editedAt: typeof item.editedAt === 'string' ? item.editedAt : new Date().toISOString() } : {}),
    ...(isForwarded ? { forwarded: true, forwardedFrom: forwardedFromObj || { senderName: '他人' } } : {}),
  };

  let content;
  if (item.type === 'sticker' && findSticker(item.stickerId)) content = { type: 'sticker', stickerId: item.stickerId };
  if (item.type === 'location' && text(item.location?.name)) content = { type: 'location', location: { name: text(item.location.name), address: text(item.location.address) } };
  if (item.type === 'transfer') {
    const value = String(item.transfer?.amount ?? '').trim();
    if (/^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0) content = { type: 'transfer', transfer: { amount: Number(value).toFixed(2), currency: text(item.transfer.currency) || 'CNY', note: text(item.transfer.note), recipientId: text(item.transfer.recipientId), status: 'pending' } };
  }
  if (item.type === 'image' && text(item.image?.description)) content = { type: 'image', image: { description: text(item.image.description) } };
  if (item.type === 'poke') {
    const rawSuffix = text(item.poke?.suffix) || '的头像';
    content = {
      type: 'poke',
      poke: {
        actorId: text(item.poke?.actorId || item.speakerId),
        actorName: text(item.poke?.actorName) || '对方',
        targetId: text(item.poke?.targetId) || '@user',
        targetName: text(item.poke?.targetName) || '你',
        suffix: rawSuffix.startsWith('的') ? rawSuffix : `的${rawSuffix}`,
      },
    };
  }
  if (content) return { ...content, text: messageText(content), ...extraMeta };
  return plain ? { text: plain, ...(translation ? { translation } : {}), ...extraMeta } : null;
}

export function formatForwardedContextText(message) {
  const rawText = messageText(message);
  if (!message?.forwarded) return rawText;
  const senderName = message.forwardedFrom?.senderName || '他人';
  const chatName = message.forwardedFrom?.chatName || '';
  const sourceDesc = chatName && message.forwardedFrom?.isGroup
    ? `群聊「${chatName}」的 ${senderName}`
    : senderName;
  const prefix = message.role === 'user' ? '用户转发的聊天记录' : '转发的聊天记录';
  return `[${prefix}｜原发言人：${sourceDesc}] ${rawText}`;
}

export function contextMessage(message, thread) {
  const replyTo = replyContext(message, thread);
  const textForModel = message.forwarded ? formatForwardedContextText(message) : messageText(message);
  const shortId = message.id ? shortenMessageId(message.id) : undefined;
  return {
    ...(shortId ? { id: shortId } : {}),
    ...(message.speakerId ? { speakerId: message.speakerId } : { role: message.role }),
    text: textForModel,
    ...(message.type === 'sticker' ? { type: 'sticker', stickerId: message.stickerId } : {}),
    ...(message.translation && !message.withdrawn ? { translation: message.translation } : {}),
    ...(message.type === 'transfer' ? { transferId: shortId, recipientId: message.transfer.recipientId, status: message.transfer.status } : {}),
    ...(message.withdrawn ? { withdrawn: true } : {}),
    ...(message.editedAt ? { edited: true } : {}),
    ...(Array.isArray(message.reactions) && message.reactions.length ? { reactions: message.reactions } : {}),
    ...(message.forwarded ? { forwarded: true, ...(message.forwardedFrom ? { forwardedFrom: message.forwardedFrom } : {}) } : {}),
    ...(replyTo ? { replyTo } : {}),
  };
}

export const RICH_MESSAGES_PROMPT = `messages可混合普通文字和下列消息；群聊每条仍需speakerId。文字内的小表情可直接写emoji，或用[表情名]，名称从emojis目录选择，如[合十]。图片表情包是独立图片贴纸，与文字中的小表情、颜文字不同。人物习惯爱发表情包且stickers目录有合适内容时，应自然选用图片贴纸，也可单独回一张；emoji和颜文字可并用，不能一直替代图片表情包。没有合适场景时不发，不要求每轮发。
图片贴纸：{"type":"sticker","stickerId":"从stickers目录原样选择id"}，按meaning选图，不编造编号；定位：{"type":"location","location":{"name":"地点名","address":"剧情内地址或空"}}；转账：{"type":"transfer","transfer":{"amount":"金额数字","currency":"CNY等币种","note":"简短备注","recipientId":"私聊填@user，群聊填收款成员id"}}；图片：{"type":"image","image":{"description":"真实发来照片的可绘制画面描述，写清画面人物、动作、物品和环境"}}；拍一拍：{"type":"poke","poke":{"actorName":"发起人姓名","targetId":"@user或成员id","targetName":"被拍对象姓名","suffix":"的头像"}}。照片按场景需要发送，不要求每轮发；只给描述，用户点开才生图，不生成图片地址或绘图标签。
角色还可在messages中主动使用以下线上互动格式（按情境自然选用，不强行每轮使用）：
- 主动引用：在消息对象中附带"replyToId":"history或previousMessages中目标消息的id"，针对特定某句消息进行引用回复。
- 主动转发：{"text":"被转发的原话","forwarded":true,"forwardedFrom":{"senderName":"原发言人姓名","chatName":"可选群名","isGroup":false}}，用于向对方转述或分享他人/群聊发过的消息。
- 欲言又止/秒撤回：{"text":"原本打出但立刻撤回的话","withdrawn":true,"thought":"撤回时的真实内心想法"}，用于表现手滑发错、害羞或犹豫撤回（常配合下一条解释或掩饰的正常消息）。
- 收到待收款转账时，可在transferActions中返回{"transferId":"原消息id","status":"accepted或returned"}（群聊另带speakerId）。
- 对已有消息做互动操作时，可在顶层messageActions中返回：贴表情回应{"action":"react","messageId":"目标消息id","emoji":"❤️等单个emoji"}、撤回自己之前的消息{"action":"withdraw","messageId":"自己已发消息id"}、修改自己之前的消息{"action":"edit","messageId":"自己已发消息id","text":"修改后的文字"}（群聊每项另带speakerId）。普通消息仍用text和可选translation。`;
