import { parsePayload } from './api.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';

export function createForumService({ store, contextReader, modelClient }) {
  return {
    getPost: id => store.read().forum.posts.find(x => x.id === id),
    async refresh() {
      const context = await contextReader.readForForum({ readMemory: true });
      const state = store.read();
      const activePreset = getActivePreset(state);

      const storyHistoryText = (context.storyBackground || []).map(item => `${item.speaker || ''}：${item.text}`).join('\n\n');
      const phoneContextData = sanitizePhoneContext(context);
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: context.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: context.storyMemory || '',
        phoneContext: phoneContextData,
      }, 'forum', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: 'BBS 论坛生成',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(phoneContextData) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const posts = parsePayload(reply, 'forum').map(x => ({ ...x, id: globalThis.crypto.randomUUID() }));
      await store.replaceForum(posts);
      return posts;
    },
  };
}
