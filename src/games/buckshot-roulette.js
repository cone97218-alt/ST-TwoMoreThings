// 恶魔轮盘（Buckshot Roulette）核心规则引擎与状态机
// 规则：生死对决，霰弹枪装填已知数量的实弹与空弹，顺序未知。
// 回合可选择射击对手或朝自己开枪（空弹则奖励额外回合），配合 5 种战术道具。

export const BUCKSHOT_ITEMS = {
  MAGNIFIER: 'magnifier',
  SAW: 'saw',
  BEER: 'beer',
  HANDCUFFS: 'handcuffs',
  CIGARETTE: 'cigarette',
};

export const ITEM_INFO = {
  [BUCKSHOT_ITEMS.MAGNIFIER]: {
    name: '放大镜',
    icon: 'magnifier',
    desc: '偷看当前膛内第一发子弹是实弹还是空弹（仅自身可见）。',
  },
  [BUCKSHOT_ITEMS.SAW]: {
    name: '手锯',
    icon: 'saw',
    desc: '锯短枪管，使下一发实弹的伤害提升至 2 点（打空失效）。',
  },
  [BUCKSHOT_ITEMS.BEER]: {
    name: '啤酒',
    icon: 'beer',
    desc: '退掉当前膛内的一发子弹，并向全场揭晓该子弹类型。',
  },
  [BUCKSHOT_ITEMS.HANDCUFFS]: {
    name: '手铐',
    icon: 'handcuffs',
    desc: '锁住对手，使其跳过下一个行动回合。',
  },
  [BUCKSHOT_ITEMS.CIGARETTE]: {
    name: '香烟',
    icon: 'cigarette',
    desc: '抽一根香烟，恢复自身 1 点生命值（无法超过生命上限）。',
  },
};

export const ALL_ITEM_KEYS = Object.values(BUCKSHOT_ITEMS);

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cleanParticipantName(name, fallback = '你') {
  if (!name || typeof name !== 'string') return fallback;
  const trimmed = name.trim();
  if (!trimmed || ['<user>', '{{user}}', '<char>', '{{char}}'].includes(trimmed.toLowerCase())) {
    return fallback;
  }
  return trimmed;
}

// 生成一轮弹药（返回实弹 true 和空弹 false 的打乱数组）
export function generateChamber(round = 1) {
  // 根据轮数递增弹药规模，保持紧张度
  let liveCount = 1;
  let blankCount = 1;

  if (round === 1) {
    // 3发 (1实2空 或 2实1空)
    if (Math.random() < 0.5) {
      liveCount = 1; blankCount = 2;
    } else {
      liveCount = 2; blankCount = 1;
    }
  } else if (round === 2) {
    // 4发 (2实2空)
    liveCount = 2; blankCount = 2;
  } else if (round === 3) {
    // 5发 (2实3空 或 3实2空)
    if (Math.random() < 0.5) {
      liveCount = 2; blankCount = 3;
    } else {
      liveCount = 3; blankCount = 2;
    }
  } else {
    // 6发 (3实3空 或 2实4空 或 4实2空)
    const rand = Math.random();
    if (rand < 0.4) {
      liveCount = 3; blankCount = 3;
    } else if (rand < 0.7) {
      liveCount = 2; blankCount = 4;
    } else {
      liveCount = 4; blankCount = 2;
    }
  }

  const bullets = [
    ...Array(liveCount).fill(true),
    ...Array(blankCount).fill(false),
  ];

  return {
    chamber: shuffle(bullets),
    liveCount,
    blankCount,
  };
}

// 随机分配道具（上限通常为 4 件）
export function drawRandomItems(currentItems = [], count = 2, maxLimit = 4) {
  const result = [...currentItems];
  for (let i = 0; i < count; i++) {
    if (result.length >= maxLimit) break;
    const randomItem = ALL_ITEM_KEYS[Math.floor(Math.random() * ALL_ITEM_KEYS.length)];
    result.push(randomItem);
  }
  return result;
}

// 创建对战邀请
export function createBuckshotInvitation({
  sender = 'user',
  wager = '',
  maxHp = 3,
  userName = '你',
  contactName = '对方',
} = {}) {
  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const cleanHp = Math.max(2, Math.min(6, Number(maxHp) || 3));

  return {
    id: `br_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: 'buckshot_roulette',
    title: '恶魔轮盘',
    sender,
    status: 'invited',
    wager: wager.trim() || '纯娱乐',
    maxHp: cleanHp,
    userHp: cleanHp,
    aiHp: cleanHp,
    round: 0,
    turn: 'user',
    winner: null,
    loser: null,
    chamber: [],
    initialLive: 0,
    initialBlank: 0,
    userKnownNext: null,
    aiKnownNext: null,
    sawedOff: false,
    handcuffed: null, // 被手铐限制跳过的角色
    userItems: [],
    aiItems: [],
    lastAction: {
      type: 'invite',
      actor: sender,
      description: sender === 'user'
        ? `【${uName}】发起了恶魔轮盘生死对决，赌注：${wager.trim() || '纯娱乐'}，等待【${cName}】响应。`
        : `【${cName}】发起了恶魔轮盘生死对决，赌注：${wager.trim() || '纯娱乐'}。`,
    },
    history: [],
  };
}

// 接受邀请，正式装弹开局
export function acceptBuckshotGame(inviteOrGame, {
  wager,
  starter = 'user',
  userName = '你',
  contactName = '对方',
  maxHp,
} = {}) {
  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const hp = Math.max(2, Math.min(6, Number(maxHp || inviteOrGame.maxHp) || 3));
  const { chamber, liveCount, blankCount } = generateChamber(1);

  // 双方初始各分配 2 件道具
  const userItems = drawRandomItems([], 2);
  const aiItems = drawRandomItems([], 2);

  const game = {
    ...inviteOrGame,
    status: 'playing',
    wager: (wager !== undefined ? wager : inviteOrGame.wager) || '纯娱乐',
    maxHp: hp,
    userHp: hp,
    aiHp: hp,
    round: 1,
    turn: starter,
    winner: null,
    loser: null,
    chamber,
    initialLive: liveCount,
    initialBlank: blankCount,
    userKnownNext: null,
    aiKnownNext: null,
    sawedOff: false,
    handcuffed: null,
    userItems,
    aiItems,
    rounds: [
      {
        roundNumber: 1,
        status: 'ongoing',
        initialLive: liveCount,
        initialBlank: blankCount,
        firedLive: 0,
        firedBlank: 0,
        itemsDistributed: { user: [...userItems], ai: [...aiItems] },
        itemsUsed: [],
        actions: [
          { summary: `装填 ${liveCount + blankCount} 发弹药（${liveCount} 实弹，${blankCount} 空弹）。双方各获 2 件道具。` },
        ],
      },
    ],
    lastAction: {
      type: 'start',
      actor: starter,
      description: `【恶魔轮盘 · 第 1 轮】生死对决开始！装填 ${liveCount + blankCount} 发弹药（${liveCount} 实弹，${blankCount} 空弹），双方各获 2 件战术道具。当前轮到【${starter === 'user' ? uName : cName}】行动。`,
    },
    history: [
      {
        round: 1,
        actor: 'system',
        text: `装填 ${liveCount + blankCount} 发弹药（${liveCount} 实弹，${blankCount} 空弹）。轮到【${starter === 'user' ? uName : cName}】行动。`,
      },
    ],
  };

  return game;
}

// 拒绝邀请
export function rejectBuckshotGame(inviteOrGame, { reason = '', contactName = '对方' } = {}) {
  const cName = cleanParticipantName(contactName, '对方');
  return {
    ...inviteOrGame,
    status: 'rejected',
    lastAction: {
      type: 'reject',
      description: reason || `【${cName}】婉拒了本次对决邀请。`,
    },
  };
}

// 直接创建一局已开局的游戏
export function createBuckshotGame({
  wager = '',
  starter = 'user',
  userName = '你',
  contactName = '对方',
  maxHp = 3,
} = {}) {
  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const invite = createBuckshotInvitation({ sender: starter, wager, maxHp, userName: uName, contactName: cName });
  return acceptBuckshotGame(invite, { starter, userName: uName, contactName: cName, maxHp });
}

// 检查胜负与终局判定
export function checkGameStatus(game, { userName = '你', contactName = '对方' } = {}) {
  if (game.status !== 'playing') return game;

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');

  if (game.userHp <= 0 && game.aiHp > 0) {
    game.status = 'finished';
    game.winner = 'ai';
    game.loser = 'user';
    ensureBuckshotRounds(game);
    const lastR = game.rounds?.at(-1);
    if (lastR) lastR.status = 'completed';
    game.lastAction = {
      type: 'game_over',
      actor: 'ai',
      description: `【${uName}】生命耗尽倒下！【${cName}】赢得了这场恶魔轮盘赌！`,
    };
    return game;
  }

  if (game.aiHp <= 0 && game.userHp > 0) {
    game.status = 'finished';
    game.winner = 'user';
    game.loser = 'ai';
    ensureBuckshotRounds(game);
    const lastR = game.rounds?.at(-1);
    if (lastR) lastR.status = 'completed';
    game.lastAction = {
      type: 'game_over',
      actor: 'user',
      description: `【${cName}】生命耗尽倒下！【${uName}】赢得了这场恶魔轮盘赌！`,
    };
    return game;
  }

  if (game.userHp <= 0 && game.aiHp <= 0) {
    game.status = 'finished';
    game.winner = null;
    game.loser = null;
    ensureBuckshotRounds(game);
    const lastR = game.rounds?.at(-1);
    if (lastR) lastR.status = 'completed';
    game.lastAction = {
      type: 'game_over',
      actor: 'system',
      description: `双方同时倒下，此局为平手！`,
    };
    return game;
  }

  return game;
}

// 弹仓打空时自动换弹并补发道具
export function reloadChamberIfNeeded(game, { userName = '你', contactName = '对方' } = {}) {
  if (game.status !== 'playing') return game;
  if (game.chamber.length > 0) return game;

  const nextGame = JSON.parse(JSON.stringify(game));
  ensureBuckshotRounds(nextGame);
  const prevRound = nextGame.rounds.find(r => r.roundNumber === nextGame.round);
  if (prevRound) prevRound.status = 'completed';

  nextGame.round += 1;
  const { chamber, liveCount, blankCount } = generateChamber(nextGame.round);

  nextGame.chamber = chamber;
  nextGame.initialLive = liveCount;
  nextGame.initialBlank = blankCount;
  nextGame.userKnownNext = null;
  nextGame.aiKnownNext = null;
  nextGame.sawedOff = false;

  const prevUserItemsCount = (nextGame.userItems || []).length;
  const prevAiItemsCount = (nextGame.aiItems || []).length;
  nextGame.userItems = drawRandomItems(nextGame.userItems, 2, 4);
  nextGame.aiItems = drawRandomItems(nextGame.aiItems, 2, 4);
  const userDealt = nextGame.userItems.slice(prevUserItemsCount);
  const aiDealt = nextGame.aiItems.slice(prevAiItemsCount);

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const actorName = nextGame.turn === 'user' ? uName : cName;
  const reloadMsg = `【恶魔轮盘 · 第 ${nextGame.round} 轮】弹药耗尽，重新装填 ${liveCount + blankCount} 发弹药（${liveCount} 实弹，${blankCount} 空弹）！双方补发战术道具。当前轮到【${actorName}】行动。`;

  nextGame.reloadedNotice = reloadMsg;
  nextGame.history.push({
    round: nextGame.round,
    actor: 'system',
    text: reloadMsg,
  });

  nextGame.rounds.push({
    roundNumber: nextGame.round,
    status: 'ongoing',
    initialLive: liveCount,
    initialBlank: blankCount,
    firedLive: 0,
    firedBlank: 0,
    itemsDistributed: { user: userDealt, ai: aiDealt },
    itemsUsed: [],
    actions: [
      { summary: reloadMsg },
    ],
  });

  return nextGame;
}

// 玩家或 AI 扣动扳机射向对方
export function shootOpponent(game, {
  actor = 'user',
  userName = '你',
  contactName = '对方',
  customNotice = '',
} = {}) {
  if (game.status !== 'playing') return { game, error: '游戏未在进行中' };
  if (game.turn !== actor) return { game, error: `当前不是${actor === 'user' ? '你' : '对方'}的回合` };
  if (!game.chamber.length) return { game, error: '弹仓已无子弹' };

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const nextGame = JSON.parse(JSON.stringify(game));

  const isLive = nextGame.chamber.shift(); // 射出第一发
  const damage = nextGame.sawedOff && isLive ? 2 : (isLive ? 1 : 0);
  const wasSawed = nextGame.sawedOff;
  nextGame.sawedOff = false; // 切管状态击发后重置
  nextGame.userKnownNext = null;
  nextGame.aiKnownNext = null;

  const shooterName = actor === 'user' ? uName : cName;
  const targetName = actor === 'user' ? cName : uName;

  let sysResult = '';
  if (isLive) {
    if (actor === 'user') {
      nextGame.aiHp = Math.max(0, nextGame.aiHp - damage);
    } else {
      nextGame.userHp = Math.max(0, nextGame.userHp - damage);
    }
    const finalHp = actor === 'user' ? nextGame.aiHp : nextGame.userHp;
    sysResult = `轰！是实弹！造成 ${damage} 点致命伤害！【${targetName}】生命值降至 ${finalHp}/${nextGame.maxHp}。`;
  } else {
    sysResult = `咔哒！是空弹！虚惊一场，未造成伤害，回合移交。`;
  }

  const trimmedNotice = (customNotice || '').trim();
  const desc = trimmedNotice
    ? `${trimmedNotice}——${sysResult}`
    : `【${shooterName}】将枪口对准【${targetName}】扣动扳机……${sysResult}`;

  nextGame.lastAction = {
    type: 'shoot_opponent',
    actor,
    isLive,
    damage,
    wasSawed,
    description: desc,
  };

  ensureBuckshotRounds(nextGame);
  const curRound = nextGame.rounds.find(r => r.roundNumber === nextGame.round) || nextGame.rounds.at(-1);
  if (curRound) {
    if (isLive) curRound.firedLive = (curRound.firedLive || 0) + 1;
    else curRound.firedBlank = (curRound.firedBlank || 0) + 1;
    curRound.actions.push({
      actor,
      action: 'shoot_opponent',
      isLive,
      damage,
      summary: desc,
    });
  }

  nextGame.history.push({
    round: nextGame.round,
    actor,
    text: desc,
  });

  // 检查胜负
  checkGameStatus(nextGame, { userName: uName, contactName: cName });

  if (nextGame.status === 'playing') {
    // 检查是否有手铐效果
    const opponent = actor === 'user' ? 'ai' : 'user';
    if (nextGame.handcuffed === opponent) {
      // 对方被手铐铐住，跳过其回合，手铐解除，继续是当前射击者的回合
      nextGame.handcuffed = null;
      nextGame.history.push({
        round: nextGame.round,
        actor: 'system',
        text: `【${targetName}】被手铐锁住，跳过此回合！手铐已解除。`,
      });
      // 依然维持当前 actor 的回合
    } else {
      // 正常切换回合
      nextGame.turn = opponent;
    }

    // 检查弹仓是否打空需要换弹
    const reloaded = reloadChamberIfNeeded(nextGame, { userName: uName, contactName: cName });
    return { game: reloaded, isLive, damage };
  }

  return { game: nextGame, isLive, damage };
}

// 玩家或 AI 扣动扳机射向自己（核心博弈：空弹保留回合）
export function shootSelf(game, {
  actor = 'user',
  userName = '你',
  contactName = '对方',
  customNotice = '',
} = {}) {
  if (game.status !== 'playing') return { game, error: '游戏未在进行中' };
  if (game.turn !== actor) return { game, error: `当前不是${actor === 'user' ? '你' : '对方'}的回合` };
  if (!game.chamber.length) return { game, error: '弹仓已无子弹' };

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const nextGame = JSON.parse(JSON.stringify(game));

  const isLive = nextGame.chamber.shift();
  const damage = nextGame.sawedOff && isLive ? 2 : (isLive ? 1 : 0);
  const wasSawed = nextGame.sawedOff;
  nextGame.sawedOff = false;
  nextGame.userKnownNext = null;
  nextGame.aiKnownNext = null;

  const shooterName = actor === 'user' ? uName : cName;
  const opponent = actor === 'user' ? 'ai' : 'user';
  const targetName = actor === 'user' ? cName : uName;

  let sysResult = '';
  if (isLive) {
    if (actor === 'user') {
      nextGame.userHp = Math.max(0, nextGame.userHp - damage);
    } else {
      nextGame.aiHp = Math.max(0, nextGame.aiHp - damage);
    }
    const finalHp = actor === 'user' ? nextGame.userHp : nextGame.aiHp;
    sysResult = `砰！竟是实弹！自身受到 ${damage} 点伤害！剩余生命值：${finalHp}/${nextGame.maxHp}，回合移交。`;
  } else {
    sysResult = `咔哒！是空弹！赌赢了，获得额外行动机会！仍由【${shooterName}】继续出招。`;
  }

  const trimmedNotice = (customNotice || '').trim();
  const desc = trimmedNotice
    ? `${trimmedNotice}——${sysResult}`
    : `【${shooterName}】将枪口对准自己扣动扳机……${sysResult}`;

  nextGame.lastAction = {
    type: 'shoot_self',
    actor,
    isLive,
    damage,
    wasSawed,
    extraTurn: !isLive,
    description: desc,
  };

  ensureBuckshotRounds(nextGame);
  const curRound = nextGame.rounds.find(r => r.roundNumber === nextGame.round) || nextGame.rounds.at(-1);
  if (curRound) {
    if (isLive) curRound.firedLive = (curRound.firedLive || 0) + 1;
    else curRound.firedBlank = (curRound.firedBlank || 0) + 1;
    curRound.actions.push({
      actor,
      action: 'shoot_self',
      isLive,
      damage,
      extraTurn: !isLive,
      summary: desc,
    });
  }

  nextGame.history.push({
    round: nextGame.round,
    actor,
    text: desc,
  });

  checkGameStatus(nextGame, { userName: uName, contactName: cName });

  if (nextGame.status === 'playing') {
    if (isLive) {
      // 实弹：伤害自己并转交回合给对手（同时处理手铐）
      if (nextGame.handcuffed === opponent) {
        nextGame.handcuffed = null;
        nextGame.history.push({
          round: nextGame.round,
          actor: 'system',
          text: `【${targetName}】被手铐锁住，跳过此回合！手铐已解除。`,
        });
        // 维持当前 actor 回合
      } else {
        nextGame.turn = opponent;
      }
    } else {
      // 空弹：自己保留回合！继续行动
      nextGame.turn = actor;
    }

    const reloaded = reloadChamberIfNeeded(nextGame, { userName: uName, contactName: cName });
    return { game: reloaded, isLive, damage, extraTurn: !isLive };
  }

  return { game: nextGame, isLive, damage, extraTurn: !isLive };
}

// 使用道具
export function useItem(game, {
  actor = 'user',
  itemKey,
  userName = '你',
  contactName = '对方',
  customNotice = '',
} = {}) {
  if (game.status !== 'playing') return { game, error: '游戏未在进行中' };
  if (game.turn !== actor) return { game, error: `当前不是${actor === 'user' ? '你' : '对方'}的回合` };
  if (!ALL_ITEM_KEYS.includes(itemKey)) return { game, error: '未知道具' };

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const userRole = actor === 'user';
  const itemList = userRole ? game.userItems : game.aiItems;
  const itemIndex = itemList.indexOf(itemKey);

  if (itemIndex === -1) {
    return { game, error: `未持有道具：${ITEM_INFO[itemKey]?.name || itemKey}` };
  }

  const nextGame = JSON.parse(JSON.stringify(game));
  const currentItems = userRole ? nextGame.userItems : nextGame.aiItems;
  currentItems.splice(itemIndex, 1); // 消耗道具

  const shooterName = userRole ? uName : cName;
  const targetName = userRole ? cName : uName;
  const opponent = userRole ? 'ai' : 'user';
  const itemName = ITEM_INFO[itemKey]?.name || itemKey;

  let desc = '';
  let effectDetail = {};

  switch (itemKey) {
    case BUCKSHOT_ITEMS.MAGNIFIER: {
      const nextBullet = nextGame.chamber[0];
      const isLive = Boolean(nextBullet);
      if (userRole) {
        nextGame.userKnownNext = isLive;
      } else {
        nextGame.aiKnownNext = isLive;
      }
      effectDetail = { isLive };
      const trimmedNotice = (customNotice || '').trim();
      const sysResult = `窥视了膛内第一发子弹的情况（仅自身可见）。`;
      desc = trimmedNotice
        ? `${trimmedNotice}——【系统】${sysResult}`
        : `【${shooterName}】使用了【放大镜】，悄悄窥视了膛内第一发子弹。`;
      break;
    }

    case BUCKSHOT_ITEMS.SAW: {
      nextGame.sawedOff = true;
      effectDetail = { sawedOff: true };
      const trimmedNotice = (customNotice || '').trim();
      const sysResult = `枪管已被切短，下一发实弹将造成 2 点致命伤害！`;
      desc = trimmedNotice
        ? `${trimmedNotice}——【系统】${sysResult}`
        : `【${shooterName}】使用了【手锯】，将霰弹枪枪管切短！下一发实弹将造成 2 点致命伤害！`;
      break;
    }

    case BUCKSHOT_ITEMS.BEER: {
      if (!nextGame.chamber.length) {
        desc = `【${shooterName}】喝下一听【啤酒】，但弹仓已空。`;
        break;
      }
      const discardedBullet = nextGame.chamber.shift();
      const isLive = Boolean(discardedBullet);
      nextGame.userKnownNext = null;
      nextGame.aiKnownNext = null;
      effectDetail = { discardedBullet: isLive };
      const trimmedNotice = (customNotice || '').trim();
      const sysResult = `退弹生效！退出来的是一发【${isLive ? '实弹' : '空弹'}】！弹仓剩余 ${nextGame.chamber.length} 发。`;
      desc = trimmedNotice
        ? `${trimmedNotice}——【系统】${sysResult}`
        : `【${shooterName}】拉开一听【啤酒】大口饮下，随手退掉了膛内子弹——${sysResult}`;
      break;
    }

    case BUCKSHOT_ITEMS.HANDCUFFS: {
      if (nextGame.handcuffed === opponent) {
        desc = `【${shooterName}】试图使用【手铐】，但【${targetName}】已经被拷住了！`;
      } else {
        nextGame.handcuffed = opponent;
        effectDetail = { handcuffed: opponent };
        const trimmedNotice = (customNotice || '').trim();
        const sysResult = `手铐锁定成功！【${targetName}】将跳过下一个回合！`;
        desc = trimmedNotice
          ? `${trimmedNotice}——【系统】${sysResult}`
          : `【${shooterName}】甩出【手铐】，咔哒一声拷住了【${targetName}】！【${targetName}】将跳过下一个回合！`;
      }
      break;
    }

    case BUCKSHOT_ITEMS.CIGARETTE: {
      const currentHp = userRole ? nextGame.userHp : nextGame.aiHp;
      let healed = false;
      let finalHp = currentHp;
      if (currentHp < nextGame.maxHp) {
        if (userRole) nextGame.userHp += 1;
        else nextGame.aiHp += 1;
        healed = true;
        finalHp = userRole ? nextGame.userHp : nextGame.aiHp;
      }
      effectDetail = { healed };
      const trimmedNotice = (customNotice || '').trim();
      const sysResult = healed
        ? `香烟舒缓神经，恢复 1 点生命值！当前生命值：${finalHp}/${nextGame.maxHp}。`
        : `香烟已吸尽，但生命值已达上限（${finalHp}/${nextGame.maxHp}），未恢复生命。`;
      desc = trimmedNotice
        ? `${trimmedNotice}——【系统】${sysResult}`
        : (healed
          ? `【${shooterName}】点燃了一根【香烟】深吸一口，舒缓了紧绷的神经，恢复了 1 点生命值（当前：${finalHp}/${nextGame.maxHp}）。`
          : `【${shooterName}】点燃了一根【香烟】，但在充盈的体魄下仅作放松消遣（生命值已满：${finalHp}/${nextGame.maxHp}）。`);
      break;
    }

    default:
      desc = `【${shooterName}】使用了【${itemName}】。`;
  }

  nextGame.lastAction = {
    type: 'use_item',
    actor,
    itemKey,
    effectDetail,
    description: desc,
  };

  ensureBuckshotRounds(nextGame);
  const curRound = nextGame.rounds.find(r => r.roundNumber === nextGame.round) || nextGame.rounds.at(-1);
  if (curRound) {
    if (!Array.isArray(curRound.itemsUsed)) curRound.itemsUsed = [];
    curRound.itemsUsed.push({ actor, item: itemKey });
    if (itemKey === BUCKSHOT_ITEMS.BEER && effectDetail.discardedBullet !== undefined) {
      if (effectDetail.discardedBullet) curRound.firedLive = (curRound.firedLive || 0) + 1;
      else curRound.firedBlank = (curRound.firedBlank || 0) + 1;
    }
    curRound.actions.push({
      actor,
      action: 'use_item',
      item: itemKey,
      summary: desc,
    });
  }

  nextGame.history.push({
    round: nextGame.round,
    actor,
    text: desc,
  });

  // 如果啤酒喝空了弹仓，自动检查换弹
  const reloaded = reloadChamberIfNeeded(nextGame, { userName: uName, contactName: cName });
  return { game: reloaded, effectDetail };
}

// AI 启发式决策算法（计算最优/心理博弈行为）
export function getAiBuckshotDecision(game) {
  if (!game || game.status !== 'playing' || game.turn !== 'ai') return null;

  const aiHp = game.aiHp;
  const userHp = game.userHp;
  const maxHp = game.maxHp;
  const chamber = game.chamber;
  const total = chamber.length;
  if (!total) return null;

  const liveCount = chamber.filter(Boolean).length;
  const blankCount = total - liveCount;
  const liveProbability = liveCount / total;
  const aiItems = game.aiItems || [];
  const knownNext = game.aiKnownNext; // true(实弹), false(空弹), null(未知)

  // 1. 若生命未满且持有香烟，优先抽烟回血
  if (aiHp < maxHp && aiItems.includes(BUCKSHOT_ITEMS.CIGARETTE)) {
    return { action: 'use_item', item: BUCKSHOT_ITEMS.CIGARETTE };
  }

  // 2. 若未知下一发且持有放大镜，高优先级偷看
  if (knownNext === null && aiItems.includes(BUCKSHOT_ITEMS.MAGNIFIER)) {
    return { action: 'use_item', item: BUCKSHOT_ITEMS.MAGNIFIER };
  }

  // 3. 若已知下一发子弹
  if (knownNext === true) {
    // 下发是实弹！
    // 如果还没切短枪管且有手锯 -> 切短造成 2 点致命伤害！
    if (!game.sawedOff && aiItems.includes(BUCKSHOT_ITEMS.SAW)) {
      return { action: 'use_item', item: BUCKSHOT_ITEMS.SAW };
    }
    // 如果对方没被铐且持有手铐且对方有至少2血 -> 考虑铐住对方连续暴击
    if (game.handcuffed !== 'user' && userHp > 1 && aiItems.includes(BUCKSHOT_ITEMS.HANDCUFFS)) {
      return { action: 'use_item', item: BUCKSHOT_ITEMS.HANDCUFFS };
    }
    // 必定开枪射击玩家！
    return { action: 'shoot_opponent' };
  }

  if (knownNext === false) {
    // 下发是空弹！
    // 毫不犹豫朝自己开枪（必定无伤且白嫖一个回合！）
    return { action: 'shoot_self' };
  }

  // 4. 未知下一发的情况（基于实弹概率 P(live) 决策）
  // 4.1 全是实弹 (P = 1)
  if (liveProbability === 1) {
    if (!game.sawedOff && aiItems.includes(BUCKSHOT_ITEMS.SAW)) {
      return { action: 'use_item', item: BUCKSHOT_ITEMS.SAW };
    }
    return { action: 'shoot_opponent' };
  }

  // 4.2 全是空弹 (P = 0)
  if (liveProbability === 0) {
    return { action: 'shoot_self' };
  }

  // 4.3 实弹概率极高 (>= 0.6)
  if (liveProbability >= 0.6) {
    // 射击玩家
    return { action: 'shoot_opponent' };
  }

  // 4.4 空弹概率极高 (P(blank) >= 0.67，即 P(live) <= 0.33)
  if (liveProbability <= 0.34) {
    // 很有可能搏到额外回合，朝自己开枪
    return { action: 'shoot_self' };
  }

  // 4.5 均势 50/50 情况
  // 如果持有啤酒且想改变局势
  if (aiItems.includes(BUCKSHOT_ITEMS.BEER) && Math.random() < 0.4) {
    return { action: 'use_item', item: BUCKSHOT_ITEMS.BEER };
  }

  // 默认倾向于射击对手，偶尔根据残血程度冒险
  if (aiHp === 1) {
    // 残血保命，不敢轻易朝自己开枪，射击对方
    return { action: 'shoot_opponent' };
  }

  return Math.random() < 0.6 ? { action: 'shoot_opponent' } : { action: 'shoot_self' };
}

// 确保战局轮次记录结构完整
export function ensureBuckshotRounds(game) {
  if (!game) return game;
  if (!Array.isArray(game.rounds)) {
    game.rounds = [];
  }
  if (game.rounds.length === 0 && game.round > 0) {
    game.rounds.push({
      roundNumber: game.round,
      status: game.status === 'finished' ? 'completed' : 'ongoing',
      initialLive: game.initialLive || 0,
      initialBlank: game.initialBlank || 0,
      firedLive: 0,
      firedBlank: 0,
      itemsDistributed: { user: [...(game.userItems || [])], ai: [...(game.aiItems || [])] },
      itemsUsed: [],
      actions: (game.history || []).map(h => ({
        summary: typeof h === 'string' ? h : (h.text || ''),
      })),
    });
  }
  return game;
}

// 格式化输出恶魔轮盘战局全景档案（纯客观记录，帮助 AI 严格区分历史局与当前局）
export function formatBuckshotChronicle(game, { userName = '你', contactName = '对方' } = {}) {
  if (!game) return '';
  ensureBuckshotRounds(game);

  const uName = cleanParticipantName(userName, '你');
  const cName = cleanParticipantName(contactName, '对方');
  const currentRoundNum = game.round || 1;
  const currentRound = game.rounds?.find(r => r.roundNumber === currentRoundNum) || game.rounds?.at(-1) || {
    roundNumber: currentRoundNum,
    initialLive: game.initialLive || 0,
    initialBlank: game.initialBlank || 0,
    firedLive: 0,
    firedBlank: 0,
    actions: [],
  };

  const chamber = game.chamber || [];
  const { live: chamberLive, blank: chamberBlank } = getChamberCounts(chamber);

  const formatItemList = items => {
    if (!items || items.length === 0) return '无道具';
    return items.map(k => (ITEM_INFO[k]?.name || k)).join('、');
  };

  const lines = [
    `【恶魔轮盘 · 战局客观档案（请严格依据实时数据推进，不同轮次严禁混淆）】`,
    `● 战况概览：`,
    `  - 双方赌注：【${game.wager || '纯娱乐'}】`,
    `  - 实时血量：【${uName}】${game.userHp}/${game.maxHp} HP | 【${cName}】${game.aiHp}/${game.maxHp} HP`,
    `  - 当前行动权：【${game.turn === 'user' ? uName : cName}】`,
    `  - 枪管状态：${game.sawedOff ? '手锯已锯短（下次实弹造成 2 点致命伤害！）' : '枪管正常（1点伤害）'}`,
    `  - 手铐限制：${game.handcuffed ? `【${game.handcuffed === 'user' ? uName : cName}】被手铐锁住，本轮将跳过` : '无人被锁'}`,
    `● 当前第 ${currentRound.roundNumber} 轮实时态势（仅当前轮次生效）：`,
    `  - 本轮初始装填：${currentRound.initialLive} 实弹，${currentRound.initialBlank} 空弹（共 ${currentRound.initialLive + currentRound.initialBlank} 发）`,
    `  - 本轮已射出/退出：${currentRound.firedLive || 0} 实弹，${currentRound.firedBlank || 0} 空弹`,
    `  - 弹仓当前绝对剩余：${chamber.length} 发（内含 ${chamberLive} 实弹、${chamberBlank} 空弹，未知入膛顺序）`,
    `  - 双方当前剩余可用道具：`,
    `    * 【${uName}】：${formatItemList(game.userItems)}`,
    `    * 【${cName}】：${formatItemList(game.aiItems)}`,
  ];

  if (game.rounds && game.rounds.length > 0) {
    lines.push(`● 轮次演进纪要（明确区分各局，绝不能将已结束轮次的弹药算入当前局）：`);
    for (const r of game.rounds) {
      const isCur = r.roundNumber === currentRound.roundNumber;
      const statusLabel = isCur ? '进行中' : '已完结';
      const recentActions = (r.actions || []).slice(-4).map(a => `    * ${a.summary}`).join('\n');
      lines.push(`  [第 ${r.roundNumber} 轮 · ${statusLabel}] 初始: ${r.initialLive}实${r.initialBlank}空 | 打出: ${r.firedLive || 0}实${r.firedBlank || 0}空`);
      if (recentActions) {
        lines.push(recentActions);
      }
    }
  }

  return lines.join('\n');
}

// 统计当前弹仓中实弹与空弹的已知数量（供界面与角色提示词呈现）
export function getChamberCounts(chamber = []) {
  const live = chamber.filter(Boolean).length;
  const blank = chamber.length - live;
  return { live, blank, total: chamber.length };
}

// 系统提示词宏定义（供角色端和生成端引用）
export const BUCKSHOT_SYSTEM_PROMPT = `[小游戏功能规范：恶魔轮盘 (Buckshot Roulette)]
- 规则说明: 
  * 霰弹枪装填已知总数及成分配比的实弹与空弹（序列打乱未知）。双方初始各有生命充能点（默认 3 点），生命归零者落败。
  * 回合行动:
    1. 射击对方: 若为实弹则造成伤害并换回合；若为空弹则无伤并换回合。
    2. 朝自己开枪: 若为空弹则无伤且【额外获得一次行动机会（仍是自己回合继续行动）】；若为实弹则自身受到伤害并交出回合。
    3. 战术道具: 放大镜(偷看膛内第一发)、手锯(下一发实弹伤害提升至2)、啤酒(退掉第一发并全场揭晓实空)、手铐(锁住对手跳过其一回合)、香烟(恢复1点生命)。
- 角色端主动发起: 
  * 当觉得时机合适想找对方玩这场生死博弈时，可在 messages 中发送邀约卡: {"type":"game","game":{"kind":"buckshot_roulette","action":"invite","wager":"具体的赌注或惩罚"}}，并配以挑衅或邀约台词。
- 响应邀请与协商赌注: 
  * 当收到对战邀请时，须在消息正文中表态是否接受；并在顶层返回 {"gameAction":"accept","wager":"确认的赌注"} 或 {"gameAction":"reject","reason":"拒绝理由"}。若想更换赌注，可在正文提出并在顶层返回 {"gameAction":"counter","wager":"新赌注"}。
  * 对弈进行中若想变更赌注，可在顶层 gameAction 中带上 wager 字段。
- 边玩边聊与双轨表现规范（角色私聊反应 + 系统裁决播报）:
  * 1. 角色私聊反应（messages[].text）:
    - 必须严格遵循手机私聊规范，为纯台词对话，严禁在消息文本中使用括号动作、心理神态或场景小说式旁白（严禁写“（双手颤抖地将枪口抵住下巴）”）。
    - 针对上一轮的对局变化（如自己或对方挨了一记实弹扣血、对方赌自己空弹成功继续扣扳机、双方血量差距等），角色必须在私聊台词中作出鲜活真实的情绪反应（挑衅、恐慌、痛哼咬牙、得意嘲弄或心理施压）。
  * 2. 角色动作与系统播报（顶层 gameAction）:
    - 轮到你的回合行动时，在 JSON 顶层返回结构化动作指令。
    - notice 字段: 由你撰写以第三人称生动描摹角色扣动扳机或使用道具的动作与神态，必须使用双方具体姓名（如【角色名】眼神一凛，果断将黑洞洞的枪口对准了【玩家名】……）。
    - 系统裁决播报: 系统规则引擎会自动在你的动作描摹后拼接实弹/空弹裁决、伤害计算、双方剩余生命值或道具具体生效通知，作为不可篡改的系统消息播报在对话流中。
    - 动作指令格式:
      * 射击对方: {"gameAction": {"action": "shoot_opponent", "notice": "【角色名】眼神一凛，果断将黑洞洞的枪口对准了【玩家名】……"}}
      * 朝自己开枪: {"gameAction": {"action": "shoot_self", "notice": "【角色名】深吸一口气，咬牙把枪口抵向了自己……"}}
      * 使用道具: {"gameAction": {"action": "use_item", "item": "magnifier"|"saw"|"beer"|"handcuffs"|"cigarette", "notice": "【角色名】掏出……"}}
  * 3. 严禁代打与擅自判定:
    - 严禁在对话正文中擅自宣判射击是实弹还是空弹、扣了多少血或擅自宣告终局胜负，所有判定均以底层系统播报为准。终局后输家须在后续对话中履行约定的赌注。`;
