import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createContextReader } from '../src/context.js';

test('one directory request adds contacts and groups together without resetting existing profiles/history', async () => {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } }, completion: { choices: [{ message: { content: JSON.stringify({ contacts: [{ sourceId: 'lin', name: '林舟', expression: '不可覆盖' }, { sourceId: 'qqj:q2', name: '周予', expression: '短句' }], groups: [{ name: '朋友', memberIds: ['lin', 'qqj:q2'], userIsMember: true }] }) } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟', expression: '已有线上方式' }]);
  await store.appendMessage('lin', { id: 'keep', text: '已有历史' });
  assert.equal(typeof store.mergeDirectory, 'function');
  const { createDirectoryService } = await import('../src/directory.js');
  const bridge = { getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'q2', displayName: '周予', profile: { personality: '爽快', expression: '表达直接' } }] } }) };
  const service = createDirectoryService({ store, contextReader: createContextReader({ target, store, qqjBridgeProvider: () => bridge }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  const before = h.metadataSaves;
  const added = await service.organize();
  assert.equal(h.modelRequests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(added.contacts.length, 1);
  assert.equal(added.groups.length, 1);
  assert.equal(store.read().contacts[0].expression, '已有线上方式');
  assert.equal(store.read().conversations.lin[0].id, 'keep');
  assert.deepEqual(store.read().groups[0].memberIds, ['lin', 'qqj:q2']);
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(input.worldbook, undefined); assert.ok(h.modelRequests[0].body.messages[0].content.includes('周予性格爽快'));
  assert.equal(input.contacts[0].id, 'lin');
  assert.ok(h.modelRequests[0].body.messages[0].content.includes('根据people、角色卡、世界书和最新剧情'));
  await service.organize();
  assert.equal(store.read().contacts.length, 2);
  assert.equal(store.read().groups.length, 1);
});

test('without QQJ, directory reads card/worldbook and permits an empty result without resetting the save', async () => {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } }, completion: { choices: [{ message: { content: '{"contacts":[{"name":"周予","expression":"简短直接"}],"groups":[]}' } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const { createDirectoryService } = await import('../src/directory.js');
  const service = createDirectoryService({ store, contextReader: createContextReader({ target, store, qqjBridgeProvider: () => null }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  await service.organize();
  assert.equal(store.read().contacts[0].id, 'card-world:周予');
  assert.equal(JSON.parse(h.modelRequests[0].body.messages[1].content).worldbook, undefined); assert.ok(h.modelRequests[0].body.messages[0].content.includes('周予性格爽快'));
  h.completion = { choices: [{ message: { content: '{"contacts":[],"groups":[]}' } }] };
  const before = h.metadataSaves;
  assert.deepEqual(await service.organize(), { contacts: [], groups: [] });
  assert.equal(h.metadataSaves, before, '无新增不重复写档');
  assert.equal(store.read().contacts.length, 1);
});

test('card/worldbook source IDs preserve a new contact and its group without guessing unknown IDs', async () => {
  const h = createHarness();
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  const { createDirectoryService } = await import('../src/directory.js');
  const service = createDirectoryService({ store,
    contextReader: createContextReader({ target, store, qqjBridgeProvider: () => null }),
    modelClient: { complete: async () => JSON.stringify({ contacts: [
      { sourceId: 'card-world:周予', name: '周予', expression: '短句' },
      { sourceId: 'qqj:unknown', name: '不明归属' },
    ], groups: [{ name: '读书小组', memberIds: ['lin', 'card-world:周予'], userIsMember: true }] }) },
  });
  const added = await service.organize();
  assert.deepEqual(added.contacts.map(person => person.id), ['card-world:周予']);
  assert.equal(added.groups.length, 1);
  assert.deepEqual(store.read().groups[0].memberIds, ['lin', 'card-world:周予']);
});

test('directory organize reads and injects storyMemory into active preset', async () => {
  const h = createHarness();
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  const { createDirectoryService } = await import('../src/directory.js');
  let receivedEntries = null;
  const memorySources = {
    select: () => ({ kind: 'bbs' }),
    readStoryMemory: () => '柏宝书剧情长线摘要测试内容',
  };
  const service = createDirectoryService({
    store,
    contextReader: createContextReader({ target, store, qqjBridgeProvider: () => null, memorySources }),
    modelClient: {
      complete: async (req) => {
        receivedEntries = req.entries;
        return JSON.stringify({ contacts: [], groups: [] });
      },
    },
  });
  await service.organize();
  assert.ok(receivedEntries, 'modelClient.complete should be called with entries');
  const memoryEntry = receivedEntries.find(e => e.id === 'entry_story_memory');
  assert.ok(memoryEntry, 'entry_story_memory should be present');
  assert.ok(memoryEntry.content.includes('柏宝书剧情长线摘要测试内容'), 'entry content should include story memory');

  const phoneContextEntry = receivedEntries.find(e => e.id === 'entry_phone_context' || e.id === 'entry_phone_data');
  assert.ok(phoneContextEntry, 'entry_phone_context should be present');
  const parsedPhoneContext = JSON.parse(phoneContextEntry.content);
  assert.equal(parsedPhoneContext.story, undefined, 'phoneContext should omit redundant story');
  assert.equal(parsedPhoneContext.storyMemory, undefined, 'phoneContext should omit redundant storyMemory');
  assert.equal(parsedPhoneContext.character, undefined, 'phoneContext should omit redundant character');
  assert.ok(Array.isArray(parsedPhoneContext.contacts));
  assert.ok(Array.isArray(parsedPhoneContext.groups));
  assert.ok(parsedPhoneContext.clock);
});
