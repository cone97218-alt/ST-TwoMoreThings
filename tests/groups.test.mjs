import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { readTimeline } from '../src/timeline.js';

async function setup(reply, hostKind = 'native') {
  const h = createHarness({ hostKind, messages: [{ is_user: false, mes: '<!-- QQJ-end | date=2026年10月4日 | weekday=周日 | time=22:15 -->' }], settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } }, completion: { choices: [{ message: { content: JSON.stringify(reply) } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', expression: '短句不用句号' }, { id: 'zhou', name: '周予', expression: '熟人间调侃', language: '日语，附中文译文' }, { id: 'xu', name: '许知' }]);
  assert.equal(typeof store.saveGroup, 'function', '应能保存当前聊天内的群聊');
  const { createGroupService } = await import('../src/groups.js');
  const { createContextReader } = await import('../src/context.js');
  const { createApiSettings, createModelClient } = await import('../src/api.js');
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const service = createGroupService({ target, store, contextReader: reader, modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  return { h, store, service };
}

for (const kind of ['native', 'luker']) test(`${kind}: observer group generates several speakers in one request and preserves identity/time`, async () => {
  const { h, store, service } = await setup({ anchor: { memberIds: ['lin', 'zhou', 'xu'], speakerIds: ['lin', 'zhou'] }, messages: [{ speakerId: 'lin', text: '周予，你到哪了？' }, { speakerId: 'zhou', text: '向かってる。', translation: '在路上。' }, { speakerId: 'lin', text: '👌' }] }, kind);
  const group = await store.saveGroup('', { name: '晚饭', avatar: 'https://example.invalid/group.png', memberIds: ['lin', 'zhou', 'xu'], userIsMember: false });
  assert.equal(store.read().groups[0].avatar, 'https://example.invalid/group.png');
  await assert.rejects(service.send(group.id, '旁观者不能代发'), /不在这个群/);
  const before = h.metadataSaves;
  await service.continueChat(group.id);
  assert.equal(h.modelRequests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  const history = store.read().conversations[group.id];
  assert.deepEqual(history.map(x => x.speakerId), ['lin', 'zhou', 'lin']);
  assert.deepEqual(history.map(x => x.text), ['周予，你到哪了？', '向かってる。', '👌']);
  assert.equal(history[1].translation, '在路上。');
  assert.equal('translation' in history[0], false);
  assert.equal('translation' in history[2], false);
  assert.equal(history[0].timeLabel, '22:15');
  assert.ok(Date.parse(history[0].createdAt));
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(JSON.stringify(input).includes('https://example.invalid/group.png'), false, '群头像仅用于显示，不送模型');
  assert.deepEqual(input.group.members.map(x => x.id), ['lin', 'zhou', 'xu']);
  assert.equal(input.group.members[0].expression, '短句不用句号');
  assert.equal(input.group.members[1].language, '日语，附中文译文');
  assert.equal(store.read().contacts.find(person => person.id === 'zhou').language, '日语，附中文译文');
  await store.deleteMessage(group.id, history[0].id);
  assert.equal(store.read().conversations[group.id].length, 2);
  await store.clearConversation(group.id, readTimeline(h.context.chat));
  assert.deepEqual(store.read().conversations[group.id], []);
});

test('group avatar can be edited and removed without altering its members or messages', async () => {
  const { h, store } = await setup({});
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.appendMessage(group.id, { id: 'hello', role: 'user', text: '到了' });
  const edited = await store.saveGroup(group.id, { ...group, avatar: 'https://example.invalid/friends.png' });
  assert.equal(edited.avatar, 'https://example.invalid/friends.png');
  const before = h.metadataSaves;
  await assert.rejects(store.saveGroup(group.id, { ...edited, avatar: 'javascript:alert(1)' }), /头像地址/);
  assert.equal(h.metadataSaves, before);
  assert.equal(store.read().groups[0].avatar, edited.avatar);
  await store.saveGroup(group.id, { ...edited, avatar: '' });
  assert.equal(store.read().groups[0].avatar, '');
  assert.deepEqual(store.read().groups[0].memberIds, ['lin', 'zhou']);
  assert.equal(store.read().conversations[group.id][0].text, '到了');
});

test('group permits silence, rejects unanchored outsiders, and does not save rejected messages', async () => {
  const { h, store, service } = await setup({ anchor: { memberIds: ['lin', 'zhou'], speakerIds: [] }, messages: [] });
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: false });
  assert.deepEqual(await service.continueChat(group.id), []);
  h.completion = { choices: [{ message: { content: JSON.stringify({ anchor: { memberIds: ['lin', 'zhou'], speakerIds: ['xu'] }, messages: [{ speakerId: 'xu', text: '不属于此群' }] }) } }] };
  await assert.rejects(service.continueChat(group.id), /群成员|发言者/);
  assert.equal(store.read().conversations[group.id]?.length || 0, 0);
});


test('group chain-of-thought: extracts reasoning from model and renders collapsible indicator in group chat', async () => {
  const thinkingCoT = '分析群聊气氛与各成员性格，林舟比较主动，周予习惯附和。';
  const groupReply = {
    anchor: { memberIds: ['lin', 'zhou'], speakerIds: ['lin', 'zhou'] },
    messages: [
      { speakerId: 'lin', text: '大家明天有空吗？' },
      { speakerId: 'zhou', text: '我有空。' },
    ],
  };
  const { h, store, service } = await setup(groupReply);
  h.completion = {
    choices: [
      {
        message: {
          reasoning_content: thinkingCoT,
          content: JSON.stringify(groupReply),
        },
      },
    ],
  };
  const group = await store.saveGroup('', { name: '小分队', memberIds: ['lin', 'zhou'], userIsMember: false });
  await service.continueChat(group.id);

  const history = store.read().conversations[group.id];
  assert.equal(history.length, 2);
  assert.equal(history[0].reasoning, thinkingCoT, '群聊本轮第一条消息应保存思考过程');
  assert.equal(history[1].reasoning, undefined, '群聊本轮后续消息不重复附带思考过程');

  const { renderChat } = await import('../src/ui/messages.js');
  const state = store.read();
  const collapsedHtml = renderChat(state, {
    ui: { view: 'group-chat', groupId: group.id, drafts: new Map(), batch: history[0].batch, visibleMessages: 60, visibleHistory: 60, openReasoningIds: new Set() },
    busy: new Set(),
    entries: {},
  });
  assert.ok(collapsedHtml.includes('class="message-reasoning-wrap"'), '群聊应渲染思考过程包装容器');
  assert.ok(collapsedHtml.includes('data-action="toggle-reasoning"'), '群聊应具备展开/折叠交互行为');
  assert.ok(collapsedHtml.includes('思考过程'), '群聊应显示思考过程提示');
  assert.ok(!collapsedHtml.includes('message-reasoning-card'), '群聊折叠时默认不展开完整内容');

  const expandedHtml = renderChat(state, {
    ui: { view: 'group-chat', groupId: group.id, drafts: new Map(), batch: history[0].batch, visibleMessages: 60, visibleHistory: 60, openReasoningIds: new Set([history[0].id]) },
    busy: new Set(),
    entries: {},
  });
  assert.ok(expandedHtml.includes('class="message-reasoning-card"'), '群聊展开时应渲染思考卡片');
  assert.ok(expandedHtml.includes(thinkingCoT), '群聊展开时应显示模型原生思考过程文本');
});
