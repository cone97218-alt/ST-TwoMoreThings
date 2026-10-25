import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter } from '../src/host.js';
import {
  sortWorldInfoEntriesLikeST,
  isWorldInfoEntryExcluded,
  readBaiBaiExcludeSettings,
  saveBaiBaiExcludeSettings,
  SHARED_EXCLUDES_KEY,
  SHARED_EXCLUDES_EVENT,
  WI_POSITION_BEFORE,
  WI_POSITION_AFTER,
  WI_POSITION_AN_TOP,
  WI_POSITION_AT_DEPTH,
} from '../src/worldbook.js';

test('blue constants, green primary/secondary rules, regex and disabled entries use captured chat sources', async () => {
  const ctx = { chatId: 'test', chat: [], chatMetadata: { world_info: '当前世界' }, name1: '小满', characters: [{ name: '林舟' }], characterId: 0 };
  const entries = {
    0: { constant: true, content: '蓝灯背景' },
    1: { key: ['书店'], content: '命中绿灯' },
    2: { key: ['咖啡馆'], content: '不应出现' },
    3: { constant: true, disable: true, content: '禁用不应出现' },
    4: { key: ['书店'], selective: true, keysecondary: ['朋友'], selectiveLogic: 0, content: '次键命中' },
    5: { key: ['书店'], selective: true, keysecondary: ['朋友'], selectiveLogic: 2, content: '排除不应出现' },
    6: { key: ['/book\\s*shop/i'], content: '正则命中' },
  };
  const host = createHostAdapter({ contextProvider: () => ctx, worldInfoBindings: { getNames: () => ['当前世界'], load: async () => ({ entries }) } });
  const text = await host.captureChat().readWorldInfo({ scanText: '和朋友去书店 Book shop' });
  assert.ok(text.includes('蓝灯背景'));
  assert.ok(text.includes('命中绿灯'));
  assert.ok(text.includes('次键命中'));
  assert.ok(text.includes('正则命中'));
  assert.ok(!text.includes('不应出现'));
});

test('sortWorldInfoEntriesLikeST fixes inverted order bug and aligns with SillyTavern assembly pipeline', () => {
  const items = [
    { id: 'b', position: WI_POSITION_BEFORE, order: 100, comment: 'before-100' },
    { id: 'a', position: WI_POSITION_BEFORE, order: 10, comment: 'before-10' },
    { id: 'd', position: WI_POSITION_AFTER, order: 20, comment: 'after-20' },
    { id: 'c', position: WI_POSITION_AFTER, order: 5, comment: 'after-5' },
    { id: 'e', position: WI_POSITION_AN_TOP, order: 50, comment: 'antop' },
    { id: 'g', position: WI_POSITION_AT_DEPTH, depth: 2, order: 10, comment: 'depth-2' },
    { id: 'f', position: WI_POSITION_AT_DEPTH, depth: 6, order: 10, comment: 'depth-6' },
  ];

  const sorted = sortWorldInfoEntriesLikeST(items);
  // 1. position before (0) -> after (1) -> ANTop (2) -> atDepth (4)
  // 2. before bucket: order 10 before order 100 (fixing inverted order)
  assert.equal(sorted[0].id, 'a');
  assert.equal(sorted[1].id, 'b');
  // 3. after bucket: order 5 before order 20
  assert.equal(sorted[2].id, 'c');
  assert.equal(sorted[3].id, 'd');
  // 4. ANTop bucket
  assert.equal(sorted[4].id, 'e');
  // 5. atDepth bucket: higher depth first (depth 6 before depth 2)
  assert.equal(sorted[5].id, 'f');
  assert.equal(sorted[6].id, 'g');
});

test('isWorldInfoEntryExcluded filters whole worldbooks and entries matching comment patterns', () => {
  const excludes = {
    excludedWorldNames: ['黑名单世界书', '另一本世界书'],
    excludedWorldInfoPatterns: ['\\[mvu[\\s\\S]*?\\]', '^系统', '附加'],
  };

  // 整本排除
  assert.equal(isWorldInfoEntryExcluded({ world: '黑名单世界书', comment: '普通条目' }, excludes), true);
  assert.equal(isWorldInfoEntryExcluded({ world: '白名单世界书', comment: '普通条目' }, excludes), false);

  // 默认 MVU 机制条目排除
  assert.equal(isWorldInfoEntryExcluded({ world: '白名单世界书', comment: '[mvu:state_handler]' }, excludes), true);
  assert.equal(isWorldInfoEntryExcluded({ world: '白名单世界书', comment: '[MVU:system_rule]' }, excludes), true);

  // 正则匹配排除
  assert.equal(isWorldInfoEntryExcluded({ world: '白名单世界书', comment: '系统日志条目' }, excludes), true);

  // 普通文本包含匹配排除
  assert.equal(isWorldInfoEntryExcluded({ world: '白名单世界书', comment: '角色的附加设定' }, excludes), true);

  // 正常未命中条目
  assert.equal(isWorldInfoEntryExcluded({ world: '白名单世界书', comment: '人物外貌设定' }, excludes), false);
});

test('readBaiBaiExcludeSettings & saveBaiBaiExcludeSettings read and sync with shared key and ST-BaiBai-Book', () => {
  const storage = {};
  const defaults = readBaiBaiExcludeSettings(() => storage);
  assert.deepEqual(defaults.excludedWorldNames, []);
  assert.deepEqual(defaults.excludedWorldInfoPatterns, ['\\[mvu[\\s\\S]*?\\]']);
  assert.equal(defaults.renderWorldInfoTemplates, true);

  saveBaiBaiExcludeSettings(storage, {
    excludedWorldNames: ['测试世界书'],
    excludedWorldInfoPatterns: ['\\[mvu[\\s\\S]*?\\]', '过滤项'],
    renderWorldInfoTemplates: false,
  }, false);

  const updated = readBaiBaiExcludeSettings(() => storage);
  assert.deepEqual(updated.excludedWorldNames, ['测试世界书']);
  assert.deepEqual(updated.excludedWorldInfoPatterns, ['\\[mvu[\\s\\S]*?\\]', '过滤项']);
  assert.equal(updated.renderWorldInfoTemplates, false);
});

test('host.readWorldInfo integrates whole book exclusions, entry filtering, and ascending order', async () => {
  const ctx = {
    chatId: 'test',
    chat: [],
    chatMetadata: { world_info: ['白名单世界', '已排除世界'] },
    name1: '小满',
    characters: [{ name: '林舟' }],
    characterId: 0,
    extensionSettings: {
      [SHARED_EXCLUDES_KEY]: {
        excludedWorldNames: ['已排除世界'],
        excludedWorldInfoPatterns: ['\\[mvu[\\s\\S]*?\\]'],
        renderWorldInfoTemplates: true,
      },
    },
  };

  const whiteEntries = {
    0: { constant: true, order: 200, comment: '条目后', content: '【后出现内容】' },
    1: { constant: true, order: 50, comment: '条目前', content: '【先出现内容】' },
    2: { constant: true, order: 10, comment: '[mvu:mech]', content: '【机制条目不应出现】' },
  };
  const blackEntries = {
    0: { constant: true, order: 1, comment: '排除书条目', content: '【排除世界书不应出现】' },
  };

  const host = createHostAdapter({
    contextProvider: () => ctx,
    worldInfoBindings: {
      getNames: () => ['白名单世界', '已排除世界'],
      load: async name => name === '白名单世界' ? { entries: whiteEntries } : { entries: blackEntries },
    },
  });

  const text = await host.captureChat().readWorldInfo();
  // 1. 验证已排除的世界书内容不出现
  assert.ok(!text.includes('【排除世界书不应出现】'));
  // 2. 验证命中排除正则的条目不出现
  assert.ok(!text.includes('【机制条目不应出现】'));
  // 3. 验证保留的条目出现
  assert.ok(text.includes('【先出现内容】'));
  assert.ok(text.includes('【后出现内容】'));
  // 4. 验证装配顺序：order 50 在 order 200 之前（升序，修复此前颠倒问题）
  const idxFirst = text.indexOf('【先出现内容】');
  const idxSecond = text.indexOf('【后出现内容】');
  assert.ok(idxFirst < idxSecond, `先出现内容索引 (${idxFirst}) 应小于后出现内容索引 (${idxSecond})`);
});
