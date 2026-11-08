// 提示词预设系统：支持多条目、自定义角色(ai/user/system)、开关、上下移动与插槽宏展开。

import {
  getPrompt,
  MESSAGES_PROMPT,
  THOUGHT_PROMPT,
  GROUP_PROMPT,
  CONTACTS_PROMPT,
  DIRECTORY_PROMPT,
  SOCIAL_PROMPT,
  COMMENT_PROMPT,
  FORUM_PROMPT,
  CALENDAR_PROMPT,
  FESTIVAL_CONCEIVE_PROMPT,
  SCHEDULE_DEDUCE_PROMPT,
  MAP_PROMPT,
  MAP_ORGANIZE_PROMPT,
  MAP_CALIBRATE_PROMPT,
  TODO_SUGGESTIONS_PROMPT,
  SUMMARY_PROMPT,
  RICH_MESSAGES_PROMPT,
  LANGUAGE_RULE,
  STORY_MEMORY_RULE,
  IMAGE_PROMPT,
  OLD_MAID_PROMPT,
  BUCKSHOT_ROULETTE_PROMPT,
  ORIGIN_SYSTEM_PROMPT,
  ORIGIN_CHAT_PROMPT,
  ORIGIN_TASK_CONCEIVE_PROMPT,
  ORIGIN_STATS_EVAL_PROMPT,
  ORIGIN_SHOP_CONCEIVE_PROMPT,
  ORIGIN_GACHA_CONCEIVE_PROMPT,
} from './prompts.js';
import { shortenMessageId, extractLatestUserInput } from './content.js';
import { formatCalendarEventPromptLine } from './calendar-engine.js';

export const PRESET_SLOTS = [
  { macro: '{{worldbook}}', name: '世界书', desc: '蓝灯常驻条目必定注入 + 绿灯关键字动态激活' },
  { macro: '{{story_history}}', name: '主聊天历史', desc: '主聊天最近 n 层的正文对白与动作' },
  { macro: '{{story_memory}}', name: '柏宝书记忆', desc: '若开启柏宝书，注入其长线剧情记忆摘要' },
  { macro: '{{phone_context}}', name: '手机内部数据', desc: '包含待办事项、日历节日、短信往来记录、公开动态等' },
  { macro: '{{latest_user_input}}', name: '最新用户输入', desc: '单聊/群聊中用户最新发出的连续发言、动态用户评论、或日历推演要求' },
  { macro: '{{char_personality}}', name: '角色线上表达', desc: '角色的线上文字风格、习惯与人设' },
  { macro: '{{messages_prompt}}', name: '私聊短信生成', desc: '仅私聊：短信回复与主动发信规则' },
  { macro: '{{thought_prompt}}', name: '角色隐秘心声推演', desc: '仅心声：推演角色发信时的隐秘心理与潜台词' },
  { macro: '{{groups_prompt}}', name: '群聊多角色续写', desc: '仅群聊：群成员发言动机与互动规则' },
  { macro: '{{social_prompt}}', name: 'Ainstagram 动态生成', desc: '仅动态：日常动态发布规则' },
  { macro: '{{comment_prompt}}', name: '动态评论互动回复', desc: '仅动态：留言评论与私信互动规则' },
  { macro: '{{forum_prompt}}', name: '公众论坛帖子生成', desc: '仅论坛：世界观外部路人论坛规则' },
  { macro: '{{festival_conceive_prompt}}', name: 'AI 节日构想助手', desc: '仅日历：构想民俗节日规则' },
  { macro: '{{schedule_deduce_prompt}}', name: 'AI 日程推演助手', desc: '仅日历：推演日程安排规则' },
  { macro: '{{map_prompt}}', name: '地图与位置线索注入', desc: '注入当前所在位置、所属分区与周边场所线索' },
  { macro: '{{map_organize_prompt}}', name: 'AI 地图构想与整理', desc: '仅地图：整理区域、场所与室内三层地图结构' },
  { macro: '{{map_calibrate_prompt}}', name: 'AI 百宝书地图方位校准', desc: '仅地图：对已有百宝书场景补齐空间相对方位与角色' },
  { macro: '{{todo_suggestions_prompt}}', name: '待办事项提取规则', desc: '短信提取待办与核对规则' },
  { macro: '{{rich_messages_prompt}}', name: '表情包与多媒体规则', desc: '表情包、转账与图片消息规则' },
  { macro: '{{language_rule}}', name: '语言与双语翻译规则', desc: '语种与外语中文译文规则' },
  { macro: '{{story_memory_rule}}', name: '剧情摘要知情范围规则', desc: '约束角色不能全知未公开的剧情记忆或他人私下对话' },
  { macro: '{{contacts_prompt}}', name: '联系人风格提炼', desc: '提炼角色线上文字表达习惯' },
  { macro: '{{directory_prompt}}', name: '通讯录批量整理', desc: '智能发掘可能存在的人物和群聊并建立档案' },
  { macro: '{{calendar_prompt}}', name: '日历话题线索注入', desc: '本周节日或纪念日话题提示' },
  { macro: '{{workday_holiday_prompt}}', name: '工作日/节假日作息提示', desc: '根据历法工作日、节假日或时段注入角色作息提示' },
  { macro: '{{summary_prompt}}', name: '短信回流正文记忆摘要', desc: '判断手机短信与待办哪些值得供正文参考' },
  { macro: '{{image_prompt}}', name: '照片转绘图描述提示词', desc: '自拍或照片描述转为生图提示词' },
  { macro: '{{old_maid_prompt}}', name: '抽鬼牌对决规则', desc: '仅单聊：抽鬼牌对决规则、主动邀约、协商赌注与心理战' },
  { macro: '{{buckshot_roulette_prompt}}', name: '恶魔轮盘对决规则', desc: '仅单聊：恶魔轮盘生死对决、主动邀约、生命道具与概率博弈' },
  { macro: '{{origin_prompt}}', name: '系统与任务线索注入', desc: '金手指系统状态、宿主属性、进行中任务及期望方向' },
  { macro: '{{origin_chat_prompt}}', name: '系统专属私聊规则', desc: '在手机短信中与随身系统直接私聊时的回复规则' },
  { macro: '{{origin_task_conceive_prompt}}', name: '系统推演新任务规则', desc: 'AI 构想新任务时的推演指引与 JSON 结构' },
  { macro: '{{origin_stats_eval_prompt}}', name: '系统综合成长规则 (属性/技能/特权)', desc: 'AI 结合剧情评估宿主属性、技能与特权成长或构建能力面板的规则' },
  { macro: '{{origin_shop_conceive_prompt}}', name: '系统商城进货规则', desc: 'AI 结合世界观批量构想新商品时的输出规范' },
  { macro: '{{origin_gacha_conceive_prompt}}', name: '系统祈愿扩充规则', desc: 'AI 结合世界观批量扩充五级稀有度奖池时的规范' },
];

export const PRESET_SCOPES = [
  // 通用与基础
  { id: '通用', name: '通用', group: '通用与基础', desc: '全部任务通用' },
  { id: '仅手机app', name: '仅手机app', group: '通用与基础', desc: '除生图/摘要外的手机任务' },

  // 短信与通讯
  { id: '短信', name: '短信', group: '短信与通讯', desc: '私聊短信日常交互生成' },
  { id: '群聊', name: '群聊', group: '短信与通讯', desc: '群聊多角色互动续写' },
  { id: '心声', name: '心声', group: '短信与通讯', desc: '角色隐秘内心独白推演' },
  { id: '联系人', name: '联系人', group: '短信与通讯', desc: '联系人线上风格提炼' },
  { id: '通讯录', name: '通讯录', group: '短信与通讯', desc: '通讯录批量发掘与建群' },
  { id: '小游戏', name: '小游戏', group: '短信与通讯', desc: '抽鬼牌与恶魔轮盘等对决' },

  // 社交与论坛
  { id: '动态发布', name: '动态发布', group: '社交与论坛', desc: 'Ainstagram 动态发布与配图描述' },
  { id: '动态评论', name: '动态评论', group: '社交与论坛', desc: '动态留言互动与主动私信' },
  { id: '动态', name: '动态', group: '社交与论坛', desc: '动态发布与评论全流程（通配兼容）' },
  { id: '论坛', name: '论坛', group: '社交与论坛', desc: '公众论坛帖子与回帖讨论' },

  // 地图与场景
  { id: '地图构想', name: '地图构想', group: '地图与场景', desc: 'AI 地图三层层级与设施构想' },
  { id: '地图校准', name: '地图校准', group: '地图与场景', desc: 'AI 百宝书地图方位与属性严格校准' },
  { id: '地图', name: '地图', group: '地图与场景', desc: '地图构想与校准（通配兼容）' },

  // 日历与日程
  { id: '节日构想', name: '节日构想', group: '日历与日程', desc: '世界观民俗节日与纪念日构想' },
  { id: '日程推演', name: '日程推演', group: '日历与日程', desc: '角色日常日程与约会推演' },
  { id: '日历', name: '日历', group: '日历与日程', desc: '节日构想与日程推演（通配兼容）' },

  // 金手指随身系统
  { id: '系统私聊', name: '系统私聊', group: '随身系统', desc: '手机短信与随身系统直接对话' },
  { id: '系统推演任务', name: '系统推演任务', group: '随身系统', desc: '系统 AI 结合剧情推演新任务' },
  { id: '系统成长评估', name: '系统成长评估', group: '随身系统', desc: '系统 AI 评估宿主属性成长' },
  { id: '系统商城进货', name: '系统商城进货', group: '随身系统', desc: '系统 AI 结合世界观批量构想新商品' },
  { id: '系统祈愿扩充', name: '系统祈愿扩充', group: '随身系统', desc: '系统 AI 扩充五级稀有度祈愿奖池' },
  { id: '系统', name: '系统', group: '随身系统', desc: '全部随身系统相关任务（通配兼容）' },

  // 正文与多媒体
  { id: '待办', name: '待办', group: '辅助与多媒体', desc: '待办事项提取规则' },
  { id: '摘要', name: '摘要', group: '辅助与多媒体', desc: '短信回流正文记忆摘要' },
  { id: '生图', name: '生图', group: '辅助与多媒体', desc: '照片转绘图 danbooru 描述' },
];

export function toggleScopeSelection(currentScope, clickedScope) {
  const current = String(currentScope || '通用').trim();
  const clicked = String(clickedScope || '').trim();
  if (!clicked || clicked === '通用') {
    return '通用';
  }
  let list = current === '通用' ? [] : current.split('+').map(s => s.trim()).filter(Boolean);
  if (list.includes(clicked)) {
    list = list.filter(s => s !== clicked);
  } else {
    list.push(clicked);
  }
  if (list.length === 0) {
    return '通用';
  }
  const orderMap = new Map(PRESET_SCOPES.map((sc, i) => [sc.name, i]));
  list.sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999));
  return list.join('+');
}

export const DEFAULT_PRESET_ENTRIES = [
  {
    id: 'entry_system_rules',
    name: '基础通用规则',
    scope: '通用',
    role: 'system',
    enabled: true,
    content: `你在手机应用中模拟角色进行线上交互。
结合当前剧情、地点与时间；没有依据不虚构正在发生的重大事件。
{{language_rule}}
{{story_memory_rule}}
只输出合法的 JSON 格式。`,
  },
  {
    id: 'entry_messages_rules',
    name: '私聊短信生成',
    scope: '短信',
    role: 'system',
    enabled: true,
    content: `{{messages_prompt}}\n{{rich_messages_prompt}}`,
  },
  {
    id: 'entry_old_maid_rules',
    name: '抽鬼牌对决规则',
    scope: '小游戏',
    role: 'system',
    enabled: true,
    content: `{{old_maid_prompt}}`,
  },
  {
    id: 'entry_buckshot_rules',
    name: '恶魔轮盘对决规则',
    scope: '小游戏',
    role: 'system',
    enabled: true,
    content: `{{buckshot_roulette_prompt}}`,
  },
  {
    id: 'entry_thought_rules',
    name: '角色隐秘心声推演',
    scope: '心声',
    role: 'system',
    enabled: true,
    content: `{{thought_prompt}}`,
  },
  {
    id: 'entry_groups_rules',
    name: '群聊多角色续写',
    scope: '群聊',
    role: 'system',
    enabled: true,
    content: `{{groups_prompt}}\n{{rich_messages_prompt}}`,
  },
  {
    id: 'entry_directory_rules',
    name: '通讯录发掘与整理',
    scope: '通讯录',
    role: 'system',
    enabled: true,
    content: `{{directory_prompt}}`,
  },
  {
    id: 'entry_contacts_rules',
    name: '联系人风格提炼',
    scope: '联系人',
    role: 'system',
    enabled: true,
    content: `{{contacts_prompt}}`,
  },
  {
    id: 'entry_social_rules',
    name: 'Ainstagram 动态发布',
    scope: '动态发布',
    role: 'system',
    enabled: true,
    content: `{{social_prompt}}`,
  },
  {
    id: 'entry_comment_rules',
    name: '动态留言与互动回复',
    scope: '动态评论',
    role: 'system',
    enabled: true,
    content: `{{comment_prompt}}`,
  },
  {
    id: 'entry_forum_rules',
    name: '公众论坛 (BBS) 帖子生成',
    scope: '论坛',
    role: 'system',
    enabled: true,
    content: `{{forum_prompt}}`,
  },
  {
    id: 'entry_festival_rules',
    name: 'AI 节日构想助手',
    scope: '节日构想',
    role: 'system',
    enabled: true,
    content: `{{festival_conceive_prompt}}`,
  },
  {
    id: 'entry_schedule_rules',
    name: 'AI 日程推演助手',
    scope: '日程推演',
    role: 'system',
    enabled: true,
    content: `{{schedule_deduce_prompt}}`,
  },
  {
    id: 'entry_map_organize_rules',
    name: 'AI 地图构想与整理',
    scope: '地图构想',
    role: 'system',
    enabled: true,
    content: `{{map_organize_prompt}}`,
  },
  {
    id: 'entry_map_calibrate_rules',
    name: 'AI 百宝书地图方位校准',
    scope: '地图校准',
    role: 'system',
    enabled: true,
    content: `{{map_calibrate_prompt}}`,
  },
  {
    id: 'entry_map_context',
    name: '地图与位置线索注入',
    scope: '短信+群聊',
    role: 'system',
    enabled: true,
    content: `{{map_prompt}}`,
  },
  {
    id: 'entry_todo_rules',
    name: '待办事项提取规则',
    scope: '待办',
    role: 'system',
    enabled: true,
    content: `{{todo_suggestions_prompt}}`,
  },
  {
    id: 'entry_calendar_context',
    name: '日历话题线索注入',
    scope: '短信+群聊',
    role: 'system',
    enabled: true,
    content: `{{calendar_prompt}}`,
  },
  {
    id: 'entry_workday_holiday',
    name: '工作日/节假日作息提示',
    scope: '短信+群聊',
    role: 'system',
    enabled: true,
    content: `{{workday_holiday_prompt}}`,
  },
  {
    id: 'entry_summary_rules',
    name: '短信回流正文记忆摘要',
    scope: '摘要',
    role: 'system',
    enabled: true,
    content: `{{summary_prompt}}`,
  },
  {
    id: 'entry_image_rules',
    name: '照片转绘图描述提示词',
    scope: '生图',
    role: 'system',
    enabled: true,
    content: `{{image_prompt}}`,
  },
  {
    id: 'entry_worldbook',
    name: '世界书插槽',
    scope: '通用',
    role: 'system',
    enabled: true,
    content: `{{worldbook}}`,
  },
  {
    id: 'entry_story_memory',
    name: '柏宝书长线记忆插槽',
    scope: '通用',
    role: 'system',
    enabled: true,
    content: `[剧情长线摘要（来自柏宝书）：\n{{story_memory}}\n]`,
  },
  {
    id: 'entry_story_history',
    name: '主聊天最近正文历史',
    scope: '通用',
    role: 'system',
    enabled: true,
    content: `[主聊天最近正文历史：\n{{story_history}}\n]`,
  },
  {
    id: 'entry_latest_user_input',
    name: '最新用户输入强调',
    scope: '通用',
    role: 'system',
    enabled: true,
    content: `[用户最新发言/当前诉求：\n{{latest_user_input}}\n]`,
  },
  {
    id: 'entry_origin_chat_rules',
    name: '系统专属私聊规则',
    scope: '系统私聊',
    role: 'system',
    enabled: true,
    content: `{{origin_chat_prompt}}`,
  },
  {
    id: 'entry_origin_task_rules',
    name: '系统推演新任务规则',
    scope: '系统推演任务',
    role: 'system',
    enabled: true,
    content: `{{origin_task_conceive_prompt}}`,
  },
  {
    id: 'entry_origin_stats_rules',
    name: '系统评估成长规则',
    scope: '系统成长评估',
    role: 'system',
    enabled: true,
    content: `{{origin_stats_eval_prompt}}`,
  },
  {
    id: 'entry_origin_shop_rules',
    name: '系统商城批量进货规则',
    scope: '系统商城进货',
    role: 'system',
    enabled: true,
    content: `{{origin_shop_conceive_prompt}}`,
  },
  {
    id: 'entry_origin_gacha_rules',
    name: '系统祈愿批量扩充规则',
    scope: '系统祈愿扩充',
    role: 'system',
    enabled: true,
    content: `{{origin_gacha_conceive_prompt}}`,
  },
  {
    id: 'entry_origin_context',
    name: '系统与宿主任务线索注入',
    scope: '短信+系统私聊',
    role: 'system',
    enabled: true,
    content: `{{origin_prompt}}`,
  },
  {
    id: 'entry_phone_data',
    name: '手机上下文与任务数据',
    scope: '通用',
    role: 'user',
    enabled: true,
    content: `{{phone_context}}`,
  },
];

export const PRESET_SCHEMA_VERSION = 10;

export const DEFAULT_PROMPT_PRESETS = [
  {
    id: 'default_preset',
    name: '两三事默认标准预设',
    isBuiltin: true,
    presetSchemaVersion: PRESET_SCHEMA_VERSION,
    storyLayers: 1,
    entries: DEFAULT_PRESET_ENTRIES,
  },
];

/**
 * 清洗 {{phone_context}} 数据：
 * 已拆分为独立插槽宏的内容（story / storyBackground / recentStory -> {{story_history}},
 * storyMemory -> {{story_memory}}, worldbook / worldInfo -> {{worldbook}}）
 * 严禁在 {{phone_context}} 中重复注入或绕过预设开关。
 */
export function sanitizePhoneContext(phoneContext) {
  if (!phoneContext || typeof phoneContext !== 'object' || Array.isArray(phoneContext)) {
    return phoneContext;
  }
  const {
    story,
    storyBackground,
    recentStory,
    storyMemory,
    worldbook,
    worldInfo,
    batch,
    ...rest
  } = phoneContext;
  if (typeof rest.character === 'string') {
    delete rest.character;
  }

  const cleanMsg = msg => {
    if (!msg || typeof msg !== 'object') return msg;
    const item = { ...msg };
    if (item.id) item.id = shortenMessageId(item.id);
    if (item.transferId) item.transferId = shortenMessageId(item.transferId);
    if (item.replyTo && typeof item.replyTo === 'object' && item.replyTo.messageId) {
      item.replyTo = { ...item.replyTo, messageId: shortenMessageId(item.replyTo.messageId) };
    }
    return item;
  };
  if (Array.isArray(rest.history)) rest.history = rest.history.map(cleanMsg);
  if (Array.isArray(rest.previousMessages)) rest.previousMessages = rest.previousMessages.map(cleanMsg);
  if (Array.isArray(rest.privateHistories)) {
    rest.privateHistories = rest.privateHistories.map(entry => ({
      ...entry,
      messages: Array.isArray(entry?.messages) ? entry.messages.map(cleanMsg) : entry?.messages,
    }));
  }

  return rest;
}

/**
 * 规范化预设列表：对于内置标准预设，自动平滑合并补齐代码中新增的默认规则条目，
 * 同时尊重用户手动删除的条目（deletedEntryIds）与自定义排序/开关。
 */
export function normalizePromptPresets(presets) {
  if (!Array.isArray(presets) || presets.length === 0) {
    return structuredClone(DEFAULT_PROMPT_PRESETS);
  }
  return presets.map(preset => {
    if (preset.isBuiltin || preset.id === 'default_preset') {
      const deletedIds = new Set(preset.deletedEntryIds || []);
      const existingIds = new Set((preset.entries || []).map(e => e.id));
      const needsSchemaUpgrade = (preset.presetSchemaVersion || 1) < PRESET_SCHEMA_VERSION;
      const newEntries = (preset.entries || []).map(entry => {
        const cloned = { ...entry };
        if (needsSchemaUpgrade) {
          if (cloned.id === 'entry_map_organize_rules' && cloned.scope === '地图') {
            cloned.scope = '地图构想';
          }
          if (cloned.id === 'entry_map_calibrate_rules' && cloned.scope === '地图') {
            cloned.scope = '地图校准';
          }
          if (cloned.id === 'entry_festival_rules' && cloned.scope === '日历') {
            cloned.scope = '节日构想';
          }
          if (cloned.id === 'entry_schedule_rules' && ['日历', '日历+待办'].includes(cloned.scope)) {
            cloned.scope = '日程推演';
          }
          if (cloned.id === 'entry_social_rules' && cloned.scope === '动态') {
            cloned.scope = '动态发布';
          }
          if (cloned.id === 'entry_comment_rules' && cloned.scope === '动态') {
            cloned.scope = '动态评论';
          }
          if (cloned.id === 'entry_origin_chat_rules' && cloned.scope === '系统') {
            cloned.scope = '系统私聊';
          }
          if (cloned.id === 'entry_origin_task_rules' && cloned.scope === '系统') {
            cloned.scope = '系统推演任务';
          }
          if (cloned.id === 'entry_origin_stats_rules' && cloned.scope === '系统') {
            cloned.scope = '系统成长评估';
          }
          if (cloned.id === 'entry_origin_shop_rules' && cloned.scope === '系统') {
            cloned.scope = '系统商城进货';
          }
          if (cloned.id === 'entry_origin_gacha_rules' && cloned.scope === '系统') {
            cloned.scope = '系统祈愿扩充';
          }
          if (cloned.id === 'entry_origin_context' && cloned.scope === '短信+系统') {
            cloned.scope = '短信+系统私聊';
          }
          if (['entry_old_maid_rules', 'entry_buckshot_rules'].includes(cloned.id) && cloned.scope === '短信') {
            cloned.scope = '小游戏';
          }
          if (cloned.id === 'entry_todo_rules' && (cloned.scope === '短信+群聊+待办' || cloned.scope === '短信+群聊+动态+待办')) {
            cloned.scope = '待办';
          }
          if (cloned.id === 'entry_story_history') {
            cloned.enabled = true;
            if (cloned.role === 'user' && cloned.content === '{{story_history}}') {
              cloned.role = 'system';
              cloned.content = '[主聊天最近正文历史：\n{{story_history}}\n]';
            }
          }
        }
        return cloned;
      });
      for (const defEntry of DEFAULT_PRESET_ENTRIES) {
        if (!existingIds.has(defEntry.id) && !deletedIds.has(defEntry.id)) {
          const targetIndex = DEFAULT_PRESET_ENTRIES.findIndex(e => e.id === defEntry.id);
          if (targetIndex >= 0 && targetIndex <= newEntries.length) {
            newEntries.splice(targetIndex, 0, { ...defEntry });
          } else {
            newEntries.push({ ...defEntry });
          }
        }
      }
      return {
        ...preset,
        isBuiltin: true,
        presetSchemaVersion: PRESET_SCHEMA_VERSION,
        entries: newEntries,
      };
    }
    return {
      ...preset,
      entries: Array.isArray(preset.entries) ? preset.entries.map(e => ({ ...e })) : [],
    };
  });
}

/**
 * 获取当前激活的规范化提示词预设
 */
export function getActivePreset(state) {
  const presets = normalizePromptPresets(state?.promptPresets);
  return presets.find(p => p.id === state?.activePresetId) || presets[0] || structuredClone(DEFAULT_PROMPT_PRESETS[0]);
}

/**
 * 将预设条目严格按预设开关与顺序展开并替换插槽宏，组装成发送给模型的 messages 数组
 */
export function compilePromptPreset(preset, contextData = {}, taskScope = 'chat', state = null) {
  const effectiveTaskScope = (typeof taskScope === 'string' && taskScope !== 'chat')
    ? taskScope
    : (contextData.taskScope || taskScope || 'chat');
  const effectiveState = state || contextData.state || null;
  let entries = Array.isArray(preset?.entries) ? preset.entries.map(e => ({ ...e })) : structuredClone(DEFAULT_PRESET_ENTRIES);

  // 若为未经过 normalizePromptPresets 的残缺内置预设，按相同规则补齐未删除的默认条目
  if ((preset?.isBuiltin || preset?.id === 'default_preset') && (preset?.presetSchemaVersion || 1) < PRESET_SCHEMA_VERSION) {
    const deletedIds = new Set(preset?.deletedEntryIds || []);
    const existingIds = new Set(entries.map(e => e.id));
    for (const defEntry of DEFAULT_PRESET_ENTRIES) {
      if (!existingIds.has(defEntry.id) && !deletedIds.has(defEntry.id)) {
        const targetIndex = DEFAULT_PRESET_ENTRIES.findIndex(e => e.id === defEntry.id);
        if (targetIndex >= 0 && targetIndex <= entries.length) {
          entries.splice(targetIndex, 0, { ...defEntry });
        } else {
          entries.push({ ...defEntry });
        }
      }
    }
  }

  const messages = [];

  let {
    worldbook = '',
    storyHistory = '',
    storyMemory = '',
    phoneContext = '',
    charPersonality = '',
    latestUserInput = '',
    originPromptText = '',
  } = contextData;

  if (phoneContext && typeof phoneContext === 'object' && !Array.isArray(phoneContext)) {
    if (!storyHistory) {
      const rawStory = phoneContext.story || phoneContext.storyBackground || phoneContext.recentStory;
      if (Array.isArray(rawStory)) {
        storyHistory = rawStory.map(item => `${item?.speaker || '角色'}：${item?.text || ''}`).filter(s => s !== '角色：').join('\n\n');
      } else if (typeof rawStory === 'string') {
        storyHistory = rawStory;
      }
    }
    if (!storyMemory && typeof phoneContext.storyMemory === 'string') {
      storyMemory = phoneContext.storyMemory;
    }
    if (!worldbook && typeof (phoneContext.worldbook || phoneContext.worldInfo) === 'string') {
      worldbook = phoneContext.worldbook || phoneContext.worldInfo;
    }
    if (!latestUserInput) {
      if (phoneContext.userComment?.text) {
        latestUserInput = `用户在动态下的评论：${phoneContext.userComment.text}`;
      } else if (Array.isArray(phoneContext.history)) {
        latestUserInput = extractLatestUserInput(phoneContext.history, {
          contactName: phoneContext.contact?.name || '角色',
          userName: phoneContext.user || '<user>',
        });
      } else if (phoneContext.userInstruction) {
        latestUserInput = phoneContext.userInstruction;
      } else if (phoneContext.focusPreference && phoneContext.focusPreference !== '全部') {
        latestUserInput = `日程推演天数：${phoneContext.deduceDays || 3}天；重点关注/侧重要求：${phoneContext.focusPreference}`;
      }
    }
  }

  const cleanedPhoneContext = sanitizePhoneContext(phoneContext);
  const oldMaidPrompt = getPrompt('old_maid', state) || OLD_MAID_PROMPT;

  for (const entry of entries) {
    if (!entry.enabled) continue;

    // 作用域检查：如果条目限定了特定场景且与当前任务不符，则跳过
    const scope = entry.scope || '通用';
    if (scope !== '通用') {
      const scopes = scope.split('+').map(s => s.trim()).filter(Boolean);
      const match = scopes.some(s => {
        if (s === '通用') return true;
        if (s === '仅手机app') return !['summary', 'image_prompt'].includes(effectiveTaskScope);

        // 短信与通讯
        if (s === '短信' && effectiveTaskScope === 'chat') return true;
        if (s === '群聊' && effectiveTaskScope === 'group-chat') return true;
        if (s === '心声' && effectiveTaskScope === 'thought') return true;
        if (s === '联系人' && effectiveTaskScope === 'contacts') return true;
        if (s === '通讯录' && effectiveTaskScope === 'directory') return true;
        if (s === '小游戏' && effectiveTaskScope === 'chat') return true;

        // 社交与论坛（细分 + 通配兼容）
        if (s === '动态发布' && ['social-feed', 'social-author'].includes(effectiveTaskScope)) return true;
        if (s === '动态评论' && effectiveTaskScope === 'social-comment') return true;
        if (s === '动态' && ['social-feed', 'social-author'].includes(effectiveTaskScope)) {
          if (entry.content?.includes('{{comment_prompt}}')) return false;
          if (entry.content?.includes('{{todo_suggestions_prompt}}') && effectiveTaskScope === 'social-author') return false;
          return true;
        }
        if (s === '动态' && effectiveTaskScope === 'social-comment') {
          if (entry.content?.includes('{{social_prompt}}')) return false;
          return true;
        }
        if (s === '论坛' && effectiveTaskScope === 'forum') return true;

        // 地图与场景（细分 + 通配兼容）
        if (s === '地图构想' && effectiveTaskScope === 'map_organize') return true;
        if (s === '地图校准' && effectiveTaskScope === 'map_calibrate') return true;
        if (s === '地图' && ['map_organize', 'map_calibrate'].includes(effectiveTaskScope)) {
          if (effectiveTaskScope === 'map_calibrate' && entry.content?.includes('{{map_organize_prompt}}') && !entry.content?.includes('{{map_calibrate_prompt}}')) return false;
          if (effectiveTaskScope === 'map_organize' && entry.content?.includes('{{map_calibrate_prompt}}') && !entry.content?.includes('{{map_organize_prompt}}')) return false;
          return true;
        }

        // 日历与日程（细分 + 通配兼容）
        if (s === '节日构想' && effectiveTaskScope === 'festival_conceive') return true;
        if (s === '日程推演' && effectiveTaskScope === 'schedule_deduce') return true;
        if (s === '日历' && effectiveTaskScope === 'festival_conceive') {
          if (entry.content?.includes('{{schedule_deduce_prompt}}')) return false;
          return true;
        }
        if (s === '日历' && effectiveTaskScope === 'schedule_deduce') {
          if (entry.content?.includes('{{festival_conceive_prompt}}')) return false;
          return true;
        }

        // 金手指随身系统（细分 + 通配兼容）
        if (s === '系统私聊' && ['origin-chat', '系统'].includes(effectiveTaskScope)) return true;
        if (s === '系统推演任务' && effectiveTaskScope === 'origin-task') return true;
        if (s === '系统成长评估' && effectiveTaskScope === 'origin-stats') return true;
        if (s === '系统商城进货' && effectiveTaskScope === 'origin-shop') return true;
        if (s === '系统祈愿扩充' && effectiveTaskScope === 'origin-gacha') return true;
        if (s === '系统' && ['origin', 'origin-chat', 'origin-task', 'origin-stats', 'origin-shop', 'origin-gacha', '系统'].includes(effectiveTaskScope)) {
          if (effectiveTaskScope === 'origin-task') {
            if (entry.content?.includes('{{origin_chat_prompt}}') || entry.content?.includes('{{origin_stats_eval_prompt}}') || entry.content?.includes('{{origin_shop_conceive_prompt}}') || entry.content?.includes('{{origin_gacha_conceive_prompt}}')) return false;
          } else if (effectiveTaskScope === 'origin-stats') {
            if (entry.content?.includes('{{origin_chat_prompt}}') || entry.content?.includes('{{origin_task_conceive_prompt}}') || entry.content?.includes('{{origin_shop_conceive_prompt}}') || entry.content?.includes('{{origin_gacha_conceive_prompt}}')) return false;
          } else if (effectiveTaskScope === 'origin-shop') {
            if (entry.content?.includes('{{origin_chat_prompt}}') || entry.content?.includes('{{origin_task_conceive_prompt}}') || entry.content?.includes('{{origin_stats_eval_prompt}}') || entry.content?.includes('{{origin_gacha_conceive_prompt}}')) return false;
          } else if (effectiveTaskScope === 'origin-gacha') {
            if (entry.content?.includes('{{origin_chat_prompt}}') || entry.content?.includes('{{origin_task_conceive_prompt}}') || entry.content?.includes('{{origin_stats_eval_prompt}}') || entry.content?.includes('{{origin_shop_conceive_prompt}}')) return false;
          } else {
            if (entry.content?.includes('{{origin_task_conceive_prompt}}') || entry.content?.includes('{{origin_stats_eval_prompt}}') || entry.content?.includes('{{origin_shop_conceive_prompt}}') || entry.content?.includes('{{origin_gacha_conceive_prompt}}')) return false;
          }
          return true;
        }

        // 待办提取
        if (s === '待办' && ['chat', 'group-chat', 'social-feed', 'social-comment', 'schedule_deduce'].includes(effectiveTaskScope)) {
          if (effectiveTaskScope === 'schedule_deduce' && entry.content?.includes('{{todo_suggestions_prompt}}')) return false;
          if (['chat', 'group-chat', 'social-feed', 'social-comment'].includes(effectiveTaskScope) && entry.content?.includes('{{schedule_deduce_prompt}}')) return false;
          return true;
        }

        // 正文回流与多媒体
        if (s === '摘要' && effectiveTaskScope === 'summary') return true;
        if (s === '生图' && effectiveTaskScope === 'image_prompt') return true;

        return false;
      });
      if (!match) continue;
    }

    let content = String(entry.content || '');

    // 检查插槽：如果包含对应宏，进行替换
    const hasWorldbook = content.includes('{{worldbook}}');
    const hasStoryHistory = content.includes('{{story_history}}');
    const hasStoryMemory = content.includes('{{story_memory}}');
    const hasPhoneContext = content.includes('{{phone_context}}');
    const hasCharPersonality = content.includes('{{char_personality}}');
    const hasCalendarMacro = content.includes('{{calendar_prompt}}');
    const hasWorkdayMacro = content.includes('{{workday_holiday_prompt}}');
    const hasMapMacro = content.includes('{{map_prompt}}');
    const hasOriginMacro = content.includes('{{origin_prompt}}');
    const hasLatestUserInput = content.includes('{{latest_user_input}}');
    const hasCalendar = Boolean(contextData.calendar || cleanedPhoneContext?.calendar);
    const mapPromptText = String(contextData.mapPrompt || cleanedPhoneContext?.mapPrompt || '').trim();
    const workdayPromptText = contextData.workdayHoliday?.prompt || cleanedPhoneContext?.workdayHoliday?.prompt || '';
    const workdayEnabled = Boolean(effectiveState?.calendar?.workdayConfig?.enabled);
    const resolvedOriginText = String(originPromptText || contextData.originPrompt || cleanedPhoneContext?.originPrompt || '').trim();
    const originEnabled = Boolean(effectiveState?.origin?.enabled ?? true) && (effectiveTaskScope === '系统' || (effectiveState?.injectOriginEnabled ?? true));

    // 如果日历插槽在当前批次无日历数据，且无其他文本包装，安全跳过
    if (hasCalendarMacro && !hasCalendar) {
      content = content.replace(/\{\{calendar_prompt\}\}/g, '').trim();
      if (!content || /^\[[^\]]+\]\s*$/.test(content)) continue;
    }

    // 如果地图插槽在当前批次无地图线索，且无其他文本包装，安全跳过
    if (hasMapMacro && !mapPromptText) {
      content = content.replace(/\{\{map_prompt\}\}/g, '').trim();
      if (!content || /^\[[^\]]+\]\s*$/.test(content)) continue;
    }

    // 如果工作日/节假日插槽在当前未启用或无提示词，且无其他文本包装，安全跳过
    if (hasWorkdayMacro && (!workdayEnabled || !workdayPromptText)) {
      content = content.replace(/\{\{workday_holiday_prompt\}\}/g, '').trim();
      if (!content || /^\[[^\]]+\]\s*$/.test(content)) continue;
    }

    // 如果系统插槽在当前未启用或无提示词，且无其他文本包装，安全跳过
    if (hasOriginMacro && (!originEnabled || !resolvedOriginText)) {
      content = content.replace(/\{\{origin_prompt\}\}/g, '').trim();
      if (!content || /^\[[^\]]+\]\s*$/.test(content)) continue;
    }

    // 功能提示词宏替换：动态支持用户在功能库中修改过的提示词
    const msgPrompt = getPrompt('messages', state) || MESSAGES_PROMPT;
    const thoughtPrompt = getPrompt('thought', state) || THOUGHT_PROMPT;
    const grpPrompt = getPrompt('groups', state) || GROUP_PROMPT;
    const socPrompt = getPrompt('social', state) || SOCIAL_PROMPT;
    const cmtPrompt = getPrompt('comment', state) || COMMENT_PROMPT;
    const frmPrompt = getPrompt('forum', state) || FORUM_PROMPT;
    const fstPrompt = getPrompt('festival_conceive', state) || FESTIVAL_CONCEIVE_PROMPT;
    const schPrompt = getPrompt('schedule_deduce', state) || SCHEDULE_DEDUCE_PROMPT;
    const isCalibrate = effectiveTaskScope === 'map_calibrate';
    const isOrganize = effectiveTaskScope === 'map_organize';
    const mapOrgPrompt = isCalibrate ? '' : (getPrompt('map_organize', state) || MAP_ORGANIZE_PROMPT);
    const mapCalibratePrompt = isOrganize ? '' : (getPrompt('map_calibrate', state) || MAP_CALIBRATE_PROMPT);
    const mapPromptBase = getPrompt('map_context', state) || MAP_PROMPT;
    const resolvedMapPrompt = mapPromptText ? `${mapPromptBase}\n[地图与位置线索：\n${mapPromptText}\n]` : '';
    const baseTodoPrompt = getPrompt('todo_suggestions', state) || TODO_SUGGESTIONS_PROMPT;
    const todoPrompt = ['social-feed', 'social-comment'].includes(taskScope)
      ? `${baseTodoPrompt}\n动态和评论不提取私人待办；只有proactiveMessages里的短信可提建议，每项内放自己的todoSuggestions，索引对应该项messages。对应authors里的todoPeople/todos仅供该作者私信使用；storyProgress仅供核对后续进展，不公开，也不代表其他作者知道。`
      : baseTodoPrompt;
    const richPrompt = getPrompt('rich_messages', state) || RICH_MESSAGES_PROMPT;
    const langPrompt = getPrompt('language_rule', state) || LANGUAGE_RULE;
    const storyMemPrompt = getPrompt('story_memory_rule', state) || STORY_MEMORY_RULE;
    const contactsPrompt = getPrompt('contacts', state) || CONTACTS_PROMPT;
    const dirPrompt = getPrompt('directory', state) || DIRECTORY_PROMPT;
    const calPromptBase = getPrompt('calendar_context', state) || CALENDAR_PROMPT;
    const calObj = contextData.calendar || cleanedPhoneContext?.calendar;
    const calEvents = Array.isArray(calObj?.events) ? calObj.events : (Array.isArray(calObj) ? calObj : []);
    const seenCalLines = new Set();
    const calLines = calEvents
      .map(e => formatCalendarEventPromptLine(e))
      .filter(line => {
        if (!line || seenCalLines.has(line)) return false;
        seenCalLines.add(line);
        return true;
      })
      .join('\n');
    const calPrompt = calLines ? `${calPromptBase}\n[日历线索：\n${calLines}\n]` : calPromptBase;
    const workdayPromptRule = getPrompt('workday_holiday', state) || WORKDAY_HOLIDAY_PROMPT;
    const resolvedWorkdayPrompt = workdayPromptText ? (workdayPromptRule ? `${workdayPromptRule}\n${workdayPromptText}` : workdayPromptText) : '';
    const maxChars = contextData.maxCharacters || Number(state?.summaryMaxCharacters) || 100;
    const sumPromptRaw = getPrompt('summary', state) || SUMMARY_PROMPT;
    const sumPrompt = sumPromptRaw ? sumPromptRaw.replace(/maxCharacters/g, String(maxChars)) : '';
    const imgPrompt = getPrompt('image_prompt', state) || IMAGE_PROMPT;
    const oldMaidPrompt = getPrompt('old_maid', state) || OLD_MAID_PROMPT;
    const buckshotPrompt = getPrompt('buckshot_roulette', state) || BUCKSHOT_ROULETTE_PROMPT;
    const originSysPrompt = getPrompt('origin_system', state) || ORIGIN_SYSTEM_PROMPT;
    const originChatPrompt = getPrompt('origin_chat', state) || ORIGIN_CHAT_PROMPT;
    const originTaskPrompt = getPrompt('origin_task_conceive', state) || ORIGIN_TASK_CONCEIVE_PROMPT;
    const originStatsPrompt = getPrompt('origin_stats_eval', state) || ORIGIN_STATS_EVAL_PROMPT;
    const originShopPrompt = getPrompt('origin_shop_conceive', state) || ORIGIN_SHOP_CONCEIVE_PROMPT;
    const originGachaPrompt = getPrompt('origin_gacha_conceive', state) || ORIGIN_GACHA_CONCEIVE_PROMPT;
    const resolvedOriginPrompt = resolvedOriginText ? `${originSysPrompt}\n${resolvedOriginText}` : originSysPrompt;

    content = content
      .replace(/\{\{messages_prompt\}\}/g, msgPrompt)
      .replace(/\{\{thought_prompt\}\}/g, thoughtPrompt)
      .replace(/\{\{groups_prompt\}\}/g, grpPrompt)
      .replace(/\{\{social_prompt\}\}/g, socPrompt)
      .replace(/\{\{comment_prompt\}\}/g, cmtPrompt)
      .replace(/\{\{forum_prompt\}\}/g, frmPrompt)
      .replace(/\{\{festival_conceive_prompt\}\}/g, fstPrompt)
      .replace(/\{\{schedule_deduce_prompt\}\}/g, schPrompt)
      .replace(/\{\{map_organize_prompt\}\}/g, mapOrgPrompt)
      .replace(/\{\{map_calibrate_prompt\}\}/g, mapCalibratePrompt)
      .replace(/\{\{map_prompt\}\}/g, resolvedMapPrompt)
      .replace(/\{\{todo_suggestions_prompt\}\}/g, todoPrompt)
      .replace(/\{\{rich_messages_prompt\}\}/g, richPrompt)
      .replace(/\{\{old_maid_prompt\}\}/g, oldMaidPrompt)
      .replace(/\{\{buckshot_roulette_prompt\}\}/g, buckshotPrompt)
      .replace(/\{\{origin_prompt\}\}/g, resolvedOriginPrompt)
      .replace(/\{\{origin_chat_prompt\}\}/g, originChatPrompt)
      .replace(/\{\{origin_task_conceive_prompt\}\}/g, originTaskPrompt)
      .replace(/\{\{origin_stats_eval_prompt\}\}/g, originStatsPrompt)
      .replace(/\{\{origin_shop_conceive_prompt\}\}/g, originShopPrompt)
      .replace(/\{\{origin_gacha_conceive_prompt\}\}/g, originGachaPrompt)
      .replace(/\{\{language_rule\}\}/g, langPrompt)
      .replace(/\{\{story_memory_rule\}\}/g, storyMemPrompt)
      .replace(/\{\{contacts_prompt\}\}/g, contactsPrompt)
      .replace(/\{\{directory_prompt\}\}/g, dirPrompt)
      .replace(/\{\{calendar_prompt\}\}/g, calPrompt)
      .replace(/\{\{workday_holiday_prompt\}\}/g, resolvedWorkdayPrompt)
      .replace(/\{\{summary_prompt\}\}/g, sumPrompt)
      .replace(/\{\{image_prompt\}\}/g, imgPrompt);

    // 如果该条目单纯是某个空插槽（如柏宝书未开启导致 storyMemory 为空），且除该宏外无其他有效文本，则跳过
    if (hasStoryMemory && !storyMemory.trim()) {
      content = content.replace(/\{\{story_memory\}\}/g, '').trim();
      if (!content || /^\[[^\]]*\]\s*$/s.test(content)) continue;
    } else if (hasStoryMemory) {
      content = content.replace(/\{\{story_memory\}\}/g, storyMemory.trim());
    }

    if (hasWorldbook && !worldbook.trim()) {
      content = content.replace(/\{\{worldbook\}\}/g, '').trim();
      if (!content || /^\[[^\]]*\]\s*$/s.test(content)) continue;
    } else if (hasWorldbook) {
      content = content.replace(/\{\{worldbook\}\}/g, worldbook.trim());
    }

    if (hasStoryHistory && !storyHistory.trim()) {
      content = content.replace(/\{\{story_history\}\}/g, '').trim();
      if (!content || /^\[[^\]]*\]\s*$/s.test(content)) continue;
    } else if (hasStoryHistory) {
      const isPlain = content.trim() === '{{story_history}}';
      content = isPlain ? storyHistory.trim() : content.replace(/\{\{story_history\}\}/g, storyHistory.trim());
    }

    if (hasCharPersonality && !charPersonality.trim()) {
      content = content.replace(/\{\{char_personality\}\}/g, '').trim();
      if (!content || /^\[[^\]]*\]\s*$/s.test(content)) continue;
    } else if (hasCharPersonality) {
      content = content.replace(/\{\{char_personality\}\}/g, charPersonality.trim());
    }

    if (hasPhoneContext) {
      const isPlain = content.trim() === '{{phone_context}}';
      const serialized = typeof cleanedPhoneContext === 'object' ? JSON.stringify(cleanedPhoneContext) : String(cleanedPhoneContext);
      content = isPlain ? serialized : content.replace(/\{\{phone_context\}\}/g, serialized);
    }

    if (hasLatestUserInput && !latestUserInput.trim()) {
      content = content.replace(/\{\{latest_user_input\}\}/g, '').trim();
      if (!content || /^\[[^\]]*\]\s*$/s.test(content) || /^(?:用户最新(?:输入|发言|诉求)|当前诉求)[：:]\s*$/s.test(content)) continue;
    } else if (hasLatestUserInput) {
      const isPlain = content.trim() === '{{latest_user_input}}';
      content = isPlain ? latestUserInput.trim() : content.replace(/\{\{latest_user_input\}\}/g, latestUserInput.trim());
    }

    const trimmed = content.trim();
    if (!trimmed) continue;

    const role = ['system', 'user', 'assistant'].includes(entry.role) ? entry.role : (entry.role === 'ai' ? 'assistant' : 'user');
    messages.push({ role, content: trimmed, name: entry.name || '未命名条目', id: entry.id });
  }

  // 保证至少有一条消息
  if (!messages.length) {
    messages.push({ role: 'user', content: typeof cleanedPhoneContext === 'object' ? JSON.stringify(cleanedPhoneContext) : String(cleanedPhoneContext || '请继续。'), name: '默认输入', id: 'default_input' });
  }

  return messages;
}

/**
 * 维持预设的绝对时序，将连续相同角色的条目合并为一条消息（以符合大模型接口标准），
 * 同时在每一条合并消息上记录包含的条目名列表。
 */
export function collapseMessages(entries) {
  const result = [];
  for (const entry of entries) {
    if (!entry.content?.trim()) continue;
    const role = entry.role || 'system';
    const last = result[result.length - 1];
    if (last && last.role === role) {
      last.content += `\n\n${entry.content.trim()}`;
      last.entryNames = [...(last.entryNames || [last.name || '']), entry.name || ''];
    } else {
      result.push({ role, content: entry.content.trim(), name: entry.name, id: entry.id, entryNames: [entry.name || ''] });
    }
  }
  return result;
}

/**
 * 将提示词预设导出为标准化 JSON 负载
 */
export function exportPresetToPayload(preset) {
  if (!preset || typeof preset !== 'object') {
    throw new Error('无效的预设对象');
  }
  return {
    type: 'tmt_prompt_preset',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    preset: {
      name: preset.name || '默认预设',
      storyLayers: Math.max(1, Math.min(30, Number(preset.storyLayers) || 3)),
      entries: Array.isArray(preset.entries)
        ? preset.entries.map(entry => ({
            name: entry.name || '',
            role: entry.role || 'system',
            scope: entry.scope || '通用',
            category: entry.category || '自定义',
            enabled: entry.enabled !== false,
            content: String(entry.content ?? ''),
          }))
        : [],
    },
  };
}

/**
 * 从 JSON 负载创建新提示词预设对象（包含新唯一 ID）
 */
export function createPresetFromPayload(payload, fallbackName = '导入预设') {
  if (!payload || typeof payload !== 'object') {
    throw new Error('导入数据必须是有效 JSON 对象');
  }
  const rawPreset = payload.preset && typeof payload.preset === 'object' ? payload.preset : payload;
  const entriesList = Array.isArray(rawPreset.entries)
    ? rawPreset.entries
    : Array.isArray(rawPreset)
      ? rawPreset
      : null;

  if (!entriesList) {
    throw new Error('未找到有效的预设条目列表 (entries)');
  }

  const baseName = (typeof rawPreset.name === 'string' && rawPreset.name.trim())
    ? rawPreset.name.trim()
    : fallbackName;
  const newId = `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    id: newId,
    name: baseName.endsWith('(导入)') ? baseName : `${baseName} (导入)`,
    isBuiltin: false,
    storyLayers: Math.max(1, Math.min(30, Number(rawPreset.storyLayers) || 3)),
    entries: entriesList.map((entry, idx) => ({
      id: `entry_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : `条目 ${idx + 1}`,
      role: ['system', 'user', 'assistant'].includes(entry.role) ? entry.role : 'system',
      scope: typeof entry.scope === 'string' ? entry.scope : '通用',
      category: typeof entry.category === 'string' ? entry.category : '自定义',
      enabled: entry.enabled !== false,
      content: String(entry.content ?? ''),
    })),
  };
}

