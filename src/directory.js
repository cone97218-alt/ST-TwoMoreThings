import { parseJsonObject, parsePayload } from './api.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';

export function createDirectoryService({ store, contextReader, modelClient }) {
  return {
    async organize() {
      const input = await contextReader.readDirectorySources({ readMemory: true });
      const state = store?.read?.() || {};
      const activePreset = getActivePreset(state);

      const storyHistoryText = (input.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
      const directoryPhoneContext = sanitizePhoneContext({
        people: input.people || [],
        contacts: input.contacts || [],
        groups: input.groups || [],
        clock: input.clock,
        user: input.user,
        userProfile: input.userProfile,
      });
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: input.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: input.storyMemory || '',
        phoneContext: directoryPhoneContext,
      }, 'directory', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: '通讯录整理与发掘',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(directoryPhoneContext) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const answer = parseJsonObject(reply);
      if (!Array.isArray(answer.contacts) && !Array.isArray(answer.groups)) throw new Error('回答中没有通讯录内容，请重新整理。');
      const sources = new Map(input.people.map(person => [person.sourceId, person]));
      const known = new Set(input.contacts.map(person => person.id));
      const contacts = parsePayload(reply, 'contacts', { allowEmpty: true }).flatMap(({ sourceId, ...profile }) => {
        if (known.has(sourceId)) return [];
        if (sourceId && sourceId !== `card-world:${profile.name}`) {
          const source = sources.get(sourceId);
          return source ? [{ ...profile, id: sourceId, name: source.name, personality: source.personality, source: { kind: 'qqj', entityId: source.entityId } }] : [];
        }
        if (input.contacts.some(person => person.name === profile.name)) return [];
        return [{ ...profile, id: `card-world:${profile.name}`, source: { kind: 'card-world' } }];
      });
      return store.mergeDirectory({ contacts, groups: Array.isArray(answer.groups) ? answer.groups : [] });
    },
  };
}
