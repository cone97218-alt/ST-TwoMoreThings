const stamp = /<!--\s*(?:QQJ|SDC|myknots)-(start|end)\b([\s\S]*?)-->|<bbs_(start|end)\b[^>]*>([\s\S]*?)<\/bbs_\3\s*>/giu;
const known = value => /^(?:未知|未明确|未明|不详|unknown)$/iu.test(value || '') ? '' : value || '';
const field = (raw, name) => new RegExp(`(?:^|[|｜])\\s*${name}\\s*[=＝:]\\s*([^|｜]+)`, 'iu').exec(raw)?.[1]?.trim() || '';
const pad = value => String(value).padStart(2, '0');

function clockTime(raw) {
  const match = /^(?:(上午|下午|中午|凌晨|清晨|早晨|早上|晚上|夜间|AM|PM)\s*)?(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?(?:\s*(AM|PM))?$/iu.exec(raw.normalize('NFKC'));
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3]), period = match[1] || match[5];
  if (hour > 23 || minute > 59 || Number(match[4] || 0) > 59 || period && hour > 12) return null;
  if (period) hour = hour % 12 + (/下午|中午|晚上|夜间|PM/iu.test(period) ? 12 : 0);
  return `${pad(hour)}:${pad(minute)}`;
}

function stampFields(tag) {
  if (tag[1]) return { kind: tag[1].toLowerCase(), date: known(field(tag[2], 'date')), weekday: known(field(tag[2], 'weekday')), time: clockTime(field(tag[2], 'time')) };
  const match = /^([\s\S]*?)\s+((?:(?:上午|下午|中午|凌晨|清晨|早晨|早上|晚上|夜间|AM|PM)\s*)?[\d０-９]{1,2}\s*[:：]\s*[\d０-９]{2}(?:\s*[:：]\s*[\d０-９]{2})?(?:\s*(?:AM|PM))?)$/iu.exec(tag[4].trim());
  return { kind: tag[3].toLowerCase(), date: known(match?.[1]?.trim()), weekday: '', time: match ? clockTime(match[2]) : null };
}

const SHICHEN_HOURS = {
  子: 0, 丑: 2, 寅: 4, 卯: 6, 辰: 8, 巳: 10,
  午: 12, 未: 14, 申: 16, 酉: 18, 戌: 20, 亥: 22,
};

const PERIOD_TIMES = {
  破晓: '05:30', 黎明: '06:00', 拂晓: '06:00', 清晨: '06:30', 早晨: '07:30', 早上: '08:00',
  上午: '09:30', 正午: '12:00', 中午: '12:00', 午间: '12:30', 午后: '14:00', 下午: '15:00',
  傍晚: '17:30', 黄昏: '18:00', 暮色: '18:30', 入夜: '19:30', 夜晚: '20:30', 晚上: '21:00',
  夜里: '22:00', 深夜: '23:00', 子夜: '00:00', 午夜: '00:00', 半夜: '01:00', 凌晨: '03:00',
};

function parseAncientClock(raw) {
  const shichenMatch = /([子丑寅卯辰巳午未申酉戌亥])时(初|正)?(?:([一二三四1234])刻)?/u.exec(raw);
  if (shichenMatch) {
    let hour = SHICHEN_HOURS[shichenMatch[1]];
    if (shichenMatch[2] === '初') hour = (hour + 23) % 24;
    const keMap = { 一: 15, 二: 30, 三: 45, 四: 0, '1': 15, '2': 30, '3': 45, '4': 0 };
    const minute = shichenMatch[3] ? (keMap[shichenMatch[3]] ?? 0) : 0;
    return { token: shichenMatch[0], time: `${pad(hour)}:${pad(minute)}` };
  }
  const gengMatch = /([一二三四五12345])更/u.exec(raw);
  if (gengMatch) {
    const gengMap = { 一: '19:00', 二: '21:00', 三: '23:00', 四: '01:00', 五: '03:00', '1': '19:00', '2': '21:00', '3': '23:00', '4': '01:00', '5': '03:00' };
    return { token: gengMatch[0], time: gengMap[gengMatch[1]] || '00:00' };
  }
  for (const [label, time] of Object.entries(PERIOD_TIMES)) {
    if (raw.endsWith(label) || new RegExp(`(?:^|[\\s·•])${label}(?:$|[\\s·•])`, 'u').test(raw)) {
      return { token: label, time };
    }
  }
  return null;
}

function parseBbsTime(raw, { allowAncient = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let text = raw.trim();
  let weekday = '';
  const wkMatch = /(?:^|[\s,，·•])(星期[一二三四五六日天]|(?:周|週|礼拜|禮拜)[一二三四五六日天]|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?=$|[\s,，·•])/iu.exec(text);
  if (wkMatch) {
    weekday = wkMatch[1].trim();
    text = (text.slice(0, wkMatch.index) + ' ' + text.slice(wkMatch.index + wkMatch[0].length)).replace(/\s+/g, ' ').trim();
  }
  const match = /^([\s\S]*?)\s+((?:(?:上午|下午|中午|凌晨|清晨|早晨|早上|晚上|夜间|AM|PM)\s*)?[\d０-９]{1,2}\s*[:：]\s*[\d０-９]{2}(?:\s*[:：]\s*[\d０-９]{2})?(?:\s*(?:AM|PM))?)$/iu.exec(text);
  if (match) {
    const time = clockTime(match[2]);
    if (!time) return null;
    const datePart = match[1].trim();
    return { source: 'story', date: known(datePart), weekday: known(weekday), time };
  }
  const timeOnly = clockTime(text);
  if (timeOnly) return { source: 'story', date: '', weekday: known(weekday), time: timeOnly };
  if (allowAncient) {
    const ancient = parseAncientClock(text);
    if (ancient) {
      const datePart = text.replace(ancient.token, '').replace(/[·•\s]+$/u, '').replace(/\s+/g, ' ').trim();
      return {
        source: 'story',
        date: known(datePart || text),
        weekday: known(weekday || ancient.token),
        time: ancient.time,
      };
    }
  }
  return null;
}

function parseTopFormatTime(body) {
  if (typeof body !== 'string' || !body.includes('✧')) return null;
  const bars = [...body.matchAll(/✧([^✧\r\n]+?[|｜][^✧\r\n]+?)✧/gu)];
  for (let i = bars.length - 1; i >= 0; i--) {
    const timeField = bars[i][1].split(/[|｜]/)[0]?.trim();
    const parsed = parseBbsTime(timeField, { allowAncient: true });
    if (parsed) return parsed;
  }
  return null;
}

function readLeafClock(leaf) {
  if (!leaf || typeof leaf !== 'object') return null;
  for (const candidate of [leaf.timeEnd, leaf.delta?.time, leaf.timeStart, leaf.timeLabel]) {
    const parsed = parseBbsTime(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function readBaiBaiBookClock(messages = []) {
  const latest = latestAiFloor(messages)?.message;
  const directLeaf = readLeafClock(latest?.extra?.bbs_leaf);
  if (directLeaf) return directLeaf;

  const api = globalThis.STBaiBaiBook || (typeof window !== 'undefined' ? window.STBaiBaiBook : null);
  if (api) {
    try {
      const stateTime = api.getVar?.('state.time') || api.getSnapshot?.()?.state?.time;
      const parsedState = parseBbsTime(stateTime);
      if (parsedState) return parsedState;
    } catch {}
    try {
      const history = api.getInjectedHistory?.() || api.getHistory?.();
      const nodes = Array.isArray(history?.nodes) ? history.nodes : [];
      for (let i = nodes.length - 1; i >= 0; i--) {
        const parsedNode = readLeafClock(nodes[i]);
        if (parsedNode) return parsedNode;
      }
    } catch {}
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const parsed = readLeafClock(messages[i]?.extra?.bbs_leaf);
    if (parsed) return parsed;
  }
  return null;
}

export function latestAiFloor(messages, beforeIndex = messages.length) {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.is_user || message.is_system || ['user', 'system'].includes(message.role) || typeof message.mes !== 'string' || !message.mes) continue;
    return { index: i, message };
  }
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.is_user || ['user'].includes(message.role) || !message?.extra?.bbs_hidden || typeof message.mes !== 'string' || !message.mes) continue;
    return { index: i, message };
  }
  return null;
}

export function readPhoneTime(messages, now = new Date()) {
  // 结束戳代表最新AI楼结束时的剧情时间，不拿更旧楼层补当前时间。
  const floor = latestAiFloor(messages);
  const body = floor?.message.mes || '';
  const tags = [...body.matchAll(stamp)].map(stampFields);
  const current = tags.filter(tag => tag.kind === 'end').at(-1) || tags.at(-1);
  if (current?.time) return { source: 'story', date: current.date, weekday: current.weekday, time: current.time };
  if (!tags.length && floor) {
    const topFormatClock = parseTopFormatTime(body);
    if (topFormatClock) return topFormatClock;
    const bbsClock = readBaiBaiBookClock(messages);
    if (bbsClock) return bbsClock;
  }
  return {
    source: 'real', date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: now.toLocaleDateString('zh-CN', { weekday: 'long' }),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}
