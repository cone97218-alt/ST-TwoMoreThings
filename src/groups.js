import { parseJsonObject } from './api.js';
import { record } from './messages.js';
import { readTimeline } from './timeline.js';
import { normalizeContent, messageText, formatForwardedContextText, shortenMessageId, extractLatestUserInput, RICH_MESSAGES_PROMPT } from './content.js';
import { CALENDAR_PROMPT } from './calendar.js';
import { getPrompt, GROUP_PROMPT, LANGUAGE_RULE, STORY_MEMORY_RULE, TODO_SUGGESTIONS_PROMPT } from './prompts.js';
import { parseTodoCandidates } from './todos.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';
import { replyToMessage } from './replies.js';

const sameMembers = (a, b) => Array.isArray(a) && new Set(a).size === b.length && b.every(id => a.includes(id));

export function createGroupService({ target, store, contextReader, modelClient }) {
  const find = id => {
    const group = store.read().groups?.find(item => item.id === id);
    if (!group) throw new Error('这个群聊已不存在，请返回短信重新选择。');
    return group;
  };
  return {
    async sendCard(id, draft, { replyToId } = {}) {
      const group = find(id);
      if (!group.userIsMember) throw new Error('你不在这个群，不能发送信息。');
      const content = normalizeContent(draft);
      if (!content?.type) throw new Error('消息卡内容不完整，请检查后发送。');
      if (content.type === 'transfer' && !group.memberIds.includes(content.transfer.recipientId)) throw new Error('请在群成员中选择收款人。');
      const batch = readTimeline(target.messages);
      const thread = store.read().conversations[id] || [];
      await store.appendMessage(id, { ...record('user', content.text, batch.clock, '', batch), ...content, ...replyToMessage(thread, replyToId), speakerId: '@user' });
    },
    async send(id, text, { replyToId } = {}) {
      const group = find(id);
      if (!group.userIsMember) throw new Error('你不在这个群，不能发送信息。');
      const content = String(text || '').trim();
      const batch = readTimeline(target.messages);
      if (content) {
        const thread = store.read().conversations[id] || [];
        await store.appendMessage(id, { ...record('user', content, batch.clock, '', batch), ...replyToMessage(thread, replyToId), speakerId: '@user' });
      }
    },
    async continueChat(id) {
      find(id);
      const context = await contextReader.readForGroup(id);
      const state = store.read();
      const activePreset = getActivePreset(state);

      const rawThread = state.conversations[id] || [];
      const historySources = (context.history && context.history.length) ? context.history : rawThread;
      const latestUserInput = extractLatestUserInput(historySources, {
        contactName: '角色',
        userName: context.user || '<user>',
      });

      const storyHistoryText = (context.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
      const phoneContextData = sanitizePhoneContext(context);
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: context.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: context.storyMemory || '',
        calendar: context.calendar,
        phoneContext: phoneContextData,
        charPersonality: (context.group?.members || []).map(m => `${m.name}：${m.personality || ''}（风格：${m.expression || ''}）`).join('\n'),
        latestUserInput,
      }, 'group-chat', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const answer = parseJsonObject(await modelClient.complete({
        label: '群聊多角色续写',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : messagesPayload,
        entries: messagesPayload,
        collapsedMessages: collapsed,
      }));
      const roster = context.group.members.map(person => person.id), speakers = answer.anchor?.speakerIds;
      if (!sameMembers(answer.anchor?.memberIds, roster) || !Array.isArray(speakers) || speakers.some(key => key === '@user' || !roster.includes(key))) throw new Error('回答中的群成员或发言者无法对应，请点继续重试。');
      if (!Array.isArray(answer.messages)) throw new Error('回答中没有可读取的群聊消息，请点继续重试。');
      // 发言归属是保存所需身份，不从姓名或句子内容猜测。
      const existingThread = store.read().conversations[id] || [];
      const existingIds = new Set(existingThread.map(item => item.id));
      const resolveReplyId = rawId => {
        if (!rawId) return '';
        if (existingIds.has(rawId)) return rawId;
        const shortRaw = shortenMessageId(rawId);
        const byPrefix = existingThread.find(m => m.id && (m.id.startsWith(shortRaw) || shortRaw.startsWith(shortenMessageId(m.id))));
        if (byPrefix) return byPrefix.id;
        const byText = [...existingThread].reverse().find(m => m.text === rawId || messageText(m) === rawId);
        return byText ? byText.id : '';
      };
      const memberMap = new Map(context.group.members.map(person => [person.id, person]));
      const indexedMessages = answer.messages.map(item => {
        if (!item || !roster.includes(item.speakerId) || item.speakerId === '@user' || !speakers.includes(item.speakerId)) throw new Error('回答中的发言者不在本轮群聊中，请点继续重试。');
        const content = normalizeContent(item);
        if (content?.type === 'transfer' && (!roster.includes(content.transfer.recipientId) || content.transfer.recipientId === item.speakerId)) throw new Error('转账收款人无法对应群成员，请点继续重试。');
        if (content?.type === 'poke') {
          content.poke.actorId = item.speakerId;
          if (!content.poke.actorName || content.poke.actorName === '对方') {
            content.poke.actorName = memberMap.get(item.speakerId)?.name || '群成员';
          }
          content.text = messageText(content);
        }
        if (content?.replyToId) {
          const resolved = resolveReplyId(content.replyToId);
          if (resolved) content.replyToId = resolved;
          else delete content.replyToId;
        }
        return content ? { ...record('assistant', content.text, context.clock, content.translation, context.batch), ...content, speakerId: item.speakerId } : null;
      });
      const messages = indexedMessages.filter(Boolean);
      const todoCandidates = parseTodoCandidates(answer.todoSuggestions ?? answer.todos, { conversationId: id, messages: indexedMessages, participantIds: roster });
      for (const item of Array.isArray(answer.transferActions) ? answer.transferActions : []) {
        if (!speakers.includes(item.speakerId)) throw new Error('转账回复无法对应本轮发言者。');
        const targetTransferId = resolveReplyId(item.transferId) || item.transferId;
        await store.respondTransfer(id, targetTransferId, item.status, item.speakerId, context.batch);
      }
      const rawMsgActions = [
        ...(Array.isArray(answer.messageActions) ? answer.messageActions : []),
        ...(Array.isArray(answer.reactionActions) ? answer.reactionActions.map(item => ({ ...item, action: 'react' })) : []),
      ];
      for (const item of rawMsgActions) {
        if (!item || typeof item !== 'object') continue;
        if (item.speakerId && !speakers.includes(item.speakerId)) continue;
        const kind = String(item.action ?? item.type ?? '').trim();
        const targetId = resolveReplyId(String(item.messageId ?? item.id ?? '').trim());
        if (!targetId) continue;
        const targetMsg = (store.read().conversations[id] || []).find(m => m.id === targetId);
        if (!targetMsg) continue;
        if ((kind === 'react' || kind === 'reaction') && item.emoji) {
          await store.addMessageReaction(id, targetId, String(item.emoji).trim());
        } else if ((kind === 'withdraw' || kind === 'recall') && targetMsg.role === 'assistant' && (!item.speakerId || targetMsg.speakerId === item.speakerId)) {
          await store.withdrawMessage(id, targetId);
        } else if (kind === 'edit' && targetMsg.role === 'assistant' && !targetMsg.type && !targetMsg.withdrawn && (!item.speakerId || targetMsg.speakerId === item.speakerId)) {
          const nextText = String(item.text ?? item.newText ?? item.content ?? '').trim();
          if (nextText) await store.editMessage(id, targetId, nextText);
        }
      }
      if (messages.length) await store.appendMessages(id, messages, { todoCandidates });
      return messages;
    },
  };
}
