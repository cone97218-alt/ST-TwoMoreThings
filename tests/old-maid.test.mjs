import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeck,
  discardPairs,
  createOldMaidGame,
  createOldMaidInvitation,
  acceptOldMaidGame,
  rejectOldMaidGame,
  userDrawCard,
  aiDrawCard,
  setBluffCard,
  getAiMicroExpression,
} from '../src/games/old-maid.js';
import { normalizeContent, messageText } from '../src/content.js';
import { renderCardBody } from '../src/ui/cards.js';
import { renderGameBoard } from '../src/ui/game-board.js';
import { DEFAULT_PRESET_ENTRIES, PRESET_SLOTS } from '../src/preset-engine.js';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';

test('createDeck generates 17 cards: 8 pairs + 1 Joker', () => {
  const deck = createDeck();
  assert.equal(deck.length, 17);
  const jokers = deck.filter(c => c.isJoker);
  assert.equal(jokers.length, 1);
  assert.equal(jokers[0].id, 'JOKER');
});

test('discardPairs correctly matches and discards cards of the same rank', () => {
  const hand = [
    { id: 'AS', rank: 'A', suit: 'S', isJoker: false },
    { id: 'AH', rank: 'A', suit: 'H', isJoker: false },
    { id: '2S', rank: '2', suit: 'S', isJoker: false },
    { id: 'JOKER', rank: 'JOKER', suit: 'JOKER', isJoker: true },
  ];
  const { remaining, discarded } = discardPairs(hand);
  assert.equal(discarded.length, 1);
  assert.equal(remaining.length, 2);
  assert(remaining.some(c => c.id === '2S'));
  assert(remaining.some(c => c.id === 'JOKER'));
});

test('createOldMaidGame initializes valid game state', () => {
  const game = createOldMaidGame({ wager: '输了请喝奶茶' });
  assert.equal(game.kind, 'old_maid');
  assert.equal(game.wager, '输了请喝奶茶');
  assert.equal(game.status, 'playing');
  assert.equal(game.turn, 'user');
  assert(game.userCards.length > 0);
  assert(game.aiCards.length > 0);
  // Total cards in game + discard pairs * 2 must equal 17
  const total = game.userCards.length + game.aiCards.length + game.discardPile.length * 2;
  assert.equal(total, 17);
});

test('userDrawCard and aiDrawCard advance game turns correctly', () => {
  const game = createOldMaidGame();
  const initialAiCount = game.aiCards.length;

  // 玩家抽牌
  const step1 = userDrawCard(game, 0);
  assert.equal(step1.game.aiCards.length, initialAiCount - 1);
  assert.equal(step1.game.turn, 'ai');

  // AI 抽牌
  const step2 = aiDrawCard(step1.game);
  if (step2.game.status === 'ongoing') {
    assert.equal(step2.game.turn, 'user');
    assert.equal(step2.game.round, 2);
  }
});

test('bluff card and micro expression helper work', () => {
  const game = createOldMaidGame();
  game.turn = 'ai';
  const bluffed = setBluffCard(game, 0);
  assert.equal(bluffed.bluffCardIndex, 0);

  const expr = getAiMicroExpression(game);
  assert(typeof expr.text === 'string' && expr.text.length > 0);
});

test('normalizeContent and messageText correctly support game message', () => {
  const game = createOldMaidGame({ wager: '叫对方主人' });
  const raw = {
    type: 'game',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      gameId: game.id,
      status: 'ongoing',
      wager: game.wager,
      round: 1,
      turn: 'user',
      state: game,
    }
  };
  const normalized = normalizeContent(raw);
  assert.equal(normalized.type, 'game');
  assert.equal(normalized.game.kind, 'old_maid');
  assert.equal(normalized.game.wager, '叫对方主人');
  assert(normalized.text.includes('抽鬼牌'));
  assert(normalized.text.includes('叫对方主人'));

  const html = renderCardBody(normalized);
  assert(html.includes('抽鬼牌'));
  assert(html.includes('叫对方主人'));
});

test('store.updateGameMessage updates the game message state and text', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: 'hello' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'c1', name: '玩家' }]);

  const game = createOldMaidGame({ wager: '自拍一张' });
  const msg = {
    id: 'g_msg_1',
    role: 'user',
    type: 'game',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      gameId: game.id,
      status: 'ongoing',
      wager: game.wager,
      round: 1,
      turn: 'user',
      state: game,
    },
    text: '[小游戏：抽鬼牌，赌注：自拍一张；进行中(第1轮)]',
  };
  await store.appendMessage('c1', msg);

  game.status = 'finished';
  game.winner = 'user';
  game.loser = 'ai';
  await store.updateGameMessage('c1', 'g_msg_1', game);

  const updated = store.read().conversations['c1'].find(m => m.id === 'g_msg_1');
  assert.equal(updated.game.status, 'finished');
  assert.equal(updated.game.winner, 'user');
  assert(updated.text.includes('玩家获胜'));
});

test('createOldMaidInvitation, acceptOldMaidGame, and rejectOldMaidGame workflow', () => {
  const invite = createOldMaidInvitation({ sender: 'user', wager: '输了叫对方主人' });
  assert.equal(invite.status, 'invited');
  assert.equal(invite.wager, '输了叫对方主人');
  assert.equal(invite.sender, 'user');

  // Accept
  const game = acceptOldMaidGame(invite, { starter: 'ai' });
  assert.equal(game.status, 'playing');
  assert.equal(game.turn, 'ai');
  assert.equal(game.wager, '输了叫对方主人');
  assert(game.userCards.length > 0);
  assert(game.aiCards.length > 0);

  // Reject
  const rejected = rejectOldMaidGame(invite);
  assert.equal(rejected.status, 'rejected');
});

test('renderCardBody distinguishes user-sent invite as 等待邀请结果 and AI invite as 收到对决邀请', () => {
  const userInviteMsg = {
    type: 'game',
    role: 'user',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      status: 'invited',
      sender: 'user',
      wager: '答应赢家一个要求',
    },
  };
  const userHtml = renderCardBody(userInviteMsg);
  assert(userHtml.includes('等待邀请结果'));
  assert(!userHtml.includes('收到对决邀请'));
  assert(!userHtml.includes('game-card-title'));

  const aiInviteMsg = {
    type: 'game',
    role: 'assistant',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      status: 'invited',
      sender: 'ai',
      wager: '喝完这杯茶',
    },
  };
  const aiHtml = renderCardBody(aiInviteMsg);
  assert(aiHtml.includes('收到对决邀请'));
  assert(!aiHtml.includes('等待邀请结果'));
});

test('renderGameBoard header removes 抽鬼牌 title and displays pure round number', () => {
  const game = createOldMaidGame({ wager: '赌注一' });
  game.round = 3;
  const html = renderGameBoard(game, { contact: { name: '对方' }, busy: new Set() });
  // Must contain pure round number 3
  assert(html.includes('<span class="game-round-pill">3</span>'));
  // Header should not contain <strong>抽鬼牌</strong>
  assert(!html.includes('<strong>抽鬼牌</strong>'));
});

test('preset engine includes old_maid rule entry and slot', () => {
  const oldMaidEntry = DEFAULT_PRESET_ENTRIES.find(e => e.id === 'entry_old_maid_rules');
  assert.ok(oldMaidEntry);
  assert.equal(oldMaidEntry.scope, '短信');
  assert.equal(oldMaidEntry.content, '{{old_maid_prompt}}');

  const oldMaidSlot = PRESET_SLOTS.find(s => s.macro === '{{old_maid_prompt}}');
  assert.ok(oldMaidSlot);
});
