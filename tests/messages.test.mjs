import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient, extractReasoning } from '../src/api.js';
import { createContextReader } from '../src/context.js';
import { createMessageService } from '../src/messages.js';
import { renderChat } from '../src/ui/messages.js';

export async function serviceHarness(options = {}) {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test-key', apiModel: 'm' } }, ...options });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', personality: '温和', expression: '说话简短' }]);
  const reader = createContextReader({ target, store, qqjBridgeProvider: options.qqjBridgeProvider });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  return { h, target, store, reader, modelClient, service: createMessageService({ target, store, contextReader: reader, modelClient }) };
}

test('send and continue are separate and do not write any main floor', async () => {
  const main = [{ mes: '约好今晚去书店。', is_user: false }];
  const { h, store, service } = await serviceHarness({ messages: main });
  await service.send('lin', '晚上一起吃饭吗？');
  await service.send('lin', '我可以晚一点到。');
  assert.equal(h.modelRequests.length, 0);
  assert.equal(store.read().conversations.lin.length, 2);
  await service.continueChat('lin');
  assert.equal(h.modelRequests.length, 1);
  assert.equal(store.read().conversations.lin.at(-1).role, 'assistant');
  assert.deepEqual(main, [{ mes: '约好今晚去书店。', is_user: false }]);
  assert.ok(JSON.stringify(h.modelRequests[0].body.messages).includes('约好今晚去书店。'));
  assert.equal(h.persistedMetadata.pocketPhone.conversations.lin.length, 3);
});

test('continue saves originals and optional translations for several bubbles in one request', async () => {
  const { h, target, store, service } = await serviceHarness({ completion: { choices: [{ message: { content: '{"messages":[{"text":"在忙吗？"},{"text":"少し話したいことがある。","translation":"想和你说件事。"},{"text":"?"}]}' } }] } });
  await store.upsertContacts([{ id: 'lin', name: '林舟', language: '日语，附中文译文' }]);
  const before = h.metadataSaves;
  await service.continueChat('lin');
  const messages = store.read().conversations.lin;
  assert.deepEqual(messages.map(({ role, text, translation }) => ({ role, text, translation })), [
    { role: 'assistant', text: '在忙吗？', translation: undefined },
    { role: 'assistant', text: '少し話したいことがある。', translation: '想和你说件事。' },
    { role: 'assistant', text: '?', translation: undefined },
  ]);
  assert.deepEqual(createPhoneStore({ target }).read().conversations.lin, messages);
  assert.equal(store.read().contacts[0].language, '日语，附中文译文');
  const input = JSON.parse(h.modelRequests[0].body.messages.find(message => message.role === 'user').content);
  assert.equal(input.contact.language, '日语，附中文译文');
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(h.modelRequests.length, 1);
});

test('new SMS use story time while createdAt still records actual save order', async () => {
  const main = [{ is_user: false, mes: '<!-- QQJ-end | date=大陆历1686年10月4日 | weekday=周二 | time=22:15 -->' }];
  const { h, store, service } = await serviceHarness({ messages: main });
  await service.send('lin', '收到，晚点见。');
  const sent = store.read().conversations.lin[0];
  assert.equal(sent.timeLabel, '22:15');
  assert.equal(sent.storyDate, '大陆历1686年10月4日');
  assert.ok(Number.isFinite(Date.parse(sent.createdAt)));
  main.push({ is_user: false, mes: '<!-- SDC-end | date=大陆历1686年10月4日 | weekday=周二 | time=22:28 -->' });
  await service.continueChat('lin');
  assert.equal(store.read().conversations.lin.at(-1).timeLabel, '22:28');
  assert.equal(store.read().conversations.lin[0].timeLabel, '22:15', '不因剧情更新重写历史短信时间');
  assert.equal(h.modelRequests.length, 1, '读取时间不请求模型');
});

test('private chat supports quote replies, emoji reactions, edit, withdraw, favorite, forward, batch delete, poke, and inner thought', async () => {
  const { store, reader, service } = await serviceHarness({
    messages: [{ is_user: false, mes: '雨天在咖啡馆。<!-- SDC-end | date=2026-10-21 | time=15:00 -->' }],
    completion: { choices: [{ message: { content: '{"thought":"其实很想让他现在就过来陪我，但又不好意思直说。"}' } }] },
  });
  await store.saveContact('', { name: '周予', personality: '直率' });
  const zhouId = store.read().contacts.find(c => c.name === '周予').id;
  const group = await store.saveGroup('', { name: '周末小分队', memberIds: ['lin', zhouId], userIsMember: true });

  // 1. Send message & quote reply in private chat
  await service.send('lin', '你在咖啡馆吗？');
  const firstMsg = store.read().conversations.lin[0];
  await store.appendMessage('lin', {
    id: 'reply-from-lin',
    role: 'assistant',
    text: '在靠窗的位置。',
    timeLabel: '15:01',
    batch: firstMsg.batch,
  });
  await service.send('lin', '我马上到！', { replyToId: 'reply-from-lin' });
  const quotedMsg = store.read().conversations.lin[2];
  assert.equal(quotedMsg.replyToId, 'reply-from-lin');

  // 2. Emoji reactions & recentReactions
  await store.toggleMessageReaction('lin', 'reply-from-lin', '❤️');
  await store.toggleMessageReaction('lin', 'reply-from-lin', '🥰');
  assert.deepEqual(store.read().conversations.lin[1].reactions, ['❤️', '🥰']);
  assert.deepEqual(store.read().recentReactions.slice(0, 2), ['🥰', '❤️']);
  await store.toggleMessageReaction('lin', 'reply-from-lin', '❤️');
  assert.deepEqual(store.read().conversations.lin[1].reactions, ['🥰']);

  // 3. Edit message
  await store.editMessage('lin', firstMsg.id, '你在街角那家咖啡馆吗？');
  const editedMsg = store.read().conversations.lin[0];
  assert.equal(editedMsg.text, '你在街角那家咖啡馆吗？');
  assert.ok(editedMsg.editedAt);

  // 4. Favorite & batch favorite
  await store.toggleFavoriteMessage('lin', 'reply-from-lin');
  assert.equal(store.read().conversations.lin[1].favorite, true);
  await store.favoriteMessages('lin', [firstMsg.id, quotedMsg.id], true);
  assert.equal(store.read().conversations.lin[0].favorite, true);
  assert.equal(store.read().conversations.lin[2].favorite, true);

  // 5. Generate character inner thought
  const thought = await service.generateThought('lin', 'reply-from-lin');
  assert.equal(thought, '其实很想让他现在就过来陪我，但又不好意思直说。');
  assert.equal(store.read().conversations.lin[1].thought, thought);

  // 6. Forward messages to another contact and group with note
  await store.forwardMessages('lin', [firstMsg.id, 'reply-from-lin'], zhouId, firstMsg.batch, '给你看看');
  const zhouThread = store.read().conversations[zhouId];
  assert.equal(zhouThread.length, 3);
  assert.equal(zhouThread[0].forwarded, true);
  assert.equal(zhouThread[0].forwardedFrom.senderName, '我');
  assert.equal(zhouThread[1].forwarded, true);
  assert.equal(zhouThread[1].forwardedFrom.senderName, '林舟');
  assert.equal(zhouThread[2].text, '给你看看');
  const zhouCtx = await reader.readForContact(zhouId);
  assert.match(zhouCtx.history[1].text, /\[用户转发的聊天记录｜原发言人：林舟\] 在靠窗的位置。/);

  await store.forwardMessages('lin', ['reply-from-lin'], group.id, firstMsg.batch);
  assert.equal(store.read().conversations[group.id][0].speakerId, '@user');
  assert.equal(store.read().conversations[group.id][0].forwarded, true);
  assert.equal(store.read().conversations[group.id][0].forwardedFrom.senderName, '林舟');

  // 7. Poke card message
  await service.sendCard('lin', {
    type: 'poke',
    poke: { actorId: '@user', actorName: '你', targetId: 'lin', targetName: '林舟', suffix: '的头像' },
  });
  const pokeMsg = store.read().conversations.lin.at(-1);
  assert.equal(pokeMsg.type, 'poke');
  assert.equal(pokeMsg.text, '[拍一拍：你拍了拍林舟的头像]');

  // 8. Withdraw message & verify context projection
  await store.withdrawMessage('lin', quotedMsg.id);
  const withdrawnMsg = store.read().conversations.lin[2];
  assert.equal(withdrawnMsg.withdrawn, true);
  assert.equal(withdrawnMsg.withdrawnText, '我马上到！');
  assert.equal(withdrawnMsg.text, '[消息已撤回]');

  const ctx = await reader.readForContact('lin');
  assert.equal(ctx.history[0].edited, true);
  assert.deepEqual(ctx.history[1].reactions, ['🥰']);
  assert.equal(ctx.history[2].withdrawn, true);

  // 9. Render chat UI with reaction bar, thought card, poke notice, and withdrawn re-edit button
  const chatHtml = renderChat(store.read(), {
    ui: {
      view: 'chat',
      contactId: 'lin',
      defaultUser: '我',
      batch: firstMsg.batch,
      visibleMessages: 60,
      visibleHistory: 60,
      drafts: new Map(),
      selectedMessage: 'reply-from-lin',
      thoughtMessageId: 'reply-from-lin',
    },
    busy: new Set(),
  });
  assert.ok(chatHtml.includes('message-reaction-bar'));
  assert.ok(chatHtml.includes('chat-avatar-thought'));
  assert.ok(chatHtml.includes('其实很想让他现在就过来陪我'));
  assert.ok(chatHtml.includes('withdrawn-reedit-btn'));
  assert.ok(chatHtml.includes('poke-notice'));

  // 10. Batch delete messages
  await store.deleteMessages('lin', [firstMsg.id, pokeMsg.id]);
  assert.equal(store.read().conversations.lin.length, 2);
});

test('AI can proactively quote, forward, instant-withdraw, poke, and perform messageActions (react, edit, withdraw)', async () => {
  let prevAssistantId = '';
  let userMsgId = '';
  const { store, service } = await serviceHarness({
    messages: [{ is_user: false, mes: '<!-- SDC-end | date=2026-10-21 | time=16:00 -->' }],
    completion: () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            messages: [
              { text: '其实是想约你周末单独出去的', withdrawn: true, thought: '太直接了，先撤回换个说法' },
              { text: '刚刚手滑发错了，这周末有空吗？', replyToId: userMsgId },
              { text: '周予刚跟我说今天店里上新了甜品', forwarded: true, forwardedFrom: { senderName: '周予' } },
              { type: 'poke', poke: { suffix: '的小脑袋' } },
            ],
            messageActions: [
              { action: 'react', messageId: userMsgId, emoji: '❤️' },
              { action: 'edit', messageId: prevAssistantId, text: '我刚到书店二楼靠窗位了' },
            ],
          }),
        },
      }],
    }),
  });

  await store.appendMessage('lin', {
    id: 'ai-prev-1',
    role: 'assistant',
    text: '我刚到书店一楼了',
    timeLabel: '15:55',
    batch: 0,
  });
  prevAssistantId = 'ai-prev-1';

  await service.send('lin', '那我忙完手头的事就去找你');
  userMsgId = store.read().conversations.lin[1].id;

  await service.continueChat('lin');
  const thread = store.read().conversations.lin;
  assert.equal(thread.length, 6);

  // Check messageActions applied to existing messages
  assert.equal(thread[0].text, '我刚到书店二楼靠窗位了');
  assert.ok(thread[0].editedAt);
  assert.deepEqual(thread[1].reactions, ['❤️']);

  // Check proactive instant-withdrawn message
  assert.equal(thread[2].withdrawn, true);
  assert.equal(thread[2].text, '[消息已撤回]');
  assert.equal(thread[2].withdrawnText, '其实是想约你周末单独出去的');
  assert.equal(thread[2].thought, '太直接了，先撤回换个说法');

  // Check proactive quote reply
  assert.equal(thread[3].replyToId, userMsgId);
  assert.equal(thread[3].text, '刚刚手滑发错了，这周末有空吗？');

  // Check proactive forward
  assert.equal(thread[4].forwarded, true);
  assert.equal(thread[4].forwardedFrom.senderName, '周予');

  // Check proactive poke
  assert.equal(thread[5].type, 'poke');
  assert.equal(thread[5].poke.actorName, '林舟');
  assert.equal(thread[5].poke.suffix, '的小脑袋');
  assert.equal(thread[5].text, '[拍一拍：林舟拍了拍你的小脑袋]');
});

test('renderChat: quote preview truncates to first line preview and supports jump location', async () => {
  const { store } = await serviceHarness();
  const batch = { key: 'test', label: '测试' };
  const longOriginal = {
    id: 'orig-1',
    role: 'assistant',
    batch,
    text: '这是一条很长很长的第一行内容超过二十个字测试消息\n第二行额外剧情\n第三行',
    createdAt: new Date().toISOString(),
  };
  const replyingMsg = {
    id: 'reply-1',
    role: 'user',
    batch,
    text: '好的我知道了',
    replyToId: 'orig-1',
    createdAt: new Date().toISOString(),
  };
  await store.appendMessage('lin', longOriginal);
  await store.appendMessage('lin', replyingMsg);

  const state = store.read();
  const html = renderChat(state, {
    ui: { view: 'chat', contactId: 'lin', drafts: new Map(), batch, visibleMessages: 60, visibleHistory: 60 },
    busy: new Set(),
    entries: {},
  });

  // 1. 验证支持跳转定位的属性
  assert.ok(html.includes('data-action="locate-reply-message"'));
  assert.ok(html.includes('data-target-id="orig-1"'));
  assert.ok(html.includes('data-message-row-id="orig-1"'));

  // 2. 验证引用文本节约空间：仅截取第一行前20字 + 省略号，不包含第二行
  const replyMatch = html.match(/<div class="message-reply[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(replyMatch, '应包含 message-reply 引用预览元素');
  assert.ok(replyMatch[1].includes('这是一条很长很长的第一行内容超过二十个字…'));
  assert.ok(!replyMatch[1].includes('第二行额外剧情'), '引用预览不应显示多余行数内容');
});

test('native chain-of-thought: extracts reasoning from model and renders collapsible indicator above message', async () => {
  // 1. extractReasoning 单元测试
  assert.equal(extractReasoning('<think>分析用户的意图...</think>\n{"messages":[{"text":"你好"}]}'), '分析用户的意图...');
  assert.equal(extractReasoning('<thought>深层思考...</thought>\n{}'), '深层思考...');
  assert.equal(extractReasoning('没有思考标签'), '');

  // 2. 模拟包含 reasoning_content 的接口返回
  const thinkingCoT = '用户刚刚问了晚餐的事情。我应该回复一个轻松的问候。';
  const replyJson = JSON.stringify({ messages: [{ text: '好啊，那我们去吃拉面吧。' }] });
  const { h, store, service } = await serviceHarness({
    completion: {
      choices: [
        {
          message: {
            reasoning_content: thinkingCoT,
            content: replyJson,
          },
        },
      ],
    },
  });

  await service.send('lin', '晚上吃什么？');
  await service.continueChat('lin');

  const thread = store.read().conversations.lin;
  const assistantMsg = thread.find(m => m.role === 'assistant');
  assert.ok(assistantMsg, '应保存对方回复消息');
  assert.equal(assistantMsg.text, '好啊，那我们去吃拉面吧。');
  assert.equal(assistantMsg.reasoning, thinkingCoT, '消息对象应记录原生思考过程');

  // 3. UI 渲染验证：折叠状态显示“思考过程”小字按钮
  const state = store.read();
  const collapsedHtml = renderChat(state, {
    ui: { view: 'chat', contactId: 'lin', drafts: new Map(), batch: assistantMsg.batch, visibleMessages: 60, visibleHistory: 60, openReasoningIds: new Set() },
    busy: new Set(),
    entries: {},
  });
  assert.ok(collapsedHtml.includes('class="message-reasoning-wrap"'), '应渲染思考过程包装容器');
  assert.ok(collapsedHtml.includes('data-action="toggle-reasoning"'), '应具备展开/折叠交互行为');
  assert.ok(collapsedHtml.includes('思考过程'), '应显示思考过程提示');
  assert.ok(!collapsedHtml.includes('message-reasoning-card'), '折叠时默认不展开完整内容');

  // 4. UI 渲染验证：展开状态显示完整思考内容
  const expandedHtml = renderChat(state, {
    ui: { view: 'chat', contactId: 'lin', drafts: new Map(), batch: assistantMsg.batch, visibleMessages: 60, visibleHistory: 60, openReasoningIds: new Set([assistantMsg.id]) },
    busy: new Set(),
    entries: {},
  });
  assert.ok(expandedHtml.includes('class="message-reasoning-card"'), '展开时应渲染思考卡片');
  assert.ok(expandedHtml.includes(thinkingCoT), '展开时应显示模型原生思考过程文本');
});


