import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePromptPreset, collapseMessages, PRESET_SLOTS, DEFAULT_PROMPT_PRESETS, DEFAULT_PRESET_ENTRIES, normalizePromptPresets, exportPresetToPayload, createPresetFromPayload } from '../src/preset-engine.js';
import { createPhoneStore } from '../src/store.js';

test('preset engine: compiles entries and replaces macros with slots', () => {
  const preset = {
    id: 'test_p',
    name: '测试预设',
    storyLayers: 5,
    entries: [
      { id: 'e1', name: '系统设定', role: 'system', enabled: true, content: '我是世界观系统。\n{{worldbook}}' },
      { id: 'e2', name: '柏宝书记忆', role: 'system', enabled: true, content: '{{story_memory}}' },
      { id: 'e3', name: '主聊天历史', role: 'user', enabled: true, content: '近况如下：\n{{story_history}}' },
      { id: 'e4', name: '禁用条目', role: 'user', enabled: false, content: '不应出现' },
      { id: 'e5', name: '手机数据', role: 'user', enabled: true, content: '{{phone_context}}' },
    ],
  };

  const contextData = {
    worldbook: '【魔法公会设定】',
    storyHistory: '角色：今天天气很好。\n用户：是的。',
    storyMemory: '', // 模拟柏宝书未开启，为空
    phoneContext: { time: '10:00', unread: 2 },
  };

  const compiled = compilePromptPreset(preset, contextData);

  // e2 (柏宝书记忆) 为空且无包装，应被安全跳过
  assert.equal(compiled.length, 3);
  assert.equal(compiled[0].role, 'system');
  assert.ok(compiled[0].content.includes('【魔法公会设定】'));

  assert.equal(compiled[1].role, 'user');
  assert.ok(compiled[1].content.includes('角色：今天天气很好。'));

  assert.equal(compiled[2].role, 'user');
  assert.ok(compiled[2].content.includes('"unread":2'));
});

test('preset store: manages presets, entries, ordering and layers', async () => {
  const target = { metadata: { pocketPhone: { schemaVersion: 1 } }, saveMetadata: async () => {} };
  const store = createPhoneStore({ target });

  // 初始读取（若无则返回默认预设）
  let state = store.read();
  const presets = state.promptPresets || DEFAULT_PROMPT_PRESETS;
  assert.ok(Array.isArray(presets));
  assert.equal(state.activePresetId || 'default_preset', 'default_preset');

  // 新建/另存为预设
  await store.createPromptPreset({ name: '自定义历险预设', storyLayers: 6 });
  state = store.read();
  assert.equal(state.promptPresets.length, 2);
  const custom = state.promptPresets.find(p => p.name === '自定义历险预设');
  assert.ok(custom);
  assert.equal(state.activePresetId, custom.id);
  assert.equal(custom.storyLayers, 6);

  // 调节层数
  await store.updatePresetStoryLayers(custom.id, 8);
  assert.equal(store.read().promptPresets.find(p => p.id === custom.id).storyLayers, 8);

  // 新增条目
  await store.addPresetEntry(custom.id, { name: '额外提示', role: 'assistant', content: '好的收到。' });
  let entries = store.read().promptPresets.find(p => p.id === custom.id).entries;
  const last = entries[entries.length - 1];
  assert.equal(last.name, '额外提示');
  assert.equal(last.role, 'assistant');

  // 调序上移
  await store.movePresetEntry(custom.id, last.id, 'up');
  entries = store.read().promptPresets.find(p => p.id === custom.id).entries;
  assert.equal(entries[entries.length - 2].id, last.id);

  // 切换开关
  await store.togglePresetEntry(custom.id, last.id);
  entries = store.read().promptPresets.find(p => p.id === custom.id).entries;
  assert.equal(entries.find(e => e.id === last.id).enabled, false);

  // 删除条目
  await store.deletePresetEntry(custom.id, last.id);
  entries = store.read().promptPresets.find(p => p.id === custom.id).entries;
  assert.ok(!entries.some(e => e.id === last.id));

  // 删除自定义预设
  await store.deletePromptPreset(custom.id);
  state = store.read();
  assert.equal(state.promptPresets.length, 1);
  assert.equal(state.activePresetId, 'default_preset');
});

test('preset engine: scope filtering, A+B combination, and invalid scope safety', () => {
  const preset = {
    id: 'scope_test',
    name: '作用域测试',
    entries: [
      { id: 's1', name: '通用条目', scope: '通用', role: 'system', enabled: true, content: '通用规则' },
      { id: 's2', name: '短信条目', scope: '短信', role: 'system', enabled: true, content: '仅短信' },
      { id: 's3', name: '论坛条目', scope: '论坛', role: 'system', enabled: true, content: '仅论坛' },
      { id: 's4', name: '复合条目', scope: '日历+待办', role: 'system', enabled: true, content: '日历或待办' },
      { id: 's5', name: '未知无效条目', scope: '不存在的功能标签', role: 'system', enabled: true, content: '永远不会匹配' },
    ],
  };

  // 1. 私聊短信任务 ('chat')
  const chatCompiled = compilePromptPreset(preset, {}, 'chat');
  assert.equal(chatCompiled.length, 3); // s1 (通用), s2 (短信), s4 (待办匹配chat)
  assert.ok(chatCompiled.some(m => m.content === '通用规则'));
  assert.ok(chatCompiled.some(m => m.content === '仅短信'));
  assert.ok(chatCompiled.some(m => m.content === '日历或待办'));
  assert.ok(!chatCompiled.some(m => m.content === '仅论坛'));
  assert.ok(!chatCompiled.some(m => m.content === '永远不会匹配'));

  // 2. 论坛任务 ('forum')
  const forumCompiled = compilePromptPreset(preset, {}, 'forum');
  assert.equal(forumCompiled.length, 2); // s1 (通用), s3 (论坛)
  assert.ok(forumCompiled.some(m => m.content === '通用规则'));
  assert.ok(forumCompiled.some(m => m.content === '仅论坛'));
  assert.ok(!forumCompiled.some(m => m.content === '仅短信'));

  // 3. 日历日程任务 ('schedule_deduce')
  const calCompiled = compilePromptPreset(preset, {}, 'schedule_deduce');
  assert.equal(calCompiled.length, 2); // s1 (通用), s4 (日历+待办)
  assert.ok(calCompiled.some(m => m.content === '日历或待办'));
});

test('preset engine: calendar slot macro handles absence cleanly', () => {
  const preset = {
    id: 'cal_test',
    entries: [
      { id: 'c1', name: '日历注入', scope: '通用', role: 'system', enabled: true, content: '{{calendar_prompt}}' },
    ],
  };

  // 无日历数据时跳过该日历提示词
  const emptyRes = compilePromptPreset(preset, { phoneContext: {} }, 'chat');
  assert.ok(!emptyRes.some(m => m.content.includes('calendar是已有的节日和纪念日')));

  // 有日历数据时正常注入
  const withCalRes = compilePromptPreset(preset, { phoneContext: { calendar: { events: [{ name: '冬至' }] } } }, 'chat');
  assert.equal(withCalRes.length, 1);
  assert.ok(withCalRes[0].content.includes('calendar是已有的节日和纪念日'));
});

test('preset store: saves scope field on add and update', async () => {
  const target = { metadata: { pocketPhone: { schemaVersion: 1 } }, saveMetadata: async () => {} };
  const store = createPhoneStore({ target });

  await store.createPromptPreset({ name: '测试范围预设' });
  const preset = store.read().promptPresets.find(p => p.name === '测试范围预设');

  await store.addPresetEntry(preset.id, { name: '新功能', scope: '短信+群聊', content: '内容' });
  let entries = store.read().promptPresets.find(p => p.id === preset.id).entries;
  let added = entries[entries.length - 1];
  assert.equal(added.scope, '短信+群聊');

  await store.updatePresetEntry(preset.id, added.id, { scope: '论坛' });
  entries = store.read().promptPresets.find(p => p.id === preset.id).entries;
  added = entries.find(e => e.id === added.id);
  assert.equal(added.scope, '论坛');
});

test('preset engine: storyMemory slot injects at exact position with collapseMessages', () => {
  const preset = {
    id: 'story_mem_test',
    entries: [
      { id: 'r1', name: '基础规则', role: 'system', enabled: true, content: '规则一' },
      { id: 'r2', name: '柏宝书剧情摘要', role: 'system', enabled: true, content: '[剧情长线摘要（来自柏宝书）：\n{{story_memory}}\n]' },
      { id: 'r3', name: '手机数据', role: 'user', enabled: true, content: '{{phone_context}}' },
    ],
  };

  const compiled = compilePromptPreset(preset, {
    storyMemory: '【2031/4/7】在书店初遇。',
    phoneContext: { current: 'chatting' },
  }, 'chat');

  assert.equal(compiled.length, 3);
  assert.equal(compiled[1].name, '柏宝书剧情摘要');
  assert.ok(compiled[1].content.includes('【2031/4/7】在书店初遇。'));
  assert.ok(compiled[1].content.includes('剧情长线摘要（来自柏宝书）'));

  const collapsed = collapseMessages(compiled);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[0].role, 'system');
  assert.ok(collapsed[0].content.includes('规则一'));
  assert.ok(collapsed[0].content.includes('【2031/4/7】在书店初遇。'));
  assert.equal(collapsed[1].role, 'user');
  assert.ok(collapsed[1].content.includes('"current":"chatting"'));
});

test('preset engine: preserve exact chronological ordering with system entries interleaved', () => {
  const preset = {
    id: 'interleaved_test',
    entries: [
      { id: 'i1', name: '前置规则', role: 'system', enabled: true, content: 'SYSTEM_1' },
      { id: 'i2', name: '用户情境', role: 'user', enabled: true, content: 'USER_1' },
      { id: 'i3', name: '后置规则插槽', role: 'system', enabled: true, content: 'SYSTEM_2' },
      { id: 'i4', name: '用户最新指令', role: 'user', enabled: true, content: 'USER_2' },
    ],
  };

  const compiled = compilePromptPreset(preset, {}, 'chat');
  const collapsed = collapseMessages(compiled);
  assert.equal(collapsed.length, 4);
  assert.equal(collapsed[0].role, 'system');
  assert.equal(collapsed[0].content, 'SYSTEM_1');
  assert.equal(collapsed[1].role, 'user');
  assert.equal(collapsed[1].content, 'USER_1');
  assert.equal(collapsed[2].role, 'system');
  assert.equal(collapsed[2].content, 'SYSTEM_2');
  assert.equal(collapsed[3].role, 'user');
  assert.equal(collapsed[3].content, 'USER_2');
});

test('preset engine: compile directory task expands {{directory_prompt}} and scopes properly', () => {
  const compiled = compilePromptPreset(DEFAULT_PROMPT_PRESETS[0], {
    phoneContext: { people: [], contacts: [] },
    worldbook: '测试世界设定',
  }, 'directory');

  const dirEntry = compiled.find(e => e.name === '通讯录发掘与整理');
  assert.ok(dirEntry, '应包含通讯录发掘与整理条目');
  assert.equal(dirEntry.role, 'system');
  assert.ok(dirEntry.content.includes('根据people、角色卡、世界书和最新剧情'), '应展开 DIRECTORY_PROMPT');

  // 短信专属条目不应出现在通讯录任务中
  assert.ok(!compiled.some(e => e.name === '私聊短信生成'));
  assert.ok(!compiled.some(e => e.name === '群聊多角色续写'));
});

test('preset engine: compile contacts task expands {{contacts_prompt}}', () => {
  const compiled = compilePromptPreset(DEFAULT_PROMPT_PRESETS[0], {
    phoneContext: { people: [{ name: '林舟' }] },
  }, 'contacts');

  const contactsEntry = compiled.find(e => e.name === '联系人风格提炼');
  assert.ok(contactsEntry, '应包含联系人风格提炼条目');
  assert.equal(contactsEntry.role, 'system');
  assert.ok(contactsEntry.content.includes('从所给角色卡、世界书或人物简要资料整理已有'), '应展开 CONTACTS_PROMPT');
});

test('preset engine: builtin preset backfills missing default entries', () => {
  const partialBuiltin = {
    id: 'default_preset',
    name: '两三事默认标准预设',
    isBuiltin: true,
    entries: [
      { id: 'entry_system_rules', name: '基础通用规则', scope: '通用', role: 'system', enabled: true, content: 'SYS' },
    ],
  };

  const compiled = compilePromptPreset(partialBuiltin, {
    phoneContext: { test: true },
  }, 'directory');

  const dirEntry = compiled.find(e => e.id === 'entry_directory_rules');
  assert.ok(dirEntry, '内置预设应自动补充 entry_directory_rules');
  assert.ok(dirEntry.content.includes('根据people、角色卡、世界书和最新剧情'));
});

test('preset engine: normalizePromptPresets merges newly added default entries into existing stored presets', () => {
  // 模拟用户在之前版本中存入的旧预设（只有14个条目，缺失 directory / contacts / summary / image）
  const storedOldPresets = [
    {
      id: 'default_preset',
      name: '两三事默认标准预设',
      isBuiltin: true,
      entries: [
        { id: 'entry_system_rules', name: '基础通用规则', scope: '通用', role: 'system', enabled: true, content: 'SYS' },
        { id: 'entry_messages_rules', name: '私聊短信生成', scope: '短信', role: 'system', enabled: true, content: 'MSG' },
      ],
    },
  ];

  const normalized = normalizePromptPresets(storedOldPresets);
  assert.equal(normalized.length, 1);
  const builtin = normalized[0];
  assert.equal(builtin.entries.length, DEFAULT_PRESET_ENTRIES.length);

  const dirEntry = builtin.entries.find(e => e.id === 'entry_directory_rules');
  assert.ok(dirEntry, '应自动将 entry_directory_rules 补齐到现有保存预设中');
  assert.equal(dirEntry.name, '通讯录发掘与整理');

  const contactsEntry = builtin.entries.find(e => e.id === 'entry_contacts_rules');
  assert.ok(contactsEntry, '应自动将 entry_contacts_rules 补齐到现有保存预设中');

  // 用户原先修改过的条目内容应被保留
  const sysEntry = builtin.entries.find(e => e.id === 'entry_system_rules');
  assert.equal(sysEntry.content, 'SYS');
});

test('preset engine: sanitizePhoneContext strips story, storyMemory, worldbook, and character across all modes', () => {
  const dirtyContext = {
    character: '选秀\n\n\n',
    user: '测试用户',
    userProfile: { name: '测试用户', nickname: '' },
    clock: { source: 'real', date: '2026-10-25', weekday: '星期日', time: '23:56' },
    batch: { key: '[39]', label: '主楼 #40' },
    story: [{ speaker: '姜惟汀', text: '一大段正文内容' }],
    storyBackground: [{ speaker: '旁白', text: '背景正文' }],
    recentStory: ['推演用旧正文'],
    storyMemory: '柏宝书长线摘要',
    worldbook: '世界书设定集',
    worldInfo: '节日用旧世界书',
    history: [{ role: 'user', text: '你好' }],
  };

  const compiled = compilePromptPreset(DEFAULT_PROMPT_PRESETS[0], {
    worldbook: dirtyContext.worldbook,
    storyHistory: '姜惟汀：一大段正文内容',
    storyMemory: dirtyContext.storyMemory,
    phoneContext: dirtyContext,
  }, 'chat');

  const phoneEntry = compiled.find(e => e.id === 'entry_phone_data');
  assert.ok(phoneEntry);
  const parsed = JSON.parse(phoneEntry.content);
  assert.equal(parsed.story, undefined);
  assert.equal(parsed.storyBackground, undefined);
  assert.equal(parsed.recentStory, undefined);
  assert.equal(parsed.storyMemory, undefined);
  assert.equal(parsed.worldbook, undefined);
  assert.equal(parsed.worldInfo, undefined);
  assert.equal(parsed.character, undefined);
  assert.equal(parsed.batch, undefined);
  assert.equal(parsed.user, '测试用户');
  assert.equal(parsed.history.length, 1);
});

test('preset engine: strictly respects entry enabled switches and custom ordering across modes', () => {
  const basePreset = structuredClone(DEFAULT_PROMPT_PRESETS[0]);
  // 关闭世界书、柏宝书摘要、主聊天历史、待办事项规则
  for (const id of ['entry_worldbook', 'entry_story_memory', 'entry_story_history', 'entry_todo_rules']) {
    const item = basePreset.entries.find(e => e.id === id);
    if (item) item.enabled = false;
  }

  const contextData = {
    worldbook: '绝密世界书内容',
    storyHistory: '绝密主聊天正文历史',
    storyMemory: '绝密柏宝书长线摘要',
    phoneContext: {
      story: [{ speaker: 'A', text: '绝密主聊天正文历史' }],
      storyMemory: '绝密柏宝书长线摘要',
      worldbook: '绝密世界书内容',
      history: [{ role: 'user', text: '在吗' }],
    },
  };

  for (const mode of ['chat', 'group-chat', 'directory', 'social-feed', 'social-comment', 'forum', 'schedule_deduce']) {
    const compiled = compilePromptPreset(basePreset, contextData, mode);
    const fullText = compiled.map(m => m.content).join('\n');
    assert.equal(fullText.includes('绝密世界书内容'), false, `${mode} 模式下关闭世界书条目后不应泄露世界书`);
    assert.equal(fullText.includes('绝密主聊天正文历史'), false, `${mode} 模式下关闭主聊天历史条目后不应泄露正文历史`);
    assert.equal(fullText.includes('绝密柏宝书长线摘要'), false, `${mode} 模式下关闭柏宝书摘要条目后不应泄露摘要`);
    assert.equal(fullText.includes('todoSuggestions'), false, `${mode} 模式下关闭待办规则条目后不应注入待办规则`);
  }

  // 验证日程推演条目不会串台进入私聊/群聊
  const defaultChatCompiled = compilePromptPreset(DEFAULT_PROMPT_PRESETS[0], contextData, 'chat');
  assert.equal(defaultChatCompiled.some(e => e.id === 'entry_schedule_rules'), false, '私聊不应混入日程推演规则');
});

test('all features inject {{story_memory}} and {{story_history}} end-to-end', async () => {
  const { createHarness } = await import('./harness.mjs');
  const { createContextReader } = await import('../src/context.js');
  const { createMemorySources } = await import('../src/memory-sources.js');
  const { createMessageService } = await import('../src/messages.js');
  const { createGroupService } = await import('../src/groups.js');
  const { createDirectoryService } = await import('../src/directory.js');
  const { createSocialService } = await import('../src/social.js');
  const { createForumService } = await import('../src/forum.js');
  const { createCalendarAiService } = await import('../src/calendar-ai.js');

  const h = createHarness({
    settings: { baibai_book: { enabled: true } },
    messages: [
      {
        is_user: false,
        name: '姜惟汀',
        mes: '选秀大典今日在紫禁城举行。<bbs_end>2031/4/8 09:30</bbs_end>',
        extra: { bbs_leaf: { text: '柏宝书长线记忆：选秀初选已通过', timeLabel: '2031/4/7' } },
      },
    ],
    metadata: {
      pocketPhone: {
        contacts: [{ id: 'c1', name: '林舟', personality: '沉稳', expression: '简短' }],
        groups: [{ id: 'g1', name: '宫廷群', memberIds: ['c1'], userIsMember: true }],
        conversations: {},
        social: {
          npcs: [],
          feedIds: ['p1'],
          posts: [{ id: 'p1', authorId: 'c1', text: '今日天气晴朗。', comments: [] }],
        },
        forum: { posts: [] },
      },
    },
  });

  const target = h.host.captureChat();
  const store = createPhoneStore({ target });
  const memorySources = createMemorySources({
    target,
    settingsProvider: h.host.readSettings,
    qqjBridgeProvider: () => null,
    baiBaiBookProvider: () => null,
  });
  const contextReader = createContextReader({
    target,
    store,
    qqjBridgeProvider: () => null,
    memorySources,
  });

  const capturedRequests = [];
  const makeClient = replyObj => ({
    async complete(req) {
      capturedRequests.push(req);
      return JSON.stringify(replyObj);
    },
  });

  // 1. 私聊短信 (chat)
  await createMessageService({
    target,
    store,
    contextReader,
    modelClient: makeClient({ messages: [{ text: '收到' }] }),
  }).continueChat('c1');

  // 2. 联系人风格提炼 (contacts)
  await createMessageService({
    target,
    store,
    contextReader,
    modelClient: makeClient({ contacts: [{ sourceId: 'c1', name: '林舟', expression: '温和短句' }] }),
  }).refineOnlineStyle('c1');

  // 3. 群聊 (group-chat)
  await createGroupService({
    target,
    store,
    contextReader,
    modelClient: makeClient({
      anchor: { memberIds: ['c1', '@user'], speakerIds: ['c1'] },
      messages: [{ speakerId: 'c1', text: '群里好' }],
    }),
  }).continueChat('g1');

  // 4. 通讯录整理 (directory)
  await createDirectoryService({
    store,
    contextReader,
    modelClient: makeClient({ contacts: [], groups: [] }),
  }).organize();

  // 5. 动态刷新 (social-feed)
  const socialService = createSocialService({
    store,
    contextReader,
    modelClient: makeClient({ posts: [{ authorId: 'c1', text: '新动态' }] }),
  });
  await socialService.refresh();

  // 6. 个人动态生成 (social-author)
  await socialService.generateAuthor('c1');

  // 7. 动态评论回复 (social-comment)
  const postId = store.read().social.posts[0].id;
  await createSocialService({
    store,
    contextReader,
    modelClient: makeClient({ comments: [{ authorId: 'c1', text: '谢谢评论' }] }),
  }).comment(postId, '写得真好');

  // 8. 公众论坛 (forum)
  await createForumService({
    store,
    contextReader,
    modelClient: makeClient({ posts: [{ title: '热帖', author: '路人', content: '热闹' }] }),
  }).refresh();

  // 9. AI 节日构想 (festival_conceive)
  const calendarAi = createCalendarAiService({
    contextReader,
    modelClient: makeClient({
      festivals: [{ name: '花朝节', month: 3, day: 15, days: 1, note: '赏花' }],
      schedules: [{ title: '早朝', month: 4, day: 8, time: '09:00', location: '太和殿' }],
    }),
    target,
    store,
  });
  await calendarAi.conceiveFestivals({ count: 1 });

  // 10. AI 日程推演 (schedule_deduce)
  await calendarAi.deduceSchedules({ days: 1 });

  assert.equal(capturedRequests.length, 10);
  for (const req of capturedRequests) {
    assert.ok(
      req.system.includes('柏宝书长线记忆：选秀初选已通过'),
      `${req.label} 应成功注入 {{story_memory}} 柏宝书插槽`,
    );
    assert.ok(
      req.system.includes('选秀大典今日在紫禁城举行。'),
      `${req.label} 应成功注入 {{story_history}} 最近正文插槽`,
    );
  }
});

test('preset engine: exportPresetToPayload and createPresetFromPayload roundtrip', async () => {
  const original = {
    id: 'my_custom_preset',
    name: '我的超级预设',
    storyLayers: 8,
    isBuiltin: false,
    entries: [
      { id: 'old_1', name: '系统人设', role: 'system', scope: '通用', category: '基础', enabled: true, content: '【世界观】' },
      { id: 'old_2', name: '短信规则', role: 'system', scope: '短信', category: '规则', enabled: false, content: '短信专用' },
    ],
  };

  // 1. 导出验证
  const payload = exportPresetToPayload(original);
  assert.equal(payload.type, 'tmt_prompt_preset');
  assert.equal(payload.schemaVersion, 1);
  assert.ok(payload.exportedAt);
  assert.equal(payload.preset.name, '我的超级预设');
  assert.equal(payload.preset.storyLayers, 8);
  assert.equal(payload.preset.entries.length, 2);
  assert.equal(payload.preset.entries[0].name, '系统人设');
  assert.equal(payload.preset.entries[0].id, undefined, '导出的条目不应泄露旧系统内部 ID');
  assert.equal(payload.preset.entries[1].enabled, false);

  // 2. 导入验证
  const imported = createPresetFromPayload(payload);
  assert.notEqual(imported.id, original.id, '导入时应分配全新的唯一预设 ID');
  assert.equal(imported.name, '我的超级预设 (导入)');
  assert.equal(imported.storyLayers, 8);
  assert.equal(imported.isBuiltin, false);
  assert.equal(imported.entries.length, 2);
  assert.ok(imported.entries[0].id && imported.entries[0].id !== 'old_1');
  assert.equal(imported.entries[0].name, '系统人设');
  assert.equal(imported.entries[0].role, 'system');
  assert.equal(imported.entries[0].content, '【世界观】');
  assert.equal(imported.entries[1].enabled, false);

  // 3. 容错导入：直接传入 entries 数组
  const rawArrayPayload = [
    { name: '单条规则', role: 'user', content: '测试内容' },
  ];
  const fromArray = createPresetFromPayload(rawArrayPayload, '文件导入预设');
  assert.equal(fromArray.name, '文件导入预设 (导入)');
  assert.equal(fromArray.entries.length, 1);
  assert.equal(fromArray.entries[0].name, '单条规则');
  assert.equal(fromArray.entries[0].role, 'user');
  assert.equal(fromArray.entries[0].content, '测试内容');

  // 4. 异常防御
  assert.throws(() => createPresetFromPayload(null), /有效 JSON/);
  assert.throws(() => createPresetFromPayload({ invalid: true }), /未找到有效的预设条目列表/);

  // 5. 与 store 结合保存与编译
  const target = { metadata: { pocketPhone: { schemaVersion: 1 } }, saveMetadata: async () => {} };
  const store = createPhoneStore({ target });
  await store.savePromptPreset(imported);

  const state = store.read();
  assert.equal(state.activePresetId, imported.id);
  const active = state.promptPresets.find(p => p.id === imported.id);
  assert.ok(active);
  assert.equal(active.name, '我的超级预设 (导入)');

  const compiled = compilePromptPreset(active, {}, 'chat');
  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].content, '【世界观】');
});

