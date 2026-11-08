import { PROTO_LANG, PROTO_MEMORY, PROTO_TYPING } from './protocols.js';
import { CHAT_MESSAGES, CHAT_GROUPS, CHAT_THOUGHT, CHAT_CONTACTS, CHAT_DIRECTORY } from './chat.js';
import { SOCIAL_FEED, SOCIAL_COMMENT, SOCIAL_FORUM } from './social.js';
import { TOOL_FESTIVALS, TOOL_SCHEDULES, TOOL_MAPS, TOOL_MAP_CALIBRATE, TOOL_TODOS, TOOL_IMAGE, TOOL_SUMMARY } from './tools.js';
import { ORIGIN_CHAT, ORIGIN_OBSERVER_CHAT, ORIGIN_TASKS, ORIGIN_STATS, ORIGIN_SHOP, ORIGIN_GACHA } from './origin.js';
import { GAME_OLD_MAID, GAME_BUCKSHOT, GAME_RICH } from './games.js';
import {
  CLUE_WORKDAY,
  CLUE_CALENDAR,
  CLUE_MAP,
  CLUE_ORIGIN,
  CLUE_CLOCK,
  CLUE_TARGET,
  CLUE_TODOS,
  CLUE_SOCIAL,
  CLUE_STICKERS,
  CLUE_HISTORY,
} from './clues.js';

// 模块常量定义：8 大核心模块，精炼纯粹
export const PROMPT_MODULES = ['全部', '通讯', '社交', '工具', '系统', '游戏', '线索', '协议'];

// 统一注册表定义（精简命名：模块-具体内容）
export const PROMPT_REGISTRY = [
  // 1. 通讯模块
  {
    id: 'messages',
    code: 'chat_messages',
    title: '通讯-私聊',
    category: '通讯',
    description: '单聊时让联系人根据性格、聊天习惯、近期消息回复或主动发起短信。',
    defaultPrompt: CHAT_MESSAGES,
    macro: '{{chat_messages}}',
    legacyMacro: '{{messages_prompt}}',
  },
  {
    id: 'groups',
    code: 'chat_groups',
    title: '通讯-群聊',
    category: '通讯',
    description: '群聊时综合所有群成员性格、知情差与发言动机，模拟群内多角色互动。',
    defaultPrompt: CHAT_GROUPS,
    macro: '{{chat_groups}}',
    legacyMacro: '{{groups_prompt}}',
  },
  {
    id: 'thought',
    code: 'chat_thought',
    title: '通讯-心声',
    category: '通讯',
    description: '推演角色在发送该消息时最真实的隐秘内心想法与潜台词。',
    defaultPrompt: CHAT_THOUGHT,
    macro: '{{chat_thought}}',
    legacyMacro: '{{thought_prompt}}',
  },
  {
    id: 'contacts',
    code: 'chat_contacts',
    title: '通讯-风格',
    category: '通讯',
    description: '从角色卡或人物资料提炼其具体的线上文字表达习惯（标点、分条、语气）。',
    defaultPrompt: CHAT_CONTACTS,
    macro: '{{chat_contacts}}',
    legacyMacro: '{{contacts_prompt}}',
  },
  {
    id: 'directory',
    code: 'chat_directory',
    title: '通讯-档案',
    category: '通讯',
    description: '从正文、角色卡与世界书中智能发掘可能存在的人物和稳定群聊并建档。',
    defaultPrompt: CHAT_DIRECTORY,
    macro: '{{chat_directory}}',
    legacyMacro: '{{directory_prompt}}',
  },

  // 2. 社交模块
  {
    id: 'social',
    code: 'social_feed',
    title: '社交-动态',
    category: '社交',
    description: '生成联系人或世界观路人的公开社交动态（朋友圈发帖）。',
    defaultPrompt: SOCIAL_FEED,
    macro: '{{social_feed}}',
    legacyMacro: '{{social_prompt}}',
  },
  {
    id: 'comment',
    code: 'social_comment',
    title: '社交-评论',
    category: '社交',
    description: '用户在动态下留言时，作者或评论者进行公开互动回复，可选触发私聊。',
    defaultPrompt: SOCIAL_COMMENT,
    macro: '{{social_comment}}',
    legacyMacro: '{{comment_prompt}}',
  },
  {
    id: 'forum',
    code: 'social_forum',
    title: '社交-论坛',
    category: '社交',
    description: '生成世界观内外部视角的公众论坛 (BBS) 帖子及路人多楼层回帖。',
    defaultPrompt: SOCIAL_FORUM,
    macro: '{{social_forum}}',
    legacyMacro: '{{forum_prompt}}',
  },

  // 3. 工具模块
  {
    id: 'festival_conceive',
    code: 'tool_festivals',
    title: '工具-节日',
    category: '工具',
    description: '结合当前世界观文化与历法体系，发掘构想自然合理的民俗或纪念节日。',
    defaultPrompt: TOOL_FESTIVALS,
    macro: '{{tool_festivals}}',
    legacyMacro: '{{festival_conceive_prompt}}',
  },
  {
    id: 'schedule_deduce',
    code: 'tool_schedules',
    title: '工具-作息',
    category: '工具',
    description: '根据角色身份、性格与近期事件，智能推演合理日程安排与代办清单。',
    defaultPrompt: TOOL_SCHEDULES,
    macro: '{{tool_schedules}}',
    legacyMacro: '{{schedule_deduce_prompt}}',
  },
  {
    id: 'map_organize',
    code: 'tool_maps',
    title: '工具-地图',
    category: '工具',
    description: '从正文提取空间场所，构建区域、场所与室内三级地图空间结构。',
    defaultPrompt: TOOL_MAPS,
    macro: '{{tool_maps}}',
    legacyMacro: '{{map_organize_prompt}}',
  },
  {
    id: 'map_calibrate',
    code: 'tool_map_calibrate',
    title: '工具-校准',
    category: '工具',
    description: '对已有地图进行空间相对方位校准与角色常驻地智能补齐。',
    defaultPrompt: TOOL_MAP_CALIBRATE,
    macro: '{{tool_map_calibrate}}',
    legacyMacro: '{{map_calibrate_prompt}}',
  },
  {
    id: 'todo_suggestions',
    code: 'tool_todos',
    title: '工具-待办',
    category: '工具',
    description: '从短信往来中自动提炼日程约定、代办承诺，支持核对与状态流转。',
    defaultPrompt: TOOL_TODOS,
    macro: '{{tool_todos}}',
    legacyMacro: '{{todo_suggestions_prompt}}',
  },
  {
    id: 'image',
    code: 'tool_image',
    title: '工具-生图',
    category: '工具',
    description: '将角色自拍请求或场景照片转化为文生图正向描述与负面词。',
    defaultPrompt: TOOL_IMAGE,
    macro: '{{tool_image}}',
    legacyMacro: '{{image_prompt}}',
  },
  {
    id: 'summary',
    code: 'tool_summary',
    title: '工具-总结',
    category: '工具',
    description: '对手机聊天记录与事件进行客观提炼，形成供酒馆正文参考的情报摘要。',
    defaultPrompt: TOOL_SUMMARY,
    macro: '{{tool_summary}}',
    legacyMacro: '{{summary_prompt}}',
  },

  // 4. 系统模块
  {
    id: 'origin_chat',
    code: 'origin_chat',
    title: '系统-私聊',
    category: '系统',
    description: '与随身金手指系统在私聊中直接对话时的回复口吻与交互规则。',
    defaultPrompt: ORIGIN_CHAT,
    macro: '{{origin_chat}}',
    legacyMacro: '{{origin_chat_prompt}}',
  },
  {
    id: 'origin_observer_chat',
    code: 'origin_observer_chat',
    title: '系统-旁观',
    category: '系统',
    description: '宿主为NPC角色时，场外旁观推演宿主与系统对答的规则。',
    defaultPrompt: ORIGIN_OBSERVER_CHAT,
    macro: '{{origin_observer_chat}}',
    legacyMacro: '{{origin_observer_chat_prompt}}',
  },
  {
    id: 'origin_task_conceive',
    code: 'origin_tasks',
    title: '系统-构思',
    category: '系统',
    description: 'AI 结合正文推演派发新任务时的指导规范与标准输出结构。',
    defaultPrompt: ORIGIN_TASKS,
    macro: '{{origin_tasks}}',
    legacyMacro: '{{origin_task_conceive_prompt}}',
  },
  {
    id: 'origin_stats_eval',
    code: 'origin_stats',
    title: '系统-评估',
    category: '系统',
    description: 'AI 结合剧情评估宿主属性、技能与特权成长或构建能力面板的规则。',
    defaultPrompt: ORIGIN_STATS,
    macro: '{{origin_stats}}',
    legacyMacro: '{{origin_stats_eval_prompt}}',
  },
  {
    id: 'origin_shop_conceive',
    code: 'origin_shop',
    title: '系统-商店',
    category: '系统',
    description: 'AI 结合世界观批量构想新商品时的输出规范。',
    defaultPrompt: ORIGIN_SHOP,
    macro: '{{origin_shop}}',
    legacyMacro: '{{origin_shop_conceive_prompt}}',
  },
  {
    id: 'origin_gacha_conceive',
    code: 'origin_gacha',
    title: '系统-抽卡',
    category: '系统',
    description: 'AI 结合世界观批量扩充五级稀有度奖池时的规范。',
    defaultPrompt: ORIGIN_GACHA,
    macro: '{{origin_gacha}}',
    legacyMacro: '{{origin_gacha_conceive_prompt}}',
  },

  // 5. 游戏模块
  {
    id: 'old_maid',
    code: 'game_old_maid',
    title: '游戏-抽鬼牌',
    category: '游戏',
    description: '指导角色理解抽鬼牌规则、协商赌注，并在边玩边聊中通过动作摸牌对决。',
    defaultPrompt: GAME_OLD_MAID,
    macro: '{{game_old_maid}}',
    legacyMacro: '{{old_maid_prompt}}',
  },
  {
    id: 'buckshot_roulette',
    code: 'game_buckshot',
    title: '游戏-轮盘',
    category: '游戏',
    description: '指导角色理解恶魔轮盘规则、利用道具与概率朝对方或自己开枪博弈。',
    defaultPrompt: GAME_BUCKSHOT,
    macro: '{{game_buckshot}}',
    legacyMacro: '{{buckshot_roulette_prompt}}',
  },
  {
    id: 'rich_messages',
    code: 'game_rich',
    title: '游戏-多媒体',
    category: '游戏',
    description: '指导 AI 恰当使用 emoji、图片贴纸表情包、拍一拍及转账等富媒体内容。',
    defaultPrompt: GAME_RICH,
    macro: '{{game_rich}}',
    legacyMacro: '{{rich_messages_prompt}}',
  },

  // 6. 线索模块（10 项：所有注入手机私聊/群聊的情报理解准则）
  {
    id: 'workday_holiday',
    code: 'clue_workday',
    title: '线索-作息',
    category: '线索',
    description: '指导短信/群聊角色根据当前工作日或节假日作息，表现出合理的生活忙闲状态。',
    defaultPrompt: CLUE_WORKDAY,
    macro: '{{clue_workday}}',
    legacyMacro: '{{workday_holiday_prompt}}',
  },
  {
    id: 'calendar_context',
    code: 'clue_calendar',
    title: '线索-节日',
    category: '线索',
    description: '指导短信/群聊角色获知当周节日或纪念日，作为自然话题参考，不强制庆祝。',
    defaultPrompt: CLUE_CALENDAR,
    macro: '{{clue_calendar}}',
    legacyMacro: '{{calendar_prompt}}',
  },
  {
    id: 'map_context',
    code: 'clue_map',
    title: '线索-地图',
    category: '线索',
    description: '指导短信/群聊角色获知主角当前所处空间位置与周边场所，贴合环境交谈。',
    defaultPrompt: CLUE_MAP,
    macro: '{{clue_map}}',
    legacyMacro: '{{map_prompt}}',
  },
  {
    id: 'origin_system',
    code: 'clue_origin',
    title: '线索-系统',
    category: '线索',
    description: '指导角色在私聊时理解金手指随身系统任务与宿主状态线索。',
    defaultPrompt: CLUE_ORIGIN,
    macro: '{{clue_origin}}',
    legacyMacro: '{{origin_prompt}}',
  },
  {
    id: 'clue_clock',
    code: 'clue_clock',
    title: '线索-时钟',
    category: '线索',
    description: '提供当前手机虚拟日期、星期几与时段线索，锚定真实生活时间感。',
    defaultPrompt: CLUE_CLOCK,
    macro: '{{clue_clock}}',
    legacyMacro: '{{device_clock}}',
  },
  {
    id: 'clue_target',
    code: 'clue_target',
    title: '线索-资料',
    category: '线索',
    description: '提供当前私聊联系人或群聊成员的名片设定、打字习惯与线上风格。',
    defaultPrompt: CLUE_TARGET,
    macro: '{{clue_target}}',
    legacyMacro: '{{chat_target}}',
  },
  {
    id: 'clue_todos',
    code: 'clue_todos',
    title: '线索-待办',
    category: '线索',
    description: '提示备忘录中与当前角色相关的未完成待办事项、约定与截止时间。',
    defaultPrompt: CLUE_TODOS,
    macro: '{{clue_todos}}',
    legacyMacro: '{{todo_context}}',
  },
  {
    id: 'clue_social',
    code: 'clue_social',
    title: '线索-动态',
    category: '线索',
    description: '提供通讯录好友最新发布的公开朋友圈动态，作为自然闲聊谈资。',
    defaultPrompt: CLUE_SOCIAL,
    macro: '{{clue_social}}',
    legacyMacro: '{{social_feed_context}}',
  },
  {
    id: 'clue_stickers',
    code: 'clue_stickers',
    title: '线索-表情',
    category: '线索',
    description: '提供角色当前可用的专属贴纸表情包及常用 emoji 候选池。',
    defaultPrompt: CLUE_STICKERS,
    macro: '{{clue_stickers}}',
    legacyMacro: '{{sticker_context}}',
  },
  {
    id: 'clue_history',
    code: 'clue_history',
    title: '线索-消息',
    category: '线索',
    description: '提供当前会话近期消息往来上下文记录，保持对话连贯流畅。',
    defaultPrompt: CLUE_HISTORY,
    macro: '{{clue_history}}',
    legacyMacro: '{{chat_history}}',
  },

  // 7. 协议模块
  {
    id: 'language_rule',
    code: 'proto_lang',
    title: '协议-语言',
    category: '协议',
    description: '按角色设定使用对应语言，并对非中文消息附带中文译文。',
    defaultPrompt: PROTO_LANG,
    macro: '{{proto_lang}}',
    legacyMacro: '{{language_rule}}',
  },
  {
    id: 'story_memory_rule',
    code: 'proto_memory',
    title: '协议-知情',
    category: '协议',
    description: '约束角色不能全知未公开的剧情记忆或他人私下对话。',
    defaultPrompt: PROTO_MEMORY,
    macro: '{{proto_memory}}',
    legacyMacro: '{{story_memory_rule}}',
  },
];

// 双向 ID / Code 映射表
const ID_ALIAS_MAP = new Map();
for (const item of PROMPT_REGISTRY) {
  ID_ALIAS_MAP.set(item.id, item);
  if (item.code) {
    ID_ALIAS_MAP.set(item.code, item);
  }
}

// 宏映射表（支持新宏与旧宏）
export const PROMPT_MACRO_MAP = {};
for (const item of PROMPT_REGISTRY) {
  PROMPT_MACRO_MAP[item.id] = item.macro;
  if (item.code) {
    PROMPT_MACRO_MAP[item.code] = item.macro;
  }
  if (item.legacyMacro) {
    PROMPT_MACRO_MAP[item.id] = item.legacyMacro;
  }
}

/**
 * 统一获取提示词内容（优先读取用户定制，否则使用默认）
 */
export function getPrompt(idOrAlias, state = null) {
  const item = ID_ALIAS_MAP.get(idOrAlias);
  if (!item) return '';

  const custom = state?.prompts?.[item.id] ?? (item.code ? state?.prompts?.[item.code] : undefined);
  if (typeof custom === 'string' && custom.trim()) {
    return custom;
  }
  return item.defaultPrompt;
}

/**
 * 获取全量提示词列表（供 UI 与预设管理使用）
 */
export function getAllPrompts(state = null) {
  return PROMPT_REGISTRY.map(def => {
    const custom = state?.prompts?.[def.id] ?? (def.code ? state?.prompts?.[def.code] : undefined);
    const isCustom = typeof custom === 'string' && custom.trim() !== '' && custom !== def.defaultPrompt;
    return {
      ...def,
      currentPrompt: isCustom ? custom : def.defaultPrompt,
      isCustom,
    };
  });
}

// 向前兼容导出常量列表
export const PROMPT_DEFINITIONS = PROMPT_REGISTRY;
