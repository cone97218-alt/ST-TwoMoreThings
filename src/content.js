import { findSticker } from './stickers.js';
import { replyContext } from './replies.js';
import { formatBuckshotChronicle } from './games/buckshot-roulette.js';

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
    case 'game-action': {
      const txt = message.gameAction?.text || message.text || '';
      const prefixMatch = txt.match(/^\[(抽鬼牌|恶魔轮盘|小游戏动作|小游戏)：(.*)\]$/);
      const inner = prefixMatch ? prefixMatch[2] : (txt.startsWith('[') && txt.endsWith(']') ? txt.slice(1, -1) : txt);
      let gameTitle = '小游戏动作';
      if (message.gameKind === 'buckshot_roulette' || message.gameAction?.gameKind === 'buckshot_roulette') {
        gameTitle = '恶魔轮盘';
      } else if (message.gameKind === 'old_maid' || message.gameAction?.gameKind === 'old_maid') {
        gameTitle = '抽鬼牌';
      } else if (prefixMatch) {
        gameTitle = prefixMatch[1];
      } else if (/实弹|空弹|弹仓|枪口|扣动扳机|放大镜|手锯|啤酒|手铐|香烟/.test(inner)) {
        gameTitle = '恶魔轮盘';
      } else if (/抽牌|摸牌|鬼牌|配对|手牌/.test(inner)) {
        gameTitle = '抽鬼牌';
      }
      return `[${gameTitle}：${inner || '战局变动'}]`;
    }
    case 'game': {
      const g = message.game || {};
      const title = g.title || (g.kind === 'buckshot_roulette' ? '恶魔轮盘' : (g.kind === 'old_maid' ? '抽鬼牌' : '小游戏'));
      const wager = g.wager ? `，赌注：${g.wager}` : '';
      if (g.status === 'invited') {
        const inviter = g.sender === 'user' ? '玩家向你发起' : '你向玩家发起';
        return `[小游戏邀约：${inviter}${title}对决${wager}；等待回应：可接受并确认赌注、可协商更换赌注、或拒绝]`;
      }
      if (g.status === 'countered') {
        return `[小游戏邀约：对方提议更换赌注为【${g.wager}】；等待确认]`;
      }
      if (g.status === 'rejected') {
        return `[小游戏邀约：${title}对决已被拒绝]`;
      }
      if (g.status === 'finished') {
        return `[小游戏：${title}${wager}；对决结束(${g.winner === 'user' ? '玩家获胜' : '对方获胜'})]`;
      }
      return `[小游戏：${title}${wager}；对局进行中(第${g.round || 1}轮，轮到${g.turn === 'user' ? '玩家' : '你'}行动)]`;
    }
    default: return message.text || '';
  }
}

// 计算某个对局结束后，后续经历的 AI 回复轮次（一轮指 AI 的一次完整回复批次，而不是消息条数）
export function countAiTurnsAfterGame(gameCard, thread = []) {
  if (!gameCard || !Array.isArray(thread) || !thread.length) return 0;
  const gameIdx = thread.findIndex(m => m && m.id === gameCard.id);
  if (gameIdx === -1) return 0;

  // 找到此游戏卡片之后属于此对局的最后一条 game-action（或 gameCard 本身）
  let lastActionIdx = gameIdx;
  let lastActionMsg = thread[gameIdx];
  for (let i = gameIdx + 1; i < thread.length; i++) {
    const m = thread[i];
    if (!m) continue;
    if (m.type === 'game') break; // 遇到了下一局小游戏
    if (m.type === 'game-action') {
      lastActionIdx = i;
      lastActionMsg = m;
    }
  }

  const subsequent = thread.slice(lastActionIdx + 1);
  if (!subsequent.length) return 0;

  const finishBatchKey = lastActionMsg?.batch?.key;
  const seenAiBatches = new Set();
  if (finishBatchKey) seenAiBatches.add(finishBatchKey);

  let aiTurns = 0;
  let inAiTurn = false;

  for (const m of subsequent) {
    if (!m || m.withdrawn) continue;
    const isAi = m.role === 'assistant' || (m.speakerId && m.speakerId !== '@user');
    const isUser = m.role === 'user' || m.speakerId === '@user';

    if (isAi) {
      const bKey = m.batch?.key;
      if (bKey) {
        if (!seenAiBatches.has(bKey)) {
          seenAiBatches.add(bKey);
          aiTurns++;
        }
      } else {
        if (!inAiTurn) {
          aiTurns++;
          inAiTurn = true;
        }
      }
    } else if (isUser) {
      inAiTurn = false;
    }
  }

  return aiTurns;
}

// 检查某条 game-action 消息是否属于已完结或已终止的小游戏（用于 UI 折叠等场景）
export function isFinishedGameAction(message, thread = []) {
  if (!message || message.type !== 'game-action') return false;
  const idx = Array.isArray(thread) ? thread.findIndex(item => item && item.id === message.id) : -1;
  const searchSlice = idx !== -1 ? thread.slice(0, idx + 1) : (Array.isArray(thread) ? thread : []);
  const gameCard = [...searchSlice].reverse().find(item => item && item.type === 'game');
  if (!gameCard) return false;
  return gameCard.game?.status === 'finished' || gameCard.game?.status === 'rejected';
}

// 检查某条已完结小游戏的动作播报是否已经超过缓冲带轮次（超过才正式清除送模上下文）
export function isGameActionExpired(message, thread = [], bufferTurns = 5) {
  if (!isFinishedGameAction(message, thread)) return false;
  if (bufferTurns <= 0) return true;
  const idx = Array.isArray(thread) ? thread.findIndex(item => item && item.id === message.id) : -1;
  const searchSlice = idx !== -1 ? thread.slice(0, idx + 1) : (Array.isArray(thread) ? thread : []);
  const gameCard = [...searchSlice].reverse().find(item => item && item.type === 'game');
  if (!gameCard) return false;
  const elapsedTurns = countAiTurnsAfterGame(gameCard, thread);
  return elapsedTurns > bufferTurns;
}

// 过滤掉已完结且超过缓冲轮次的小游戏动作播报，终局 5 轮内保留上下文注入，5 轮后自动清除以减少 Token 占用
export function filterFinishedGameActions(messages = [], thread = [], bufferTurns = 5) {
  if (!Array.isArray(messages)) return messages;
  const fullThread = Array.isArray(thread) && thread.length ? thread : messages;
  return messages.filter(m => !isGameActionExpired(m, fullThread, bufferTurns));
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
  if (item.type === 'game-action') {
    const raw = text(item.gameAction?.text ?? item.text);
    const inner = (raw.startsWith('[') && raw.endsWith(']')) ? raw.slice(1, -1).replace(/^抽鬼牌：|^小游戏动作：|^恶魔轮盘：/, '') : raw;
    const inferredKind = item.gameKind || item.gameAction?.gameKind || (/实弹|空弹|弹仓|枪口|扣动扳机|放大镜|手锯|啤酒|手铐|香烟/.test(inner) ? 'buckshot_roulette' : 'old_maid');
    content = {
      type: 'game-action',
      gameKind: inferredKind,
      gameAction: {
        text: inner,
        gameKind: inferredKind,
      },
    };
  }
  if (item.type === 'game' && item.game) {
    const gKind = text(item.game.kind) || 'old_maid';
    const defaultTitle = gKind === 'buckshot_roulette' ? '恶魔轮盘' : '抽鬼牌';
    content = {
      type: 'game',
      game: {
        kind: gKind,
        title: text(item.game.title) || defaultTitle,
        gameId: text(item.game.gameId || item.game.id),
        status: item.game.status || 'ongoing',
        sender: text(item.game.sender) || (item.role === 'assistant' ? 'ai' : 'user'),
        wager: text(item.game.wager) || '纯娱乐',
        winner: text(item.game.winner),
        loser: text(item.game.loser),
        round: Number(item.game.round) || 1,
        turn: item.game.turn || 'user',
        state: item.game.state || null,
        lastAction: item.game.lastAction || null,
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

export function formatSingleUserInput(message) {
  if (!message) return '';
  let line = message.forwarded ? formatForwardedContextText(message) : messageText(message);
  if (message.translation && !message.withdrawn) {
    line += `（译文：${message.translation}）`;
  }
  return line;
}

export function extractLatestUserInput(messages) {
  if (!Array.isArray(messages) || !messages.length) return '';
  let lastUserIdx = -1;
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.withdrawn) continue;
    if (lastUserIdx === -1 && (m.role === 'user' || m.speakerId === '@user')) {
      lastUserIdx = i;
    }
    if (lastAssistantIdx === -1 && (m.role === 'assistant' || (m.speakerId && m.speakerId !== '@user'))) {
      lastAssistantIdx = i;
    }
    if (lastUserIdx !== -1 && lastAssistantIdx !== -1) break;
  }

  // 检查是否有进行中的小游戏或最新对局系统动作
  const activeGame = messages.find(m => m && !m.withdrawn && m.type === 'game' && m.game?.status === 'playing');
  const postAssistantMessages = lastAssistantIdx !== -1 ? messages.slice(lastAssistantIdx + 1) : messages;
  const hasRecentGameAction = postAssistantMessages.some(m => m && !m.withdrawn && (m.type === 'game-action' || m.game?.action === 'draw' || m.game?.action === 'shoot'));

  const isBuckshot = activeGame?.game?.kind === 'buckshot_roulette';
  let gameActionPrompt = '';
  if (isBuckshot) {
    const rawGameState = activeGame?.game?.state || activeGame?.game;
    const chronicle = formatBuckshotChronicle(rawGameState, { userName: '你', contactName: contact?.name || '对方' });
    gameActionPrompt = `[恶魔轮盘战局实况与对弈推进]\n${chronicle}\n当前轮到你行动，请在 JSON 顶层返回结构化动作指令（gameAction），并配以纯私聊台词。`;
  } else {
    gameActionPrompt = '[小游戏对弈推进] 玩家已完成摸牌（手牌已变动消除），当前轮到你从玩家手牌中抽牌并发表对弈反应与日常台词。';
  }

  // 情况 1: 角色已经回复过最后的文本发言 (lastAssistantIdx > lastUserIdx)
  if (lastAssistantIdx !== -1 && lastAssistantIdx > lastUserIdx) {
    if (activeGame || hasRecentGameAction) {
      return gameActionPrompt;
    }
    // 普通对话且无新用户发言（例如用户点继续），返回空，避免重复提醒上上轮的陈旧提问
    return '';
  }

  if (lastUserIdx === -1) {
    if (activeGame || hasRecentGameAction) {
      return gameActionPrompt;
    }
    return '';
  }

  // 情况 2: 用户在本轮有最新发言 (lastUserIdx > lastAssistantIdx)
  const userMessages = [];
  for (let i = lastUserIdx; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.withdrawn) continue;
    const isUser = m.role === 'user' || m.speakerId === '@user';
    if (isUser) {
      userMessages.unshift(m);
    } else {
      break;
    }
  }

  const userText = userMessages.map(formatSingleUserInput).filter(Boolean).join('\n');
  if (activeGame || hasRecentGameAction) {
    return userText
      ? `${userText}\n${gameActionPrompt}`
      : gameActionPrompt;
  }

  return userText;
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
