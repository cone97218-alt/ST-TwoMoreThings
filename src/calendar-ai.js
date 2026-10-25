import { parseJsonObject } from './api.js';
import { readPhoneTime } from './time.js';
import { parseDateString } from './calendar-engine.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';

export function createCalendarAiService({ contextReader, modelClient, target, store }) {
  return {
    async conceiveFestivals({ setting = '', count = 3 } = {}) {
      const sources = await contextReader.readDirectorySources({ readMemory: true });
      const payload = sanitizePhoneContext({
        contacts: sources.contacts || [],
        userInstruction: setting ? `用户特别指定的世界观/要求：${setting}` : '',
        requestedCount: count,
      });
      const state = store?.read?.() || {};
      const activePreset = getActivePreset(state);

      const storyHistoryText = (sources.story || []).map(item => `${item.speaker || ''}：${item.text}`).join('\n\n');
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: sources.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: sources.storyMemory || '',
        phoneContext: payload,
      }, 'festival_conceive', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: 'AI 节日构想',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(payload) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const parsed = parseJsonObject(reply);
      const festivals = Array.isArray(parsed?.festivals) ? parsed.festivals : [];
      return festivals.map((item, index) => ({
        id: `ai:festival:${Date.now().toString(36)}:${index}`,
        name: String(item.name || '未命名节日').trim(),
        type: item.type === 'anniversary' ? 'anniversary' : 'festival',
        month: Math.min(12, Math.max(1, Number(item.month) || 1)),
        day: Math.min(31, Math.max(1, Number(item.day) || 1)),
        days: Math.max(1, Number(item.days) || 1),
        note: String(item.note || '').trim(),
        selected: true,
      }));
    },

    async deduceSchedules({ days = 3, focus = '全部' } = {}) {
      const sources = await contextReader.readDirectorySources({ readMemory: true });
      const messages = target?.messages || [];
      const timeInfo = readPhoneTime(messages);
      let currentDateStr = '';
      if (timeInfo?.date) {
        currentDateStr = timeInfo.date;
      } else {
        const now = new Date();
        currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
      }
      const payload = sanitizePhoneContext({
        currentStoryTime: currentDateStr,
        contacts: sources.contacts || [],
        deduceDays: days,
        focusPreference: focus,
      });
      const state = store?.read?.() || {};
      const activePreset = getActivePreset(state);

      const storyHistoryText = (sources.story || []).map(item => `${item.speaker || ''}：${item.text}`).join('\n\n');
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: sources.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: sources.storyMemory || '',
        phoneContext: payload,
      }, 'schedule_deduce', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: 'AI 日程推演',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(payload) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const parsed = parseJsonObject(reply);
      const schedules = Array.isArray(parsed?.schedules) ? parsed.schedules : [];
      return schedules.map((item, index) => ({
        id: `ai:schedule:${Date.now().toString(36)}:${index}`,
        title: String(item.title || '行程安排').trim(),
        type: 'todo',
        month: Math.min(12, Math.max(1, Number(item.month) || 1)),
        day: Math.min(31, Math.max(1, Number(item.day) || 1)),
        time: String(item.time || '').trim(),
        location: String(item.location || '').trim(),
        note: String(item.note || '').trim(),
        days: Math.max(1, Number(item.days) || 1),
        selected: true,
      }));
    },
  };
}
