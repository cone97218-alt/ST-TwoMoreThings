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
    lastAction: {
      type: 'start',
      actor: starter,
      description: `对决开始！装填 ${liveCount + blankCount} 发弹药（${liveCount} 实弹，${blankCount} 空弹）。双方各获 2 件道具。轮到【${starter === 'user' ? uName : cName}】行动。`,
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
  nextGame.round += 1;
  const { chamber, liveCount, blankCount } = generateChamber(nextGame.round);

  nextGame.chamber = chamber;
  nextGame.initialLive = liveCount;
  nextGame.initialBlank = blankCount;
  nextGame.userKnownNext = null;
  nextGame.aiKnownNext = null;
  nextGame.sawedOff = false;

  // 双方补充道具（各补 1~2 件，上限 4 件）
  nextGame.userItems = drawRandomItems(nextGame.userItems, 2, 4);
  nextGame.aiItems = drawRandomItems(nextGame.aiItems, 2, 4);

  const reloadMsg = `弹仓打空，重新装填！装入 ${liveCount + blankCount} 发弹药（${liveCount} 实弹，${blankCount} 空弹），双方补发道具。`;
  nextGame.history.push({
    round: nextGame.round,
    actor: 'system',
    text: reloadMsg,
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

  let desc = '';
  if (isLive) {
    if (actor === 'user') {
      nextGame.aiHp = Math.max(0, nextGame.aiHp - damage);
    } else {
      nextGame.userHp = Math.max(0, nextGame.userHp - damage);
    }
    desc = customNotice.trim() || `【${shooterName}】将枪口对准【${targetName}】扣动扳机……轰！是实弹！造成 ${damage} 点伤害！`;
  } else {
    desc = customNotice.trim() || `【${shooterName}】将枪口对准【${targetName}】扣动扳机……咔哒！是空弹！虚惊一场。`;
  }

  nextGame.lastAction = {
    type: 'shoot_opponent',
    actor,
    isLive,
    damage,
    wasSawed,
    description: desc,
  };

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

  let desc = '';
  if (isLive) {
    if (actor === 'user') {
      nextGame.userHp = Math.max(0, nextGame.userHp - damage);
    } else {
      nextGame.aiHp = Math.max(0, nextGame.aiHp - damage);
    }
    desc = customNotice.trim() || `【${shooterName}】咬牙朝自己开枪……砰！竟是实弹！自身受到 ${damage} 点伤害！`;
  } else {
    desc = customNotice.trim() || `【${shooterName}】心跳加速朝自己扣动扳机……咔哒！是空弹！赌赢了，获得额外行动机会！`;
  }

  nextGame.lastAction = {
    type: 'shoot_self',
    actor,
    isLive,
    damage,
    wasSawed,
    extraTurn: !isLive,
    description: desc,
  };

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
      // 系统公告仅说明使用了放大镜，保持窥探私密性
      desc = customNotice.trim() || `【${shooterName}】使用了【放大镜】，悄悄窥视了膛内第一发子弹。`;
      break;
    }

    case BUCKSHOT_ITEMS.SAW: {
      nextGame.sawedOff = true;
      effectDetail = { sawedOff: true };
      desc = customNotice.trim() || `【${shooterName}】使用了【手锯】，将霰弹枪枪管切短！下一发实弹将造成 2 点致命伤害！`;
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
      desc = customNotice.trim() || `【${shooterName}】拉开一听【啤酒】大口饮下，随手退掉了膛内子弹——铛！退出来的是一发【${isLive ? '实弹' : '空弹'}】！`;
      break;
    }

    case BUCKSHOT_ITEMS.HANDCUFFS: {
      if (nextGame.handcuffed === opponent) {
        desc = `【${shooterName}】试图使用【手铐】，但【${targetName}】已经被拷住了！`;
      } else {
        nextGame.handcuffed = opponent;
        effectDetail = { handcuffed: opponent };
        desc = customNotice.trim() || `【${shooterName}】甩出【手铐】，咔哒一声拷住了【${targetName}】！【${targetName}】将跳过下一个回合！`;
      }
      break;
    }

    case BUCKSHOT_ITEMS.CIGARETTE: {
      const currentHp = userRole ? nextGame.userHp : nextGame.aiHp;
      if (currentHp < nextGame.maxHp) {
        if (userRole) nextGame.userHp += 1;
        else nextGame.aiHp += 1;
        effectDetail = { healed: true };
        desc = customNotice.trim() || `【${shooterName}】点燃了一根【香烟】深吸一口，舒缓了紧绷的神经，恢复了 1 点生命值。`;
      } else {
        effectDetail = { healed: false };
        desc = customNotice.trim() || `【${shooterName}】点燃了一根【香烟】，但在充盈的体魄下仅作放松消遣（生命值已满）。`;
      }
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

// 统计当前弹仓中实弹与空弹的已知数量（供界面与角色提示词呈现）
export function getChamberCounts(chamber = []) {
  const live = chamber.filter(Boolean).length;
  const blank = chamber.length - live;
  return { live, blank, total: chamber.length };
}

// 系统提示词宏定义（供角色端和生成端引用）
export const BUCKSHOT_SYSTEM_PROMPT = `[小游戏功能规范：恶魔轮盘 (Buckshot Roulette)]
- 规则说明: 
  * 霰弹枪装填确定数量的实弹与空弹（顺序未知）。双方各有生命充能点（默认 3 点），生命归零者落败。
  * 回合行动:
    1. 射击对方: 若为实弹则造成伤害并换回合；若为空弹则无伤并换回合。
    2. 朝自己开枪: 若为空弹则无伤且【额外获得一次行动机会（仍是自己回合）】；若为实弹则自身受到伤害并交出回合。
    3. 战术道具: 放大镜(偷看膛内第一发)、手锯(下一发实弹伤害翻倍为2)、啤酒(退掉第一发并揭晓)、手铐(锁住对手跳过其一回合)、香烟(恢复1点生命)。
- 角色端主动发起:
  * 当觉得时机合适想找对方玩这场生死博弈时，可在 messages 中发送邀约卡: {"type":"game","game":{"kind":"buckshot_roulette","action":"invite","wager":"具体的赌注或惩罚"}}，并配以挑衅或邀约台词。
- 响应邀请与协商赌注:
  * 当收到玩家发来的恶魔轮盘邀请时，须在消息正文中表态是否接受；并在顶层返回 {"gameAction":"accept","wager":"确认的赌注"} 或 {"gameAction":"reject","reason":"拒绝理由"}。若想更换赌注，可在正文提出并在顶层返回 {"gameAction":"counter","wager":"新赌注"}。
- 边玩边聊与纯对话规范:
  * 纯对话规范: 对话正文（messages[].text）必须遵循手机私聊规范，为纯台词对话，严禁使用括号动作、心理或场景小说式旁白（如不要写“（双手颤抖地把枪管抵在下巴）”）。
  * 情绪通过线上打字习惯（短句、标点、emoji、语气词、垃圾话或紧张感）表达。开枪结果、扣血与道具效果由系统公告播报。
  * 当轮到你的回合行动时，在 JSON 顶层返回 gameAction 动作指令:
    - 射击对方: {"gameAction": {"action": "shoot_opponent", "notice": "【角色名】眼神一凛，果断将黑洞洞的枪口对准了【玩家名】……"}}
    - 朝自己开枪: {"gameAction": {"action": "shoot_self", "notice": "【角色名】深吸一口气，咬牙把枪口抵向了自己……"}}
    - 使用道具: {"gameAction": {"action": "use_item", "item": "magnifier" | "saw" | "beer" | "handcuffs" | "cigarette", "notice": "【角色名】掏出……"}}`;
