import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient, parsePayload } from '../src/api.js';
import { createContextReader, createBackflowService } from '../src/context.js';
import { readTimeline } from '../src/timeline.js';
import { createMessageService } from '../src/messages.js';

for (const hostKind of ['native', 'luker']) test(`${hostKind}: delete and clear remove saved SMS from generation and main-story reference`, async () => {
  const h = createHarness({ hostKind, metadata: { foreign: { keep: 1 } }, settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } }, completion: (_path, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    return { choices: [{ message: { content: JSON.stringify({ summary: input.conversations.flatMap(item => item.messages).map(item => item.text + (item.translation || '')).join('；') }) } }] };
  } });
  const target = h.host.captureChat(), store = createPhoneStore({ target }), batch = readTimeline(target.messages);
  await store.upsertContacts([{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }]);
  await store.setInjectionEnabled(true);
  await store.appendMessages('lin', [{ id: 'a', batch, role: 'user', text: '已删除的内容', createdAt: '2026-10-18T01:00:00Z' }, { id: 'b', batch, role: 'assistant', text: '仍然存在的内容', translation: '保留的译文', createdAt: '2026-10-18T01:01:00Z' }]);
  await store.appendMessage('zhou', { id: 'z', batch, role: 'assistant', text: '其他会话' });
  await store.deleteMessage('lin', 'a');
  const reader = createContextReader({ target, store });
  assert.deepEqual((await reader.readForContact('lin')).history, [{ id: 'b', role: 'assistant', text: '仍然存在的内容', translation: '保留的译文' }]);
  const summary = createBackflowService({ target, store, modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  const prompt = await summary.prepare();
  assert.ok(!prompt.includes('已删除的内容'));
  assert.ok(prompt.includes('保留的译文'));
  await store.clearConversation('lin', batch);
  const reopened = createPhoneStore({ target: { ...target, metadata: h.persistedMetadata } });
  assert.deepEqual(reopened.read().conversations.lin, []);
  assert.equal(reopened.read().conversations.zhou.length, 1);
  assert.ok(!JSON.stringify(h.persistedMetadata).includes('已删除的内容'));
  assert.ok(!(await summary.prepare()).includes('仍然存在的内容'));
  assert.deepEqual(h.persistedMetadata.foreign, { keep: 1 });
});

test('manual profiles survive reopening and AI contact refresh, with no host persona changes', async () => {
  const h = createHarness(), target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveUserProfile({ name: '我的姓名', nickname: '小满', avatar: 'https://example.invalid/me.png' });
  const contact = await store.saveContact('', { name: '周予', nickname: '予', avatar: 'https://example.invalid/zhou.png', expression: '只发短句，不用句号，偶尔仅回问号', language: '英语，附中文翻译' });
  await store.upsertContacts([{ id: contact.id, name: 'AI覆盖姓名', expression: '覆盖风格' }]);
  const reopened = createPhoneStore({ target: { ...target, metadata: h.persistedMetadata } });
  assert.equal(reopened.read().contacts[0].name, '周予');
  const context = await createContextReader({ target, store: reopened }).readForContact(contact.id);
  assert.equal(context.user, '我的姓名');
  assert.equal(context.userProfile.nickname, '小满');
  assert.equal(context.contact.nickname, '予');
  assert.equal(context.contact.language, '英语，附中文翻译');
  assert.ok(context.contact.expression.includes('问号'));
  assert.ok(!JSON.stringify(context).includes('https://example.invalid/'), '头像不送给模型');
  assert.equal(h.context.name1, '我');
  await assert.rejects(store.saveContact('', { name: ' ' }), /姓名/);
});

test('bilingual formal reply and symbol-only text survive parsing and persistent history', async () => {
  const h = createHarness({ messages: [{ is_user: false, mes: '<!-- QQJ-end | date=2026-10-18 | weekday=周日 | time=22:15 -->' }], settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'key', apiModel: 'model' } }, completion: { choices: [{ message: { content: JSON.stringify({ messages: [{ text: 'On my way.', translation: '我在路上。' }, { text: '?' }] }) } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', language: '英语和中文' }]);
  const reader = createContextReader({ target, store });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  await createMessageService({ target, store, contextReader: reader, modelClient }).continueChat('lin');
  assert.equal(h.persistedMetadata.pocketPhone.conversations.lin[0].translation, '我在路上。');
  assert.equal(h.persistedMetadata.pocketPhone.conversations.lin[1].text, '?');
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(input.clock.time, '22:15');
  assert.equal(input.contact.language, '英语和中文');
  assert.deepEqual(parsePayload('{"messages":[{"text":"Hello","translation":"你好"},{"text":"!"}]}', 'messages'), [{ text: 'Hello', translation: '你好' }, { text: '!' }]);
});
