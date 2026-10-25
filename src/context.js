import { sanitizeStoryBody } from './shared-body-wrappers.js';
import { parseJsonObject } from './api.js';
import { getPrompt, SUMMARY_PROMPT } from './prompts.js';
import { latestAiFloor } from './time.js';
import { readTimeline, currentMessages } from './timeline.js';
import { contextMessage, messageText } from './content.js';
import { stickerChoices } from './stickers.js';
import { emojiChoices } from './emojis.js';
import { createCalendarReader } from './calendar.js';
import { getSocialAuthor, readSocialFeed } from './social.js';
import { publicationLabel } from './social-time.js';
import { readTodos } from './todos.js';
import { replyContext } from './replies.js';
import { createMemorySources } from './memory-sources.js';
import { getActivePreset } from './preset-engine.js';

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

function todoReference(todo, state, user) {
  const name = id => id === '@user' ? state.userProfile?.name || user : state.contacts.find(person => person.id === id)?.name || '已移除联系人';
  return { id: todo.id, title: todo.title, startAt: todo.startAt || '', endAt: todo.endAt || '', status: todo.status,
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
      const state = store.read(), contact = state.contacts.find(x => x.id === id);
      if (!contact) throw new Error('这个联系人已不存在，请返回短信重新选择。');
      const current = base(layers);
      const history = phoneHistory(state, id, current.batch);
      const previousMessages = recentPhoneHistory(state, id, current.batch.key);
      const todos = relevantTodos(state, [id]);
      const social = publicSocialContext(state);
      const calendarReference = calendar.context([...current.story.map(item => item.text), messageText(history.at(-1) || {})].join('\n'));
      let related = '';
      const source = memorySources.select(), bridge = source.bridge;
      const storyMemory = memorySources.readStoryMemory(source, 4000);
      const entityId = actorIds([contact], bridge).get(id);
      if (entityId && bridge?.readContext) {
        const query = [contact.name, ...current.story.map(item => item.text), history.at(-1)?.text || ''].join('\n').slice(-8000);
        const context = await bridge.readContext({ query, entityIds: [entityId], maxCharacters: 4000 });
        if (context?.status === 'ready') related = (context.actors || []).filter(x => x.entityId === entityId).map(x => [x.stateText, x.memoryText].filter(Boolean).join('\n')).join('\n').slice(0, 4000);
      }
      return { ...current, ...(storyMemory ? { storyMemory } : {}), todoPeople: [{ id: '@user', name: current.user }, { id, name: contact.name }], todos: todos.map(todo => todoReference(todo, state, current.user)), ...(todos.length || previousMessages.length ? { storyProgress: storyProgress(target.messages, [...previousMessages.map(message => message.sourceBatch), ...todos.map(todo => todo.sourceBatch)], target.messages.length, wrapperSettingsProvider()) } : {}), ...(social.length ? { social } : {}), ...(calendarReference ? { calendar: calendarReference } : {}), emojis: emojiChoices(), stickers: stickerChoices(), contact: { name: contact.name, nickname: contact.nickname || '', personality: contact.personality, expression: contact.expression, language: contact.language || '' }, previousMessages, history: history.map(message => contextMessage(message, state.conversations[id] || [])), related, worldbook: await target.readWorldInfo({ scanText: [...current.story.map(item => item.text), contact.name, ...history.map(messageText), ...social.map(post => post.text)].join('\n') }) };
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
        worldbook: await target.readWorldInfo({ scanText: current.story.map(item => item.text).join('\n') }) };
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
        ...(includePrivateMessages && person.kind !== 'npc' ? { privateHistory: privateHistories.get(person.id) || [], todoPeople: [{ id: '@user', name: current.user }, { id: person.id, name: person.name }], todos: todos.map(todo => todoReference(todo, state, current.user)) } : {}),
        related: actors.filter(actor => ids.has(person.id) && actor.entityId === ids.get(person.id))
          .map(actor => [actor.stateText, actor.memoryText].filter(Boolean).join('\n')).join('\n'),
      }; }), worldbook: await target.readWorldInfo({ scanText }) };
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
      return { ...base(), people, contacts: state.contacts.map(({ id, name, nickname }) => ({ id, name, nickname })), groups: (state.groups || []).map(({ id, name, memberIds, userIsMember }) => ({ id, name, memberIds, userIsMember })), ...(storyMemory ? { storyMemory } : {}), worldbook: await target.readWorldInfo() };
    },
    async readForGroup(id, { layers } = {}) {
      const state = store.read(), group = state.groups?.find(item => item.id === id);
      if (!group) throw new Error('这个群聊已不存在，请返回短信重新选择。');
      const current = base(layers);
      const history = phoneHistory(state, id, current.batch);
      const previousMessages = recentPhoneHistory(state, id, current.batch.key);
      const todos = relevantTodos(state, group.memberIds);
      const social = publicSocialContext(state);
      const calendarReference = calendar.context([...current.story.map(item => item.text), messageText(history.at(-1) || {})].join('\n'));
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
      return { ...current, ...(storyMemory ? { storyMemory } : {}), todoPeople: roster.map(({ id, name }) => ({ id, name })), todos: todos.map(todo => todoReference(todo, state, current.user)), privateHistories, ...(todos.length || evidence.length ? { storyProgress: storyProgress(target.messages, [...evidence, ...todos.map(todo => todo.sourceBatch)], target.messages.length, wrapperSettingsProvider()) } : {}), ...(social.length ? { social } : {}), ...(calendarReference ? { calendar: calendarReference } : {}), emojis: emojiChoices(), stickers: stickerChoices(), group: { name: group.name, userIsMember: group.userIsMember, members: roster }, previousMessages, history: history.map(message => contextMessage(message, state.conversations[id] || [])), worldbook: await target.readWorldInfo({ scanText: [...current.story.map(item => item.text), ...members.map(person => person.name), ...history.map(messageText), ...social.map(post => post.text)].join('\n') }) };
    },

  };
}

// 短材料由主楼本轮判断采用；长材料沿用一次摘要并核对进展，不另加分析请求。
export function createBackflowService({ target, store, modelClient, isEnabled = () => true, wrapperSettingsProvider = () => ({}), calendar = null }) {
  return {
    async prepare(type = 'normal') {
      const state = store.read();
      const injectSms = Boolean(state.injectEnabled);
      const injectCal = Boolean(state.injectCalendarEnabled);
      if (!isEnabled() || (!injectSms && !injectCal)) return '';
      // 重生成事件发生时旧回答可能尚未移除；参考取自该回答之前的短信卡口。
      const last = target.messages.at(-1);
      const replacing = ['regenerate', 'swipe'].includes(type) && last && !last.is_user && !last.is_system && !['user', 'system'].includes(last.role);
      const beforeIndex = target.messages.length - Number(Boolean(replacing));
      const batch = readTimeline(target.messages, beforeIndex);

      // 日历线索（若开启日历带入正文）
      let calendarContext = null;
      let calendarLines = '';
      if (injectCal && calendar?.context) {
        try {
          calendarContext = calendar.context(batch.label);
          if (calendarContext?.events?.length) {
            const list = calendarContext.events.map(e => `- ${e.when} ${e.name}${e.note ? `（${e.note}）` : ''}`).join('\n');
            calendarLines = `[日历线索：\n${list}\n]`;
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
          const messages = phoneHistory(state, person.id, batch);
          if (!messages.length) continue;
          const thread = state.conversations[person.id] || [];
          conversations.push({ id: person.id, name: person.name, kind: person.memberIds ? 'group' : 'private', knownToIds: person.memberIds ? ['@user', ...person.memberIds] : ['@user', person.id], messages: messages.map(message => {
            const replyTo = replyContext(message, thread);
            return { id: message.id,
              speaker: message.role === 'user' ? state.userProfile?.name || target.user : person.memberIds ? state.contacts.find(contact => contact.id === message.speakerId)?.name || '群成员' : person.name,
              text: messageText(message), ...(message.translation ? { translation: message.translation } : {}),
              ...(message.type === 'transfer' ? { recipient: message.transfer.recipientId === '@user' ? state.userProfile?.name || target.user : state.contacts.find(contact => contact.id === message.transfer.recipientId)?.name || '已移出的联系人' } : {}),
              ...(replyTo ? { replyTo } : {}),
            };
          }) });
        }
      }

      if (!conversations.length && !todos.length && !calendarLines) return '';
      const parts = [];
      if (calendarLines) parts.push(calendarLines);
      if (conversations.length) {
        parts.push(conversations.map(conversation => {
          const lines = conversation.messages.map(message => {
            const quote = message.replyTo;
            const quotedName = quote && (quote.role === 'user' ? state.userProfile?.name || target.user : state.contacts.find(person => person.id === quote.speakerId)?.name || conversation.name);
            const quoted = !quote ? '' : quote.missing ? '[引用：原消息已删除]\n' : `[引用${quotedName}：${quote.messageText}${quote.translation ? `；译文：${quote.translation}` : ''}]\n`;
            return `${quoted}${message.speaker}${message.recipient ? ` → ${message.recipient}` : ''}：${message.text}${message.translation ? `\n译文：${message.translation}` : ''}`;
          });
          return `[${conversation.kind === 'group' ? '群聊' : '私聊'}：${conversation.name}]\n${lines.join('\n')}`;
        }).join('\n'));
      }
      if (todos.length) {
        parts.push('[用户保留的事项；勾选状态由用户手动维护]\n' + todos.map(todo => {
          const item = todoReference(todo, state, target.user);
          return `${item.title}；${item.startAt || '未定'} — ${item.endAt || '未定'}；相关人：${item.participants.map(person => person.name).join('、')}；知情人：${item.knownTo.map(person => person.name).join('、')}；用户标记：${item.status === 'done' ? '已完成' : '未勾选'}`;
        }).join('\n'));
      }
      const reference = parts.join('\n\n');
      // 按 Unicode 字符计数，超过门槛就停止；不复制大数组，也不把内部编号或图片文件计入。
      let characters = 0;
      for (const _ of reference) if (++characters > 3000) break;
      if (characters <= 3000) return reference.trim();
      const maxCharacters = 100;
      const summaryPrompt = getPrompt('summary', store?.read?.()) || SUMMARY_PROMPT;
      const reply = await modelClient.complete({ system: summaryPrompt, messages: [{ role: 'user', content: JSON.stringify({
        time: batch.label, calendar: calendarContext?.events || [], conversations, todos: todos.map(todo => todoReference(todo, state, target.user)),
        story: recentStory(target.messages, beforeIndex, wrapperSettingsProvider()),
        storyProgress: storyProgress(target.messages, [...conversations.map(() => batch), ...todos.map(todo => todo.sourceBatch)], beforeIndex, wrapperSettingsProvider()), maxCharacters,
      }) }] });
      const answer = parseJsonObject(reply);
      const value = answer.summary ?? answer.reference;
      if (typeof value !== 'string' || Array.from(value.trim()).length > maxCharacters) throw new Error(`手机参考没有生成${maxCharacters}字以内的有效内容，本次正文未带入手机消息。`);
      const summary = value.trim();
      if (!summary) return '';
      const current = store.read();
      if (!isEnabled() || (!current.injectEnabled && !current.injectCalendarEnabled)) return '';
      for (const conversation of conversations) {
        const saved = new Map((current.conversations[conversation.id] || []).map(message => [message.id, message]));
        if (conversation.messages.some(message => !saved.has(message.id))) throw new Error('参考中的短信已被删除，本次正文未带入手机消息。');
        if (conversation.messages.some(message => messageText(saved.get(message.id)) !== message.text || (saved.get(message.id).translation || '') !== (message.translation || ''))) throw new Error('参考中的短信已修改，请重新生成正文。');
      }
      for (const todo of todos) {
        if (JSON.stringify(readTodos(current).find(item => item.id === todo.id)) !== JSON.stringify(todo)) throw new Error('参考中的待办已修改或删除，请重新生成正文。');
      }
      const summaryParts = [];
      if (calendarLines) summaryParts.push(calendarLines);
      if (summary) summaryParts.push(summary);
      return summaryParts.join('\n\n');
    },
  };
}
