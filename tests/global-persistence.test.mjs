import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';

test('global prompts persistence: custom prompt, preset and active selection created in Chat 1 persist in new Chat 2', async () => {
  const h = createHarness();
  
  // Chat 1 with Character A
  const target1 = h.host.captureChat();
  target1.id = 'chat_1';
  target1.metadata = { pocketPhone: { schemaVersion: 1 } };
  const store1 = createPhoneStore({ target: target1, host: h.host });

  // 1. Save custom prompt library entry in Chat 1
  await store1.savePrompt('forum', '【全局论坛提示词内容】');
  assert.equal(store1.read().prompts?.forum, '【全局论坛提示词内容】');

  // 2. Create custom prompt preset in Chat 1
  await store1.createPromptPreset({ name: '全局跑团预设', storyLayers: 5 });
  const customPreset = store1.read().promptPresets.find(p => p.name === '全局跑团预设');
  assert.ok(customPreset);
  assert.equal(store1.read().activePresetId, customPreset.id);

  // 3. Edit entry in custom preset
  await store1.addPresetEntry(customPreset.id, { name: '跑团规则', content: '必须遵守跑团守则。' });
  const entryCount = store1.read().promptPresets.find(p => p.id === customPreset.id).entries.length;

  // Now create a completely fresh Chat 2 (new chat, clean metadata, target.metadata = {})
  const target2 = h.host.captureChat();
  target2.id = 'chat_2';
  target2.metadata = {};
  const store2 = createPhoneStore({ target: target2, host: h.host });

  const state2 = store2.read();
  // Chat 2 must see the custom prompt!
  assert.equal(state2.prompts?.forum, '【全局论坛提示词内容】');

  // Chat 2 must see the custom prompt preset and active preset ID!
  const presetInChat2 = state2.promptPresets.find(p => p.id === customPreset.id);
  assert.ok(presetInChat2);
  assert.equal(presetInChat2.name, '全局跑团预设');
  assert.equal(presetInChat2.entries.length, entryCount);
  assert.equal(state2.activePresetId, customPreset.id);

  // 4. Modifying in Chat 2 also affects Chat 1 on reload
  await store2.savePrompt('messages', '【更新私聊提示词】');
  const store1Reloaded = createPhoneStore({ target: target1, host: h.host });
  assert.equal(store1Reloaded.read().prompts?.messages, '【更新私聊提示词】');
});

test('global calendar presets: custom calendar preset created in Chat 1 is switchable and persistent in Chat 2', async () => {
  const h = createHarness();

  // Chat 1
  const target1 = h.host.captureChat();
  target1.id = 'chat_1';
  target1.metadata = { pocketPhone: { schemaVersion: 1 } };
  const store1 = createPhoneStore({ target: target1, host: h.host });

  // 1. Create a custom calendar preset in Chat 1
  await store1.createCustomCalendar({
    title: '星际银河历',
    era: '新纪元',
    currentYear: 3050,
    months: [{ name: '晨曦月', days: 45 }, { name: '深渊月', days: 45 }],
    presetName: '银河联邦标准历',
  });

  const state1 = store1.read();
  assert.ok(state1.calendar?.customPresets?.some(p => p.name === '银河联邦标准历'));
  const galaxyPreset = state1.calendar.customPresets.find(p => p.name === '银河联邦标准历');
  assert.ok(galaxyPreset);

  // 2. Open fresh Chat 2 with another character (target.metadata = {})
  const target2 = h.host.captureChat();
  target2.id = 'chat_2';
  target2.character = { name: '艾莉丝', avatar: 'alice.png' };
  target2.metadata = {};
  const store2 = createPhoneStore({ target: target2, host: h.host });

  // Chat 2 can see the custom calendar preset created in Chat 1!
  const state2 = store2.read();
  assert.ok(state2.calendar?.customPresets?.some(p => p.name === '银河联邦标准历'));

  // Chat 2 can switch to this custom preset with one click!
  await store2.applyCustomCalendarPreset(galaxyPreset.id);
  const state2Applied = store2.read();
  assert.equal(state2Applied.calendar.descriptor.title, '星际银河历');
  assert.equal(state2Applied.calendar.descriptor.era, '新纪元');
  assert.equal(state2Applied.calendar.descriptor.months.length, 2);

  // 3. Delete custom preset in Chat 2
  await store2.deleteCustomCalendarPreset(galaxyPreset.id);
  assert.ok(!store2.read().calendar?.customPresets?.some(p => p.id === galaxyPreset.id));

  // Chat 1 also no longer has the deleted preset
  const store1Reloaded = createPhoneStore({ target: target1, host: h.host });
  assert.ok(!store1Reloaded.read().calendar?.customPresets?.some(p => p.id === galaxyPreset.id));
});

test('character calendar binding: chosen calendar binds to character; fresh chat with same character inherits it, different character gets default', async () => {
  const h = createHarness();

  // Character Lin (林舟) in Chat 1
  const targetLin1 = h.host.captureChat();
  targetLin1.id = 'chat_lin_1';
  targetLin1.character = { name: '林舟', avatar: 'linzhou.png' };
  targetLin1.metadata = { pocketPhone: { schemaVersion: 1 } };
  const storeLin1 = createPhoneStore({ target: targetLin1, host: h.host });

  // Initially Lin has no bound calendar
  assert.equal(targetLin1.metadata.pocketPhone.calendar, undefined);

  // Lin chooses Japan calendar preset
  await storeLin1.applyCalendarPreset({ countryId: 'JP' });
  assert.equal(storeLin1.read().calendar.descriptor.country, 'JP');
  assert.equal(storeLin1.read().calendar.descriptor.era, '令和');

  // Now user creates a brand new Chat 2 with the SAME character Lin (empty metadata)
  const targetLin2 = h.host.captureChat();
  targetLin2.id = 'chat_lin_2';
  targetLin2.character = { name: '林舟', avatar: 'linzhou.png' };
  targetLin2.metadata = {}; // fresh chat!
  const storeLin2 = createPhoneStore({ target: targetLin2, host: h.host });

  // Lin's new chat automatically inherits Japan calendar!
  const lin2State = storeLin2.read();
  assert.ok(lin2State.calendar);
  assert.equal(lin2State.calendar.descriptor.country, 'JP');
  assert.equal(lin2State.calendar.descriptor.era, '令和');
  assert.ok(lin2State.calendar.items.some(it => it.name === '成人の日'));

  // User opens chat with a DIFFERENT character Bob
  const targetBob = h.host.captureChat();
  targetBob.id = 'chat_bob_1';
  targetBob.character = { name: '鲍勃', avatar: 'bob.png' };
  targetBob.metadata = {};
  const storeBob = createPhoneStore({ target: targetBob, host: h.host });

  // Bob has NOT set a calendar, so Bob does not get Lin's Japan calendar
  assert.equal(storeBob.read().calendar?.descriptor?.country, undefined);

  // Bob chooses China calendar preset
  await storeBob.applyCalendarPreset({ countryId: 'CN' });
  assert.equal(storeBob.read().calendar.descriptor.country, 'CN');

  // Lin's calendar is still Japan
  const storeLinReloaded = createPhoneStore({ target: targetLin1, host: h.host });
  assert.equal(storeLinReloaded.read().calendar.descriptor.country, 'JP');
});
