import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneStore } from '../src/store.js';
import { createHarness } from './harness.mjs';
import { getCountryPreset } from '../src/calendar-presets.js';
import { createCalendarAiService } from '../src/calendar-ai.js';

test('calendar presets: switching country updates descriptor and preset holidays', async () => {
  const h = createHarness();
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });

  // Initially empty calendar
  assert.equal('calendar' in store.read(), false);

  // Apply Japan preset
  await store.applyCalendarPreset({ countryId: 'JP' });
  let state = store.read();
  assert.ok(state.calendar);
  assert.equal(state.calendar.descriptor.country, 'JP');
  assert.equal(state.calendar.descriptor.era, '令和');
  assert.deepEqual(state.calendar.descriptor.weekdays, ['月', '火', '水', '木', '金', '土', '日']);
  assert.ok(state.calendar.items.some(it => it.name === '成人の日'));

  // Ensure calendar reader renders properly and is not blank
  const { createCalendarReader } = await import('../src/calendar.js');
  const reader = createCalendarReader({ store, target });
  const month = reader.month(0);
  assert.ok(month, 'Month should not be null after applying preset');
  assert.equal(month.monthName, `${new Date().getMonth() + 1}月`);
  assert.deepEqual(month.weekdays, ['月', '火', '水', '木', '金', '土', '日']);

  // Save a custom anniversary
  await store.saveCalendarEvent({
    name: '相识纪念日',
    month: 5,
    day: 20,
    type: 'anniversary',
  });
  state = store.read();
  assert.ok(state.calendar.items.some(it => it.name === '相识纪念日'));

  // Switch to United States with keepCustom=true
  await store.applyCalendarPreset({ countryId: 'US', keepCustom: true });
  state = store.read();
  assert.equal(state.calendar.descriptor.country, 'US');
  assert.deepEqual(state.calendar.descriptor.weekdays, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.ok(state.calendar.items.some(it => it.name === 'Independence Day'));
  // Custom event preserved
  assert.ok(state.calendar.items.some(it => it.name === '相识纪念日'));
  // Japan preset events replaced
  assert.ok(!state.calendar.items.some(it => it.name === '成人の日'));

  // 1. Create a custom calendar (e.g. Four Seasons: 4 months x 28 days)
  await store.createCustomCalendar({
    title: '四季历',
    era: '新历',
    months: [
      { name: '春之月', days: 28 },
      { name: '夏之月', days: 28 },
      { name: '秋之月', days: 28 },
      { name: '冬之月', days: 28 },
    ],
    weekdayCycle: 7,
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    presetName: '我的四季历',
  });
  state = store.read();
  assert.equal(state.calendar.descriptor.kind, 'custom');
  assert.equal(state.calendar.descriptor.title, '四季历');
  assert.equal(state.calendar.descriptor.months.length, 4);
  assert.equal(state.calendar.descriptor.months[0].name, '春之月');
  assert.equal(state.calendar.descriptor.months[0].days, 28);
  assert.equal(state.calendar.customPresets.length, 1);
  assert.equal(state.calendar.customPresets[0].name, '我的四季历');

  const customMonth = reader.month(0);
  assert.ok(customMonth);
  assert.equal(customMonth.totalMonths, 4);
  assert.equal(customMonth.daysInMonth, 28);
  assert.equal(customMonth.days.length, 28);

  // 2. Add an event to this calendar
  await store.saveCalendarEvent({
    name: '春分盛典',
    month: 1,
    day: 1,
    type: 'festival',
  });

  // Save current calendar & events as another preset
  await store.saveCustomCalendarPreset({ name: '四季完整版' });
  state = store.read();
  assert.equal(state.calendar.customPresets.length, 2);
  const fullPreset = state.calendar.customPresets.find(p => p.name === '四季完整版');
  assert.ok(fullPreset);
  assert.ok(fullPreset.items.some(it => it.name === '春分盛典'));

  // 3. Switch back to modern country (e.g. JP)
  await store.applyCalendarPreset({ countryId: 'JP', keepCustom: false });
  state = store.read();
  assert.equal(state.calendar.descriptor.country, 'JP');
  assert.ok(state.calendar.items.some(it => it.name === '成人の日'));

  // 4. Switch back to custom preset
  await store.applyCustomCalendarPreset(fullPreset.id, { keepCustom: false });
  state = store.read();
  assert.equal(state.calendar.descriptor.title, '四季历');
  assert.equal(state.calendar.descriptor.months.length, 4);
  assert.ok(state.calendar.items.some(it => it.name === '春分盛典'));
  assert.ok(!state.calendar.items.some(it => it.name === '成人の日'));

  // 5. Delete custom preset
  await store.deleteCustomCalendarPreset(fullPreset.id);
  state = store.read();
  assert.equal(state.calendar.customPresets.length, 1);
  assert.ok(!state.calendar.customPresets.some(p => p.id === fullPreset.id));

  // 6. Test story text date capture and automatic binding to custom calendar
  target.messages = [
    { is_user: false, mes: '【时间：新历3年春之月15日】公会正在聚集冒险者。' },
  ];
  const storyMonth = reader.month(0);
  assert.ok(storyMonth);
  assert.equal(storyMonth.year, 3);
  assert.equal(storyMonth.month, 1);
  assert.equal(storyMonth.monthName, '春之月');
  assert.equal(storyMonth.today, '新历3年春之月15日');
  const day15 = storyMonth.days.find(d => d.day === 15);
  assert.ok(day15);
  assert.equal(day15.isToday, true);
});

test('calendar AI service: parses conceived festivals and deduced schedules', async () => {
  const h = createHarness();
  const target = h.host.captureChat();
  const contextReader = {
    async readDirectorySources() {
      return {
        contacts: [{ name: '林舟' }],
        worldbook: '这是一个奇幻冒险世界。',
        story: [{ text: '在公会大厅集合。' }],
      };
    },
  };

  const modelClient = {
    async complete(request) {
      if (request.system.includes('世界观与民俗构想助手')) {
        return JSON.stringify({
          festivals: [
            { name: '星辰降临祭', type: 'festival', month: 7, day: 7, days: 3, note: '全城祈愿' },
            { name: '丰收大典', type: 'festival', month: 10, day: 15, days: 2, note: '秋季丰收' },
          ],
        });
      }
      return JSON.stringify({
        schedules: [
          { title: '公会探险整备', month: 10, day: 26, time: '10:00', location: '冒险者公会', note: '购买药水' },
          { title: '遗迹调查', month: 10, day: 27, time: '全天', location: '古代遗迹', note: '调查石碑' },
        ],
      });
    },
  };

  const ai = createCalendarAiService({ contextReader, modelClient, target });

  // 1. Conceive festivals
  const festivals = await ai.conceiveFestivals({ setting: '奇幻魔法世界', count: 2 });
  assert.equal(festivals.length, 2);
  assert.equal(festivals[0].name, '星辰降临祭');
  assert.equal(festivals[0].month, 7);
  assert.equal(festivals[0].days, 3);
  assert.equal(festivals[0].selected, true);

  // 2. Save festivals to store
  const store = createPhoneStore({ target });
  await store.saveCalendarEvents(festivals);
  let state = store.read();
  assert.ok(state.calendar.items.some(it => it.name === '星辰降临祭'));

  // 3. Deduce schedules
  const schedules = await ai.deduceSchedules({ days: 2 });
  assert.equal(schedules.length, 2);
  assert.equal(schedules[0].title, '公会探险整备');
  assert.equal(schedules[0].month, 10);
  assert.equal(schedules[0].time, '10:00');

  // 4. Save schedules as todos
  await store.saveTodosFromSchedule(schedules);
  state = store.read();
  assert.ok(state.todos.some(t => t.title === '公会探险整备' && t.status === 'open'));
});
