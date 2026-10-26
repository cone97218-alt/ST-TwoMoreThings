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
} from '../src/games/buckshot-roulette.js';
import { renderGameBoard } from '../src/ui/game-board.js';
import { renderCardBody, renderCardActions } from '../src/ui/cards.js';

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
  assert.ok(html.includes('data-buckshot-action="shoot-opponent"'));
  assert.ok(html.includes('data-buckshot-action="shoot-self"'));
  assert.ok(html.includes('放大镜'));
  assert.ok(html.includes('啤酒'));
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
