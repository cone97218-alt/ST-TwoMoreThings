import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUCKSHOT_ITEMS,
  ITEM_INFO,
  generateChamber,
  drawRandomItems,
  createBuckshotInvitation,
  acceptBuckshotGame,
  rejectBuckshotGame,
  createBuckshotGame,
  shootOpponent,
  shootSelf,
  useItem,
  getAiBuckshotDecision,
  getChamberCounts,
  reloadChamberIfNeeded,
  formatBuckshotChronicle,
} from '../src/games/buckshot-roulette.js';
import { renderGameBoard } from '../src/ui/game-board.js';
import { renderCardBody, renderCardActions } from '../src/ui/cards.js';
import { messageText } from '../src/content.js';

test('buckshot: generateChamber generates valid chamber with live and blank bullets', () => {
  const c1 = generateChamber(1);
  assert.equal(c1.chamber.length, 3);
  assert.equal(c1.chamber.length, c1.liveCount + c1.blankCount);

  const c2 = generateChamber(2);
  assert.equal(c2.chamber.length, 4);
  assert.equal(c2.liveCount, 2);
  assert.equal(c2.blankCount, 2);

  const c3 = generateChamber(3);
  assert.equal(c3.chamber.length, 5);
});

test('buckshot: drawRandomItems respects count and maximum capacity', () => {
  const items1 = drawRandomItems([], 2, 4);
  assert.equal(items1.length, 2);

  const items2 = drawRandomItems(items1, 3, 4);
  assert.equal(items2.length, 4); // capped at 4
});

test('buckshot: createBuckshotInvitation, acceptBuckshotGame, and rejectBuckshotGame', () => {
  const invite = createBuckshotInvitation({
    sender: 'user',
    wager: '赢家决定周末行程',
    userName: '小明',
    contactName: '小红',
  });
  assert.equal(invite.status, 'invited');
  assert.equal(invite.wager, '赢家决定周末行程');
  assert.equal(invite.kind, 'buckshot_roulette');
  assert.ok(invite.lastAction.description.includes('小明'));

  const rejected = rejectBuckshotGame(invite, { contactName: '小红', reason: '现在不太想玩' });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.lastAction.description, '现在不太想玩');

  const started = acceptBuckshotGame(invite, {
    wager: '换个赌注：输的洗碗',
    starter: 'user',
    userName: '小明',
    contactName: '小红',
  });
  assert.equal(started.status, 'playing');
  assert.equal(started.wager, '换个赌注：输的洗碗');
  assert.equal(started.turn, 'user');
  assert.equal(started.userHp, 3);
  assert.equal(started.aiHp, 3);
  assert.ok(started.chamber.length > 0);
  assert.equal(started.userItems.length, 2);
  assert.equal(started.aiItems.length, 2);
});

test('buckshot: shootOpponent damages opponent on live bullet and switches turn', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.chamber = [true, false]; // 第一发实弹，第二发空弹
  game.aiHp = 3;

  const result = shootOpponent(game, { actor: 'user', userName: '玩家', contactName: '对手' });
  assert.equal(result.isLive, true);
  assert.equal(result.damage, 1);
  assert.equal(result.game.aiHp, 2);
  assert.equal(result.game.turn, 'ai');
  assert.ok(result.game.lastAction.description.includes('实弹'));
});

test('buckshot: shootSelf with blank bullet gives extra turn', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.chamber = [false, true]; // 第一发空弹
  game.userHp = 3;

  const result = shootSelf(game, { actor: 'user', userName: '玩家', contactName: '对手' });
  assert.equal(result.isLive, false);
  assert.equal(result.damage, 0);
  assert.equal(result.extraTurn, true);
  assert.equal(result.game.userHp, 3);
  assert.equal(result.game.turn, 'user'); // still user's turn!
  assert.ok(result.game.lastAction.description.includes('空弹'));
});

test('buckshot: shootSelf with live bullet inflicts damage and changes turn', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.chamber = [true, false]; // 第一发实弹
  game.userHp = 3;

  const result = shootSelf(game, { actor: 'user', userName: '玩家', contactName: '对手' });
  assert.equal(result.isLive, true);
  assert.equal(result.damage, 1);
  assert.equal(result.extraTurn, false);
  assert.equal(result.game.userHp, 2);
  assert.equal(result.game.turn, 'ai'); // switches to AI
});

test('buckshot: saw item doubles live bullet damage to 2', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.userItems = [BUCKSHOT_ITEMS.SAW];
  game.chamber = [true];

  const useRes = useItem(game, { actor: 'user', itemKey: BUCKSHOT_ITEMS.SAW, userName: '玩家', contactName: '对手' });
  assert.equal(useRes.game.sawedOff, true);
  assert.equal(useRes.game.userItems.length, 0);

  const shootRes = shootOpponent(useRes.game, { actor: 'user', userName: '玩家', contactName: '对手' });
  assert.equal(shootRes.damage, 2);
  assert.equal(shootRes.game.aiHp, 1);
  assert.equal(shootRes.game.sawedOff, false); // reset
});

test('buckshot: magnifier reveals next bullet to actor', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.userItems = [BUCKSHOT_ITEMS.MAGNIFIER];
  game.chamber = [true, false];

  const useRes = useItem(game, { actor: 'user', itemKey: BUCKSHOT_ITEMS.MAGNIFIER, userName: '玩家', contactName: '对手' });
  assert.equal(useRes.game.userKnownNext, true);
  assert.equal(useRes.game.aiKnownNext, null);
});

test('buckshot: beer discards first bullet', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.userItems = [BUCKSHOT_ITEMS.BEER];
  game.chamber = [true, false];

  const useRes = useItem(game, { actor: 'user', itemKey: BUCKSHOT_ITEMS.BEER, userName: '玩家', contactName: '对手' });
  assert.equal(useRes.effectDetail.discardedBullet, true);
  assert.equal(useRes.game.chamber.length, 1);
  assert.equal(useRes.game.chamber[0], false);
});

test('buckshot: cigarette heals 1 HP up to maxHp', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.userHp = 1;
  game.userItems = [BUCKSHOT_ITEMS.CIGARETTE];

  const useRes = useItem(game, { actor: 'user', itemKey: BUCKSHOT_ITEMS.CIGARETTE, userName: '玩家', contactName: '对手' });
  assert.equal(useRes.game.userHp, 2);
  assert.equal(useRes.effectDetail.healed, true);
});

test('buckshot: handcuffs force opponent to skip turn', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'user', userName: '玩家', contactName: '对手' });
  game.userItems = [BUCKSHOT_ITEMS.HANDCUFFS];
  game.chamber = [true, false, true];

  const useRes = useItem(game, { actor: 'user', itemKey: BUCKSHOT_ITEMS.HANDCUFFS, userName: '玩家', contactName: '对手' });
  assert.equal(useRes.game.handcuffed, 'ai');

  // Shooting opponent live bullet would normally hand turn to AI, but handcuffs make AI skip
  const shootRes = shootOpponent(useRes.game, { actor: 'user', userName: '玩家', contactName: '对手' });
  assert.equal(shootRes.game.handcuffed, null); // cuffs removed
  assert.equal(shootRes.game.turn, 'user'); // kept user turn!
});

test('buckshot: getAiBuckshotDecision makes smart choices', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'ai', userName: '玩家', contactName: 'AI' });
  game.turn = 'ai';

  // 1. Heals with cigarette when low HP
  game.aiHp = 1;
  game.aiItems = [BUCKSHOT_ITEMS.CIGARETTE];
  const d1 = getAiBuckshotDecision(game);
  assert.deepEqual(d1, { action: 'use_item', item: BUCKSHOT_ITEMS.CIGARETTE });

  // 2. Uses magnifier when next is unknown
  game.aiHp = 3;
  game.aiKnownNext = null;
  game.aiItems = [BUCKSHOT_ITEMS.MAGNIFIER];
  const d2 = getAiBuckshotDecision(game);
  assert.deepEqual(d2, { action: 'use_item', item: BUCKSHOT_ITEMS.MAGNIFIER });

  // 3. Known next is live -> saw if available or shoot opponent
  game.aiKnownNext = true;
  game.aiItems = [BUCKSHOT_ITEMS.SAW];
  game.sawedOff = false;
  const d3 = getAiBuckshotDecision(game);
  assert.deepEqual(d3, { action: 'use_item', item: BUCKSHOT_ITEMS.SAW });

  // 4. Known next is blank -> shoot self
  game.aiKnownNext = false;
  game.aiItems = [];
  const d4 = getAiBuckshotDecision(game);
  assert.deepEqual(d4, { action: 'shoot_self' });

  // 5. 100% blank chamber -> shoot self
  game.aiKnownNext = null;
  game.chamber = [false, false];
  const d5 = getAiBuckshotDecision(game);
  assert.deepEqual(d5, { action: 'shoot_self' });

  // 6. 100% live chamber -> shoot opponent
  game.chamber = [true, true];
  const d6 = getAiBuckshotDecision(game);
  assert.deepEqual(d6, { action: 'shoot_opponent' });
});

test('buckshot: renderGameBoard renders buckshot UI correctly', () => {
  const game = createBuckshotGame({
    wager: '惩罚真心话',
    maxHp: 3,
    starter: 'user',
    userName: '你',
    contactName: '爱丽丝',
  });
  game.userItems = [BUCKSHOT_ITEMS.MAGNIFIER];
  game.aiItems = [BUCKSHOT_ITEMS.BEER];

  const html = renderGameBoard(game, {
    contact: { id: 'alice', name: '爱丽丝' },
    isGroup: false,
    busy: new Set(),
  });

  assert.ok(html.includes('buckshot-drawer'));
  assert.ok(html.includes('恶魔轮盘'));
  assert.ok(html.includes('惩罚真心话'));
  assert.ok(html.includes('<span class="game-round-pill">1 轮</span>'));
  assert.ok(!html.includes('shoot-sub'));
  assert.ok(!html.includes('实弹造成伤害，空弹虚惊一场'));
  assert.ok(!html.includes('点击立即使用'));
  assert.ok(!html.includes('<small>'));
  assert.ok(html.includes('data-action="toggle-game-guide"'));
  assert.ok(html.includes('data-buckshot-action="shoot-opponent"'));
  assert.ok(html.includes('data-buckshot-action="shoot-self"'));
  assert.ok(html.includes('放大镜'));
  assert.ok(html.includes('啤酒'));

  const guideHtml = renderGameBoard(game, {
    contact: { id: 'alice', name: '爱丽丝' },
    isGroup: false,
    busy: new Set(),
    guideOpen: true,
  });
  assert.ok(guideHtml.includes('game-guide-view'));
  assert.ok(guideHtml.includes('规则图鉴'));
  assert.ok(guideHtml.includes('手锯'));
  assert.ok(guideHtml.includes('香烟'));
  assert.ok(guideHtml.includes('手铐'));

  const chronicleHtml = renderGameBoard(game, {
    contact: { id: 'alice', name: '爱丽丝' },
    isGroup: false,
    busy: new Set(),
    guideOpen: true,
    guideTab: 'chronicle',
  });
  assert.ok(chronicleHtml.includes('game-chronicle-view'));
  assert.ok(chronicleHtml.includes('第 1 轮'));
});

test('buckshot: renderCardBody and renderCardActions render game invitation correctly', () => {
  const message = {
    id: 'msg_invite_1',
    role: 'assistant',
    type: 'game',
    game: {
      kind: 'buckshot_roulette',
      title: '恶魔轮盘',
      status: 'invited',
      sender: 'ai',
      wager: '请吃大餐',
    },
  };
  const bodyHtml = renderCardBody(message, {
    contact: { id: 'alice', name: '爱丽丝' },
    busy: new Set(),
    isGroup: false,
  });

  assert.ok(bodyHtml.includes('恶魔轮盘'));
  assert.ok(bodyHtml.includes('请吃大餐'));
  assert.ok(bodyHtml.includes('收到对决邀请'));

  const actionsHtml = renderCardActions(message, {
    readOnly: false,
    busy: new Set(),
  });
  assert.ok(actionsHtml.includes('接受对决'));
  assert.ok(actionsHtml.includes('拒绝'));
});

test('buckshot: formatBuckshotChronicle creates structured battle record', () => {
  const game = createBuckshotGame({ wager: '俯卧撑20个', userName: '指挥官', contactName: '爱丽丝' });
  shootSelf(game, { actor: 'user', userName: '指挥官', contactName: '爱丽丝' });
  const chronicle = formatBuckshotChronicle(game, { userName: '指挥官', contactName: '爱丽丝' });

  assert.ok(chronicle.includes('恶魔轮盘 · 战局客观档案'));
  assert.ok(chronicle.includes('俯卧撑20个'));
  assert.ok(chronicle.includes('第 1 轮'));
  assert.ok(chronicle.includes('初始:'));
});

test('buckshot: messageText outputs [恶魔轮盘：...] instead of [抽鬼牌：...]', () => {
  const gameActionMsg = {
    id: 'ga_1',
    type: 'game-action',
    gameKind: 'buckshot_roulette',
    text: '【爱丽丝】心跳加速朝自己扣动扳机……咔哒！是空弹！赌赢了，获得额外行动机会！',
  };
  const txt = messageText(gameActionMsg);
  assert.ok(txt.startsWith('[恶魔轮盘：'));
  assert.ok(!txt.includes('[抽鬼牌：'));
});

test('buckshot: reloadChamberIfNeeded generates reloadedNotice and alternates starters on round reload', () => {
  const game = createBuckshotGame({ maxHp: 4, starter: 'user', userName: '指挥官', contactName: '爱丽丝' });
  assert.equal(game.firstStarter, 'user');
  assert.equal(game.turn, 'user');
  game.chamber = [false]; // 第 1 轮仅剩 1 发空弹
  game.round = 1;
  game.handcuffed = 'user';

  // 用户射击对手空弹，弹仓打空，换轮重装
  const res1 = shootOpponent(game, { actor: 'user', userName: '指挥官', contactName: '爱丽丝' });
  assert.equal(res1.game.round, 2);
  assert.equal(res1.game.turn, 'ai'); // 第 2 轮交替换为 AI 先手
  assert.equal(res1.game.handcuffed, null); // 手铐自动清除
  assert.ok(res1.game.chamber.length > 0);
  assert.ok(res1.game.reloadedNotice.includes('【恶魔轮盘 · 第 2 轮】'));
  assert.ok(res1.game.reloadedNotice.includes('爱丽丝'));

  // 模拟第 2 轮打空，进入第 3 轮
  res1.game.chamber = [];
  const res2 = reloadChamberIfNeeded(res1.game, { userName: '指挥官', contactName: '爱丽丝' });
  assert.equal(res2.round, 3);
  assert.equal(res2.turn, 'user'); // 第 3 轮交替重回 user 先手
  assert.ok(res2.reloadedNotice.includes('【恶魔轮盘 · 第 3 轮】'));
  assert.ok(res2.reloadedNotice.includes('指挥官'));

  // 测试随机开局选择
  const invite = createBuckshotInvitation({ sender: 'user', wager: '纯娱乐' });
  const starters = new Set();
  for (let i = 0; i < 30; i++) {
    const started = acceptBuckshotGame(invite, { starter: 'random' });
    starters.add(started.turn);
  }
  assert.ok(starters.has('user'));
  assert.ok(starters.has('ai'));
});

test('buckshot: multi-step AI turn resolves items and ultimately fires weapon', () => {
  const game = createBuckshotGame({ maxHp: 3, starter: 'ai', userName: '你', contactName: 'Seraphina' });
  game.chamber = [true, false]; // 实弹，空弹
  game.aiItems = [BUCKSHOT_ITEMS.MAGNIFIER, BUCKSHOT_ITEMS.SAW];
  game.turn = 'ai';

  let currentGameState = game;
  let loopCount = 0;
  while (currentGameState.status === 'playing' && currentGameState.turn === 'ai' && loopCount < 8) {
    loopCount++;
    const aiDecision = getAiBuckshotDecision(currentGameState) || { action: 'shoot_opponent' };
    if (aiDecision.action === 'use_item') {
      const res = useItem(currentGameState, { actor: 'ai', itemKey: aiDecision.item, userName: '你', contactName: 'Seraphina' });
      currentGameState = res.game;
    } else if (aiDecision.action === 'shoot_self') {
      const res = shootSelf(currentGameState, { actor: 'ai', userName: '你', contactName: 'Seraphina' });
      currentGameState = res.game;
    } else {
      const res = shootOpponent(currentGameState, { actor: 'ai', userName: '你', contactName: 'Seraphina' });
      currentGameState = res.game;
    }
  }

  // 验证 AI 成功连续使用放大镜、手锯，并最终开火射击对手，回合顺利移交
  assert.equal(currentGameState.turn, 'user');
  assert.equal(currentGameState.userHp, 1); // 3 - 2 伤害 = 1
  assert.equal(loopCount, 3); // 1.放大镜 -> 2.手锯 -> 3.射击
});

test('buckshot: filterFinishedGameActions and isFinishedGameAction filter only completed game actions', async () => {
  const { isFinishedGameAction, filterFinishedGameActions, countAiTurnsAfterGame, isGameActionExpired } = await import('../src/content.js');

  const thread = [
    { id: 'msg_1', role: 'user', text: '你好' },
    { id: 'game_card_1', type: 'game', game: { kind: 'buckshot_roulette', status: 'finished', winner: 'user' } },
    { id: 'act_1', type: 'game-action', text: '[恶魔轮盘：【你】扣动扳机……轰！是实弹！]' },
    { id: 'act_2', type: 'game-action', text: '[恶魔轮盘：【Seraphina】倒下！]' },
    { id: 'msg_2', role: 'assistant', text: '哈哈我输了' },
    { id: 'game_card_2', type: 'game', game: { kind: 'buckshot_roulette', status: 'playing' } },
    { id: 'act_3', type: 'game-action', text: '[恶魔轮盘：【你】使用了【手锯】]' },
  ];

  assert.equal(isFinishedGameAction(thread[0], thread), false); // 普通消息不属于 action
  assert.equal(isFinishedGameAction(thread[1], thread), false); // 游戏卡片不属于 action
  assert.equal(isFinishedGameAction(thread[2], thread), true);  // 属于已完结游戏 game_card_1
  assert.equal(isFinishedGameAction(thread[3], thread), true);  // 属于已完结游戏 game_card_1
  assert.equal(isFinishedGameAction(thread[4], thread), false); // 助手普通消息
  assert.equal(isFinishedGameAction(thread[5], thread), false); // 进行中游戏卡片
  assert.equal(isFinishedGameAction(thread[6], thread), false); // 属于进行中游戏 game_card_2，必须保留！

  // bufferTurns = 0 时，立即过滤
  const filteredImmediate = filterFinishedGameActions(thread, thread, 0);
  assert.equal(filteredImmediate.length, 5);
  assert.deepEqual(filteredImmediate.map(m => m.id), ['msg_1', 'game_card_1', 'msg_2', 'game_card_2', 'act_3']);

  // 默认 bufferTurns = 5 时：当前终局后仅有 1 轮 AI 回复（msg_2），处于缓冲带内，中间播报继续保留注入！
  const filteredWithBuffer = filterFinishedGameActions(thread, thread);
  assert.equal(filteredWithBuffer.length, 7);
  assert.equal(isGameActionExpired(thread[2], thread, 5), false);

  // 模拟推进多轮对话：
  // 轮次 2：用户发言 + AI 回复（多条消息算作 1 轮）
  thread.push({ id: 'u_2', role: 'user', text: '愿赌服输吗？' });
  thread.push({ id: 'a_2_1', role: 'assistant', text: '当然愿赌服输。' });
  thread.push({ id: 'a_2_2', role: 'assistant', text: '你说吧，什么要求？' });
  assert.equal(countAiTurnsAfterGame(thread[1], thread), 2);
  assert.equal(isGameActionExpired(thread[2], thread, 5), false);

  // 轮次 3
  thread.push({ id: 'u_3', role: 'user', text: '陪我看场电影' });
  thread.push({ id: 'a_3', role: 'assistant', text: '没问题，什么电影？' });
  assert.equal(countAiTurnsAfterGame(thread[1], thread), 3);
  assert.equal(isGameActionExpired(thread[2], thread, 5), false);

  // 轮次 4
  thread.push({ id: 'u_4', role: 'user', text: '科幻片' });
  thread.push({ id: 'a_4', role: 'assistant', text: '行啊，周六去。' });
  assert.equal(countAiTurnsAfterGame(thread[1], thread), 4);
  assert.equal(isGameActionExpired(thread[2], thread, 5), false);

  // 轮次 5（第 5 轮，依然处于缓冲带内，继续保留注入）
  thread.push({ id: 'u_5', role: 'user', text: '好，不见不散' });
  thread.push({ id: 'a_5', role: 'assistant', text: '不见不散！' });
  assert.equal(countAiTurnsAfterGame(thread[1], thread), 5);
  assert.equal(isGameActionExpired(thread[2], thread, 5), false);
  assert.equal(filterFinishedGameActions(thread, thread).includes(thread[2]), true);

  // 轮次 6（超过 5 轮缓冲带，正式过期并清除过滤！）
  thread.push({ id: 'u_6', role: 'user', text: '今天天气真好' });
  thread.push({ id: 'a_6', role: 'assistant', text: '确实很适合出门。' });
  assert.equal(countAiTurnsAfterGame(thread[1], thread), 6);
  assert.equal(isGameActionExpired(thread[2], thread, 5), true);
  assert.equal(isGameActionExpired(thread[3], thread, 5), true);

  // 测试带有 batch.key 的真实消息流场景：
  const batchThread = [
    { id: 'g1', type: 'game', game: { kind: 'buckshot_roulette', status: 'finished', winner: 'ai' } },
    { id: 'a_act', type: 'game-action', text: '[恶魔轮盘：终结射击]', batch: { key: 'batch_0' } },
    { id: 'a_speech', role: 'assistant', text: '我赢了！', batch: { key: 'batch_0' } }, // 同一批次终局台词，不计入后续轮次
  ];
  assert.equal(countAiTurnsAfterGame(batchThread[0], batchThread), 0);
  assert.equal(isGameActionExpired(batchThread[1], batchThread, 5), false);

  // 用户发言，AI 在新批次回信（第 1 轮）
  batchThread.push({ id: 'u1', role: 'user', text: '好吧', batch: { key: 'batch_u1' } });
  batchThread.push({ id: 'a1_1', role: 'assistant', text: '承认输了？', batch: { key: 'batch_1' } });
  batchThread.push({ id: 'a1_2', role: 'assistant', text: '那来履行赌注。', batch: { key: 'batch_1' } });
  assert.equal(countAiTurnsAfterGame(batchThread[0], batchThread), 1);
  assert.equal(isGameActionExpired(batchThread[1], batchThread, 5), false);
});

test('buckshot: card text formatting and extractLatestUserInput turn precision', async () => {
  const { messageText, extractLatestUserInput } = await import('../src/content.js');

  // 1. 卡片格式测试：开始时注明开始，结束时注明结束与胜者（使用 <user> 和 角色，无变动轮次）
  const playCard = {
    type: 'game',
    game: { kind: 'buckshot_roulette', status: 'playing', wager: '洗碗一周', round: 2, turn: 'ai' },
  };
  assert.equal(messageText(playCard), '[小游戏：恶魔轮盘对决开始，赌注：洗碗一周]');

  const finishCardUserWin = {
    type: 'game',
    game: { kind: 'buckshot_roulette', status: 'finished', wager: '洗碗一周', winner: 'user' },
  };
  assert.equal(messageText(finishCardUserWin), '[小游戏：恶魔轮盘对决结束，赌注：洗碗一周，胜者：<user>]');

  const finishCardAiWin = {
    type: 'game',
    game: { kind: 'buckshot_roulette', status: 'finished', wager: '洗碗一周', winner: 'ai' },
  };
  assert.equal(messageText(finishCardAiWin), '[小游戏：恶魔轮盘对决结束，赌注：洗碗一周，胜者：角色]');

  // 2. extractLatestUserInput 战局注入与回合方判定测试
  const activeGameAiTurn = {
    id: 'g_active',
    type: 'game',
    game: {
      kind: 'buckshot_roulette',
      status: 'playing',
      wager: '真心话',
      round: 1,
      turn: 'ai',
      userHp: 3,
      aiHp: 2,
      maxHp: 3,
      chamber: [true, false],
      userItems: ['beer'],
      aiItems: ['saw'],
    },
  };

  const msgsAiTurn = [
    activeGameAiTurn,
    { id: 'u_shot', role: 'user', text: '轮到你了。' },
  ];

  const promptAiTurn = extractLatestUserInput(msgsAiTurn, { contactName: 'Seraphina', userName: '旅行者' });
  assert(promptAiTurn.includes('[恶魔轮盘战局实况]'));
  assert(promptAiTurn.includes('当前是恶魔轮盘第 1 轮'));
  assert(promptAiTurn.includes('弹仓剩余 1 实弹、1 空弹'));
  assert(promptAiTurn.includes('【<user>】3/3 HP | 【角色】2/3 HP'));
  assert(promptAiTurn.includes('【行动指令】：当前明确轮到【角色】行动！'));
  assert(promptAiTurn.includes('角色必须在 JSON 顶层返回结构化动作指令'));
  assert(!promptAiTurn.includes('(旅行者)'));
  assert(!promptAiTurn.includes('(Seraphina)'));
  assert(!promptAiTurn.includes('当前轮到你行动'));

  // 当处于 <user> 回合时
  const activeGameUserTurn = {
    ...activeGameAiTurn,
    game: {
      ...activeGameAiTurn.game,
      turn: 'user',
    },
  };
  const msgsUserTurn = [
    activeGameUserTurn,
    { id: 'a_react', role: 'assistant', text: '我看你敢不敢开枪。' },
  ];
  const promptUserTurn = extractLatestUserInput(msgsUserTurn, { contactName: 'Seraphina', userName: '旅行者' });
  assert(promptUserTurn.includes('【行动指令】：当前处于【<user>】的回合，等待【<user>】开火或使用道具！'));
  assert(promptUserTurn.includes('当前不是角色回合，角色严禁在顶层返回 gameAction 动作指令'));

  // 3. 对局完结后停止注入测试
  const finishedGame = {
    ...activeGameAiTurn,
    game: {
      ...activeGameAiTurn.game,
      status: 'finished',
      winner: 'user',
    },
  };
  const msgsFinished = [
    finishedGame,
    { id: 'u_after', role: 'user', text: '我赢了，履行承诺吧。' },
  ];
  const promptFinished = extractLatestUserInput(msgsFinished, { contactName: 'Seraphina', userName: '旅行者' });
  assert(!promptFinished.includes('[恶魔轮盘战局实况与对弈推进]'));
  assert(!promptFinished.includes('【回合方判定】'));
  assert.equal(promptFinished.trim(), '我赢了，履行承诺吧。');
});
