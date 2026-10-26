import { normalizeContent } from './content.js';
import { collapseMessages } from './preset-engine.js';

export const BAIBAI_SHARED_CHANNELS_KEY = 'baibai_api_channels';
export const BAIBAI_SHARED_CHANNELS_EVENT = 'st-baibai-api-channels:changed';
export const BAIBAI_BOOK_SETTINGS_KEY = 'baibai_book';

const pool = settings => settings['schedule-planner']?.apiPresets || [];
const refKey = ref => ref ? `${ref.kind}:${ref.channelId || ref.presetId || ''}` : '';
const flat = value => value && ({ url: value.apiUrl, key: value.apiKey, model: value.apiModel, maxTokens: value.apiMaxTokens ?? value.maxTokens ?? value.max_tokens, excludeParams: value.apiExcludeParams, timeoutSec: value.apiTimeoutSec });
const normalizeUrl = value => {
  const url = String(value || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  return /^https?:\/\/[^/?#]+$/i.test(url) ? `${url}/v1` : url;
};

export function getBaiBaiChannels(settings) {
  if (!settings || typeof settings !== 'object') return [];
  const shared = settings[BAIBAI_SHARED_CHANNELS_KEY];
  const list = Array.isArray(shared?.channels)
    ? shared.channels
    : Array.isArray(settings[BAIBAI_BOOK_SETTINGS_KEY]?.channels)
      ? settings[BAIBAI_BOOK_SETTINGS_KEY].channels
      : [];
  return list.filter(item => item && typeof item === 'object' && item.id);
}

export function listApiSources(settings) {
  const sources = [];
  const baibaiChannels = getBaiBaiChannels(settings);
  const baibaiBook = settings?.[BAIBAI_BOOK_SETTINGS_KEY];
  const summaryId = baibaiBook?.assignments?.summary;
  const resummaryId = baibaiBook?.assignments?.resummary;

  // 1. 跟随柏宝书当前指派的渠道
  if (summaryId) {
    const ch = baibaiChannels.find(x => x.id === summaryId);
    if (ch) sources.push({ ref: { kind: 'baibai-book-summary' }, label: `跟随柏宝书 · 摘要 (${ch.name || ch.model})`, model: ch.model });
  }
  if (resummaryId) {
    const ch = baibaiChannels.find(x => x.id === resummaryId);
    if (ch) sources.push({ ref: { kind: 'baibai-book-resummary' }, label: `跟随柏宝书 · 总结 (${ch.name || ch.model})`, model: ch.model });
  }

  // 2. 柏宝书 / 柏宝绘共享渠道池中的所有独立渠道
  for (const ch of baibaiChannels) {
    sources.push({
      ref: { kind: 'baibai-channel', channelId: ch.id },
      label: `柏宝渠道 · ${ch.name || ch.model || '未命名'}`,
      model: ch.model,
    });
  }

  // 3. 历史兼容源 (千千结、schedule-planner共享预设)
  const qqj = settings.qianqianjie;
  if (qqj?.apiUrl || qqj?.apiKey || (qqj?.apiMode === 'seven-preset' && qqj.selectedSevenDaysPresetId)) {
    const value = qqj.apiMode === 'seven-preset' ? pool(settings).find(x => x.id === qqj.selectedSevenDaysPresetId) : flat(qqj);
    sources.push({ ref: { kind: 'qqj-current' }, label: '跟随千千结', model: value?.model });
  }
  for (const item of pool(settings)) {
    if (item.id) sources.push({ ref: { kind: 'shared-preset', presetId: item.id }, label: `共享预设 · ${item.name || item.model || '未命名'}`, model: item.model });
  }
  return sources;
}

export function resolveApiConfig(settings, ref) {
  let config;
  const baibaiChannels = getBaiBaiChannels(settings);
  const baibaiBook = settings?.[BAIBAI_BOOK_SETTINGS_KEY];

  if (ref?.kind === 'baibai-book-summary') {
    const id = baibaiBook?.assignments?.summary;
    config = baibaiChannels.find(x => x.id === id);
  } else if (ref?.kind === 'baibai-book-resummary') {
    const id = baibaiBook?.assignments?.resummary;
    config = baibaiChannels.find(x => x.id === id);
  } else if (ref?.kind === 'baibai-channel') {
    config = baibaiChannels.find(x => x.id === ref.channelId);
  } else if (ref?.kind === 'qqj-current') {
    const q = settings.qianqianjie;
    config = q?.apiMode === 'seven-preset' ? pool(settings).find(x => x.id === q.selectedSevenDaysPresetId) : flat(q);
  } else if (ref?.kind === 'shared-preset') {
    config = pool(settings).find(x => x.id === ref.presetId);
  }

  const url = normalizeUrl(config?.url);
  if (!/^https?:\/\//i.test(url) || !config?.key || !config?.model) throw new Error('请在手机设置中选择可用连接，或在原配置中补全地址、密钥和模型。');
  const rawMaxTokens = Number(config.maxTokens ?? config.max_tokens ?? config.apiMaxTokens);
  return {
    url,
    key: config.key,
    model: config.model,
    temperature: typeof config.temperature === 'number' ? config.temperature : 0.8,
    maxTokens: Number.isFinite(rawMaxTokens) && rawMaxTokens > 0 ? Math.floor(rawMaxTokens) : 65535,
    excludeParams: config.excludeParams || [],
    timeoutSec: config.timeoutSec || 180,
    reasoningEffort: typeof config.reasoningEffort === 'string' ? config.reasoningEffort.trim() : '',
  };
}

export async function saveManualPreset(settings, draft, saveSettings) {
  const id = globalThis.crypto.randomUUID();
  const name = draft.name?.trim() || draft.model?.trim() || '新渠道';
  const url = normalizeUrl(draft.url);
  const key = draft.key?.trim();
  const model = draft.model?.trim();
  const reasoningEffort = draft.reasoningEffort?.trim() || '';

  // 柏宝书 / 柏宝绘 标准渠道结构
  const baibaiChannel = {
    id,
    name,
    url,
    key,
    model,
    temperature: 0.8,
    maxTokens: 65535,
    timeoutSec: 180,
    stream: false,
    excludeParams: [],
    reasoningEffort,
  };

  // 1. 同步存入 baibai_api_channels 共享存储 (实时广播与跨插件共享)
  const shared = settings[BAIBAI_SHARED_CHANNELS_KEY] ||= { schemaVersion: 1, revision: 0, channels: [] };
  const prevShared = Array.isArray(shared.channels) ? [...shared.channels] : [];
  shared.schemaVersion = 1;
  shared.revision = (Number(shared.revision) || 0) + 1;
  shared.channels = [...prevShared, baibaiChannel];

  // 2. 同时存入 schedule-planner 保证老逻辑和单测完全兼容
  const preset = { id, name, url, key, model, excludeParams: [], timeoutSec: 180, stream: false };
  const container = settings['schedule-planner'] ||= {};
  const previous = container.apiPresets;
  container.apiPresets = [...(previous || []), preset];

  try {
    await saveSettings();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(BAIBAI_SHARED_CHANNELS_EVENT, { detail: { revision: shared.revision, source: 'ST-TwoMoreThings' } }));
    }
  } catch {
    shared.channels = prevShared;
    container.apiPresets = previous;
    throw new Error('连接保存失败，请重试。');
  }
  return { kind: 'shared-preset', presetId: preset.id };
}

export function createApiSettings({ host, onBusyChange = () => {} }) {
  const settingsKey = host.phoneSettingsKey || 'pocketPhone';
  const api = {
    listSources: () => listApiSources(host.readSettings()),
    async fetchModels(draft) {
      const url = normalizeUrl(draft.url), key = String(draft.key || '').trim();
      if (!/^https?:\/\//i.test(url) || !key) throw new Error('请先填写接口地址和密钥，再拉取模型。');
      onBusyChange(true);
      try {
        let response;
        try { response = await host.request('/api/backends/chat-completions/status', { method: 'POST', body: JSON.stringify({ chat_completion_source: 'openai', reverse_proxy: url, proxy_password: key }), signal: AbortSignal.timeout(60000) }); }
        catch { throw new Error('模型列表拉取失败，请检查酒馆和接口连接后重试。'); }
        if (!response.ok) throw new Error(`模型列表拉取失败（${response.status}），请检查接口地址和密钥。`);
        let data;
        try { data = await response.json(); }
        catch { throw new Error('接口没有返回可读取的模型列表。'); }
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const models = [...new Set(rows.map(item => typeof item === 'string' ? item : item?.id).filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))].sort();
        if (!models.length) throw new Error('接口没有返回可用模型，可检查接口或自行填写模型名称。');
        return models;
      } finally { onBusyChange(false); }
    },
    getSelected() {
      const settings = host.readSettings();
      const selected = settings[settingsKey]?.apiSourceRef || settings.pocketPhone?.apiSourceRef;
      if (selected) return selected;
      const sources = api.listSources();
      return sources.find(x => x.ref.kind === 'baibai-book-summary')?.ref
        || sources.find(x => x.ref.kind === 'baibai-channel')?.ref
        || sources.find(x => x.ref.kind === 'qqj-current')?.ref
        || (sources.length === 1 ? sources[0].ref : null);
    },
    async select(ref) {
      if (!api.listSources().some(x => refKey(x.ref) === refKey(ref))) throw new Error('这条连接已不存在，请重新选择。');
      const settings = host.readSettings();
      const previous = settings[settingsKey];
      settings[settingsKey] = { ...previous, apiSourceRef: { ...ref } };
      try { await host.saveSettings(); }
      catch { settings[settingsKey] = previous; throw new Error('连接选择保存失败，请重试。'); }
    },
    async saveManual(draft) {
      const ref = await saveManualPreset(host.readSettings(), draft, host.saveSettings);
      await api.select(ref);
      return ref;
    },
    resolve: () => resolveApiConfig(host.readSettings(), api.getSelected()),
  };
  return api;
}

export function createModelClient({ host, sourceProvider, onBusyChange = () => {} }) {
  return {
    async complete({ system, messages = [], entries, collapsedMessages, maxTokens }) {
      onBusyChange(true);
      try {
        const config = sourceProvider.resolve();
        const payloadMessages = [];
        const ordered = collapsedMessages || (Array.isArray(entries) && entries.length ? collapseMessages(entries) : null);
        if (ordered && ordered.length) {
          for (const m of ordered) {
            payloadMessages.push({ role: m.role, content: m.content });
          }
        } else {
          if (system && String(system).trim()) {
            payloadMessages.push({ role: 'system', content: String(system) });
          }
          if (Array.isArray(messages)) {
            payloadMessages.push(...messages);
          }
        }
        const resolvedMaxTokens = Number.isFinite(Number(config.maxTokens)) && Number(config.maxTokens) > 0
          ? Math.floor(Number(config.maxTokens))
          : (Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.floor(Number(maxTokens)) : 65535);
        const body = { chat_completion_source: 'openai', reverse_proxy: config.url, proxy_password: config.key, model: config.model, messages: payloadMessages, stream: false, temperature: typeof config.temperature === 'number' ? config.temperature : 0.8, max_tokens: resolvedMaxTokens };
        if (config.reasoningEffort) {
          body.reasoning_effort = config.reasoningEffort;
        }
        for (const key of config.excludeParams) if (['temperature', 'max_tokens', 'reasoning_effort'].includes(key)) delete body[key];
        let response;
        try { response = await host.request('/api/backends/chat-completions/generate', { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(1, Number(config.timeoutSec) || 180) * 1000) }); }
        catch (error) { throw new Error(error.name === 'TimeoutError' ? '生成等待超时，请稍后重试。' : '生成请求未能连接，请检查酒馆和接口连接后重试。'); }
        if (!response.ok) throw new Error(`生成失败（${response.status}），请检查所选连接的地址、密钥和模型。`);
        let data;
        try { data = await response.json(); }
        catch { throw new Error('接口没有返回可读取的回答，请检查所选模型后重试。'); }
        if (data?.error) {
          const msg = typeof data.error === 'string' ? data.error : data.error?.message || JSON.stringify(data.error);
          throw new Error(`接口报错：${msg}`);
        }
        const choice = data.choices?.[0];
        const content = choice?.message?.content ?? choice?.text ?? choice?.message?.text ?? data.text ?? data.response;
        let text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
        const reasoning = String(
          choice?.message?.reasoning_content ??
          choice?.message?.reasoning ??
          choice?.reasoning_content ??
          data?.reasoning_content ??
          ''
        ).trim();
        if (reasoning && !text.includes('<think>')) {
          text = `<think>${reasoning}</think>\n${text}`;
        } else if (!text.trim() && reasoning) {
          text = reasoning;
        }
        if (!text.trim()) {
          if (choice?.finish_reason === 'length') {
            throw new Error('模型生成中断（Token 已耗尽，可能被思考过程消耗），请稍后重试或检查模型设置。');
          }
          throw new Error('模型没有返回正文，请检查连接或稍后重试。');
        }
        return text;
      } finally { onBusyChange(false); }
    },
  };
}

const string = value => typeof value === 'string' ? value.trim() : '';
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
function extract(value, kind) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const keys = kind === 'messages' ? ['messages', 'replies', 'reply', 'message'] : kind === 'contacts' ? ['contacts', 'people'] : ['posts', 'threads'];
  for (const key of keys) if (value[key] != null) return array(value[key]);
  for (const key of ['data', 'result', 'answer']) if (value[key] && typeof value[key] === 'object') { const found = extract(value[key], kind); if (found) return found; }
  return null;
}

export function parsePayload(text, kind, { allowEmpty = false, indexed = false } = {}) {
  const cleanText = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const source = cleanText;
  const candidates = [source, ...[...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(x => x[1])];
  const first = source.indexOf('{');
  const last = source.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  let items;
  for (const candidate of candidates) {
    try { items = extract(JSON.parse(candidate), kind); } catch { continue; }
    if (items) break;
  }
  const valid = (items || []).flatMap(item => {
    if (kind === 'messages') {
      if (item?.role && !['assistant', 'char'].includes(item.role)) return indexed ? [null] : [];
      const content = normalizeContent(item);
      return content ? [content] : indexed ? [null] : [];
    }
    if (!item || typeof item !== 'object') return [];
    if (kind === 'contacts') {
      const name = string(item.name ?? item.displayName);
      return name ? [{ name, personality: string(item.personality), expression: string(item.expression ?? item.speakingStyle),
        ...(string(item.nickname) ? { nickname: string(item.nickname) } : {}),
        ...(string(item.language) ? { language: string(item.language) } : {}),
        ...(string(item.sourceId) ? { sourceId: string(item.sourceId) } : {}),
      }] : [];
    }
    const title = string(item.title), author = string(item.author ?? item.username), content = string(item.content ?? item.text);
    if (!title || !author || !content) return [];
    const comments = array(item.comments ?? item.replies).flatMap(comment => {
      const author = string(comment?.author ?? comment?.username), text = string(comment?.text ?? comment?.content);
      const translation = string(comment?.translation ?? comment?.translatedText);
      return author && text ? [{ author, text, ...(translation ? { translation } : {}) }] : [];
    });
    const titleTranslation = string(item.titleTranslation ?? item.title_translation);
    const contentTranslation = string(item.contentTranslation ?? item.content_translation ?? item.translation);
    return [{ title, author, content, comments, category: string(item.category),
      ...(titleTranslation ? { titleTranslation } : {}), ...(contentTranslation ? { contentTranslation } : {}),
    }];
  });
  if (!valid.some(Boolean) && !allowEmpty) throw new Error(kind === 'contacts' ? '回答中没有可用的联系人，请检查角色卡和世界书后重新整理。' : kind === 'forum' ? '回答中没有可用的完整帖子，请重新刷新。' : '回答中没有可用的对方短信，请点继续重试。');
  return valid;
}

export function parseJsonObject(text) {
  const cleanText = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const source = cleanText, first = source.indexOf('{'), last = source.lastIndexOf('}');
  const fenced = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1]);
  for (const candidate of [source, ...fenced, source.slice(first, last + 1)]) {
    try {
      let value = JSON.parse(candidate);
      for (const key of ['data', 'result', 'answer']) if (value?.[key] && typeof value[key] === 'object') value = value[key];
      if (value && typeof value === 'object') return value;
    } catch { /* 正式JSON可被代码块或说明文字包裹。 */ }
  }
  throw new Error('回答中的JSON无法读取，请重新生成。');
}

export function extractReasoning(text) {
  if (!text) return '';
  const match = String(text).match(/<think>([\s\S]*?)(?:<\/think>|$)/i)
    || String(text).match(/<thought>([\s\S]*?)(?:<\/thought>|$)/i);
  return match ? match[1].trim() : '';
}
