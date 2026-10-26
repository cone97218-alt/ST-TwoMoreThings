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
  TODO_SUGGESTIONS_PROMPT,
  SUMMARY_PROMPT,
  RICH_MESSAGES_PROMPT,
  LANGUAGE_RULE,
  STORY_MEMORY_RULE,
  IMAGE_PROMPT,
} from './prompts.js';
import { shortenMessageId, extractLatestUserInput } from './content.js';

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
  { macro: '{{todo_suggestions_prompt}}', name: '待办事项提取规则', desc: '短信提取待办与核对规则' },
  { macro: '{{rich_messages_prompt}}', name: '表情包与多媒体规则', desc: '表情包、转账与图片消息规则' },
  { macro: '{{language_rule}}', name: '语言与双语翻译规则', desc: '语种与外语中文译文规则' },
  { macro: '{{story_memory_rule}}', name: '剧情摘要知情范围规则', desc: '约束角色不能全知未公开的剧情记忆或他人私下对话' },
  { macro: '{{contacts_prompt}}', name: '联系人风格提炼', desc: '提炼角色线上文字表达习惯' },
  { macro: '{{directory_prompt}}', name: '通讯录批量整理', desc: '智能发掘可能存在的人物和群聊并建立档案' },
  { macro: '{{calendar_prompt}}', name: '日历话题线索注入', desc: '本周节日或纪念日话题提示' },
  { macro: '{{summary_prompt}}', name: '短信回流正文记忆摘要', desc: '判断手机短信与待办哪些值得供正文参考' },
  { macro: '{{image_prompt}}', name: '照片转绘图描述提示词', desc: '自拍或照片描述转为生图提示词' },
];

export const PRESET_SCOPES = [
  { id: '通用', name: '通用', desc: '全部任务通用' },
  { id: '短信', name: '短信', desc: '私聊短信生成' },
  { id: '群聊', name: '群聊', desc: '群聊多角色续写' },
  { id: '心声', name: '心声', desc: '角色隐秘心声' },
  { id: '动态', name: '动态', desc: 'Ainstagram 动态与评论' },
  { id: '论坛', name: '论坛', desc: '公众论坛帖子与回帖' },
  { id: '日历', name: '日历', desc: 'AI 节日与日程' },
  { id: '待办', name: '待办', desc: '待办事项规划' },
  { id: '通讯录', name: '通讯录', desc: '通讯录发掘整理' },
  { id: '联系人', name: '联系人', desc: '联系人风格提炼' },
  { id: '摘要', name: '摘要', desc: '短信回流记忆摘要' },
  { id: '生图', name: '生图', desc: '照片绘图描述' },
  { id: '仅手机app', name: '仅手机app', desc: '除生图/摘要外的手机任务' },
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
    scope: '动态',
    role: 'system',
    enabled: true,
    content: `{{social_prompt}}`,
  },
  {
    id: 'entry_comment_rules',
    name: '动态留言与互动回复',
    scope: '动态',
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
    scope: '日历',
    role: 'system',
    enabled: true,
    content: `{{festival_conceive_prompt}}`,
  },
  {
    id: 'entry_schedule_rules',
    name: 'AI 日程推演助手',
    scope: '日历',
    role: 'system',
    enabled: true,
    content: `{{schedule_deduce_prompt}}`,
  },
  {
    id: 'entry_todo_rules',
    name: '待办事项提取规则',
    scope: '短信+群聊+动态+待办',
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
    id: 'entry_phone_data',
    name: '手机上下文与任务数据',
    scope: '通用',
    role: 'user',
    enabled: true,
    content: `{{phone_context}}`,
  },
];

export const PRESET_SCHEMA_VERSION = 4;

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
          if (cloned.id === 'entry_schedule_rules' && cloned.scope === '日历+待办') {
            cloned.scope = '日历';
          }
          if (cloned.id === 'entry_todo_rules' && cloned.scope === '短信+群聊+待办') {
            cloned.scope = '短信+群聊+动态+待办';
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
        latestUserInput = extractLatestUserInput(phoneContext.history);
      } else if (phoneContext.userInstruction) {
        latestUserInput = phoneContext.userInstruction;
      } else if (phoneContext.focusPreference && phoneContext.focusPreference !== '全部') {
        latestUserInput = `日程推演天数：${phoneContext.deduceDays || 3}天；重点关注/侧重要求：${phoneContext.focusPreference}`;
      }
    }
  }

  const cleanedPhoneContext = sanitizePhoneContext(phoneContext);

  for (const entry of entries) {
    if (!entry.enabled) continue;

    // 作用域检查：如果条目限定了特定场景且与当前任务不符，则跳过
    const scope = entry.scope || '通用';
    if (scope !== '通用') {
      const scopes = scope.split('+').map(s => s.trim());
      const match = scopes.some(s => {
        if (s === '短信' && taskScope === 'chat') return true;
        if (s === '心声' && taskScope === 'thought') return true;
        if (s === '群聊' && taskScope === 'group-chat') return true;
        if (s === '通讯录' && taskScope === 'directory') return true;
        if (s === '联系人' && taskScope === 'contacts') return true;
        if (s === '动态' && ['social-feed', 'social-author'].includes(taskScope)) {
          if (entry.content?.includes('{{comment_prompt}}')) return false;
          if (entry.content?.includes('{{todo_suggestions_prompt}}') && taskScope === 'social-author') return false;
          return true;
        }
        if (s === '动态' && taskScope === 'social-comment') {
          if (entry.content?.includes('{{social_prompt}}')) return false;
          return true;
        }
        if (s === '论坛' && taskScope === 'forum') return true;
        if (s === '日历' && taskScope === 'festival_conceive') {
          if (entry.content?.includes('{{schedule_deduce_prompt}}')) return false;
          return true;
        }
        if (s === '日历' && taskScope === 'schedule_deduce') {
          if (entry.content?.includes('{{festival_conceive_prompt}}')) return false;
          return true;
        }
        if (s === '待办' && ['chat', 'group-chat', 'social-feed', 'social-comment', 'schedule_deduce'].includes(taskScope)) {
          if (taskScope === 'schedule_deduce' && entry.content?.includes('{{todo_suggestions_prompt}}')) return false;
          if (['chat', 'group-chat', 'social-feed', 'social-comment'].includes(taskScope) && entry.content?.includes('{{schedule_deduce_prompt}}')) return false;
          return true;
        }
        if (s === '摘要' && taskScope === 'summary') return true;
        if (s === '生图' && taskScope === 'image_prompt') return true;
        if (s === '仅手机app' && !['summary', 'image_prompt'].includes(taskScope)) return true;
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
    const hasLatestUserInput = content.includes('{{latest_user_input}}');
    const hasCalendar = Boolean(contextData.calendar || cleanedPhoneContext?.calendar);

    // 如果日历插槽在当前批次无日历数据，且无其他文本包装，安全跳过
    if (hasCalendarMacro && !hasCalendar) {
      content = content.replace(/\{\{calendar_prompt\}\}/g, '').trim();
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
    const baseTodoPrompt = getPrompt('todo_suggestions', state) || TODO_SUGGESTIONS_PROMPT;
    const todoPrompt = ['social-feed', 'social-comment'].includes(taskScope)
      ? `${baseTodoPrompt}\n动态和评论不提取私人待办；只有proactiveMessages里的短信可提建议，每项内放自己的todoSuggestions，索引对应该项messages。对应authors里的todoPeople/todos仅供该作者私信使用；storyProgress仅供核对后续进展，不公开，也不代表其他作者知道。`
      : baseTodoPrompt;
    const richPrompt = getPrompt('rich_messages', state) || RICH_MESSAGES_PROMPT;
    const langPrompt = getPrompt('language_rule', state) || LANGUAGE_RULE;
    const storyMemPrompt = getPrompt('story_memory_rule', state) || STORY_MEMORY_RULE;
    const contactsPrompt = getPrompt('contacts', state) || CONTACTS_PROMPT;
    const dirPrompt = getPrompt('directory', state) || DIRECTORY_PROMPT;
    const calPrompt = getPrompt('calendar_context', state) || CALENDAR_PROMPT;
    const sumPrompt = getPrompt('summary', state) || SUMMARY_PROMPT;
    const imgPrompt = getPrompt('image_prompt', state) || IMAGE_PROMPT;

    content = content
      .replace(/\{\{messages_prompt\}\}/g, msgPrompt)
      .replace(/\{\{thought_prompt\}\}/g, thoughtPrompt)
      .replace(/\{\{groups_prompt\}\}/g, grpPrompt)
      .replace(/\{\{social_prompt\}\}/g, socPrompt)
      .replace(/\{\{comment_prompt\}\}/g, cmtPrompt)
      .replace(/\{\{forum_prompt\}\}/g, frmPrompt)
      .replace(/\{\{festival_conceive_prompt\}\}/g, fstPrompt)
      .replace(/\{\{schedule_deduce_prompt\}\}/g, schPrompt)
      .replace(/\{\{todo_suggestions_prompt\}\}/g, todoPrompt)
      .replace(/\{\{rich_messages_prompt\}\}/g, richPrompt)
      .replace(/\{\{language_rule\}\}/g, langPrompt)
      .replace(/\{\{story_memory_rule\}\}/g, storyMemPrompt)
      .replace(/\{\{contacts_prompt\}\}/g, contactsPrompt)
      .replace(/\{\{directory_prompt\}\}/g, dirPrompt)
      .replace(/\{\{calendar_prompt\}\}/g, calPrompt)
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

