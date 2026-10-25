// 世界书读取、激活匹配、SillyTavern 兼容排序与柏宝书排除规则对接中心。

export const SHARED_EXCLUDES_KEY = 'baibai_exclude_settings';
export const SHARED_EXCLUDES_EVENT = 'st-baibai-exclude-settings:changed';
export const SHARED_EXCLUDES_SCHEMA_VERSION = 1;
export const DEFAULT_WI_PATTERNS = ['\\[mvu[\\s\\S]*?\\]'];

const list = value => Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
const macro = (text, values) => String(text).replace(/\{\{\s*(user|char)\s*\}\}/giu, (match, name) => values[name.toLowerCase()] || match);
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 世界书条目插入位置枚举 (对齐 ST world_info_position)
export const WI_POSITION_BEFORE = 0;
export const WI_POSITION_AFTER = 1;
export const WI_POSITION_AN_TOP = 2;
export const WI_POSITION_AN_BOTTOM = 3;
export const WI_POSITION_AT_DEPTH = 4;
export const WI_POSITION_EM_TOP = 5;
export const WI_POSITION_EM_BOTTOM = 6;
export const WI_POSITION_OUTLET = 7;

const WI_BUCKET_ORDER = {
  [WI_POSITION_BEFORE]: 0,    // before 角色前
  [WI_POSITION_AFTER]: 1,     // after 角色后
  [WI_POSITION_AN_TOP]: 2,    // ANTop 作者注前
  [WI_POSITION_AN_BOTTOM]: 3, // ANBottom 作者注后
  [WI_POSITION_AT_DEPTH]: 4,  // atDepth @深度
  [WI_POSITION_EM_TOP]: 5,    // EMTop EM 上锚
  [WI_POSITION_EM_BOTTOM]: 6, // EMBottom EM 下锚
  [WI_POSITION_OUTLET]: 99,   // outlet 出口
};

export const WI_DEFAULT_ORDER = 100;
export const WI_DEFAULT_DEPTH = 4;

/**
 * 严格对齐 SillyTavern 标准主提示词装配顺序：
 * 1. 桶间按 position 出现先后排序（角色前 → 角色后 → 作者注前/后 → @深度 → EM）
 * 2. @深度桶内按 depth 降序（深度大的离对话末尾更远，先出现）后按 order 升序
 * 3. 桶内按 order 升序（修复此前 (b.order - a.order) 导致顺序完全颠倒的严重问题）
 */
export function sortWorldInfoEntriesLikeST(entries) {
  return [...entries].sort((a, b) => {
    const pa = WI_BUCKET_ORDER[Number(a.position ?? WI_POSITION_BEFORE)] ?? 99;
    const pb = WI_BUCKET_ORDER[Number(b.position ?? WI_POSITION_BEFORE)] ?? 99;
    if (pa !== pb) return pa - pb;
    // 同为 @深度: 深度大的先出现
    if (pa === WI_BUCKET_ORDER[WI_POSITION_AT_DEPTH]) {
      const da = Number.isFinite(a.depth) ? Number(a.depth) : WI_DEFAULT_DEPTH;
      const db = Number.isFinite(b.depth) ? Number(b.depth) : WI_DEFAULT_DEPTH;
      if (da !== db) return db - da;
    }
    // 桶内: order 升序
    const oa = Number.isFinite(a.order) ? Number(a.order) : WI_DEFAULT_ORDER;
    const ob = Number.isFinite(b.order) ? Number(b.order) : WI_DEFAULT_ORDER;
    return oa - ob;
  });
}

/**
 * 从 SillyTavern extensionSettings 或柏宝书共享存储读取排除世界书设置
 */
export function readBaiBaiExcludeSettings(settingsProvider = null) {
  const getCtxSettings = () => {
    try {
      const ctx = typeof globalThis.SillyTavern?.getContext === 'function'
        ? globalThis.SillyTavern.getContext()
        : null;
      return ctx?.extensionSettings || globalThis.extension_settings || {};
    } catch {
      return {};
    }
  };

  const raw = typeof settingsProvider === 'function' ? settingsProvider() : (settingsProvider || getCtxSettings());
  const shared = raw?.[SHARED_EXCLUDES_KEY];
  const book = raw?.baibai_book;

  const rawChars = shared?.excludedChars ?? book?.excludedChars;
  const rawWorlds = shared?.excludedWorldNames ?? book?.excludedWorldNames;
  const rawPatterns = shared?.excludedWorldInfoPatterns ?? book?.excludedWorldInfoPatterns;
  const rawRender = shared?.renderWorldInfoTemplates ?? book?.renderWorldInfoTemplates;
  const rawTags = shared?.customStripTags ?? book?.customStripTags;

  const excludedChars = Array.isArray(rawChars) ? rawChars.filter(x => typeof x === 'string') : [];
  const excludedWorldNames = Array.isArray(rawWorlds) ? rawWorlds.filter(x => typeof x === 'string' && x.trim()) : [];
  const excludedWorldInfoPatterns = Array.isArray(rawPatterns)
    ? rawPatterns.filter(x => typeof x === 'string' && x.trim())
    : [...DEFAULT_WI_PATTERNS];
  const renderWorldInfoTemplates = typeof rawRender === 'boolean' ? rawRender : true;
  const customStripTags = Array.isArray(rawTags) ? rawTags.filter(x => typeof x === 'string' && x.trim()) : [];

  return {
    excludedChars,
    excludedWorldNames,
    excludedWorldInfoPatterns,
    renderWorldInfoTemplates,
    customStripTags,
  };
}

/**
 * 写入共享排除设置并广播跨插件同步事件
 */
export function saveBaiBaiExcludeSettings(settingsTarget, patch = {}, dispatch = true) {
  const settings = typeof settingsTarget === 'function' ? settingsTarget() : settingsTarget;
  if (!settings || typeof settings !== 'object') return null;
  const current = readBaiBaiExcludeSettings(() => settings);
  const next = {
    schemaVersion: SHARED_EXCLUDES_SCHEMA_VERSION,
    revision: (Number(settings[SHARED_EXCLUDES_KEY]?.revision) || 0) + 1,
    excludedChars: Array.isArray(patch.excludedChars) ? patch.excludedChars : current.excludedChars,
    excludedWorldNames: Array.isArray(patch.excludedWorldNames) ? patch.excludedWorldNames : current.excludedWorldNames,
    excludedWorldInfoPatterns: Array.isArray(patch.excludedWorldInfoPatterns) ? patch.excludedWorldInfoPatterns : current.excludedWorldInfoPatterns,
    customStripTags: Array.isArray(patch.customStripTags) ? patch.customStripTags : current.customStripTags,
    renderWorldInfoTemplates: typeof patch.renderWorldInfoTemplates === 'boolean' ? patch.renderWorldInfoTemplates : current.renderWorldInfoTemplates,
  };
  settings[SHARED_EXCLUDES_KEY] = next;
  if (settings.baibai_book && typeof settings.baibai_book === 'object') {
    settings.baibai_book.excludedWorldNames = next.excludedWorldNames;
    settings.baibai_book.excludedWorldInfoPatterns = next.excludedWorldInfoPatterns;
    settings.baibai_book.renderWorldInfoTemplates = next.renderWorldInfoTemplates;
  }
  if (dispatch && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(SHARED_EXCLUDES_EVENT, { detail: { revision: next.revision, source: 'ST-TwoMoreThings' } }));
    } catch {}
  }
  return next;
}

/**
 * 判断某条世界书条目是否命中柏宝书排除规则：
 * ① 整本排除（world 属性命中 excludedWorldNames）
 * ② 条目名（comment）命中任一正则或包含匹配
 */
export function isWorldInfoEntryExcluded(entry, { excludedWorldNames = [], excludedWorldInfoPatterns = [] } = {}) {
  if (!entry) return true;
  const world = typeof entry.world === 'string' ? entry.world.trim() : '';
  if (world && excludedWorldNames.includes(world)) return true;
  const comment = typeof entry.comment === 'string' ? entry.comment.trim() : '';
  if (!comment) return false;
  for (const raw of excludedWorldInfoPatterns) {
    const pat = typeof raw === 'string' ? raw.trim() : '';
    if (!pat) continue;
    let hit = false;
    try {
      hit = new RegExp(pat, 'i').test(comment);
    } catch {
      hit = comment.toLowerCase().includes(pat.toLowerCase());
    }
    if (hit) return true;
  }
  return false;
}

/**
 * 渲染世界书条目内容（展宏 + EJS 模板），对齐柏宝书
 */
export async function renderWorldInfoContent(content, entry, { renderTemplates = true, ctx = null } = {}) {
  let text = typeof content === 'string' ? content : '';
  if (!renderTemplates) return text;
  if (typeof ctx?.substituteParams === 'function') {
    try { text = ctx.substituteParams(text); } catch {}
  }
  if (text.includes('<%')) {
    const ejs = globalThis.EjsTemplate;
    if (ejs && typeof ejs.prepareContext === 'function' && typeof ejs.evalTemplate === 'function') {
      try {
        const env = await ejs.prepareContext({ world_info: entry });
        const out = await ejs.evalTemplate(text, env);
        if (typeof out === 'string') text = out;
      } catch (err) {
        console.warn('[ST-TwoMoreThings] 世界书 EJS 渲染失败，退回原文:', err);
      }
    }
  }
  return text;
}

function matches(text, key, entry, defaults, values) {
  const needle = macro(key, values).trim();
  if (!needle) return false;
  const regex = /^\/([\s\S]*)\/([dgimsuvy]*)$/u.exec(needle);
  if (regex) { try { return new RegExp(regex[1], regex[2]).test(text); } catch { return false; } }
  const sensitive = entry.caseSensitive ?? defaults.caseSensitive;
  const source = sensitive ? text : text.toLocaleLowerCase(), expected = sensitive ? needle : needle.toLocaleLowerCase();
  if (!(entry.matchWholeWords ?? defaults.matchWholeWords)) return source.includes(expected);
  return new RegExp(`(?:^|\\W)${escapeRegex(expected)}(?:$|\\W)`, 'u').test(source);
}

export function selectWorldEntries(entries, text, { defaults = {}, user = '', char = '', excludeSettings = null } = {}) {
  const values = { user, char };
  return entries.filter(entry => {
    if (entry.disable || entry.disabled || entry.enabled === false || typeof entry.content !== 'string') return false;
    if (excludeSettings && isWorldInfoEntryExcluded(entry, excludeSettings)) return false;
    if (entry.constant) return true;
    const match = key => matches(text, key, entry, defaults, values);
    if (!list(entry.key ?? entry.keys).some(match)) return false;
    const secondary = list(entry.keysecondary ?? entry.secondary_keys);
    if (!entry.selective || !secondary.length) return true;
    const hits = secondary.map(match);
    return entry.selectiveLogic === 1 ? !hits.every(Boolean) : entry.selectiveLogic === 2 ? !hits.some(Boolean) : entry.selectiveLogic === 3 ? hits.every(Boolean) : hits.some(Boolean);
  }).sort((a, b) => {
    // 升序排列！
    const oa = Number.isFinite(a.order) ? Number(a.order) : WI_DEFAULT_ORDER;
    const ob = Number.isFinite(b.order) ? Number(b.order) : WI_DEFAULT_ORDER;
    return oa - ob;
  }).map(entry => ({ ...entry, content: macro(entry.content, values) }));
}
