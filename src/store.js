import { cleanProfile } from './profiles.js';
import { createCameoAvatar } from './cameo-avatar.js';
import { messageText } from './content.js';
import { cleanBackground } from './backgrounds.js';
import { contentImagePaths, imagePath } from './image-files.js';
import { readTodos, todoSourceMessageIds } from './todos.js';
import { findCountryInfo, fetchNagerHolidays } from './calendar-presets.js';
import { defaultGregorianCalendar } from './calendar-engine.js';
import { DEFAULT_PROMPT_PRESETS, normalizePromptPresets } from './preset-engine.js';

const emptyState = () => ({ schemaVersion: 1, contacts: [], groups: [], conversations: {}, forum: { posts: [] }, injectEnabled: false, injectCalendarEnabled: false, lockScreenEnabled: true, prompts: {} });
const fillDefaultAvatars = people => {
  let filled = people;
  for (let index = 0; index < people.length; index++) {
    const person = people[index];
    if (person.avatar || person.manualFields?.includes('avatar') || person.edited && !person.manualFields) continue;
    if (filled === people) filled = [...people];
    filled[index] = { ...person, avatar: createCameoAvatar() };
  }
  return filled;
};
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => text(value) === '未定' ? '' : text(value);
const todoPeople = (state, conversationId) => {
  const group = state.groups?.find(item => item.id === conversationId);
  if (group) return [...new Set([...(group.userIsMember ? ['@user'] : []), ...(group.memberIds || [])])];
  return state.contacts?.some(item => item.id === conversationId) ? ['@user', conversationId] : [];
};
const cleanTodoCandidates = (state, conversations = state.conversations) => {
  const todos = readTodos(state).filter(todo => {
    if (todo.status !== 'candidate') return true;
    const messages = conversations?.[todo.sourceConversationId] || [];
    const ids = new Set(messages.filter(message => !message.withdrawn).map(message => message.id));
    const sourceIds = todoSourceMessageIds(todo);
    return sourceIds.length > 0 && sourceIds.every(id => ids.has(id));
  });
  return todos.length === readTodos(state).length ? state : { ...state, todos };
};
const editableTodo = (state, todo, patch = {}) => {
  const next = { ...todo };
  if ('title' in patch) {
    next.title = text(patch.title);
    if (!next.title) throw new Error('待办事项不能为空。');
  }
  if ('startAt' in patch || 'startTime' in patch) next.startAt = time(patch.startAt ?? patch.startTime);
  if ('endAt' in patch || 'endTime' in patch) next.endAt = time(patch.endAt ?? patch.endTime);
  if ('participantIds' in patch) {
    const ids = [...new Set((Array.isArray(patch.participantIds) ? patch.participantIds : []).map(text).filter(Boolean))];
    const allowed = new Set(['@user', ...(state.contacts || []).map(person => person.id), ...(todo.participantIds || [])]);
    if (!ids.length || ids.some(id => !allowed.has(id))) throw new Error('相关人必须来自该会话或已有待办记录。');
    next.participantIds = ids;
  }
  return next;
};
const materializeTodoCandidates = (state, conversationId, messages, rows) => {
  const actual = Array.isArray(messages) ? messages : [];
  const actualIds = new Set(actual.filter(message => message?.role === 'assistant' && !message.withdrawn && message.type !== 'poke').map(message => message.id));
  const knownToIds = todoPeople(state, conversationId);
  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const suppliedIds = todoSourceMessageIds(row);
    const suppliedMessages = suppliedIds.map(id => actual.find(message => message?.id === id));
    if (!suppliedIds.length || suppliedIds.some(id => !actualIds.has(id)) || suppliedMessages.some(message => message?.role !== 'assistant')) return [];
    const sourceMessageIds = [...new Set(suppliedIds)];
    const title = text(row?.title ?? row?.name);
    const people = [...new Set((Array.isArray(row?.participantIds) ? row.participantIds : []).map(text).filter(Boolean))];
    if (!title || !sourceMessageIds.length || !people.length || people.some(id => !knownToIds.includes(id))) return [];
    const batch = actual.find(message => sourceMessageIds.includes(message?.id) && message?.batch)?.batch;
    return [{ id: text(row.id) || `todo:${globalThis.crypto.randomUUID()}`, status: 'candidate', title,
      startAt: time(row.startAt), endAt: time(row.endAt), participantIds: people,
      sourceConversationId: conversationId, sourceMessageIds, knownToIds: [...knownToIds],
      ...(batch ? { sourceBatch: structuredClone(batch) } : {}) }];
  });
};
const appendTodoCandidates = (state, conversationId, messages, rows) => {
  const candidates = materializeTodoCandidates(state, conversationId, messages, rows);
  if (!candidates.length) return state;
  const existing = new Set(readTodos(state).map(todo => todo.id));
  return { ...state, todos: [...readTodos(state), ...candidates.filter(todo => !existing.has(todo.id))] };
};

export function createPhoneStore({
  target,
  host = target?.host,
  globalSettingsProvider,
  saveGlobalSettings: saveGlobalSettingsProp,
  characterKey: characterKeyProp,
  assertEnabled = () => {},
  isReading = () => false,
  onIncomingMessage = () => {},
  initialState,
  removeImages = async () => {},
}) {
  const empty = initialState || emptyState();
  const getSettingsKey = () => host?.phoneSettingsKey || 'pocketPhone';
  const readGlobalExtensionSettings = () => {
    if (typeof globalSettingsProvider === 'function') return globalSettingsProvider();
    if (typeof host?.readSettings === 'function') return host.readSettings();
    if (typeof target?.host?.readSettings === 'function') return target.host.readSettings();
    return null;
  };
  const saveGlobalExtensionSettings = async () => {
    if (typeof saveGlobalSettingsProp === 'function') return await saveGlobalSettingsProp();
    if (typeof host?.saveSettings === 'function') return await host.saveSettings();
    if (typeof target?.host?.saveSettings === 'function') return await target.host.saveSettings();
  };
  const getPhoneSettings = () => {
    const ext = readGlobalExtensionSettings();
    if (!ext || typeof ext !== 'object') return null;
    const key = getSettingsKey();
    if (!ext[key] || typeof ext[key] !== 'object') {
      ext[key] = {};
    }
    return ext[key];
  };
  const getCharacterKey = () => {
    if (characterKeyProp) return characterKeyProp;
    if (target?.character?.avatar) return `character:${target.character.avatar}`;
    if (target?.character?.name) return `character:${target.character.name}`;
    if (target?.groupId) return `group:${target.groupId}`;
    if (target?.id) return `chat:${target.id}`;
    return 'default';
  };

  const read = () => {
    if (target.metadata?.pocketPhone === undefined) {
      return empty;
    }
    const raw = target.metadata.pocketPhone;
    const phoneSettings = getPhoneSettings();
    if (!phoneSettings) {
      if (raw?.promptPresets) {
        return { ...raw, promptPresets: normalizePromptPresets(raw.promptPresets) };
      }
      return raw;
    }

    const hasGlobalPrompts = Boolean(phoneSettings.prompts && Object.keys(phoneSettings.prompts).length > 0);
    const hasGlobalPresets = Array.isArray(phoneSettings.promptPresets) && phoneSettings.promptPresets.length > 0;
    const hasGlobalActivePreset = Boolean(phoneSettings.activePresetId);
    const hasGlobalCalendarPresets = Array.isArray(phoneSettings.calendarCustomPresets);
    const charKey = getCharacterKey();
    const boundCalendar = phoneSettings.characterCalendars?.[charKey];

    const needsCalendarBinding = (!raw.calendar || !raw.calendar.descriptor) && Boolean(boundCalendar?.descriptor);
    const needsMerge = hasGlobalPrompts || hasGlobalPresets || hasGlobalActivePreset || hasGlobalCalendarPresets || needsCalendarBinding || raw.promptPresets;

    if (!needsMerge) {
      return raw;
    }

    // 1. 提示词库 (prompts) - 全局有效
    const prompts = hasGlobalPrompts
      ? { ...(raw.prompts || {}), ...phoneSettings.prompts }
      : (raw.prompts || {});

    // 2. 提示词预设列表 (promptPresets) - 全局有效
    let promptPresets = hasGlobalPresets
      ? phoneSettings.promptPresets
      : (raw.promptPresets || DEFAULT_PROMPT_PRESETS);
    const normalizedPresets = normalizePromptPresets(promptPresets);

    // 3. 当前启用的预设编号 (activePresetId) - 全局有效
    let activePresetId = hasGlobalActivePreset
      ? phoneSettings.activePresetId
      : (raw.activePresetId || normalizedPresets[0]?.id || 'default_preset');

    // 4. 自定义日历预设 (calendar.customPresets) - 全局可切换生效
    let calendar = raw.calendar;
    const globalCustomPresets = hasGlobalCalendarPresets ? phoneSettings.calendarCustomPresets : [];

    // 5. 日历默认选择与角色绑定 (characterCalendars)
    if (!raw.calendar || !raw.calendar.descriptor) {
      if (boundCalendar?.descriptor) {
        calendar = {
          ...(raw.calendar || {}),
          descriptor: structuredClone(boundCalendar.descriptor),
          items: Array.isArray(boundCalendar.items) ? structuredClone(boundCalendar.items) : (raw.calendar?.items || []),
          customPresets: globalCustomPresets,
        };
      } else if (raw.calendar || globalCustomPresets.length > 0) {
        calendar = {
          ...(raw.calendar || { items: [] }),
          customPresets: globalCustomPresets,
        };
      }
    } else if (hasGlobalCalendarPresets) {
      calendar = {
        ...raw.calendar,
        customPresets: globalCustomPresets,
      };
    }

    return {
      ...raw,
      prompts,
      promptPresets: normalizedPresets,
      activePresetId,
      ...(calendar ? { calendar } : {}),
    };
  };
  // Serialize normal phone saves so sending while a reply arrives keeps both changes.
  let saving = Promise.resolve();
  function update(change, cleanImages = false) {
    const operation = saving.then(async () => {
      const previous = target.metadata.pocketPhone;
      const current = read(), next = change(current);
      if (next === current) return current;
      target.metadata.pocketPhone = next;
      try { await target.saveMetadata(); }
      catch (error) {
        if (previous === undefined) delete target.metadata.pocketPhone;
        else target.metadata.pocketPhone = previous;
        throw error;
      }

      const phoneSettings = getPhoneSettings();
      if (phoneSettings) {
        let globalChanged = false;

        // 1. 提示词库同步到全局设置
        if (next.prompts && next.prompts !== phoneSettings.prompts) {
          phoneSettings.prompts = structuredClone(next.prompts);
          globalChanged = true;
        }

        // 2. 提示词预设同步到全局设置
        if (next.promptPresets && next.promptPresets !== phoneSettings.promptPresets) {
          phoneSettings.promptPresets = structuredClone(next.promptPresets);
          globalChanged = true;
        }

        // 3. 激活预设编号同步到全局设置
        if (next.activePresetId && next.activePresetId !== phoneSettings.activePresetId) {
          phoneSettings.activePresetId = next.activePresetId;
          globalChanged = true;
        }

        // 4. 自定义日历预设同步到全局设置
        if (next.calendar?.customPresets && next.calendar.customPresets !== phoneSettings.calendarCustomPresets) {
          phoneSettings.calendarCustomPresets = structuredClone(next.calendar.customPresets);
          globalChanged = true;
        }

        // 5. 日历默认选择与角色绑定
        const charKey = getCharacterKey();
        if (next.calendar?.descriptor) {
          if (!phoneSettings.characterCalendars) phoneSettings.characterCalendars = {};
          const currentBound = phoneSettings.characterCalendars[charKey];
          if (!currentBound || JSON.stringify(currentBound.descriptor) !== JSON.stringify(next.calendar.descriptor)) {
            phoneSettings.characterCalendars[charKey] = {
              descriptor: structuredClone(next.calendar.descriptor),
              items: Array.isArray(next.calendar.items)
                ? structuredClone(next.calendar.items.filter(it => !it.todoId))
                : [],
            };
            globalChanged = true;
          }
        }

        if (globalChanged) {
          try { await saveGlobalExtensionSettings(); }
          catch { /* debounce save failure non-fatal to metadata */ }
        }
      }
      // 先保存真实删除，再删已无引用的文件；文件失败不能伪装成存档回滚成功。
      if (cleanImages) {
        const retained = contentImagePaths(next);
        const removed = [...contentImagePaths(current)].filter(path => !retained.has(path));
        if (removed.length) {
          try { await removeImages(removed); }
          catch { throw new Error('内容已保存，但旧图片及附带文件清理失败，请检查酒馆连接。'); }
        }
      }
      return read();
    });
    saving = operation.catch(() => {});
    return operation;
  }
  const store = {
    read,
    fillMissingAvatars() {
      return update(state => {
        assertEnabled();
        const contacts = fillDefaultAvatars(state.contacts), npcs = state.social?.npcs;
        const filledNpcs = npcs && fillDefaultAvatars(npcs);
        if (contacts === state.contacts && filledNpcs === npcs) return state;
        return { ...state, contacts, ...(filledNpcs !== npcs ? { social: { ...state.social, npcs: filledNpcs } } : {}) };
      });
    },
    updateSocial(change, { cleanImages = false, incomingMessages = [] } = {}) {
      const incomingContacts = new Set();
      return update(state => {
        assertEnabled();
        const social = state.social || { posts: [], npcs: [], feedIds: [] };
        const next = change(social, state);
        const conversations = { ...state.conversations };
        let messagesChanged = false;
        let nextState = { ...state, social: next };
        const validContacts = new Set((state.contacts || []).map(person => person.id));
        for (const entry of Array.isArray(incomingMessages) ? incomingMessages : []) {
          if (!validContacts.has(entry?.contactId) || !Array.isArray(entry.messages) || !entry.messages.length) continue;
          const existing = conversations[entry.contactId] || [];
          const savedMessages = entry.messages.map(message => message.role === 'assistant' ? { ...message, read: Boolean(isReading(entry.contactId)) } : message);
          conversations[entry.contactId] = [...existing, ...savedMessages];
          if (savedMessages.some(message => message.role === 'assistant')) incomingContacts.add(entry.contactId);
          nextState = appendTodoCandidates(nextState, entry.contactId, savedMessages, entry.todoCandidates);
          messagesChanged = true;
        }
        if (next === social && !messagesChanged) return state;
        return { ...nextState, ...(messagesChanged ? { conversations } : {}) };
      }, cleanImages).then(state => { for (const id of incomingContacts) onIncomingMessage(id); return state; });
    },
    appendMessage(id, message) { return store.appendMessages(id, [message]); },
    appendMessages(id, messages, { todoCandidates = [] } = {}) {
      return update(state => {
        assertEnabled();
        if (!state.contacts.some(person => person.id === id) && !state.groups?.some(group => group.id === id)) throw new Error('这个会话已删除，无法保存新消息。');
        const group = state.groups?.find(item => item.id === id);
        if (group && messages.some(message => message.role === 'assistant' && !group.memberIds.includes(message.speakerId))) throw new Error('群成员已经移出，无法保存这次回复，请重新点继续。');
        if (group && messages.some(message => message.type === 'transfer' && !(group.memberIds.includes(message.transfer.recipientId) || message.transfer.recipientId === '@user' && group.userIsMember))) throw new Error('收款人已不在群中，无法保存这条转账。');
        const savedMessages = messages.map(message => message.role === 'assistant' ? { ...message, read: Boolean(isReading(id)) } : message);
        return appendTodoCandidates({ ...state, conversations: { ...state.conversations, [id]: [...(state.conversations[id] || []), ...savedMessages] } }, id, savedMessages, todoCandidates);
      }).then(state => { if (messages.some(message => message.role === 'assistant')) onIncomingMessage(id); return state; });
    },
    markRead(id) {
      return update(state => {
        const messages = state.conversations[id] || [];
        if (!messages.some(message => message.role === 'assistant' && message.read === false)) return state;
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(message => message.role === 'assistant' && message.read === false ? { ...message, read: true } : message) } };
      });
    },
    updateImage(id, messageId, image) {
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [], current = messages.find(message => message.id === messageId);
        if (!current || current.type !== 'image') throw new Error('这条图片消息已删除，无法保存图片。');
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(message => message.id === messageId ? { ...message, image: { ...message.image, ...image } } : message) } };
      });
    },
    clearImagePaths(paths) {
      const missing = new Set(paths.map(imagePath).filter(Boolean));
      return update(state => {
        let changed = false;
        const clear = item => {
          if (!missing.has(imagePath(item.image?.path))) return item;
          changed = true;
          const { path, seed, ...image } = item.image;
          return { ...item, image };
        };
        const conversations = Object.fromEntries(Object.entries(state.conversations).map(([id, messages]) => [id, messages.map(clear)]));
        const social = state.social && { ...state.social, posts: state.social.posts.map(clear) };
        const forum = state.forum && { ...state.forum, posts: state.forum.posts.map(clear) };
        return changed ? { ...state, conversations, ...(social ? { social } : {}), ...(forum ? { forum } : {}) } : state;
      }, true);
    },
    respondTransfer(id, messageId, status, actorId, batch) {
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [], message = messages.find(item => item.id === messageId);
        if (!message || message.type !== 'transfer') throw new Error('这条转账已不存在。');
        if (message.batch?.key !== batch.key) throw new Error('过去的转账只能查看。');
        if (message.transfer.status !== 'pending') throw new Error('这条转账已经处理。');
        if (message.transfer.recipientId !== actorId || !['accepted', 'returned'].includes(status)) throw new Error('只有收款人可以收下或退回转账。');
        const group = state.groups?.find(item => item.id === id);
        if (group && actorId !== '@user' && !group.memberIds.includes(actorId)) throw new Error('收款人已不在群中，无法处理这条转账。');
        if (actorId === '@user' && group && !group.userIsMember) throw new Error('你不在这个群，无法处理转账。');
        const next = { ...message, transfer: { ...message.transfer, status, handledAt: new Date().toISOString() } };
        next.text = messageText(next);
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(item => item.id === messageId ? next : item) } };
      });
    },
    deleteMessage(id, messageId) {
      return update(state => cleanTodoCandidates({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.id !== messageId) } }), true);
    },
    deleteMessages(id, messageIds) {
      const targetIds = new Set((Array.isArray(messageIds) ? messageIds : []).map(String).filter(Boolean));
      if (!targetIds.size) return Promise.resolve(read());
      return update(state => cleanTodoCandidates({
        ...state,
        conversations: {
          ...state.conversations,
          [id]: (state.conversations[id] || []).filter(message => !targetIds.has(message.id)),
        },
      }), true);
    },
    editMessage(id, messageId, newText) {
      const content = String(newText ?? '').trim();
      if (!content) throw new Error('消息内容不能为空。');
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [];
        const current = messages.find(message => message.id === messageId);
        if (!current) throw new Error('这条消息已不存在。');
        if (current.withdrawn) throw new Error('已撤回的消息无法直接编辑。');
        if (current.type) throw new Error('卡片消息暂不支持文本编辑。');
        const next = { ...current, text: content, editedAt: new Date().toISOString() };
        return {
          ...state,
          conversations: {
            ...state.conversations,
            [id]: messages.map(message => message.id === messageId ? next : message),
          },
        };
      });
    },
    withdrawMessage(id, messageId) {
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [];
        const current = messages.find(message => message.id === messageId);
        if (!current) throw new Error('这条消息已不存在。');
        if (current.withdrawn) return state;
        const withdrawnText = !current.type ? String(current.text || '') : '';
        const next = {
          id: current.id,
          role: current.role,
          ...(current.speakerId ? { speakerId: current.speakerId } : {}),
          text: '[消息已撤回]',
          withdrawn: true,
          ...(withdrawnText ? { withdrawnText } : {}),
          withdrawnAt: new Date().toISOString(),
          createdAt: current.createdAt,
          timeLabel: current.timeLabel,
          ...(current.batch ? { batch: current.batch } : {}),
          ...(current.storyDate ? { storyDate: current.storyDate } : {}),
          ...(current.storyWeekday ? { storyWeekday: current.storyWeekday } : {}),
          ...(current.read !== undefined ? { read: current.read } : {}),
        };
        return cleanTodoCandidates({
          ...state,
          conversations: {
            ...state.conversations,
            [id]: messages.map(message => message.id === messageId ? next : message),
          },
        });
      }, true);
    },
    toggleFavoriteMessage(id, messageId) {
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [];
        const current = messages.find(message => message.id === messageId);
        if (!current) throw new Error('这条消息已不存在。');
        const next = { ...current, favorite: !current.favorite };
        if (!next.favorite) delete next.favorite;
        return {
          ...state,
          conversations: {
            ...state.conversations,
            [id]: messages.map(message => message.id === messageId ? next : message),
          },
        };
      });
    },
    favoriteMessages(id, messageIds, favorite = true) {
      const targetIds = new Set((Array.isArray(messageIds) ? messageIds : []).map(String).filter(Boolean));
      if (!targetIds.size) return Promise.resolve(read());
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [];
        return {
          ...state,
          conversations: {
            ...state.conversations,
            [id]: messages.map(message => {
              if (!targetIds.has(message.id)) return message;
              const next = { ...message, favorite: Boolean(favorite) };
              if (!next.favorite) delete next.favorite;
              return next;
            }),
          },
        };
      });
    },
    toggleMessageReaction(id, messageId, emoji) {
      const cleanEmoji = String(emoji || '').trim();
      if (!cleanEmoji) return Promise.resolve(read());
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [];
        const current = messages.find(message => message.id === messageId);
        if (!current || current.withdrawn) return state;
        const existing = Array.isArray(current.reactions) ? [...current.reactions] : [];
        const hasEmoji = existing.includes(cleanEmoji);
        const reactions = hasEmoji
          ? existing.filter(item => item !== cleanEmoji)
          : [...existing, cleanEmoji].slice(-6);
        const next = { ...current, reactions };
        if (!next.reactions.length) delete next.reactions;
        const recent = Array.isArray(state.recentReactions) ? state.recentReactions : [];
        const recentReactions = hasEmoji
          ? recent
          : [cleanEmoji, ...recent.filter(item => item !== cleanEmoji)].slice(0, 6);
        return {
          ...state,
          recentReactions,
          conversations: {
            ...state.conversations,
            [id]: messages.map(message => message.id === messageId ? next : message),
          },
        };
      });
    },
    addMessageReaction(id, messageId, emoji) {
      const cleanEmoji = String(emoji || '').trim();
      if (!cleanEmoji) return Promise.resolve(read());
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [];
        const current = messages.find(message => message.id === messageId);
        if (!current || current.withdrawn) return state;
        const existing = Array.isArray(current.reactions) ? [...current.reactions] : [];
        if (existing.includes(cleanEmoji)) return state;
        const reactions = [...existing, cleanEmoji].slice(-6);
        const next = { ...current, reactions };
        return {
          ...state,
          conversations: {
            ...state.conversations,
            [id]: messages.map(message => message.id === messageId ? next : message),
          },
        };
      });
    },
    forwardMessages(sourceId, messageIds, targetId, batch, note = '') {
      const targetIds = new Set((Array.isArray(messageIds) ? messageIds : []).map(String).filter(Boolean));
      if (!targetIds.size) throw new Error('请先选择要转发的消息。');
      return update(state => {
        assertEnabled();
        const isContact = state.contacts.some(person => person.id === targetId);
        const targetGroup = state.groups?.find(group => group.id === targetId);
        if (!isContact && !targetGroup) throw new Error('转发目标会话不存在。');
        if (targetGroup && !targetGroup.userIsMember) throw new Error('你不在这个群，不能转发消息。');
        const sourceMessages = (state.conversations[sourceId] || []).filter(msg => targetIds.has(msg.id) && !msg.withdrawn && msg.type !== 'poke');
        if (!sourceMessages.length) throw new Error('所选消息无法转发。');
        const sourceContact = state.contacts.find(person => person.id === sourceId);
        const sourceGroup = state.groups?.find(group => group.id === sourceId);
        const userName = state.userProfile?.name || '我';
        const chatName = sourceGroup ? sourceGroup.name : (sourceContact?.name || '');
        const resolveForwardedFrom = msg => {
          if (msg.forwarded && msg.forwardedFrom?.senderName) {
            return structuredClone(msg.forwardedFrom);
          }
          let senderName = userName;
          if (msg.role === 'assistant') {
            if (sourceGroup) {
              const member = state.contacts.find(person => person.id === msg.speakerId);
              senderName = member?.name || '群成员';
            } else {
              senderName = sourceContact?.name || '对方';
            }
          }
          return {
            senderName,
            ...(chatName ? { chatName } : {}),
            isGroup: Boolean(sourceGroup),
          };
        };
        const clock = batch?.clock || { time: new Date().toTimeString().slice(0, 5) };
        const baseMeta = () => ({
          id: globalThis.crypto.randomUUID(),
          role: 'user',
          createdAt: new Date().toISOString(),
          timeLabel: clock.time || '',
          ...(batch?.key ? { batch: { key: batch.key, label: batch.label } } : {}),
          ...(clock.source === 'story' ? { storyDate: clock.date, storyWeekday: clock.weekday } : {}),
          ...(targetGroup ? { speakerId: '@user' } : {}),
        });
        const forwardedList = sourceMessages.map(msg => {
          let payload = { text: messageText(msg), ...(msg.translation ? { translation: msg.translation } : {}) };
          if (msg.type === 'sticker') payload = { type: 'sticker', stickerId: msg.stickerId, text: messageText(msg) };
          else if (msg.type === 'location' && msg.location) payload = { type: 'location', location: structuredClone(msg.location), text: messageText(msg) };
          else if (msg.type === 'image' && msg.image) payload = { type: 'image', image: structuredClone(msg.image), text: messageText(msg) };
          return { ...baseMeta(), ...payload, forwarded: true, forwardedFrom: resolveForwardedFrom(msg) };
        });
        const cleanNote = String(note || '').trim();
        if (cleanNote) {
          forwardedList.push({ ...baseMeta(), text: cleanNote });
        }
        return {
          ...state,
          conversations: {
            ...state.conversations,
            [targetId]: [...(state.conversations[targetId] || []), ...forwardedList],
          },
        };
      });
    },
    updateMessageThought(id, messageId, thought) {
      const cleanThought = String(thought || '').trim();
      if (!cleanThought) throw new Error('没有生成有效的心声内容。');
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [];
        const current = messages.find(message => message.id === messageId);
        if (!current) throw new Error('这条消息已不存在。');
        return {
          ...state,
          conversations: {
            ...state.conversations,
            [id]: messages.map(message => message.id === messageId ? { ...message, thought: cleanThought } : message),
          },
        };
      });
    },
    clearConversation(id, anchor) {
      return update(state => cleanTodoCandidates({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.batch?.key !== anchor.key) } }), true);
    },
    async saveContact(id, draft) {
      const profile = { ...cleanProfile(draft, true), ...('background' in draft ? { background: cleanBackground(draft.background, true) } : {}) };
      const contactId = id || `manual:${globalThis.crypto.randomUUID()}`;
      await update(state => {
        const current = state.contacts.find(item => item.id === contactId);
        if (id && !current) throw new Error('这个联系人已不存在，请返回短信重新选择。');
        // 旧版只记整条edited，无法还原实际改过的字段，保留其已有保护。
        const manualFields = new Set(current?.manualFields || (current?.edited ? ['name', 'nickname', 'avatar', 'expression', 'language'] : []));
        for (const [key, value] of Object.entries(profile)) if (value !== (current?.[key] || '')) manualFields.add(key);
        const contact = { ...current, ...profile, id: contactId, edited: true, manualFields: [...manualFields], source: current?.source || { kind: 'manual' } };
        if (!current && !contact.avatar) contact.avatar = createCameoAvatar();
        return { ...state, contacts: current ? state.contacts.map(item => item.id === contactId ? contact : item) : [...state.contacts, contact] };
      });
      return read().contacts.find(item => item.id === contactId);
    },
    async saveUserProfile(draft) {
      const profile = cleanProfile(draft);
      return update(state => ({ ...state, userProfile: profile }));
    },
    deleteContact(id) {
      return update(state => {
        const conversations = { ...state.conversations };
        delete conversations[id];
        const groups = (state.groups || []).map(group => {
          if (conversations[group.id]?.some(message => message.speakerId === id)) conversations[group.id] = conversations[group.id].filter(message => message.speakerId !== id);
          return group.memberIds.includes(id) ? { ...group, memberIds: group.memberIds.filter(key => key !== id) } : group;
        });
        const social = state.social && { ...state.social,
          posts: state.social.posts.filter(post => post.authorId !== id).map(post => ({ ...post, comments: (post.comments || []).filter(comment => comment.authorId !== id) })),
          feedIds: state.social.feedIds.filter(key => !state.social.posts.some(post => post.id === key && post.authorId === id)),
          ...(state.social.expandedAuthors ? { expandedAuthors: state.social.expandedAuthors.filter(key => key !== id) } : {}),
        };
        return cleanTodoCandidates({ ...state, contacts: state.contacts.filter(person => person.id !== id), groups, conversations, ...(social ? { social } : {}) }, conversations);
      }, true);
    },
    deleteGroup(id) {
      return update(state => {
        const conversations = { ...state.conversations };
        delete conversations[id];
        return cleanTodoCandidates({ ...state, groups: (state.groups || []).filter(group => group.id !== id), conversations }, conversations);
      }, true);
    },
    async mergeDirectory({ contacts, groups }) {
      const added = { contacts: [], groups: [] };
      await update(state => {
        assertEnabled();
        const people = new Map(state.contacts.map(person => [person.id, person]));
        for (const person of contacts) if (!people.has(person.id)) {
          const contact = person.avatar ? person : { ...person, avatar: createCameoAvatar() };
          people.set(contact.id, contact); added.contacts.push(contact);
        }
        const mergedGroups = [...(state.groups || [])];
        for (const draft of groups) {
          const ids = Array.isArray(draft?.memberIds) ? [...new Set(draft.memberIds)] : [];
          const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
          if (!name || typeof draft.userIsMember !== 'boolean' || !ids.length || ids.length + Number(draft.userIsMember) < 2 || ids.some(id => !people.has(id))) continue;
          if (mergedGroups.some(group => group.userIsMember === draft.userIsMember && group.memberIds.length === ids.length && ids.every(id => group.memberIds.includes(id)))) continue;
          const group = { id: `group:${globalThis.crypto.randomUUID()}`, name, memberIds: ids, userIsMember: draft.userIsMember };
          mergedGroups.push(group); added.groups.push(group);
        }
        return added.contacts.length || added.groups.length ? { ...state, contacts: [...people.values()], groups: mergedGroups } : state;
      });
      return added;
    },
    async saveGroup(id, draft) {
      const name = String(draft.name || '').trim();
      if (!name) throw new Error('请填写群名。');
      const { avatar } = cleanProfile({ ...draft, name });
      const appearance = 'background' in draft ? { background: cleanBackground(draft.background, true) } : {};
      const memberIds = [...new Set(draft.memberIds || [])];
      const userIsMember = draft.userIsMember !== false;
      if (!memberIds.length || memberIds.length + Number(userIsMember) < 2) throw new Error('请至少选择两位群成员，可以包含自己。');
      const groupId = id || `group:${globalThis.crypto.randomUUID()}`;
      await update(state => {
        if (memberIds.some(key => !state.contacts.some(person => person.id === key))) throw new Error('有群成员不在联系人中，请重新选择。');
        const groups = state.groups || [], current = groups.find(group => group.id === id);
        if (id && !current) throw new Error('这个群聊已不存在，请返回短信重新选择。');
        const group = { ...current, id: groupId, name, avatar, ...appearance, memberIds, userIsMember };
        return { ...state, groups: current ? groups.map(item => item.id === id ? group : item) : [...groups, group] };
      });
      return read().groups.find(group => group.id === groupId);
    },
    setTheme(theme) { return update(state => ({ ...state, theme: theme === 'night' ? 'night' : 'day' })); },
    setLockStyle(lockStyle) { return update(state => ({ ...state, lockStyle: ['stacked', 'rounded'].includes(lockStyle) ? lockStyle : 'classic' })); },
    setLockScreenEnabled(enabled) { return update(state => ({ ...state, lockScreenEnabled: enabled === true })); },
    setRememberLastView(enabled) { return update(state => ({ ...state, rememberLastView: enabled === true })); },
    saveCalendarEvent(event) {
      const name = String(event?.name || '').trim();
      if (!name) throw new Error('事件名称不能为空。');
      const month = Number(event?.month);
      const day = Number(event?.day);
      const desc = read().calendar?.descriptor;
      const maxMonths = desc?.months?.length || 12;
      const maxDays = desc?.months?.[month - 1]?.days || 31;
      if (!Number.isInteger(month) || month < 1 || month > maxMonths) throw new Error(`月份必须在1到${maxMonths}之间。`);
      if (!Number.isInteger(day) || day < 1 || day > maxDays) throw new Error(`日期必须在1到${maxDays}之间。`);
      const days = Math.max(1, Number(event?.days) || 1);
      const type = event?.type === 'festival'
        ? 'festival'
        : (event?.type === 'todo' || event?.type === 'schedule')
          ? 'todo'
          : 'anniversary';
      const note = String(event?.note || '').trim();
      const id = String(event?.id || `event:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`);
      const done = type === 'todo' ? Boolean(event?.done) : undefined;
      return update(state => {
        const calendar = state.calendar || { items: [] };
        const items = Array.isArray(calendar.items) ? calendar.items : [];
        const index = items.findIndex(item => item.id === id);
        const nextItem = { id, name, type, month, day, days, note, ...(done !== undefined ? { done } : {}) };
        const nextItems = index >= 0
          ? items.map((it, idx) => idx === index ? nextItem : it)
          : [...items, nextItem];
        return { ...state, calendar: { ...calendar, items: nextItems } };
      });
    },
    toggleCalendarEventDone(id) {
      const key = String(id || '');
      return update(state => {
        assertEnabled();
        let nextState = state;
        const todos = readTodos(state);
        const todoTarget = todos.find(todo => todo.id === key);
        if (todoTarget && todoTarget.status !== 'candidate') {
          const nextStatus = todoTarget.status === 'done' ? 'open' : 'done';
          nextState = {
            ...nextState,
            todos: todos.map(todo => todo.id === key ? { ...todo, status: nextStatus } : todo),
          };
        }
        const calendar = nextState.calendar;
        if (calendar && Array.isArray(calendar.items) && calendar.items.some(item => item.id === key)) {
          nextState = {
            ...nextState,
            calendar: {
              ...calendar,
              items: calendar.items.map(item => item.id === key ? { ...item, done: !item.done } : item),
            },
          };
        }
        return nextState;
      });
    },
    deleteCalendarEvent(id) {
      const key = String(id || '');
      if (key.startsWith('builtin:')) throw new Error('内置节日不可删除。');
      return update(state => {
        let nextState = state;
        if (readTodos(state).some(todo => todo.id === key)) {
          nextState = { ...nextState, todos: readTodos(state).filter(todo => todo.id !== key) };
        }
        if (nextState.calendar || Array.isArray(nextState.calendar?.items)) {
          const calendar = nextState.calendar || { items: [] };
          const items = (Array.isArray(calendar.items) ? calendar.items : []).filter(item => item.id !== key);
          nextState = { ...nextState, calendar: { ...calendar, items } };
        }
        return nextState;
      });
    },
    setCalendarDescriptor(descriptor) {
      return update(state => {
        const calendar = state.calendar || { items: [] };
        return {
          ...state,
          calendar: {
            ...calendar,
            descriptor: { ...(calendar.descriptor || {}), ...descriptor },
          },
        };
      });
    },
    async applyCalendarPreset({ countryId, keepCustom = true }) {
      const code = String(countryId || 'CN').toUpperCase();
      const info = findCountryInfo(code);
      const holidays = await fetchNagerHolidays(code);
      return update(state => {
        const calendar = state.calendar || { items: [] };
        const currentItems = Array.isArray(calendar.items) ? calendar.items : [];
        const customItems = keepCustom
          ? currentItems.filter(item => !item.id?.startsWith('preset:') && !item.id?.startsWith('builtin:') && !item.id?.startsWith('nager:'))
          : [];
        const presetItems = (holidays || []).map(item => ({
          ...item,
          id: item.id?.startsWith('nager:') ? item.id : `preset:${item.id}`,
        }));
        return {
          ...state,
          calendar: {
            ...calendar,
            descriptor: {
              ...(calendar.descriptor || {}),
              kind: info.kind || (info.months ? 'custom' : 'gregorian'),
              title: info.name,
              era: info.era || '',
              weekdays: info.weekdays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              months: info.months || defaultGregorianCalendar().months,
              disableBuiltinFestivals: true,
              country: info.code,
            },
            items: [...presetItems, ...customItems],
          },
        };
      });
    },
    saveCustomCalendarPreset({ id, name, descriptor, items } = {}) {
      const presetName = String(name || '').trim();
      if (!presetName) throw new Error('请填写预设名称。');
      const presetId = id || `custom_preset:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`;
      return update(state => {
        const calendar = state.calendar || { items: [] };
        const desc = descriptor || calendar.descriptor || defaultGregorianCalendar();
        const evs = Array.isArray(items) ? items : (calendar.items || []);
        const customPresets = Array.isArray(calendar.customPresets) ? calendar.customPresets : [];
        const newPreset = {
          id: presetId,
          name: presetName,
          descriptor: { ...desc, kind: 'custom', country: presetId, title: desc.title || presetName },
          items: evs.map(it => ({ ...it })),
        };
        const index = customPresets.findIndex(p => p.id === presetId);
        const nextPresets = index >= 0
          ? customPresets.map((p, i) => i === index ? newPreset : p)
          : [...customPresets, newPreset];
        return {
          ...state,
          calendar: {
            ...calendar,
            customPresets: nextPresets,
          },
        };
      });
    },
    deleteCustomCalendarPreset(id) {
      const key = String(id || '');
      return update(state => {
        const calendar = state.calendar || { items: [] };
        const customPresets = (Array.isArray(calendar.customPresets) ? calendar.customPresets : []).filter(p => p.id !== key);
        return {
          ...state,
          calendar: {
            ...calendar,
            customPresets,
          },
        };
      });
    },
    applyCustomCalendarPreset(id, { keepCustom = false } = {}) {
      const key = String(id || '');
      return update(state => {
        const calendar = state.calendar || { items: [] };
        const customPresets = Array.isArray(calendar.customPresets) ? calendar.customPresets : [];
        const preset = customPresets.find(p => p.id === key);
        if (!preset) throw new Error('未找到该自定义历法预设。');
        const currentItems = Array.isArray(calendar.items) ? calendar.items : [];
        const userItems = keepCustom
          ? currentItems.filter(item => !item.id?.startsWith('preset:') && !item.id?.startsWith('builtin:') && !item.id?.startsWith('nager:'))
          : [];
        const presetItems = (preset.items || []).map(item => ({ ...item }));
        return {
          ...state,
          calendar: {
            ...calendar,
            descriptor: {
              ...(preset.descriptor || {}),
              kind: 'custom',
              country: preset.id,
              title: preset.descriptor?.title || preset.name,
              disableBuiltinFestivals: true,
            },
            items: keepCustom ? [...presetItems, ...userItems] : presetItems,
          },
        };
      });
    },
    createCustomCalendar({ title, era, currentYear, months, weekdayCycle, weekdays, presetName = '' } = {}) {
      const name = String(title || '自定义历法').trim() || '自定义历法';
      const cleanMonths = Array.isArray(months) && months.length
        ? months.map((m, i) => ({
            name: String(m.name || `${i + 1}月`).trim() || `${i + 1}月`,
            days: Math.max(1, Number(m.days) || 30),
          }))
        : [{ name: '1月', days: 30 }];
      const cycle = Math.max(1, Math.min(14, Number(weekdayCycle) || 7));
      const cleanWeekdays = Array.isArray(weekdays) && weekdays.length === cycle
        ? weekdays
        : cycle === 7 ? ['一', '二', '三', '四', '五', '六', '日'] : Array.from({ length: cycle }, (_, i) => String(i + 1));
      const descriptor = {
        kind: 'custom',
        id: `custom:${Date.now().toString(36)}`,
        title: name,
        era: String(era || '').trim(),
        currentYear: Number(currentYear) || 1,
        months: cleanMonths,
        weekdayCycle: cycle,
        weekdays: cleanWeekdays,
        disableBuiltinFestivals: true,
      };
      return update(state => {
        const calendar = state.calendar || { items: [] };
        let customPresets = Array.isArray(calendar.customPresets) ? calendar.customPresets : [];
        if (presetName && String(presetName).trim()) {
          const pName = String(presetName).trim();
          const pId = `custom_preset:${Date.now().toString(36)}`;
          customPresets = [...customPresets, {
            id: pId,
            name: pName,
            descriptor: { ...descriptor, country: pId },
            items: (calendar.items || []).map(it => ({ ...it })),
          }];
          descriptor.country = pId;
        }
        return {
          ...state,
          calendar: {
            ...calendar,
            descriptor,
            customPresets,
          },
        };
      });
    },
    saveCalendarEvents(events) {
      if (!Array.isArray(events) || !events.length) return update(s => s);
      return update(state => {
        const calendar = state.calendar || { items: [] };
        const items = Array.isArray(calendar.items) ? calendar.items : [];
        const desc = state.calendar?.descriptor;
        const maxMonths = desc?.months?.length || 12;
        const newItems = events.map(event => {
          const name = String(event?.name || event?.title || '').trim();
          if (!name) return null;
          const month = Math.min(maxMonths, Math.max(1, Number(event?.month) || 1));
          const maxDays = desc?.months?.[month - 1]?.days || 31;
          const day = Math.min(maxDays, Math.max(1, Number(event?.day) || 1));
          const days = Math.max(1, Number(event?.days) || 1);
          const type = event?.type === 'festival'
            ? 'festival'
            : (event?.type === 'todo' || event?.type === 'schedule')
              ? 'todo'
              : 'anniversary';
          const note = String(event?.note || '').trim();
          const id = String(event?.id || `event:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`);
          const done = type === 'todo' ? Boolean(event?.done) : undefined;
          return { id, name, type, month, day, days, note, ...(done !== undefined ? { done } : {}) };
        }).filter(Boolean);
        return {
          ...state,
          calendar: {
            ...calendar,
            items: [...items, ...newItems],
          },
        };
      });
    },
    saveTodosFromSchedule(scheduleItems) {
      if (!Array.isArray(scheduleItems) || !scheduleItems.length) return update(s => s);
      const newTodos = scheduleItems.map(it => ({
        id: `todo:${globalThis.crypto.randomUUID()}`,
        status: 'open',
        title: String(it.title || it.name || '').trim(),
        month: Math.max(1, Number(it.month) || 1),
        day: Math.max(1, Number(it.day) || 1),
        startAt: it.time ? `${it.month}月${it.day}日 ${it.time}` : `${it.month}月${it.day}日`,
        endAt: '',
        participantIds: [],
        sourceConversationId: '',
        sourceMessageIds: [],
      })).filter(t => t.title);
      return update(state => {
        const calendar = state.calendar || { items: [] };
        const items = Array.isArray(calendar.items) ? calendar.items : [];
        const calEvents = scheduleItems.map((it, idx) => {
          const name = String(it.title || it.name || '').trim();
          if (!name) return null;
          return {
            id: newTodos[idx]?.id || `event:${Date.now().toString(36)}:${idx}`,
            name,
            type: 'todo',
            month: Math.max(1, Number(it.month) || 1),
            day: Math.max(1, Number(it.day) || 1),
            days: Math.max(1, Number(it.days) || 1),
            note: [it.time, it.location, it.note].filter(Boolean).join(' · '),
            done: false,
          };
        }).filter(Boolean);
        return {
          ...state,
          todos: [...readTodos(state), ...newTodos],
          calendar: {
            ...calendar,
            items: [...items, ...calEvents],
          },
        };
      });
    },
    setWallpaper(theme, path) { const value = cleanBackground(path); return update(state => ({ ...state, wallpapers: { ...state.wallpapers, [theme === 'night' ? 'night' : 'day']: value } })); },
    setChatBackground(id, value) {
      const background = cleanBackground(value, true);
      return update(state => {
        const key = state.contacts.some(person => person.id === id) ? 'contacts' : 'groups';
        if (!state[key]?.some(person => person.id === id)) throw new Error('这个聊天已删除，无法更改背景。');
        return { ...state, [key]: state[key].map(person => person.id === id ? { ...person, background } : person) };
      });
    },
    replaceForum(posts) { return update(state => { assertEnabled(); return { ...state, forum: { posts } }; }, true); },
    upsertContacts(items) {
      return update(state => {
        const contacts = new Map(state.contacts.map(item => [item.id, item]));
        // 人工修订按字段优先；改名字或头像不阻止未修改的线上方式更新。
        for (const item of items) {
          const current = contacts.get(item.id);
          if (current?.edited && !Array.isArray(current.manualFields)) continue;
          const merged = { ...current, ...item };
          if (!current && !merged.avatar) merged.avatar = createCameoAvatar();
          for (const field of current?.manualFields || []) merged[field] = current[field];
          contacts.set(item.id, merged);
        }
        return { ...state, contacts: [...contacts.values()] };
      });
    },
    setInjectionEnabled(enabled) { return update(state => ({ ...state, injectEnabled: Boolean(enabled) })); },
    setInjectCalendarEnabled(enabled) { return update(state => ({ ...state, injectCalendarEnabled: Boolean(enabled) })); },
    confirmTodo(id, patch = {}) {
      return update(state => {
        assertEnabled();
        const current = readTodos(state).find(todo => todo.id === id);
        if (!current) throw new Error('这个待办已不存在，请返回待办列表。');
        if (current.status !== 'candidate') return state;
        const next = { ...editableTodo(state, current, patch), status: 'open' };
        return { ...state, todos: readTodos(state).map(todo => todo.id === id ? next : todo) };
      });
    },
    saveTodo(id, patch = {}) {
      return update(state => {
        assertEnabled();
        const current = readTodos(state).find(todo => todo.id === id);
        if (!current) throw new Error('这个待办已不存在，请返回待办列表。');
        const next = editableTodo(state, current, patch);
        return next === current ? state : { ...state, todos: readTodos(state).map(todo => todo.id === id ? next : todo) };
      });
    },
    setTodoDone(id, done) {
      return update(state => {
        assertEnabled();
        const current = readTodos(state).find(todo => todo.id === id);
        if (!current) throw new Error('这个待办已不存在，请返回待办列表。');
        if (current.status === 'candidate') throw new Error('候选待办需要先加入待办。');
        const status = done === true ? 'done' : 'open';
        if (current.status === status) return state;
        return { ...state, todos: readTodos(state).map(todo => todo.id === id ? { ...todo, status } : todo) };
      });
    },
    deleteTodo(id) {
      return update(state => {
        assertEnabled();
        if (!readTodos(state).some(todo => todo.id === id)) throw new Error('这个待办已不存在，请返回待办列表。');
        return { ...state, todos: readTodos(state).filter(todo => todo.id !== id) };
      });
    },
    savePrompt(id, text) {
      const key = String(id || '').trim();
      if (!key) throw new Error('提示词编号不能为空。');
      const content = String(text ?? '').trim();
      return update(state => {
        const prompts = { ...(state.prompts || {}) };
        if (content) {
          prompts[key] = content;
        } else {
          delete prompts[key];
        }
        return { ...state, prompts };
      });
    },
    resetPrompt(id) {
      const key = String(id || '').trim();
      return update(state => {
        const prompts = { ...(state.prompts || {}) };
        delete prompts[key];
        return { ...state, prompts };
      });
    },
    resetAllPrompts() {
      return update(state => ({ ...state, prompts: {} }));
    },
    setActivePromptPreset(presetId) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const exists = presets.some(p => p.id === presetId);
        return exists ? { ...state, promptPresets: presets, activePresetId: presetId } : state;
      });
    },
    resetPromptPreset(presetId) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const idx = presets.findIndex(p => p.id === presetId);
        if (idx >= 0 && (presets[idx].isBuiltin || presets[idx].id === 'default_preset')) {
          presets[idx] = structuredClone(DEFAULT_PROMPT_PRESETS[0]);
        }
        return { ...state, promptPresets: presets };
      });
    },
    savePromptPreset(preset) {
      if (!preset || !preset.id) throw new Error('预设格式无效');
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const idx = presets.findIndex(p => p.id === preset.id);
        if (idx >= 0) {
          presets[idx] = { ...preset, isBuiltin: presets[idx].isBuiltin };
        } else {
          presets.push(preset);
        }
        return { ...state, promptPresets: presets, activePresetId: preset.id };
      });
    },
    createPromptPreset({ name = '新预设', copyFromId = null, storyLayers = 3 }) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const source = (copyFromId && presets.find(p => p.id === copyFromId)) || presets[0] || DEFAULT_PROMPT_PRESETS[0];
        const newId = `preset_${Date.now().toString(36)}`;
        const newPreset = {
          id: newId,
          name: name.trim() || '未命名预设',
          isBuiltin: false,
          storyLayers: Number(storyLayers) || source.storyLayers || 3,
          entries: (source.entries || []).map((e, i) => ({
            ...e,
            id: `entry_${Date.now().toString(36)}_${i}`,
          })),
        };
        presets.push(newPreset);
        return { ...state, promptPresets: presets, activePresetId: newId };
      });
    },
    deletePromptPreset(presetId) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets)).filter(p => p.id !== presetId);
        if (!presets.length) return state; // 不允许全部删除
        const activePresetId = state.activePresetId === presetId ? presets[0].id : state.activePresetId;
        return { ...state, promptPresets: presets, activePresetId };
      });
    },
    updatePresetStoryLayers(presetId, layers) {
      const num = Math.max(1, Math.min(30, Number(layers) || 1));
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const target = presets.find(p => p.id === presetId);
        if (target) target.storyLayers = num;
        return { ...state, promptPresets: presets };
      });
    },
    togglePresetEntry(presetId, entryId, forceEnabled = undefined) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const target = presets.find(p => p.id === presetId);
        if (target && Array.isArray(target.entries)) {
          const entry = target.entries.find(e => e.id === entryId);
          if (entry) {
            entry.enabled = forceEnabled !== undefined ? Boolean(forceEnabled) : !entry.enabled;
          }
        }
        return { ...state, promptPresets: presets };
      });
    },
    movePresetEntry(presetId, entryId, direction) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const target = presets.find(p => p.id === presetId);
        if (target && Array.isArray(target.entries)) {
          const idx = target.entries.findIndex(e => e.id === entryId);
          if (idx >= 0) {
            const newIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (newIdx >= 0 && newIdx < target.entries.length) {
              const [moved] = target.entries.splice(idx, 1);
              target.entries.splice(newIdx, 0, moved);
            }
          }
        }
        return { ...state, promptPresets: presets };
      });
    },
    deletePresetEntry(presetId, entryId) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const target = presets.find(p => p.id === presetId);
        if (target && Array.isArray(target.entries)) {
          target.entries = target.entries.filter(e => e.id !== entryId);
          if (target.isBuiltin || target.id === 'default_preset') {
            target.deletedEntryIds = [...new Set([...(target.deletedEntryIds || []), entryId])];
          }
        }
        return { ...state, promptPresets: presets };
      });
    },
    addPresetEntry(presetId, { name = '新条目', role = 'system', content = '', scope = '通用' } = {}) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const target = presets.find(p => p.id === presetId);
        if (target) {
          if (!Array.isArray(target.entries)) target.entries = [];
          target.entries.push({
            id: `entry_${Date.now().toString(36)}_${target.entries.length}`,
            name: name.trim() || '新条目',
            scope: scope.trim() || '通用',
            role: ['system', 'user', 'assistant'].includes(role) ? role : 'system',
            enabled: true,
            content: content || '',
          });
        }
        return { ...state, promptPresets: presets };
      });
    },
    updatePresetEntry(presetId, entryId, patch = {}) {
      return update(state => {
        const presets = structuredClone(normalizePromptPresets(state.promptPresets));
        const target = presets.find(p => p.id === presetId);
        if (target && Array.isArray(target.entries)) {
          const entry = target.entries.find(e => e.id === entryId);
          if (entry) {
            if (patch.name !== undefined) entry.name = String(patch.name).trim();
            if (patch.scope !== undefined) entry.scope = String(patch.scope).trim() || '通用';
            if (patch.role !== undefined) entry.role = patch.role;
            if (patch.content !== undefined) entry.content = String(patch.content);
            if (patch.enabled !== undefined) entry.enabled = Boolean(patch.enabled);
          }
        }
        return { ...state, promptPresets: presets };
      });
    },
  };
  return store;
}
