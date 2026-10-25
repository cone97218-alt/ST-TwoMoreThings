import { parsePayload, parseJsonObject } from './api.js';
import { getPrompt, CONTACTS_PROMPT, MESSAGES_PROMPT, TODO_SUGGESTIONS_PROMPT } from './prompts.js';
import { readTimeline } from './timeline.js';
import { normalizeContent, RICH_MESSAGES_PROMPT } from './content.js';
import { CALENDAR_PROMPT } from './calendar.js';
import { parseTodoCandidates } from './todos.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';

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
    async sendCard(id, draft) {
      const content = normalizeContent(draft);
      if (!content?.type) throw new Error('消息卡内容不完整，请检查后发送。');
      if (!store.read().contacts.some(person => person.id === id)) throw new Error('请先选择一位联系人。');
      if (content.type === 'transfer') content.transfer.recipientId = id;
      const batch = readTimeline(target.messages);
      await store.appendMessage(id, { ...record('user', content.text, batch.clock, '', batch), ...content });
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
    async send(id, text) {
      const content = String(text || '').trim();
      if (!content) return;
      if (!store.read().contacts.some(x => x.id === id)) throw new Error('请先选择一位联系人。');
      const batch = readTimeline(target.messages);
      await store.appendMessage(id, record('user', content, batch.clock, '', batch));
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
      const indexedMessages = parsePayload(reply, 'messages', { allowEmpty: actions.length > 0, indexed: true }).map(content => {
        if (!content) return null;
        if (content.type === 'transfer') content.transfer.recipientId = '@user';
        return { ...record('assistant', content.text, clock, content.translation, context.batch), ...content };
      });
      const messages = indexedMessages.filter(Boolean);
      const todoCandidates = parseTodoCandidates(answer.todoSuggestions ?? answer.todos, { conversationId: id, messages: indexedMessages, participantIds: (context.todoPeople || []).map(person => person.id) });
      for (const item of actions) await store.respondTransfer(id, item.transferId, item.status, id, context.batch);
      if (messages.length) await store.appendMessages(id, messages, { todoCandidates });
      return messages;
    },
  };
}
