import { createPhoneCalendarApi, defaultGregorianCalendar, BUILTIN_FESTIVALS, parseDateString, isValidDay, daysBetweenCalendarDates, resolveWorkdayHolidayPrompt, defaultWorkdayConfig } from './calendar-engine.js';
import { readPhoneTime, latestAiFloor } from './time.js';
import { readTodos } from './todos.js';
import { displayName } from './profiles.js';
import { defaultWeatherConfig, rollWeather, formatWeatherPrompt, resolveWeatherForDate, getSolarTerm, getHourlyTemperature } from './weather.js';

export function extractStoryLocation(messages) {
  if (!Array.isArray(messages) || !messages.length) return '';
  const lastMes = latestAiFloor(messages)?.message?.mes || '';
  if (!lastMes) return '';
  const worldMatch = /\[\[WORLD\]\][\s\S]*?location=([^|\]\r\n]+)/iu.exec(lastMes);
  if (worldMatch?.[1]?.trim()) return worldMatch[1].trim();
  const tagMatch = /(?:【|\(|\[|`|\b)(?:地点|位置|Location)\s*[:：=＝]\s*([^】\)\]`\r\n]+)(?:】|\)|\]|`|\b)/iu.exec(lastMes);
  if (tagMatch?.[1]?.trim()) return tagMatch[1].trim();
  return '';
}

export const CALENDAR_PROMPT = 'calendar是已有的节日和纪念日，仅作可选话题线索。结合当前剧情、人物关系及各人实际知情判断是否提起，不因日历可见就让所有人知道私人纪念日，不强制提醒或安排活动；未来日期不代表庆祝或约定已经发生。若事项跨越多天（注明共几天、当前为第几天），应贴合当前所处的天数阶段自然推进话题，避免将多日行程或节庆每天当成首日重复开场。';

function todoParticipantLabel(todo, state) {
  return (todo.participantIds || []).map(id => id === '@user'
    ? (state.userProfile?.name || '我')
    : displayName((state.contacts || []).find(person => person.id === id) || { name: '已移除联系人' })).join('、');
}

export function resolveTodoSpan(todo, calendar = defaultGregorianCalendar(), today = null) {
  const explicitDate = (Number.isInteger(todo?.month) && Number.isInteger(todo?.day))
    ? { year: today?.year ?? null, month: todo.month, day: todo.day }
    : parseDateString(todo?.startAt, '', calendar);
  let startParsed = explicitDate;
  let endParsed = todo?.endAt ? parseDateString(todo.endAt, '', calendar) : null;

  if (!startParsed && typeof todo?.startAt === 'string') {
    const rangeParts = todo.startAt.split(/\s*(?:—|--|－|~|～|至|到)\s*/);
    if (rangeParts.length === 2) {
      startParsed = parseDateString(rangeParts[0], '', calendar);
      if (!endParsed) endParsed = parseDateString(rangeParts[1], '', calendar);
    }
  }

  let days = Math.max(1, Number(todo?.days) || 1);
  if (days === 1 && startParsed && endParsed) {
    const yStart = startParsed.year ?? endParsed.year ?? today?.year ?? null;
    const yEnd = endParsed.year ?? startParsed.year ?? today?.year ?? null;
    const diff = daysBetweenCalendarDates(
      { ...startParsed, year: yStart },
      { ...endParsed, year: yEnd },
      calendar,
    );
    if (diff != null && diff >= 0) {
      days = diff + 1;
    }
  }

  let currentDay = null;
  if (days > 1 && today && startParsed) {
    const yStart = startParsed.year ?? today.year ?? null;
    let delta = daysBetweenCalendarDates({ ...startParsed, year: yStart }, today, calendar);
    if (delta != null && delta < 0 && today.year != null && startParsed.year == null) {
      delta = daysBetweenCalendarDates({ ...startParsed, year: today.year - 1 }, today, calendar);
    }
    if (delta != null && delta >= 0 && delta < days) {
      currentDay = delta + 1;
    }
  }

  return { startParsed, endParsed, hasExplicitDate: Boolean(startParsed), days, currentDay };
}

function buildTodoCalendarItems(state, calendar, today, { onlyExplicitMultiDay = false, viewerIds = null } = {}) {
  const existingIds = new Set((state.calendar?.items || []).flatMap(it => [it?.id, it?.todoId]).filter(Boolean));
  const monthCount = calendar?.months?.length || 12;
  return readTodos(state)
    .filter(todo => {
      if (!todo || !String(todo.title || '').trim() || existingIds.has(todo.id)) return false;
      if (onlyExplicitMultiDay) {
        if (todo.status !== 'open') return false;
        if (Array.isArray(viewerIds) && viewerIds.length && Array.isArray(todo.knownToIds) && todo.knownToIds.length) {
          if (!todo.knownToIds.some(id => viewerIds.includes(id))) return false;
        }
        const span = resolveTodoSpan(todo, calendar, today);
        return span.hasExplicitDate && span.days > 1;
      }
      return todo.status === 'open' || todo.status === 'done';
    })
    .map(todo => {
      const span = resolveTodoSpan(todo, calendar, today);
      const parsed = span.startParsed
        || parseDateString(todo.sourceBatch?.clock?.date, '', calendar)
        || (today ? { month: today.month, day: today.day } : { month: 1, day: 1 });
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
        days: span.days,
        note,
      };
    });
}

export function createCalendarReader({
  store = null,
  target = null,
  apiProvider = () => globalThis.STSevenDaysCal,
} = {}) {
  let activeViewerIds = null;
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
    const deduplicatedBuiltins = (disableBuiltin ? [] : BUILTIN_FESTIVALS).filter(b => !customItems.some(c => c.id === b.id || (c.name === b.name && c.month === b.month && c.day === b.day)));
    const uniqueCustomItems = [];
    const seenCustom = new Set();
    for (const it of customItems) {
      const key = `${it.name}|${it.month}|${it.day}`;
      if (!seenCustom.has(key)) {
        seenCustom.add(key);
        uniqueCustomItems.push(it);
      }
    }
    const items = [...deduplicatedBuiltins, ...uniqueCustomItems, ...todoItems];
    const weekdayReference = (today && Number.isInteger(today.weekday))
      ? { ...today, weekday: today.weekday }
      : null;
    const weatherConfig = state.calendar?.weatherConfig;
    let weather = null;
    if (weatherConfig?.enabled) {
      const month = today?.month || 1;
      const day = today?.day || 1;
      const year = today?.year || new Date().getFullYear();
      const isAncient = weatherConfig.worldEra === 'ancient' || (weatherConfig.worldEra === 'auto' && Boolean(calendar.era));
      const era = isAncient ? 'ancient' : 'modern';
      const loc = extractStoryLocation(messages) || weatherConfig.defaultCity || '';
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const manual = weatherConfig.weatherOverrides?.[dateKey] || weatherConfig.weatherOverrides?.[`${month}-${day}`];
      if (manual) {
        weather = {
          type: manual.type || 'cloudy',
          cn: manual.cn || '多云',
          temp: typeof manual.temp === 'number' ? manual.temp : 20,
          extreme: Boolean(manual.extreme),
          icon: manual.icon || '⛅',
          isManual: true,
          note: manual.note || '剧情锁定',
        };
      } else {
        const seed = `${dateKey}_${loc}_${weatherConfig.seedSalt || ''}`;
        weather = rollWeather(month, { seed });
      }
      weather.location = loc;
      weather.worldEra = era;
      const solarTerm = (weatherConfig.solarTermsEnabled !== false && calendar.kind !== 'custom')
        ? getSolarTerm(year, month, day)
        : null;
      if (solarTerm) weather.solarTerm = solarTerm;
      weather.prompt = formatWeatherPrompt(weather, {
        worldEra: era,
        timeStr: timeInfo?.time || '',
      });
    }
    return { calendar, items, today, weekdayReference, weather };
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
    const deduplicatedBuiltins = (disableBuiltin ? [] : BUILTIN_FESTIVALS).filter(b => !customItems.some(c => c.id === b.id || (c.name === b.name && c.month === b.month && c.day === b.day)));
    const uniqueCustomItems = [];
    const seenCustom = new Set();
    for (const it of customItems) {
      const key = `${it.name}|${it.month}|${it.day}`;
      if (!seenCustom.has(key)) {
        seenCustom.add(key);
        uniqueCustomItems.push(it);
      }
    }
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
    const multiDayTodoItems = buildTodoCalendarItems(state, calendar, today, {
      onlyExplicitMultiDay: true,
      viewerIds: activeViewerIds,
    });
    const items = [...deduplicatedBuiltins, ...uniqueCustomItems, ...multiDayTodoItems];
    const weekdayReference = (today && Number.isInteger(today.weekday))
      ? { ...today, weekday: today.weekday }
      : null;
    const weatherConfig = state.calendar?.weatherConfig;
    let weather = null;
    if (weatherConfig?.enabled && weatherConfig?.injectPrompt !== false) {
      const month = today?.month || 1;
      const day = today?.day || 1;
      const year = today?.year || new Date().getFullYear();
      const isAncient = weatherConfig.worldEra === 'ancient' || (weatherConfig.worldEra === 'auto' && Boolean(calendar.era));
      const era = isAncient ? 'ancient' : 'modern';
      const loc = extractStoryLocation(messages) || weatherConfig.defaultCity || '';
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const manual = weatherConfig.weatherOverrides?.[dateKey] || weatherConfig.weatherOverrides?.[`${month}-${day}`];
      if (manual) {
        weather = {
          type: manual.type || 'cloudy',
          cn: manual.cn || '多云',
          temp: typeof manual.temp === 'number' ? manual.temp : 20,
          extreme: Boolean(manual.extreme),
          icon: manual.icon || '⛅',
          isManual: true,
          note: manual.note || '剧情锁定',
        };
      } else {
        const seed = `${dateKey}_${loc}_${weatherConfig.seedSalt || ''}`;
        weather = rollWeather(month, { seed });
      }
      weather.location = loc;
      weather.worldEra = era;
      const solarTerm = (weatherConfig.solarTermsEnabled !== false && calendar.kind !== 'custom')
        ? getSolarTerm(year, month, day)
        : null;
      if (solarTerm) weather.solarTerm = solarTerm;
      weather.prompt = formatWeatherPrompt(weather, {
        worldEra: era,
        timeStr: timeInfo?.time || '',
      });
    }
    return { calendar, items, today, weekdayReference, weather };
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
    context(query = '', options = {}) {
      activeViewerIds = options?.viewerIds || null;
      try {
        const ext = externalApi();
        if (ext) {
          try {
            const extContext = ext.getPhoneCalendarContext?.({ query });
            if (extContext) {
              if (Array.isArray(extContext.events) && extContext.events.some(e => Number(e?.days) > 1 && !String(e?.when || '').includes('共'))) {
                const { calendar, today } = contextSource();
                const enrichedEvents = extContext.events.map(e => {
                  const totalDays = Math.max(1, Number(e.days) || 1);
                  if (totalDays <= 1 || String(e.when || '').includes('共')) return e;
                  let currentDay = Number.isInteger(e.currentDay) && e.currentDay >= 1 ? e.currentDay : null;
                  if (currentDay == null && (e.when === '进行中' || e.when === '今天')) {
                    if (today && Number.isInteger(e.month) && Number.isInteger(e.day)) {
                      let delta = daysBetweenCalendarDates({ year: today.year ?? null, month: e.month, day: e.day }, today, calendar);
                      if (delta != null && delta < 0 && today.year != null) {
                        delta = daysBetweenCalendarDates({ year: today.year - 1, month: e.month, day: e.day }, today, calendar);
                      }
                      currentDay = (delta != null && delta >= 0 && delta < totalDays) ? delta + 1 : 1;
                    } else {
                      currentDay = 1;
                    }
                  }
                  const when = currentDay != null
                    ? `进行中（共${totalDays}天，当前为第${currentDay}天）`
                    : (e.when ? `${e.when}（共${totalDays}天）` : '');
                  return { ...e, ...(currentDay != null ? { currentDay } : {}), when };
                });
                return { ...extContext, events: enrichedEvents };
              }
              return extContext;
            }
          } catch {
            // 外部插件调用异常时平滑回退至内置引擎
          }
        }
        return contextApi.getPhoneCalendarContext({ query });
      } finally {
        activeViewerIds = null;
      }
    },
    items() {
      const state = store?.read?.() || {};
      const disableBuiltin = Boolean(state.calendar?.descriptor?.disableBuiltinFestivals || state.calendar?.disableBuiltin);
      const customItems = state.calendar?.items || [];
      const deduplicatedBuiltins = (disableBuiltin ? [] : BUILTIN_FESTIVALS).filter(b => !customItems.some(c => c.id === b.id));
      return [...deduplicatedBuiltins, ...customItems];
    },
    workdayPrompt(messages = null) {
      const state = store?.read?.() || {};
      const workdayConfig = state.calendar?.workdayConfig;
      if (!workdayConfig?.enabled) return null;
      const msgs = messages || target?.messages || [];
      const timeInfo = readPhoneTime(msgs);
      const desc = state.calendar?.descriptor || {};
      const calendar = { ...defaultGregorianCalendar(), ...desc };
      const disableBuiltin = Boolean(desc.disableBuiltinFestivals || state.calendar?.disableBuiltin);
      const customItems = state.calendar?.items || [];
      const deduplicatedBuiltins = (disableBuiltin ? [] : BUILTIN_FESTIVALS).filter(b => !customItems.some(c => c.id === b.id));
      const festivals = [...deduplicatedBuiltins, ...customItems].filter(it => it?.type === 'festival');
      return resolveWorkdayHolidayPrompt(timeInfo, calendar, workdayConfig, festivals);
    },
    weatherPrompt(messages = null) {
      const state = store?.read?.() || {};
      const weatherConfig = state.calendar?.weatherConfig;
      if (!weatherConfig?.enabled || weatherConfig?.injectPrompt === false) return null;
      const msgs = messages || target?.messages || [];
      const timeInfo = readPhoneTime(msgs);
      const desc = state.calendar?.descriptor || {};
      const calendar = { ...defaultGregorianCalendar(), ...desc };
      const parsed = timeInfo?.date ? parseDateString(timeInfo.date, timeInfo.weekday, calendar) : null;
      const month = parsed?.month || 1;
      const day = parsed?.day || 1;
      const year = parsed?.year || new Date().getFullYear();
      const isAncient = weatherConfig.worldEra === 'ancient' || (weatherConfig.worldEra === 'auto' && Boolean(calendar.era));
      const era = isAncient ? 'ancient' : 'modern';
      const loc = extractStoryLocation(msgs) || weatherConfig.defaultCity || '';
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const manual = weatherConfig.weatherOverrides?.[dateKey] || weatherConfig.weatherOverrides?.[`${month}-${day}`];
      let weather = null;
      if (manual) {
        weather = {
          type: manual.type || 'cloudy',
          cn: manual.cn || '多云',
          temp: typeof manual.temp === 'number' ? manual.temp : 20,
          extreme: Boolean(manual.extreme),
          icon: manual.icon || '⛅',
          isManual: true,
          note: manual.note || '剧情锁定',
        };
      } else {
        const seed = `${dateKey}_${loc}_${weatherConfig.seedSalt || ''}`;
        weather = rollWeather(month, { seed });
      }
      weather.location = loc;
      weather.worldEra = era;
      const solarTerm = (weatherConfig.solarTermsEnabled !== false && calendar.kind !== 'custom')
        ? getSolarTerm(year, month, day)
        : null;
      if (solarTerm) weather.solarTerm = solarTerm;
      weather.prompt = formatWeatherPrompt(weather, {
        worldEra: era,
        timeStr: timeInfo?.time || '',
      });
      return weather;
    },
    weatherInfo(messages = null) {
      return this.weatherPrompt(messages);
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
