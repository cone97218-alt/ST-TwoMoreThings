// 纯日历与历法计算引擎，自包含、无外部依赖。
// 移植自构画 (ST-SevenDaysCal) 核心日历算法。

export function isGregorian(calendar) {
  return calendar == null || calendar.kind === 'gregorian' || calendar.id === 'default-gregorian';
}

export function daysInMonth(calendar, month, year = null) {
  if (isGregorian(calendar)) {
    if (month === 2 && Number.isInteger(year)) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
    }
    return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 0;
  }
  return Number(calendar?.months?.[month - 1]?.days || 0);
}

export function defaultGregorianCalendar() {
  return {
    kind: 'gregorian',
    id: 'default-gregorian',
    title: '',
    era: '',
    months: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((days, i) => ({ name: `${i + 1}月`, days })),
    weekdayCycle: 7,
  };
}

export function weekdayFor(date, calendar = null, reference = null) {
  if (isGregorian(calendar) && Number.isInteger(date?.year)) {
    const d = new Date(0);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCFullYear(date.year, date.month - 1, date.day);
    return d.getUTCDay();
  }
  if (!reference || !Number.isInteger(reference.weekday)) return null;
  const cycle = Number(calendar?.weekdayCycle || 7);
  const delta = daysBetweenCalendarDates(reference, date, calendar);
  if (delta == null) return null;
  return ((reference.weekday + delta) % cycle + cycle) % cycle;
}

export function ordinalOf(date, calendar) {
  if (!date || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return null;
  let n = date.day;
  for (let m = 1; m < date.month; m++) n += daysInMonth(calendar, m, date.year);
  return n;
}

function gregorianOrdinal(date) {
  const year = +date.year, month = +date.month, day = +date.day;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return null;
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(year, month - 1, day);
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return Math.floor(value.getTime() / 86400000);
}

export function calendarDayOrdinal(date, cal) {
  if (!date || !cal || !Number.isFinite(+date.year) || !Number.isFinite(+date.month) || !Number.isFinite(+date.day)) return null;
  if (isGregorian(cal)) return gregorianOrdinal(date);
  const months = Array.isArray(cal.months) ? cal.months : [];
  if (!months.length || date.month < 1 || date.month > months.length) return null;
  const days = Number(months[date.month - 1]?.days);
  if (!Number.isFinite(days) || date.day < 1 || date.day > days) return null;
  const before = months.slice(0, date.month - 1).reduce((sum, month) => sum + Number(month.days || 0), 0);
  const yearLen = months.reduce((sum, month) => sum + Number(month.days || 0), 0);
  return (+date.year * yearLen) + before + (+date.day - 1);
}

export function daysBetweenCalendarDates(from, to, cal) {
  if (from.year != null && to.year != null) {
    const a = calendarDayOrdinal(from, cal), b = calendarDayOrdinal(to, cal);
    return a == null || b == null ? null : b - a;
  }
  const a = ordinalOf(from, cal), b = ordinalOf(to, cal);
  return a == null || b == null ? null : b - a;
}

export function parseWeekdayString(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = /(?:周|週|星期|礼拜|禮拜)\s*([一二三四五六日天])|\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(raw);
  if (!match) return null;
  if (match[1]) return { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }[match[1]];
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(match[2].toLowerCase());
}

function parseChineseInt(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (s === '元' || s === '正') return 1;
  if (s === '冬') return 11;
  if (s === '腊' || s === '臘') return 12;
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^[零〇一二三四五六七八九]{2,4}$/.test(s)) {
    return Number([...s].map(c => digits[c]).join(''));
  }
  const clean = s.replace(/^初/, '');
  if (clean === '十') return 10;
  if (clean === '二十' || clean === '廿') return 20;
  if (clean === '三十' || clean === '卅') return 30;
  if (clean.startsWith('廿') && digits[clean[1]] != null) return 20 + digits[clean[1]];
  if (clean.startsWith('卅') && digits[clean[1]] != null) return 30 + digits[clean[1]];
  const m = /^(?:([一二三四五六七八九])?十)?([一二三四五六七八九])?$/.exec(clean);
  if (m && (m[1] || m[2] || clean.includes('十'))) {
    const tens = clean.includes('十') ? (m[1] ? digits[m[1]] : 1) : 0;
    const ones = m[2] ? digits[m[2]] : 0;
    return tens * 10 + ones;
  }
  return null;
}

export function parseDateString(rawDate, rawWeekday = '', calendar = null) {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const str = rawDate.trim();
  const weekday = parseWeekdayString(rawWeekday) ?? parseWeekdayString(str);
  const defaultYear = Number(calendar?.currentYear) || (calendar?.kind === 'custom' ? 1 : null);

  // 1. 若提供了自定义历法，优先匹配自定义历法的具体月份名称（如 春之月、夏之月、霜月等）
  if (calendar && Array.isArray(calendar.months)) {
    for (let i = 0; i < calendar.months.length; i++) {
      const monthName = String(calendar.months[i]?.name || '').trim();
      if (!monthName) continue;
      const escapedMonth = monthName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 匹配：[纪年] [第?YYYY年] 月份名 [DD日?]
      const regex = new RegExp(`^(?:([^\\d\\s年|｜]+?)\\s*)?(?:第\\s*)?(?:(\\d{1,4})\\s*年\\s*)?${escapedMonth}\\s*(\\d{1,3})\\s*日?(?:[\\s,，·•].*)?$`, 'i');
      const m = str.match(regex);
      if (m) {
        const era = m[1]?.trim() === '第' ? '' : (m[1]?.trim() || calendar.era || '');
        return {
          eraLabel: era,
          year: m[2] ? Number(m[2]) : defaultYear,
          month: i + 1,
          day: Number(m[3]),
          ...(weekday != null ? { weekday } : {}),
        };
      }
    }
    // 匹配 "第1季 15日" 或 "第2月 10日"
    const ordinalMatch = str.match(/^(?:([^\d\s年|｜]+?)\s*)?(?:第\s*)?(?:(\d{1,4})\s*年\s*)?第\s*(\d{1,2})\s*[季月期]\s*(\d{1,3})\s*日?(?:[\s,，·•].*)?$/i);
    if (ordinalMatch) {
      const mIdx = Number(ordinalMatch[3]);
      if (mIdx >= 1 && mIdx <= calendar.months.length) {
        const era = ordinalMatch[1]?.trim() === '第' ? '' : (ordinalMatch[1]?.trim() || calendar.era || '');
        return {
          eraLabel: era,
          year: ordinalMatch[2] ? Number(ordinalMatch[2]) : defaultYear,
          month: mIdx,
          day: Number(ordinalMatch[4]),
          ...(weekday != null ? { weekday } : {}),
        };
      }
    }
  }

  // 1b. 四季历法格式（如 "第1年 春 1日" / "第2年 秋季 15日"）
  const seasonMatch = str.match(/^(?:([^\d\s年|｜]+?)\s*)?(?:第\s*)?(?:(\d{1,4})\s*年\s*)?(春|夏|秋|冬)(?:季|之月)?\s*(\d{1,3})\s*日?(?:[\s,，·•].*)?$/u);
  if (seasonMatch) {
    const seasonMap = { 春: 1, 夏: 2, 秋: 3, 冬: 4 };
    const era = seasonMatch[1]?.trim() === '第' ? '第' : (seasonMatch[1]?.trim() || calendar?.era || '');
    return {
      eraLabel: era === '第' ? '' : era,
      year: seasonMatch[2] ? Number(seasonMatch[2]) : (defaultYear ?? 1),
      month: seasonMap[seasonMatch[3]],
      day: Number(seasonMatch[4]),
      ...(weekday != null ? { weekday } : {}),
    };
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (可带纪年前缀及后续时间/周几文本)
  let match = str.match(/^(?:([^\d\s年|｜]+)\s*)?(\d{1,4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:[T\s,，].*)?$/);
  if (match) {
    return {
      year: Number(match[2]),
      month: Number(match[3]),
      day: Number(match[4]),
      eraLabel: match[1]?.trim() || calendar?.era || '',
      ...(weekday != null ? { weekday } : {}),
    };
  }
  // 3. 中文纪年与 YYYY年MM月DD日 (可带后续时间/周几文本)
  match = str.match(/^(?:([^\d\s年|｜]+?)\s*)?(?:第\s*)?(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:[T\s,，·•].*)?$/);
  if (match) {
    const era = match[1]?.trim() === '第' ? '' : (match[1]?.trim() || calendar?.era || '');
    return {
      year: Number(match[2]),
      month: Number(match[3]),
      day: Number(match[4]),
      eraLabel: era,
      ...(weekday != null ? { weekday } : {}),
    };
  }
  // 3b. 中国古风汉字年月日（如 "永昭三年五月廿二日 小满" / "贞观元年正月初五"）
  match = str.match(/^(?:([^\d\s年|｜]+?)\s*)?(?:([元零〇一二两三四五六七八九十\d]{1,4})\s*年\s*[·•\s]*)?([正元冬腊臘一二三四五六七八九十\d]{1,2})\s*月\s*([初十廿卅一二三四五六七八九\d]{1,3})\s*[日号號]?(?:[\s,，·•].*)?$/u);
  if (match) {
    const y = match[2] ? parseChineseInt(match[2]) : defaultYear;
    const m = parseChineseInt(match[3]);
    const d = parseChineseInt(match[4]);
    if (m != null && d != null) {
      return {
        year: y,
        month: m,
        day: d,
        eraLabel: match[1]?.trim() || calendar?.era || '',
        ...(weekday != null ? { weekday } : {}),
      };
    }
  }
  // 4. MM-DD or MM月DD日 (可带后续时间/周几文本)
  match = str.match(/^(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*日?(?:[T\s,，].*)?$/);
  if (match) {
    return {
      year: defaultYear,
      month: Number(match[1]),
      day: Number(match[2]),
      eraLabel: calendar?.era || '',
      ...(weekday != null ? { weekday } : {}),
    };
  }
  return null;
}

export const BUILTIN_FESTIVALS = [
  { id: 'builtin:new-year', name: '元旦', type: 'festival', month: 1, day: 1, days: 1, note: '新年第一天' },
  { id: 'builtin:valentine', name: '情人节', type: 'festival', month: 2, day: 14, days: 1, note: '' },
  { id: 'builtin:womens-day', name: '妇女节', type: 'festival', month: 3, day: 8, days: 1, note: '' },
  { id: 'builtin:labor-day', name: '劳动节', type: 'festival', month: 5, day: 1, days: 1, note: '' },
  { id: 'builtin:youth-day', name: '青年节', type: 'festival', month: 5, day: 4, days: 1, note: '' },
  { id: 'builtin:childrens-day', name: '儿童节', type: 'festival', month: 6, day: 1, days: 1, note: '' },
  { id: 'builtin:teachers-day', name: '教师节', type: 'festival', month: 9, day: 10, days: 1, note: '' },
  { id: 'builtin:national-day', name: '国庆节', type: 'festival', month: 10, day: 1, days: 3, note: '' },
  { id: 'builtin:halloween', name: '万圣夜', type: 'festival', month: 10, day: 31, days: 1, note: '' },
  { id: 'builtin:christmas-eve', name: '平安夜', type: 'festival', month: 12, day: 24, days: 1, note: '' },
  { id: 'builtin:christmas', name: '圣诞节', type: 'festival', month: 12, day: 25, days: 1, note: '' },
  { id: 'builtin:nye', name: '跨年夜', type: 'festival', month: 12, day: 31, days: 1, note: '' },
];

export function isValidDay(date, cal) {
  if (!date || !cal || !Array.isArray(cal.months)) return false;
  const maxDays = date.year != null ? daysInMonth(cal, date.month, date.year) : Number(cal.months[date.month - 1]?.days || 0);
  return Number.isInteger(date.month) && Number.isInteger(date.day) && date.month > 0 && date.month <= cal.months.length && date.day > 0 && date.day <= maxDays;
}

export function createPhoneCalendarApi({ read, formatDate } = {}) {
  const monthDays = (cal, month, year) => year == null ? Number(cal.months[month - 1]?.days || 0) : daysInMonth(cal, month, year);
  const ordinal = (date, cal) => cal.months.slice(0, date.month - 1).reduce((sum, _, i) => sum + monthDays(cal, i + 1, date.year), date.day);
  const yearLength = (cal, year) => cal.months.reduce((sum, _, i) => sum + monthDays(cal, i + 1, year), 0);
  const difference = (from, to, cal) => from.year != null && to.year != null ? daysBetweenCalendarDates(from, to, cal) : ordinal(to, cal) - ordinal(from, cal);
  const validDay = (date, cal) => isValidDay(date, cal);
  const label = (date, cal, part = 'full') => {
    if (formatDate) return formatDate(date, cal, part);
    const year = `${date.eraLabel || cal.era || ''}${date.year != null ? `${date.year}年` : ''}`;
    return part === 'year' ? year : `${part === 'monthDay' ? '' : year}${cal.months[date.month - 1].name}${date.day}日`;
  };
  function source() {
    const state = read?.();
    if (!state || !Array.isArray(state.items)) return null;
    let cal = state.calendar;
    if (!cal?.months?.length) {
      cal = { ...defaultGregorianCalendar(), ...(cal || {}) };
    }
    const items = state.items.filter(item => ['festival', 'anniversary', 'todo', 'schedule', 'birthday', 'custom'].includes(item?.type) && String(item.name || '').trim() && validDay({ month: item.month, day: item.day, year: null }, cal));
    return { ...state, calendar: cal, items, today: state.today && validDay(state.today, cal) ? state.today : null };
  }
  const itemView = (item, cal) => ({
    id: String(item.id || `${item.type}:${item.month}:${item.day}:${item.name}`),
    name: String(item.name),
    type: item.type === 'festival' ? 'festival' : (item.type === 'todo' || item.type === 'schedule') ? 'todo' : 'anniversary',
    date: String(item.displayDate || label({ month: item.month, day: item.day }, cal, 'monthDay')),
    days: Math.max(1, Number(item.days) || 1),
    note: String(item.note || ''),
    isBuiltin: Boolean(item.id?.startsWith('builtin:')),
    ...(item.done !== undefined ? { done: Boolean(item.done) } : {}),
    ...(item.status ? { status: String(item.status) } : {}),
    ...(item.todoId ? { todoId: String(item.todoId) } : {}),
  });
  function elapsed(item, date, cal) {
    const start = { year: date.year ?? null, month: item.month, day: item.day };
    if (!validDay(start, cal)) return null;
    let delta = difference(start, date, cal);
    if (delta < 0) {
      if (date.year != null) delta = difference({ ...start, year: date.year - 1 }, date, cal);
      else delta += yearLength(cal, null);
    }
    return delta;
  }
  const covers = (item, date, cal) => { const delta = elapsed(item, date, cal); return delta != null && delta >= 0 && delta < Math.max(1, Number(item.days) || 1); };
  function until(item, date, cal) {
    if (covers(item, date, cal)) return 0;
    let start = { year: date.year ?? null, month: item.month, day: item.day };
    if (!validDay(start, cal)) return null;
    let delta = difference(date, start, cal);
    if (delta < 0) {
      if (date.year != null) { start = { ...start, year: date.year + 1 }; delta = validDay(start, cal) ? difference(date, start, cal) : null; }
      else delta += yearLength(cal, null);
    }
    return delta;
  }
  return Object.freeze({
    apiVersion: 1,
    getPhoneCalendar({ monthOffset = 0 } = {}) {
      const state = source(); if (!state) return null;
      const { calendar: cal, today, items } = state;
      const offset = Number.isInteger(monthOffset) ? monthOffset : 0, count = cal.months.length;
      const absolute = (today?.month || 1) - 1 + offset, turn = Math.floor(absolute / count);
      const month = (absolute % count + count) % count + 1, year = today?.year == null ? null : today.year + turn;
      const first = { year, month, day: 1 }, cycle = Number(cal.weekdayCycle || 7);
      const reference = state.weekdayReference || (Number.isInteger(today?.weekday) ? today : null);
      let weekday = null;
      if (reference && Number.isInteger(reference.weekday)) {
        const delta = difference(reference, first, cal) + (year == null ? turn * yearLength(cal, null) : 0);
        if (delta != null) weekday = ((reference.weekday + delta) % cycle + cycle) % cycle;
      } else if (isGregorian(cal) && year != null) weekday = weekdayFor(first, cal);
      return {
        year, month, monthName: cal.months[month - 1].name, title: String(cal.title || ''), eraLabel: String(today?.eraLabel || cal.era || ''), yearLabel: label({ ...today, year }, cal, 'year'),
        today: today ? label(today, cal) : '',
        totalMonths: cal.months.length,
        daysInMonth: monthDays(cal, month, year),
        weekdays: weekday == null ? [] : (Array.isArray(cal.weekdays) && cal.weekdays.length === cycle) ? cal.weekdays : cycle === 7 ? ['一', '二', '三', '四', '五', '六', '日'] : Array.from({ length: cycle }, (_, i) => String(i + 1)),
        columns: cycle, leading: weekday == null ? 0 : cycle === 7 ? (weekday + 6) % 7 : weekday,
        days: Array.from({ length: monthDays(cal, month, year) }, (_, i) => {
          const date = { year, month, day: i + 1, ...(today?.eraLabel ? { eraLabel: today.eraLabel } : {}) };
          return { day: date.day, label: label(date, cal), isToday: offset === 0 && today?.day === date.day, items: items.filter(item => covers(item, date, cal)).map(item => itemView(item, cal)) };
        }),
      };
    },
    getPhoneCalendarContext({ query = '' } = {}) {
      const state = source(); if (!state) return null;
      const { calendar: cal, today } = state;
      const events = state.items.flatMap(item => {
        const d = today ? until(item, today, cal) : null;
        const mentioned = item.name.length >= 2 && String(query).includes(item.name);
        if (!(d != null && d >= 0 && d <= 7) && !mentioned) return [];
        const ongoing = d === 0 && Math.max(1, Number(item.days) || 1) > 1;
        return [{ ...itemView(item, cal), when: d == null ? '' : ongoing ? '进行中' : d === 0 ? '今天' : `${d}天后`, order: ongoing ? -1 : d ?? Infinity }];
      }).sort((a, b) => a.order - b.order).map(({ order, ...item }) => item);
      return events.length ? { today: today ? label(today, cal) : '', events } : null;
    },
  });
}
