import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneStore } from '../src/store.js';
import { readContactAvatars } from '../src/contact-avatars.js';
import { avatarSource } from '../src/profiles.js';
import { createAuthoringService, stateFromPreset } from '../src/authoring.js';
import { createHarness } from './harness.mjs';

const portrait = 'data:image/png;base64,cG9ydHJhaXQ=';
const svgText = uri => decodeURIComponent(uri.slice(uri.indexOf(',') + 1));

for (const hostKind of ['native', 'luker']) test(`${hostKind}: a new contact saves one fixed Cameo and editing or clearing does not regenerate it`, async () => {
  const h = createHarness({ hostKind }), target = h.host.captureChat();
  const store = createPhoneStore({ target });
  const person = await store.saveContact('', { name: '新朋友' });
  assert.match(person.avatar, /^data:image\/svg\+xml;/);
  assert.equal(avatarSource(person.avatar), person.avatar);
  assert.equal(person.manualFields.includes('avatar'), false, 'automatic image is not marked as a user edit');
  assert.equal(h.persistedMetadata.pocketPhone.contacts[0].avatar, person.avatar);
  const reopened = createPhoneStore({ target });
  assert.equal(reopened.read().contacts[0].avatar, person.avatar);
  await reopened.saveContact(person.id, { ...person, nickname: '朋友' });
  assert.equal(reopened.read().contacts[0].avatar, person.avatar);
  assert.equal(reopened.read().contacts[0].manualFields.includes('avatar'), false);
  await reopened.saveContact(person.id, { ...reopened.read().contacts[0], avatar: '' });
  assert.equal(reopened.read().contacts[0].avatar, '');
  assert.ok(reopened.read().contacts[0].manualFields.includes('avatar'));
  await reopened.upsertContacts([{ id: person.id, expression: '短句' }]);
  assert.equal(reopened.read().contacts[0].avatar, '', 'ordinary updates retain the intentional clearing');
  const manual = await store.saveContact('', { name: '自选头像', avatar: portrait });
  assert.equal(manual.avatar, portrait);
  assert.ok(manual.manualFields.includes('avatar'));
  assert.equal(h.modelRequests.length, 0);
});

test('insert paths fill new portraits while old portraits wait for the opening step', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'old', name: '旧联系人' }], groups: [], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() });
  const added = await store.mergeDirectory({ contacts: [{ id: 'new', name: '新联系人' }, { id: 'old', name: '不覆盖旧人' }], groups: [{ name: '朋友', memberIds: ['new', 'old'], userIsMember: true }] });
  assert.match(added.contacts[0].avatar, /^data:image\/svg\+xml;/);
  assert.equal(store.read().contacts[0].avatar, undefined);
  assert.equal(added.groups[0].avatar, undefined, 'groups do not receive a random person');
  const fixed = store.read().contacts.find(person => person.id === 'new').avatar;
  await store.upsertContacts([{ id: 'new', expression: '更新方式' }, { id: 'old', expression: '普通更新不触发打开补图' }, { id: 'inserted', name: '第三人' }]);
  assert.equal(store.read().contacts.find(person => person.id === 'new').avatar, fixed);
  assert.equal(store.read().contacts.find(person => person.id === 'old').avatar, undefined);
  assert.match(store.read().contacts.find(person => person.id === 'inserted').avatar, /^data:image\/svg\+xml;/);
});

test('QQJ overrides an automatic Cameo only in the display copy and later absence restores the fixed saved image', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  const person = await store.saveContact('', { name: '新朋友' });
  const fixed = person.avatar;
  assert.match(fixed, /^data:image\/svg\+xml;/);
  let ready = false, reads = 0;
  const bridge = {
    getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'qqj-person', displayName: '新朋友' }] } }),
    getPeopleAvatars(ids) { reads++; assert.deepEqual(ids, ['qqj-person']); return { status: ready ? 'ready' : 'not-ready', avatarsByEntityId: { 'qqj-person': portrait } }; },
  };
  assert.equal(readContactAvatars(store.read().contacts, bridge)[0].avatar, fixed);
  ready = true;
  assert.equal(readContactAvatars(store.read().contacts, bridge)[0].avatar, portrait);
  assert.equal(store.read().contacts[0].avatar, fixed);
  ready = false;
  assert.equal(readContactAvatars(store.read().contacts, bridge)[0].avatar, fixed);
  assert.equal(reads, 3, 'each display still uses the existing single batch read');
  await store.saveContact(person.id, { ...person, avatar: portrait });
  assert.equal(readContactAvatars(store.read().contacts, { getPeopleAvatars() { throw new Error('manual portrait must win'); } })[0].avatar, portrait);
  await store.saveContact(person.id, { ...store.read().contacts[0], avatar: '' });
  assert.equal(readContactAvatars(store.read().contacts, bridge)[0].avatar, '');
  assert.equal(reads, 3, 'manual clearing is not silently replaced');
});

test('portable cards retain generated pixels and avatar ownership while old presets keep their prior protection', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.mergeDirectory({ contacts: [{ id: 'auto', name: '自动头像' }], groups: [] });
  const cleared = await store.saveContact('', { name: '主动移除' });
  await store.saveContact(cleared.id, { ...cleared, avatar: '' });
  await store.saveContact('', { name: '手选图片', avatar: portrait });
  const before = JSON.stringify(store.read()), saves = h.metadataSaves;
  const { script } = await createAuthoringService({ store, host: h.host, fetchImage() { throw new Error('data images never fetch'); } }).exportScript();
  const preset = script.data.twoMoreThings;
  assert.deepEqual(preset.contacts.map(person => person.manualFields), [[], ['avatar'], ['avatar']]);
  const imported = stateFromPreset(preset);
  assert.equal(imported.contacts[0].avatar, store.read().contacts[0].avatar);
  assert.equal(imported.contacts[0].manualFields.includes('avatar'), false);
  assert.ok(imported.contacts[0].manualFields.includes('name'), 'other authored fields retain their existing protection');
  assert.ok(imported.contacts[1].manualFields.includes('avatar'));
  assert.equal(imported.contacts[1].avatar, '');
  const projected = readContactAvatars(imported.contacts, { getPeopleSnapshot: () => ({ status: 'ready', people: { items: [{ entityId: 'reader-auto', displayName: '自动头像' }] } }), getPeopleAvatars: () => ({ status: 'ready', avatarsByEntityId: { 'reader-auto': portrait } }) });
  assert.equal(projected[0].avatar, portrait);
  assert.equal(imported.contacts[0].avatar, preset.contacts[0].avatar);
  const legacy = stateFromPreset({ schemaVersion: 1, contacts: [{ id: 'legacy', name: '旧包空头像' }], groups: [] });
  assert.ok(legacy.contacts[0].manualFields.includes('avatar'));
  assert.equal(legacy.contacts[0].avatar, undefined);
  assert.equal(JSON.stringify(store.read()), before);
  assert.equal(h.metadataSaves, saves, 'export and pure preset validation do not regenerate or save');
});

test('generated SVGs render all five supported heads while excluding taper and keep seeded output stable', async () => {
  const { createCameoAvatar, isCameoAvatar } = await import('../src/cameo-avatar.js');
  const shapes = new Set();
  for (let index = 0; index < 160; index++) {
    const uri = createCameoAvatar(`head-${index}`), svg = svgText(uri);
    assert.equal(isCameoAvatar(uri), true);
    assert.equal(avatarSource(uri), uri);
    assert.equal(svg.includes('dbcm-taper'), false);
    const shape = svg.match(/dbcm-(round|oval|squircle|jaw|wide)/)?.[1];
    assert.ok(shape, 'actual SVG has a recognized head clip'); shapes.add(shape);
    if (index < 3) assert.equal(createCameoAvatar(`head-${index}`), uri);
  }
  assert.deepEqual([...shapes].sort(), ['jaw', 'oval', 'round', 'squircle', 'wide']);
  assert.equal(isCameoAvatar(portrait), false);
  assert.equal(isCameoAvatar('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22x%22%3E'), false);
});

for (const hostKind of ['native', 'luker']) test(`${hostKind}: opening fills old eligible portraits in one save and subsequent opens keep the same images`, async () => {
  const original = { contacts: [
    { id: 'old', name: '旧联系人' },
    { id: 'qqj', name: '千千结人物', source: { kind: 'qqj', entityId: 'entity' } },
    { id: 'cleared', name: '手动清空', avatar: '', manualFields: ['avatar'] },
    { id: 'legacy', name: '旧人工资料', edited: true },
    { id: 'manual', name: '手工图片', avatar: portrait },
  ], groups: [{ id: 'group', name: '原群聊', memberIds: ['old', 'qqj'] }], conversations: {}, forum: { posts: [] },
  social: { posts: [{ id: 'post', authorId: 'npc', text: '保留动态。' }], feedIds: ['post'], npcs: [
    { id: 'npc', name: '旧路人' },
    { id: 'npc-cleared', name: '人工清空', avatar: '', manualFields: ['avatar'] },
    { id: 'npc-legacy', name: '旧人工资料', edited: true },
    { id: 'npc-manual', name: '手工图片', avatar: portrait },
  ] } };
  const h = createHarness({ hostKind, metadata: { foreign: 'keep', pocketPhone: original } }), store = createPhoneStore({ target: h.host.captureChat() });
  assert.equal(store.read().contacts[0].avatar, undefined, 'ordinary reads do not generate or save');
  assert.equal(h.metadataSaves, 0);
  await store.fillMissingAvatars();
  const saved = store.read(), fixed = saved.contacts[0].avatar;
  assert.match(fixed, /^data:image\/svg\+xml;/);
  assert.match(saved.contacts[1].avatar, /^data:image\/svg\+xml;/);
  assert.deepEqual(saved.contacts.slice(2), original.contacts.slice(2), 'manual clearing, legacy ownership and explicit images remain intact');
  assert.match(saved.social.npcs[0].avatar, /^data:image\/svg\+xml;/);
  assert.deepEqual(saved.social.npcs.slice(1), original.social.npcs.slice(1), 'NPC images use the same manual ownership rules');
  assert.equal(saved.social.posts, original.social.posts);
  assert.equal(saved.social.feedIds, original.social.feedIds);
  assert.equal(saved.groups, original.groups);
  assert.equal(h.metadataSaves, 1, 'all eligible portraits are persisted together');
  assert.equal(h.persistedMetadata.foreign, 'keep');
  assert.equal(readContactAvatars(saved.contacts, { getPeopleSnapshot: () => ({ status: 'ready', people: { items: [] } }), getPeopleAvatars: () => ({ status: 'ready', avatarsByEntityId: { entity: portrait } }) })[1].avatar, portrait);
  assert.equal(saved.contacts[0].avatar, fixed);
  await store.fillMissingAvatars();
  assert.equal(store.read(), saved);
  assert.equal(h.metadataSaves, 1, 'reopening neither regenerates nor writes');
  assert.equal(h.modelRequests.length, 0);
});

test('only opening a new preset with eligible empty portraits materializes defaults; protected old presets remain read-only', async () => {
  for (const legacy of [false, true]) {
    const h = createHarness();
    const imported = stateFromPreset({ schemaVersion: 1, contacts: [{ id: 'card:one', name: '随卡朋友', ...(legacy ? {} : { manualFields: [] }) }], groups: [] });
    const store = createPhoneStore({ target: h.host.captureChat(), initialState: imported });
    assert.equal(store.read().contacts[0].avatar, undefined);
    assert.equal(h.metadataSaves, 0);
    await store.fillMissingAvatars();
    assert.equal(h.metadataSaves, legacy ? 0 : 1);
    if (legacy) assert.equal(store.read(), imported);
    else assert.match(h.persistedMetadata.pocketPhone.contacts[0].avatar, /^data:image\/svg\+xml;/);
    assert.equal(imported.contacts[0].avatar, undefined, 'author defaults are never mutated');
  }
});

test('an old NPC-only archive fills its portrait once without altering posts or creating contacts', async () => {
  const original = { contacts: [], conversations: {}, forum: { posts: [] }, social: { npcs: [{ id: 'npc', name: '路人' }], posts: [{ id: 'p', authorId: 'npc', text: '原动态。' }], feedIds: ['p'] } };
  const h = createHarness({ metadata: { pocketPhone: original } }), store = createPhoneStore({ target: h.host.captureChat() });
  await store.fillMissingAvatars();
  const saved = store.read();
  assert.match(saved.social.npcs[0].avatar, /^data:image\/svg\+xml;/);
  assert.equal(saved.contacts, original.contacts);
  assert.equal(saved.social.posts, original.social.posts);
  assert.equal(h.metadataSaves, 1);
  await store.fillMissingAvatars();
  assert.equal(store.read(), saved);
  assert.equal(h.metadataSaves, 1);
  assert.equal(h.modelRequests.length, 0);
});

test('a portrait save failure leaves the original profile intact and propagates the real failure', async () => {
  const h = createHarness({ metadata: { pocketPhone: { contacts: [{ id: 'old', name: '旧朋友' }], conversations: {}, forum: { posts: [] } } } });
  const store = createPhoneStore({ target: h.host.captureChat() }), original = store.read();
  h.saveFailure = new Error('保存失败');
  await assert.rejects(store.fillMissingAvatars(), /保存失败/);
  assert.equal(store.read(), original);
  assert.equal(h.metadataSaves, 0);
});

test('avatarSource supports SillyTavern relative avatar paths', () => {
  assert.equal(avatarSource('/User Avatars/persona.png'), '/User Avatars/persona.png');
  assert.equal(avatarSource('User Avatars/persona.png'), '/User Avatars/persona.png');
  assert.equal(avatarSource('/characters/card.png'), '/characters/card.png');
  assert.equal(avatarSource('characters/card.png'), '/characters/card.png');
  assert.equal(avatarSource('/thumbnail?type=persona&file=foo.png'), '/thumbnail?type=persona&file=foo.png');
  assert.equal(avatarSource('https://example.com/avatar.jpg'), 'https://example.com/avatar.jpg');
  assert.equal(avatarSource('invalid-file'), '');
});
