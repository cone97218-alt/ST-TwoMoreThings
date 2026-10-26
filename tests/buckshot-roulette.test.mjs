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

test('buckshot: reloadChamberIfNeeded generates reloadedNotice when chamber empties', () => {
  const game = createBuckshotGame({ maxHp: 4, starter: 'user', userName: '指挥官', contactName: '爱丽丝' });
  game.chamber = [false]; // 仅剩 1 发空弹
  game.round = 1;

  const res = shootOpponent(game, { actor: 'user', userName: '指挥官', contactName: '爱丽丝' });
  assert.equal(res.game.round, 2);
  assert.ok(res.game.chamber.length > 0);
  assert.ok(res.game.reloadedNotice);
  assert.ok(res.game.reloadedNotice.includes('【恶魔轮盘 · 第 2 轮】'));
  assert.ok(res.game.reloadedNotice.includes('重新装填'));
  assert.ok(res.game.reloadedNotice.includes('爱丽丝'));
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
  const { isFinishedGameAction, filterFinishedGameActions } = await import('../src/content.js');

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

  const filtered = filterFinishedGameActions(thread, thread);
  assert.equal(filtered.length, 5);
  assert.deepEqual(filtered.map(m => m.id), ['msg_1', 'game_card_1', 'msg_2', 'game_card_2', 'act_3']);
});
