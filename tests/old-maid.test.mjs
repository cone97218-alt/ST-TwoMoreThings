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
  cleanParticipantName,
} from '../src/games/old-maid.js';
import { normalizeContent, messageText } from '../src/content.js';
import { renderCardBody } from '../src/ui/cards.js';
import { renderGameBoard } from '../src/ui/game-board.js';
import { renderChat } from '../src/ui/messages.js';
import { DEFAULT_PRESET_ENTRIES, PRESET_SLOTS, compilePromptPreset } from '../src/preset-engine.js';
import { OLD_MAID_PROMPT, RICH_MESSAGES_PROMPT } from '../src/prompts.js';
import { createPhoneStore } from '../src/store.js';
import { createMessageService } from '../src/messages.js';
import { createContextReader } from '../src/context.js';
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

test('compilePromptPreset replaces {{old_maid_prompt}} macro with actual text', () => {
  const customPreset = {
    entries: [
      {
        id: 'test_game_rules',
        name: '抽鬼牌',
        role: 'system',
        scope: '短信',
        enabled: true,
        content: '规则如下：\n{{old_maid_prompt}}',
      },
    ],
  };
  const compiled = compilePromptPreset(customPreset, {}, 'chat', {});
  assert.equal(compiled.length, 1);
  assert(!compiled[0].content.includes('{{old_maid_prompt}}'));
  assert(compiled[0].content.includes('小游戏功能规范：抽鬼牌'));
});

test('messageText for invited status indicates waiting for response and negotiation', () => {
  const userInviteMsg = {
    type: 'game',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      status: 'invited',
      sender: 'user',
      wager: '答应赢家一个要求',
    },
  };
  const text = messageText(userInviteMsg);
  assert(text.includes('玩家向你发起'));
  assert(text.includes('等待回应'));
  assert(text.includes('协商更换赌注'));
  assert(!text.includes('进行中(第1轮)'));
});

test('renderGameBoard does not contain peek-expression or ai-draw trigger buttons', () => {
  const game = createOldMaidGame();
  const htmlUser = renderGameBoard(game, { contact: { name: '对方' }, busy: new Set() });
  assert(!htmlUser.includes('察言观色'));
  assert(!htmlUser.includes('data-game-action="peek-expression"'));

  game.turn = 'ai';
  const htmlAi = renderGameBoard(game, { contact: { name: '对方' }, busy: new Set() });
  assert(!htmlAi.includes('让对方出牌'));
  assert(!htmlAi.includes('data-game-action="ai-draw"'));
});

test('game-action notice is normalized and rendered as a system notice in chat', () => {
  const norm = normalizeContent({ type: 'game-action', text: '你抽中了对方的【♥ 7】，与自己的【♠ 7】成对消除！' });
  assert.equal(norm.type, 'game-action');
  assert.equal(norm.text, '[抽鬼牌：你抽中了对方的【♥ 7】，与自己的【♠ 7】成对消除！]');
  assert.equal(messageText(norm), '[抽鬼牌：你抽中了对方的【♥ 7】，与自己的【♠ 7】成对消除！]');

  const state = {
    contacts: [{ id: 'c1', name: '对方' }],
    conversations: {
      c1: [
        { id: 'm1', role: 'system', type: 'game-action', text: '你抽中了对方的【♥ 7】，与自己的【♠ 7】成对消除！', batch: { key: '1' } }
      ]
    }
  };
  const html = renderChat(state, {
    ui: { view: 'messages', contactId: 'c1', visibleMessages: 20, batch: { key: '1' }, drafts: new Map() },
    busy: new Set(),
  });
  assert(html.includes('is-game-action'));
  assert(html.includes('game-action-notice'));
  assert(html.includes('你抽中了对方的【♥ 7】'));
});

test('Old Maid prompt is separated from RICH_MESSAGES_PROMPT and contains free-chat rule', () => {
  assert(!RICH_MESSAGES_PROMPT.includes('old_maid'));
  assert(!RICH_MESSAGES_PROMPT.includes('Old Maid'));
  assert(!RICH_MESSAGES_PROMPT.includes('抽鬼牌'));

  assert(OLD_MAID_PROMPT.includes('边玩边聊'));
  assert(OLD_MAID_PROMPT.includes('gameAction'));
  assert(OLD_MAID_PROMPT.includes('严禁仅在普通对话文本中口头描述抽牌'));
});

test('AI accepting game invitation in continueChat records game-action notice with batch', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: 'hello' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'c1', name: '林舟' }]);

  const invite = createOldMaidInvitation({ sender: 'user', wager: '输了请喝奶茶' });
  const inviteMsg = {
    id: 'inv_1',
    role: 'user',
    type: 'game',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      gameId: invite.id,
      status: 'invited',
      sender: 'user',
      wager: invite.wager,
      state: invite,
    },
    text: '[小游戏邀约：玩家向你发起抽鬼牌对决，赌注：输了请喝奶茶；等待回应：可接受并确认赌注、可协商更换赌注、或拒绝]',
  };
  await store.appendMessage('c1', inviteMsg);

  const modelClient = {
    complete: async () => JSON.stringify({
      messages: [{ text: '好啊，来玩一把！' }],
      gameAction: { action: 'accept', wager: '输了请喝奶茶' },
    }),
  };
  const contextReader = createContextReader({ target, store });
  const service = createMessageService({ target, store, contextReader, modelClient });

  await service.continueChat('c1');

  const thread = store.read().conversations.c1;
  const sysAction = thread.find(m => m.type === 'game-action');
  assert.ok(sysAction, 'game-action system message must be recorded');
  assert.equal(sysAction.role, 'system');
  assert.ok(sysAction.batch?.key, 'must have batch key so it renders in current chat view');
  assert(sysAction.text.includes('对决正式开始'));

  // Ensure it renders in chat view
  const html = renderChat(store.read(), {
    ui: { view: 'messages', contactId: 'c1', visibleMessages: 20, batch: sysAction.batch, drafts: new Map() },
    busy: new Set(),
  });
  assert(html.includes('is-game-action'));
  assert(html.includes('game-action-notice'));
  assert(html.includes('对决正式开始'));
});

test('userDrawCard, aiDrawCard, and system notices use participant names and support custom AI notice', () => {
  const game = createOldMaidGame({ userName: '小明', contactName: '林舟' });
  assert(game.lastAction.description.includes('【小明】') || game.lastAction.description.includes('【林舟】'));

  // User draw
  const userStep = userDrawCard(game, 0, { userName: '小明', contactName: '林舟' });
  assert(userStep.game.lastAction.description.includes('【小明】'));
  assert(userStep.game.lastAction.description.includes('【林舟】'));

  // AI draw with custom notice written by AI
  const aiStep = aiDrawCard(userStep.game, 0, {
    userName: '小明',
    contactName: '林舟',
    customNotice: '【林舟】眼神狡黠地抽走了【小明】最左边的一张牌……',
  });
  assert.equal(aiStep.game.lastAction.description, '【林舟】眼神狡黠地抽走了【小明】最左边的一张牌……');
});

test('AI turn in continueChat automatically executes aiDrawCard, saves chat, and handles custom notice without crashing parsePayload', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: 'hello' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'c1', name: '林舟' }]);

  const game = createOldMaidGame({ starter: 'user', userName: '小明', contactName: '林舟' });
  game.turn = 'ai'; // It is now AI's turn to draw
  game.userCards = [
    { id: '2S', rank: '2', suit: 'S', isJoker: false },
    { id: '3S', rank: '3', suit: 'S', isJoker: false },
    { id: '4S', rank: '4', suit: 'S', isJoker: false },
  ];
  game.aiCards = [
    { id: '5S', rank: '5', suit: 'S', isJoker: false },
    { id: '6S', rank: '6', suit: 'S', isJoker: false },
    { id: 'JOKER', rank: 'JOKER', suit: 'JOKER', isJoker: true },
  ];

  const gameMsg = {
    id: 'game_msg_active',
    role: 'user',
    type: 'game',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      gameId: game.id,
      status: 'playing',
      wager: game.wager,
      turn: 'ai',
      round: 1,
      state: game,
    },
    text: '[小游戏：抽鬼牌，进行中]',
  };
  await store.appendMessage('c1', gameMsg);

  // Model returns gameAction without messages array
  const modelClient = {
    complete: async () => JSON.stringify({
      gameAction: {
        action: 'draw',
        drawIndex: 0,
        notice: '【林舟】修长手指轻轻一挑，抽走了【小明】手里的牌……',
      },
      messages: [{ text: '抓到你的破绽了哦~' }],
    }),
  };
  const contextReader = createContextReader({ target, store });
  const service = createMessageService({ target, store, contextReader, modelClient });

  await service.continueChat('c1');

  const thread = store.read().conversations.c1;
  const lastSysMsg = [...thread].reverse().find(m => m.type === 'game-action');
  assert.ok(lastSysMsg, 'ai draw game-action system notice should be added');
  assert.equal(lastSysMsg.text, '【林舟】修长手指轻轻一挑，抽走了【小明】手里的牌……');

  const charMsg = [...thread].reverse().find(m => m.role === 'assistant');
  assert.ok(charMsg, 'AI dialogue message should be added');
  assert.equal(charMsg.text, '抓到你的破绽了哦~');

  // Verify game turn transitioned to user and round incremented
  const updatedGameMsg = thread.find(m => m.id === 'game_msg_active');
  assert.equal(updatedGameMsg.game.turn, 'user');
  assert.equal(updatedGameMsg.game.round, 2);
});

test('Old Maid full flow: invite -> accept -> user draw -> ai auto draw and chat reply', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '今天天气不错' }] });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'c1', name: '林舟' }]);
  await store.saveUserProfile({ name: '玩家' });

  // 1. 用户发送邀请
  const invite = createOldMaidInvitation({ sender: 'user', wager: '输了请喝奶茶', userName: '玩家', contactName: '林舟' });
  const inviteMsg = {
    id: 'msg_invite_sim',
    role: 'user',
    type: 'game',
    game: {
      kind: 'old_maid',
      title: '抽鬼牌',
      gameId: invite.id,
      status: 'invited',
      sender: 'user',
      wager: invite.wager,
      state: invite,
    },
    text: '[小游戏邀约：玩家向你发起抽鬼牌对决，赌注：输了请喝奶茶；等待回应：可接受并确认赌注、可协商更换赌注、或拒绝]',
  };
  await store.appendMessage('c1', inviteMsg);

  let callCount = 0;
  const responses = [
    JSON.stringify({
      messages: [{ text: '既然你想玩，那我可不会手下留情！' }],
      gameAction: { action: 'accept', wager: '输了请喝奶茶' },
    }),
    JSON.stringify({
      messages: [{ text: '让我看看……选这张！' }],
      gameAction: {
        action: 'draw',
        drawIndex: 0,
        notice: '【林舟】眨了眨眼，动作轻快地从【玩家】手里抽走了一张牌。',
      },
    }),
  ];

  const modelClient = {
    complete: async () => responses[callCount++] || JSON.stringify({ messages: [{ text: '出牌' }] }),
  };

  const contextReader = createContextReader({ target, store });
  const service = createMessageService({ target, store, contextReader, modelClient });

  // 2. AI 接受对战
  await service.continueChat('c1');
  let thread = store.read().conversations.c1;
  const startMsg = thread.find(m => m.type === 'game-action' && m.text.includes('对决正式开始'));
  assert.ok(startMsg);
  assert(startMsg.text.includes('【玩家】'));

  // 3. 玩家抽牌
  const activeMsg = thread.find(m => m.id === 'msg_invite_sim');
  let game = activeMsg.game.state || activeMsg.game;
  const userDrawRes = userDrawCard(game, 0, { userName: '玩家', contactName: '林舟' });
  game = userDrawRes.game;
  await store.updateGameMessage('c1', activeMsg.id, game);
  await store.appendMessages('c1', [{
    id: `sys_user_${Date.now()}`,
    role: 'system',
    type: 'game-action',
    text: game.lastAction.description,
    timeLabel: '12:00',
    batch: { key: '1' },
  }]);

  // 4. AI 自动摸牌与台词回复
  await service.continueChat('c1');
  thread = store.read().conversations.c1;
  const aiSysAction = [...thread].reverse().find(m => m.type === 'game-action');
  assert.equal(aiSysAction.text, '【林舟】眨了眨眼，动作轻快地从【玩家】手里抽走了一张牌。');

  const aiChat = [...thread].reverse().find(m => m.role === 'assistant');
  assert.equal(aiChat.text, '让我看看……选这张！');

  // 5. 验证界面元素（系统通知药丸纯净整洁，保留删除功能且无突兀卡牌图标）
  const chatHtml = renderChat(store.read(), {
    ui: { view: 'messages', contactId: 'c1', visibleMessages: 20, batch: { key: '1' }, drafts: new Map() },
    busy: new Set(),
  });
  assert(chatHtml.includes('game-action-notice'));
  assert(chatHtml.includes('game-action-text'));
  assert(chatHtml.includes('system-notice-delete'));
  assert(!chatHtml.includes('game-action-icon'));

  const boardHtml = renderGameBoard(game, { contact: { name: '林舟' }, busy: new Set() });
  assert(boardHtml.includes('game-board-drawer'));
  assert(boardHtml.includes('林舟 的手牌'));
});

test('cleanParticipantName filters <user> macro and renders clean 【你】', () => {
  const norm1 = cleanParticipantName('<user>', '你');
  assert.equal(norm1, '你');
  const norm2 = cleanParticipantName('{{user}}', '你');
  assert.equal(norm2, '你');
  const norm3 = cleanParticipantName('玩家', '你');
  assert.equal(norm3, '玩家');

  const rawNotice = {
    id: 'm_user_macro',
    role: 'system',
    type: 'game-action',
    text: '对决正式开始！已消除 4 对初始手牌，轮到【<user>】抽牌。',
    batch: { key: '1' },
  };
  const state = {
    contacts: [{ id: 'c1', name: '林舟' }],
    conversations: { c1: [rawNotice] },
  };
  const html = renderChat(state, {
    ui: { view: 'messages', contactId: 'c1', visibleMessages: 20, batch: { key: '1' }, drafts: new Map() },
    busy: new Set(),
  });
  assert(html.includes('轮到【你】抽牌'));
  assert(!html.includes('<user>'));
  assert(html.includes('system-notice-delete'));
  assert(!html.includes('game-action-icon'));
});
