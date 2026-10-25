import { createPhoneCalendarApi, defaultGregorianCalendar, BUILTIN_FESTIVALS, parseDateString, isValidDay } from './calendar-engine.js';
import { readPhoneTime, latestAiFloor } from './time.js';
import { readTodos } from './todos.js';
import { displayName } from './profiles.js';

export const CALENDAR_PROMPT = 'calendar是已有的节日和纪念日，仅作可选话题线索。结合当前剧情、人物关系及各人实际知情判断是否提起，不因日历可见就让所有人知道私人纪念日，不强制提醒或安排活动；未来日期不代表庆祝或约定已经发生。';

function todoParticipantLabel(todo, state) {
  return (todo.participantIds || []).map(id => id === '@user'
    ? (state.userProfile?.name || '我')
    : displayName((state.contacts || []).find(person => person.id === id) || { name: '已移除联系人' })).join('、');
}

function buildTodoCalendarItems(state, calendar, today) {
  const existingIds = new Set((state.calendar?.items || []).map(it => it?.id));
  const monthCount = calendar?.months?.length || 12;
  return readTodos(state)
    .filter(todo => todo && (todo.status === 'open' || todo.status === 'done') && String(todo.title || '').trim() && !existingIds.has(todo.id))
    .map(todo => {
      const parsed = (Number.isInteger(todo.month) && Number.isInteger(todo.day))
        ? { month: todo.month, day: todo.day }
        : (parseDateString(todo.startAt, '', calendar)
          || parseDateString(todo.sourceBatch?.clock?.date, '', calendar)
          || (today ? { month: today.month, day: today.day } : { month: 1, day: 1 }));
      const month = Math.min(Math.max(1, Number(parsed.month) || 1), monthCount);
      const maxDays = calendar?.months?.[month - 1]?.days || 31;
      const day = Math.min(Math.max(1, Number(parsed.day) || 1), maxDays);
      const timeRange = [todo.startAt, todo.endAt].filter(Boolean).join(' — ');
      const people = todoParticipantLabel(todo, state);
      const note = [timeRange, people].filter(Boolean).join(' · ');
      return {
        id: todo.id,
        todoId: todo.id,
        name: String(todo.title).trim(),
        type: 'todo',
        status: todo.status,
        done: todo.status === 'done',
        month,
        day,
        days: 1,
        note,
      };
    });
}

export function createCalendarReader({
  store = null,
  target = null,
  apiProvider = () => globalThis.STSevenDaysCal,
} = {}) {
  const externalApi = () => {
    try {
      const value = apiProvider?.();
      return value?.apiVersion === 1 ? value : null;
    } catch {
      return null;
    }
  };

  // UI 月历源：若正文有剧情时间则以剧情时间为准，否则以系统当前现实时间为准，保证界面始终有日历可读
  const uiSource = () => {
    const state = store?.read?.() || {};
    const messages = target?.messages || [];
    const timeInfo = readPhoneTime(messages);
    const desc = state.calendar?.descriptor || {};
    const calendar = { ...defaultGregorianCalendar(), ...desc };
    if (desc.kind === 'custom') {
      calendar.kind = 'custom';
      calendar.id = desc.id || 'custom-calendar';
    }

    let rawDate = (timeInfo?.source === 'story' && timeInfo?.date) ? timeInfo.date : null;
    let rawWeekday = timeInfo?.source === 'story' ? timeInfo?.weekday : null;

    // 若时间戳未包含剧情日期，智能扫描最新AI楼层中的剧情时间标识
    if (!rawDate) {
      const lastMes = latestAiFloor(messages)?.message?.mes || '';
      const bbsMatch = /(?:<bbs_(?:start|end)\b[^>]*>([\s\S]*?)<\/bbs_(?:start|end)>)/iu.exec(lastMes);
      if (bbsMatch?.[1]?.trim()) {
        rawDate = bbsMatch[1].trim();
      }
      if (!rawDate) {
        const textMatch = /(?:【|\(|\[|`|\b)(?:时间|日期|剧情时间|当前时间|Time|Date)\s*[:：=＝]\s*([^】\)\]`\r\n]+)(?:】|\)|\]|`|\b)/iu.exec(lastMes);
        if (textMatch) {
          rawDate = textMatch[1].trim();
        }
      }
    }
    if (!rawDate && globalThis.STBaiBaiBook) {
      try {
        const stateTime = globalThis.STBaiBaiBook.getVar?.('state.time') || globalThis.STBaiBaiBook.getSnapshot?.()?.state?.time;
        if (typeof stateTime === 'string' && stateTime.trim()) {
          rawDate = stateTime.trim();
        } else {
          const history = globalThis.STBaiBaiBook.getInjectedHistory?.() || globalThis.STBaiBaiBook.getHistory?.();
          const lastNode = Array.isArray(history?.nodes) ? history.nodes.at(-1) : null;
          const candidate = lastNode?.timeEnd || lastNode?.timeStart || lastNode?.timeLabel;
          if (typeof candidate === 'string' && candidate.trim()) {
            rawDate = candidate.trim();
          }
        }
      } catch {}
    }

    let today = null;
    if (rawDate) {
      today = parseDateString(rawDate, rawWeekday, calendar);
    }
    if (!today) {
      if (calendar.kind === 'custom') {
        const baseYear = Number(calendar.currentYear) || 1;
        today = {
          year: baseYear,
          month: 1,
          day: 1,
          eraLabel: calendar.era || '',
          weekday: 1,
        };
      } else {
        const now = new Date();
        today = {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          eraLabel: '',
          weekday: now.getDay(),
        };
      }
    }
    const disableBuiltin = Boolean(state.calendar?.descriptor?.disableBuiltinFestivals || state.calendar?.disableBuiltin);
    const customItems = state.calendar?.items || [];
    if (today && !isValidDay(today, calendar)) {
      const monthCount = calendar.months?.length || 12;
      const month = Math.min(Math.max(1, (today.month - 1) % monthCount + 1), monthCount);
      const maxDays = calendar.months?.[month - 1]?.days || 28;
      today = {
        ...today,
        month,
        day: Math.min(Math.max(1, today.day), maxDays),
      };
    }
    const todoItems = buildTodoCalendarItems(state, calendar, today);
    const items = [...(disableBuiltin ? [] : BUILTIN_FESTIVALS), ...customItems, ...todoItems];
    const weekdayReference = (today && Number.isInteger(today.weekday))
      ? { ...today, weekday: today.weekday }
      : null;
    return { calendar, items, today, weekdayReference };
  };

  // 模型上下文源：只有在正文建立了有效剧情日期，或者 query 明确提及某节日时才提供参考，不无中生有编造倒计时
  const contextSource = () => {
    const state = store?.read?.() || {};
    const messages = target?.messages || [];
    const timeInfo = readPhoneTime(messages);
    const desc = state.calendar?.descriptor || {};
    const calendar = { ...defaultGregorianCalendar(), ...desc };
    if (desc.kind === 'custom') {
      calendar.kind = 'custom';
      calendar.id = desc.id || 'custom-calendar';
    }

    let rawDate = (timeInfo?.source === 'story' && timeInfo?.date) ? timeInfo.date : null;
    let rawWeekday = timeInfo?.weekday;
    if (!rawDate) {
      const lastMes = latestAiFloor(messages)?.message?.mes || '';
      const bbsMatch = /(?:<bbs_(?:start|end)\b[^>]*>([\s\S]*?)<\/bbs_(?:start|end)>)/iu.exec(lastMes);
      if (bbsMatch?.[1]?.trim()) {
        rawDate = bbsMatch[1].trim();
      }
      if (!rawDate) {
        const textMatch = /(?:【|\(|\[|`|\b)(?:时间|日期|剧情时间|当前时间|Time|Date)\s*[:：=＝]\s*([^】\)\]`\r\n]+)(?:】|\)|\]|`|\b)/iu.exec(lastMes);
        if (textMatch) {
          rawDate = textMatch[1].trim();
        }
      }
    }
    if (!rawDate && globalThis.STBaiBaiBook) {
      try {
        const stateTime = globalThis.STBaiBaiBook.getVar?.('state.time') || globalThis.STBaiBaiBook.getSnapshot?.()?.state?.time;
        if (typeof stateTime === 'string' && stateTime.trim()) {
          rawDate = stateTime.trim();
        } else {
          const history = globalThis.STBaiBaiBook.getInjectedHistory?.() || globalThis.STBaiBaiBook.getHistory?.();
          const lastNode = Array.isArray(history?.nodes) ? history.nodes.at(-1) : null;
          const candidate = lastNode?.timeEnd || lastNode?.timeStart || lastNode?.timeLabel;
          if (typeof candidate === 'string' && candidate.trim()) {
            rawDate = candidate.trim();
          }
        }
      } catch {}
    }

    let today = null;
    if (rawDate) {
      today = parseDateString(rawDate, rawWeekday, calendar);
    }
    const disableBuiltin = Boolean(state.calendar?.descriptor?.disableBuiltinFestivals || state.calendar?.disableBuiltin);
    const customItems = state.calendar?.items || [];
    const items = [...(disableBuiltin ? [] : BUILTIN_FESTIVALS), ...customItems];
    if (today && !isValidDay(today, calendar)) {
      const monthCount = calendar.months?.length || 12;
      const month = Math.min(Math.max(1, (today.month - 1) % monthCount + 1), monthCount);
      const maxDays = calendar.months?.[month - 1]?.days || 28;
      today = {
        ...today,
        month,
        day: Math.min(Math.max(1, today.day), maxDays),
      };
    }
    const weekdayReference = (today && Number.isInteger(today.weekday))
      ? { ...today, weekday: today.weekday }
      : null;
    return { calendar, items, today, weekdayReference };
  };

  const uiApi = createPhoneCalendarApi({ read: uiSource });
  const contextApi = createPhoneCalendarApi({ read: contextSource });

  return {
    month(monthOffset = 0) {
      const ext = externalApi();
      if (ext) {
        try {
          const extMonth = ext.getPhoneCalendar?.({ monthOffset });
          if (extMonth) return extMonth;
        } catch {
          // 外部插件调用异常时平滑回退至内置引擎
        }
      }
      return uiApi.getPhoneCalendar({ monthOffset });
    },
    context(query = '') {
      const ext = externalApi();
      if (ext) {
        try {
          const extContext = ext.getPhoneCalendarContext?.({ query });
          if (extContext) return extContext;
        } catch {
          // 外部插件调用异常时平滑回退至内置引擎
        }
      }
      return contextApi.getPhoneCalendarContext({ query });
    },
    items() {
      const state = store?.read?.() || {};
      const disableBuiltin = Boolean(state.calendar?.descriptor?.disableBuiltinFestivals || state.calendar?.disableBuiltin);
      return [...(disableBuiltin ? [] : BUILTIN_FESTIVALS), ...(state.calendar?.items || [])];
    },
    async saveEvent(event) {
      if (!store?.saveCalendarEvent) throw new Error('当前未绑定存储接口。');
      return await store.saveCalendarEvent(event);
    },
    async deleteEvent(id) {
      if (!store?.deleteCalendarEvent) throw new Error('当前未绑定存储接口。');
      return await store.deleteCalendarEvent(id);
    },
  };
}
