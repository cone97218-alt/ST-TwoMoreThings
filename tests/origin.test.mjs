import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEM_CONTACT_ID,
  defaultOriginState,
  normalizeOriginState,
  taskRemainingTurns,
  isTaskExpired,
  completeOriginTask,
  failOriginTask,
  checkOriginExpiry,
  gainOriginExp,
  applyStatEffect,
  buyShopItem,
  useBagItem,
  performGachaDraw,
  unlockAchievement,
} from '../src/origin-engine.js';
import {
  buildOriginInjection,
  parseOriginBlock,
  applyOriginBlock,
  stripOriginBlock,
} from '../src/origin-injection.js';
import { createSystemContact, buildSystemChatPrompt } from '../src/origin-chat.js';
import { createPhoneStore } from '../src/store.js';
import { renderOrigin } from '../src/ui/origin.js';
import { createBackflowService } from '../src/context.js';
import { getPrompt, ORIGIN_SYSTEM_PROMPT, ORIGIN_CHAT_PROMPT, PROMPT_MACRO_MAP } from '../src/prompts.js';
import { renderSettings, renderLogSettings } from '../src/ui/settings.js';
import { createOriginService } from '../src/origin.js';
import { PRESET_SCOPES, compilePromptPreset, DEFAULT_PROMPT_PRESETS } from '../src/preset-engine.js';

test('origin-engine: normalizeOriginState returns full state with safe fallbacks', () => {
  const empty = normalizeOriginState(null);
  assert.equal(empty.enabled, false);
  assert.equal(empty.level, 1);
  assert.equal(empty.points, 0);
  assert.ok(Array.isArray(empty.tasks));
  assert.ok(Array.isArray(empty.shop));
  assert.ok(empty.shop.length > 0);
  assert.ok(Array.isArray(empty.gachaPool));

  const partial = normalizeOriginState({ points: 500, level: 3, tasks: [{ id: 1, title: '初入江湖' }] });
  assert.equal(partial.points, 500);
  assert.equal(partial.level, 3);
  assert.equal(partial.tasks.length, 1);
});

test('origin-engine: task remaining turns and expiry logic', () => {
  const task = { id: 1, title: '限时试炼', limit: 5, startTurn: 2, status: 'active' };
  assert.equal(taskRemainingTurns(task, 4), 3);
  assert.equal(isTaskExpired(task, 4), false);
  assert.equal(taskRemainingTurns(task, 7), 0);
  assert.equal(isTaskExpired(task, 7), true);

  // 防负数回合差 bug：15 回合在初始或 currentTurn 小于 startTurn 时绝不会变成 115
  const task15 = { id: 3, title: '15回合任务', limit: 15, startTurn: 100, status: 'active' };
  assert.equal(taskRemainingTurns(task15, 0), 15);
  assert.equal(taskRemainingTurns(task15, 100), 15);
  assert.equal(taskRemainingTurns(task15, 105), 10);

  const state = normalizeOriginState({
    tasks: [
      { id: 1, title: '普通任务', limit: 0, status: 'active' },
      { id: 2, title: '超时任务', limit: 3, startTurn: 1, status: 'active', penalty: '积分-50' },
    ],
    points: 100,
  });

  const expired = checkOriginExpiry(state, 5);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].id, 2);
  assert.equal(state.tasks.find(t => t.id === 2).status, 'failed');
  assert.equal(state.points, 50);
});

test('origin-engine: exp gain and level up math', () => {
  const state = normalizeOriginState({ level: 1, exp: 80, expMax: 100 });
  gainOriginExp(state, 50);
  assert.equal(state.level, 2);
  assert.equal(state.exp, 30);
  assert.equal(state.expMax, 140);
});

test('origin-engine: shop buying, bag item consumption, and stat effects', () => {
  const state = normalizeOriginState({
    points: 1000,
    shop: [{ name: '洗髓丹', price: 300, desc: '体魄+5', effect: '体魄+5' }],
    bag: [],
  });

  // 购买商品
  buyShopItem(state, '洗髓丹');
  assert.equal(state.points, 700);
  assert.equal(state.bag.length, 1);
  assert.equal(state.bag[0].name, '洗髓丹');
  assert.equal(state.bag[0].count, 1);

  // 积分不足购买报错
  state.points = 100;
  assert.throws(() => buyShopItem(state, '洗髓丹'), /积分不足/);

  // 使用背包物品
  useBagItem(state, '洗髓丹');
  assert.equal(state.bag.length, 0);
  assert.equal(state.stats.find(s => s.name === '体魄')?.val, 5);
  assert.equal(state.pendingUse.length, 1);
  assert.equal(state.pendingUse[0].name, '洗髓丹');
});

test('origin-engine: gacha draw consumes points and produces pool items', () => {
  const state = normalizeOriginState({
    points: 600,
    drawCost: 300,
    bag: [],
  });

  const results = performGachaDraw(state, 2);
  assert.equal(results.length, 2);
  assert.equal(state.points, 0);
  assert.equal(state.bag.reduce((sum, item) => sum + item.count, 0), 2);
});

test('origin-injection: buildOriginInjection builds structured prompt and budget clamps', () => {
  const state = normalizeOriginState({
    enabled: true,
    sysName: '天道模拟系统',
    points: 1200,
    level: 2,
    stats: [{ name: '魅力', val: 18 }],
    tasks: [{ id: 1, type: '主线', title: '拜入仙门', cond: '通过入门考核', reward: '积分+500', progress: 50, status: 'active' }],
    budget: 500,
  });

  const prompt = buildOriginInjection(state, { currentTurn: 1 });
  assert.ok(prompt.includes('【天道模拟系统 状态】'));
  assert.ok(prompt.includes('积分：1200'));
  assert.ok(prompt.includes('拜入仙门'));
  assert.ok(prompt.length <= 500);
});

test('origin-injection: parseOriginBlock parses all actions from <origin> block', () => {
  const reply = `
剧情正文正在继续推进中……
<origin>
进度|1|80|与大师兄切磋获胜
新任务|类型:日常|标题:晨起练剑|描述:挥剑千次|条件:在演武场练功|奖励:积分50 力量+1|时限:3
积分|+200|突破境界奖励
属性|力量|+2
技能|御剑术|基础御剑法门
获得|聚气丹|3
播报|恭喜宿主修为更进一步！
私聊|系统|干得不错，今晚别偷懒。
成就|初入修真|成功完成引气入体
</origin>
`;

  const parsed = parseOriginBlock(reply);
  assert.ok(parsed);
  assert.equal(parsed.actions.length, 9);
  assert.equal(parsed.actions.find(a => a.type === 'progress')?.progress, 80);
  assert.equal(parsed.actions.find(a => a.type === 'new-task')?.task.title, '晨起练剑');
  assert.equal(parsed.actions.find(a => a.type === 'points')?.delta, 200);
  assert.equal(parsed.actions.find(a => a.type === 'stat')?.name, '力量');
  assert.equal(parsed.actions.find(a => a.type === 'stat')?.delta, 2);

  // 自定义标签支持（支持 <系统> 或自定义 XML 标签）
  const customReply = `
正文内容...
<系统>
完成|1
积分|+50
</系统>
`;
  const parsedCustom = parseOriginBlock(customReply);
  assert.ok(parsedCustom);
  assert.equal(parsedCustom.actions.length, 2);

  const customReply2 = `
正文内容...
<quest>
完成|2
</quest>
`;
  const parsedCustom2 = parseOriginBlock(customReply2, '<quest>([\\s\\S]*?)</quest>');
  assert.ok(parsedCustom2);
  assert.equal(parsedCustom2.actions.length, 1);
  assert.equal(parsed.actions.find(a => a.type === 'skill')?.name, '御剑术');
  assert.equal(parsed.actions.find(a => a.type === 'item-gain')?.name, '聚气丹');
  assert.equal(parsed.actions.find(a => a.type === 'item-gain')?.count, 3);
  assert.equal(parsed.actions.find(a => a.type === 'broadcast')?.message, '恭喜宿主修为更进一步！');
  assert.equal(parsed.actions.find(a => a.type === 'private-chat')?.message, '干得不错，今晚别偷懒。');
  assert.equal(parsed.actions.find(a => a.type === 'achievement')?.name, '初入修真');

  const cleanText = stripOriginBlock(reply);
  assert.equal(cleanText, '剧情正文正在继续推进中……');
});

test('origin-injection: applyOriginBlock updates state and handles broadcasts', () => {
  const state = normalizeOriginState({
    points: 100,
    tasks: [{ id: 1, title: '初级试炼', progress: 10, status: 'active' }],
    bag: [],
  });

  const block = parseOriginBlock(`<origin>
进度|1|100|完成了目标
积分|+300|完成任务
新任务|类型:主线|标题:下山历练|条件:离开宗门|奖励:积分1000|时限:10
播报|已晋升内门弟子
私聊|系统|前方道路凶险，多加小心。
</origin>`);

  const res = applyOriginBlock(state, block, { currentTurn: 3 });
  assert.equal(state.tasks.find(t => t.id === 1)?.status, 'done');
  assert.equal(state.points, 400);
  assert.equal(state.tasks.some(t => t.title === '下山历练'), true);
  assert.equal(res.broadcasts.length, 2); // 1 from new-task announcement, 1 from broadcast
  assert.equal(res.privateChats.length, 1);
  assert.equal(res.privateChats[0].message, '前方道路凶险，多加小心。');
});

test('store: system contact automatically added when origin is enabled, removed when disabled', async () => {
  const target = { metadata: { pocketPhone: {} }, saveMetadata: async () => {} };
  const store = createPhoneStore({ target });

  // 默认 origin.enabled === false，未启用时不生成系统联系人
  let s = store.read();
  assert.equal(s.contacts.some(c => c.id === SYSTEM_CONTACT_ID), false);

  // 启用 origin 系统
  await store.setOriginEnabled(true);
  s = store.read();
  assert.ok(s.contacts.some(c => c.id === SYSTEM_CONTACT_ID));
  const sysContact = s.contacts.find(c => c.id === SYSTEM_CONTACT_ID);
  assert.equal(sysContact.nickname, '系统');

  // 禁用 origin 系统
  await store.setOriginEnabled(false);
  s = store.read();
  assert.equal(s.contacts.some(c => c.id === SYSTEM_CONTACT_ID), false);
});

test('origin-chat: buildSystemChatPrompt constructs proper instructions with host status', () => {
  const originState = normalizeOriginState({
    sysName: '全能万界系统',
    personality: '傲娇',
    points: 888,
    level: 3,
    tasks: [{ id: 1, title: '斩杀妖王', type: '主线', status: 'active', reward: '积分+500' }],
    bag: [{ name: '定风珠', count: 1 }],
  });

  const prompt = buildSystemChatPrompt({
    originState,
    userProfile: { name: '林逸' },
    conversation: [{ role: 'user', text: '系统，这定风珠要怎么用？' }],
  });

  assert.ok(prompt.system.includes('你是绑定在【林逸】身上的专属金手指系统【全能万界系统】'));
  assert.ok(prompt.system.includes('宿主积分：888'));
  assert.ok(prompt.system.includes('斩杀妖王'));
  assert.ok(prompt.system.includes('定风珠×1'));
  assert.equal(prompt.messages.length, 1);
  assert.equal(prompt.messages[0].content, '系统，这定风珠要怎么用？');
});

test('origin-ui: renderOrigin outputs mobile tabs, hero status card, and task items', () => {
  const state = {
    origin: normalizeOriginState({
      enabled: true,
      sysName: '神级辅助系统',
      points: 2500,
      level: 4,
      tasks: [
        { id: 1, type: '主线', title: '探寻古神遗迹', cond: '搜集三把神钥', progress: 66, status: 'active', reward: '积分+2000' },
      ],
      shop: [{ name: '回天丹', price: 500, desc: '重伤痊愈', effect: '气血满值' }],
      bag: [{ name: '玄铁重剑', count: 1, desc: '锋锐异常' }],
    }),
  };

  const htmlTasks = renderOrigin(state, { ui: { originTab: 'tasks' } });
  assert.ok(htmlTasks.includes('神级辅助系统'));
  assert.ok(htmlTasks.includes('2500'));
  assert.ok(htmlTasks.includes('Lv.4'));
  assert.ok(htmlTasks.includes('探寻古神遗迹'));
  assert.ok(htmlTasks.includes('data-action="origin-open-sms"'));
  assert.ok(htmlTasks.includes('origin-task-cond-label'));
  assert.ok(htmlTasks.includes('origin-task-cond-content'));

  const htmlShop = renderOrigin(state, { ui: { originTab: 'shop' } });
  assert.ok(htmlShop.includes('回天丹'));
  assert.ok(htmlShop.includes('500 积分'));

  const htmlBag = renderOrigin(state, { ui: { originTab: 'bag' } });
  assert.ok(htmlBag.includes('玄铁重剑'));
  assert.ok(htmlBag.includes('×1'));
});

test('origin-ui: header navigation, default naming "系统", and mobile settings cards', () => {
  const defaultState = { origin: normalizeOriginState({}) };

  // 1. 主页面：标题默认为“系统”，返回桌面按钮 data-action="origin-back"
  const htmlMain = renderOrigin(defaultState, { ui: { originShowSettings: false } });
  assert.ok(htmlMain.includes('<h1>系统</h1>'));
  assert.ok(htmlMain.includes('data-action="origin-back"'));
  assert.equal(htmlMain.includes('Origin 系统'), false);

  // 2. 设置页：标题为“系统设置”，返回按钮为 data-action="origin-close-settings"
  const htmlSettings = renderOrigin(defaultState, { ui: { originShowSettings: true } });
  assert.ok(htmlSettings.includes('<h1>系统设置</h1>'));
  assert.ok(htmlSettings.includes('data-action="origin-close-settings"'));
  assert.ok(htmlSettings.includes('class="origin-settings-card"'));
  assert.ok(htmlSettings.includes('compact-switch-row'));
  assert.ok(htmlSettings.includes('class="switch"'));
  assert.ok(htmlSettings.includes('启用系统'));
  assert.ok(htmlSettings.includes('name="tagRegex"'));
  assert.ok(htmlSettings.includes('name="storyRegex"'));
  assert.equal(htmlSettings.includes('启用 Origin 系统'), false);
});

test('origin-ui: modal dialogs use solid backdrop/dialog classes and close actions', () => {
  const state = { origin: normalizeOriginState({ enabled: true }) };

  // 1. 期望方向弹窗
  const htmlDir = renderOrigin(state, { ui: { originModal: 'direction' } });
  assert.ok(htmlDir.includes('origin-modal-backdrop'));
  assert.ok(htmlDir.includes('origin-modal-dialog'));
  assert.ok(htmlDir.includes('data-action="origin-close-modal"'));
  assert.equal(htmlDir.includes('onclick="event.stopPropagation()"'), false);

  // 2. 发布任务弹窗
  const htmlTask = renderOrigin(state, { ui: { originModal: 'edit-task' } });
  assert.ok(htmlTask.includes('origin-modal-backdrop'));
  assert.ok(htmlTask.includes('origin-modal-dialog'));
  assert.ok(htmlTask.includes('data-action="origin-close-modal"'));
  assert.equal(htmlTask.includes('onclick="event.stopPropagation()"'), false);

  // 3. 祈愿奖池等级标签
  const htmlGacha = renderOrigin(state, { ui: { originTab: 'gacha' } });
  assert.ok(htmlGacha.includes('origin-tier-badge'));
  assert.ok(htmlGacha.includes('tier-UR'));
  assert.ok(htmlGacha.includes('tier-SSR'));
});

test('origin-architecture: settings backflow control, prompt library, and log preview integration', async () => {
  // 1. 提示词库注册验证
  assert.equal(getPrompt('origin_system'), ORIGIN_SYSTEM_PROMPT);
  assert.equal(getPrompt('origin_chat'), ORIGIN_CHAT_PROMPT);
  assert.equal(PROMPT_MACRO_MAP.origin_system, '{{origin_prompt}}');
  assert.equal(PROMPT_MACRO_MAP.origin_chat, '{{origin_chat_prompt}}');

  // 2. 设置界面中的正文带入开关
  const mockStateOn = {
    origin: normalizeOriginState({ enabled: true }),
    injectOriginEnabled: true,
  };
  const settingsHtml = renderSettings(mockStateOn, {
    ui: { drawers: { content: true }, apiDraft: {} },
    busy: new Set(),
    apiSettings: { listSources: () => [{ ref: 'test' }], getSelected: () => 'test' },
    entries: { read: () => ({}) },
    appearance: { particlesEnabled: () => false },
    control: { isEnabled: () => true },
  });
  assert.ok(settingsHtml.includes('id="inject-origin-enabled"'));
  assert.ok(settingsHtml.includes('系统任务带入正文'));

  const logHtml = renderLogSettings(mockStateOn, { backflowExpanded: true }, {
    logger: {
      getLogs: () => [],
      getLastBackflowPrompt: () => '[金手指系统：状态]',
    },
  });
  assert.ok(logHtml.includes('带入正文开启'));
  assert.ok(logHtml.includes('[金手指系统：状态]'));

  // 3. 回流服务控制：开启时带入正文，关闭时不带入
  const mockTarget = {
    user: '宿主',
    messages: [{ role: 'user', text: '你好' }, { role: 'assistant', text: '开始剧情' }],
    metadata: {
      pocketPhone: {
        origin: normalizeOriginState({ enabled: true, points: 666 }),
        injectOriginEnabled: true,
      },
    },
    saveMetadata: async () => {},
  };
  const store = createPhoneStore({ target: mockTarget });

  const backflowServiceOn = createBackflowService({
    target: mockTarget,
    store,
    isEnabled: () => true,
  });
  const promptOn = await backflowServiceOn.prepare('normal');
  assert.ok(promptOn.includes('系统 状态'));
  assert.ok(promptOn.includes('积分：666'));

  // 关闭 injectOriginEnabled 开关
  await store.setInjectOriginEnabled(false);
  const backflowServiceOff = createBackflowService({
    target: mockTarget,
    store,
    isEnabled: () => true,
  });
  const promptOff = await backflowServiceOff.prepare('normal');
  assert.equal(promptOff, '');
});

test('origin-architecture: preset scope "系统" and compilePromptPreset binding', () => {
  // 1. 验证 PRESET_SCOPES 包含 "系统"
  const sysScope = PRESET_SCOPES.find(s => s.id === '系统');
  assert.ok(sysScope, 'PRESET_SCOPES 必须包含 "系统" 作用域');
  assert.equal(sysScope.name, '系统');

  // 2. 验证与系统私聊时 (taskScope === '系统')
  const defaultPreset = DEFAULT_PROMPT_PRESETS[0];
  const compiled = compilePromptPreset(defaultPreset, {
    originPromptText: '你是随身系统设定指令',
    latestUserInput: '系统，在吗？',
    charPersonality: '系统人格设定',
  }, '系统');

  // 应该包含系统私聊或系统注入条目
  const contents = compiled.map(c => c.content).join('\n\n');
  assert.ok(contents.includes('金手指系统专属私聊') || contents.includes('随身金手指系统') || contents.includes('你是随身系统设定指令'));
  // 普通角色私聊规则不应在仅系统任务中生效（若其 scope 为 短信）
  const messagesEntry = compiled.find(c => c.id === 'entry_messages_rules');
  assert.equal(messagesEntry, undefined, '普通短信规则不应在系统私聊中混入');
});

test('origin-route-a: SMS chat system automatically parses quest and reward commands', async () => {
  const mockTarget = {
    user: '宿主',
    messages: [{ role: 'user', text: '主线开始' }],
    metadata: {
      pocketPhone: {
        origin: normalizeOriginState({ enabled: true, points: 100 }),
        conversations: {
          'contact:origin-system': [{ role: 'user', text: '给我发布一个新任务' }],
        },
      },
    },
    saveMetadata: async () => {},
  };
  const store = createPhoneStore({ target: mockTarget });
  const originService = createOriginService({ target: mockTarget, store, host: {} });

  const mockModelClient = {
    complete: async () => '宿主，已经为你规划好当前试炼。\n【新任务：主线 | 斩妖除魔 | 前往幽冥谷击败妖物 | 积分+300 力量+2 | 积分-50 | 5】\n【获得：积分+50 敏捷+1】',
  };
  const mockContextReader = {
    readForContact: async () => ({ story: [], history: [], clock: { time: '10:00' } }),
  };

  const { createMessageService } = await import('../src/messages.js');
  const messageService = createMessageService({
    target: mockTarget,
    store,
    contextReader: mockContextReader,
    modelClient: mockModelClient,
    originService,
  });

  const reply = await messageService.continueChat('contact:origin-system');
  assert.ok(reply && reply.length > 0);

  // 验证任务已自动入库
  const updatedState = store.read();
  const task = (updatedState.origin.tasks || []).find(t => t.title === '斩妖除魔');
  assert.ok(task, '任务应当通过路线 A 自动解析入库');
  assert.equal(task.type, '主线');
  assert.equal(task.cond, '前往幽冥谷击败妖物');

  // 验证积分与属性已增加
  assert.equal(updatedState.origin.points, 150, '积分应从 100 增至 150');
  const agiStat = (updatedState.origin.stats || []).find(s => s.name === '敏捷');
  assert.ok(agiStat && agiStat.val >= 1, '敏捷属性应自动增加');
});

test('origin-route-b: in-app AI conception for quests and stat evaluation', async () => {
  const mockTarget = {
    user: '宿主',
    messages: [{ role: 'user', text: '来到灵气复苏的都市' }, { role: 'assistant', text: '前方出现灵气漩涡' }],
    metadata: {
      pocketPhone: {
        origin: normalizeOriginState({ enabled: true, points: 200, stats: [{ name: '灵力', val: 10 }] }),
      },
    },
    saveMetadata: async () => {},
  };
  const store = createPhoneStore({ target: mockTarget });

  const mockModelClient = {
    complete: async (req) => {
      let reply = '{}';
      if (req.label === '系统 AI 构想任务') {
        reply = JSON.stringify({
          type: '支线',
          title: '探索灵气漩涡',
          desc: '调查都市异常出现的灵气漩涡源头',
          cond: '靠近源头并取得灵晶碎片',
          reward: '积分+500 灵力+5',
          penalty: '无',
          limit: 3,
        });
      } else if (req.label === '系统 AI 评估成长') {
        reply = JSON.stringify({
          summary: '宿主在灵气漩涡边缘领悟了吐纳之法，灵力大涨。',
          statChanges: [{ name: '灵力', delta: 5 }, { name: '悟性', delta: 2 }],
          pointsGain: 300,
        });
      }
      logs.push({
        title: req.label,
        entries: req.entries || [],
        systemPrompt: req.system,
        reply,
      });
      return reply;
    },
  };

  const logs = [];
  const originService = createOriginService({
    target: mockTarget,
    store,
    host: {},
    modelClient: mockModelClient,
    logger: { addLog: log => logs.push(log) },
  });

  // 1. AI 推演任务
  const newTask = await originService.conceiveTask();
  assert.equal(newTask.title, '探索灵气漩涡');
  assert.equal(newTask.type, '支线');
  const storedTask = store.read().origin.tasks.find(t => t.title === '探索灵气漩涡');
  assert.ok(storedTask, 'AI 构想的任务已写入 store');

  // 2. AI 评估属性成长
  const evalResult = await originService.evaluateStats();
  assert.ok(evalResult.summary.includes('吐纳之法'));
  const storedStats = store.read().origin.stats;
  const lingli = storedStats.find(s => s.name === '灵力');
  const wuxing = storedStats.find(s => s.name === '悟性');
  assert.equal(lingli.val, 15, '灵力从 10 增加 5 变为 15');
  assert.equal(wuxing.val, 2, '新增悟性 2');
  assert.equal(store.read().origin.points, 500, '积分增加 300 变为 500');

  // 3. 验证通过提示词预设装配管道拼接，并生成了包含 entries 的完整日志
  assert.ok(logs.some(l => l.title === '系统 AI 构想任务'));
  const taskLog = logs.find(l => l.title === '系统 AI 构想任务');
  assert.ok(Array.isArray(taskLog.entries) && taskLog.entries.length > 0, '构想任务应包含提示词预设装配条目');

  assert.ok(logs.some(l => l.title === '系统 AI 评估成长'));
  const evalLog = logs.find(l => l.title === '系统 AI 评估成长');
  assert.ok(Array.isArray(evalLog.entries) && evalLog.entries.length > 0, '评估成长应包含提示词预设装配条目');
});

test('origin-route-c: custom regex story harvesting without <origin> tags', async () => {
  const storyAiReply = `夜色深沉，主角屏气凝神，一剑刺穿了妖兽的心脏。\n【叮！完成任务：初次试炼】\n【叮！触发支线任务：夜袭黑风寨。奖励：积分+500】\n【系统提示：宿主首杀精英妖兽，力量+2，获得积分+100】\n【叮！获得道具：凝神丹x2】\n【系统提示：达成成就：初露锋芒】\n四周恢复了死寂。`;
  const mockTarget = {
    user: '宿主',
    messages: [
      { role: 'user', text: '动手！' },
      { role: 'assistant', text: storyAiReply, mes: storyAiReply },
    ],
    metadata: {
      pocketPhone: {
        conversations: {},
        origin: normalizeOriginState({
          enabled: true,
          points: 50,
          storyRegex: '【(?:叮[！!]|系统).*?】',
          tasks: [{ id: 9, title: '初次试炼', status: 'active', reward: '积分+50' }],
        }),
      },
    },
    saveMetadata: async () => {},
  };
  const store = createPhoneStore({ target: mockTarget });
  const logs = [];
  const phoneNotices = [];
  const originService = createOriginService({
    target: mockTarget,
    store,
    host: {},
    logger: { addLog: l => logs.push(l) },
    notifyPhone: n => phoneNotices.push(n),
  });

  await originService.harvestLastMessage();

  const state = store.read();
  // 1. 验证完成已有任务
  const finishedTask = (state.origin.tasks || []).find(t => t.id === 9);
  assert.equal(finishedTask.status, 'done', '应自动结算完成任务');

  // 2. 验证通过正则捕获了新任务
  const capturedTask = (state.origin.tasks || []).find(t => t.title.includes('夜袭黑风寨'));
  assert.ok(capturedTask, '应从正文方头括号中自动捕获任务');
  assert.equal(capturedTask.type, '支线');

  // 3. 验证捕获了属性变动
  const strengthStat = (state.origin.stats || []).find(s => s.name === '力量');
  assert.ok(strengthStat && strengthStat.val >= 2, '应从正文中捕获力量+2');

  // 4. 验证获得了背包道具
  const bagItem = (state.origin.bag || []).find(b => b.name === '凝神丹');
  assert.ok(bagItem && bagItem.count >= 2, '应从正文中捕获获得道具');

  // 5. 验证解锁了成就
  const ach = (state.origin.achievements || []).find(a => a.name === '初露锋芒');
  assert.ok(ach, '应从正文中捕获解锁成就');

  // 6. 验证生成了系统广播短信
  const sysThread = state.conversations['contact:origin-system'] || [];
  assert.ok(sysThread.length >= 2, '应将捕获的系统提示投递为系统私聊短信');
  assert.ok(sysThread.some(m => m.text.includes('夜袭黑风寨')));

  // 7. 验证记录了日志
  assert.ok(logs.some(l => l.title === '正文系统自定义正则侦听'));
});

test('origin-sms-card: renderOriginTaskCardsInText formats quest into clickable card', async () => {
  const { renderOriginTaskCardsInText } = await import('../src/ui/cards.js');
  const rawText = `【系统提示：宿主权限已确认】\n\n【新任务：日常 | 熄灯之后 | 在两小时内让江清让停止追问 | 积分+80 | 江清让好感度-5 | 2小时】`;
  const html = renderOriginTaskCardsInText(rawText);

  assert.ok(html.includes('origin-task-sms-card'));
  assert.ok(html.includes('data-action="origin-jump-app"'));
  assert.ok(html.includes('熄灯之后'));
  assert.ok(html.includes('日常'));
  assert.ok(html.includes('积分+80'));
  assert.ok(html.includes('前往系统'));
});

test('origin-scheme-c: shop and gacha catalog management, shelf refresh, and AI batch stock', async () => {
  const mockTarget = {
    user: '宿主',
    messages: [],
    metadata: {
      pocketPhone: {
        origin: normalizeOriginState({ enabled: true, points: 1000 }),
      },
    },
    saveMetadata: async () => {},
  };
  const store = createPhoneStore({ target: mockTarget });

  const mockModelCalls = [];
  const mockModelClient = {
    complete: async (req) => {
      mockModelCalls.push(req);
      if (req.label === '系统 AI 批量进货') {
        return JSON.stringify([
          { name: '太虚玄晶', price: 650, desc: '上古晶石', effect: '全属性+1', type: '宝物' },
          { name: '清心露', price: 120, desc: '清心凝神', effect: '解除心魔', type: '药品' },
        ]);
      }
      if (req.label === '系统 AI 扩充奖池') {
        return JSON.stringify([
          { name: '诛仙残剑', tier: 'SSR', weight: 4, desc: '无上凶煞之器', effect: '攻击+50' },
          { name: '灵霄羽衣', tier: 'SR', weight: 15, desc: '仙光流转的羽衣', effect: '魅力+5' },
        ]);
      }
      return '[]';
    },
  };

  const service = createOriginService({
    target: { messages: [] },
    store,
    host: {},
    modelClient: mockModelClient,
  });

  // 1. 验证商品总库基础数据与换一批货架刷新
  let state = store.read();
  assert.ok(state.origin.shopCatalog.length >= 18, '应初始化内置商品总库');
  assert.equal(state.origin.shop.length, 6, '货架上应有6件商品');

  await service.refreshShop(6);
  state = store.read();
  assert.equal(state.origin.shop.length, 6, '换一批后货架应维持6件商品');

  // 2. 验证手动增删商品总库
  await service.saveShopCatalogItem({
    name: '自制机关鸢',
    price: 350,
    desc: '巧夺天工的飞行木鸢',
    effect: '敏捷+3',
  });
  state = store.read();
  assert.ok(state.origin.shopCatalog.some(i => i.name === '自制机关鸢'), '应成功添加至商品总库');

  await service.deleteShopCatalogItem('自制机关鸢');
  state = store.read();
  assert.ok(!state.origin.shopCatalog.some(i => i.name === '自制机关鸢'), '应从商品总库中成功删除');

  // 3. 验证 AI 批量进货
  const stockResult = await service.conceiveShopItems();
  assert.equal(stockResult.count, 2);
  state = store.read();
  assert.ok(state.origin.shopCatalog.some(i => i.name === '太虚玄晶'));
  assert.ok(state.origin.shopCatalog.some(i => i.name === '清心露'));
  assert.equal(mockModelCalls[0].label, '系统 AI 批量进货');
  assert.ok(mockModelCalls[0].entries.length > 0, '模型调用应挂载 prompt 管道 entries');

  // 4. 验证祈愿总库基础数据与轮换
  assert.ok(state.origin.gachaCatalog.length >= 21, '应初始化内置祈愿总库');
  assert.ok(state.origin.gachaPool.length >= 5, '祈愿预览应有商品');

  await service.refreshGacha();
  state = store.read();
  assert.equal(state.origin.gachaPool.length, 7, '轮换后涵盖N/R/SR/SSR/UR共7件展示');

  // 5. 验证手动增删奖池总库
  await service.saveGachaCatalogItem({
    name: '逆天神珠',
    tier: 'UR',
    weight: 1,
    desc: '汇聚天地法则',
    effect: '气运+99',
  });
  state = store.read();
  assert.ok(state.origin.gachaCatalog.some(i => i.name === '逆天神珠'));

  await service.deleteGachaCatalogItem('逆天神珠');
  state = store.read();
  assert.ok(!state.origin.gachaCatalog.some(i => i.name === '逆天神珠'));

  // 6. 验证 AI 扩充奖池
  const gachaResult = await service.conceiveGachaItems();
  assert.equal(gachaResult.count, 2);
  state = store.read();
  assert.ok(state.origin.gachaCatalog.some(i => i.name === '诛仙残剑'));
  assert.ok(state.origin.gachaCatalog.some(i => i.name === '灵霄羽衣'));
  assert.equal(mockModelCalls[1].label, '系统 AI 扩充奖池');
  assert.ok(mockModelCalls[1].entries.length > 0, '模型调用应挂载 prompt 管道 entries');

  // 7. 验证 UI 模态渲染 (总库弹窗)
  const shopCatalogHtml = renderOrigin(state, { ui: { originModal: 'shop-catalog' } });
  assert.ok(shopCatalogHtml.includes('商品总库'));
  assert.ok(shopCatalogHtml.includes('太虚玄晶'));
  assert.ok(shopCatalogHtml.includes('data-origin-form="shop-item"'));

  const gachaCatalogHtml = renderOrigin(state, { ui: { originModal: 'gacha-catalog' } });
  assert.ok(gachaCatalogHtml.includes('祈愿奖池总库'));
  assert.ok(gachaCatalogHtml.includes('诛仙残剑'));
  assert.ok(gachaCatalogHtml.includes('data-origin-form="gacha-item"'));
});
