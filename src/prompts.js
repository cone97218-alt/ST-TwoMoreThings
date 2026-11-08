// 提示词集中管理中心：已重构为模块化架构（src/prompts/*）
// 本文件作为向后兼容的总导出代理。

export * from './prompts/protocols.js';
export * from './prompts/chat.js';
export * from './prompts/social.js';
export * from './prompts/tools.js';
export * from './prompts/origin.js';
export * from './prompts/games.js';
export * from './prompts/branches.js';
export * from './prompts/clues.js';
export * from './prompts/registry.js';

// 兼容旧版常量别名导出
import { PROTO_LANG, PROTO_MEMORY } from './prompts/protocols.js';
import { CHAT_MESSAGES, CHAT_GROUPS, CHAT_THOUGHT, CHAT_CONTACTS, CHAT_DIRECTORY } from './prompts/chat.js';
import { SOCIAL_FEED, SOCIAL_COMMENT, SOCIAL_FORUM } from './prompts/social.js';
import { TOOL_FESTIVALS, TOOL_SCHEDULES, TOOL_MAPS, TOOL_MAP_CALIBRATE, TOOL_TODOS, TOOL_IMAGE, TOOL_SUMMARY } from './prompts/tools.js';
import { ORIGIN_CHAT, ORIGIN_OBSERVER_CHAT, ORIGIN_TASKS, ORIGIN_STATS, ORIGIN_SHOP, ORIGIN_GACHA } from './prompts/origin.js';
import { GAME_OLD_MAID, GAME_BUCKSHOT, GAME_RICH } from './prompts/games.js';
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
} from './prompts/clues.js';

export const LANGUAGE_RULE = PROTO_LANG;
export const STORY_MEMORY_RULE = PROTO_MEMORY;
export const MESSAGES_PROMPT = CHAT_MESSAGES;
export const GROUP_PROMPT = CHAT_GROUPS;
export const THOUGHT_PROMPT = CHAT_THOUGHT;
export const CONTACTS_PROMPT = CHAT_CONTACTS;
export const DIRECTORY_PROMPT = CHAT_DIRECTORY;
export const SOCIAL_PROMPT = SOCIAL_FEED;
export const COMMENT_PROMPT = SOCIAL_COMMENT;
export const FORUM_PROMPT = SOCIAL_FORUM;
export const CALENDAR_PROMPT = CLUE_CALENDAR;
export const WORKDAY_HOLIDAY_PROMPT = CLUE_WORKDAY;
export const FESTIVAL_CONCEIVE_PROMPT = TOOL_FESTIVALS;
export const SCHEDULE_DEDUCE_PROMPT = TOOL_SCHEDULES;
export const MAP_PROMPT = CLUE_MAP;
export const MAP_ORGANIZE_PROMPT = TOOL_MAPS;
export const MAP_CALIBRATE_PROMPT = TOOL_MAP_CALIBRATE;
export const TODO_SUGGESTIONS_PROMPT = TOOL_TODOS;
export const SUMMARY_PROMPT = TOOL_SUMMARY;
export const RICH_MESSAGES_PROMPT = GAME_RICH;
export const OLD_MAID_PROMPT = GAME_OLD_MAID;
export const BUCKSHOT_ROULETTE_PROMPT = GAME_BUCKSHOT;
export const IMAGE_PROMPT = TOOL_IMAGE;
export const ORIGIN_SYSTEM_PROMPT = CLUE_ORIGIN;
export const ORIGIN_CHAT_PROMPT = ORIGIN_CHAT;
export const ORIGIN_OBSERVER_CHAT_PROMPT = ORIGIN_OBSERVER_CHAT;
export const ORIGIN_TASK_CONCEIVE_PROMPT = ORIGIN_TASKS;
export const ORIGIN_STATS_EVAL_PROMPT = ORIGIN_STATS;
export const ORIGIN_SHOP_CONCEIVE_PROMPT = ORIGIN_SHOP;
export const ORIGIN_GACHA_CONCEIVE_PROMPT = ORIGIN_GACHA;
