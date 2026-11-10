import { sanitizeStoryBody } from './shared-body-wrappers.js';
import { parseJsonObject } from './api.js';
import { getPrompt, SUMMARY_PROMPT, ORIGIN_SYSTEM_PROMPT } from './prompts.js';
import { latestAiFloor } from './time.js';
import { readTimeline, currentMessages } from './timeline.js';
import { contextMessage, messageText, filterFinishedGameActions } from './content.js';
import { stickerChoices } from './stickers.js';
import { emojiChoices } from './emojis.js';
import { createCalendarReader, resolveTodoSpan } from './calendar.js';
import { defaultGregorianCalendar, parseDateString, formatCalendarEventPromptLine } from './calendar-engine.js';
import { getSocialAuthor, readSocialFeed } from './social.js';
import { publicationLabel } from './social-time.js';
import { readTodos } from './todos.js';
import { replyContext } from './replies.js';
import { createMemorySources } from './memory-sources.js';
import { getActivePreset, compilePromptPreset, collapseMessages, sanitizePhoneContext } from './preset-engine.js';
import { buildMapProjection, formatMapContextPrompt, readBaiBaiBookMapSnapshot } from './map-engine.js';
import { buildOriginInjection } from './origin-injection.js';
import { evaluateFoodieMatch } from './foodie-engine.js';
import { SYSTEM_CONTACT_ID } from './origin-engine.js';

function safeReadWorldInfo(target, options) {
  if (typeof target?.readWorldInfo !== 'function') return Promise.resolve('');
  try {
    return Promise.resolve(target.readWorldInfo(options)).catch(() => '');
  } catch {
    return Promise.resolve('');
  }
}

function recentStory(messages, beforeIndex = messages.length, wrappers = {}, layers = 1) {
  const maxLayers = Math.max(1, Number(layers) || 1);
  const collect = (allowHidden = false) => {
    if (maxLayers <= 1) {
      if (!allowHidden) {
        const floor = latestAiFloor(messages, beforeIndex)?.message;
        const text = floor ? sanitizeStoryBody(floor.mes, wrappers) : '';
        return text ? [{ speaker: floor.name || '角色', text }] : [];
      }
      for (let i = beforeIndex - 1; i >= 0; i--) {
        const m = messages[i];
        if (!m || m.is_user || m.role === 'user') continue;
        if ((m.is_system || m.role === 'system') && !(allowHidden && m?.extra?.bbs_hidden)) continue;
        const raw = String(m.mes ?? m.content ?? '');
        if (!raw.trim()) continue;
        const text = sanitizeStoryBody(raw, wrappers);
        return text ? [{ speaker: m.name || '角色', text }] : [];
      }
      return [];
    }
    const result = [];
    let count = 0;
    for (let i = beforeIndex - 1; i >= 0 && count < maxLayers; i--) {
      const m = messages[i];
      if ((m?.is_system || m?.role === 'system') && !(allowHidden && m?.extra?.bbs_hidden)) continue;
      const raw = String(m?.mes ?? m?.content ?? '');
      if (!raw.trim()) continue;
      const text = sanitizeStoryBody(raw, wrappers);
      if (!text.trim()) continue;
      result.unshift({
        speaker: m.name || (m.is_user || m.role === 'user' ? '用户' : '角色'),
        role: m.is_user || m.role === 'user' ? 'user' : 'assistant',
        text,
      });
      count++;
    }
    return result;
  };
  const hasVisibleAiFloor = Boolean(latestAiFloor(messages, beforeIndex)?.message);
  if (maxLayers <= 1 && hasVisibleAiFloor) return collect(false);
  const primary = collect(false);
  return primary.length ? primary : collect(true);
}
const phoneHistory = (state, id, batch) => currentMessages(state.conversations[id] || [], batch);
const cardText = character => character ? [character.name, character.description, character.personality, character.scenario].map(s => (s || '').trim()).filter(Boolean).join('\n').slice(0, 10000) : '';

function batchFloor(batch) {
  try { const index = JSON.parse(batch?.key)[0]; return Number.isInteger(index) && index >= -1 ? index : null; }
  catch { return null; }
}

// 只从实际来源楼之后取正文证据；截断或缺少来源锚点时明确告知模型证据不全。
function storyProgress(messages, batches, beforeIndex = messages.length, wrappers = {}) {
  const indexes = batches.map(batchFloor), known = indexes.filter(index => index !== null && index < beforeIndex);
  const anchored = batches.length > 0 && known.length === indexes.length;
  const start = anchored && known.length ? Math.min(...known) + 1 : 0;
  let complete = anchored, remaining = 16000, candidates = 0;
  const progress = [];
  for (let index = beforeIndex - 1; index >= start; index--) {
    const message = messages[index];
    if (message?.is_system || message?.role === 'system') continue;
    const raw = String(message?.mes ?? message?.content ?? '');
    if (!raw) continue;
    if (candidates >= 24 || !remaining) { complete = false; break; }
    candidates += 1;
    const text = sanitizeStoryBody(raw, wrappers);
    if (!text) continue;
    const clipped = text.length > remaining;
    progress.push({ speaker: message.name || (message.is_user || message.role === 'user' ? '用户' : '角色'), role: message.is_user || message.role === 'user' ? 'user' : 'assistant', text: clipped ? text.slice(-remaining) : text });
    remaining -= Math.min(text.length, remaining);
    if (clipped) complete = false;
  }
  return { complete, messages: progress.reverse() };
}

function relevantTodos(state, knownIds) {
  const rows = readTodos(state).filter(todo => ['open', 'done'].includes(todo.status) && todo.knownToIds?.some(id => knownIds.includes(id)));
  return [...rows.filter(todo => todo.status === 'open').slice(-30), ...rows.filter(todo => todo.status === 'done').slice(-10)];
}

function todoReference(todo, state, user, clock = null) {
  const name = id => id === '@user' ? state.userProfile?.name || user : state.contacts.find(person => person.id === id)?.name || '已移除联系人';
  const desc = state.calendar?.descriptor || {};
  const cal = { ...defaultGregorianCalendar(), ...desc };
  const today = clock?.date ? parseDateString(clock.date, clock.weekday, cal) : null;
  const span = resolveTodoSpan(todo, cal, today);
  return { id: todo.id, title: todo.title, startAt: todo.startAt || '', endAt: todo.endAt || '', status: todo.status,
    ...(span.days > 1 ? { days: span.days, ...(span.currentDay != null ? { currentDay: span.currentDay } : {}) } : {}),
    participantIds: todo.participantIds, participants: (todo.participantIds || []).map(id => ({ id, name: name(id) })),
    knownToIds: todo.knownToIds, knownTo: (todo.knownToIds || []).map(id => ({ id, name: name(id) })),
    source: { conversationId: todo.sourceConversationId, time: todo.sourceBatch?.label || '',
      missing: !todo.sourceMessageIds?.length || !todo.sourceMessageIds.every(id => state.conversations[todo.sourceConversationId]?.some(message => message.id === id)) },
  };
}

// 卡口用于页面分组和正文回流；人物续聊仍需保留近期已经说定的事，不另存一份摘要。
function recentPhoneHistory(state, id, skipBatchKey) {
  const source = state.conversations[id] || [], history = [];
  let characters = 0;
  for (let index = source.length - 1; index >= 0 && history.length < 20; index--) {
    const message = source[index];
    if (skipBatchKey !== undefined && message.batch?.key === skipBatchKey) continue;
    const content = contextMessage(message, source);
    history.push({ ...content, time: [message.storyDate, message.timeLabel].filter(Boolean).join(' ') || message.batch?.label || '', ...(message.batch ? { sourceBatch: message.batch } : {}) });
    characters += content.text.length + (content.translation?.length || 0);
    if (characters >= 4000) break;
  }
  return history.reverse();
}

// 动态仍以当前已存首页为准；跨到下一楼不抹去人物已公开发布的内容。
function publicSocialContext(state) {
  return readSocialFeed(state).slice(0, 5).flatMap(post => {
    const author = getSocialAuthor(state, post.authorId);
    if (!author) return [];
    return [{ author: author.nickname || author.name, text: post.text || '', publishedAt: publicationLabel(post),
      ...(post.translation ? { translation: post.translation } : {}),
      ...(post.image?.description ? { image: { description: post.image.description } } : {}),
      comments: (post.comments || []).slice(-6).map(({ name, text, translation }) => ({ name, text, ...(translation ? { translation } : {}) })),
    }];
  });
}

function actorIds(people, bridge, snapshot) {
  const ids = new Map(people.filter(person => person.source?.kind === 'qqj').map(person => [person.id, person.source.entityId]));
  if (!people.some(person => person.source?.kind === 'card')) return ids;
  snapshot ||= bridge?.getPeopleSnapshot?.();
  const names = new Map();
  if (snapshot?.status !== 'ready') return ids;
  // 作者实体编号不属于读者；仅用读者快照中唯一的同名人物建立本次召回归属。
  for (const person of snapshot.people?.items || []) names.set(person.displayName, names.has(person.displayName) ? null : person.entityId);
  for (const person of people) if (person.source?.kind === 'card' && names.get(person.name)) ids.set(person.id, names.get(person.name));
  return ids;
}

export function createContextReader({ target, store, qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1, calendar = createCalendarReader(), wrapperSettingsProvider = () => ({}), memorySources = createMemorySources({ target, qqjBridgeProvider }) }) {
  const base = (layers) => {
    const state = store.read();
    const activePreset = getActivePreset(state);
    const actualLayers = layers !== undefined ? layers : (activePreset?.storyLayers !== undefined ? activePreset.storyLayers : 1);
    const person = state.userProfile, batch = readTimeline(target.messages);
    return { character: cardText(target.character), user: person?.name || target.user,
      userProfile: { name: person?.name || target.user, nickname: person?.nickname || '' },
      clock: batch.clock, batch, story: recentStory(target.messages, target.messages.length, wrapperSettingsProvider(), actualLayers) };
  };
  return {
    assertMemorySources() { memorySources.select(); },
    async readForContact(id, { layers } = {}) {
      const state = store.read();
      let contact = state.contacts.find(x => x.id === id);
      if (!contact && id === SYSTEM_CONTACT_ID) {
        contact = {
          id: SYSTEM_CONTACT_ID,
          name: state.origin?.sysName || '系统',
          nickname: '',
          personality: state.origin?.personality || '冷澈客观',
          expression: '系统口吻',
          language: '',
        };
      }
      if (!contact) throw new Error('这个联系人已不存在，请返回短信重新选择。');
      const current = base(layers);
      const thread = state.conversations[id] || [];
      const history = filterFinishedGameActions(phoneHistory(state, id, current.batch), thread);
      const previousMessages = filterFinishedGameActions(recentPhoneHistory(state, id, current.batch.key), thread);
      const todos = relevantTodos(state, [id]);
      const social = state.contactSocialEnabled !== false ? publicSocialContext(state) : [];
      const calendarReference = calendar.context([...current.story.map(item => item.text), messageText(history.at(-1) || {})].join('\n'), { viewerIds: ['@user', id] });
      const workdayInfo = calendar.workdayPrompt ? calendar.workdayPrompt(target.messages) : null;
      const mapProjection = buildMapProjection({ state, baibaiSnapshot: readBaiBaiBookMapSnapshot(), messages: target.messages });
      const mapPrompt = formatMapContextPrompt(mapProjection);
      let related = '';
      const source = memorySources.select(), bridge = source.bridge;
      const storyMemory = memorySources.readStoryMemory(source, 4000);
      const entityId = actorIds([contact], bridge).get(id);
      if (entityId && bridge?.readContext) {
        const query = [contact.name, ...current.story.map(item => item.text), history.at(-1)?.text || ''].join('\n').slice(-8000);
        const context = await bridge.readContext({ query, entityIds: [entityId], maxCharacters: 4000 });
        if (context?.status === 'ready') related = (context.actors || []).filter(x => x.entityId === entityId).map(x => [x.stateText, x.memoryText].filter(Boolean).join('\n')).join('\n').slice(0, 4000);
      }
      return { ...current, ...(storyMemory ? { storyMemory } : {}), todoPeople: [{ id: '@user', name: current.user }, { id, name: contact.name }], todos: todos.map(todo => todoReference(todo, state, current.user, current.clock)), ...(todos.length || previousMessages.length ? { storyProgress: storyProgress(target.messages, [...previousMessages.map(message => message.sourceBatch), ...todos.map(todo => todo.sourceBatch)], target.messages.length, wrapperSettingsProvider()) } : {}), ...(social.length ? { social } : {}), ...(calendarReference ? { calendar: calendarReference } : {}), ...(workdayInfo?.prompt ? { workdayHoliday: workdayInfo } : {}), ...(mapPrompt ? { mapPrompt } : {}), emojis: emojiChoices(), stickers: stickerChoices(), contact: { name: contact.name, nickname: contact.nickname || '', personality: contact.personality, expression: contact.expression, language: contact.language || '' }, previousMessages, history: history.map(message => contextMessage(message, state.conversations[id] || [])), related, worldbook: await safeReadWorldInfo(target, { scanText: [...current.story.map(item => item.text), contact.name, ...history.map(messageText), ...social.map(post => post.text)].join('\n') }) };
    },
    async readForForum({ readMemory = false } = {}) {
      const current = base();
      let storyMemory = '';
      if (readMemory && memorySources) {
        try {
          const source = memorySources.select();
          storyMemory = memorySources.readStoryMemory(source, 6000) || '';
        } catch {
          try {
            storyMemory = memorySources.readStoryMemory({ kind: 'none' }, 6000) || '';
          } catch {}
        }
      }
      // 正文只提供时代、地域与环境背景，公众知情由论坛任务判断，不传用户档案或人物记忆。
      return { clock: current.clock, setting: current.character, storyBackground: current.story,
        ...(storyMemory ? { storyMemory } : {}),
        worldbook: await safeReadWorldInfo(target, { scanText: current.story.map(item => item.text).join('\n') }) };
    },
    async readForSocial(authors, { includePrivateMessages = false } = {}) {
      const current = base(), source = memorySources.select(), bridge = source.bridge, state = store.read();
      const storyMemory = memorySources.readStoryMemory(source, 6000);
      const contacts = authors.filter(person => person.kind !== 'npc');
      const ids = actorIds(contacts, bridge), entityIds = [...new Set(ids.values())];
      const scanText = [...current.story.map(item => item.text), ...authors.map(person => person.name || '')].join('\n');
      let actors = [];
      if (entityIds.length && bridge?.readContext) {
        const context = await bridge.readContext({ query: scanText.slice(-8000), entityIds, maxCharacters: 6000 });
        if (context?.status === 'ready') actors = context.actors || [];
      }
      const privateHistories = new Map(includePrivateMessages ? contacts.map(person => [person.id, recentPhoneHistory(state, person.id)]) : []);
      const privateTodos = includePrivateMessages ? relevantTodos(state, contacts.map(person => person.id)) : [];
      return { ...current, ...(storyMemory ? { storyMemory } : {}), ...(includePrivateMessages && (privateTodos.length || [...privateHistories.values()].some(history => history.length)) ? { storyProgress: storyProgress(target.messages, [...[...privateHistories.values()].flatMap(history => history.map(message => message.sourceBatch)), ...privateTodos.map(todo => todo.sourceBatch)], target.messages.length, wrapperSettingsProvider()) } : {}), authors: authors.map(person => {
        const todos = includePrivateMessages && person.kind !== 'npc' ? relevantTodos(state, [person.id]) : [];
        return { id: person.id, kind: person.kind,
        name: person.name, nickname: person.nickname || '', description: person.description || '',
        personality: person.personality || '', expression: person.expression || '', language: person.language || '',
        ...(includePrivateMessages && person.kind !== 'npc' ? { privateHistory: privateHistories.get(person.id) || [], todoPeople: [{ id: '@user', name: current.user }, { id: person.id, name: person.name }], todos: todos.map(todo => todoReference(todo, state, current.user, current.clock)) } : {}),
        related: actors.filter(actor => ids.has(person.id) && actor.entityId === ids.get(person.id))
          .map(actor => [actor.stateText, actor.memoryText].filter(Boolean).join('\n')).join('\n'),
      }; }), worldbook: await safeReadWorldInfo(target, { scanText }) };
    },
    async readDirectorySources({ readMemory = false } = {}) {
      const snapshot = qqjBridgeProvider?.()?.getPeopleSnapshot?.();
      const state = store.read();
      const knownActors = new Map([...actorIds(state.contacts, null, snapshot)].map(([id, entityId]) => [entityId, id]));
      const people = snapshot?.status === 'ready' ? (snapshot.people?.items || []).filter(person => person.entityId && person.profile).map(person => ({ sourceId: knownActors.get(person.entityId) || `qqj:${person.entityId}`, entityId: person.entityId, name: person.displayName, personality: person.profile.personality || '', expression: person.profile.expression || '' })) : [];
      let storyMemory = '';
      if (readMemory && memorySources) {
        try {
          const source = memorySources.select();
          storyMemory = memorySources.readStoryMemory(source, 6000) || '';
        } catch {}
      }
      return { ...base(), people, contacts: state.contacts.map(({ id, name, nickname }) => ({ id, name, nickname })), groups: (state.groups || []).map(({ id, name, memberIds, userIsMember }) => ({ id, name, memberIds, userIsMember })), ...(storyMemory ? { storyMemory } : {}), worldbook: await safeReadWorldInfo(target) };
    },
    async readForGroup(id, { layers } = {}) {
      const state = store.read(), group = state.groups?.find(item => item.id === id);
      if (!group) throw new Error('这个群聊已不存在，请返回短信重新选择。');
      const current = base(layers);
      const thread = state.conversations[id] || [];
      const history = filterFinishedGameActions(phoneHistory(state, id, current.batch), thread);
      const previousMessages = filterFinishedGameActions(recentPhoneHistory(state, id, current.batch.key), thread);
      const todos = relevantTodos(state, group.memberIds);
      const social = state.groupSocialEnabled !== false ? publicSocialContext(state) : [];
      const calendarReference = calendar.context([...current.story.map(item => item.text), messageText(history.at(-1) || {})].join('\n'), { viewerIds: ['@user', ...group.memberIds] });
      const workdayInfo = calendar.workdayPrompt ? calendar.workdayPrompt(target.messages) : null;
      const mapProjection = buildMapProjection({ state, baibaiSnapshot: readBaiBaiBookMapSnapshot(), messages: target.messages });
      const mapPrompt = formatMapContextPrompt(mapProjection);
      const members = group.memberIds.map(key => {
        const person = state.contacts.find(item => item.id === key);
        if (!person) throw new Error('有群成员不在联系人中，请编辑群聊重新选择。');
        return { id: person.id, name: person.name, nickname: person.nickname || '', personality: person.personality || '', expression: person.expression || '', language: person.language || '', source: person.source };
      });
      const source = memorySources.select(), bridge = source.bridge, ids = actorIds(members, bridge), entityIds = [...new Set(ids.values())];
      const storyMemory = memorySources.readStoryMemory(source, 6000);
      let actors = [];
      if (entityIds.length && bridge?.readContext) {
        const query = [group.name, ...current.story.map(item => item.text), history.at(-1)?.text || ''].join('\n').slice(-8000);
        const related = await bridge.readContext({ query, entityIds, maxCharacters: 6000 });
        if (related?.status === 'ready') actors = related.actors || [];
      }
      const roster = members.map(({ source, ...person }) => ({ ...person, related: actors.filter(actor => ids.has(person.id) && actor.entityId === ids.get(person.id)).map(actor => [actor.stateText, actor.memoryText].filter(Boolean).join('\n')).join('\n') }));
      if (group.userIsMember) roster.push({ id: '@user', ...current.userProfile });
      let privateBudget = 6000;
      const privateHistories = members.flatMap(person => {
        const messages = [];
        for (const message of recentPhoneHistory(state, person.id).slice(-8).reverse()) {
          const size = message.text.length + (message.translation?.length || 0);
          if (size > privateBudget) break;
          messages.unshift(message); privateBudget -= size;
        }
        return messages.length ? [{ contactId: person.id, knownToIds: ['@user', person.id], messages }] : [];
      });
      const evidence = [...previousMessages, ...privateHistories.flatMap(thread => thread.messages)].map(message => message.sourceBatch);
      return { ...current, ...(storyMemory ? { storyMemory } : {}), todoPeople: roster.map(({ id, name }) => ({ id, name })), todos: todos.map(todo => todoReference(todo, state, current.user, current.clock)), privateHistories, ...(todos.length || evidence.length ? { storyProgress: storyProgress(target.messages, [...evidence, ...todos.map(todo => todo.sourceBatch)], target.messages.length, wrapperSettingsProvider()) } : {}), ...(social.length ? { social } : {}), ...(calendarReference ? { calendar: calendarReference } : {}), ...(workdayInfo?.prompt ? { workdayHoliday: workdayInfo } : {}), ...(mapPrompt ? { mapPrompt } : {}), emojis: emojiChoices(), stickers: stickerChoices(), group: { name: group.name, userIsMember: group.userIsMember, members: roster }, previousMessages, history: history.map(message => contextMessage(message, state.conversations[id] || [])), worldbook: await safeReadWorldInfo(target, { scanText: [...current.story.map(item => item.text), ...members.map(person => person.name), ...history.map(messageText), ...social.map(post => post.text)].join('\n') }) };
    },

  };
}

export const summaryCache = new WeakMap();

export function computePhoneHash(conversations, todos, batchKey) {
  const convPart = (conversations || []).map(c => `${c.id}:${c.messages?.length || 0}:${c.messages?.at(-1)?.id || ''}`).join('|');
  const todoPart = (todos || []).map(t => `${t.id}:${t.status}`).join('|');
  return `${batchKey || ''}::${convPart}::${todoPart}`;
}

async function executeSummaryGeneration({
  target, store, modelClient, state, beforeIndex, batch, calendarContext,
  conversations, todos, wrapperSettingsProvider, memorySources, qqjBridgeProvider, host
}) {
  const maxCharacters = Number(state.summaryMaxCharacters) || 100;
  const activePreset = getActivePreset(state);
  const storyRecent = recentStory(target.messages, beforeIndex, wrapperSettingsProvider(), activePreset?.storyLayers !== undefined ? activePreset.storyLayers : 1);
  const storyHistoryText = storyRecent.map(item => `${item.speaker || '角色'}：${item.text}`).join('\n\n');

  let storyMemory = '';
  let effectiveMemorySources = memorySources;
  if (!effectiveMemorySources && typeof createMemorySources === 'function') {
    try {
      effectiveMemorySources = createMemorySources({
        target,
        qqjBridgeProvider,
        settingsProvider: host?.readSettings,
      });
    } catch {}
  }
  if (effectiveMemorySources) {
    try {
      const source = effectiveMemorySources.select();
      storyMemory = effectiveMemorySources.readStoryMemory(source, 4000) || '';
    } catch {}
  }

  const phoneContextData = sanitizePhoneContext({
    time: batch.label,
    calendar: calendarContext?.events || [],
    conversations,
    todos: todos.map(todo => todoReference(todo, state, target.user, batch.clock)),
    storyProgress: storyProgress(target.messages, [...conversations.map(() => batch), ...todos.map(todo => todo.sourceBatch)], beforeIndex, wrapperSettingsProvider()),
    maxCharacters,
  });

  let worldbook = '';
  if (typeof target?.readWorldInfo === 'function') {
    try {
      const scanLines = [
        ...storyRecent.map(item => item.text),
        ...conversations.flatMap(c => c.messages.map(m => m.text)),
        ...todos.map(t => t.title),
      ];
      worldbook = await target.readWorldInfo({ scanText: scanLines.join('\n') }) || '';
    } catch {}
  }

  const messagesPayload = compilePromptPreset(activePreset, {
    worldbook,
    storyHistory: storyHistoryText,
    storyMemory,
    phoneContext: phoneContextData,
    maxCharacters,
  }, 'summary', state);

  const collapsed = collapseMessages(messagesPayload);
  const systemEntries = messagesPayload.filter(m => m.role === 'system');
  const userEntries = messagesPayload.filter(m => m.role !== 'system');
  const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

  const reply = await modelClient.complete({
    label: '短信回流正文记忆摘要',
    system: systemPrompt,
    messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(phoneContextData) }],
    entries: messagesPayload,
    collapsedMessages: collapsed,
  });

  const answer = parseJsonObject(reply);
  let value = answer.summary ?? answer.reference ?? answer.content ?? answer.text;
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') value = value.text;
    else if (typeof value.content === 'string') value = value.content;
  }
  if (typeof value !== 'string') {
    throw new Error(`手机参考没有生成${maxCharacters}字以内的有效内容，本次正文未带入手机消息。`);
  }
  const chars = Array.from(value.trim());
  if (chars.length > maxCharacters) {
    if (state.summaryAutoTruncate) {
      value = chars.slice(0, maxCharacters).join('');
    } else {
      throw new Error(`手机参考没有生成${maxCharacters}字以内的有效内容，本次正文未带入手机消息。`);
    }
  }
  return value.trim();
}

// 短材料由主楼本轮判断采用；长材料沿用一次摘要并核对进展，不另加分析请求。
export function createBackflowService({
  target,
  store,
  modelClient,
  isEnabled = () => true,
  wrapperSettingsProvider = () => ({}),
  calendar = null,
  memorySources = null,
  qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1,
  host = null
}) {
  return {
    async summarize() {
      const state = store.read();
      const beforeIndex = target.messages.length;
      const batch = readTimeline(target.messages, beforeIndex);

      let calendarContext = null;
      if (calendar?.context) {
        try { calendarContext = calendar.context(batch.label); } catch {}
      }

      const todos = relevantTodos(state, ['@user']).filter(todo => {
        const floor = batchFloor(todo.sourceBatch);
        return floor === null || floor < beforeIndex;
      });
      const conversations = [];
      for (const person of [...state.contacts, ...(state.groups || []).filter(group => group.userIsMember)]) {
        const thread = state.conversations[person.id] || [];
        const messages = filterFinishedGameActions(phoneHistory(state, person.id, batch), thread);
        if (!messages.length) continue;
        conversations.push({
          id: person.id, name: person.name, kind: person.memberIds ? 'group' : 'private',
          knownToIds: person.memberIds ? ['@user', ...person.memberIds] : ['@user', person.id],
          messages: messages.map(message => {
            const replyTo = replyContext(message, thread);
            return {
              id: message.id,
              speaker: message.role === 'user' ? state.userProfile?.name || target.user : person.memberIds ? state.contacts.find(contact => contact.id === message.speakerId)?.name || '群成员' : person.name,
              text: messageText(message),
              ...(message.translation ? { translation: message.translation } : {}),
              ...(message.type === 'transfer' ? { recipient: message.transfer.recipientId === '@user' ? state.userProfile?.name || target.user : state.contacts.find(contact => contact.id === message.transfer.recipientId)?.name || '已移出的联系人' } : {}),
              ...(message.type === 'game' ? { game: { kind: message.game.kind, title: message.game.title, wager: message.game.wager, status: message.game.status, winner: message.game.winner === 'user' ? state.userProfile?.name || target.user : message.game.winner === 'ai' ? person.name : '', round: message.game.round, turn: message.game.turn, lastAction: message.game.lastAction?.description || '' } } : {}),
              ...(message.forwarded ? { forwarded: true, ...(message.forwardedFrom ? { forwardedFrom: message.forwardedFrom } : {}) } : {}),
              ...(replyTo ? { replyTo } : {}),
            };
          })
        });
      }

      if (!conversations.length && !todos.length) {
        throw new Error('当前批次暂无需要总结的短信或待办。');
      }

      const summary = await executeSummaryGeneration({
        target, store, modelClient, state, beforeIndex, batch, calendarContext,
        conversations, todos, wrapperSettingsProvider, memorySources, qqjBridgeProvider, host
      });

      if (summary) {
        await store.saveManualSummary({ text: summary, generatedAt: new Date().toISOString() });
        const phoneHash = computePhoneHash(conversations, todos, batch.key);
        summaryCache.set(target, { phoneHash, summary });
      }
      return summary;
    },

    async prepare(type = 'normal') {
      const state = store.read();
      const injectSms = Boolean(state.injectEnabled);
      const injectCal = Boolean(state.injectCalendarEnabled);
      const injectMap = Boolean(state.injectMapEnabled);
      const workdayConfig = state.calendar?.workdayConfig;
      const injectWorkday = Boolean(workdayConfig?.enabled && workdayConfig?.injectStory);
      const injectOrigin = Boolean(state.origin?.enabled && (state.injectOriginEnabled ?? true));
      const injectFoodie = Boolean(state.injectFoodieEnabled);
      if (!isEnabled() || (!injectSms && !injectCal && !injectWorkday && !injectMap && !injectOrigin && !injectFoodie)) return '';
      // 重生成事件发生时旧回答可能尚未移除；参考取自该回答之前的短信卡口。
      const last = target.messages.at(-1);
      const replacing = ['regenerate', 'swipe'].includes(type) && last && !last.is_user && !last.is_system && !['user', 'system'].includes(last.role);
      const beforeIndex = target.messages.length - Number(Boolean(replacing));
      const batch = readTimeline(target.messages, beforeIndex);

      // 地图与位置线索（若开启地图或寻味美食）
      let mapLines = '';
      let mapProj = null;
      if (injectMap || injectFoodie) {
        try {
          mapProj = buildMapProjection({
            state,
            baibaiSnapshot: readBaiBaiBookMapSnapshot(),
            messages: target.messages.slice(0, beforeIndex),
          });
          if (injectMap && mapProj) {
            const text = formatMapContextPrompt(mapProj);
            if (text) {
              mapLines = `[地图与位置线索：\n${text}\n]`;
            }
          }
        } catch {}
      }

      // 作息提示（若开启工作日/节假日带入正文）
      let workdayLines = '';
      if (injectWorkday && calendar?.workdayPrompt) {
        try {
          const workdayInfo = calendar.workdayPrompt(target.messages.slice(0, beforeIndex));
          if (workdayInfo?.prompt) {
            workdayLines = `[当前作息：\n${workdayInfo.prompt}\n]`;
          }
        } catch {}
      }

      // 天气提示（若开启天气提示）
      let weatherLines = '';
      if (calendar?.weatherPrompt) {
        try {
          const weatherInfo = calendar.weatherPrompt(target.messages.slice(0, beforeIndex));
          if (weatherInfo?.prompt) {
            weatherLines = `[${weatherInfo.prompt}]`;
          }
        } catch {}
      }

      // 日历线索（解耦上下文感知与正文注入）
      let calendarContext = null;
      let calendarLines = '';
      if (calendar?.context) {
        try {
          calendarContext = calendar.context(batch.label, { viewerIds: ['@user'] });
          if (injectCal && calendarContext?.events?.length) {
            const seenLines = new Set();
            const list = calendarContext.events
              .map(e => formatCalendarEventPromptLine(e))
              .filter(line => {
                if (!line || seenLines.has(line)) return false;
                seenLines.add(line);
                return true;
              })
              .join('\n');
            if (list) calendarLines = `[日历线索：\n${list}\n]`;
          }
        } catch {}
      }

      // 短信与待办（若开启短信带入正文）
      let todos = [];
      const conversations = [];
      if (injectSms) {
        todos = relevantTodos(state, ['@user']).filter(todo => {
          const floor = batchFloor(todo.sourceBatch);
          return floor === null || floor < beforeIndex;
        });
        for (const person of [...state.contacts, ...(state.groups || []).filter(group => group.userIsMember)]) {
          const thread = state.conversations[person.id] || [];
          const messages = filterFinishedGameActions(phoneHistory(state, person.id, batch), thread);
          if (!messages.length) continue;
          conversations.push({ id: person.id, name: person.name, kind: person.memberIds ? 'group' : 'private', knownToIds: person.memberIds ? ['@user', ...person.memberIds] : ['@user', person.id], messages: messages.map(message => {
            const replyTo = replyContext(message, thread);
            return { id: message.id,
              speaker: message.role === 'user' ? state.userProfile?.name || target.user : person.memberIds ? state.contacts.find(contact => contact.id === message.speakerId)?.name || '群成员' : person.name,
              text: messageText(message), ...(message.translation ? { translation: message.translation } : {}),
              ...(message.type === 'transfer' ? { recipient: message.transfer.recipientId === '@user' ? state.userProfile?.name || target.user : state.contacts.find(contact => contact.id === message.transfer.recipientId)?.name || '已移出的联系人' } : {}),
              ...(message.type === 'game' ? { game: { kind: message.game.kind, title: message.game.title, wager: message.game.wager, status: message.game.status, winner: message.game.winner === 'user' ? state.userProfile?.name || target.user : message.game.winner === 'ai' ? person.name : '', round: message.game.round, turn: message.game.turn, lastAction: message.game.lastAction?.description || '' } } : {}),
              ...(message.forwarded ? { forwarded: true, ...(message.forwardedFrom ? { forwardedFrom: message.forwardedFrom } : {}) } : {}),
              ...(replyTo ? { replyTo } : {}),
            };
          }) });
        }
      }

      // 金手指系统与任务线索（若开启系统带入正文）
      let originLines = '';
      if (injectOrigin) {
        try {
          const sysPrompt = getPrompt('origin_system', state) || ORIGIN_SYSTEM_PROMPT;
          const text = buildOriginInjection(state.origin, {
            currentTurn: beforeIndex,
            systemPrompt: sysPrompt,
          });
          if (text) {
            originLines = text.trim();
          }
        } catch {}
      }

      // 寻味美食线索（若开启寻味带入正文）
      let foodieLines = '';
      if (injectFoodie) {
        try {
          const lastFloor = latestAiFloor(target.messages, beforeIndex)?.message;
          const storyText = lastFloor ? sanitizeStoryBody(lastFloor.mes, wrapperSettingsProvider()) : '';
          const matchResult = evaluateFoodieMatch({
            state,
            storyText,
            mapProjection: mapProj,
            calendarContext,
            turnIndex: beforeIndex
          });
          if (matchResult && matchResult.triggered && matchResult.prompt) {
            foodieLines = matchResult.prompt;
          }
          if (matchResult) {
            const nextFoodieState = {
              ...(state.foodie || {}),
              current: matchResult,
              session: matchResult.session || (matchResult.status === 'locked' ? state.foodie?.session : null),
              lastTrace: matchResult.trace
            };
            store.save({ foodie: nextFoodieState }).catch(() => {});
          }
        } catch {}
      }

      if (!conversations.length && !todos.length && !calendarLines && !workdayLines && !weatherLines && !mapLines && !originLines && !foodieLines) return '';
      const parts = [];
      if (originLines) parts.push(originLines);
      if (workdayLines) parts.push(workdayLines);
      if (weatherLines) parts.push(weatherLines);
      if (calendarLines) parts.push(calendarLines);
      if (mapLines) parts.push(mapLines);
      if (foodieLines) parts.push(foodieLines);
      if (conversations.length) {
        parts.push(conversations.map(conversation => {
          const lines = conversation.messages.map(message => {
            const quote = message.replyTo;
            const quotedName = quote && (quote.role === 'user' ? state.userProfile?.name || target.user : state.contacts.find(person => person.id === quote.speakerId)?.name || conversation.name);
            const quoted = !quote ? '' : quote.missing ? '[引用：原消息已删除]\n' : `[引用${quotedName}：${quote.messageText}${quote.translation ? `；译文：${quote.translation}` : ''}]\n`;
            const forwardPrefix = message.forwarded ? `[转发自${message.forwardedFrom?.senderName || '他人'}] ` : '';
            return `${quoted}${message.speaker}${message.recipient ? ` → ${message.recipient}` : ''}：${forwardPrefix}${message.text}${message.translation ? `\n译文：${message.translation}` : ''}`;
          });
          return `[${conversation.kind === 'group' ? '群聊' : '私聊'}：${conversation.name}]\n${lines.join('\n')}`;
        }).join('\n'));
      }
      if (todos.length) {
        parts.push('[用户保留的事项；勾选状态由用户手动维护]\n' + todos.map(todo => {
          const item = todoReference(todo, state, target.user, batch.clock);
          const spanNote = item.days > 1
            ? `（${item.currentDay != null ? `共${item.days}天，当前为第${item.currentDay}天` : `共${item.days}天`}）`
            : '';
          return `${item.title}${spanNote}；${item.startAt || '未定'} — ${item.endAt || '未定'}；相关人：${item.participants.map(person => person.name).join('、')}；知情人：${item.knownTo.map(person => person.name).join('、')}；用户标记：${item.status === 'done' ? '已完成' : '未勾选'}`;
        }).join('\n'));
      }
      const reference = parts.join('\n\n');
      const hasSmsOrTodos = conversations.length > 0 || todos.length > 0;
      // 按 Unicode 字符计数，超过门槛就停止；不复制大数组，也不把内部编号或图片文件计入。
      let characters = 0;
      for (const _ of reference) if (++characters > 3000) break;
      const isShort = characters <= 3000;

      // 若没有短信与待办（仅有日历/地图/作息线索），直接注入原文
      if (!hasSmsOrTodos) {
        return reference.trim();
      }

      // 方案一：
      // 1. 手动模式 (manual)：只要有手动填写的总结，始终优先注入该总结（不再受 3000 字拦截）；未填写总结时短内容回退原文
      // 2. 自动模式 (auto)：若开启短内容始终总结 (summaryAlwaysSummarize)，即使是短内容也生成摘要；未开启时短内容直接注入原文
      if (state.summaryMode === 'manual' && state.manualSummary?.text) {
        // 优先进入下方的手动总结注入逻辑
      } else if (isShort && (state.summaryMode === 'manual' || !state.summaryAlwaysSummarize)) {
        return reference.trim();
      }

      let summary = '';
      if (state.summaryMode === 'manual') {
        if (state.manualSummary?.text) {
          summary = String(state.manualSummary.text).trim();
        } else {
          summary = '';
        }
      } else {
        const phoneHash = computePhoneHash(conversations, todos, batch.key);
        const cached = summaryCache.get(target);
        if (cached && cached.phoneHash === phoneHash && typeof cached.summary === 'string') {
          summary = cached.summary;
        } else {
          summary = await executeSummaryGeneration({
            target, store, modelClient, state, beforeIndex, batch, calendarContext,
            conversations, todos, wrapperSettingsProvider, memorySources, qqjBridgeProvider, host
          });
          summaryCache.set(target, { phoneHash, summary });
        }
      }

      if (!summary) {
        if (isShort) return reference.trim();
        return '';
      }
      const current = store.read();
      if (!isEnabled() || (!current.injectEnabled && !current.injectCalendarEnabled && !current.injectMapEnabled && !Boolean(current.calendar?.workdayConfig?.enabled && current.calendar?.workdayConfig?.injectStory))) return '';
      for (const conversation of conversations) {
        const saved = new Map((current.conversations[conversation.id] || []).map(message => [message.id, message]));
        if (conversation.messages.some(message => !saved.has(message.id))) throw new Error('参考中的短信已被删除，本次正文未带入手机消息。');
        if (conversation.messages.some(message => messageText(saved.get(message.id)) !== message.text || (saved.get(message.id).translation || '') !== (message.translation || ''))) throw new Error('参考中的短信已修改，请重新生成正文。');
      }
      for (const todo of todos) {
        if (JSON.stringify(readTodos(current).find(item => item.id === todo.id)) !== JSON.stringify(todo)) throw new Error('参考中的待办已修改或删除，请重新生成正文。');
      }
      const summaryParts = [];
      if (workdayLines) summaryParts.push(workdayLines);
      if (calendarLines) summaryParts.push(calendarLines);
      if (mapLines) summaryParts.push(mapLines);
      if (summary) summaryParts.push(summary);
      return summaryParts.join('\n\n');
    },
  };
}
