import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createBackflowService, summaryCache } from '../src/context.js';
import { readTimeline } from '../src/timeline.js';

function setup(messages = [{ is_user: false, mes: '<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }], hostKind = 'native') {
  const h = createHarness({ hostKind, messages, metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], groups: [], conversations: {}, injectEnabled: true,
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), batch = readTimeline(target.messages);
  return { h, target, store, batch };
}
const client = (requests, summary = '用户与林舟约好还书。') => ({ complete(request) { requests.push(request); return JSON.stringify({ summary }); } });

for (const hostKind of ['native', 'luker']) test(`${hostKind}: normal and regenerate use the right SMS batch and exclude the replaced story from analysis`, async () => {
  const { h, target, store } = setup([
    { is_user: false, mes: '上午的安排。<!-- SDC-end | date=2027-03-19 | time=15:30 -->' },
    { is_user: true, mes: '继续剧情。' },
    { is_user: false, mes: '被替换的晚间结果。<!-- SDC-end | date=2027-03-19 | time=17:40 -->' },
  ], hostKind);
  await store.appendMessages('lin', [
    { id: 'before', role: 'user', text: '六点在书店见。', batch: { key: '[0,"2027-03-19","15:30"]' } },
    { id: 'after', role: 'user', text: '当前楼之后的短信。', batch: { key: '[2,"2027-03-19","17:40"]' } },
  ]);
  const before = structuredClone(store.read()), saves = h.metadataSaves;
  const service = createBackflowService({ target, store, modelClient: { complete() { assert.fail('short references must not add a model request'); } } });
  const normal = await service.prepare('normal');
  assert.ok(normal.includes('当前楼之后的短信。'));
  assert.ok(!normal.includes('六点在书店见。'));
  for (const type of ['regenerate', 'swipe']) {
    const result = await service.prepare(type);
    assert.ok(result.includes('六点在书店见。'));
    assert.ok(!result.includes('当前楼之后的短信'));
  }
  target.messages.at(-1).mes = '';
  assert.ok((await service.prepare('swipe')).includes('六点在书店见。'));
  target.messages.pop();
  assert.ok((await service.prepare('regenerate')).includes('六点在书店见。'));
  assert.deepEqual(store.read(), before);
  assert.equal(h.metadataSaves, saves);
});

test('short references let the main generation decide relevance without an extra API call or private file data', async () => {
  const { h, target, store, batch } = setup();
  const group = await store.saveGroup('', { name: '朋友', memberIds: ['lin', 'zhou'], userIsMember: true });
  const observer = await store.saveGroup('', { name: '旁观', memberIds: ['lin', 'zhou'], userIsMember: false });
  await store.appendMessages('lin', [
    { id: 'm1', role: 'assistant', text: 'See you at the café.', translation: '咖啡店见。', batch },
    { id: 'photo', role: 'assistant', type: 'image', image: { description: '窗边咖啡', path: '/private/image.png' }, batch },
    { id: 'old', role: 'user', text: '旧批次秘密', batch: { key: 'past' } },
  ]);
  await store.appendMessage(group.id, { id: 'location', role: 'assistant', speakerId: 'lin', type: 'location', location: { name: '咖啡店', address: '广场东侧' }, batch });
  await store.appendMessage(observer.id, { id: 'observer', role: 'assistant', speakerId: 'zhou', text: '旁观秘密', batch });
  const before = structuredClone(store.read()), saves = h.metadataSaves;
  const reference = await createBackflowService({ target, store, modelClient: { complete() { assert.fail('no additional analysis call for short SMS'); } } }).prepare();
  for (const text of ['See you', '咖啡店见', '窗边咖啡', '广场东侧', '林舟']) assert.ok(reference.includes(text));
  for (const text of ['/private/', '旧批次秘密', '旁观秘密']) assert.ok(!reference.includes(text));
  assert.deepEqual(store.read(), before);
  assert.equal(h.metadataSaves, saves);
});

const rawPrefix = '[私聊：林舟]\n我：';
for (const size of [2999, 3000, 3001]) test(`visible ${size}-character reference uses the existing short/long budget in one call`, async () => {
  const { target, store, batch } = setup();
  await store.appendMessage('lin', { id: 'boundary', role: 'user', text: '汉'.repeat(size - Array.from(rawPrefix).length), batch });
  const requests = [];
  await createBackflowService({ target, store, modelClient: client(requests) }).prepare();
  assert.equal(requests.length, size <= 3000 ? 0 : 1);
  if (size > 3000) assert.equal(JSON.parse(requests[0].messages[0].content).maxCharacters, 100);
});

test('the short budget counts emoji as Unicode characters and all current messages reach the same analysis', async () => {
  const { target, store, batch } = setup();
  const messages = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: (i % 2 ? '好的，到时书店见。' : '明天一起去书店见面吗？').repeat(2), batch }));
  await store.appendMessages('lin', messages);
  const requests = [];
  await createBackflowService({ target, store, modelClient: client(requests) }).prepare();
  assert.equal(JSON.parse(requests[0].messages[0].content).conversations[0].messages.length, 200);
  await store.clearConversation('lin', batch);
  await store.appendMessage('lin', { id: 'emoji', role: 'user', text: '🙂'.repeat(3000 - Array.from(rawPrefix).length), batch });
  const next = [];
  await createBackflowService({ target, store, modelClient: client(next) }).prepare();
  assert.equal(next.length, 0);
});

test('an uncompleted checkbox is not story evidence: analysis receives the intervening completed event and preserves distinct future events', async () => {
  const { h, target, store } = setup([
    { is_user: false, mes: '约好吃饭。<!-- SDC-end | date=2026-10-18 | time=10:00 -->' },
    { is_user: true, mes: '吃完离开餐厅。' },
    { is_user: false, mes: '[[草稿<content>未吃饭</content>]]<content>午饭已经吃完，餐费结清。</content><!-- SDC-end | date=2026-10-18 | time=13:00 -->' },
    { is_user: false, mes: '晚上聊书。<!-- SDC-end | date=2026-10-18 | time=19:00 -->' },
  ]);
  target.metadata.pocketPhone.todos = [
    { id: 'today', title: '吃饭', status: 'open', startAt: '2026-10-18 12:00', endAt: '', participantIds: ['@user', 'lin'], knownToIds: ['@user', 'lin'], sourceConversationId: 'lin', sourceMessageIds: ['old'], sourceBatch: { key: '[0,"2026-10-18","10:00"]' } },
    { id: 'tomorrow', title: '吃饭', status: 'open', startAt: '2026-10-19 12:00', endAt: '', participantIds: ['@user', 'zhou'], knownToIds: ['@user', 'zhou'], sourceConversationId: 'zhou', sourceMessageIds: ['old2'], sourceBatch: { key: '[0,"2026-10-18","10:00"]' } },
    { id: 'candidate', title: '未确认秘密', status: 'candidate', knownToIds: ['@user', 'lin'] },
  ];
  await store.appendMessage('lin', { id: 'long', role: 'user', text: '补充材料'.repeat(1000), batch: readTimeline(target.messages) });
  const before = structuredClone(store.read()), saves = h.metadataSaves, requests = [];
  const result = await createBackflowService({ target, store, wrapperSettingsProvider: () => ({ keepTags: 'content', extraTags: '[[...]]' }), modelClient: client(requests, '今天午饭已经结束；另有明日与周予的午饭约定，进展未明。') }).prepare();
  const input = JSON.parse(requests[0].messages[0].content);
  assert.equal(input.todos.length, 2);
  assert.equal(input.todos[0].status, 'open');
  assert.notEqual(input.todos[0].startAt, input.todos[1].startAt);
  assert.ok(JSON.stringify(input.storyProgress).includes('午饭已经吃完'));
  assert.ok(!JSON.stringify(input.storyProgress).includes('草稿'));
  assert.equal(input.storyProgress.complete, true);
  assert.ok(!JSON.stringify(input).includes('未确认秘密'));
  assert.ok(result.includes('今天午饭已经结束'));
  assert.deepEqual(store.read(), before, 'analysis never completes or edits a todo');
  assert.equal(h.metadataSaves, saves);
});

test('missing anchors and bounded story material are explicitly incomplete; later-created todos do not enter regeneration', async () => {
  const { target, store } = setup(Array.from({ length: 50 }, (_, i) => ({ is_user: false, mes: `正文${i}` })));
  const state = target.metadata.pocketPhone;
  state.todos = [{ id: 'old', title: '旧约定', status: 'open', participantIds: ['@user', 'lin'], knownToIds: ['@user', 'lin'], sourceMessageIds: [], sourceConversationId: 'lin' }];
  await store.appendMessage('lin', { id: 'long', role: 'user', text: '材料'.repeat(1600), batch: readTimeline(target.messages) });
  const requests = [];
  await createBackflowService({ target, store, modelClient: client(requests) }).prepare();
  const progress = JSON.parse(requests[0].messages[0].content).storyProgress;
  assert.equal(progress.complete, false);
  assert.equal(progress.messages.length, 24);
  await store.clearConversation('lin', readTimeline(target.messages));
  target.metadata.pocketPhone.todos[0].sourceBatch = { key: '[49]' };
  const noCall = { complete() { assert.fail('a todo from the replaced floor must not be included'); } };
  assert.equal(await createBackflowService({ target, store, modelClient: noCall }).prepare('regenerate'), '');
});

test('disabled, empty, malformed and over-budget references do not silently inject unfiltered SMS', async () => {
  const { target, store, batch } = setup();
  const noCall = { complete() { assert.fail('no model call without enabled material'); } };
  const service = createBackflowService({ target, store, modelClient: noCall });
  assert.equal(await service.prepare(), '');
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '约好明天见。'.repeat(700), batch });
  await store.setInjectionEnabled(false);
  assert.equal(await service.prepare(), '');
  await store.setInjectionEnabled(true);
  for (const reply of ['{}', '{"summary":12}', JSON.stringify({ summary: '字'.repeat(101) })]) {
    await assert.rejects(createBackflowService({ target, store, modelClient: { complete() { return reply; } } }).prepare(), /参考|带入|字/);
  }
  const requests = [];
  assert.equal(await createBackflowService({ target, store, modelClient: client(requests, '') }).prepare(), '');
});

test('real manual changes while preparing discard the old reference', async () => {
  const { target, store, batch } = setup();
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '明天见。'.repeat(1000), batch });
  const service = createBackflowService({ target, store, modelClient: { async complete() { await store.deleteMessage('lin', 'm1'); return '{"summary":"明天见。"}'; } } });
  await assert.rejects(service.prepare(), /删除/);
});


test('short confirmed todos and quoted SMS are supplied as references without a second model call', async () => {
  const { target, store, batch } = setup();
  const group = await store.saveGroup('', { name: '读书群', memberIds: ['lin', 'zhou'], userIsMember: true });
  await store.appendMessages(group.id, [
    { id: 'original', role: 'assistant', speakerId: 'lin', text: '周三把书带来。', batch: { key: 'earlier' } },
    { id: 'reply', role: 'user', speakerId: '@user', text: '这件事收到。', replyToId: 'original', batch },
  ]);
  target.metadata.pocketPhone.todos = [{ id: 'open', title: '周三还书', status: 'open', startAt: '2026-10-21 18:00', endAt: '', participantIds: ['@user', 'lin'], knownToIds: ['@user', 'lin'], sourceConversationId: group.id, sourceMessageIds: ['original'], sourceBatch: batch }];
  const service = createBackflowService({ target, store, modelClient: { complete() { assert.fail('no extra call for short todo and SMS references'); } } });
  const result = await service.prepare();
  for (const value of ['引用林舟：周三把书带来。', '这件事收到。', '周三还书', '2026-10-21', '知情人：我、林舟', '未勾选']) assert.ok(result.includes(value), value);
});


test('calendar festivals injection can be independently enabled or disabled', async () => {
  const { target, store, batch } = setup();
  const mockCalendar = {
    context() {
      return {
        today: '2026年10月18日',
        events: [
          { name: '霜降', when: '今天', note: '' },
          { name: '重阳节', when: '3天后', note: '登高祈福' },
        ],
      };
    },
  };

  // 1. 默认仅开启短信带入正文，未开启日历带入正文：不含日历线索
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '你好。', batch });
  let service = createBackflowService({ target, store, modelClient: { complete() {} }, calendar: mockCalendar });
  let result = await service.prepare();
  assert.ok(result.includes('你好。'));
  assert.ok(!result.includes('日历线索'));

  // 2. 独立开启日历带入正文：包含日历线索
  await store.setInjectCalendarEnabled(true);
  assert.equal(store.read().injectCalendarEnabled, true);
  service = createBackflowService({ target, store, modelClient: { complete() {} }, calendar: mockCalendar });
  result = await service.prepare();
  assert.ok(result.includes('[日历线索：\n- 今天 霜降\n- 3天后 重阳节（登高祈福）\n]'));
  assert.ok(result.includes('你好。'));

  // 3. 关闭短信带入正文，仅保留日历带入正文：日历线索仍独立注入
  await store.setInjectionEnabled(false);
  result = await service.prepare();
  assert.ok(result.includes('[日历线索：\n- 今天 霜降\n- 3天后 重阳节（登高祈福）\n]'));
  assert.ok(!result.includes('你好。'));
  assert.ok(!result.includes('手机参考'));
  assert.ok(!result.includes('时间：'));

  // 4. 两者皆关闭：返回空，不注入任何内容
  await store.setInjectCalendarEnabled(false);
  result = await service.prepare();
  assert.equal(result, '');
});

test('summary generation complies with active prompt preset order and entries', async () => {
  const { target, store, batch } = setup([{ is_user: false, mes: '这是一段正文剧情。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '长消息内容。'.repeat(600), batch });

  const customPreset = {
    id: 'custom_summary_preset',
    name: '自定义摘要预设',
    entries: [
      { id: 'custom_head', name: '自定义头部指令', scope: '摘要', role: 'system', enabled: true, content: '【优先遵循头部规范】' },
      { id: 'entry_summary_rules', name: '短信回流正文记忆摘要', scope: '摘要', role: 'system', enabled: true, content: '{{summary_prompt}}' },
      { id: 'entry_story_history', name: '主聊天最近正文历史', scope: '通用', role: 'system', enabled: true, content: '[正文：{{story_history}}]' },
      { id: 'custom_user_suffix', name: '尾部用户指令', scope: '摘要', role: 'user', enabled: true, content: '请严格提取有价值信息。' },
      { id: 'entry_phone_data', name: '手机上下文与任务数据', scope: '通用', role: 'user', enabled: true, content: '{{phone_context}}' },
    ],
  };

  await store.savePromptPreset(customPreset);

  const requests = [];
  const service = createBackflowService({
    target,
    store,
    modelClient: {
      complete(req) {
        requests.push(req);
        return JSON.stringify({ summary: '整理后的摘要' });
      },
    },
  });

  const res = await service.prepare();
  assert.equal(res, '整理后的摘要');
  assert.equal(requests.length, 1);
  const req = requests[0];
  assert.equal(req.label, '短信回流正文记忆摘要');
  assert.ok(Array.isArray(req.entries));
  assert.equal(req.entries.length, 5);
  assert.equal(req.entries[0].name, '自定义头部指令');
  assert.equal(req.entries[0].content, '【优先遵循头部规范】');
  assert.equal(req.entries[1].name, '短信回流正文记忆摘要');
  assert.ok(req.entries[1].content.includes('短信回流正文记忆摘要'));
  assert.equal(req.entries[2].name, '主聊天最近正文历史');
  assert.equal(req.entries[3].name, '尾部用户指令');
  assert.equal(req.entries[3].role, 'user');
  assert.equal(req.entries[4].name, '手机上下文与任务数据');
  assert.equal(req.entries[4].role, 'user');

  assert.ok(Array.isArray(req.collapsedMessages));
  assert.equal(req.collapsedMessages.length, 2);
  assert.equal(req.collapsedMessages[0].role, 'system');
  assert.ok(req.collapsedMessages[0].content.includes('【优先遵循头部规范】'));
  assert.equal(req.collapsedMessages[1].role, 'user');
  assert.ok(req.collapsedMessages[1].content.includes('请严格提取有价值信息。'));
});

test('story_memory is included in summary preset entries when memorySources provides memory', async () => {
  const { target, store, batch } = setup([{ is_user: false, mes: '正文消息。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '长消息内容。'.repeat(600), batch });

  const mockMemorySources = {
    select() { return { kind: 'bbs' }; },
    readStoryMemory() { return '这是来自柏宝书的长线剧情记忆摘要。'; },
  };

  const requests = [];
  const service = createBackflowService({
    target,
    store,
    memorySources: mockMemorySources,
    modelClient: {
      complete(req) {
        requests.push(req);
        return JSON.stringify({ summary: '整理后的摘要' });
      },
    },
  });

  await service.prepare();
  assert.equal(requests.length, 1);
  const storyMemEntry = requests[0].entries.find(e => e.id === 'entry_story_memory');
  assert.ok(storyMemEntry, 'entry_story_memory should be present');
  assert.ok(storyMemEntry.content.includes('这是来自柏宝书的长线剧情记忆摘要。'));
});

test('manual and auto summary modes: plus menu manual trigger vs automatic caching on return', async () => {
  const { target, store, batch } = setup([{ is_user: false, mes: '正文消息。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '长消息内容。'.repeat(600), batch });

  // 1. 手动挡：未手动总结前，prepare 不自动调用 API
  await store.setSummaryMode('manual');
  let requests = [];
  let service = createBackflowService({
    target,
    store,
    modelClient: {
      complete(req) {
        requests.push(req);
        return JSON.stringify({ summary: '手动总结结果' });
      },
    },
  });

  let res = await service.prepare();
  assert.equal(res, '');
  assert.equal(requests.length, 0, 'manual mode must not auto-call summary API during chat turns');

  // 手动点击「总结短信」调用 summarize()
  const manualResult = await service.summarize();
  assert.equal(manualResult, '手动总结结果');
  assert.equal(requests.length, 1);
  assert.equal(store.read().manualSummary.text, '手动总结结果');

  // 后续正文生成注入手动保存的总结，不再调用 API
  res = await service.prepare();
  assert.equal(res, '手动总结结果');
  assert.equal(requests.length, 1);

  // 2. 自动挡：首次生成调用一次并缓存，短信未变动时不重复调用
  summaryCache.delete(target);
  await store.setSummaryMode('auto');
  await store.clearManualSummary();
  requests = [];
  service = createBackflowService({
    target,
    store,
    modelClient: {
      complete(req) {
        requests.push(req);
        return JSON.stringify({ summary: '自动挡总结第1轮' });
      },
    },
  });

  res = await service.prepare();
  assert.equal(res, '自动挡总结第1轮');
  assert.equal(requests.length, 1);

  // 再次准备正文（手机消息未改变）：复用缓存，零次 API 请求
  res = await service.prepare();
  assert.equal(res, '自动挡总结第1轮');
  assert.equal(requests.length, 1, 'subsequent turns with unchanged messages reuse cached summary');

  // 用户在手机中继续聊天，产生了新消息：缓存失效，下一次准备正文时重新总结一次
  await store.appendMessage('lin', { id: 'm2', role: 'user', text: '后续新短信。', batch });
  service = createBackflowService({
    target,
    store,
    modelClient: {
      complete(req) {
        requests.push(req);
        return JSON.stringify({ summary: '自动挡总结第2轮' });
      },
    },
  });
  res = await service.prepare();
  assert.equal(res, '自动挡总结第2轮');
  assert.equal(requests.length, 2);
});

test('summaryAutoTruncate gracefully slices output when AI exceeds maxCharacters', async () => {
  const { target, store, batch } = setup([{ is_user: false, mes: '正文消息。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '长消息内容。'.repeat(600), batch });

  await store.setSummaryMaxCharacters(100);
  await store.setSummaryAutoTruncate(true);

  // 模型输出了 120 字的完整摘要
  const overLengthSummary = '这是一段正确的摘要内容。'.repeat(10); // 120字
  assert.equal(Array.from(overLengthSummary).length, 120);

  const service = createBackflowService({
    target,
    store,
    modelClient: {
      complete() {
        return JSON.stringify({ summary: overLengthSummary });
      },
    },
  });

  const res = await service.prepare();
  assert.equal(Array.from(res).length, 100);
  assert.equal(res, overLengthSummary.slice(0, 100));
});

test('manual summary on short SMS (< 3000 chars) is used instead of dumping raw chat', async () => {
  const { target, store, batch } = setup([{ is_user: false, mes: '正文消息。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '今晚八点见。', batch });
  await store.setSummaryMode('manual');
  await store.saveManualSummary('用户与林舟相约今晚八点见面。');

  const requests = [];
  const service = createBackflowService({
    target,
    store,
    modelClient: {
      complete(req) {
        requests.push(req);
        return JSON.stringify({ summary: '不要调用' });
      },
    },
  });

  const res = await service.prepare();
  assert.equal(res, '用户与林舟相约今晚八点见面。', 'manual summary must be injected even for short SMS');
  assert.equal(requests.length, 0, 'no extra model call in manual mode when summary exists');
});

test('auto summary with summaryAlwaysSummarize === true on short SMS (< 3000 chars) summarizes via AI', async () => {
  const { target, store, batch } = setup([{ is_user: false, mes: '正文消息。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '今晚八点见。', batch });
  await store.setSummaryMode('auto');
  await store.setSummaryAlwaysSummarize(true);

  summaryCache.delete(target);
  const requests = [];
  const service = createBackflowService({
    target,
    store,
    modelClient: {
      complete(req) {
        requests.push(req);
        return JSON.stringify({ summary: 'AI自动提炼的简短摘要。' });
      },
    },
  });

  const res = await service.prepare();
  assert.equal(res, 'AI自动提炼的简短摘要。');
  assert.equal(requests.length, 1, 'model client called because summaryAlwaysSummarize is true');

  // When summaryAlwaysSummarize is false, short SMS injects raw transcript
  summaryCache.delete(target);
  await store.setSummaryAlwaysSummarize(false);
  const rawRequests = [];
  const rawService = createBackflowService({
    target,
    store,
    modelClient: {
      complete(req) {
        rawRequests.push(req);
        return JSON.stringify({ summary: '不该调用' });
      },
    },
  });

  const rawRes = await rawService.prepare();
  assert.match(rawRes, /\[私聊：林舟\]/);
  assert.match(rawRes, /今晚八点见。/);
  assert.equal(rawRequests.length, 0, 'short SMS directly injects raw transcript without AI call when summaryAlwaysSummarize is false');
});
