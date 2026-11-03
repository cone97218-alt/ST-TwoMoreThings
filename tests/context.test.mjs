import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader, createBackflowService } from '../src/context.js';

test('剧情正文副本共用包裹规则，短信自身文本和原始时间楼保持原样', async () => {
  const raw = '[[<content>草稿</content>]]<content>正式正文</content><!-- SDC-end | date=2026-10-18 | time=15:30 -->';
  const h = createHarness({ messages: [{ is_user: false, mes: raw }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '[DRAFT]短信自身文字[/DRAFT]', batch: { key: '[-1,"2026-10-18","15:30"]' } }] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => ({ keepTags: 'content', extraTags: '[[...]]' }) });
  const context = await reader.readForContact('lin');
  assert.equal(context.story[0].text, '正式正文');
  assert.equal(context.storyProgress.messages[0].text, '正式正文');
  assert.match(JSON.stringify(context.previousMessages), /短信自身文字/);
  assert.equal(target.messages[0].mes, raw);
  assert.match(context.batch.key, /2026-10-18/);
});

test('进展范围只考察原24条候选，清空不回找旧楼且净文字计量', async () => {
  const messages = [{ is_user: false, mes: '<content>不应回找的旧楼</content>' },
    ...Array.from({ length: 24 }, () => ({ is_user: false, mes: '[[草稿]]' }))];
  messages.at(-1).mes += '<!-- SDC-end | date=2026-10-18 | time=15:30 -->';
  const h = createHarness({ messages, metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '约定', batch: { key: '[-1,"2026-10-18","15:30"]' } }] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => ({ keepTags: 'content', extraTags: '[[...]]' }) });
  const result = await reader.readForContact('lin');
  assert.deepEqual(result.storyProgress.messages, []);
  assert.equal(result.storyProgress.complete, false);
});

test('进展16000字预算计算净正文，保留来源时间且后续读取新共享值', async () => {
  const messages = [
    { is_user: false, mes: `[[${'草'.repeat(20000)}]]<content>${'甲'.repeat(9000)}</content>` },
    { is_user: false, mes: `<content>${'乙'.repeat(9000)}</content><!-- QQJ-end | date=2026-10-18 | time=15:30 -->` },
  ];
  const h = createHarness({ messages, metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'sms', role: 'assistant', text: '约定', batch: { key: '[-1,"2026-10-18","15:30"]' } }] } } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  let wrappers = { keepTags: 'content', extraTags: '[[...]]' };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null, wrapperSettingsProvider: () => wrappers });
  const result = await reader.readForContact('lin');
  assert.deepEqual(result.storyProgress.messages.map(row => row.text), ['甲'.repeat(7000), '乙'.repeat(9000)]);
  assert.equal(result.storyProgress.complete, false);
  assert.equal(result.clock.time, '15:30');
  wrappers = { keepTags: '', extraTags: '' };
  assert.deepEqual((await reader.readForForum()).storyBackground, []);
  assert.deepEqual(target.messages, messages);
});

test('SMS continuity retains recent prior batches and scopes proactive references to their own contact', async () => {
  const h = createHarness({ messages: [
    { is_user: false, mes: '午后休假。<!-- SDC-end | date=2026-10-18 | time=15:30 -->' },
    { is_user: true, mes: '继续。' },
    { is_user: false, mes: '傍晚还在休息。<!-- SDC-end | date=2026-10-18 | time=17:30 -->' },
  ], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'other', name: '旁人' }], groups: [],
    conversations: {
      lin: [{ id: 'agreement', role: 'assistant', text: '这三天不安排工作，周二晚七点书店见。', translation: 'No work for three days.',
        storyDate: '2026-10-18', timeLabel: '15:30', batch: { key: '[0,"2026-10-18","15:30"]' } }],
      zhou: [{ role: 'user', text: '周予的私信，只给周予。', batch: { key: 'older' } }],
      other: [{ role: 'user', text: '未入选人物的私信。', batch: { key: 'older' } }],
    }, social: { posts: [], npcs: [], feedIds: [] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const before = structuredClone(target.metadata);
  const contact = await reader.readForContact('lin');
  assert.deepEqual(contact.history, [], 'current batch still means current batch');
  assert.equal(contact.previousMessages[0].text, '这三天不安排工作，周二晚七点书店见。');
  assert.equal(contact.previousMessages[0].translation, 'No work for three days.');
  assert.equal(contact.previousMessages[0].time, '2026-10-18 15:30');
  const authors = store.read().contacts.slice(0, 2).map(person => ({ ...person, kind: 'contact' }));
  const plain = await reader.readForSocial(authors);
  assert.equal(JSON.stringify(plain).includes('这三天不安排工作'), false, 'public-only source reads do not request private threads');
  const proactive = await reader.readForSocial(authors, { includePrivateMessages: true });
  assert.equal(proactive.authors[0].privateHistory[0].text, '这三天不安排工作，周二晚七点书店见。');
  assert.equal(proactive.authors[1].privateHistory[0].text, '周予的私信，只给周予。');
  assert.equal(JSON.stringify(proactive.authors[0]).includes('周予的私信'), false);
  assert.equal(JSON.stringify(proactive).includes('未入选人物的私信'), false);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.modelRequests.length, 0);
});

test('SMS receives saved public feed posts across story floors without image files, private sources or another model', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '新一楼。' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, groups: [], social: { npcs: [], feedIds: ['post'], posts: [
      { id: 'post', authorId: 'lin', text: 'The bookshop is open.', translation: '书店开门了。', publishedAt: '2026-10-18 18:00',
        batch: { key: 'earlier-floor' }, image: { description: '书店窗边', path: '/private/full-image.png' },
        comments: [{ name: '小满', text: 'See you there.', translation: '那里见。' }] },
      { id: 'older', authorId: 'lin', text: '不把整份人物历史带入。', publishedAt: '2026-09-01 18:00' },
    ] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const before = structuredClone(target.metadata);
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  for (const context of [await reader.readForContact('lin'), await (async () => {
    await store.saveGroup('', { name: '读书群', memberIds: ['lin'], userIsMember: true });
    return reader.readForGroup(store.read().groups[0].id);
  })()]) {
    assert.equal(context.social.length, 1);
    assert.deepEqual(context.social[0], { author: '林舟', text: 'The bookshop is open.', translation: '书店开门了。', publishedAt: '2026-10-18 18:00',
      image: { description: '书店窗边' }, comments: [{ name: '小满', text: 'See you there.', translation: '那里见。' }] });
    assert.ok(!JSON.stringify(context.social).includes('/private/'));
    assert.ok(!JSON.stringify(context.social).includes('整份人物历史'));
  }
  assert.deepEqual(target.metadata.pocketPhone.social, before.pocketPhone.social);
  assert.equal(h.modelRequests.length, 0);
});

test('forum receives one story background and setting without user identity or private recall', async () => {
  const latest = '周予经过广场。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->';
  const h = createHarness({ messages: [
    { is_user: false, mes: '上一楼，不作为论坛背景。' },
    { is_user: false, name: '叙述', mes: latest },
    { is_user: true, mes: '随后用户的私下发言。' },
  ], metadata: { foreign: { keep: true } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveUserProfile({ name: '用户私有姓名', nickname: '用户私有网名' });
  await store.upsertContacts([{ id: 'lin', name: '林舟', source: { kind: 'qqj', entityId: 'q1' } }]);
  await store.appendMessage('lin', { id: 'private-sms', role: 'user', text: '短信私有内容' });
  const scans = [], readWorldInfo = target.readWorldInfo;
  target.readWorldInfo = options => { scans.push(options); return readWorldInfo(options); };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => { throw new Error('论坛不应访问人物记忆'); } });
  const before = structuredClone(target.metadata), saves = h.metadataSaves;
  const context = await reader.readForForum();
  assert.deepEqual(Object.keys(context).sort(), ['clock', 'setting', 'storyBackground', 'worldbook']);
  assert.deepEqual(context.storyBackground, [{ speaker: '叙述', text: '周予经过广场。' }]);
  assert.ok(context.setting.includes(target.character.description));
  assert.equal(context.clock.time, '18:00');
  assert.deepEqual(scans, [{ scanText: '周予经过广场。' }], 'worldbook activation uses the actual latest AI narrative copy');
  const serialized = JSON.stringify(context);
  for (const privateText of ['用户私有姓名', '用户私有网名', '短信私有内容', '随后用户的私下发言', '上一楼']) assert.equal(serialized.includes(privateText), false);
  assert.deepEqual(target.metadata, before);
  assert.equal(h.metadataSaves, saves);
  assert.equal(h.modelRequests.length, 0);
});

test('reads one AI floor and the complete current batch without removing saved history', async () => {
  const history = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: `短信${i}`, batch: { key: i < 800 ? 'older' : '[999]', label: '时间卡口' }, createdAt: new Date(2026, 9, 1, 0, i).toISOString() }));
  const h = createHarness({ messages: Array.from({ length: 1000 }, (_, i) => ({ mes: `剧情${i}`, is_user: false })), metadata: { pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟' }], conversations: { lin: history }, forum: { posts: [] }, injectEnabled: false } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const reader = createContextReader({ target, store });
  const context = await reader.readForContact('lin');
  assert.equal(context.history.length, 200);
  assert.equal(context.history[0].text, '短信800');
  assert.equal(context.previousMessages.length, 20);
  assert.equal(context.previousMessages[0].text, '短信780', 'prior context is a bounded tail, without duplicating the current batch');
  assert.equal(context.story.length, 1);
  assert.equal(context.story[0].text, '剧情999');
  assert.equal(store.read().conversations.lin.length, 1000);
  assert.equal(await createBackflowService({ target, store, modelClient: { complete() { throw Error('关闭回流时不请求摘要'); } } }).prepare(), '');
});

test('forum context excludes private SMS and QQJ author-side background', async () => {
  const h = createHarness();
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', source: { kind: 'qqj', entityId: 'q1' } }]);
  await store.appendMessage('lin', { text: '私聊密码', role: 'user' });
  const bridge = { getStatus: () => ({ status: 'ready' }), readContext: () => ({ status: 'ready', routerText: '作者侧秘密', actors: [{ entityId: 'q1', memoryText: '林舟的相关记忆' }] }) };
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => bridge });
  assert.equal((await reader.readForContact('lin')).related, '林舟的相关记忆');
  const forum = await reader.readForForum();
  assert.ok(!JSON.stringify(forum).includes('私聊密码'));
  assert.ok(!JSON.stringify(forum).includes('作者侧秘密'));
});


test('confirmed todos carry actual knowledge and subsequent story progress, not private facts to every related person', async () => {
  const h = createHarness({ messages: [
    { is_user: false, mes: '上午约好还书。<!-- SDC-end | date=2026-10-18 | time=10:00 -->' },
    { is_user: true, mes: '我把书交还给他。' },
    { is_user: false, mes: '林舟收好归还的书。<!-- SDC-end | date=2026-10-18 | time=12:00 -->' },
    { is_user: false, mes: '晚些时候聊起别的事。<!-- SDC-end | date=2026-10-18 | time=18:00 -->' },
  ], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], conversations: {}, groups: [{ id: 'g', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }],
    todos: [{ id: 't1', status: 'open', title: '替周予还书', startAt: '2026-10-18 12:00', endAt: '', participantIds: ['@user', 'zhou'], knownToIds: ['@user', 'lin'], sourceConversationId: 'lin', sourceMessageIds: ['m1'], sourceBatch: { key: '[0,"2026-10-18","10:00"]' } }],
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), before = structuredClone(target.metadata);
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  const lin = await reader.readForContact('lin');
  assert.equal(lin.todos[0].title, '替周予还书');
  assert.ok(JSON.stringify(lin.storyProgress).includes('收好归还的书'), 'not just the most recent floor');
  assert.equal(lin.storyProgress.complete, true);
  assert.equal((await reader.readForContact('zhou')).todos.length, 0, 'being related to an event does not mean knowing a private arrangement');
  const group = await reader.readForGroup('g');
  assert.equal(group.todos[0].id, 't1');
  assert.deepEqual(group.todos[0].knownToIds, ['@user', 'lin']);
  const authors = store.read().contacts.map(person => ({ ...person, kind: 'contact' }));
  const social = await reader.readForSocial(authors, { includePrivateMessages: true });
  assert.equal(social.authors[0].todos.length, 1);
  assert.equal(social.authors[1].todos.length, 0);
  const publicOnly = await reader.readForSocial(authors);
  assert.ok(!JSON.stringify(publicOnly).includes('替周予还书'));
  assert.deepEqual(target.metadata, before);
  assert.equal(h.modelRequests.length, 0);
});

test('group continuation scopes recent private threads to the members who actually participated', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '约定之后事情已经办完。' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }, { id: 'other', name: '旁人' }],
    groups: [{ id: 'g', name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true }], conversations: {
      lin: [{ id: 'l', role: 'assistant', text: '我明天把书带给你。', batch: { key: '[-1]' } }],
      zhou: [{ id: 'z', role: 'user', text: '只同周予说过的话。', batch: { key: '[-1]' } }],
      other: [{ id: 'o', role: 'assistant', text: '群外人物私信不提供。' }],
    },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const context = await createContextReader({ target, store, qqjBridgeProvider: () => null }).readForGroup('g');
  assert.deepEqual(context.privateHistories.map(thread => thread.knownToIds), [['@user', 'lin'], ['@user', 'zhou']]);
  assert.equal(context.privateHistories[0].messages[0].text, '我明天把书带给你。');
  assert.ok(!JSON.stringify(context).includes('群外人物私信不提供'));
  assert.ok(JSON.stringify(context.storyProgress).includes('事情已经办完'));
  assert.equal(h.modelRequests.length, 0);
});

test('partially deleted todo sources are reported as incomplete without deleting the retained todo', async () => {
  const h = createHarness({ metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }], groups: [], conversations: { lin: [{ id: 'remaining', text: '后一句' }] },
    todos: [{ id: 't', title: '约定', status: 'open', participantIds: ['@user', 'lin'], knownToIds: ['@user', 'lin'], sourceConversationId: 'lin', sourceMessageIds: ['deleted', 'remaining'] }],
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const context = await createContextReader({ target, store, qqjBridgeProvider: () => null }).readForContact('lin');
  assert.equal(context.todos[0].source.missing, true);
  assert.equal(store.read().todos.length, 1);
});

test('social in chat switches: independently toggle social context perception in contact and group chat', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '新一楼。' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, groups: [], social: { npcs: [], feedIds: ['post'], posts: [
      { id: 'post', authorId: 'lin', text: '公开动态。', publishedAt: '2026-10-18 18:00' },
    ] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveGroup('', { name: '读书群', memberIds: ['lin'], userIsMember: true });
  const groupId = store.read().groups[0].id;
  const reader = createContextReader({ target, store, qqjBridgeProvider: () => null });

  const contactCtx1 = await reader.readForContact('lin');
  const groupCtx1 = await reader.readForGroup(groupId);
  assert.equal(contactCtx1.social?.length, 1);
  assert.equal(groupCtx1.social?.length, 1);

  await store.setContactSocialEnabled(false);
  const contactCtx2 = await reader.readForContact('lin');
  const groupCtx2 = await reader.readForGroup(groupId);
  assert.equal(contactCtx2.social, undefined);
  assert.equal(groupCtx2.social?.length, 1);

  await store.setGroupSocialEnabled(false);
  const contactCtx3 = await reader.readForContact('lin');
  const groupCtx3 = await reader.readForGroup(groupId);
  assert.equal(contactCtx3.social, undefined);
  assert.equal(groupCtx3.social, undefined);

  await store.setContactSocialEnabled(true);
  const contactCtx4 = await reader.readForContact('lin');
  const groupCtx4 = await reader.readForGroup(groupId);
  assert.equal(contactCtx4.social?.length, 1);
  assert.equal(groupCtx4.social, undefined);
});

