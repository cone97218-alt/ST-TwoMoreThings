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
  gainSkillExp,
  saveSkill,
  deleteSkill,
  savePerk,
  deletePerk,
  applyStatEffect,
  buyShopItem,
  useBagItem,
  performGachaDraw,
  unlockAchievement,
  defaultOriginModuleTags,
} from '../src/origin-engine.js';
import {
  buildOriginInjection,
  parseOriginBlock,
  parseAllOriginTags,
  applyOriginBlock,
  stripOriginBlock,
  stripAllOriginTags,
} from '../src/origin-injection.js';
import { createSystemContact, buildSystemChatPrompt } from '../src/origin-chat.js';
import { createPhoneStore } from '../src/store.js';
import { renderOrigin } from '../src/ui/origin.js';
import { createBackflowService } from '../src/context.js';
import { getPrompt, ORIGIN_SYSTEM_PROMPT, ORIGIN_CHAT_PROMPT, ORIGIN_STATS_EVAL_PROMPT, PROMPT_MACRO_MAP } from '../src/prompts.js';
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
  assert.equal(empty.shop.length, 0, '默认商城商品为空');
  assert.ok(Array.isArray(empty.gachaPool));
  assert.equal(empty.gachaPool.length, 0, '默认祈愿奖池为空');

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
    gachaCatalog: [
      { name: '灵石碎片', tier: 'N', weight: 60 },
      { name: '凝神丹', tier: 'R', weight: 30 },
    ],
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
  const state = {
    origin: normalizeOriginState({
      enabled: true,
      gachaPool: [
        { name: '太古玄金剑', tier: 'UR', desc: '无上神兵' },
        { name: '虚空遁符', tier: 'SSR', desc: '瞬移千里' },
      ],
    }),
  };

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

  // 1. 验证默认商品总库为空与货架为空
  let state = store.read();
  assert.equal(state.origin.shopCatalog.length, 0, '默认商品总库应为空');
  assert.equal(state.origin.shop.length, 0, '默认商城货架应为空');

  await service.conceiveShopItems({ direction: '上古修仙法宝' });
  state = store.read();
  assert.ok(state.origin.shopCatalog.length >= 2, 'AI进货后商品总库增加');
  assert.ok(state.origin.shop.length >= 2, '进货后货架上架新商品');

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

  // 4. 验证祈愿总库默认状态
  assert.equal(state.origin.gachaCatalog.length, 0, '默认祈愿总库应为空');
  assert.equal(state.origin.gachaPool.length, 0, '默认祈愿预览应为空');

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
  const gachaResult = await service.conceiveGachaItems({ direction: '仙道神兵' });
  assert.equal(gachaResult.count, 2);
  state = store.read();
  assert.ok(state.origin.gachaCatalog.some(i => i.name === '诛仙残剑'));
  assert.ok(state.origin.gachaCatalog.some(i => i.name === '灵霄羽衣'));
  assert.ok(state.origin.gachaPool.length >= 2, '扩充奖池后祈愿展示池应有商品');
  const gachaCall = mockModelCalls.find(c => c.label === '系统 AI 扩充奖池');
  assert.ok(gachaCall, '应记录系统 AI 扩充奖池调用');
  assert.ok(gachaCall.entries.length > 0, '模型调用应挂载 prompt 管道 entries');

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

test('origin-modular-injection: selective section toggles and custom prompt templates', () => {
  // 1. 验证默认初始化带全套 sections
  const baseState = normalizeOriginState({
    enabled: true,
    sysName: '造化玄机系统',
    level: 3,
    points: 888,
    stats: [{ name: '神识', val: 50 }],
    tasks: [{ id: 10, type: '主线', title: '斩妖除魔', cond: '击杀妖王', reward: '神识+10', status: 'active' }],
    bag: [{ name: '定魄珠', count: 1 }],
    shop: [{ name: '洗髓灵丹', price: 500 }],
  });

  assert.ok(baseState.sections.panel.enabled);
  assert.ok(baseState.sections.tasks.enabled);
  assert.ok(baseState.sections.inventory.enabled);
  assert.ok(baseState.sections.action.enabled);
  assert.ok(baseState.sections.rules.enabled);
  assert.ok(baseState.sections.output.enabled);

  // 默认全部开启时，包含系统状态、任务、背包与商城、回传标签
  const defaultPrompt = buildOriginInjection(baseState, { currentTurn: 1 });
  assert.ok(defaultPrompt.includes('【造化玄机系统 状态】'));
  assert.ok(defaultPrompt.includes('斩妖除魔'));
  assert.ok(defaultPrompt.includes('定魄珠×1'));
  assert.ok(defaultPrompt.includes('<origin>'));

  // 2. 验证留空不注入（哪怕开关开启，若模板留空则完全不注入）
  const emptyState = normalizeOriginState({
    ...baseState,
    sections: {
      panel: { enabled: true, template: '' }, // 留空
      tasks: { enabled: true, template: '宿主当前任务：\n{{tasks}}' },
      inventory: { enabled: true, template: '' }, // 留空
      action: { enabled: true, template: '' }, // 留空
      rules: { enabled: true, template: '' }, // 留空
      output: { enabled: true, template: '' }, // 留空
    },
  });

  const partialPrompt = buildOriginInjection(emptyState, { currentTurn: 1 });
  assert.ok(!partialPrompt.includes('【造化玄机系统 状态】'), '留空后面板不得注入');
  assert.ok(partialPrompt.includes('宿主当前任务：'), '有模板的任务正常注入');
  assert.ok(partialPrompt.includes('斩妖除魔'));
  assert.ok(!partialPrompt.includes('背包：'), '留空后背包不得注入');
  assert.ok(!partialPrompt.includes('<origin>'), '留空后规范不得注入');

  // 3. 自由编辑每一部分的提示词模板
  const templatedState = normalizeOriginState({
    ...baseState,
    sections: {
      panel: { enabled: true, template: '【修仙系统】宿主神识: {{stats}}，当前积分: {{points}}点' },
      tasks: { enabled: true, template: '[当前要务]\n{{tasks}}' },
      inventory: { enabled: false, template: '' },
      action: { enabled: false, template: '' },
      rules: { enabled: true, template: '【核心法则】系统为至高存在，请宿主谨遵指引。' },
      output: { enabled: true, template: '【格式要求】请仅在小说结尾输出简要结算卡片。' },
    },
  });

  const templatedPrompt = buildOriginInjection(templatedState, { currentTurn: 1 });
  assert.ok(templatedPrompt.includes('【修仙系统】宿主神识: 神识+50，当前积分: 888点'));
  assert.ok(templatedPrompt.includes('[当前要务]'));
  assert.ok(templatedPrompt.includes('斩妖除魔'));
  assert.ok(templatedPrompt.includes('【核心法则】系统为至高存在，请宿主谨遵指引。'));
  assert.ok(templatedPrompt.includes('【格式要求】请仅在小说结尾输出简要结算卡片。'));

  // 4. 验证 UI 设置卡片渲染
  const uiSettingsHtml = renderOrigin({ origin: templatedState }, { ui: { originShowSettings: true } });
  assert.ok(uiSettingsHtml.includes('正文注入模块与提示词定制'));
  assert.ok(uiSettingsHtml.includes('name="section_panel_enabled"'));
  assert.ok(uiSettingsHtml.includes('name="section_tasks_enabled"'));
  assert.ok(uiSettingsHtml.includes('name="section_inventory_enabled"'));
  assert.ok(uiSettingsHtml.includes('name="section_rules_enabled"'));
  assert.ok(uiSettingsHtml.includes('name="section_output_enabled"'));
  assert.ok(uiSettingsHtml.includes('name="section_panel_template"'));
  assert.ok(uiSettingsHtml.includes('【修仙系统】宿主神识'));
});

test('origin-independent-tags: user-customized independent XML tags, single-pass parsing and zero-overhead stripping', () => {
  // 1. 用户自定义标签别名
  const customModuleTags = {
    achievement: '功业, achievement, 成就',
    skill: '神通, 功法, skill',
    stat: '数值, stat, 状态',
    task: '使命, task, 任务',
    points: '经验, points, 积分',
    item: '宝物, 获得, 道具',
    perk: '命格, perk, 权限',
    broadcast: '系统通报, notice, 播报',
    chat: '传音, 私聊, chat',
    origin: '系统面板, origin, 系统',
  };

  const storyReply = `
他深吸一口气，体内的灵力如江海翻涌，瞬间冲破了筑基期的瓶颈。
<功业>一剑开天|自创绝世剑招并击退兽潮</功业>
苍穹之上雷云密布，一道金光穿云而下。
<神通>九霄神雷诀|引九天落雷轰击强敌</神通>
四周的同门弟子目瞪口呆，惊呼出声。
<数值>力量+8 敏捷+4 灵力+15</数值>
<使命>类型:主线|标题:探秘幽冥谷|条件:查探魔物源头|奖励:积分1000|时限:5</使命>
<经验>+300|突破境界感悟</经验>
<宝物>万年雷击木|1</宝物>
<命格>天道庇佑|遭遇致命危险时概率免死</命格>
<系统通报>恭喜宿主成功晋升！</系统通报>
<传音>掌门真人|后生可畏，明日速来主殿见我。</传音>
他收剑入鞘，神色恢复了往日的平静。
`;

  // 2. 单次扫描捕获验证 (Single-Pass matchAll)
  const parsed = parseAllOriginTags(storyReply, customModuleTags);
  assert.ok(parsed);
  assert.equal(parsed.hasMatchedTags, true);
  assert.equal(parsed.actions.length, 11);

  // 验证各独立模块的精准识别
  const ach = parsed.actions.find(a => a.type === 'achievement');
  assert.equal(ach?.name, '一剑开天');
  assert.equal(ach?.desc, '自创绝世剑招并击退兽潮');

  const sk = parsed.actions.find(a => a.type === 'skill');
  assert.equal(sk?.name, '九霄神雷诀');
  assert.equal(sk?.desc, '引九天落雷轰击强敌');

  const stats = parsed.actions.filter(a => a.type === 'stat');
  assert.equal(stats.length, 3);
  assert.equal(stats.find(s => s.name === '力量')?.delta, 8);
  assert.equal(stats.find(s => s.name === '敏捷')?.delta, 4);
  assert.equal(stats.find(s => s.name === '灵力')?.delta, 15);

  const task = parsed.actions.find(a => a.type === 'new-task');
  assert.equal(task?.task?.title, '探秘幽冥谷');
  assert.equal(task?.task?.type, '主线');
  assert.equal(task?.task?.limit, 5);

  const pts = parsed.actions.find(a => a.type === 'points');
  assert.equal(pts?.delta, 300);

  const itm = parsed.actions.find(a => a.type === 'item-gain');
  assert.equal(itm?.name, '万年雷击木');
  assert.equal(itm?.count, 1);

  const perk = parsed.actions.find(a => a.type === 'perk');
  assert.equal(perk?.name, '天道庇佑');

  const bc = parsed.actions.find(a => a.type === 'broadcast');
  assert.equal(bc?.message, '恭喜宿主成功晋升！');

  const ch = parsed.actions.find(a => a.type === 'private-chat');
  assert.equal(ch?.sender, '掌门真人');
  assert.equal(ch?.message, '后生可畏，明日速来主殿见我。');

  // 3. 正文单次线性剥离验证 (Single-Pass strip)
  const stripped = stripAllOriginTags(storyReply, customModuleTags);
  assert.ok(!stripped.includes('<功业>'));
  assert.ok(!stripped.includes('<神通>'));
  assert.ok(!stripped.includes('<数值>'));
  assert.ok(!stripped.includes('<使命>'));
  assert.ok(!stripped.includes('<经验>'));
  assert.ok(!stripped.includes('<宝物>'));
  assert.ok(!stripped.includes('<命格>'));
  assert.ok(!stripped.includes('<系统通报>'));
  assert.ok(!stripped.includes('<传音>'));
  assert.ok(stripped.includes('他深吸一口气，体内的灵力如江海翻涌，瞬间冲破了筑基期的瓶颈。'));
  assert.ok(stripped.includes('苍穹之上雷云密布，一道金光穿云而下。'));
  assert.ok(stripped.includes('四周的同门弟子目瞪口呆，惊呼出声。'));
  assert.ok(stripped.includes('他收剑入鞘，神色恢复了往日的平静。'));

  // 4. 状态入库应用验证
  const state = normalizeOriginState({
    enabled: true,
    points: 100,
    moduleTags: customModuleTags,
  });
  const applyRes = applyOriginBlock(state, parsed, { currentTurn: 1 });
  assert.equal(state.points, 400); // 100 + 300
  assert.equal(state.stats.find(s => s.name === '力量')?.val, 8);
  assert.equal(state.skills.find(s => s.name === '九霄神雷诀')?.desc, '引九天落雷轰击强敌');
  assert.equal(state.achievements.find(a => a.name === '一剑开天')?.desc, '自创绝世剑招并击退兽潮');
  assert.equal(state.bag.find(b => b.name === '万年雷击木')?.count, 1);
  assert.equal(state.tasks.length, 1);
  assert.equal(applyRes.broadcasts.length, 3); // new-task, achievement, broadcast
  assert.equal(applyRes.privateChats.length, 1);

  // 5. 性能验证：1000 次连续解析与剥离耗时测试 (单次遍历在毫秒级内完成)
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    parseAllOriginTags(storyReply, customModuleTags);
    stripAllOriginTags(storyReply, customModuleTags);
  }
  const duration = performance.now() - start;
  // 1000 次长文本遍历在 modern JS 引擎中通常耗时 < 150ms (即单次 < 0.15ms)
  assert.ok(duration < 1000, `单次扫描剥离性能极高 (1000次仅耗时 ${duration.toFixed(2)}ms)`);

  // 6. UI 独立标签设置渲染验证
  const uiSettingsHtml = renderOrigin({ origin: state }, { ui: { originShowSettings: true } });
  assert.ok(uiSettingsHtml.includes('各模块独立捕获标签 (自定义 XML 标签别名)'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_achievement"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_skill"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_stat"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_task"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_points"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_item"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_perk"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_broadcast"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_chat"'));
  assert.ok(uiSettingsHtml.includes('name="moduleTag_origin"'));
});

test('origin-skills: hybrid pure text and proficiency experience bar support, XML exp increment, and UI display', () => {
  // 1. 初始化包含纯文字技能和带经验条技能的状态
  const state = normalizeOriginState({
    enabled: true,
    skills: [
      { name: '太极云手', desc: '以柔克刚的防守招式' }, // 纯文字技能，无经验条
      { name: '御剑术', desc: '御剑飞行与攻敌', level: 1, exp: 80, expMax: 100 }, // 带等级与经验条
    ],
  });

  // 验证纯文字技能字段保持 null
  const pureSkill = state.skills.find(s => s.name === '太极云手');
  assert.equal(pureSkill.level, null);
  assert.equal(pureSkill.exp, null);
  assert.equal(pureSkill.expMax, null);

  const expSkill = state.skills.find(s => s.name === '御剑术');
  assert.equal(expSkill.level, 1);
  assert.equal(expSkill.exp, 80);
  assert.equal(expSkill.expMax, 100);

  // 2. 提示词注入验证：纯文字技能保持原本纯文字，带经验条技能注入 Lv 与熟练度
  const prompt = buildOriginInjection(state, { currentTurn: 1 });
  assert.ok(prompt.includes('太极云手（以柔克刚的防守招式）'), '纯文字技能注入格式保持纯文字');
  assert.ok(!prompt.includes('太极云手 [Lv.'), '纯文字技能不得带有 Lv 标签');
  assert.ok(prompt.includes('御剑术 [Lv.1 熟练度:80/100]（御剑飞行与攻敌）'), '带经验条技能正常注入等级与熟练度');

  // 3. 技能经验增长与升级逻辑
  // 增长 30 经验，80 + 30 = 110 >= 100，触发突破升级至 Lv.2，剩余 10 经验，上限变为 150
  gainSkillExp(state, '御剑术', 30);
  assert.equal(expSkill.level, 2);
  assert.equal(expSkill.exp, 10);
  assert.equal(expSkill.expMax, 150);

  // 为纯文字技能增加经验，自动平滑升级为带经验条技能
  gainSkillExp(state, '太极云手', 25);
  assert.equal(pureSkill.level, 1);
  assert.equal(pureSkill.exp, 25);
  assert.equal(pureSkill.expMax, 100);

  // 4. 正文 XML 技能经验标签解析与应用
  const replyWithSkillExp = `
他在静室中闭关参悟数日。
<技能>御剑术+50</技能>
<技能>三昧真火|至刚至阳之火</技能>
剑光如虹破空而去！
`;
  const parsed = parseAllOriginTags(replyWithSkillExp);
  assert.ok(parsed);
  const actExp = parsed.actions.find(a => a.type === 'skill-exp');
  assert.ok(actExp);
  assert.equal(actExp.name, '御剑术');
  assert.equal(actExp.exp, 50);

  const actPure = parsed.actions.find(a => a.type === 'skill');
  assert.ok(actPure);
  assert.equal(actPure.name, '三昧真火');
  assert.equal(actPure.desc, '至刚至阳之火');

  applyOriginBlock(state, parsed, { currentTurn: 2 });
  assert.equal(expSkill.exp, 60); // 10 + 50
  assert.equal(state.skills.find(s => s.name === '三昧真火')?.desc, '至刚至阳之火');

  // 5. saveSkill 与 deleteSkill 增删改
  saveSkill(state, {
    name: '落雷术',
    desc: '召唤狂暴雷电',
    hasExp: true,
    level: 1,
    exp: 0,
    expMax: 80,
  });
  assert.equal(state.skills.find(s => s.name === '落雷术')?.expMax, 80);

  deleteSkill(state, '落雷术');
  assert.equal(state.skills.some(s => s.name === '落雷术'), false);

  // 6. UI 渲染验证：纯文字卡片显示启用按钮，经验卡片显示进度条与控制按钮
  const ui = {
    originTab: 'stats',
    originStatsEditing: true,
    originModal: 'edit-skill',
    originModalData: { name: '御剑术', level: 2, exp: 60, expMax: 150 },
  };
  const html = renderOrigin({ origin: state }, { ui });
  assert.ok(html.includes('origin-skill-card'));
  assert.ok(html.includes('EXP 60/150'));
  assert.ok(html.includes('data-action="origin-mod-skill-exp"'));
  assert.ok(html.includes('data-action="origin-open-new-skill"'));
  assert.ok(html.includes('data-origin-form="skill"'));
});

test('origin-growth-eval & ui-refinement: comprehensive prompt (stats/skills/perks) and refined modal UI', () => {
  // 1. 验证扩充后的综合成长与能力构建提示词覆盖属性、技能、特权
  assert.ok(ORIGIN_STATS_EVAL_PROMPT.includes('属性 / 技能 / 特权'));
  assert.ok(ORIGIN_STATS_EVAL_PROMPT.includes('newSkills'));
  assert.ok(ORIGIN_STATS_EVAL_PROMPT.includes('skillExpChanges'));
  assert.ok(ORIGIN_STATS_EVAL_PROMPT.includes('newPerks'));
  assert.ok(ORIGIN_STATS_EVAL_PROMPT.includes('newStats'));
  assert.ok(ORIGIN_STATS_EVAL_PROMPT.includes('statChanges'));

  // 2. 特权操作 savePerk 与 deletePerk 引擎函数验证
  const state = normalizeOriginState({
    enabled: true,
    stats: [],
    perks: [{ name: '过目不忘', desc: '阅读过的信息绝不遗忘' }],
    skills: [],
  });
  savePerk(state, { name: '天道庇佑', desc: '免除一次致命伤害' });
  assert.equal(state.perks.length, 2);
  assert.equal(state.perks.find(p => p.name === '天道庇佑')?.desc, '免除一次致命伤害');

  deletePerk(state, '过目不忘');
  assert.equal(state.perks.length, 1);
  assert.equal(state.perks[0].name, '天道庇佑');

  // 3. UI 界面布局与卡片优化验证 (空状态卡片化、标题徽章化、操作按钮组)
  const emptyHtml = renderOrigin({ origin: state }, { ui: { originTab: 'stats' } });
  assert.ok(emptyHtml.includes('origin-section-heading'), '标题拥有精美专用类');
  assert.ok(emptyHtml.includes('origin-count-chip'), '具有小巧美观的数量徽章');
  assert.ok(emptyHtml.includes('origin-section-actions'), '操作按钮整齐成组无突兀大加号');
  assert.ok(emptyHtml.includes('origin-empty-box'), '空状态包裹在精巧虚线卡片内');
  assert.ok(emptyHtml.includes('data-action="origin-open-new-stat"'), '属性提供新增弹窗按钮');
  assert.ok(emptyHtml.includes('data-action="origin-open-new-perk"'), '特权提供新增弹窗按钮');
  assert.ok(emptyHtml.includes('data-action="origin-open-new-skill"'), '技能提供新增弹窗按钮');

  // 4. 新增属性弹窗验证 (edit-stat)
  const statModalHtml = renderOrigin({ origin: state }, { ui: { originModal: 'edit-stat', originModalData: {} } });
  assert.ok(statModalHtml.includes('新增角色属性'));
  assert.ok(statModalHtml.includes('data-origin-form="stat"'));

  // 5. 新增特权弹窗验证 (edit-perk)
  const perkModalHtml = renderOrigin({ origin: state }, { ui: { originModal: 'edit-perk', originModalData: {} } });
  assert.ok(perkModalHtml.includes('新增永久特权'));
  assert.ok(perkModalHtml.includes('data-origin-form="perk"'));

  // 6. 新增技能弹窗验证 (edit-skill)
  const skillModalHtml = renderOrigin({ origin: state }, { ui: { originModal: 'edit-skill', originModalData: {} } });
  assert.ok(skillModalHtml.includes('新增技能'));
  assert.ok(skillModalHtml.includes('data-origin-form="skill"'));
});

test('origin-ui & guidance: simplified 属性->技能->特权 order, direction guidance modal, and aligned task badges', async () => {
  const originState = normalizeOriginState({
    enabled: true,
    stats: [{ name: '灵力', val: 20 }],
    skills: [{ name: '风刃术', desc: '风系初级法术' }],
    perks: [{ name: '御风者', desc: '身轻如燕' }],
    tasks: [{ id: 1, title: '晨间调息', type: '日常', status: 'active', limit: 100 }],
  });

  // 1. 验证面板顺序: 属性 -> 技能 -> 特权
  const html = renderOrigin({ origin: originState }, { ui: { originTab: 'stats' } });
  const statIndex = html.indexOf('h4 class="origin-section-heading">属性</h4>');
  const skillIndex = html.indexOf('h4 class="origin-section-heading">技能</h4>');
  const perkIndex = html.indexOf('h4 class="origin-section-heading">特权</h4>');

  assert.ok(statIndex !== -1, '包含简炼的“属性”标题');
  assert.ok(skillIndex !== -1, '包含简炼的“技能”标题');
  assert.ok(perkIndex !== -1, '包含简炼的“特权”标题');
  assert.ok(statIndex < skillIndex && skillIndex < perkIndex, '顺序严格为：属性 ➔ 技能 ➔ 特权');

  // 2. 验证特权卡片无粗暴的大字加粗
  assert.ok(!html.includes('origin-perk-card"><strong>'), '特权卡片标题杜绝大字粗体');
  assert.ok(html.includes('origin-perk-badge'), '特权卡片使用精致的徽章样式');

  // 3. 验证任务头部徽标同行水平对齐结构
  const taskHtml = renderOrigin({ origin: originState }, { ui: { originTab: 'tasks' } });
  assert.ok(taskHtml.includes('origin-task-meta-bar'), '任务卡片拥有专用的顶部元信息横栏');
  assert.ok(taskHtml.includes('origin-task-header-meta'), '包含统一的元徽章对齐容器');
  assert.ok(taskHtml.includes('origin-timer-chip'), '包含回合倒计时药丸');
  assert.ok(taskHtml.includes('origin-status-badge'), '包含任务状态徽章');

  // 4. 验证智能构想引导弹窗 (evaluate-stats-guidance)
  const guidanceModalHtml = renderOrigin({ origin: originState }, { ui: { originModal: 'evaluate-stats-guidance', originModalData: {} } });
  assert.ok(guidanceModalHtml.includes('智能成长评估与结算') || guidanceModalHtml.includes('智能构想能力面板'));
  assert.ok(guidanceModalHtml.includes('data-origin-form="evaluate-stats"'), '包含表单提交处理');
  assert.ok(guidanceModalHtml.includes('name="direction"'), '包含期望方向/流派偏好输入框');

  // 5. 验证推演加载状态
  const loadingModalHtml = renderOrigin({ origin: originState }, { ui: { originModal: 'evaluate-stats-guidance', isEvaluatingStats: true } });
  assert.ok(loadingModalHtml.includes('origin-loading-spinner'), '推演中显示旋转加载动效');
  assert.ok(loadingModalHtml.includes('正在推演中...'), '按钮显示推演中');

  // 6. 验证 evaluateStats 能够接收 direction 并送入 prompt
  let completedParams = null;
  const mockModelClient = {
    complete: async (params) => {
      completedParams = params;
      return JSON.stringify({
        summary: '宿主潜心修行风系术法，领悟了更深层次的御风诀。',
        statChanges: [{ name: '灵力', delta: 2 }],
        newSkills: [{ name: '烈风斩', desc: '汇聚狂风的一击', hasExp: true, level: 1, expMax: 100 }],
        pointsGain: 50,
      });
    },
  };
  const mockTarget = {
    metadata: { pocketPhone: { origin: originState, conversations: {} } },
    saveMetadata: async () => {},
  };
  const store = createPhoneStore({ target: mockTarget });
  const originService = createOriginService({
    target: mockTarget,
    store,
    modelClient: mockModelClient,
  });

  const evalResult = await originService.evaluateStats({ direction: '专修风系法术与高速身法' });
  assert.ok(evalResult.summary.includes('宿主潜心修行风系术法'));
  assert.ok(completedParams.system.includes('专修风系法术与高速身法') || completedParams.collapsedMessages.some(m => m.content.includes('专修风系法术与高速身法')), '用户填写的 direction 应注入到 prompt 参数中');

  // 7. 验证顶栏包含统一编辑管理键，平时为清爽只读模式
  assert.ok(html.includes('data-action="origin-toggle-stats-edit"'), '属性栏包含统一编辑切换键');
  assert.ok(!html.includes('data-action="origin-delete-stat"'), '只读模式下不显示属性删除按钮');
  assert.ok(!html.includes('data-action="origin-delete-skill"'), '只读模式下不显示技能删除按钮');
  assert.ok(!html.includes('data-action="origin-delete-perk"'), '只读模式下不显示特权删除按钮');

  // 8. 验证激活编辑模式后呼出全板块编辑删除键
  const editingHtml = renderOrigin({ origin: originState }, { ui: { originTab: 'stats', originStatsEditing: true } });
  assert.ok(editingHtml.includes('data-action="origin-delete-stat"'), '编辑模式下呼出属性删除按钮');
  assert.ok(editingHtml.includes('data-action="origin-delete-skill"'), '编辑模式下呼出技能删除按钮');
  assert.ok(editingHtml.includes('data-action="origin-delete-perk"'), '编辑模式下呼出特权删除按钮');

  // 9. 验证 deleteStat 方法
  await originService.deleteStat('灵力');
  assert.equal(store.read().origin.stats.find(s => s.name === '灵力'), undefined, 'deleteStat 应成功移除属性');
});
