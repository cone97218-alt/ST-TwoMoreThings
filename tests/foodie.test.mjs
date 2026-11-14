import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveDatabases, evaluateFoodieMatch } from '../src/foodie-engine.js';
import { renderFoodie } from '../src/ui/foodie.js';

test('foodie: getEffectiveDatabases properly incorporates custom databases', () => {
  const customId = `custom:${Date.now()}`;
  const customDb = {
    id: customId,
    label: '自建预设测试',
    builtin: false,
    enabled: true,
    items: ['宫保鸡丁', '米饭']
  };

  const state = {
    foodie: {
      customDatabases: {
        [customId]: customDb
      }
    }
  };

  const dbs = getEffectiveDatabases(state);
  const found = dbs.find(d => d.id === customId);
  assert.ok(found, 'Custom database should be found in effective databases');
  assert.equal(found.label, '自建预设测试');
  assert.equal(found.enabled, true);
  assert.equal(found.builtin, false);
});

test('foodie: renderFoodie trace env grid renders clean SVG icons without emojis', () => {
  const state = {
    foodie: {
      lastTrace: {
        locationTrace: '苏州',
        locationText: '苏州',
        timeSlotLabel: '午餐',
        timeTrace: '午餐时段',
        festival: '中秋节',
        season: '秋季',
        weatherText: '小雨',
      }
    }
  };

  const html = renderFoodie(state, { ui: { foodieTraceOpen: true } });

  // 验证不包含系统 emoji 📍, ⏰, 🎋, ⛅
  assert.doesNotMatch(html, /📍|⏰|🎋|⛅/, 'Trace view should not contain raw platform emojis');

  // 验证使用了统一的 SVG 图标与 env-icon 容器
  assert.match(html, /class="env-icon"[^>]*><svg/, 'Should contain env-icon with svg elements');
  assert.match(html, /地理位置/, 'Should contain location label');
  assert.match(html, /生效时段/, 'Should contain time slot label');
  assert.match(html, /时令与节日/, 'Should contain festival/season label');
  assert.match(html, /天气天候/, 'Should contain weather label');
});

test('foodie: parseTimeRange and isTimeSlotMatched support time ranges including overnight', async () => {
  const { parseTimeRange, isTimeSlotMatched } = await import('../src/foodie-engine.js');
  // 正常日间区间
  const r1 = parseTimeRange('11:30-13:30');
  assert.deepEqual(r1, { start: 690, end: 810 });
  assert.equal(isTimeSlotMatched('11:30-13:30', { currentMinutes: 720 }), true); // 12:00 -> 命中
  assert.equal(isTimeSlotMatched('11:30-13:30', { currentMinutes: 600 }), false); // 10:00 -> 未中

  // 跨午夜夜宵区间 (21:00-02:00)
  const r2 = parseTimeRange('21:00-02:00');
  assert.deepEqual(r2, { start: 1260, end: 120 });
  assert.equal(isTimeSlotMatched('21:00-02:00', { currentMinutes: 1320 }), true); // 22:00 -> 命中
  assert.equal(isTimeSlotMatched('21:00-02:00', { currentMinutes: 60 }), true); // 01:00 -> 命中
  assert.equal(isTimeSlotMatched('21:00-02:00', { currentMinutes: 720 }), false); // 12:00 -> 未中
});

test('foodie: renderFoodie edit view renders map-derived places and time ranges without fake secondary words', () => {
  const customId = `custom:12345`;
  const state = {
    foodie: {
      customDatabases: {
        [customId]: {
          id: customId,
          label: '学院私房菜',
          builtin: false,
          enabled: true,
          mapLocations: ['海神阁'],
          calendarSlots: ['11:30-13:30'],
          items: ['烤鱼']
        }
      }
    },
    map: {
      places: [{ name: '海神阁' }, { name: '史莱克广场' }]
    }
  };

  const html = renderFoodie(state, {
    ui: {
      foodieShowSettings: true,
      foodieSettingsTab: 'edit',
      foodieSelectedDbId: customId,
      foodieDrawersOpen: { location: true, time: true, weather: true, season: true, dishes: true }
    }
  });

  // 验证时段快捷标签给的是时间段（如 11:30-13:30），而不是“早餐、午餐”
  assert.match(html, /\+11:30-13:30/, 'Should suggest 11:30-13:30 time range');
  assert.doesNotMatch(html, />\+早餐</, 'Should not suggest hardcoded secondary word +早餐');
  assert.doesNotMatch(html, />\+午餐</, 'Should not suggest hardcoded secondary word +午餐');

  // 验证地图地点候选直接取自系统地图
  assert.match(html, /\+海神阁/, 'Should suggest map place 海神阁');
  assert.match(html, /\+史莱克广场/, 'Should suggest map place 史莱克广场');
  assert.doesNotMatch(html, />\+苏州</, 'Should not suggest fake hardcoded city 苏州');

  // 验证包含顶部与底部返回清单、直接关闭及保存按钮
  assert.match(html, /data-action="foodie-back-to-list"/, 'Should contain back-to-list action');
  assert.match(html, /data-action="foodie-close-settings"/, 'Should contain close-settings action');
  assert.match(html, /data-action="foodie-save-db"/, 'Should contain save action');
  assert.match(html, />保存</, 'Should have clear save button text');

  // 验证在编辑模式下，不渲染全局基础参数（避免混淆），而在清单模式下正常展示
  assert.doesNotMatch(html, /id="foodie-count-input"/, 'Edit view should not render global count input');

  const listHtml = renderFoodie(state, {
    ui: {
      foodieShowSettings: true,
      foodieSettingsTab: 'list'
    }
  });
  assert.match(listHtml, /id="foodie-count-input"/, 'List view should render global count input');
  assert.match(listHtml, /data-action="foodie-close-settings"/, 'List view header should have close button');
});

test('foodie: sub-group condition parsing and intelligent drill-down extraction', async () => {
  const { parseDishCondition, splitDishesInput, isConditionMatched, assembleMealCombo, evaluateFoodieMatch } = await import('../src/foodie-engine.js');

  // 1. 测试单品标签解析
  const p1 = parseDishCondition('[清明] 青团');
  assert.equal(p1.condition, '清明');
  assert.equal(p1.name, '青团');

  const p2 = parseDishCondition('鲜肉月饼#中秋');
  assert.equal(p2.condition, '中秋');
  assert.equal(p2.name, '鲜肉月饼');

  const p3 = parseDishCondition('白米饭');
  assert.equal(p3.condition, null);
  assert.equal(p3.name, '白米饭');

  // 2. 测试批量输入分拆前缀继承
  const split1 = splitDishesInput('[清明] 青团, 螺蛳, 荠菜馄饨');
  assert.deepEqual(split1, ['[清明] 青团', '[清明] 螺蛳', '[清明] 荠菜馄饨']);

  const split2 = splitDishesInput('油条, 豆浆#早餐, [宵夜] 烧烤');
  assert.deepEqual(split2, ['油条', '豆浆#早餐', '[宵夜] 烧烤']);

  // 3. 测试条件命中匹配
  assert.equal(isConditionMatched('清明', { calSense: { jieqi: '清明' } }), true);
  assert.equal(isConditionMatched('立春', { calSense: { jieqi: '清明' } }), false);
  assert.equal(isConditionMatched('中秋', { calSense: { festivals: ['中秋节'] } }), true);
  assert.equal(isConditionMatched('早餐', { calSense: { timeSlotLabel: '早餐', currentMinutes: 480 } }), true);
  assert.equal(isConditionMatched('宵夜', { calSense: { timeSlotLabel: '早餐', currentMinutes: 480 } }), false);

  // 4. 测试库内单库按节气与时段智能下钻抽取
  const solarTermDb = {
    id: 'custom:solar',
    label: '二十四节气时令美食',
    builtin: false,
    enabled: true,
    items: [
      '[立春] 春饼',
      '[立春] 炸春卷',
      '[清明] 青团',
      '[清明] 螺蛳',
      '[中秋] 鲜肉月饼',
      '[中秋] 阳澄湖大闸蟹',
      '[冬至] 羊肉汤',
      '[冬至] 韭菜猪肉水饺',
      '时蔬例汤',
      '清炒菜心'
    ]
  };

  // 当节气为清明时，组装套餐优先命中清明菜品
  const qingmingResult = assembleMealCombo(solarTermDb, 2, {
    calSense: { jieqi: '清明', season: '春季' }
  });
  assert.ok(qingmingResult.includes('青团') || qingmingResult.includes('螺蛳'), `Should pick Qingming dish, got: ${qingmingResult.join(', ')}`);
  assert.ok(!qingmingResult.includes('阳澄湖大闸蟹'), 'Should not pick Mid-Autumn crab on Qingming');
  assert.ok(!qingmingResult.includes('羊肉汤'), 'Should not pick Winter Solstice soup on Qingming');

  // 当日历为中秋时，组装套餐优先命中中秋菜品
  const midAutumnResult = assembleMealCombo(solarTermDb, 2, {
    calSense: { festivals: ['中秋节'], season: '秋季' }
  });
  assert.ok(midAutumnResult.includes('鲜肉月饼') || midAutumnResult.includes('阳澄湖大闸蟹'), `Should pick Mid-Autumn dish, got: ${midAutumnResult.join(', ')}`);

  // 5. 测试全库匹配打分自动感知库内菜品子条件
  const matchResult = evaluateFoodieMatch({
    storyText: '肚子咕咕叫了，好想吃顿饭',
    state: {
      foodie: {
        customDatabases: {
          'custom:solar': solarTermDb
        }
      }
    },
    calendarContext: {
      jieqi: '清明',
      season: '春季'
    }
  });

  assert.equal(matchResult.triggered, true);
  assert.equal(matchResult.session?.dbId, 'custom:solar');
  assert.ok(matchResult.foods.includes('青团') || matchResult.foods.includes('螺蛳'), `Foods should contain Qingming dishes: ${matchResult.foods.join(', ')}`);
});

test('foodie: ambiguous single-char actions and generic builtin tags do not false-trigger meal intent', () => {
  const res1 = evaluateFoodieMatch({
    storyText: '他冲出门外，端详着天空，煎熬地等着，顺便泡个澡。今天是春季日常，他在中国散步。',
    state: { foodie: {} },
    calendarContext: { season: '春季', jieqi: '', festivals: [] }
  });
  assert.equal(res1.triggered, false, 'Ambiguous actions and generic builtin metadata must not trigger meal intent');

  // Empty builtin country:CN shell should be excluded from getEffectiveDatabases
  const effective = getEffectiveDatabases({ foodie: {} });
  assert.equal(effective.some(d => d.id === 'country:CN'), false, 'Empty country:CN shell should not appear in effective databases');
});

test('foodie: senseCalendar ignores todo and non-today events while sensing story festival, solarTerm and time slot', async () => {
  const { senseCalendar } = await import('../src/foodie-engine.js');
  const mockCore = {
    slots: {
      morning: ['清晨', '早上'],
      lunch: ['中午'],
      dinner: ['晚上', '晚饭'],
      lateNight: ['深夜', '凌晨']
    },
    jieqiList: ['冬至', '清明', '谷雨'],
    fests: [{ n: '中秋节', kw: ['中秋'] }]
  };
  const calSense = senseCalendar({
    time: '12:15',
    solarTerm: '谷雨',
    season: '春季',
    events: [
      { type: 'todo', title: '中秋采购', when: '今天' },
      { type: 'festival', title: '端午节', when: '5天后' },
      { type: 'festival', title: '清明祭扫', when: '今天' }
    ]
  }, mockCore, new Date(2026, 3, 20, 9, 0), '两个人走在春风拂面的街道上');

  assert.equal(calSense.jieqi, '谷雨');
  assert.ok(calSense.festivals.includes('清明祭扫'), 'Today non-todo event should be sensed');
  assert.ok(!calSense.festivals.includes('中秋采购'), 'Todo event should be ignored');
  assert.ok(!calSense.festivals.includes('端午节'), 'Future event should be ignored');
  assert.equal(calSense.timeSlot, 'noon', 'Explicit calendar clock 12:15 should determine noon timeSlot');
  assert.equal(calSense.timeSource, '日历时间');

  const storyOnlyCal = senseCalendar({ weather: {} }, mockCore, new Date(2026, 11, 21, 9, 0), '明天就是冬至，晚上大家准备聚一下');
  assert.equal(storyOnlyCal.jieqi, '冬至');
  assert.equal(storyOnlyCal.timeSlot, 'dinner');
  assert.equal(storyOnlyCal.timeSource, '正文时段');
});

test('foodie: assembleMealCombo skips excluded, maps alcohol/fruit, supports single-category DB and strict priority', async () => {
  const { assembleMealCombo, senseWeather } = await import('../src/foodie-engine.js');
  const structuredDb = {
    id: 'custom:struct',
    label: '测试分类库',
    categories: [
      { name: '禁忌避坑', role: 'excluded', items: ['香菜', '折耳根'] },
      { name: '酒水', role: 'alcohol', items: ['桂花酿'] },
      { name: '果盘', role: 'fruit', items: ['冰镇西瓜'] },
      { name: '主菜', role: 'hot', items: ['[雨天] 酸菜鱼'] },
      { name: '点心', role: 'dessert', items: ['[下雪] 烤红薯'] }
    ],
    items: ['香菜', '折耳根', '桂花酿', '冰镇西瓜', '[雨天] 酸菜鱼', '[下雪] 烤红薯']
  };

  const rainySense = senseWeather({ weather: { condition: '小雨' } });
  for (let i = 0; i < 10; i++) {
    const picked = assembleMealCombo(structuredDb, 3, { weatherSense: rainySense });
    assert.equal(picked.length, 3);
    assert.ok(!picked.includes('香菜') && !picked.includes('折耳根'), 'Excluded items must never be selected');
    assert.ok(!picked.includes('烤红薯'), 'Unmatched snowy condition should not be picked when matched/universal items exist');
  }

  // Alcohol/fruit role normalization check
  const drinkDb = {
    id: 'custom:drink-map',
    label: '微醺配餐',
    categories: [
      { name: '禁忌', role: 'excluded', items: ['生蒜'] },
      { name: '主菜', role: 'hot', items: ['红烧肉'] },
      { name: '酒水', role: 'alcohol', items: ['桂花酿'] }
    ],
    items: ['生蒜', '红烧肉', '桂花酿']
  };
  const drinkPick = assembleMealCombo(drinkDb, 2, {});
  assert.deepEqual(new Set(drinkPick), new Set(['红烧肉', '桂花酿']));

  // Single-category dessert-only DB should pick from that category cleanly
  const dessertOnlyDb = {
    id: 'custom:dessert-only',
    label: '纯甜品铺',
    categories: [
      { name: '甜点', role: 'dessert', items: ['杨枝甘露', '双皮奶', '芒果班戟'] }
    ],
    items: ['杨枝甘露', '双皮奶', '芒果班戟']
  };
  const dessertPick = assembleMealCombo(dessertOnlyDb, 2, {});
  assert.equal(dessertPick.length, 2);
  assert.ok(dessertPick.every(x => ['杨枝甘露', '双皮奶', '芒果班戟'].includes(x)));

  // Role bucket check in UI edit view should also exclude 'excluded' and map alcohol/fruit
  const uiHtml = renderFoodie({ foodie: { customDatabases: { 'custom:struct': structuredDb } } }, {
    ui: { foodieShowSettings: true, foodieSettingsTab: 'edit', foodieSelectedDbId: 'custom:struct' }
  });
  assert.doesNotMatch(uiHtml, /折耳根/);
  assert.match(uiHtml, /桂花酿/);
  assert.match(uiHtml, /冰镇西瓜/);
});

test('foodie: evaluateFoodieMatch supports compound biz label matching and forceRefresh', () => {
  const res = evaluateFoodieMatch({
    storyText: '逛完街好饿，走进星巴克想坐下吃点东西',
    state: {
      foodie: {
        modifiedBuiltins: {
          'scene:cafe': { enabled: true },
          'cn:daily': { enabled: true }
        }
      }
    }
  });
  assert.equal(res.triggered, true);
  assert.equal(res.session?.dbId, 'scene:cafe', `Expected scene:cafe via compound biz '咖啡厅/西式餐吧', got ${res.session?.dbId}`);

  // forceRefresh should bypass cached session foods and re-evaluate
  const lockedState = {
    foodie: {
      customDatabases: {
        'custom:tea': {
          id: 'custom:tea',
          label: '茶室定制',
          enabled: true,
          builtin: false,
          keywords: ['喝茶', '茶点'],
          items: ['龙井茶', '定胜糕']
        }
      },
      session: {
        startTurn: 0,
        lastTurn: 0,
        dbId: res.session.dbId,
        dbLabel: res.session.dbLabel,
        foods: ['旧缓存食物'],
        promptText: '[食物线索：旧缓存食物]',
        timestamp: Date.now()
      }
    }
  };
  const refreshed = evaluateFoodieMatch({
    storyText: '逛完街好饿，进来喝茶吃茶点',
    state: lockedState,
    turnIndex: 1,
    forceRefresh: true
  });
  assert.equal(refreshed.triggered, true);
  assert.equal(refreshed.session?.dbId, 'custom:tea');
  assert.notEqual(refreshed.foods[0], '旧缓存食物', 'forceRefresh should bypass cached session foods');
});

test('foodie: renderFoodie shows locked trace label and chevron-right button on db card', () => {
  const lockedHtml = renderFoodie({
    foodie: {
      locked: true,
      current: { dbId: 'cn-pian:su', dbLabel: '苏菜', foods: ['松鼠鳜鱼'], trace: { locationText: '苏州' } },
      lastTrace: { locationText: '苏州' }
    }
  }, {
    ui: { foodieTraceOpen: false }
  });
  assert.match(lockedHtml, /class="trace-state-tag locked">已锁定</);

  const listHtml = renderFoodie({ foodie: {} }, {
    ui: { foodieShowSettings: true, foodieSettingsTab: 'list' }
  });
  assert.match(listHtml, /data-action="foodie-open-edit-db"[^>]*><svg/);
});

test('foodie: every effective builtin database shows non-zero count and non-empty active role pane on open', async () => {
  const { getDbItemList } = await import('../src/foodie-engine.js');
  const effective = getEffectiveDatabases({});
  assert.ok(effective.length >= 700);

  for (const db of effective) {
    assert.ok(getDbItemList(db).length > 0, `DB ${db.id} (${db.label}) should have > 0 items`);
    const html = renderFoodie({ foodie: {} }, {
      ui: { foodieShowSettings: true, foodieSettingsTab: 'edit', foodieSelectedDbId: db.id }
    });
    const activePaneMatch = html.match(/<div class="role-dish-chips-box is-active" data-role-pane="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="role-dish-chips-box|<\/div>)/);
    assert.ok(activePaneMatch, `DB ${db.id} should render an active role pane`);
    assert.doesNotMatch(activePaneMatch[2], /暂无菜品/, `DB ${db.id} (${db.label}) active pane (${activePaneMatch[1]}) must not be empty`);
  }

  // Soup-only slice DB automatically selects 'soup' tab
  const minSoupHtml = renderFoodie({ foodie: {} }, {
    ui: { foodieShowSettings: true, foodieSettingsTab: 'edit', foodieSelectedDbId: 'cn:cuisine:3-1:闽菜·汤羹类' }
  });
  assert.match(minSoupHtml, /role-dish-chips-box is-active" data-role-pane="soup"/);

  // Standalone excluded-role sauce DB falls back to heuristic classification instead of 0 items
  const minSauceHtml = renderFoodie({ foodie: {} }, {
    ui: { foodieShowSettings: true, foodieSettingsTab: 'edit', foodieSelectedDbId: 'cn:cuisine:3-1:闽菜·酱料类' }
  });
  assert.doesNotMatch(minSauceHtml, /role-dish-chips-box is-active"[^>]*>\s*<div class="role-dishes-empty">暂无菜品/);

  // Self-heal modifiedBuiltins entry if saved with accidental empty items/categories
  const healed = getEffectiveDatabases({
    foodie: {
      modifiedBuiltins: {
        'cn:cuisine:3-1': { id: 'cn:cuisine:3-1', enabled: true, items: [], categories: [] }
      }
    }
  });
  const healedMin = healed.find(d => d.id === 'cn:cuisine:3-1');
  assert.ok(getDbItemList(healedMin).length > 100, 'Empty modifiedBuiltins items/categories should fall back to builtin data');
});

test('foodie: ancient twelve shichen parsing, slot mapping and condition matching', async () => {
  const { parseShichen, senseCalendar, isTimeSlotMatched, isConditionMatched, assembleMealCombo } = await import('../src/foodie-engine.js');

  // 1. 测试十二时辰解析及初/正/刻度换算
  const chen = parseShichen('辰时');
  assert.equal(chen.char, '辰');
  assert.equal(chen.slot, 'morning');
  assert.equal(chen.meal, '早膳');
  assert.equal(chen.minutes, 480); // 08:00

  const wuKe = parseShichen('午时三刻');
  assert.equal(wuKe.char, '午');
  assert.equal(wuKe.slot, 'noon');
  assert.equal(wuKe.meal, '午膳');
  assert.equal(wuKe.minutes, 11 * 60 + 30); // 11:30

  const xuZheng = parseShichen('戌时正');
  assert.equal(xuZheng.char, '戌');
  assert.equal(xuZheng.slot, 'evening');
  assert.equal(xuZheng.meal, '晚膳');
  assert.equal(xuZheng.minutes, 20 * 60); // 20:00

  // 2. 测试正文古代时辰感知与日历感知
  const calSenseFromStory = senseCalendar({ weather: {} }, {}, new Date(), '转眼已至辰时，街上炊烟袅袅，行人纷纷出门寻些吃食');
  assert.equal(calSenseFromStory.timeSlot, 'morning');
  assert.equal(calSenseFromStory.timeSlotLabel, '辰时·食时');
  assert.ok(calSenseFromStory.timeSlots.includes('早膳'));
  assert.ok(calSenseFromStory.timeSlots.includes('辰时'));

  // 3. 测试时段与条件匹配
  assert.equal(isTimeSlotMatched('辰时', calSenseFromStory), true);
  assert.equal(isTimeSlotMatched('早膳', calSenseFromStory), true);
  assert.equal(isTimeSlotMatched('07:00-09:30', calSenseFromStory), true);
  assert.equal(isTimeSlotMatched('午时', calSenseFromStory), false);

  assert.equal(isConditionMatched('辰时', { calSense: calSenseFromStory }), true);
  assert.equal(isConditionMatched('早膳', { calSense: calSenseFromStory }), true);
  assert.equal(isConditionMatched('戌时', { calSense: calSenseFromStory }), false);

  // 4. 测试配餐抽取：在辰时优先挑选 [辰时] 菜品
  const ancientDb = {
    id: 'custom:ancient-tea',
    label: '古风客栈食肆',
    items: ['[辰时] 龙须酥与碧螺春', '[午时] 叫花鸡', '[戌时] 桂花酿', '清炒时蔬']
  };
  const meal = assembleMealCombo(ancientDb, 2, { calSense: calSenseFromStory });
  assert.ok(meal.includes('龙须酥与碧螺春'), `Should prioritize Chen-shi breakfast dish, got: ${meal.join(', ')}`);
});

test('foodie: japanese cuisine database and import/export pack structure', async () => {
  const { getEffectiveDatabases, BUILTIN_JAPAN_CUISINE_DB, assembleMealCombo } = await import('../src/foodie-engine.js');
  const dbs = getEffectiveDatabases({});
  const jp = dbs.find(d => d.id === 'scene:japanese');
  assert.ok(jp, 'Builtin Japanese cuisine database should exist');
  assert.equal(jp.categories.length, 6, 'Should have all 6 role categories');
  assert.ok(jp.items.length >= 60, 'Should have over 60 curated Japanese dishes');

  // 场景与节日菜品提取
  const summerMeal = assembleMealCombo(jp, 3, {
    calSense: { festivals: ['夏祭'], season: '夏季' }
  });
  assert.ok(summerMeal.some(f => /章鱼小丸子|炒面|苹果糖/.test(f)), `Summer festival should pick festival specialties: ${summerMeal.join(', ')}`);

  // 居酒屋夜宵场景
  const izakayaMeal = assembleMealCombo(jp, 3, {
    storyText: '今晚去居酒屋喝一杯，点些下酒菜'
  });
  assert.ok(izakayaMeal.some(f => /唐扬炸鸡|烤鸡肉串|毛豆|Highball|生啤酒|大吟酿/.test(f)));
});
