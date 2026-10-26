// 抽鬼牌核心引擎与规则状态机
// 规则：精简 17 张牌二人快节奏对决（A-8 各两张 + 1张 Joker），成对丢弃，最后手握鬼牌者输。

export const CARD_SUITS = {
  SPADE: 'S',
  HEART: 'H',
};

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8'];

export function createDeck() {
  const cards = [];
  for (const rank of RANKS) {
    cards.push({ id: `${rank}S`, rank, suit: 'S', isJoker: false });
    cards.push({ id: `${rank}H`, rank, suit: 'H', isJoker: false });
  }
  cards.push({ id: 'JOKER', rank: 'JOKER', suit: 'JOKER', isJoker: true });
  return cards;
}

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 剔除手中的成对牌，返回剩余手牌与剔除的对子列表
export function discardPairs(hand) {
  const remaining = [];
  const discarded = [];
  const rankBuckets = new Map();

  for (const card of hand) {
    if (card.isJoker) {
      remaining.push(card);
      continue;
    }
    if (!rankBuckets.has(card.rank)) {
      rankBuckets.set(card.rank, []);
    }
    rankBuckets.get(card.rank).push(card);
  }

  for (const [rank, bucket] of rankBuckets.entries()) {
    while (bucket.length >= 2) {
      const card1 = bucket.pop();
      const card2 = bucket.pop();
      discarded.push([card1, card2]);
    }
    if (bucket.length === 1) {
      remaining.push(bucket.pop());
    }
  }

  return { remaining, discarded };
}

export function cleanParticipantName(name, fallback = '你') {
  if (!name || typeof name !== 'string') return fallback;
  const trimmed = name.trim();
  if (!trimmed || ['<user>', '{{user}}', '<char>', '{{char}}'].includes(trimmed.toLowerCase())) {
    return fallback;
  }
  return trimmed;
}

// 创建对战邀请（尚未正式发牌，等待对方接受或协商赌注）
export function createOldMaidInvitation({ sender = 'user', wager = '', userName = '你', contactName = '对方' } = {}) {
  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  return {
    id: `om_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: 'old_maid',
    title: '抽鬼牌',
    sender, // 'user' | 'ai'
    status: 'invited', // 'invited' | 'playing' | 'rejected' | 'finished'
    wager: wager.trim() || '纯娱乐',
    round: 0,
    turn: 'user',
    winner: null,
    loser: null,
    userCards: [],
    aiCards: [],
    discardPile: [],
    bluffCardIndex: -1,
    lastAction: {
      type: 'invite',
      actor: sender,
      description: sender === 'user' ? `【${uName}】发起了抽鬼牌对决邀请，等待【${cName}】响应。` : `【${cName}】发起了抽鬼牌对决邀请。`,
    },
    history: [],
  };
}

// 接受邀请，正式开局发牌
export function acceptOldMaidGame(gameOrInvite, { wager, starter = 'user', userName = '你', contactName = '对方' } = {}) {
  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const deck = shuffle(createDeck());
  const userInitial = starter === 'user' ? deck.slice(0, 9) : deck.slice(0, 8);
  const aiInitial = starter === 'user' ? deck.slice(9) : deck.slice(8);

  const userCleaned = discardPairs(userInitial);
  const aiCleaned = discardPairs(aiInitial);
  const initialDiscarded = [...userCleaned.discarded, ...aiCleaned.discarded];

  const game = {
    ...gameOrInvite,
    status: 'playing',
    wager: (wager !== undefined ? wager : gameOrInvite.wager) || '纯娱乐',
    round: 1,
    turn: starter,
    userCards: userCleaned.remaining,
    aiCards: aiCleaned.remaining,
    discardPile: initialDiscarded,
    bluffCardIndex: -1,
    lastAction: {
      type: 'start',
      actor: starter,
      description: `对决正式开始！已消除 ${initialDiscarded.length} 对初始手牌，轮到【${starter === 'user' ? uName : cName}】抽牌。`,
    },
    history: [
      {
        round: 1,
        actor: 'system',
        text: `对局开始，已消除 ${initialDiscarded.length} 对手牌。轮到【${starter === 'user' ? uName : cName}】行动。`,
      }
    ],
  };

  return checkGameStatus(game, { userName: uName, contactName: cName });
}

// 拒绝邀请
export function rejectOldMaidGame(gameOrInvite, { reason = '', contactName = '对方' } = {}) {
  const cName = cleanParticipantName(contactName, '对方');
  return {
    ...gameOrInvite,
    status: 'rejected',
    lastAction: {
      type: 'reject',
      description: reason || `【${cName}】婉拒了本次对决邀请。`,
    },
  };
}

// 直接创建一局已开局的游戏（快捷开局兼容）
export function createOldMaidGame({ wager = '', starter = 'user', userName = '你', contactName = '对方' } = {}) {
  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const invite = createOldMaidInvitation({ sender: starter, wager, userName: uName, contactName: cName });
  return acceptOldMaidGame(invite, { starter, userName: uName, contactName: cName });
}

// 检查胜负
export function checkGameStatus(game, { userName = '你', contactName = '对方' } = {}) {
  if (game.status !== 'playing') return game;

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const userCount = game.userCards.length;
  const aiCount = game.aiCards.length;

  if (userCount === 0 && aiCount > 0) {
    game.status = 'finished';
    game.winner = 'user';
    game.loser = 'ai';
    game.lastAction = {
      type: 'game_over',
      actor: 'user',
      description: `【${uName}】出完了所有手牌获得胜利！【${cName}】持有鬼牌落败！`,
    };
    return game;
  }

  if (aiCount === 0 && userCount > 0) {
    game.status = 'finished';
    game.winner = 'ai';
    game.loser = 'user';
    game.lastAction = {
      type: 'game_over',
      actor: 'ai',
      description: `【${cName}】出完了所有手牌获得胜利！【${uName}】持有鬼牌落败！`,
    };
    return game;
  }

  if (userCount + aiCount === 1) {
    game.status = 'finished';
    if (userCount === 1) {
      game.winner = 'ai';
      game.loser = 'user';
      game.lastAction = {
        type: 'game_over',
        actor: 'ai',
        description: `对子消除完毕，【${uName}】手握最后的鬼牌落败！`,
      };
    } else {
      game.winner = 'user';
      game.loser = 'ai';
      game.lastAction = {
        type: 'game_over',
        actor: 'user',
        description: `对子消除完毕，【${cName}】手握最后的鬼牌落败！`,
      };
    }
  }

  return game;
}

// 玩家回合：抽取 AI 的一张牌
export function userDrawCard(game, aiCardIndex, { userName = '你', contactName = '对方' } = {}) {
  if (game.status !== 'playing') return { game, error: '游戏未处于进行中状态' };
  if (game.turn !== 'user') return { game, error: '当前不是你的回合' };
  if (aiCardIndex < 0 || aiCardIndex >= game.aiCards.length) return { game, error: '无效的手牌索引' };

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const nextGame = JSON.parse(JSON.stringify(game));
  const drawnCard = nextGame.aiCards.splice(aiCardIndex, 1)[0];

  let matchedCardIndex = -1;
  if (!drawnCard.isJoker) {
    matchedCardIndex = nextGame.userCards.findIndex(c => !c.isJoker && c.rank === drawnCard.rank);
  }

  let matched = false;
  let matchedCard = null;

  if (matchedCardIndex !== -1) {
    matched = true;
    matchedCard = nextGame.userCards.splice(matchedCardIndex, 1)[0];
    nextGame.discardPile.push([drawnCard, matchedCard]);
    nextGame.lastAction = {
      type: 'user_draw_match',
      actor: 'user',
      drawnCard,
      matchedCard,
      description: `【${uName}】抽中了【${cName}】的【${cardDisplayName(drawnCard)}】，与自己的【${cardDisplayName(matchedCard)}】成对消除！`,
    };
  } else {
    nextGame.userCards.push(drawnCard);
    nextGame.lastAction = {
      type: 'user_draw_keep',
      actor: 'user',
      drawnCard,
      description: drawnCard.isJoker
        ? `【${uName}】抽中了【${cName}】的鬼牌 Joker！小心藏好别被识破！`
        : `【${uName}】抽中了【${cName}】的【${cardDisplayName(drawnCard)}】并加入手牌。`,
    };
  }

  nextGame.history.push({
    round: nextGame.round,
    actor: 'user',
    text: nextGame.lastAction.description,
  });

  checkGameStatus(nextGame, { userName: uName, contactName: cName });

  if (nextGame.status === 'playing') {
    nextGame.turn = 'ai';
  }

  return { game: nextGame, drawnCard, matched, matchedCard };
}

// AI 回合：从玩家手牌中抽取一张牌
export function aiDrawCard(game, chosenIndex = undefined, { userName = '你', contactName = '对方', customNotice = '' } = {}) {
  if (game.status !== 'playing') return { game, error: '游戏未处于进行中状态' };
  if (game.turn !== 'ai') return { game, error: '当前不是对方的回合' };
  if (!game.userCards.length) return { game, error: '玩家已无手牌' };

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const nextGame = JSON.parse(JSON.stringify(game));
  const userCount = nextGame.userCards.length;
  let targetIndex;

  if (typeof chosenIndex === 'number' && chosenIndex >= 0 && chosenIndex < userCount) {
    targetIndex = chosenIndex;
  } else if (nextGame.bluffCardIndex >= 0 && nextGame.bluffCardIndex < userCount && userCount > 1) {
    if (Math.random() < 0.6) {
      const remaining = [...Array(userCount).keys()].filter(i => i !== nextGame.bluffCardIndex);
      targetIndex = remaining[Math.floor(Math.random() * remaining.length)];
    } else {
      targetIndex = nextGame.bluffCardIndex;
    }
  } else {
    targetIndex = Math.floor(Math.random() * userCount);
  }

  nextGame.bluffCardIndex = -1;
  const drawnCard = nextGame.userCards.splice(targetIndex, 1)[0];

  let matchedCardIndex = -1;
  if (!drawnCard.isJoker) {
    matchedCardIndex = nextGame.aiCards.findIndex(c => !c.isJoker && c.rank === drawnCard.rank);
  }

  let matched = false;
  let matchedCard = null;

  if (matchedCardIndex !== -1) {
    matched = true;
    matchedCard = nextGame.aiCards.splice(matchedCardIndex, 1)[0];
    nextGame.discardPile.push([drawnCard, matchedCard]);
    nextGame.lastAction = {
      type: 'ai_draw_match',
      actor: 'ai',
      drawnCard,
      targetIndex,
      description: customNotice.trim() || `【${cName}】抽走了【${uName}】的一张牌，并与自己的手牌配对消除！`,
    };
  } else {
    nextGame.aiCards.push(drawnCard);
    nextGame.lastAction = {
      type: 'ai_draw_keep',
      actor: 'ai',
      drawnCard,
      targetIndex,
      description: customNotice.trim() || (drawnCard.isJoker
        ? `【${cName}】抽走了【${uName}】的鬼牌！`
        : `【${cName}】抽走了【${uName}】的一张手牌。`),
    };
  }

  nextGame.history.push({
    round: nextGame.round,
    actor: 'ai',
    text: nextGame.lastAction.description,
  });

  checkGameStatus(nextGame, { userName: uName, contactName: cName });

  if (nextGame.status === 'playing') {
    nextGame.turn = 'user';
    nextGame.round += 1;
  }

  return { game: nextGame, targetIndex, drawnCard, matched, matchedCard };
}

// 心理战操作：诱导微抽
export function setBluffCard(game, cardIndex) {
  if (game.status !== 'playing' || game.turn !== 'ai') return game;
  const nextGame = JSON.parse(JSON.stringify(game));
  nextGame.bluffCardIndex = nextGame.bluffCardIndex === cardIndex ? -1 : cardIndex;
  return nextGame;
}

// 微表情与心理状态
export function getAiMicroExpression(game) {
  if (!game || game.status !== 'playing') {
    if (game?.status === 'finished') {
      return game.winner === 'user'
        ? { text: '（愣愣地看着手里剩下的鬼牌，脸颊微红，又气又羞）' }
        : { text: '（得意地扬起下巴，露出胜券在握的微笑）' };
    }
    return { text: '' };
  }

  const aiHasJoker = game.aiCards.some(c => c.isJoker);
  const cardCount = game.aiCards.length;

  if (cardCount === 1) {
    return aiHasJoker
      ? { text: '（额头渗出细汗，把手里唯一的一张牌攥得死死的，眼神慌乱）' }
      : { text: '（胜券在握地微笑着，神色平静坦然）' };
  }

  if (aiHasJoker) {
    const expressions = [
      '（视线飘忽不定，嘴唇微微抿起，似乎在极力掩饰着什么）',
      '（故作镇定地轻咳了一声，眼神却下意识避开你指着的那张牌）',
      '（指尖微微泛白，神情闪过一丝不易察觉的紧张）',
      '（微微咬着下唇，手指在牌背上轻轻敲击着）',
    ];
    return { text: expressions[game.round % expressions.length] };
  }

  const calmExpressions = [
    '（泰然自若地看着你，好整以暇地等待你出手）',
    '（眼神清澈坦荡，嘴角带着淡淡的笑意）',
    '（微微挑眉，眼神中带着一丝挑战的意味）',
  ];
  return { text: calmExpressions[game.round % calmExpressions.length] };
}

// 格式化卡牌显示
export function cardDisplayName(card) {
  if (!card) return '';
  if (card.isJoker) return 'Joker 鬼牌';
  const suitSymbol = card.suit === 'S' ? '♠' : '♥';
  return `${suitSymbol} ${card.rank}`;
}

// 系统提示词宏定义（供角色端和生成端引用）
export const OLD_MAID_SYSTEM_PROMPT = `[小游戏功能规范：抽鬼牌]
- 规则说明：采用精简 17 张牌二人快对决（A到8各两张成对，加一张 Joker 鬼牌）。轮流抽取对方手牌，相同点数成对丢弃，最后手握鬼牌者败。
- 角色端主动发起：当你觉得剧情氛围合适，想和对方玩纸牌互动时，可在回复中主动发送小游戏邀请：
  {"type":"game","game":{"kind":"old_maid","action":"invite","wager":"具体的赌注或惩罚"}}
- 响应玩家邀请：当玩家发来抽鬼牌邀请时，你必须根据人设和当下的心情在正文中明确回复是否接受，并协商或确认赌注；
  若接受，在顶层附带 {"gameAction":"accept"}；若拒绝，附带 {"gameAction":"reject"}。
- 游戏中（纯对弈模式）：进入牌局后双方专心摸牌打牌。你的每次反应须围绕手牌变动、虚实试探、心虚掩饰或挑衅垃圾话展开短精描写，不进行无关日常闲聊。
- 终局结算：输家必须在后续对话中兑现赛前约定的赌注。`;
