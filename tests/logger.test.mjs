import test from 'node:test';
import assert from 'node:assert/strict';
import { logger, detectRequestTitle } from '../src/logger.js';
import { renderLogSettings } from '../src/ui/settings.js';
import { renderCalendar } from '../src/ui/calendar.js';
import { renderPhoneNotice } from '../src/ui/notifications.js';

test('logger: addLog, getLogs, clearLogs, and subscribers', () => {
  logger.clearLogs();
  assert.equal(logger.getLogs().length, 0);

  let notified = 0;
  const unsub = logger.subscribe(() => notified++);

  logger.addLog({
    title: '私聊短信生成',
    systemPrompt: '你是角色助手',
    messages: [{ role: 'user', content: '你好' }],
    reply: '{"text":"你好呀"}',
  });

  assert.equal(notified, 1);
  const logs = logger.getLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].title, '私聊短信生成');
  assert.equal(logs[0].systemPrompt, '你是角色助手');
  assert.equal(logs[0].reply, '{"text":"你好呀"}');
  assert.equal(logs[0].error, null);

  logger.clearLogs();
  assert.equal(logger.getLogs().length, 0);
  assert.equal(notified, 2);
  unsub();
});

test('logger: detectRequestTitle identifies actions from system prompt', () => {
  assert.equal(detectRequestTitle({ system: '你在手机中扮演指定联系人，给用户发短信' }), '私聊短信生成');
  assert.equal(detectRequestTitle({ system: '续写指定手机群里的聊天。一次考虑group.members' }), '群聊多角色续写');
  assert.equal(detectRequestTitle({ system: '为手机ainstgram生成公开可见的日常动态' }), 'Ainstagram 动态生成');
  assert.equal(detectRequestTitle({ system: '回应用户在ainstgram动态下的留言' }), '动态互动回复');
  assert.equal(detectRequestTitle({ system: '在公众论坛发表帖子' }), 'BBS 论坛生成');
  assert.equal(detectRequestTitle({ system: '世界观与民俗构想助手' }), 'AI 节日构想');
  assert.equal(detectRequestTitle({ system: '日常日程推演助手' }), 'AI 日程推演');
  assert.equal(detectRequestTitle({ system: '把手机照片描述转为绘图提示' }), '生图描述生成');
  assert.equal(detectRequestTitle({ label: '自定义标题' }), '自定义标题');
});

test('logger: setLastBackflowPrompt and getLastBackflowPrompt', () => {
  logger.setLastBackflowPrompt('手机参考；仅供后续剧情参考');
  assert.equal(logger.getLastBackflowPrompt(), '手机参考；仅供后续剧情参考');
  logger.setLastBackflowPrompt('');
  assert.equal(logger.getLastBackflowPrompt(), '');
});

test('settings UI: renderLogSettings renders backflow and model logs', () => {
  logger.clearLogs();
  logger.addLog({
    title: '私聊回复',
    systemPrompt: '测试系统提示词',
    messages: [{ role: 'user', content: '测试内容' }],
    reply: '测试回答结果',
  });

  const state = { injectEnabled: true };
  const logs = logger.getLogs();
  const ui = { expandedLogs: new Set([logs[0].id]) };
  const html = renderLogSettings(state, ui, { logger, backflowPreview: '准备注入的手机参考内容' });

  assert.ok(html.includes('logs-manager'));
  assert.ok(html.includes('下一轮注入主聊天内容'));
  assert.ok(html.includes('准备注入的手机参考内容'));
  assert.ok(html.includes('data-action="refresh-backflow-preview"'));
  assert.ok(html.includes('data-action="copy-backflow-prompt"'));
  assert.ok(html.includes('私聊回复'));
  assert.ok(html.includes('测试系统提示词'));
  assert.ok(html.includes('测试回答结果'));
  assert.ok(html.includes('data-action="clear-logs"'));
});

test('calendar UI: modal backdrop and buttons render when calendarAiOpen is true', () => {
  const state = {};
  const calendar = {
    month: 10,
    monthName: '10月',
    yearLabel: '2026年',
    columns: 7,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    leading: 0,
    days: [{ day: 1, label: '10月1日', items: [] }],
  };

  const ui = {
    calendarAiOpen: true,
    calendarAiTab: 'festivals',
    calendarAiFestivals: [
      { name: '丰收节', month: 10, day: 15, days: 2, note: '秋季丰收庆典', selected: true },
    ],
    calendarAiSchedules: [],
  };

  const html = renderCalendar(state, { ui, calendar });
  assert.ok(html.includes('calendar-modal-backdrop'));
  assert.ok(html.includes('calendar-modal-dialog'));
  assert.ok(html.includes('丰收节'));
  assert.ok(html.includes('加入日历'));
  assert.ok(!html.includes('event.stopPropagation()'));
});

test('notifications: calendar-ai notice renders banner with jump action', () => {
  const notice = {
    kind: 'calendar-ai',
    tab: 'festivals',
    title: '节日构想完成',
    content: '已构想 3 个节日，点击回到日历',
  };
  const html = renderPhoneNotice({}, notice);
  assert.ok(html.includes('phone-top-notice'));
  assert.ok(html.includes('data-action="open-phone-notice"'));
  assert.ok(html.includes('节日构想完成'));
  assert.ok(html.includes('已构想 3 个节日，点击回到日历'));
});
