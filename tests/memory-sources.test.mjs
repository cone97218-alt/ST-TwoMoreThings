import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySources } from '../src/memory-sources.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { createPhoneStore } from '../src/store.js';
import { createMessageService } from '../src/messages.js';
import { createGroupService } from '../src/groups.js';
import { createSocialService } from '../src/social.js';
import { createHarness } from './harness.mjs';

function setup() {
  const settings = { baibai_book: { enabled: true } };
  const h = createHarness({ settings, messages: [{ is_user: false, mes: '街上很安静。<bbs_end>2031/4/8 09:30</bbs_end>' }], metadata: { pocketPhone: {
    contacts: [{ id: 'a', name: '人物甲', source: { kind: 'qqj', entityId: 'qa' } }, { id: 'b', name: '人物乙', source: { kind: 'qqj', entityId: 'qb' } }],
    groups: [{ id: 'g', name: '朋友群', memberIds: ['a', 'b'], userIsMember: true }], conversations: {},
    social: { npcs: [], feedIds: ['post'], posts: [{ id: 'post', authorId: 'a', text: '早上好。', comments: [] }] },
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  let status = 'disabled', bbsReads = 0, qqjReads = 0;
  const nodes = [{ text: '过去的共同经历', timeLabel: '2031/4/7' }];
  const api = { apiVersion: 1, getInjectedHistory() { bbsReads++; return { nodes }; }, getHistory() { throw new Error('不能读取全档'); }, getSnapshot() { throw new Error('不能重放状态'); } };
  const bridge = { getStatus: () => ({ status }), async readContext(request) { qqjReads++; return { status: 'ready', actors: [{ entityId: 'qa', memoryText: '甲的私有记忆' }, { entityId: 'qb', memoryText: '乙的私有记忆' }, { entityId: 'other', memoryText: '其他人的记忆' }] }; } };
  const sources = createMemorySources({ target, settingsProvider: h.host.readSettings, qqjBridgeProvider: () => bridge, baiBaiBookProvider: () => api });
  const reader = createContextReader({ target, store, memorySources: sources, qqjBridgeProvider: () => bridge });
  return { h, settings, target, store, reader, sources, api, nodes, setStatus: value => { status = value; }, counts: () => ({ bbsReads, qqjReads }) };
}

test('live enabled status selects a single source; BBS history is read once and stays outside actor data', async () => {
  const s = setup();
  for (const read of [() => s.reader.readForContact('a'), () => s.reader.readForGroup('g'), () => s.reader.readForSocial(s.store.read().contacts)]) {
    const before = s.counts().bbsReads, context = await read();
    assert.equal(s.counts().bbsReads, before + 1);
    assert.equal(context.storyMemory, '【2031/4/7】过去的共同经历');
    assert.equal(context.related || '', '');
    assert.ok((context.group?.members || context.authors || []).every(person => !person.storyMemory && !person.related));
    assert.equal(JSON.stringify(context).split('过去的共同经历').length - 1, 1);
  }
  s.settings.baibai_book.enabled = false; s.setStatus('ready');
  const context = await s.reader.readForContact('a');
  assert.equal(context.related, '甲的私有记忆');
  assert.equal(context.storyMemory, undefined);
  assert.equal(JSON.stringify(context).includes('乙的私有记忆'), false);
  assert.equal(s.counts().qqjReads, 1);
  s.setStatus('disabled');
  assert.equal((await s.reader.readForContact('a')).related, '');
});

test('BBS selects bounded whole recent nodes and handles one oversized summary without copying full history', async () => {
  const s = setup();
  s.nodes.splice(0, s.nodes.length, { text: '甲'.repeat(1800) }, { text: '乙'.repeat(1800) }, { text: '丙'.repeat(1800) });
  const contact = await s.reader.readForContact('a'), group = await s.reader.readForGroup('g');
  assert.equal(contact.storyMemory, `${'乙'.repeat(1800)}\n\n${'丙'.repeat(1800)}`);
  assert.ok(group.storyMemory.length <= 6000);
  assert.equal(group.storyMemory.includes('甲'), true);
  s.nodes.splice(0, s.nodes.length, { text: '长'.repeat(15000) });
  assert.equal((await s.reader.readForContact('a')).storyMemory.length, 4000);
  assert.equal((await s.reader.readForSocial(s.store.read().contacts)).storyMemory.length, 6000);
  s.nodes.splice(0, s.nodes.length, { text: '现代节点', timeStart: '2031/4/7 08:00', timeEnd: '2031/4/7 09:00' });
  assert.equal((await s.reader.readForContact('a')).storyMemory, '【2031/4/7 08:00 → 2031/4/7 09:00】现代节点');
});

test('excluded BBS chats and disabled providers do not read history; groups do not use single-character exclusions', async () => {
  const s = setup();
  s.settings.baibai_book.excludedChars = [s.target.character.name];
  assert.equal((await s.reader.readForContact('a')).storyMemory, undefined);
  s.settings.baibai_exclude_settings = { excludedChars: [] };
  assert.ok((await s.reader.readForContact('a')).storyMemory);
  s.settings.baibai_exclude_settings.excludedChars = [s.target.character.name]; s.target.groupId = 'group';
  assert.ok((await s.reader.readForContact('a')).storyMemory);
});

test('normal empty summaries, missing API and actual read errors are distinct; forum and directory never read BBS', async () => {
  const s = setup();
  s.nodes.length = 0;
  assert.equal((await s.reader.readForContact('a')).storyMemory, undefined);
  s.api.getInjectedHistory = () => ({ text: '仍可读取的摘要' });
  assert.equal((await s.reader.readForContact('a')).storyMemory, '仍可读取的摘要');
  s.api.getInjectedHistory = () => { throw new Error('source failure'); };
  await assert.rejects(s.reader.readForContact('a'), /柏宝书记忆读取失败/);
  delete s.api.getInjectedHistory;
  await assert.rejects(s.reader.readForContact('a'), /柏宝书.*接口/);
  const before = s.counts();
  await s.reader.readForForum(); await s.reader.readDirectorySources();
  assert.deepEqual(s.counts(), before);
});

test('unloaded BBS with retained settings is inactive, while its loaded incompatible API reports an error', async () => {
  const s = setup(); s.setStatus('ready');
  const sources = createMemorySources({ target: s.target, settingsProvider: () => s.settings, qqjBridgeProvider: () => ({ getStatus: () => ({ status: 'ready' }) }), baiBaiBookProvider: () => undefined });
  assert.equal(sources.select().kind, 'qqj');
  s.setStatus('disabled'); s.api.apiVersion = 2;
  await assert.rejects(s.reader.readForContact('a'), /柏宝书.*接口/);
});

test('BBS story clock reaches generated SMS, batch storage and short main-story backflow without another model', async () => {
  const s = setup();
  const requests = [], modelClient = { async complete(request) { requests.push(request); return '{"messages":[{"text":"晚点书店见。"}]}'; } };
  const service = createMessageService({ target: s.target, store: s.store, contextReader: s.reader, modelClient });
  await service.continueChat('a');
  const input = JSON.parse(requests[0].messages[0].content), saved = s.store.read().conversations.a[0];
  assert.equal(input.storyMemory, undefined); assert.ok(requests[0].system.includes('【2031/4/7】过去的共同经历'));
  assert.match(requests[0].system, /storyMemory.*不代表每个人都知情/);
  assert.equal(input.story, undefined); assert.equal(requests[0].system.includes('09:30'), false, 'BBS endpoint content is stripped only from the narrative copy'); assert.ok(requests[0].system.includes('街上很安静。'));
  assert.deepEqual([saved.storyDate, saved.timeLabel, saved.storyWeekday], ['2031/4/8', '09:30', '']);
  assert.deepEqual(JSON.parse(saved.batch.key), [0, '2031/4/8', '09:30']);
  await s.store.setInjectionEnabled(true);
  const prompt = await createBackflowService({ target: s.target, store: s.store, modelClient }).prepare();
  assert.ok(!prompt.includes('时间：'));
  assert.ok(!prompt.includes('手机参考'));
  assert.match(prompt, /晚点书店见/);
  assert.equal(requests.length, 1);
  assert.equal(s.counts().bbsReads, 1);
});

test('a true dual-enabled conflict stops memory generation before saves or models but permits ordinary sends', async () => {
  const s = setup(); s.setStatus('not-ready');
  const modelClient = { complete() { throw new Error('不能请求模型'); } };
  const messages = createMessageService({ target: s.target, store: s.store, contextReader: s.reader, modelClient });
  const groups = createGroupService({ target: s.target, store: s.store, contextReader: s.reader, modelClient });
  const social = createSocialService({ store: s.store, contextReader: s.reader, modelClient });
  const before = JSON.stringify(s.target.metadata);
  for (const operation of [() => messages.continueChat('a'), () => groups.continueChat('g'), () => social.comment('post', '保留草稿'), () => social.refresh(), () => social.generateAuthor('a')]) {
    await assert.rejects(operation(), error => error.code === 'MEMORY_SOURCE_CONFLICT');
  }
  assert.equal(JSON.stringify(s.target.metadata), before);
  assert.equal(s.h.metadataSaves, 0);
  assert.deepEqual(s.counts(), { bbsReads: 0, qqjReads: 0 });
  await messages.send('a', '照常保存短信');
  await groups.send('g', '照常保存群聊');
  assert.equal(s.store.read().conversations.a[0].text, '照常保存短信');
  assert.equal(s.store.read().conversations.g[0].text, '照常保存群聊');
  assert.deepEqual(s.counts(), { bbsReads: 0, qqjReads: 0 });
  await s.reader.readForForum();
});
