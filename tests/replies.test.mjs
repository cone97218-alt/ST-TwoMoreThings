import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createGroupService } from '../src/groups.js';
import { replyContext } from '../src/replies.js';

async function setup() {
  const h = createHarness({ messages: [{ is_user: false, mes: '当前剧情。<!-- SDC-end | date=2026-10-21 | time=18:00 -->' }], metadata: { pocketPhone: {
    contacts: [{ id: 'lin', name: '林舟' }, { id: 'zhou', name: '周予' }], groups: [], conversations: {}, injectEnabled: false,
  } } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const group = await store.saveGroup('', { name: '读书群', memberIds: ['lin', 'zhou'], userIsMember: true });
  const contextReader = createContextReader({ target, store, qqjBridgeProvider: () => null });
  return { h, target, store, group, contextReader };
}

test('group send stores only a stable reply id and context resolves the original message', async () => {
  const { target, store, group, contextReader } = await setup();
  const service = createGroupService({ target, store, contextReader, modelClient: {} });
  await service.send(group.id, '请看这里');
  const source = store.read().conversations[group.id][0];
  await service.send(group.id, '收到', { replyToId: source.id });
  const saved = store.read().conversations[group.id][1];
  assert.equal(saved.replyToId, source.id);
  assert.equal(Object.hasOwn(saved, 'replyText'), false);
  const context = await contextReader.readForGroup(group.id);
  assert.equal(context.history[1].replyTo.messageId, source.id);
  assert.equal(context.history[1].replyTo.speakerId, '@user');
  assert.equal(context.history[1].replyTo.messageText, '请看这里');
  await store.deleteMessage(group.id, source.id);
  const missing = await contextReader.readForGroup(group.id);
  assert.equal(missing.history.length, 1);
  assert.deepEqual(missing.history[0].replyTo, { messageId: source.id, missing: true });
});

test('group reply rejects a message from another thread and cards retain the same contract', async () => {
  const { target, store, group, contextReader } = await setup();
  const service = createGroupService({ target, store, group, contextReader, modelClient: {} });
  await store.appendMessage('lin', { id: 'private', role: 'assistant', text: '私聊', batch: { key: '[0]' } });
  await assert.rejects(service.send(group.id, '不能引用', { replyToId: 'private' }), /不存在或不属于当前群聊/);
  await assert.rejects(service.sendCard(group.id, { type: 'sticker', stickerId: 'sepia.point' }, { replyToId: 'private' }), /不存在或不属于当前群聊/);
  await service.sendCard(group.id, { type: 'sticker', stickerId: 'sepia.point' });
  const saved = store.read().conversations[group.id][0];
  assert.equal(saved.replyToId, undefined);
});

test('reply context distinguishes duplicate text by message id and reports deleted source', () => {
  const thread = [
    { id: 'a', role: 'assistant', speakerId: 'lin', text: '同一句', translation: 'same' },
    { id: 'b', role: 'assistant', speakerId: 'zhou', text: '同一句' },
  ];
  assert.deepEqual(replyContext({ replyToId: 'b' }, thread), { messageId: 'b', speakerId: 'zhou', role: 'assistant', messageText: '同一句' });
  assert.deepEqual(replyContext({ replyToId: 'b' }, thread.slice(0, 1)), { messageId: 'b', missing: true });
});

test('reply context reports withdrawn source message cleanly', () => {
  const thread = [
    { id: 'w1', role: 'user', text: '[消息已撤回]', withdrawn: true, withdrawnText: '原本的话' },
  ];
  assert.deepEqual(replyContext({ replyToId: 'w1' }, thread), {
    messageId: 'w1',
    role: 'user',
    withdrawn: true,
    messageText: '原消息已撤回',
  });
});
