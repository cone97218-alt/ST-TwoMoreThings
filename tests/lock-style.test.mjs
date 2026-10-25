import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createAuthoringService, stateFromPreset } from '../src/authoring.js';
import { homeImage } from '../src/ui/home.js';
import { wallpaperPresets } from '../src/backgrounds.js';

for (const style of ['stacked', 'rounded']) for (const hostKind of ['native', 'luker']) test(`${hostKind}: selecting ${style} preserves authored data and uploaded backgrounds`, async () => {
  const h = createHarness({ hostKind, metadata: { foreign: 'keep' } }), target = h.host.captureChat();
  const store = createPhoneStore({ target });
  await store.saveContact('', { name: '林舟', expression: '简短自然' });
  await store.setWallpaper('day', '/user/images/custom.webp');
  const before = structuredClone(store.read());
  await store.setLockStyle(style);
  assert.deepEqual(store.read(), { ...before, lockStyle: style });
  assert.equal(createPhoneStore({ target }).read().lockStyle, style);
  assert.equal(h.persistedMetadata.foreign, 'keep');
  assert.equal(homeImage(store.read()).src, '/user/images/custom.webp');
  h.saveFailure = new Error('offline');
  await assert.rejects(store.setLockStyle('classic'), /保存/);
  assert.equal(store.read().lockStyle, style);
});

test('stacked day/night defaults use the accepted glass art while legacy defaults remain intact', () => {
  assert.equal(homeImage({ lockStyle: 'stacked', theme: 'day' }).src, wallpaperPresets[0].day);
  assert.equal(homeImage({ lockStyle: 'stacked', theme: 'night' }).src, wallpaperPresets[0].night);
  assert.ok(homeImage({}).src.endsWith('/assets/echo-foreground.png'));
  assert.ok(homeImage({ theme: 'night' }).src.endsWith('/assets/night-fold-foreground.png'));
});

test('rounded defaults select the matching flower artwork and retain an explicitly chosen background', () => {
  assert.ok(homeImage({ lockStyle: 'rounded', theme: 'day' }).src.endsWith('/assets/lock-petals-day.png'));
  assert.ok(homeImage({ lockStyle: 'rounded', theme: 'night' }).src.endsWith('/assets/lock-petals-night.png'));
  assert.equal(homeImage({ lockStyle: 'rounded', theme: 'night', wallpapers: { night: '/custom.webp' } }).src, '/custom.webp');
});

for (const style of ['stacked', 'rounded']) test(`${style} is included in author exports and only initializes new archives`, async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.setLockStyle(style);
  const { script } = await createAuthoringService({ store, host: h.host }).exportScript();
  assert.equal(script.data.twoMoreThings.lockStyle, style);
  const preset = stateFromPreset(script.data.twoMoreThings);
  assert.equal(preset.lockStyle, style);
  const reader = createHarness(), target = reader.host.captureChat();
  const imported = createPhoneStore({ target, initialState: preset });
  assert.equal(imported.read().lockStyle, style);
  assert.equal(reader.metadataSaves, 0);
  await imported.setLockStyle('classic');
  assert.equal(createPhoneStore({ target, initialState: preset }).read().lockStyle, 'classic');
});


for (const hostKind of ['native', 'luker']) test(`${hostKind}: toggling lockScreenEnabled updates state and preserves other settings`, async () => {
  const h = createHarness({ hostKind, metadata: { foreign: 'keep' } }), target = h.host.captureChat();
  const store = createPhoneStore({ target });
  assert.equal(store.read().lockScreenEnabled !== false, true);
  await store.setLockScreenEnabled(false);
  assert.equal(store.read().lockScreenEnabled, false);
  assert.equal(createPhoneStore({ target }).read().lockScreenEnabled, false);
  assert.equal(h.persistedMetadata.foreign, 'keep');
  await store.setLockScreenEnabled(true);
  assert.equal(store.read().lockScreenEnabled, true);
  h.saveFailure = new Error('offline');
  await assert.rejects(store.setLockScreenEnabled(false), /保存/);
  assert.equal(store.read().lockScreenEnabled, true);
});

test('lockScreenEnabled false is included in author exports and initializes new archives', async () => {
  const h = createHarness(), store = createPhoneStore({ target: h.host.captureChat() });
  await store.setLockScreenEnabled(false);
  const { script } = await createAuthoringService({ store, host: h.host }).exportScript();
  assert.equal(script.data.twoMoreThings.lockScreenEnabled, false);
  const preset = stateFromPreset(script.data.twoMoreThings);
  assert.equal(preset.lockScreenEnabled, false);
  const reader = createHarness(), target = reader.host.captureChat();
  const imported = createPhoneStore({ target, initialState: preset });
  assert.equal(imported.read().lockScreenEnabled, false);
  await imported.setLockScreenEnabled(true);
  assert.equal(createPhoneStore({ target, initialState: preset }).read().lockScreenEnabled, true);
});
