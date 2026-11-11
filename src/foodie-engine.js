// 寻味美食感知与智能配餐引擎：支持原版角色配套（主菜+主食+汤羹+饮品）
import { FOODIE_CATALOG } from './foodie-catalog.js';

export const DEFAULT_FOODIE_TEMPLATE = '[食物线索：{{food}}]';
export const DEFAULT_FOODIE_COUNT = 2;

// 获取当前生效的所有数据库（内置库 + 用户修改库 + 用户新建库）
// 规则：所有美食库默认全部关闭 (enabled: false)，需由用户在设置中手动开启
export function getEffectiveDatabases(state = {}) {
  const customDbs = state.foodie?.customDatabases || {};
  const modifiedBuiltins = state.foodie?.modifiedBuiltins || {};

  const databases = FOODIE_CATALOG.databases.map(db => {
    const mod = modifiedBuiltins[db.id];
    if (mod) {
      return {
        ...db,
        ...mod,
        enabled: Boolean(mod.enabled)
      };
    }
    return {
      ...db,
      enabled: false
    };
  });

  // 加入用户自建库（自建库若未明确指定 enabled，默认也是关闭）
  for (const [id, customDb] of Object.entries(customDbs)) {
    if (customDb && !databases.some(d => d.id === id)) {
      databases.push({
        ...customDb,
        id,
        builtin: false,
        enabled: Boolean(customDb.enabled)
      });
    }
  }

  return databases;
}

// 1. 地图维度感知
export function senseMapLocation(mapProjection, core) {
  if (!mapProjection) return { locationText: '', matchedLocations: [], matchedCuisineCodes: [] };

  const currentArea = mapProjection.currentArea || '';
  const currentRegion = mapProjection.currentRegion || '';
  const currentCity = mapProjection.currentCity || '';
  const combined = [currentCity, currentRegion, currentArea].filter(Boolean).join(' ');

  const matchedLocations = [];
  const matchedCuisineCodes = [];

  const cuisineLoc = core.cuisineLoc || {};
  for (const [code, locList] of Object.entries(cuisineLoc)) {
    if (Array.isArray(locList)) {
      for (const loc of locList) {
        if (loc && combined.includes(loc)) {
          matchedLocations.push(loc);
          if (!matchedCuisineCodes.includes(code)) matchedCuisineCodes.push(code);
        }
      }
    }
  }

  const countryLoc = core.countryLoc || {};
  for (const [countryName, info] of Object.entries(countryLoc)) {
    if (info && Array.isArray(info.loc)) {
      for (const loc of info.loc) {
        if (loc && combined.includes(loc)) {
          matchedLocations.push(loc);
        }
      }
    }
  }

  return {
    locationText: combined,
    matchedLocations,
    matchedCuisineCodes
  };
}

// 解析时间段字符串（如 "11:30-13:30" 或 "21:00~02:00"）
export function parseTimeRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  const match = rangeStr.trim().match(/^(\d{1,2})[:：](\d{2})\s*[-~至到—–]+\s*(\d{1,2})[:：](\d{2})$/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return { start, end };
}

// 时段多别名及真实时间区间智能匹配判定
export function isTimeSlotMatched(slot, calSense) {
  if (!slot || !calSense) return false;
  const s = String(slot).trim();
  if (!s) return false;

  // 1. 时间段范围匹配（某个时间段到某个时间段，支持跨午夜，如 11:30-13:30, 21:00-02:00）
  const range = parseTimeRange(s);
  if (range && calSense.currentMinutes != null) {
    const cur = calSense.currentMinutes;
    if (range.start <= range.end) {
      if (cur >= range.start && cur <= range.end) return true;
    } else {
      if (cur >= range.start || cur <= range.end) return true;
    }
  }

  // 2. 传统时段标签与别名匹配（兼容保留）
  const label = calSense.timeSlotLabel || '';
  const aliasList = calSense.timeSlots || [];
  if (label && (label.includes(s) || s.includes(label))) return true;
  if (aliasList.some(a => a.includes(s) || s.includes(a))) return true;
  if (calSense.timeSlot && (calSense.timeSlot === s || s.toLowerCase().includes(calSense.timeSlot.toLowerCase()))) return true;
  return false;
}

// 2. 日历维度感知（时段、节气、节日、季节，结合正文时间词与时钟）
export function senseCalendar(calendarContext, core, now = new Date(), storyText = '') {
  const result = {
    timeSlot: '',
    timeSlotLabel: '',
    timeSlots: [],
    currentMinutes: null,
    festival: null,
    festivals: [],
    jieqi: null,
    season: '春季'
  };

  // 提取当前实际时间分钟数（优先从正文明确时间点提取，次之日历 context，再次系统当前时钟）
  let currentMinutes = null;
  const storyTimeMatch = storyText && typeof storyText === 'string'
    ? storyText.match(/(?:(?:早上|上午|中午|下午|傍晚|晚上|深夜|凌晨)\s*)?(\d{1,2})[:：](\d{2})/i)
    : null;
  if (storyTimeMatch) {
    let h = Number(storyTimeMatch[1]);
    const m = Number(storyTimeMatch[2]);
    if (/下午|傍晚|晚上/.test(storyTimeMatch[0]) && h < 12) h += 12;
    currentMinutes = h * 60 + m;
  } else if (calendarContext?.time && typeof calendarContext.time === 'string') {
    const m = calendarContext.time.match(/^(\d{1,2})[:：](\d{2})/);
    if (m) currentMinutes = Number(m[1]) * 60 + Number(m[2]);
  } else if (now instanceof Date && !isNaN(now.getTime())) {
    currentMinutes = now.getHours() * 60 + now.getMinutes();
  }
  result.currentMinutes = currentMinutes;

  // 1. 优先从剧情正文提取就餐时段契机（若正文明确提到了清晨/深夜/中午等）
  let detectedSlot = null;
  const slots = core?.slots || {};
  if (storyText && typeof storyText === 'string') {
    for (const [slotKey, kwList] of Object.entries(slots)) {
      if (Array.isArray(kwList) && kwList.some(kw => kw && storyText.includes(kw))) {
        detectedSlot = slotKey;
        break;
      }
    }
  }

  const hours = currentMinutes != null ? Math.floor(currentMinutes / 60) : now.getHours();
  const effectiveSlot = detectedSlot || (
    (hours >= 5 && hours < 10) ? 'morning' :
    (hours >= 11 && hours <= 13) ? 'noon' :
    (hours >= 14 && hours <= 16) ? 'afternoon' :
    (hours >= 17 && hours <= 20) ? 'evening' : 'lateNight'
  );

  result.timeSlot = effectiveSlot;
  if (currentMinutes != null) {
    const hh = String(Math.floor(currentMinutes / 60) % 24).padStart(2, '0');
    const mm = String(currentMinutes % 60).padStart(2, '0');
    result.timeSlotLabel = `${hh}:${mm}`;
  } else if (effectiveSlot === 'morning') {
    result.timeSlotLabel = '晨间早餐';
  } else if (effectiveSlot === 'noon') {
    result.timeSlotLabel = '午间午餐';
  } else if (effectiveSlot === 'afternoon') {
    result.timeSlotLabel = '午后茶歇';
  } else if (effectiveSlot === 'evening') {
    result.timeSlotLabel = '傍晚晚餐';
  } else {
    result.timeSlotLabel = '深夜宵夜';
  }
  result.timeSlots = ['早餐', '早点', '午餐', '正餐', '下午茶', '晚餐', '夜宵', '宵夜'];

  // 季节感知：正文描写优先，月份次之
  if (/春/.test(storyText) && !/青春|春卷/.test(storyText)) result.season = '春季';
  else if (/夏/.test(storyText)) result.season = '夏季';
  else if (/秋/.test(storyText)) result.season = '秋季';
  else if (/冬/.test(storyText)) result.season = '冬季';
  else {
    const month = now.getMonth() + 1;
    if (month >= 3 && month <= 5) result.season = '春季';
    else if (month >= 6 && month <= 8) result.season = '夏季';
    else if (month >= 9 && month <= 11) result.season = '秋季';
    else result.season = '冬季';
  }

  const jieqiList = core.jieqiList || [];
  const events = calendarContext?.events || [];
  for (const ev of events) {
    const title = ev.title || ev.summary || ev.name || '';
    for (const jq of jieqiList) {
      if (title.includes(jq)) {
        result.jieqi = jq;
        if (!result.festivals.includes(jq)) result.festivals.push(jq);
        break;
      }
    }
    const fests = core.fests || [];
    for (const fest of fests) {
      if (title.includes(fest.n)) {
        result.festival = fest.n;
        if (!result.festivals.includes(fest.n)) result.festivals.push(fest.n);
        break;
      }
    }
    // 无论是现实节日还是架空/自定义日历日程（如学园祭、海灯节、冬幕节等），标题均纳入事件节日池
    if (title && !result.festivals.includes(title)) {
      result.festivals.push(title);
    }
  }

  // 联动日历当天的特别节日与直接指定的节气/季节
  if (calendarContext?.season) {
    result.season = calendarContext.season;
  }
  if (calendarContext?.jieqi) {
    result.jieqi = calendarContext.jieqi;
    if (!result.festivals.includes(calendarContext.jieqi)) result.festivals.push(calendarContext.jieqi);
  }
  if (calendarContext?.festival) {
    result.festival = calendarContext.festival;
    if (!result.festivals.includes(calendarContext.festival)) result.festivals.push(calendarContext.festival);
  }

  if (Array.isArray(calendarContext?.festivals)) {
    for (const f of calendarContext.festivals) {
      const name = typeof f === 'string' ? f : (f?.name || f?.title || '');
      if (name && !result.festivals.includes(name)) result.festivals.push(name);
    }
  }

  if (!result.festival && result.festivals.length) {
    result.festival = result.festivals[0];
  }

  return result;
}

// 2.1 天候感知（雨雪、晴热酷暑、晴冷寒冬、晴朗温暖等，与拓展天气系统无缝对齐）
export function senseWeather(calendarContext, storyText = '') {
  const conditions = [];

  const info = calendarContext?.weatherInfo || calendarContext?.weather || null;
  const rawWeather = String(info?.type || info?.condition || info?.text || info?.cn || '');
  const temp = Number(info?.temp);

  const s = `${rawWeather} ${String(storyText || '')}`;

  // 1. 雨天类 (包括日历天气系统的 小雨、中雨、大雨、暴雨、阵雨、雷暴、雷阵雨、雨夹雪、秋雨等)
  if (/雨|shower|rain|storm/i.test(s) || /小雨|中雨|大雨|暴雨|阵雨|雷暴|雷阵雨|雨夹雪|秋雨/.test(s)) {
    if (!conditions.includes('雨天')) conditions.push('雨天');
  }

  // 2. 雪天类 (包括日历天气系统的 小雪、中雪、大雪、暴风雪、雨夹雪、降雪、飘雪等)
  if (/雪|snow|blizzard|ice_storm|sleet/i.test(s) || /小雪|中雪|大雪|暴风雪|雨夹雪|结冰|积雪/.test(s)) {
    if (!conditions.includes('雪天')) conditions.push('雪天');
  }

  // 3. 炎热/酷暑类 (包括 晴热、高温热浪、炎热、酷暑、闷热潮湿，或气温 >= 28°C)
  if (/热|暑|hot|heatwave|humid/i.test(s) || /晴热|高温|酷暑|炎热|闷热|烈日|暴晒/.test(s) || (!isNaN(temp) && temp >= 28)) {
    if (!conditions.includes('酷暑')) conditions.push('酷暑');
    if (!conditions.includes('晴热')) conditions.push('晴热');
  }

  // 4. 寒冷/晴冷类 (包括 晴冷、寒风刺骨、霜降、降温、寒冬、严寒，或气温 <= 8°C)
  if (/冷|寒|霜|cold|frost/i.test(s) || /晴冷|寒冷|降温|严寒|刺骨|受冻|好冷|天冷/.test(s) || (!isNaN(temp) && temp <= 8)) {
    if (!conditions.includes('寒冷')) conditions.push('寒冷');
    if (!conditions.includes('晴冷')) conditions.push('晴冷');
  }

  // 5. 晴朗/温暖类 (包括 晴天、晴朗、晴间多云、秋高气爽、多云、温暖)
  if (/晴|sun|clear|cloud/i.test(s) || /晴朗|晴天|多云|秋高气爽|温暖|阳光/.test(s)) {
    if (!conditions.includes('晴天')) conditions.push('晴天');
    if (!conditions.includes('晴朗')) conditions.push('晴朗');
  }

  return {
    matched: conditions.length > 0,
    text: conditions.slice(0, 2).join('·') || (rawWeather || '常温天候'),
    conditions,
    raw: rawWeather
  };
}

export function senseStoryText(text = '', core) {
  if (!text || typeof text !== 'string') {
    return {
      hasMealIntent: false,
      hitKeywords: [],
      matchedBiz: [],
      matchedStates: []
    };
  }

  const hitKeywords = [];
  const matchedBiz = [];
  const matchedStates = [];

  const demandWords = core.demandWords || {};
  const actions = demandWords.actions || ['吃', '喝', '尝', '煮', '炒', '炖', '煲', '点菜', '饿', '餐', '饭'];
  const foodCues = demandWords.foodCues || ['用膳', '进食', '上菜', '开席', '下馆子', '外卖'];

  let hasMealIntent = false;
  for (const word of [...actions, ...foodCues, '饿', '好饿', '肚子饿', '夜宵', '吃夜宵', '宵夜', '火锅', '烧烤', '大排档', '甜点', '奶茶']) {
    if (text.includes(word)) {
      hasMealIntent = true;
      if (!hitKeywords.includes(word)) hitKeywords.push(word);
    }
  }

  const bizList = core.biz || [];
  for (const b of bizList) {
    if (Array.isArray(b.kw)) {
      for (const kw of b.kw) {
        if (text.includes(kw)) {
          hasMealIntent = true;
          if (!matchedBiz.includes(b.label)) matchedBiz.push(b.label);
          if (!hitKeywords.includes(kw)) hitKeywords.push(kw);
        }
      }
    }
  }

  const statesList = core.states || [];
  for (const s of statesList) {
    if (Array.isArray(s.kw)) {
      for (const kw of s.kw) {
        if (text.includes(kw)) {
          if (!matchedStates.includes(s.k)) matchedStates.push(s.k);
          if (!hitKeywords.includes(kw)) hitKeywords.push(kw);
        }
      }
    }
  }

  return {
    hasMealIntent,
    hitKeywords: hitKeywords.slice(0, 8),
    matchedBiz,
    matchedStates
  };
}

// 菜品名称角色语义启发式识别（羹汤、主食、饮品、凉菜、甜点、主菜）
export function categorizeFoodRole(name = '') {
  const str = String(name || '');
  if (/汤|羹|煲|炖品|汆|盅/.test(str)) return 'soup';
  if (/面|粉|饭|粥|饼|包|饺|馒头|年糕|抄手|馄饨|麦|米线|拉面|乌冬|意面/.test(str)) return 'staple';
  if (/茶|饮|酒|拿铁|咖啡|浆|汁|露|奶|可乐|汽水|精酿|啤酒|特调|鸡尾酒/.test(str)) return 'drink';
  if (/凉|冷|卤|冻|腌|拌|泡菜|皮冻|拍黄瓜|口水鸡/.test(str)) return 'cold';
  if (/糕|甜|点心|糖水|酥|挞|果|冰|仙草|圆子|芋艿|布丁|大福|麻薯/.test(str)) return 'dessert';
  return 'hot';
}

// 解析菜品附带的时空/节气/时段条件标签，如：[清明] 青团、青团#清明、[早餐] 豆浆
export function parseDishCondition(dishStr) {
  if (typeof dishStr !== 'string') return { name: String(dishStr || ''), condition: null };
  const trimmed = dishStr.trim();
  const bracket = trimmed.match(/^[\[【]([^\]】]+)[\]】]\s*(.+)$/);
  if (bracket) return { condition: bracket[1].trim(), name: bracket[2].trim() };
  const hash = trimmed.match(/^(.+?)[#＃@＠]([^\s#＃@＠]+)$/);
  if (hash) return { name: hash[1].trim(), condition: hash[2].trim() };
  return { name: trimmed, condition: null };
}

// 批量输入拆解：支持前缀通用格式，如 `[清明] 青团, 螺蛳` 拆分为 `[清明] 青团` 与 `[清明] 螺蛳`
export function splitDishesInput(inputStr) {
  if (!inputStr) return [];
  const trimmed = String(inputStr).trim();
  const bracketGlobal = trimmed.match(/^[\[【]([^\]】]+)[\]】]\s*([\s\S]+)$/);
  if (bracketGlobal) {
    const cond = bracketGlobal[1].trim();
    const rest = bracketGlobal[2].split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
    return rest.map(item => {
      const p = parseDishCondition(item);
      return p.condition ? `[${p.condition}] ${p.name}` : `[${cond}] ${p.name}`;
    });
  }
  return trimmed.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
}

// 提取美食库内所有菜品的时令、节气、餐期条件标签
export function extractDishConditions(db) {
  if (!db) return [];
  const set = new Set();
  const items = db.items || [];
  for (const item of items) {
    const p = parseDishCondition(item);
    if (p.condition) set.add(p.condition);
  }
  if (db.categories?.length) {
    for (const cat of db.categories) {
      for (const item of (cat.items || [])) {
        const p = parseDishCondition(item);
        if (p.condition) set.add(p.condition);
      }
    }
  }
  return [...set];
}

// 判断条件标签是否命中当前时空与语境（节气、节日、时段、季节、天气、地点、剧情）
export function isConditionMatched(cond, { calSense, weatherSense, mapSense, storyText = '' } = {}) {
  if (!cond) return false;
  const c = String(cond).trim();
  if (!c) return false;

  // 1. 节气命中（如：立春、清明、秋分、冬至...）
  if (calSense?.jieqi && (calSense.jieqi.includes(c) || c.includes(calSense.jieqi))) {
    return true;
  }

  // 2. 节日与节令命中（如：除夕、春节、端午、中秋、七夕...）
  if (calSense?.festivals?.length) {
    if (calSense.festivals.some(f => f && (f.includes(c) || c.includes(f)))) {
      return true;
    }
  }
  if (calSense?.festival && (calSense.festival.includes(c) || c.includes(calSense.festival))) {
    return true;
  }

  // 3. 季节命中（如：春季/春、夏季/夏、秋季/秋、冬季/冬）
  if (calSense?.season) {
    const s = calSense.season;
    if (s.includes(c) || c.includes(s) || (c.length === 1 && s.startsWith(c))) {
      return true;
    }
  }

  // 4. 餐期与时段命中（如：早餐、07:00-09:30、午餐、下午茶、晚餐、宵夜）
  if (calSense) {
    if (isTimeSlotMatched(c, calSense)) return true;
    if (calSense.timeSlotLabel && (calSense.timeSlotLabel.includes(c) || c.includes(calSense.timeSlotLabel))) {
      return true;
    }
    const mins = calSense.currentMinutes;
    if (typeof mins === 'number') {
      if (/早/.test(c) && (mins >= 360 && mins < 600)) return true;
      if (/午/.test(c) && !/下/.test(c) && (mins >= 660 && mins < 840)) return true;
      if (/下/.test(c) && (mins >= 840 && mins < 1020)) return true;
      if (/晚/.test(c) && (mins >= 1020 && mins < 1260)) return true;
      if (/宵|夜/.test(c) && (mins >= 1260 || mins < 300)) return true;
    }
  }

  // 5. 天气天候命中（如：雨、雪、晴、冷、热）
  if (weatherSense) {
    if (weatherSense.conditions?.some(w => w && (w.includes(c) || c.includes(w)))) return true;
    if (weatherSense.text && (weatherSense.text.includes(c) || c.includes(weatherSense.text))) return true;
  }

  // 6. 地点命中（如：海神阁、学院、餐厅）
  if (mapSense?.locationText && (mapSense.locationText.includes(c) || c.includes(mapSense.locationText))) {
    return true;
  }

  // 7. 正文文本提及
  if (storyText && storyText.includes(c)) {
    return true;
  }

  return false;
}

// 核心配餐算法：依照原世界书角色分类（主菜、主食面点、羹汤、饮品点心）进行合理套餐组合，支持库内时令/节气/餐期智能下钻
export function assembleMealCombo(db, n = 2, context = {}) {
  if (!db || !db.items || !db.items.length) return [];
  const targetCount = Math.min(Math.max(1, n), db.items.length);
  const categories = db.categories || [];

  // 按角色归类
  const buckets = {
    hot: [],     // 热菜主菜
    staple: [],  // 主食面饭
    soup: [],    // 羹汤炖品
    cold: [],    // 凉菜冷盘
    drink: [],   // 饮品
    dessert: []  // 点心甜品
  };

  if (categories.length > 1) {
    for (const cat of categories) {
      const role = cat.role || 'hot';
      if (buckets[role]) {
        buckets[role].push(...(cat.items || []));
      } else {
        buckets.hot.push(...(cat.items || []));
      }
    }
  } else {
    // 启发式自动角色分配（依据纯净菜名推导）
    for (const item of db.items) {
      const parsed = parseDishCondition(item);
      const role = categorizeFoodRole(parsed.name);
      buckets[role].push(item);
    }
  }

  const picked = [];
  const seenNames = new Set();

  function pickOneFrom(arr) {
    if (!arr || !arr.length) return null;
    const available = arr.filter(rawItem => {
      const parsed = parseDishCondition(rawItem);
      return !seenNames.has(parsed.name);
    });
    if (!available.length) return null;

    // 智能三级优先级划分：
    // 优先级 1（matched）：带条件标签且命中当前时空与语境（节气、时段、节日、季节、剧情）
    // 优先级 2（universal）：无条件标签的常备通用菜品（日常兜底）
    // 优先级 3（unmatched）：带其他条件标签的菜品（仅在候选不足时使用）
    const matched = [];
    const universal = [];
    const unmatched = [];

    for (const rawItem of available) {
      const parsed = parseDishCondition(rawItem);
      if (parsed.condition) {
        if (isConditionMatched(parsed.condition, context)) {
          matched.push(parsed);
        } else {
          unmatched.push(parsed);
        }
      } else {
        universal.push(parsed);
      }
    }

    const candidatePool = matched.length ? matched : (universal.length ? universal : unmatched);
    const chosen = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    seenNames.add(chosen.name);
    picked.push(chosen.name);
    return chosen.name;
  }

  // 配餐策略：
  // 1. 先选 1 道核心主菜/热菜
  pickOneFrom(buckets.hot.length ? buckets.hot : db.items);

  // 2. 若 n >= 2，选 1 道主食或汤羹
  if (picked.length < targetCount) {
    if (buckets.staple.length && Math.random() > 0.4) {
      pickOneFrom(buckets.staple);
    } else if (buckets.soup.length) {
      pickOneFrom(buckets.soup);
    }
  }

  // 3. 若 n >= 3，选 1 道饮品或点心/凉菜
  if (picked.length < targetCount) {
    if (buckets.drink.length && Math.random() > 0.5) {
      pickOneFrom(buckets.drink);
    } else if (buckets.cold.length) {
      pickOneFrom(buckets.cold);
    } else if (buckets.dessert.length) {
      pickOneFrom(buckets.dessert);
    }
  }

  // 4. 若还不够，从所有剩余项目中补足
  const allShuffled = [...db.items].sort(() => 0.5 - Math.random());
  for (const item of allShuffled) {
    if (picked.length >= targetCount) break;
    const parsed = parseDishCondition(item);
    if (!seenNames.has(parsed.name)) {
      seenNames.add(parsed.name);
      picked.push(parsed.name);
    }
  }

  return picked;
}

// 构建结构化全链路排查溯源快照
export function buildTrace({
  status = 'active',
  statusText = '',
  intentTriggered = false,
  hitKeywords = [],
  intentSource = '',
  mapSense = null,
  calSense = null,
  weatherSense = null,
  selectedDb = null,
  decisionStage = '',
  decisionReason = '',
  customScores = [],
  enabledDbsCount = 0,
  pickedFoods = [],
  prompt = '',
  contextTimeSummary = ''
}) {
  const roleNameMap = { hot: '主菜', staple: '主食', soup: '羹汤', drink: '饮品', cold: '凉菜', dessert: '点心' };

  const comboRoles = (pickedFoods || []).map(food => {
    let role = 'hot';
    if (selectedDb?.categories?.length) {
      const cat = selectedDb.categories.find(c => (c.items || []).includes(food));
      if (cat?.role) role = cat.role;
    } else {
      role = categorizeFoodRole(food);
    }
    return {
      name: food,
      role,
      roleLabel: roleNameMap[role] || '主菜'
    };
  });

  const locationText = mapSense?.locationText || '未指定地点';
  const timeSlotLabel = calSense?.timeSlotLabel || '日常时段';
  const timeSource = calSense?.timeSource || '时钟';
  const season = calSense?.season || '春季';
  const festival = calSense?.festival || (calSense?.festivals?.[0]) || null;
  const jieqi = calSense?.jieqi || null;
  const weatherText = weatherSense?.text || '常温';

  const storyTrace = hitKeywords.length ? hitKeywords.join('、') : (intentTriggered ? '进食契机触发' : '未检测到进食关键词');
  const locationTrace = locationText !== '未指定地点' ? locationText : '未定位（通用基准）';
  const timeTrace = contextTimeSummary || `${timeSlotLabel} · ${season}`;
  const decisionTrace = decisionReason || (selectedDb ? `匹配到【${selectedDb.label}】` : '动态静默');
  const resultTrace = pickedFoods.length ? pickedFoods.join('、') : '未注入正文';

  return {
    status,
    statusText,
    intentTriggered,
    hitKeywords: hitKeywords.slice(0, 10),
    intentSource,
    locationText,
    timeSlotLabel,
    timeSource,
    season,
    festival,
    jieqi,
    weatherText,
    selectedDbLabel: selectedDb?.label || '',
    selectedDbKind: selectedDb?.builtin ? '内置库' : (selectedDb ? '自建库' : '无'),
    decisionStage,
    decisionReason,
    customScores: customScores.slice(0, 5),
    enabledDbsCount,
    comboRoles,
    prompt,
    // 向下兼容字段
    locationTrace,
    timeTrace,
    storyTrace,
    decisionTrace,
    resultTrace
  };
}

// 核心决策：结合三维感知，产生匹配结果与溯源链路
export function evaluateFoodieMatch({
  state = {},
  storyText = '',
  mapProjection = null,
  calendarContext = null,
  turnIndex = 0,
  forceRefresh = false
}) {
  const core = FOODIE_CATALOG.core;
  const databases = getEffectiveDatabases(state);
  const enabledDbs = databases.filter(db => db.enabled === true && db.items?.length > 0);

  const foodieState = state.foodie || {};
  const currentSession = foodieState.session || null;
  const isLocked = Boolean(foodieState.locked);
  const targetCount = Number(foodieState.count) || DEFAULT_FOODIE_COUNT;
  const template = foodieState.template || DEFAULT_FOODIE_TEMPLATE;

  // 1. 若处于手动锁定状态，直接维持
  if (isLocked && foodieState.current?.foods?.length) {
    const prompt = formatFoodiePrompt(template, foodieState.current.foods);
    return {
      triggered: true,
      status: 'locked',
      statusText: '已锁定',
      foods: foodieState.current.foods,
      prompt,
      trace: buildTrace({
        status: 'locked',
        statusText: '已锁定',
        intentTriggered: true,
        intentSource: '人工锁定当前套餐',
        hitKeywords: ['人工锁定'],
        pickedFoods: foodieState.current.foods,
        prompt,
        decisionStage: '人工锁定',
        decisionReason: '处于用户人工锁定状态，持续维持固定套餐输出'
      })
    };
  }

  // 1.1 若所有美食库均未开启，直接保持静默
  if (!enabledDbs.length) {
    return {
      triggered: false,
      status: 'silent',
      statusText: '暂无开启的美食库 · 保持静默',
      foods: [],
      prompt: '',
      trace: buildTrace({
        status: 'silent',
        statusText: '暂无开启的美食库 · 保持静默',
        intentTriggered: false,
        intentSource: '所有美食库均已关闭',
        decisionStage: '库未开启',
        decisionReason: '当前没有开启任何美食库（可在美食设置中手动勾选开启）'
      })
    };
  }

  // 2. 执行三维感知（地图、日历、天候、正文）
  const mapSense = senseMapLocation(mapProjection, core);
  const calSense = senseCalendar(calendarContext, core, new Date(), storyText);
  const weatherSense = senseWeather(calendarContext, storyText);
  const storySense = senseStoryText(storyText, core);

  // 自动联通已开启的美食库关键词、时段词、节日词及菜品分组标签（只要剧情提及，立即激活进食契机）
  for (const db of enabledDbs) {
    const customTriggers = [
      ...(db.keywords || []),
      ...(db.calendarSlots || []),
      ...(db.calendarFestivals || []),
      ...extractDishConditions(db)
    ];
    for (const kw of customTriggers) {
      if (kw && storyText.includes(kw)) {
        storySense.hasMealIntent = true;
        if (!storySense.hitKeywords.includes(kw)) storySense.hitKeywords.push(kw);
      }
    }
  }

  // 自动联通用户全局进食契机词（默认包含常用动作与就餐感知词汇）
  const defaultIntentWords = '吃, 喝, 饿, 尝, 吃饭, 做饭, 点餐, 点菜, 用餐, 就餐, 宵夜, 夜宵, 饮茶, 饱, 嘴馋';
  const customIntents = String(foodieState.customIntentWords || defaultIntentWords).split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  for (const w of customIntents) {
    if (w && storyText.includes(w)) {
      storySense.hasMealIntent = true;
      if (!storySense.hitKeywords.includes(w)) storySense.hitKeywords.push(w);
    }
  }

  const contextTimeSummary = `${calSense.timeSlotLabel} · ${weatherSense.text} · ${calSense.season}`;

  // 3. 判断是否处于进食契机
  const hasTrigger = storySense.hasMealIntent || (currentSession && Math.abs(turnIndex - (currentSession.startTurn || 0)) <= 4);

  // 稳定性维护：如果在连续用餐期内（且未强制刷新），保持菜品一致！
  if (!forceRefresh && currentSession && currentSession.foods?.length && (turnIndex - currentSession.lastTurn <= 3) && hasTrigger) {
    const rounds = (turnIndex - currentSession.startTurn) + 1;
    const prompt = formatFoodiePrompt(template, currentSession.foods);
    return {
      triggered: true,
      status: 'stable',
      statusText: `稳定期 · 第 ${Math.max(1, rounds)} 轮`,
      foods: currentSession.foods,
      prompt,
      session: {
        ...currentSession,
        lastTurn: turnIndex
      },
      trace: buildTrace({
        status: 'stable',
        statusText: `稳定期 · 第 ${Math.max(1, rounds)} 轮`,
        intentTriggered: true,
        hitKeywords: storySense.hitKeywords,
        intentSource: `就餐情节延续（第 ${Math.max(1, rounds)} 轮）`,
        mapSense,
        calSense,
        weatherSense,
        decisionStage: '用餐期保持',
        decisionReason: `角色处于连续就餐情境中，保持【${currentSession.dbLabel || '当前菜库'}】菜品一致`,
        pickedFoods: currentSession.foods,
        prompt,
        contextTimeSummary
      })
    };
  }

  // 若完全没有进食意图且没有活跃就餐期，动态静默！
  if (!storySense.hasMealIntent && !forceRefresh) {
    return {
      triggered: false,
      status: 'silent',
      statusText: '暂无进食契机 · 保持静默',
      foods: [],
      prompt: '',
      session: null,
      trace: buildTrace({
        status: 'silent',
        statusText: '暂无进食契机 · 保持静默',
        intentTriggered: false,
        intentSource: '正文未出现用餐、饥饿或自定义契机词',
        mapSense,
        calSense,
        weatherSense,
        decisionStage: '契机静默',
        decisionReason: '剧情未处于进食情境，寻味保持动态静默，未向正文注入提示词',
        enabledDbsCount: enabledDbs.length,
        contextTimeSummary
      })
    };
  }

  // 4. 交集加权匹配大类
  let selectedDb = null;
  let matchReason = '';

  // 4.1 用户自建库优先（全面加权：地点、餐期时段、节气/季节、天气天候、正文触发词）
  const customCandidates = [];
  let matchStage = '自建预设高权优先';
  if (!selectedDb) {
    let bestCustomDb = null;
    let bestScore = 0;
    let bestReason = '';

    for (const db of enabledDbs) {
      if (!db.builtin) {
        let score = 0;
        const reasons = [];

        // 1. 地图地点
        if (db.mapLocations?.some(loc => loc && mapSense.locationText.includes(loc))) {
          score += 6;
          reasons.push(`地点命中(${mapSense.locationText})`);
        }

        // 2. 餐期时段（支持完全自由填写的架空/自定义时段：正文提及直接命中，同时兼容标准时段别名）
        const hitSlot = db.calendarSlots?.find(slot => slot && (isTimeSlotMatched(slot, calSense) || (storyText && storyText.includes(slot))));
        if (hitSlot) {
          score += 5;
          reasons.push(`餐期命中(${hitSlot})`);
        }

        // 3. 节日与节气（完全支持架空节日/虚构日历事件/正文节日描写）
        const matchedFest = db.calendarFestivals?.find(f => f && (
          (calSense.festivals || []).some(fest => fest.includes(f) || f.includes(fest)) ||
          (calSense.jieqi && (f.includes(calSense.jieqi) || calSense.jieqi.includes(f))) ||
          (storyText && storyText.includes(f))
        ));
        if (matchedFest) {
          score += 6;
          reasons.push(`节日/节令命中(${matchedFest})`);
        }

        if (calSense.season && db.calendarSeasons?.some(s => s && (s.includes(calSense.season) || calSense.season.includes(s)))) {
          score += 4;
          reasons.push(`季节命中(${calSense.season})`);
        }

        // 4. 天候天气（联动日历天气及正文天候描述）
        if (weatherSense.matched && db.weatherConditions?.some(w => w && (weatherSense.conditions.some(c => c.includes(w) || w.includes(c)) || weatherSense.raw?.includes(w) || w.includes(weatherSense.raw)))) {
          score += 5;
          reasons.push(`天气命中(${weatherSense.text})`);
        }

        // 5. 关键词
        const hitKw = db.keywords?.find(kw => kw && storySense.hitKeywords.includes(kw));
        if (hitKw) {
          score += 4;
          reasons.push(`触发词(${hitKw})`);
        }

        // 6. 库内菜品自带的时令、节气、餐期条件标签（下钻命中）
        const dishConds = extractDishConditions(db);
        for (const dc of dishConds) {
          if (isConditionMatched(dc, { calSense, weatherSense, mapSense, storyText })) {
            score += 5;
            reasons.push(`子项时令/餐期(${dc})`);
            break;
          }
        }

        customCandidates.push({
          label: db.label,
          score,
          reasons: reasons.slice()
        });

        if (score > bestScore) {
          bestScore = score;
          bestCustomDb = db;
          bestReason = `自建预设【${db.label}】(${reasons.join(' + ')})`;
        }
      }
    }

    if (bestCustomDb && bestScore > 0) {
      selectedDb = bestCustomDb;
      matchReason = bestReason;
    }
  }

  // 4.2 正文业态/身体状态 ∩ 地图菜系交集
  if (!selectedDb && mapSense.matchedLocations.length && (storySense.matchedBiz.length || storySense.matchedStates.length)) {
    const bizOrState = [...storySense.matchedBiz, ...storySense.matchedStates][0];
    const candidate = enabledDbs.find(db => {
      const locHit = db.mapLocations?.some(loc => mapSense.matchedLocations.includes(loc));
      const tagHit = db.tags?.some(tag => tag.includes(bizOrState)) || db.label.includes(bizOrState);
      return locHit && tagHit;
    });
    if (candidate) {
      selectedDb = candidate;
      matchStage = '地点与正文业态交集'; matchReason = `地点(${mapSense.matchedLocations[0]})与正文(${bizOrState})交集融合`;
    }
  }

  // 4.3 地图菜系/片区优先（细分片区优先匹配！）
  if (!selectedDb && mapSense.matchedLocations.length) {
    // 优先匹配细分片区（cn-pian），更精准
    const pianCandidate = enabledDbs.find(db => db.kind === 'cn-pian' && db.mapLocations?.some(loc => mapSense.matchedLocations.includes(loc)));
    const candidate = pianCandidate || enabledDbs.find(db => db.mapLocations?.some(loc => mapSense.matchedLocations.includes(loc)));
    if (candidate) {
      selectedDb = candidate;
      matchStage = '地域菜系片区优先'; matchReason = `地图定位【${mapSense.matchedLocations[0]}】锚定地域菜系`;
    }
  }

  // 4.4 正文明确提及的业态/场景
  if (!selectedDb && storySense.matchedBiz.length) {
    const biz = storySense.matchedBiz[0];
    const candidate = enabledDbs.find(db => db.tags?.some(tag => tag.includes(biz)) || db.label.includes(biz));
    if (candidate) {
      selectedDb = candidate;
      matchStage = '正文场景业态命中'; matchReason = `正文提及场景【${biz}】`;
    }
  }

  // 4.5 节气节日应季特色
  if (!selectedDb && (calSense.festival || calSense.jieqi)) {
    const festName = calSense.festival || calSense.jieqi;
    const iconic = core.festIconic?.[festName] || core.jieqiIconic?.[festName];
    if (iconic) {
      const festFoods = iconic.split(',').map(s => s.trim()).filter(Boolean);
      if (festFoods.length) {
        const picked = festFoods.slice(0, targetCount);
        const prompt = formatFoodiePrompt(template, picked);
        return {
          triggered: true,
          status: 'active',
          statusText: '应季节令生效中',
          foods: picked,
          prompt,
          session: {
            foods: picked,
            startTurn: turnIndex,
            lastTurn: turnIndex,
            dbLabel: `节令·${festName}`
          },
          trace: buildTrace({
            status: 'active',
            statusText: '应季节令生效中',
            intentTriggered: true,
            hitKeywords: storySense.hitKeywords,
            intentSource: '进食意图 ∩ 应季民俗',
            mapSense,
            calSense,
            weatherSense,
            decisionStage: '应季节令特色',
            decisionReason: `日历逢【${festName}】，匹配到标志性节日饮食`,
            enabledDbsCount: enabledDbs.length,
            pickedFoods: picked,
            prompt,
            contextTimeSummary
          })
        };
      }
    }
  }

  // 4.6 兜底：中餐日常/通用菜库
  if (!selectedDb) {
    const fallbackDb = enabledDbs.find(db => db.id === 'cn:daily') || enabledDbs[0];
    selectedDb = fallbackDb;
    matchStage = '通用日常风味兜底'; matchReason = '通用日常家常风味';
  }

  // 5. 采用原版智能配套算法组装套餐（主菜 + 主食/汤羹 + 饮品），融入时令/节气/餐期智能下钻
  const pickedFoods = assembleMealCombo(selectedDb, targetCount, {
    calSense,
    weatherSense,
    mapSense,
    storyText
  });
  const prompt = formatFoodiePrompt(template, pickedFoods);

  const newSession = {
    foods: pickedFoods,
    startTurn: turnIndex,
    lastTurn: turnIndex,
    dbId: selectedDb?.id,
    dbLabel: selectedDb?.label
  };

  return {
    triggered: true,
    status: 'active',
    statusText: '生效中',
    foods: pickedFoods,
    prompt,
    session: newSession,
    trace: buildTrace({
      status: 'active',
      statusText: '生效中',
      intentTriggered: true,
      hitKeywords: storySense.hitKeywords,
      intentSource: storySense.hitKeywords.length ? `正文命中关键词 [${storySense.hitKeywords.slice(0, 3).join(', ')}]` : '就餐契机触发',
      mapSense,
      calSense,
      weatherSense,
      selectedDb,
      decisionStage: matchStage,
      decisionReason: matchReason,
      customScores: customCandidates,
      enabledDbsCount: enabledDbs.length,
      pickedFoods,
      prompt,
      contextTimeSummary
    })
  };
}

export function formatFoodiePrompt(template = DEFAULT_FOODIE_TEMPLATE, foods = []) {
  if (!foods || !foods.length) return '';
  const foodStr = foods.join('、');
  if (template.includes('{{food}}')) {
    return template.replace(/\{\{food\}\}/g, foodStr);
  }
  return `[食物线索：${foodStr}]`;
}
