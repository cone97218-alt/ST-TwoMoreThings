import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readBaiBaiBookMapSnapshot,
  readInlineMessageLocation,
  resolveBasemapId,
  buildMapProjection,
  formatMapContextPrompt,
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
