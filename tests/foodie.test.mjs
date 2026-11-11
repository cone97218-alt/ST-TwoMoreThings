import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveDatabases } from '../src/foodie-engine.js';
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

test('foodie: parseTimeRange and isTimeSlotMatched support time ranges including overnight', () => {
  import('../src/foodie-engine.js').then(({ parseTimeRange, isTimeSlotMatched }) => {
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
  assert.match(html, /保存预设/, 'Should have clear save button text');

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
