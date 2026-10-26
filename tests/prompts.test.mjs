import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { PROMPT_DEFINITIONS, getPrompt, getAllPrompts } from '../src/prompts.js';
import { renderPromptSettings, renderPromptLibrarySettings } from '../src/ui/settings.js';
import { createAuthoringService, stateFromPreset } from '../src/authoring.js';
import { createMessageService } from '../src/messages.js';
import { createDirectoryService } from '../src/directory.js';
import { createForumService } from '../src/forum.js';
import { createCalendarAiService } from '../src/calendar-ai.js';

test('prompts: definition registry has 18 items across 7 categories', () => {
  assert.equal(PROMPT_DEFINITIONS.length, 18);
  const categories = new Set(PROMPT_DEFINITIONS.map(p => p.category));
  assert.ok(categories.has('短信与通讯'));
  assert.ok(categories.has('群聊'));
  assert.ok(categories.has('社交与论坛'));
  assert.ok(categories.has('日历与日程'));
  assert.ok(categories.has('待办与正文'));
  assert.ok(categories.has('通用规则'));
  assert.ok(categories.has('小游戏'));
});

test('prompts: getPrompt and getAllPrompts default vs customized', () => {
  const emptyState = { prompts: {} };
  assert.equal(getPrompt('messages', emptyState), PROMPT_DEFINITIONS.find(p => p.id === 'messages').defaultPrompt);

  const customState = { prompts: { messages: '自定义短信提示词内容' } };
  assert.equal(getPrompt('messages', customState), '自定义短信提示词内容');

  const all = getAllPrompts(customState);
  assert.equal(all.length, 18);
  const messagesItem = all.find(p => p.id === 'messages');
  assert.equal(messagesItem.isCustom, true);
  assert.equal(messagesItem.currentPrompt, '自定义短信提示词内容');

  const groupsItem = all.find(p => p.id === 'groups');
  assert.equal(groupsItem.isCustom, false);
  assert.equal(groupsItem.currentPrompt, groupsItem.defaultPrompt);
});

test('store: savePrompt, resetPrompt and resetAllPrompts', async () => {
  const h = createHarness();
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });

  await store.savePrompt('messages', '  这是修改后的私聊提示词  ');
  assert.equal(store.read().prompts?.messages, '这是修改后的私聊提示词');

  await store.savePrompt('forum', '自定义论坛提示词');
  assert.equal(store.read().prompts?.forum, '自定义论坛提示词');
  assert.equal(Object.keys(store.read().prompts).length, 2);

  await store.resetPrompt('messages');
  assert.equal(store.read().prompts?.messages, undefined);
  assert.equal(store.read().prompts?.forum, '自定义论坛提示词');

  await store.resetAllPrompts();
  assert.deepEqual(store.read().prompts, {});
});

test('authoring: preset export and import preserves custom prompts', async () => {
  const customPrompts = {
    messages: '角色定制私聊提示词',
    comment: '动态毒舌评论规则',
  };
  const h = createHarness();
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });
  await store.savePrompt('messages', customPrompts.messages);
  await store.savePrompt('comment', customPrompts.comment);

  const authoring = createAuthoringService({
    store,
    host: h.host,
  });
  const { script } = await authoring.exportScript();
  assert.equal(script.data.twoMoreThings.prompts.messages, '角色定制私聊提示词');
  assert.equal(script.data.twoMoreThings.prompts.comment, '动态毒舌评论规则');

  const parsed = stateFromPreset({ schemaVersion: 1, prompts: customPrompts });
  assert.deepEqual(parsed.prompts, customPrompts);
});

test('services: dynamic prompt usage across messages, directory, forum, calendarAi', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '你好' }] });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });
  await store.saveContact('', { name: '小爱', personality: '开朗' });
  const contact = store.read().contacts[0];

  await store.savePrompt('messages', 'CUSTOM_MESSAGES_PROMPT_KEYWORD');
  await store.savePrompt('directory', 'CUSTOM_DIRECTORY_PROMPT_KEYWORD');
  await store.savePrompt('forum', 'CUSTOM_FORUM_PROMPT_KEYWORD');
  await store.savePrompt('festival_conceive', 'CUSTOM_FESTIVAL_CONCEIVE_KEYWORD');

  let capturedSystem = '';
  const modelClient = {
    async complete({ system }) {
      capturedSystem = system;
      return '{}';
    },
  };

  const contextReader = {
    async readForContact() {
      return { clock: { time: '12:00' }, story: [], messages: [] };
    },
    async readDirectorySources() {
      return { worldbook: '', contacts: [], story: [] };
    },
    async readForForum() {
      return { posts: [] };
    },
  };

  // Test messages service
  const messageService = createMessageService({ target, store, contextReader, modelClient });
  try {
    await messageService.continueChat(contact.id);
  } catch {}
  assert.ok(capturedSystem.includes('CUSTOM_MESSAGES_PROMPT_KEYWORD'));

  // Test directory service
  const directoryService = createDirectoryService({ store, contextReader, modelClient });
  try {
    await directoryService.organize();
  } catch {}
  assert.ok(capturedSystem.includes('CUSTOM_DIRECTORY_PROMPT_KEYWORD'));

  // Test forum service
  const forumService = createForumService({ store, contextReader, modelClient });
  try {
    await forumService.refresh();
  } catch {}
  assert.ok(capturedSystem.includes('CUSTOM_FORUM_PROMPT_KEYWORD'));

  // Test calendar AI service
  const calendarAi = createCalendarAiService({ contextReader, modelClient, target, store });
  try {
    await calendarAi.conceiveFestivals({ setting: '奇幻' });
  } catch {}
  assert.ok(capturedSystem.includes('CUSTOM_FESTIVAL_CONCEIVE_KEYWORD'));
});

test('settings UI: renderPromptLibrarySettings renders tabs, search, and cards', () => {
  const state = {
    prompts: {
      messages: '已定制的私聊提示词',
    },
  };
  const ui = {
    promptCategory: '全部',
    promptSearch: '',
    promptDrafts: {},
  };

  const html = renderPromptLibrarySettings(state, ui);
  assert.ok(html.includes('prompts-manager'));
  assert.ok(html.includes('data-action="filter-prompt-category"'));
  assert.ok(html.includes('data-action="search-prompts"'));
  assert.ok(html.includes('已定制的私聊提示词'));
  assert.ok(html.includes('data-action="save-prompt"'));
  assert.ok(html.includes('data-action="reset-prompt"'));
  assert.ok(html.includes('data-action="reset-all-prompts"'));

  // Filter by category
  const filteredHtml = renderPromptLibrarySettings(state, { ...ui, promptCategory: '群聊' });
  assert.ok(filteredHtml.includes('群聊多角色续写'));
  assert.ok(!filteredHtml.includes('私聊短信生成'));

  // Search filter
  const searchHtml = renderPromptLibrarySettings(state, { ...ui, promptSearch: '绘图' });
  assert.ok(searchHtml.includes('照片转绘图描述提示词'));
  assert.ok(!searchHtml.includes('私聊短信生成'));
});
