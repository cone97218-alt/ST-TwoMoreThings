import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import {
  defaultWorkdayConfig,
  evaluateDayType,
  matchesTimeSlot,
  timeToMinutes,
  resolveWorkdayHolidayPrompt,
} from '../src/calendar-engine.js';
import { createCalendarReader } from '../src/calendar.js';
import { compilePromptPreset } from '../src/preset-engine.js';
import { createBackflowService } from '../src/context.js';

test('workday-holiday engine: timeToMinutes and matchesTimeSlot 24h ranges', () => {
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:59'), 1439);
  assert.equal(timeToMinutes('invalid'), null);

  // 常规白天区间 09:00 - 18:00
  const daytimeSlot = { startTime: '09:00', endTime: '18:00' };
  assert.equal(matchesTimeSlot(timeToMinutes('09:00'), daytimeSlot), true);
  assert.equal(matchesTimeSlot(timeToMinutes('14:30'), daytimeSlot), true);
  assert.equal(matchesTimeSlot(timeToMinutes('18:00'), daytimeSlot), false);
  assert.equal(matchesTimeSlot(timeToMinutes('08:59'), daytimeSlot), false);

  // 跨午夜区间 23:00 - 07:00
  const overnightSlot = { startTime: '23:00', endTime: '07:00' };
  assert.equal(matchesTimeSlot(timeToMinutes('23:00'), overnightSlot), true);
  assert.equal(matchesTimeSlot(timeToMinutes('02:30'), overnightSlot), true);
  assert.equal(matchesTimeSlot(timeToMinutes('06:59'), overnightSlot), true);
  assert.equal(matchesTimeSlot(timeToMinutes('07:00'), overnightSlot), false);
  assert.equal(matchesTimeSlot(timeToMinutes('12:00'), overnightSlot), false);
});

test('workday-holiday engine: workday custom weekdays and festival override vs overlap', () => {
  const cal = { kind: 'gregorian', weekdayCycle: 7 };
  // 周三: 2026-11-04 (weekday 3)
  const wednesday = { year: 2026, month: 11, day: 4, weekday: 3 };
  // 周日: 2026-11-08 (weekday 0)
  const sunday = { year: 2026, month: 11, day: 8, weekday: 0 };

  // 1. 默认周一至周五工作日
  const config = defaultWorkdayConfig();
  assert.deepEqual(config.workdays, [1, 2, 3, 4, 5]);

  const wedType = evaluateDayType(wednesday, cal, config, []);
  assert.equal(wedType.isWorkday, true);
  assert.equal(wedType.isHoliday, false);
  assert.equal(wedType.isFestival, false);

  const sunType = evaluateDayType(sunday, cal, config, []);
  assert.equal(sunType.isWorkday, false);
  assert.equal(sunType.isHoliday, true);

  // 2. 自定义工作日勾选 (例如单休: 周一到周六工作，仅周日休息)
  const singleRestConfig = { ...config, workdays: [1, 2, 3, 4, 5, 6] };
  const saturday = { year: 2026, month: 11, day: 7, weekday: 6 };
  assert.equal(evaluateDayType(saturday, cal, singleRestConfig, []).isWorkday, true);

  // 3. 节日与工作日重合：默认 festival_overrides 覆盖工作日
  const festivalWednesday = [{ id: 'f1', type: 'festival', month: 11, day: 4, days: 1, name: '校庆' }];
  const overrideRes = evaluateDayType(wednesday, cal, config, festivalWednesday);
  assert.equal(overrideRes.isFestival, true);
  assert.equal(overrideRes.isWorkday, false);
  assert.equal(overrideRes.isHoliday, true);

  // 4. 节日与工作日重合：overlap 策略叠加
  const overlapConfig = { ...config, holidayOverlapStrategy: 'overlap' };
  const overlapRes = evaluateDayType(wednesday, cal, overlapConfig, festivalWednesday);
  assert.equal(overlapRes.isFestival, true);
  assert.equal(overlapRes.isWorkday, true);
  assert.equal(overlapRes.isHoliday, true);
});

test('workday-holiday engine: resolveWorkdayHolidayPrompt with 24h slots and day-specific prompts', () => {
  const cal = { kind: 'gregorian', weekdayCycle: 7 };
  const config = {
    enabled: true,
    workdays: [1, 2, 3, 4, 5],
    holidayOverlapStrategy: 'festival_overrides',
    workdayPrompt: '【工作日默认】',
    holidayPrompt: '【节假日默认】',
    timeSlots: [
      {
        id: 'slot-1',
        enabled: true,
        dayType: 'workday',
        startTime: '09:00',
        endTime: '18:00',
        prompt: '【工作日白天时段】正在上班',
      },
      {
        id: 'slot-2',
        enabled: true,
        dayType: '1', // 仅周一生效
        startTime: '08:00',
        endTime: '09:00',
        prompt: '【周一早晨特例】周一例会准备中',
      },
    ],
  };

  // 1. 周三下午 14:00 (工作日白天时段)
  const res1 = resolveWorkdayHolidayPrompt(
    { date: '2026-11-04', weekday: '周三', time: '14:00' },
    cal,
    config,
    [],
  );
  assert.ok(res1);
  assert.equal(res1.isWorkday, true);
  assert.equal(res1.slotMatched, true);
  assert.equal(res1.prompt, '【工作日白天时段】正在上班');

  // 2. 周三晚上 20:00 (无特定时段命中，回退到工作日基础提示词)
  const res2 = resolveWorkdayHolidayPrompt(
    { date: '2026-11-04', weekday: '周三', time: '20:00' },
    cal,
    config,
    [],
  );
  assert.ok(res2);
  assert.equal(res2.isWorkday, true);
  assert.equal(res2.slotMatched, false);
  assert.equal(res2.prompt, '【工作日默认】');

  // 3. 周一早晨 08:30 (命中周一特有时段)
  const res3 = resolveWorkdayHolidayPrompt(
    { date: '2026-11-02', weekday: '周一', time: '08:30' },
    cal,
    config,
    [],
  );
  assert.ok(res3);
  assert.equal(res3.prompt, '【周一早晨特例】周一例会准备中');

  // 4. 周日 (节假日基础提示词)
  const res4 = resolveWorkdayHolidayPrompt(
    { date: '2026-11-08', weekday: '周日', time: '14:00' },
    cal,
    config,
    [],
  );
  assert.ok(res4);
  assert.equal(res4.isHoliday, true);
  assert.equal(res4.prompt, '【节假日默认】');

  // 5. 开关未启用时返回 null
  const resDisabled = resolveWorkdayHolidayPrompt(
    { date: '2026-11-04', weekday: '周三', time: '14:00' },
    cal,
    { ...config, enabled: false },
    [],
  );
  assert.equal(resDisabled, null);
});

test('preset-engine: {{workday_holiday_prompt}} macro integration and conditional injection', () => {
  const preset = {
    id: 'test-preset',
    name: '测试预设',
    entries: [
      {
        id: 'entry_workday',
        role: 'system',
        enabled: true,
        content: '[作息指引]\n{{workday_holiday_prompt}}\n[结束]',
      },
      {
        id: 'entry_empty_workday',
        role: 'system',
        enabled: true,
        content: '{{workday_holiday_prompt}}',
      },
    ],
  };

  // 1. 开启且存在匹配作息提示词时成功替换
  const stateEnabled = {
    calendar: {
      workdayConfig: { enabled: true },
    },
  };
  const contextDataActive = {
    workdayHoliday: {
      isWorkday: true,
      prompt: '角色正在办公中。',
    },
  };
  const msgsActive = compilePromptPreset(preset, contextDataActive, 'chat', stateEnabled);
  assert.equal(msgsActive.length, 2);
  assert.ok(msgsActive[0].content.includes('角色正在办公中。'));
  assert.ok(msgsActive[1].content.includes('角色正在办公中。'));
  assert.ok(msgsActive[1].content.includes('[工作日与作息提示词]'));

  // 2. 未开启或无作息提示词时跳过纯宏条目，清理宏
  const stateDisabled = {
    calendar: {
      workdayConfig: { enabled: false },
    },
  };
  const msgsDisabled = compilePromptPreset(preset, contextDataActive, 'chat', stateDisabled);
  // 纯宏条目 entry_empty_workday 被安全跳过
  assert.equal(msgsDisabled.length, 1);
  assert.ok(!msgsDisabled[0].content.includes('{{workday_holiday_prompt}}'));
  assert.ok(!msgsDisabled[0].content.includes('角色正在办公中。'));
});

test('store & character binding: workdayConfig bound to character cards and editable calendar events', async () => {
  const harness = createHarness({ characterName: 'TestHero' });
  const target = harness.host.captureChat();
  const store = createPhoneStore({ target });

  // 1. 保存作息配置并验证持久化和角色绑定
  await store.setCalendarWorkdayConfig({
    enabled: true,
    workdays: [1, 2, 3, 4], // 周一到周四工作
    workdayPrompt: '英雄出征巡逻中',
    holidayPrompt: '英雄休息中',
    timeSlots: [
      {
        dayType: 'workday',
        startTime: '10:00',
        endTime: '12:00',
        prompt: '巡逻上午时段',
        enabled: true,
      },
    ],
  });

  const state1 = store.read();
  assert.equal(state1.calendar?.workdayConfig?.enabled, true);
  assert.deepEqual(state1.calendar?.workdayConfig?.workdays, [1, 2, 3, 4]);
  assert.equal(state1.calendar?.workdayConfig?.workdayPrompt, '英雄出征巡逻中');
  assert.equal(state1.calendar?.workdayConfig?.timeSlots?.length, 1);

  // 2. 添加日历节日并可修改保存 (优化项)
  await store.saveCalendarEvent({
    id: 'my-festival-1',
    name: '建城纪念日',
    type: 'anniversary',
    month: 5,
    day: 20,
    days: 1,
    note: '最初的版本',
  });

  const stateBeforeEdit = store.read();
  const eventBefore = stateBeforeEdit.calendar?.items?.find(it => it.id === 'my-festival-1');
  assert.equal(eventBefore.name, '建城纪念日');
  assert.equal(eventBefore.note, '最初的版本');

  // 修改并保存：名称修改为 '王国建城盛典'，天数改为 3 天，备注修改
  await store.saveCalendarEvent({
    id: 'my-festival-1',
    name: '王国建城盛典',
    type: 'festival',
    month: 5,
    day: 20,
    days: 3,
    note: '修改后的大型庆典',
  });

  const stateAfterEdit = store.read();
  const eventAfter = stateAfterEdit.calendar?.items?.find(it => it.id === 'my-festival-1');
  assert.equal(eventAfter.name, '王国建城盛典');
  assert.equal(eventAfter.type, 'festival');
  assert.equal(eventAfter.days, 3);
  assert.equal(eventAfter.note, '修改后的大型庆典');

  // 3. 添加待办事项，修改日历待办时同步更新 state.todos
  await store.saveTodosFromSchedule([
    {
      title: '采购行军物资',
      month: 6,
      day: 15,
      time: '14:00',
    },
  ]);

  const stateWithTodo = store.read();
  const todoItem = stateWithTodo.todos[0];
  assert.ok(todoItem);
  assert.equal(todoItem.title, '采购行军物资');

  // 在日历中修改该待办 (带 todoId)
  await store.saveCalendarEvent({
    id: todoItem.id,
    todoId: todoItem.id,
    name: '紧急采购精良武器装备',
    type: 'todo',
    month: 6,
    day: 16,
    days: 1,
    note: '改期至16日',
  });

  const stateAfterTodoEdit = store.read();
  const updatedTodo = stateAfterTodoEdit.todos.find(t => t.id === todoItem.id);
  assert.equal(updatedTodo.title, '紧急采购精良武器装备');
  assert.equal(updatedTodo.month, 6);
  assert.equal(updatedTodo.day, 16);
});

test('workday-holiday: authoring export and import preserves workdayConfig', async () => {
  const { stateFromPreset } = await import('../src/authoring.js');
  const dummyPreset = {
    schemaVersion: 1,
    theme: 'night',
    injectEnabled: true,
    contacts: [{ id: 'c1', name: 'Alice' }],
    groups: [],
    calendar: {
      items: [{ id: 'fest-1', name: 'Test', type: 'festival', month: 1, day: 1 }],
      workdayConfig: {
        enabled: true,
        workdays: [1, 2, 3, 4],
        holidayOverlapStrategy: 'overlap',
        workdayPrompt: 'Custom Workday',
        holidayPrompt: 'Custom Holiday',
        timeSlots: [],
      },
    },
  };

  const restored = stateFromPreset(dummyPreset);
  assert.ok(restored.calendar?.workdayConfig);
  assert.equal(restored.calendar.workdayConfig.enabled, true);
  assert.deepEqual(restored.calendar.workdayConfig.workdays, [1, 2, 3, 4]);
  assert.equal(restored.calendar.workdayConfig.workdayPrompt, 'Custom Workday');
});

test('backflow: workday & holiday prompt injection into story main context', async () => {
  const harness = createHarness({
    characterName: 'Hero',
    messages: [
      { is_user: false, mes: '在王都旅店休整。<!-- SDC-end date=2026-11-04 | weekday=周三 | time=14:00 -->' },
    ],
  });
  const target = harness.host.captureChat();
  const store = createPhoneStore({ target });
  const calendar = createCalendarReader({ store, target });

  // 1. 未开启 injectStory 时不带入正文
  await store.setCalendarWorkdayConfig({
    enabled: true,
    injectStory: false,
    workdays: [1, 2, 3, 4, 5],
    workdayPrompt: '【工作日】正在商会办公。',
  });
  const backflowDisabled = createBackflowService({ target, store, calendar });
  const resultDisabled = await backflowDisabled.prepare('normal');
  assert.equal(resultDisabled, '');

  // 2. 开启 injectStory 后成功带入正文
  await store.setCalendarWorkdayConfig({
    enabled: true,
    injectStory: true,
    workdays: [1, 2, 3, 4, 5],
    workdayPrompt: '【工作日】正在商会办公。',
  });
  const backflowEnabled = createBackflowService({ target, store, calendar });
  const resultEnabled = await backflowEnabled.prepare('normal');
  assert.ok(resultEnabled.includes('[当前作息：'));
  assert.ok(resultEnabled.includes('【工作日】正在商会办公。'));
});
