import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGregorian,
  daysInMonth,
  defaultGregorianCalendar,
  weekdayFor,
  ordinalOf,
  calendarDayOrdinal,
  daysBetweenCalendarDates,
  parseDateString,
  parseWeekdayString,
  createPhoneCalendarApi,
  BUILTIN_FESTIVALS,
} from '../src/calendar-engine.js';
import { createCalendarReader } from '../src/calendar.js';
import { createPhoneStore } from '../src/store.js';
import { createAuthoringService, stateFromPreset } from '../src/authoring.js';
import { createHarness } from './harness.mjs';

test('calendar-engine: Gregorian leap years and day counts', () => {
  const cal = defaultGregorianCalendar();
  assert.equal(isGregorian(cal), true);
  assert.equal(daysInMonth(cal, 1, 2024), 31);
  assert.equal(daysInMonth(cal, 2, 2024), 29);
  assert.equal(daysInMonth(cal, 2, 2025), 28);
  assert.equal(daysInMonth(cal, 2, 2000), 29);
  assert.equal(daysInMonth(cal, 2, 1900), 28);
  assert.equal(daysInMonth(cal, 4, 2024), 30);
});

test('calendar-engine: custom calendar with non-standard months and weekday cycles', () => {
  const custom = {
    kind: 'custom',
    months: [{ name: '霜月', days: 20 }, { name: '花月', days: 24 }],
    weekdayCycle: 6,
  };
  assert.equal(isGregorian(custom), false);
  assert.equal(daysInMonth(custom, 1), 20);
  assert.equal(daysInMonth(custom, 2), 24);
  assert.equal(ordinalOf({ month: 2, day: 5 }, custom), 25);
});

test('calendar-engine: daysBetweenCalendarDates calculation across years', () => {
  const cal = defaultGregorianCalendar();
  const d1 = { year: 2026, month: 10, day: 25 };
  const d2 = { year: 2026, month: 10, day: 31 };
  const d3 = { year: 2027, month: 1, day: 1 };
  assert.equal(daysBetweenCalendarDates(d1, d2, cal), 6);
  assert.equal(daysBetweenCalendarDates(d1, d3, cal), 68);
});

test('calendar-engine: parseDateString and parseWeekdayString', () => {
  const p1 = parseDateString('2026-10-25', '周日');
  assert.deepEqual(p1, { year: 2026, month: 10, day: 25, eraLabel: '', weekday: 0 });

  const p2 = parseDateString('城历2025年2月1日', '星期一');
  assert.deepEqual(p2, { year: 2025, month: 2, day: 1, eraLabel: '城历', weekday: 1 });

  const p3 = parseDateString('10-25');
  assert.deepEqual(p3, { year: null, month: 10, day: 25, eraLabel: '' });

  const fantasyCal = {
    kind: 'custom',
    era: '新历',
    currentYear: 1,
    months: [
      { name: '春之月', days: 28 },
      { name: '夏之月', days: 28 },
      { name: '秋之月', days: 28 },
      { name: '冬之月', days: 28 },
    ],
  };
  const p4 = parseDateString('新历3年春之月15日', '周一', fantasyCal);
  assert.deepEqual(p4, { year: 3, month: 1, day: 15, eraLabel: '新历', weekday: 1 });

  const p5 = parseDateString('夏之月10日', '', fantasyCal);
  assert.deepEqual(p5, { year: 1, month: 2, day: 10, eraLabel: '新历' });

  const p6 = parseDateString('新历2年第3季5日', '', fantasyCal);
  assert.deepEqual(p6, { year: 2, month: 3, day: 5, eraLabel: '新历' });

  const p7 = parseDateString('2026.5.20 12:00');
  assert.deepEqual(p7, { year: 2026, month: 5, day: 20, eraLabel: '' });

  const p8 = parseDateString('2026.5.20 周三 14:30');
  assert.deepEqual(p8, { year: 2026, month: 5, day: 20, eraLabel: '', weekday: 3 });

  assert.equal(parseWeekdayString('周五'), 5);
  assert.equal(parseWeekdayString('Wednesday'), 3);
  assert.equal(parseWeekdayString('星期天'), 0);
});

test('calendar-engine: createPhoneCalendarApi month view and multi-day festival coverage', () => {
  const cal = defaultGregorianCalendar();
  const items = [
    { id: 'f1', name: '国庆节', type: 'festival', month: 10, day: 1, days: 3 },
    { id: 'a1', name: '相识纪念日', type: 'anniversary', month: 10, day: 26, days: 1, note: '书店初遇' },
  ];
  const api = createPhoneCalendarApi({
    read: () => ({
      calendar: cal,
      items,
      today: { year: 2026, month: 10, day: 25, weekday: 0 },
    }),
  });

  const monthView = api.getPhoneCalendar({ monthOffset: 0 });
  assert.equal(monthView.year, 2026);
  assert.equal(monthView.month, 10);
  assert.equal(monthView.monthName, '10月');
  assert.equal(monthView.days.length, 31);
  assert.equal(monthView.days[24].isToday, true); // Oct 25 (0-indexed day 24)

  // Oct 1, 2, 3 should all cover 国庆节
  assert.ok(monthView.days[0].items.some(it => it.name === '国庆节'));
  assert.ok(monthView.days[1].items.some(it => it.name === '国庆节'));
  assert.ok(monthView.days[2].items.some(it => it.name === '国庆节'));
  assert.ok(!monthView.days[3].items.some(it => it.name === '国庆节'));

  // Oct 26 should have anniversary
  assert.ok(monthView.days[25].items.some(it => it.name === '相识纪念日'));
});

test('calendar-engine: createPhoneCalendarApi context extraction within 7 days', () => {
  const cal = defaultGregorianCalendar();
  const items = [
    { id: 'f1', name: '国庆节', type: 'festival', month: 10, day: 1, days: 3 },
    { id: 'a1', name: '相识纪念日', type: 'anniversary', month: 10, day: 26, days: 1 },
    { id: 'f2', name: '万圣节', type: 'festival', month: 10, day: 31, days: 1 },
    { id: 'f3', name: '元旦', type: 'festival', month: 1, day: 1, days: 1 },
  ];
  const api = createPhoneCalendarApi({
    read: () => ({
      calendar: cal,
      items,
      today: { year: 2026, month: 10, day: 25, weekday: 0 },
    }),
  });

  const ctx = api.getPhoneCalendarContext();
  assert.ok(ctx);
  assert.equal(ctx.events.length, 2);
  assert.equal(ctx.events[0].name, '相识纪念日');
  assert.equal(ctx.events[0].when, '1天后');
  assert.equal(ctx.events[1].name, '万圣节');
  assert.equal(ctx.events[1].when, '6天后');

  // Querying a distant festival explicitly includes it
  const explicitCtx = api.getPhoneCalendarContext({ query: '元旦有什么安排？' });
  assert.ok(explicitCtx.events.some(e => e.name === '元旦'));
});

test('calendar-engine: missing story date does not fabricate countdowns', () => {
  const cal = defaultGregorianCalendar();
  const items = [{ id: 'a1', name: '纪念日', type: 'anniversary', month: 10, day: 26 }];
  const api = createPhoneCalendarApi({
    read: () => ({
      calendar: cal,
      items,
      today: null,
    }),
  });
  assert.equal(api.getPhoneCalendarContext(), null);
  const queryCtx = api.getPhoneCalendarContext({ query: '纪念日是哪天' });
  assert.equal(queryCtx.events[0].when, '');
});

test('createCalendarReader: standalone operation with store and authoring preset', async () => {
  const h = createHarness({
    messages: [
      { is_user: false, mes: '今天也是美好的一天。<!-- SDC-end date=2026-10-25 | weekday=周日 | time=14:00 -->' },
    ],
  });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });

  // Save custom calendar event
  await store.saveCalendarEvent({
    name: '重聚之约',
    type: 'anniversary',
    month: 10,
    day: 27,
    days: 1,
    note: '在老咖啡馆见面',
  });

  const reader = createCalendarReader({ store, target });
  const month = reader.month(0);
  assert.ok(month);
  assert.equal(month.month, 10);
  assert.ok(month.days[24].isToday); // day 25
  assert.ok(month.days[26].items.some(it => it.name === '重聚之约'));

  const ctx = reader.context();
  assert.ok(ctx);
  assert.ok(ctx.events.some(it => it.name === '重聚之约' && it.when === '2天后'));

  // Test card export and import
  const { script } = await createAuthoringService({ store, host: h.host }).exportScript();
  assert.ok(script.data.twoMoreThings.calendar?.items?.some(it => it.name === '重聚之约'));

  const preset = stateFromPreset(script.data.twoMoreThings);
  assert.ok(preset.calendar?.items?.some(it => it.name === '重聚之约'));

  const newTarget = createHarness().host.captureChat();
  const newStore = createPhoneStore({ target: newTarget, initialState: preset });
  assert.ok(newStore.read().calendar?.items?.some(it => it.name === '重聚之约'));

  // Delete event
  const itemToDelete = store.read().calendar.items.find(it => it.name === '重聚之约');
  await store.deleteCalendarEvent(itemToDelete.id);
  assert.ok(!store.read().calendar?.items?.some(it => it.name === '重聚之约'));
});

test('createCalendarReader falls back to internal calendar when external Gouhua is disabled/null', () => {
  const disabledGouhua = {
    apiVersion: 1,
    getPhoneCalendar: () => null,
    getPhoneCalendarContext: () => null,
  };
  const reader = createCalendarReader({
    apiProvider: () => disabledGouhua,
  });
  const month = reader.month(0);
  assert.ok(month, 'Month view should fallback to internal calendar when Gouhua returns null');
  assert.equal(typeof month.month, 'number');
  assert.ok(month.days.length >= 28);
});

test('createCalendarReader reads story date from STBaiBaiBook when messages have no time tags', async () => {
  const h = createHarness({
    messages: [
      { is_user: false, mes: '没有任何剧情标签的AI普通消息' },
    ],
  });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });

  // Mock global STBaiBaiBook
  globalThis.STBaiBaiBook = {
    apiVersion: 1,
    getSnapshot: () => ({
      state: { time: '2026.5.20 12:00' },
    }),
  };

  await store.saveCalendarEvent({
    name: '告白日',
    type: 'festival',
    month: 5,
    day: 20,
    days: 1,
  });

  try {
    const reader = createCalendarReader({ store, target });
    const month = reader.month(0);
    assert.equal(month.year, 2026);
    assert.equal(month.month, 5);
    // Day 20 should be marked as today
    const day20 = month.days.find(d => d.day === 20 && !d.outsideMonth);
    assert.ok(day20, 'Day 20 should exist in month view');
    assert.equal(day20.isToday, true, 'Day 20 should be marked as isToday');

    const ctx = reader.context();
    assert.ok(ctx);
    assert.equal(ctx.today, '2026年5月20日');
    assert.ok(ctx.events.some(e => e.name === '告白日' && e.when === '今天'));
  } finally {
    delete globalThis.STBaiBaiBook;
  }
});

test('merged todo and calendar: todo event type, AI schedule todo type, and chat todo projection into calendar', async () => {
  const { renderCalendar } = await import('../src/ui/calendar.js');
  const { renderTodoCandidate } = await import('../src/ui/todos.js');
  const h = createHarness({
    messages: [
      { is_user: false, mes: '✧2026年5月22日 09:42 星期五|星光镇 - 广场|晴✧\n今天天气不错。' },
    ],
  });
  const target = h.host.captureChat();
  const store = createPhoneStore({ target });
  await store.saveContact('', { name: '林舟' });
  const lin = store.read().contacts[0];

  // 1. Save a calendar event with type: 'todo'
  await store.saveCalendarEvent({
    name: '购买花种',
    type: 'todo',
    month: 5,
    day: 22,
    days: 1,
    note: '去杂货店',
  });
  const savedTodoEvent = store.read().calendar.items.find(it => it.name === '购买花种');
  assert.ok(savedTodoEvent);
  assert.equal(savedTodoEvent.type, 'todo');
  assert.equal(savedTodoEvent.done, false);

  // Toggle completion on calendar todo
  await store.toggleCalendarEventDone(savedTodoEvent.id);
  assert.equal(store.read().calendar.items.find(it => it.id === savedTodoEvent.id).done, true);

  // 2. Chat todo candidate confirmed -> projected into Calendar month view
  await store.appendMessages(lin.id, [{ id: 'm1', role: 'assistant', text: '明晚一起吃饭' }], {
    todoCandidates: [{
      id: 'todo:dinner',
      status: 'candidate',
      title: '和林舟晚饭',
      startAt: '2026年5月23日 18:00',
      endAt: '',
      participantIds: ['@user', lin.id],
      sourceMessageIds: ['m1'],
    }],
  });
  await store.confirmTodo('todo:dinner');

  const reader = createCalendarReader({ store, target });
  const month = reader.month(0);
  const day22 = month.days.find(d => d.day === 22);
  const day23 = month.days.find(d => d.day === 23);
  assert.ok(day22.items.some(it => it.name === '购买花种' && it.type === 'todo' && it.done === true));
  assert.ok(day23.items.some(it => it.name === '和林舟晚饭' && it.type === 'todo' && it.todoId === 'todo:dinner'));

  // 3. Calendar UI renders 节日/纪念日/待办事项 options and todo cards
  const html = renderCalendar(store.read(), {
    ui: { calendarFormOpen: true, calendarDraft: { type: 'todo', month: 5, day: 22, days: 1 } },
    calendar: month,
  });
  assert.ok(html.includes('<option value="festival"'));
  assert.ok(html.includes('<option value="anniversary"'));
  assert.ok(html.includes('<option value="todo" selected>待办事项</option>'));
  assert.ok(html.includes('和林舟晚饭'));

  // 4. In-chat confirmed todo card triggers open-todo-calendar
  const cardHtml = renderTodoCandidate(
    store.read().todos[0],
    store.read(),
    { todoEditing: new Set(), todoDrafts: new Map() },
    new Set(),
  );
  assert.ok(cardHtml.includes('data-action="open-todo-calendar"'));

  // 5. Remember last view setting persists in store and renders in appearance settings
  assert.equal(Boolean(store.read().rememberLastView), false);
  await store.setRememberLastView(true);
  assert.equal(store.read().rememberLastView, true);
});
