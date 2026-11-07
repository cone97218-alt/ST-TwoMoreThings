import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  readBaiBaiBookMapSnapshot,
  readInlineMessageLocation,
  resolveBasemapId,
  resolveMapAssetId,
  buildMapProjection,
  formatMapContextPrompt,
  QIANCHUANG_MAP_ASSETS,
  selectQianchuangMapAsset,
  CITY_MAPS,
  cityMapForPlace,
  citySchematicLayout,
  QIANCHUANG_MAP_REGIONS,
  QIANCHUANG_MAP_ANCHORS,
  qianchuangMapLayout,
  qianchuangFacilityTags,
  qianchuangIcon,
  LUCIDE_ICONS,
  indexQianchuangWorldInfo,
  projectQianchuangWorldInfo,
  inferPlaceRole,
  inferDirectionalQuadrant,
} from '../src/map-engine.js';
import { createMapAiService } from '../src/map-ai.js';
import { renderMap } from '../src/ui/map.js';
import { createPhoneStore } from '../src/store.js';
import { createBackflowService } from '../src/context.js';
import { compilePromptPreset, getActivePreset } from '../src/preset-engine.js';
import { createHarness } from './harness.mjs';

test('map-engine: reads STBaiBaiBook snapshot and merges scenes, NPCs, items, and todos', () => {
  const mockRoot = {
    STBaiBaiBook: {
      getSnapshot() {
        return {
          state: {
            time: '天宝三年四月初五 申时',
            location: '二楼雅间',
            locationPath: ['长安城', '西市坊', '归雁酒楼', '二楼雅间'],
          },
          scenes: [
            { id: 's1', name: '长安城', path: ['长安城'], parentId: '' },
            { id: 's2', name: '西市坊', path: ['长安城', '西市坊'], parentId: 's1', desc: '胡商云集的繁华坊市' },
            { id: 's3', name: '归雁酒楼', path: ['长安城', '西市坊', '归雁酒楼'], parentId: 's2', desc: '西市有名的三层酒楼' },
            { id: 's4', name: '二楼雅间', path: ['长安城', '西市坊', '归雁酒楼', '二楼雅间'], parentId: 's3', desc: '凭栏可眺望街景' },
            { id: 's5', name: '东市坊', path: ['长安城', '东市坊'], parentId: 's1', desc: '达官显贵聚集之地' },
            { id: 's6', name: '珍宝阁', path: ['长安城', '东市坊', '珍宝阁'], parentId: 's5', desc: '奇珍异宝商行' },
          ],
          npcs: [
            { id: 'n1', name: '苏映雪', title: '剑客', relation: '同伴', follow: true },
            { id: 'n2', name: '胡商阿罗憾', title: '掌柜', relation: '熟识', follow: false, location: '珍宝阁' },
          ],
          items: [
            { id: 'i1', name: '乌木剑匣', desc: '寄存的旧剑匣', carried: false, location: '归雁酒楼' },
          ],
        };
      },
    },
  };

  const snap = readBaiBaiBookMapSnapshot(mockRoot);
  assert.ok(snap);
  assert.equal(snap.location, '二楼雅间');
  assert.deepEqual(snap.locationPath, ['长安城', '西市坊', '归雁酒楼', '二楼雅间']);

  const state = {
    map: { basemap: 'auto', currentLocation: '', items: [], deletedIds: [] },
    todos: [
      { id: 't1', title: '去珍宝阁取鉴定好的玉佩', done: false },
    ],
  };

  const proj = buildMapProjection({ state, baibaiSnapshot: snap });
  assert.equal(proj.baibaiConnected, true);
  // 含“城、坊、酒楼、阁”，应自动匹配古风城镇 old-town 底图
  assert.equal(proj.basemapId, 'old-town');

  // 主角在“二楼雅间”（interior），地图图钉应定位到所属建筑“归雁酒楼”（site）
  assert.equal(proj.userPosition.label, '二楼雅间');
  assert.equal(proj.userPosition.placeId, 'baibai:s4');
  assert.equal(proj.userPosition.pinPlaceId, 'baibai:s3');

  // 验证西市坊与东市坊两个分区布局在长安城下（当进入长安城或顶层展开时）
  const drilled = buildMapProjection({ state, baibaiSnapshot: snap, scopePlaceId: 'baibai:s1' });
  assert.equal(drilled.layoutGroups.length, 2);
  const westGroup = drilled.layoutGroups.find(g => g.area?.name === '西市坊');
  const eastGroup = drilled.layoutGroups.find(g => g.area?.name === '东市坊');
  assert.ok(westGroup);
  assert.ok(eastGroup);

  const innSite = westGroup.sites.find(s => s.name === '归雁酒楼');
  assert.ok(innSite);
  assert.equal(innSite.isCurrent, true);
  assert.equal(typeof innSite.x, 'number');
  assert.equal(typeof innSite.y, 'number');
  // 同行 NPC 苏映雪冒泡展示在归雁酒楼，乌木剑匣存放在归雁酒楼
  assert.ok(innSite.npcs.some(n => n.name === '苏映雪' && n.follow));
  assert.ok(innSite.items.some(i => i.name === '乌木剑匣'));
  assert.equal(innSite.interiors.length, 1);
  assert.equal(innSite.interiors[0].name, '二楼雅间');

  const treasureSite = eastGroup.sites.find(s => s.name === '珍宝阁');
  assert.ok(treasureSite);
  assert.ok(treasureSite.npcs.some(n => n.name === '胡商阿罗憾'));
  assert.ok(treasureSite.todos.some(t => t.title.includes('珍宝阁')));

  // 验证提示词格式化
  const promptText = formatMapContextPrompt(drilled);
  assert.ok(promptText.includes('当前所在地：长安城 > 西市坊 > 归雁酒楼 > 二楼雅间'));
  assert.ok(promptText.includes('当前场景环境：凭栏可眺望街景'));
});

test('map-engine: extracts inline <top_format> location when STBaiBaiBook is absent', () => {
  const messages = [
    { is_user: false, mes: '<top_format>\n✧2026年05月01日 星期五 15:30|新海市/中央商务区/星辉大厦|多云✧\n</top_format>\n电梯缓缓上升。' },
  ];
  const inline = readInlineMessageLocation(messages);
  assert.ok(inline);
  assert.equal(inline.location, '星辉大厦');
  assert.deepEqual(inline.locationPath, ['新海市', '中央商务区', '星辉大厦']);

  const proj = buildMapProjection({ state: {}, baibaiSnapshot: null, messages });
  assert.equal(proj.userPosition.label, '星辉大厦');
  assert.equal(proj.basemapId, 'modern');
  assert.equal(proj.places.length, 3);
});

test('store & AI: saveMapPlace, deleteMapPlace, saveMapFromAi, preset macro and backflow injection', async () => {
  const h = createHarness({
    messages: [
      { is_user: false, mes: '✧2026年05月01日 星期五 09:00|王都/城西区/冒险者公会|晴✧\n清晨的公会十分热闹。' },
    ],
  });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target, host: h.host });

  await store.saveMapPlace({
    id: 'place:west',
    name: '城西区',
    role: 'area',
    desc: '平民与冒险者聚集的街区',
  });
  await store.saveMapPlace({
    id: 'place:guild',
    name: '冒险者公会',
    parentId: 'place:west',
    role: 'site',
    desc: '发布委托与小队集结的大厅',
    facilities: ['办公', '餐饮'],
    relations: [{ targetName: '铁匠铺', type: '邻近', note: '街对面' }],
  });

  // 测试 AI 整理并合并
  const mapAi = createMapAiService({
    contextReader: {
      async readDirectorySources() {
        return { worldbook: '王都有城西区和城东区', story: [], storyMemory: '' };
      },
    },
    modelClient: {
      async complete() {
        return JSON.stringify({
          basemap: 'old-town',
          currentLocation: '冒险者公会',
          places: [
            { name: '城西区', role: 'area', desc: '冒险者街区' },
            { name: '矮人铁匠铺', parentName: '城西区', role: 'site', desc: '打造武器的工坊', facilities: ['购物'] },
          ],
        });
      },
    },
    target,
    store,
  });

  const aiResult = await mapAi.organizeMap({ instruction: '补充城西区的店铺' });
  assert.equal(aiResult.basemap, 'old-town');
  assert.equal(aiResult.places.length, 2);

  await store.saveMapFromAi(aiResult, { mode: 'merge' });
  const stateAfterAi = store.read();
  assert.equal(stateAfterAi.map.basemap, 'old-town');
  const smithy = stateAfterAi.map.items.find(it => it.name === '矮人铁匠铺');
  assert.ok(smithy);
  assert.equal(smithy.parentId, 'place:west');

  // 验证预设宏 {{map_prompt}} 注入
  const proj = buildMapProjection({ state: stateAfterAi, messages: target.messages });
  const mapPromptText = formatMapContextPrompt(proj);
  const preset = getActivePreset(stateAfterAi);
  const compiled = compilePromptPreset(preset, {
    phoneContext: { mapPrompt: mapPromptText },
  }, 'chat', stateAfterAi);
  const fullSystemText = compiled.map(m => m.content).join('\n\n');
  assert.ok(fullSystemText.includes('[地图与位置线索：'));
  assert.ok(fullSystemText.includes('冒险者公会'));
  assert.ok(fullSystemText.includes('矮人铁匠铺'));

  // 验证正文回流 (Backflow) 独立开关
  await store.setInjectMapEnabled(true);
  const backflow = createBackflowService({
    target,
    store,
    modelClient: { async complete() { return '{"summary":""}'; } },
    isEnabled: () => true,
  });
  const backflowOut = await backflow.prepare('normal');
  assert.ok(backflowOut.includes('[地图与位置线索：'));
  assert.ok(backflowOut.includes('冒险者公会'));

  // 验证 UI 渲染包含 SVG 底图、分区标题、锚点与目录卡片
  const html = renderMap(stateAfterAi, { ui: { mapSearch: '' }, mapProjection: proj, busy: new Set() });
  assert.ok(html.includes('qc-basemap-svg'));
  assert.ok(html.includes('冒险者公会'));
  assert.ok(html.includes('矮人铁匠铺'));
});

test('qianchuang full port: 21 library map assets + 6 theme families + 10 real cities, pre-baked contours/anchors, 177 facilities, Lucide icons, and worldbook indexer', async () => {
  // 1. 验证 21 款高精几何底图库与自动选择器
  const assetList = Object.values(QIANCHUANG_MAP_ASSETS);
  assert.equal(assetList.length, 21);
  for (const asset of assetList) {
    assert.ok(QIANCHUANG_MAP_REGIONS[asset.id] || asset.regions, `Missing region contours for ${asset.id}`);
    assert.ok(QIANCHUANG_MAP_ANCHORS[asset.id] || asset.anchors, `Missing anchor slots for ${asset.id}`);
  }
  const coastalAssetId = selectQianchuangMapAsset({ entityId: 'test-seed', style: 'old-town', layout: 'coast' });
  assert.equal(coastalAssetId, 'old-town-coast');

  // 2. 验证 10 座真实世界城市底图识别与示意分区布局
  assert.equal(Object.keys(CITY_MAPS).length, 10);
  const shanghaiMatch = cityMapForPlace({ displayName: '上海市', aliases: ['魔都'] });
  assert.equal(shanghaiMatch?.id, 'shanghai');
  const tokyoMatch = cityMapForPlace({ displayName: '东京', aliases: ['Tokyo'] });
  assert.equal(tokyoMatch?.id, 'tokyo');
  const cityLayout = citySchematicLayout('shanghai', [
    { entityId: 'a1', siteIds: ['p1'] },
    { entityId: 'a2', siteIds: ['p2'] },
  ]);
  assert.equal(cityLayout.length, 2);
  assert.equal(cityLayout[0].points.length, 1);
  assert.ok(cityLayout[0].labelBox);

  // 3. 验证 177 类中文设施词典（含否定句过滤）与 Lucide v1.17.0 矢量图标库
  assert.ok(Object.keys(LUCIDE_ICONS).length >= 1700);
  const tags = qianchuangFacilityTags(
    [{ text: '一楼设有吧台与马厩，二楼有卧室和独立卫浴，但没有厨房。', kind: 'stable' }],
    [{ text: '悦来客栈', kind: 'stable' }],
  );
  const tagLabels = tags.map(t => t.label);
  assert.ok(tagLabels.length > 0);
  assert.ok(!tagLabels.includes('厨房'), 'Negated facility "没有厨房" should be filtered out');
  const iconSvg = qianchuangIcon('bed-double');
  assert.ok(iconSvg.startsWith('<svg') && iconSvg.includes('</svg>'));

  // 4. 验证世界书物理地点索引器与投影器
  const wiRecords = indexQianchuangWorldInfo({
    candidates: [
      {
        id: 'wb-1',
        kind: 'worldbook',
        hostEnabled: true,
        comment: '临安城',
        primaryKeys: ['临安'],
        content: JSON.stringify({
          名称: '临安城',
          环境: '江南繁华都城，内有御街与西湖码头。',
          布局: '北接皇城，南邻西湖。',
        }),
      },
    ],
  });
  assert.equal(wiRecords.length, 1);
  assert.ok(wiRecords[0].names.includes('临安城'));
  const wiProjected = projectQianchuangWorldInfo(
    {
      places: [{ entityId: 'p1', displayName: '临安城', aliases: ['临安'] }],
      mapRootIds: ['p1'],
    },
    { index: wiRecords },
  );
  assert.equal(wiProjected.places[0].worldInfoDescriptions.length, 2);

  // 5. 验证静态 SVG 资产文件存在且完整
  const rootDir = path.resolve(import.meta.dirname, '..');
  assert.ok(fs.existsSync(path.join(rootDir, 'assets/maps-library/catalog.json')));
  assert.ok(fs.existsSync(path.join(rootDir, 'assets/maps-real/shanghai.svg')));
  assert.ok(fs.existsSync(path.join(rootDir, 'assets/maps-generic/modern-town.svg')));
});

test('map: default view auto-descends into a single city and keeps districts as separate regions; edit buttons only in edit mode', () => {
  const state = { map: { basemap: 'auto', currentLocation: '', items: [
    { id: 'c', name: '长安城', role: 'area', parentId: '' },
    { id: 'w', name: '西市坊', role: 'area', parentId: 'c' },
    { id: 'e', name: '东市坊', role: 'area', parentId: 'c' },
    { id: 'w1', name: '归雁酒楼', role: 'site', parentId: 'w' },
    { id: 'e1', name: '珍宝阁', role: 'site', parentId: 'e' },
  ], deletedIds: [] }, todos: [] };
  const proj = buildMapProjection({ state });
  assert.equal(proj.layoutGroups.length, 2);
  assert.deepEqual(proj.layoutGroups.map(g => g.area?.name).sort(), ['东市坊', '西市坊']);
  assert.equal(proj.layoutGroups.flatMap(g => g.sites).length, 2);
  const view = renderMap(state, { ui: { mapSearch: '', mapEditMode: false }, mapProjection: proj, busy: new Set() });
  assert.ok(!view.includes('data-action="edit-map-place"'));
  assert.ok(!view.includes('data-action="set-map-current"'));
  assert.ok(view.includes('data-action="toggle-map-edit-mode"'));
  const edit = renderMap(state, { ui: { mapSearch: '', mapEditMode: true }, mapProjection: proj, busy: new Set() });
  assert.ok(edit.includes('data-action="edit-map-place"'));
  assert.ok(edit.includes('data-action="delete-map-place"'));
});

test('map-engine: AI/custom places merge into the BaiBai hierarchy instead of duplicating or orphaning', () => {
  const baibai = { location: '西市坊', locationPath: ['长安城', '西市坊'], scenes: [
    { id: 's1', name: '长安城', path: ['长安城'], parentId: '' },
    { id: 's2', name: '西市坊', path: ['长安城', '西市坊'], parentId: 's1' },
  ], npcs: [], items: [] };
  const state = { map: { basemap: 'auto', currentLocation: '', deletedIds: [], items: [
    { id: 'ai:1', name: '西市坊', role: 'area', parentId: '', source: 'ai' },
    { id: 'ai:2', name: '悦来客栈', role: 'site', parentId: 'ai:1', source: 'ai' },
  ] } };
  const proj = buildMapProjection({ state, baibaiSnapshot: baibai });
  const west = proj.places.filter(p => p.name === '西市坊');
  assert.equal(west.length, 1);
  assert.equal(west[0].parentId, 'baibai:s1');
  const inn = proj.places.find(p => p.name === '悦来客栈');
  assert.equal(inn.parentId, west[0].id);
  assert.equal(proj.userPosition.placeId, west[0].id);
});

test('map-engine: basemap sticky binding and usedAssetIds prevent reuse and jumping', () => {
  const state = {
    map: {
      basemap: 'auto',
      currentLocation: '',
      items: [
        { id: 'c1', name: '临安城', role: 'area', mapLevel: 'city' },
        { id: 'c2', name: '建康城', role: 'area', mapLevel: 'city' },
        { id: 'p1', name: '西湖水榭', role: 'site', parentId: 'c1' },
        { id: 'p2', name: '玄武湖门', role: 'site', parentId: 'c2' },
      ],
      deletedIds: [],
      sheetAssets: {},
    },
  };
  const proj = buildMapProjection({ state });
  assert.ok(proj.sheets.length >= 2);
  assert.ok(proj.sheetAssets);
  const sheetKeys = Object.keys(proj.sheetAssets);
  assert.ok(sheetKeys.length >= 2);
  const asset1 = proj.sheetAssets[sheetKeys[0]];
  const asset2 = proj.sheetAssets[sheetKeys[1]];
  // 两张不同图幅避免随机到相同底图
  assert.notStrictEqual(asset1, asset2);

  // 再次投影时复用已有记忆
  const stateWithSticky = {
    map: {
      ...state.map,
      sheetAssets: { ...proj.sheetAssets },
    },
  };
  const proj2 = buildMapProjection({ state: stateWithSticky });
  assert.strictEqual(proj2.sheetAssets[sheetKeys[0]], asset1);
  assert.strictEqual(proj2.sheetAssets[sheetKeys[1]], asset2);
});

test('map-engine: label collision avoidance sets labelAbove and labelAlign correctly', () => {
  const state = {
    map: {
      basemap: 'modern',
      items: [
        { id: 's1', name: '中央大厦', role: 'site' },
        { id: 's2', name: '中心公园', role: 'site' },
      ],
    },
  };
  const proj = buildMapProjection({ state });
  const allSites = proj.layoutGroups.flatMap(g => g.sites || []);
  assert.ok(allSites.length >= 2);
  for (const s of allSites) {
    assert.ok(['start', 'center', 'end'].includes(s.labelAlign));
    assert.strictEqual(typeof s.labelAbove, 'boolean');
  }
});

test('map-engine: avatar pins cluster and spatial trajectory trail are generated', () => {
  const baibai = {
    location: '藏书阁',
    locationPath: ['藏经楼', '藏书阁'],
    scenes: [
      { id: 's1', name: '山门广场', path: ['山门广场'] },
      { id: 's2', name: '主殿走廊', path: ['主殿走廊'] },
      { id: 's3', name: '藏书阁', path: ['藏书阁'] },
    ],
    npcs: [
      { id: 'npc1', name: '白浅', location: '藏书阁', follow: true, relation: '师徒' },
      { id: 'npc2', name: '陆雪琪', location: '山门广场', follow: false, title: '守阁人' },
    ],
    items: [],
  };
  const state = {
    contacts: [
      { id: 'c1', name: '白浅', avatar: 'https://example.com/baiqian.png', tone: 'cyan' },
      { id: 'c2', name: '陆雪琪', avatar: 'https://example.com/luxueqi.png', tone: 'blue' },
    ],
    userProfile: { name: '张小凡', avatar: 'https://example.com/xiaofan.png' },
    map: {
      items: [
        { id: 'p1', name: '山门广场', role: 'site' },
        { id: 'p2', name: '主殿走廊', role: 'site' },
        { id: 'p3', name: '藏书阁', role: 'site' },
      ],
      trail: ['p1', 'p2', 'p3'],
    },
  };
  const proj = buildMapProjection({ state, baibaiSnapshot: baibai });
  const library = proj.layoutGroups.flatMap(g => g.sites || []).find(s => s.name === '藏书阁');
  assert.ok(library);
  assert.ok(library.charactersHere?.length >= 2);
  const userChar = library.charactersHere.find(c => c.isUser);
  assert.strictEqual(userChar.name, '张小凡');
  assert.strictEqual(userChar.avatar, 'https://example.com/xiaofan.png');
  const baiqian = library.charactersHere.find(c => c.name === '白浅');
  assert.strictEqual(baiqian.avatar, 'https://example.com/baiqian.png');
  assert.strictEqual(baiqian.role, '同行');

  // 移动轨迹
  assert.ok(Array.isArray(proj.trajectory));
  assert.ok(proj.trajectory.length >= 2);
  assert.strictEqual(proj.trajectory[0].name, '山门广场');
  assert.strictEqual(proj.trajectory[proj.trajectory.length - 1].name, '藏书阁');
});

test('map-engine: robust role & quadrant inference (anti-kitchen Area overflow)', () => {
  // 1. 验证微观室内词硬性拦截，绝不升格为 Area
  assert.strictEqual(inferPlaceRole('厨房', ['厨房']), 'interior');
  assert.strictEqual(inferPlaceRole('灶台前', ['厨房', '灶台前']), 'interior');
  assert.strictEqual(inferPlaceRole('主卧大床', ['主卧大床']), 'interior');
  assert.strictEqual(inferPlaceRole('洗手间', ['客房', '洗手间']), 'interior');

  // 2. 宏观大区/中区词推断为 Area
  assert.strictEqual(inferPlaceRole('长安城', ['长安城']), 'area');
  assert.strictEqual(inferPlaceRole('西市坊', ['长安城', '西市坊']), 'area');
  assert.strictEqual(inferPlaceRole('中央商务区', ['新海市', '中央商务区']), 'area');
  assert.strictEqual(inferPlaceRole('城北工业园', ['城北工业园']), 'area');

  // 3. 实体建筑推断为 Site
  assert.strictEqual(inferPlaceRole('归雁酒楼', ['长安城', '西市坊', '归雁酒楼']), 'site');
  assert.strictEqual(inferPlaceRole('冒险者公会', ['王都', '城西区', '冒险者公会']), 'site');

  // 4. 方位词准确提取
  assert.strictEqual(inferDirectionalQuadrant('西市坊'), 'west');
  assert.strictEqual(inferDirectionalQuadrant('东市坊'), 'east');
  assert.strictEqual(inferDirectionalQuadrant('城南码头'), 'south');
  assert.strictEqual(inferDirectionalQuadrant('城北猎场'), 'north');
  assert.strictEqual(inferDirectionalQuadrant('中央核心区'), 'center');
});

test('map-ai & store: calibrateBaiBaiMap strictly whitelists existing places, compiles preset, and locks baibaiOverrides', async () => {
  const h = createHarness({
    messages: [
      { is_user: false, mes: '✧天宝三年四月|长安城/西市坊/归雁酒楼|晴✧\n街市熙熙攘攘。' },
    ],
  });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target, host: h.host });

  // 模拟百宝书全局快照
  const mockSnap = {
    state: {
      time: '天宝三年四月',
      location: '归雁酒楼',
      locationPath: ['长安城', '西市坊', '归雁酒楼'],
    },
    scenes: [
      { id: 'sc_city', name: '长安城', path: ['长安城'] },
      { id: 'sc_west', name: '西市坊', path: ['长安城', '西市坊'], parentId: 'sc_city' },
      { id: 'sc_east', name: '东市坊', path: ['长安城', '东市坊'], parentId: 'sc_city' },
      { id: 'sc_inn', name: '归雁酒楼', path: ['长安城', '西市坊', '归雁酒楼'], parentId: 'sc_west' },
      { id: 'sc_shop', name: '珍宝阁', path: ['长安城', '东市坊', '珍宝阁'], parentId: 'sc_east' },
    ],
    npcs: [],
    items: [],
  };

  const originalSTBaiBaiBook = globalThis.STBaiBaiBook;
  globalThis.STBaiBaiBook = { getSnapshot: () => mockSnap };

  try {
    const mapAi = createMapAiService({
      contextReader: {
        async readDirectorySources() {
          return { worldbook: '大唐长安城分为东市与西市', story: [], storyMemory: '' };
        },
      },
      modelClient: {
        async complete() {
          return JSON.stringify({
            basemap: 'old-town',
            places: [
              { name: '西市坊', role: 'area', quadrant: 'west' },
              { name: '东市坊', role: 'area', quadrant: 'east' },
              { name: '归雁酒楼', role: 'site', facilities: ['餐饮', '住宿'], relations: [{ targetName: '西市坊', type: '位于' }] },
              { name: '珍宝阁', role: 'site', facilities: ['购物'] },
              // 模拟 AI 偷偷违规夹带了一个未在百宝书中的新地点
              { name: '未曾存在的黑市', role: 'site', facilities: ['黑市'] },
            ],
          });
        },
      },
      target,
      store,
    });

    const calResult = await mapAi.calibrateBaiBaiMap({ instruction: '严格校准方位' });
    assert.strictEqual(calResult.basemap, 'old-town');

    // 核心安全验证：违规的“未曾存在的黑市”必须被白名单剔除，绝不允许新增！
    const illegal = calResult.places.find(p => p.name === '未曾存在的黑市');
    assert.strictEqual(illegal, undefined);

    // 确认百宝书已有场景被正确校准
    const west = calResult.places.find(p => p.name === '西市坊');
    assert.ok(west);
    assert.strictEqual(west.quadrant, 'west');
    assert.strictEqual(west.role, 'area');

    const inn = calResult.places.find(p => p.name === '归雁酒楼');
    assert.ok(inn);
    assert.deepEqual(inn.facilities, ['餐饮', '住宿']);

    // 写入方案 B 的便签本 (Overrides)
    await store.saveBaiBaiOverrides(calResult.overrides, { basemap: calResult.basemap });
    const stateAfterCal = store.read();
    assert.ok(stateAfterCal.map.baibaiOverrides['baibai:sc_west']);
    assert.strictEqual(stateAfterCal.map.baibaiOverrides['baibai:sc_west'].quadrant, 'west');

    // 投影构建：验证便签本成功附体在百宝书场景上，西市坊与东市坊被正确标定方位
    const proj = buildMapProjection({ state: stateAfterCal, baibaiSnapshot: mockSnap, scopePlaceId: 'baibai:sc_city' });
    assert.strictEqual(proj.basemapId, 'old-town');
    const westGroup = proj.layoutGroups.find(g => g.area?.name === '西市坊');
    const eastGroup = proj.layoutGroups.find(g => g.area?.name === '东市坊');
    assert.ok(westGroup);
    assert.ok(eastGroup);
    assert.strictEqual(westGroup.quadrant, 'west');
    assert.strictEqual(eastGroup.quadrant, 'east');

    // 验证千窗布局算法的物理象限吸附：西侧分区严格在东侧分区左侧
    const townLayout = qianchuangMapLayout('town', [
      { entityId: 'w', quadrant: 'west', siteIds: ['s1'] },
      { entityId: 'e', quadrant: 'east', siteIds: ['s2'] },
    ]);
    const wCenterX = townLayout[0].inset.x + townLayout[0].inset.w / 2;
    const eCenterX = townLayout[1].inset.x + townLayout[1].inset.w / 2;
    assert.ok(wCenterX < eCenterX, `西侧分区中心(${wCenterX}) 严格在 东侧分区中心(${eCenterX}) 左侧`);
  } finally {
    globalThis.STBaiBaiBook = originalSTBaiBaiBook;
  }
});

test('store: rollbackMapAi and resetMap undo AI modifications back to initial state', async () => {
  const h = createHarness({});
  const store = createPhoneStore({ target: h.host.captureChat(), host: h.host });

  // 1. 初始状态：无自定义地点，底图为 auto
  const initial = store.read();
  assert.strictEqual(initial.map.items.length, 0);
  assert.strictEqual(initial.map.basemap, 'auto');

  // 2. 模拟 AI 构想了地点并保存
  await store.saveMapFromAi({
    basemap: 'sci-fi',
    places: [
      { name: '太空基地', role: 'area' },
      { name: '控制中心', parentName: '太空基地', role: 'site' },
    ],
  });
  const afterAi = store.read();
  assert.strictEqual(afterAi.map.items.length, 2);
  assert.strictEqual(afterAi.map.basemap, 'sci-fi');
  assert.ok(afterAi.map.backupSnapshot);

  // 3. 执行撤回：必须完整回到保存前的初始状态
  await store.rollbackMapAi();
  const afterRollback = store.read();
  assert.strictEqual(afterRollback.map.items.length, 0);
  assert.strictEqual(afterRollback.map.basemap, 'auto');
  assert.strictEqual(afterRollback.map.backupSnapshot, null);

  // 4. 模拟 AI 校准了百宝书便签
  await store.saveBaiBaiOverrides({
    'baibai:s1': { role: 'area', quadrant: 'north' },
  }, { basemap: 'palace' });
  const afterCal = store.read();
  assert.strictEqual(afterCal.map.basemap, 'palace');
  assert.strictEqual(afterCal.map.baibaiOverrides['baibai:s1'].quadrant, 'north');

  // 5. 再次撤回校准变动
  await store.rollbackMapAi();
  const afterCalRollback = store.read();
  assert.strictEqual(afterCalRollback.map.basemap, 'auto');
  assert.deepEqual(afterCalRollback.map.baibaiOverrides, {});

  // 6. 重置地图功能与防误触可恢复测试
  await store.saveMapPlace({ id: 'p1', name: '临时测试点', role: 'site' });
  assert.strictEqual(store.read().map.items.length, 1);
  await store.resetMap();
  assert.strictEqual(store.read().map.items.length, 0);
  // 重置后也可撤回还原
  await store.rollbackMapAi();
  assert.strictEqual(store.read().map.items.length, 1);
});
