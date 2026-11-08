import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { PROMPT_DEFINITIONS, getPrompt, getAllPrompts } from '../src/prompts.js';
import { normalizePromptPresets } from '../src/preset-engine.js';
import { renderPromptSettings, renderPromptLibrarySettings, renderPromptPresetSettings } from '../src/ui/settings.js';
import { createAuthoringService, stateFromPreset } from '../src/authoring.js';
import { createMessageService } from '../src/messages.js';
import { createDirectoryService } from '../src/directory.js';
import { createForumService } from '../src/forum.js';
import { createCalendarAiService } from '../src/calendar-ai.js';

test('prompts: definition registry has 29 items across 8 categories', () => {
  assert.equal(PROMPT_DEFINITIONS.length, 29);
  const categories = new Set(PROMPT_DEFINITIONS.map(p => p.category));
  assert.ok(categories.has('短信与通讯'));
  assert.ok(categories.has('群聊'));
  assert.ok(categories.has('社交与论坛'));
  assert.ok(categories.has('日历与日程'));
  assert.ok(categories.has('地图与场景'));
  assert.ok(categories.has('待办与正文'));
  assert.ok(categories.has('通用规则'));
  assert.ok(categories.has('小游戏'));
  assert.ok(PROMPT_DEFINITIONS.some(p => p.id === 'map_calibrate'));
  assert.ok(PROMPT_DEFINITIONS.some(p => p.id === 'origin_system'));
  assert.ok(PROMPT_DEFINITIONS.some(p => p.id === 'origin_chat'));
  assert.ok(PROMPT_DEFINITIONS.some(p => p.id === 'origin_task_conceive'));
  assert.ok(PROMPT_DEFINITIONS.some(p => p.id === 'origin_stats_eval'));
  assert.ok(PROMPT_DEFINITIONS.some(p => p.id === 'origin_shop_conceive'));
  assert.ok(PROMPT_DEFINITIONS.some(p => p.id === 'origin_gacha_conceive'));
});

test('prompts: getPrompt and getAllPrompts default vs customized', () => {
  const emptyState = { prompts: {} };
  assert.equal(getPrompt('messages', emptyState), PROMPT_DEFINITIONS.find(p => p.id === 'messages').defaultPrompt);

  const customState = { prompts: { messages: '自定义短信提示词内容' } };
  assert.equal(getPrompt('messages', customState), '自定义短信提示词内容');

  const all = getAllPrompts(customState);
  assert.equal(all.length, 29);
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
    expandedPrompts: new Set(['messages']),
  };

  const html = renderPromptLibrarySettings(state, ui);
  assert.ok(html.includes('prompts-manager'));
  assert.ok(html.includes('data-action="filter-prompt-category"'));
  assert.ok(html.includes('data-action="search-prompts"'));
  assert.ok(html.includes('data-action="toggle-prompt-card"'));
  assert.ok(html.includes('已定制的私聊提示词'));
  assert.ok(html.includes('data-action="save-prompt"'));
  assert.ok(html.includes('data-action="reset-prompt"'));
  assert.ok(html.includes('data-action="reset-all-prompts"'));

  // 默认折叠测试：未展开时隐藏编辑框
  const collapsedHtml = renderPromptLibrarySettings(state, { ...ui, expandedPrompts: new Set() });
  assert.ok(collapsedHtml.includes('data-action="toggle-prompt-card"'));
  assert.ok(!collapsedHtml.includes('已定制的私聊提示词'));

  // Filter by category
  const filteredHtml = renderPromptLibrarySettings(state, { ...ui, promptCategory: '群聊' });
  assert.ok(filteredHtml.includes('群聊多角色续写'));
  assert.ok(!filteredHtml.includes('私聊短信生成'));

  // Search filter
  const searchHtml = renderPromptLibrarySettings(state, { ...ui, promptSearch: '绘图' });
  assert.ok(searchHtml.includes('照片转绘图描述提示词'));
  assert.ok(!searchHtml.includes('私聊短信生成'));
});

test('preset settings UI & reordering: mobile drag handle and drawer move buttons', async () => {
  const h = createHarness();
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });

  const state = store.read();
  const presets = normalizePromptPresets(state.promptPresets);
  const activePresetId = state.activePresetId || presets[0]?.id || 'default_preset';
  const currentPreset = presets.find(p => p.id === activePresetId);
  const firstEntryId = currentPreset?.entries?.[0]?.id;
  const secondEntryId = currentPreset?.entries?.[1]?.id;

  assert.ok(firstEntryId, 'first preset entry exists');
  assert.ok(secondEntryId, 'second preset entry exists');

  // Render preset settings with first entry expanded
  const ui = {
    expandedPresetEntries: new Set([firstEntryId]),
    presetSearch: '',
  };
  const html = renderPromptPresetSettings(state, ui);

  // 1. Drag handle is present and mobile-ready
  assert.ok(html.includes('class="preset-drag-handle"'));
  assert.ok(html.includes('title="按住拖拽排序"'));
  assert.ok(html.includes('width="13" height="13"'));

  // 2. Drawer footer with move buttons is present for expanded entry
  assert.ok(html.includes('preset-drawer-footer'));
  assert.ok(html.includes('data-action="move-preset-entry" data-direction="up"'));
  assert.ok(html.includes('data-action="move-preset-entry" data-direction="down"'));

  // 3. Move down first entry via store.movePresetEntry
  await store.movePresetEntry(activePresetId, firstEntryId, 'down');
  const afterMoveState = store.read();
  const updatedPreset = afterMoveState.promptPresets.find(p => p.id === activePresetId);
  assert.equal(updatedPreset.entries[1].id, firstEntryId, 'first entry moved down to index 1');
  assert.equal(updatedPreset.entries[0].id, secondEntryId, 'second entry moved up to index 0');

  // 4. Reorder via store.reorderPresetEntries
  await store.reorderPresetEntries(activePresetId, firstEntryId, secondEntryId, true);
  const afterReorderState = store.read();
  const reorderedPreset = afterReorderState.promptPresets.find(p => p.id === activePresetId);
  assert.equal(reorderedPreset.entries[0].id, firstEntryId, 'first entry reordered back to top');
});
