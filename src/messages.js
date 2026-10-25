import { parsePayload, parseJsonObject } from './api.js';
import { getPrompt, CONTACTS_PROMPT, MESSAGES_PROMPT, TODO_SUGGESTIONS_PROMPT, THOUGHT_PROMPT } from './prompts.js';
import { readTimeline } from './timeline.js';
import { normalizeContent, messageText, RICH_MESSAGES_PROMPT } from './content.js';
import { CALENDAR_PROMPT } from './calendar.js';
import { parseTodoCandidates } from './todos.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';
import { replyToMessage } from './replies.js';

export function record(role, text, clock, translation, batch) {
  const now = new Date();
  // createdAt 记录消息创建时间，供通知排序；可见时间和剧情日期在创建时确定，之后不追改历史短信。
  return { id: globalThis.crypto.randomUUID(), role, text, createdAt: now.toISOString(), timeLabel: clock.time,
    ...(translation ? { translation } : {}),
    ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),
    ...(clock.source === 'story' ? { storyDate: clock.date, storyWeekday: clock.weekday } : {}),
  };
}

export function createMessageService({ target, store, contextReader, modelClient }) {
  return {
    async sendCard(id, draft, { replyToId } = {}) {
      const content = normalizeContent(draft);
      if (!content?.type) throw new Error('消息卡内容不完整，请检查后发送。');
      const state = store.read();
      if (!state.contacts.some(person => person.id === id)) throw new Error('请先选择一位联系人。');
      if (content.type === 'transfer') content.transfer.recipientId = id;
      const batch = readTimeline(target.messages);
      const thread = state.conversations[id] || [];
      await store.appendMessage(id, { ...record('user', content.text, batch.clock, '', batch), ...content, ...replyToMessage(thread, replyToId) });
    },
    async refineOnlineStyle(id) {
      const contact = store.read().contacts.find(person => person.id === id);
      if (!contact) throw new Error('这个联系人已不存在，请返回短信重新选择。');
      const state = store.read();
      const activePreset = getActivePreset(state);

      let sources = {};
      if (contextReader?.readDirectorySources) {
        try {
          sources = await contextReader.readDirectorySources({ readMemory: true }) || {};
        } catch {}
      }
      const storyHistoryText = (sources.story || []).map(item => `${item.speaker || '角色'}：${item.text}`).join('\n\n');
      const payload = sanitizePhoneContext({ people: [{ sourceId: contact.id, name: contact.name, personality: contact.personality || '', expression: contact.expression || '', language: contact.language || '' }] });
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: sources.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: sources.storyMemory || '',
        phoneContext: payload,
        charPersonality: `${contact.name}：${contact.personality || ''}\n线上风格：${contact.expression || ''}`,
      }, 'contacts', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: '联系人风格提炼',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(payload) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const result = parsePayload(reply, 'contacts').find(person => person.sourceId === id);
      if (!result?.expression) throw new Error('没有生成这位联系人的线上聊天方式，请重新提炼。');
      return result.expression;
    },
    async send(id, text, { replyToId } = {}) {
      const content = String(text || '').trim();
      if (!content) return;
      const state = store.read();
      if (!state.contacts.some(x => x.id === id)) throw new Error('请先选择一位联系人。');
      const batch = readTimeline(target.messages);
      const thread = state.conversations[id] || [];
      await store.appendMessage(id, { ...record('user', content, batch.clock, '', batch), ...replyToMessage(thread, replyToId) });
    },
    async generateThought(id, messageId, speakerId = '') {
      const state = store.read();
      const thread = state.conversations[id] || [];
      const targetMsg = thread.find(item => item.id === messageId);
      if (!targetMsg || targetMsg.role !== 'assistant') throw new Error('只能查看对方发出的消息心声。');
      const isGroup = state.groups?.some(group => group.id === id);
      const resolvedSpeakerId = speakerId || targetMsg.speakerId || id;
      const contact = state.contacts.find(person => person.id === resolvedSpeakerId);
      if (!contact) throw new Error('未找到对应的角色资料。');

      const context = isGroup
        ? await contextReader.readForGroup(id)
        : await contextReader.readForContact(id);
      const msgIndex = thread.findIndex(item => item.id === messageId);
      const sliceStart = Math.max(0, msgIndex - 7);
      const recentMessages = thread.slice(sliceStart, msgIndex + 1).map(item => ({
        role: item.role,
        ...(item.speakerId ? { speakerId: item.speakerId } : {}),
        text: messageText(item),
      }));

      const systemPrompt = getPrompt('thought', state) || THOUGHT_PROMPT;
      const userPayload = {
        character: {
          id: contact.id,
          name: contact.name,
          nickname: contact.nickname || '',
          personality: contact.personality || '',
          expression: contact.expression || '',
        },
        clock: context.clock,
        story: (context.story || []).slice(-4),
        recentMessages,
        targetMessage: {
          text: messageText(targetMsg),
          ...(targetMsg.withdrawn && targetMsg.withdrawnText ? { withdrawn: true, withdrawnText: targetMsg.withdrawnText } : {}),
          ...(targetMsg.translation ? { translation: targetMsg.translation } : {}),
          timeLabel: targetMsg.timeLabel || '',
        },
      };

      const reply = await modelClient.complete({
        label: '角色隐秘心声生成',
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
      });
      const parsed = parseJsonObject(reply);
      const thought = String(parsed?.thought ?? parsed?.innerThought ?? parsed?.text ?? '').trim();
      if (!thought) throw new Error('未能解析出有效的心声内容，请重试。');
      await store.updateMessageThought(id, messageId, thought);
      return thought;
    },
    async continueChat(id) {
      const context = await contextReader.readForContact(id);
      const clock = context.clock;
      const state = store.read();
      const activePreset = getActivePreset(state);

      const storyHistoryText = (context.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
      const phoneContextData = sanitizePhoneContext(context);
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: context.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: context.storyMemory || '',
        calendar: context.calendar,
        phoneContext: phoneContextData,
        charPersonality: `${context.contact?.name || ''}：${context.contact?.personality || ''}\n线上风格：${context.contact?.expression || ''}`,
      }, 'chat', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: '私聊短信生成',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : messagesPayload,
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const answer = parseJsonObject(reply);
      const actions = Array.isArray(answer.transferActions) ? answer.transferActions : [];
      const rawMsgActions = [
        ...(Array.isArray(answer.messageActions) ? answer.messageActions : []),
        ...(Array.isArray(answer.reactionActions) ? answer.reactionActions.map(item => ({ ...item, action: 'react' })) : []),
      ];
      const existingThread = store.read().conversations[id] || [];
      const existingIds = new Set(existingThread.map(item => item.id));
      const resolveReplyId = rawId => {
        if (!rawId) return '';
        if (existingIds.has(rawId)) return rawId;
        const byText = [...existingThread].reverse().find(m => m.text === rawId || messageText(m) === rawId);
        return byText ? byText.id : '';
      };
      const indexedMessages = parsePayload(reply, 'messages', { allowEmpty: actions.length > 0 || rawMsgActions.length > 0, indexed: true }).map(content => {
        if (!content) return null;
        if (content.type === 'transfer') content.transfer.recipientId = '@user';
        if (content.type === 'poke') {
          content.poke.actorId = id;
          if (!content.poke.actorName || content.poke.actorName === '对方') {
            content.poke.actorName = context.contact?.name || '对方';
          }
          content.text = messageText(content);
        }
        if (content.replyToId) {
          const resolved = resolveReplyId(content.replyToId);
          if (resolved) content.replyToId = resolved;
          else delete content.replyToId;
        }
        return { ...record('assistant', content.text, clock, content.translation, context.batch), ...content };
      });
      const messages = indexedMessages.filter(Boolean);
      const todoCandidates = parseTodoCandidates(answer.todoSuggestions ?? answer.todos, { conversationId: id, messages: indexedMessages, participantIds: (context.todoPeople || []).map(person => person.id) });
      for (const item of actions) await store.respondTransfer(id, item.transferId, item.status, id, context.batch);
      for (const item of rawMsgActions) {
        if (!item || typeof item !== 'object') continue;
        const kind = String(item.action ?? item.type ?? '').trim();
        const targetId = resolveReplyId(String(item.messageId ?? item.id ?? '').trim());
        if (!targetId) continue;
        const targetMsg = (store.read().conversations[id] || []).find(m => m.id === targetId);
        if (!targetMsg) continue;
        if ((kind === 'react' || kind === 'reaction') && item.emoji) {
          await store.addMessageReaction(id, targetId, String(item.emoji).trim());
        } else if ((kind === 'withdraw' || kind === 'recall') && targetMsg.role === 'assistant') {
          await store.withdrawMessage(id, targetId);
        } else if (kind === 'edit' && targetMsg.role === 'assistant' && !targetMsg.type && !targetMsg.withdrawn) {
          const nextText = String(item.text ?? item.newText ?? item.content ?? '').trim();
          if (nextText) await store.editMessage(id, targetId, nextText);
        }
      }
      if (messages.length) await store.appendMessages(id, messages, { todoCandidates });
      return messages;
    },
  };
}
