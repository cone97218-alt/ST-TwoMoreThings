import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';

for (const hostKind of ['native', 'luker']) test(`preserves foreign metadata and sent messages through ${hostKind} save entry`, async () => {
  const originalMessages = [{ mes: '他们刚约好晚餐。', is_user: false, extra: { foreign: 1 } }];
  const h = createHarness({ hostKind, metadata: { foreign: { keep: '原样' }, integrity: 'test-version' }, messages: originalMessages });
  const before = structuredClone(originalMessages);
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts([{ id: 'lin', name: '林舟', personality: '温和', expression: '简短' }]);
  await store.appendMessage('lin', { id: 'm1', role: 'user', text: '晚点见。' });
  assert.equal(h.persistedMetadata.pocketPhone.conversations.lin[0].text, '晚点见。');
  assert.deepEqual(h.persistedMetadata.foreign, { keep: '原样' });
  assert.deepEqual(h.context.chat, before);
  const reopened = createPhoneStore({ target: { ...h.host.captureChat(), metadata: h.persistedMetadata } });
  assert.equal(reopened.read().conversations.lin[0].role, 'user');
});

test('persists several reply bubbles in one save and replaces the forum batch', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.appendMessages('lin', [{ id: 'a', role: 'assistant', text: '好。' }, { id: 'b', role: 'assistant', text: '我等你。' }]);
  assert.equal(h.metadataSaves, 1);
  assert.deepEqual(h.persistedMetadata.pocketPhone.conversations.lin.map(x => x.text), ['好。', '我等你。']);
  await store.replaceForum([{ id: 'old', title: '旧帖' }]);
  await store.replaceForum([{ id: 'new', title: '新帖' }]);
  assert.deepEqual(h.persistedMetadata.pocketPhone.forum.posts.map(x => x.id), ['new']);
});

test('reports a real save failure without presenting the unpersisted message as saved', async () => {
  const h = createHarness({ metadata: { foreign: 'keep', pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  h.saveFailure = new Error('保存失败');
  await assert.rejects(store.appendMessage('lin', { id: 'a', role: 'user', text: '你好' }), /保存失败/);
  assert.equal(store.read().conversations.lin, undefined);
  assert.equal(h.context.chatMetadata.foreign, 'keep');
});

test('incoming message notices refer only to the messages this operation actually saved', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], conversations: {}, forum: { posts: [] } } } });
  const notices = [];
  const store = createPhoneStore({ target: h.host.captureChat(), onIncomingMessage: id => {
    assert.ok(h.persistedMetadata.pocketPhone.conversations[id].some(message => message.role === 'assistant'), 'notice follows successful persistence');
    notices.push(id);
  } });
  await store.appendMessage('lin', { id: 'sent', role: 'user', text: '我先留言。' });
  assert.deepEqual(notices, []);
  await Promise.all([
    store.appendMessages('lin', [{ id: 'reply-1', role: 'assistant', text: '来了。' }, { id: 'reply-2', role: 'assistant', text: '晚点见。' }]),
    store.updateSocial(social => social, { incomingMessages: [{ contactId: 'zhou', messages: [{ id: 'reply-3', role: 'assistant', text: '我也在。' }] }] }),
  ]);
  assert.deepEqual(notices, ['lin', 'zhou']);
  await store.updateSocial(social => ({ ...social, feedIds: [] }));
  assert.deepEqual(notices, ['lin', 'zhou'], 'a separate social save never repeats another task’s SMS notice');
  h.saveFailure = new Error('保存失败');
  await assert.rejects(store.appendMessage('lin', { id: 'failed', role: 'assistant', text: '没存成。' }));
  assert.deepEqual(notices, ['lin', 'zhou']);
});

test('character-bound switches persist into global characterPreferences and load in new chats', async () => {
  const h = createHarness({
    settings: { pocketPhone: {} },
    metadata: { pocketPhone: { contacts: [{ id: 'lin', name: '林舟' }] } },
  });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target, host: h.host });

  // Toggle character preferences
  await store.setInjectionEnabled(true);
  await store.setInjectCalendarEnabled(true);
  await store.setInjectMapEnabled(true);
  await store.setContactSocialEnabled(false);
  await store.setGroupSocialEnabled(false);
  await store.setSummaryMode('manual');
  await store.setSummaryMaxCharacters(250);
  await store.setSummaryAutoTruncate(false);
  await store.setSummaryAlwaysSummarize(true);

  // Check characterPreferences in global extension settings
  const charKey = 'character:林舟.png';
  const charPrefs = h.context.extensionSettings.pocketPhone.characterPreferences[charKey];
  assert.ok(charPrefs, 'characterPreferences created for character');
  assert.equal(charPrefs.injectEnabled, true);
  assert.equal(charPrefs.injectCalendarEnabled, true);
  assert.equal(charPrefs.injectMapEnabled, true);
  assert.equal(charPrefs.contactSocialEnabled, false);
  assert.equal(charPrefs.groupSocialEnabled, false);
  assert.equal(charPrefs.summaryMode, 'manual');
  assert.equal(charPrefs.summaryMaxCharacters, 250);
  assert.equal(charPrefs.summaryAutoTruncate, false);
  assert.equal(charPrefs.summaryAlwaysSummarize, true);

  // Simulate starting a new chat with the same character (pocketPhone metadata empty/undefined)
  const newChatTarget = {
    ...h.host.captureChat(),
    id: '新聊天',
    metadata: {},
  };
  const newStore = createPhoneStore({ target: newChatTarget, host: h.host });
  const readState = newStore.read();
  assert.equal(readState.injectEnabled, true, 'injectEnabled bound to character');
  assert.equal(readState.injectCalendarEnabled, true, 'injectCalendarEnabled bound to character');
  assert.equal(readState.injectMapEnabled, true, 'injectMapEnabled bound to character');
  assert.equal(readState.contactSocialEnabled, false, 'contactSocialEnabled bound to character');
  assert.equal(readState.groupSocialEnabled, false, 'groupSocialEnabled bound to character');
  assert.equal(readState.summaryMode, 'manual', 'summaryMode bound to character');
  assert.equal(readState.summaryMaxCharacters, 250, 'summaryMaxCharacters bound to character');
  assert.equal(readState.summaryAutoTruncate, false, 'summaryAutoTruncate bound to character');
  assert.equal(readState.summaryAlwaysSummarize, true, 'summaryAlwaysSummarize bound to character');

  // Another character starts with default settings
  const otherCharTarget = {
    ...h.host.captureChat(),
    character: { name: '周予', avatar: '周予.png' },
    id: '周予聊天',
    metadata: {},
  };
  const otherStore = createPhoneStore({ target: otherCharTarget, host: h.host });
  const otherState = otherStore.read();
  assert.equal(otherState.injectEnabled, false, 'other character has default injectEnabled');
  assert.equal(otherState.injectCalendarEnabled, false, 'other character has default injectCalendarEnabled');
  assert.equal(otherState.contactSocialEnabled, true, 'other character has default contactSocialEnabled');
  assert.equal(otherState.summaryMode, 'auto', 'other character has default summaryMode');
  assert.equal(otherState.summaryAlwaysSummarize, false, 'other character has default summaryAlwaysSummarize');
});

test('userProfile avatar falls back to SillyTavern Persona avatar when unset', async () => {
  const h = createHarness({
    settings: { pocketPhone: {} },
    metadata: {},
  });
  const target = h.host.captureChat();
  target.userAvatar = '/User Avatars/my-persona.png';
  target.user = '旅行者';

  const store = createPhoneStore({ target, host: h.host });
  const state = store.read();
  assert.equal(state.userProfile?.name, '旅行者');
  assert.equal(state.userProfile?.avatar, '/User Avatars/my-persona.png');

  // Custom user profile takes precedence over fallback
  await store.saveUserProfile({ name: '自定义昵称', avatar: 'https://example.com/custom.png' });
  const updatedState = store.read();
  assert.equal(updatedState.userProfile?.name, '自定义昵称');
  assert.equal(updatedState.userProfile?.avatar, 'https://example.com/custom.png');
});
