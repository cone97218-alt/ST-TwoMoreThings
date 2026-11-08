// 剧情与装饰天气；接口暂缺时提供随季节变化的装饰天气，不联网、不反向写入剧情。
export function readLockWeather(api = globalThis.STSevenDaysCal, now = new Date()) {
  if (api?.apiVersion === 1 && typeof api.getPhoneSnapshot === 'function') {
    const snapshot = api.getPhoneSnapshot();
    if (snapshot?.weather?.text) return { text: String(snapshot.weather.text), temperature: String(snapshot.weather.temperature || ''), source: 'gouhua' };
  }
  const month = (now instanceof Date && !isNaN(now)) ? now.getMonth() + 1 : 10;
  const seasonal = month >= 3 && month <= 5 ? { text: '晴', temperature: '18°C' }
    : month >= 6 && month <= 8 ? { text: '晴朗', temperature: '28°C' }
    : month >= 9 && month <= 11 ? { text: '晴', temperature: '22°C' }
    : { text: '晴冷', temperature: '6°C' };
  return { ...seasonal, source: 'decoration' };
}

// 天气系统核心引擎：基于 Open-Meteo 开源气象 API、四季加权概率表、古今地名映射及古风辞藻渲染

export const WEATHER_TABLE = {
  spring: [
    { type: 'sunny', weight: 25, cn: '晴朗', en: 'Sunny', tempRange: [15, 25], icon: '☀️' },
    { type: 'partly_cloudy', weight: 20, cn: '晴间多云', en: 'Partly Cloudy', tempRange: [14, 23], icon: '⛅' },
    { type: 'cloudy', weight: 20, cn: '多云', en: 'Cloudy', tempRange: [12, 22], icon: '⛅' },
    { type: 'overcast', weight: 10, cn: '阴天', en: 'Overcast', tempRange: [10, 18], icon: '☁️' },
    { type: 'light_rain', weight: 15, cn: '小雨', en: 'Light Rain', tempRange: [10, 18], icon: '🌧️' },
    { type: 'moderate_rain', weight: 8, cn: '中雨', en: 'Moderate Rain', tempRange: [8, 16], icon: '🌧️' },
    { type: 'windy', weight: 8, cn: '大风', en: 'Windy', tempRange: [10, 20], icon: '🍃' },
    { type: 'foggy', weight: 5, cn: '雾', en: 'Foggy', tempRange: [8, 15], icon: '🌫️' },
    { type: 'thunderstorm', weight: 3, cn: '雷暴', en: 'Thunderstorm', tempRange: [12, 20], icon: '⛈️', extreme: true },
    { type: 'hail', weight: 1, cn: '冰雹', en: 'Hail', tempRange: [5, 15], icon: '🌨️', extreme: true },
  ],
  summer: [
    { type: 'sunny_hot', weight: 20, cn: '晴热', en: 'Sunny & Hot', tempRange: [30, 38], icon: '☀️' },
    { type: 'partly_cloudy', weight: 15, cn: '晴间多云', en: 'Partly Cloudy', tempRange: [28, 35], icon: '⛅' },
    { type: 'cloudy', weight: 10, cn: '多云', en: 'Cloudy', tempRange: [26, 32], icon: '⛅' },
    { type: 'humid', weight: 10, cn: '闷热潮湿', en: 'Humid', tempRange: [28, 36], icon: '💧' },
    { type: 'shower', weight: 12, cn: '阵雨', en: 'Shower', tempRange: [24, 30], icon: '🌦️' },
    { type: 'moderate_rain', weight: 8, cn: '中雨', en: 'Moderate Rain', tempRange: [22, 28], icon: '🌧️' },
    { type: 'heavy_rain', weight: 8, cn: '大雨', en: 'Heavy Rain', tempRange: [20, 26], icon: '🌧️' },
    { type: 'thunderstorm', weight: 10, cn: '雷阵雨', en: 'Thunderstorm', tempRange: [22, 30], icon: '⛈️' },
    { type: 'typhoon', weight: 2, cn: '台风', en: 'Typhoon', tempRange: [22, 28], icon: '🌀', extreme: true },
    { type: 'heatwave', weight: 5, cn: '高温热浪', en: 'Heatwave', tempRange: [36, 42], icon: '🔥', extreme: true },
  ],
  autumn: [
    { type: 'sunny', weight: 30, cn: '秋高气爽', en: 'Clear Autumn', tempRange: [12, 22], icon: '🌤️' },
    { type: 'partly_cloudy', weight: 15, cn: '晴间多云', en: 'Partly Cloudy', tempRange: [11, 21], icon: '⛅' },
    { type: 'cloudy', weight: 15, cn: '多云', en: 'Cloudy', tempRange: [10, 20], icon: '⛅' },
    { type: 'overcast', weight: 10, cn: '阴天', en: 'Overcast', tempRange: [8, 16], icon: '☁️' },
    { type: 'light_rain', weight: 12, cn: '秋雨', en: 'Autumn Rain', tempRange: [8, 16], icon: '🌧️' },
    { type: 'windy', weight: 13, cn: '秋风', en: 'Autumn Wind', tempRange: [8, 18], icon: '🍂' },
    { type: 'foggy', weight: 8, cn: '晨雾', en: 'Foggy', tempRange: [5, 14], icon: '🌫️' },
    { type: 'frost', weight: 4, cn: '霜降', en: 'Frost', tempRange: [0, 8], icon: '❄️' },
    { type: 'heavy_rain', weight: 3, cn: '暴雨', en: 'Heavy Rain', tempRange: [8, 14], icon: '🌧️', extreme: true },
  ],
  winter: [
    { type: 'sunny_cold', weight: 20, cn: '晴冷', en: 'Sunny & Cold', tempRange: [-5, 5], icon: '☀️' },
    { type: 'cloudy', weight: 20, cn: '多云', en: 'Cloudy', tempRange: [-3, 5], icon: '⛅' },
    { type: 'overcast', weight: 15, cn: '阴天', en: 'Overcast', tempRange: [-5, 3], icon: '☁️' },
    { type: 'light_snow', weight: 12, cn: '小雪', en: 'Light Snow', tempRange: [-8, 0], icon: '🌨️' },
    { type: 'moderate_snow', weight: 7, cn: '中雪', en: 'Moderate Snow', tempRange: [-10, -2], icon: '🌨️' },
    { type: 'sleet', weight: 5, cn: '雨夹雪', en: 'Sleet', tempRange: [-2, 3], icon: '🌨️' },
    { type: 'windy_cold', weight: 10, cn: '寒风刺骨', en: 'Biting Wind', tempRange: [-10, 0], icon: '🌬️' },
    { type: 'foggy', weight: 5, cn: '大雾', en: 'Dense Fog', tempRange: [-3, 3], icon: '🌫️' },
    { type: 'heavy_snow', weight: 5, cn: '大雪', en: 'Heavy Snow', tempRange: [-15, -5], icon: '❄️', extreme: true },
    { type: 'blizzard', weight: 2, cn: '暴风雪', en: 'Blizzard', tempRange: [-20, -8], icon: '🌨️', extreme: true },
    { type: 'ice_storm', weight: 1, cn: '冰暴', en: 'Ice Storm', tempRange: [-10, -2], icon: '🧊', extreme: true },
  ],
};

export const WMO_MAP = {
  0: { type: 'sunny', cn: '晴朗', en: 'Clear', icon: '☀️', extreme: false },
  1: { type: 'partly_cloudy', cn: '晴间多云', en: 'Mainly Clear', icon: '⛅', extreme: false },
  2: { type: 'cloudy', cn: '多云', en: 'Partly Cloudy', icon: '⛅', extreme: false },
  3: { type: 'overcast', cn: '阴天', en: 'Overcast', icon: '☁️', extreme: false },
  45: { type: 'foggy', cn: '雾', en: 'Fog', icon: '🌫️', extreme: false },
  48: { type: 'foggy', cn: '雾凇', en: 'Rime Fog', icon: '🌫️', extreme: false },
  51: { type: 'light_rain', cn: '小雨', en: 'Light Drizzle', icon: '🌧️', extreme: false },
  53: { type: 'light_rain', cn: '小雨', en: 'Moderate Drizzle', icon: '🌧️', extreme: false },
  55: { type: 'moderate_rain', cn: '中雨', en: 'Dense Drizzle', icon: '🌧️', extreme: false },
  56: { type: 'sleet', cn: '雨夹雪', en: 'Freezing Drizzle', icon: '🌨️', extreme: false },
  57: { type: 'sleet', cn: '雨夹雪', en: 'Dense Freezing Drizzle', icon: '🌨️', extreme: false },
  61: { type: 'light_rain', cn: '小雨', en: 'Slight Rain', icon: '🌧️', extreme: false },
  63: { type: 'moderate_rain', cn: '中雨', en: 'Rain', icon: '🌧️', extreme: false },
  65: { type: 'heavy_rain', cn: '大雨', en: 'Heavy Rain', icon: '🌧️', extreme: true },
  66: { type: 'sleet', cn: '冻雨', en: 'Freezing Rain', icon: '🌨️', extreme: true },
  67: { type: 'sleet', cn: '冻雨', en: 'Heavy Freezing Rain', icon: '🌨️', extreme: true },
  71: { type: 'light_snow', cn: '小雪', en: 'Slight Snow', icon: '🌨️', extreme: false },
  73: { type: 'moderate_snow', cn: '中雪', en: 'Snow', icon: '🌨️', extreme: false },
  75: { type: 'heavy_snow', cn: '大雪', en: 'Heavy Snow', icon: '❄️', extreme: true },
  77: { type: 'snow', cn: '雪粒', en: 'Snow Grains', icon: '❄️', extreme: false },
  80: { type: 'shower', cn: '阵雨', en: 'Rain Showers', icon: '🌦️', extreme: false },
  81: { type: 'shower', cn: '阵雨', en: 'Moderate Showers', icon: '🌦️', extreme: false },
  82: { type: 'heavy_rain', cn: '暴雨', en: 'Violent Showers', icon: '🌧️', extreme: true },
  85: { type: 'light_snow', cn: '阵雪', en: 'Snow Showers', icon: '🌨️', extreme: false },
  86: { type: 'heavy_snow', cn: '暴雪', en: 'Heavy Snow Showers', icon: '❄️', extreme: true },
  95: { type: 'thunderstorm', cn: '雷暴', en: 'Thunderstorm', icon: '⛈️', extreme: true },
  96: { type: 'thunderstorm', cn: '雷暴夹冰雹', en: 'Thunderstorm with Hail', icon: '⛈️', extreme: true },
  99: { type: 'thunderstorm', cn: '强雷暴夹冰雹', en: 'Heavy Thunderstorm with Hail', icon: '⛈️', extreme: true },
};

export const ANCIENT_TO_MODERN = {
  长安: '西安',
  洛阳: '洛阳',
  建康: '南京',
  金陵: '南京',
  江宁: '南京',
  临安: '杭州',
  钱塘: '杭州',
  燕京: '北京',
  大都: '北京',
  幽州: '北京',
  襄阳: '襄阳',
  开封: '开封',
  汴梁: '开封',
  汴京: '开封',
  姑苏: '苏州',
  吴中: '苏州',
  成都府: '成都',
  蜀都: '成都',
  广陵: '扬州',
  江都: '扬州',
  江陵: '荆州',
  渤海: '天津',
  平城: '大同',
  咸阳: '咸阳',
  许昌: '许昌',
  邺城: '邯郸',
  寿春: '淮南',
  襄平: '辽阳',
};

export const ANCIENT_WEATHER_TEXT = {
  light_rain: '微雨如丝',
  moderate_rain: '细雨绵绵',
  heavy_rain: '大雨倾盆',
  shower: '骤雨时落',
  thunderstorm: '雷电交作',
  foggy: '雾气弥漫',
  windy: '风势渐紧',
  windy_cold: '朔风凛冽',
  humid: '暑热潮闷',
  sunny_hot: '烈日当空',
  heatwave: '酷热难当',
  light_snow: '小雪初降',
  moderate_snow: '雪花纷飞',
  heavy_snow: '大雪封途',
  sleet: '雨雪交加',
  frost: '霜露凝寒',
  hail: '冰雹骤落',
  typhoon: '狂风卷地',
  blizzard: '风雪暴烈',
  ice_storm: '冰雨如刀',
  sunny: '晴朗无云',
  cloudy: '云开半掩',
  overcast: '天色阴沉',
  partly_cloudy: '晴间多云',
  sunny_cold: '天晴而寒',
};

export const ANCIENT_TEMP_WORDS = [
  { max: 0, word: '寒气逼人' },
  { max: 8, word: '微寒' },
  { max: 16, word: '略凉' },
  { max: 24, word: '温润宜人' },
  { max: 30, word: '微热' },
  { max: 36, word: '暑气渐盛' },
  { max: 99, word: '酷热难耐' },
];

export const ANCIENT_IMPACTS = {
  light_rain: '行路宜携伞，衣衫勿湿',
  moderate_rain: '道路泥泞，舟车稍缓',
  heavy_rain: '沟渠暴涨，宜避外行',
  shower: '雨来忽至，宜备蓑笠',
  thunderstorm: '雷鸣电闪，不可空旷久立',
  foggy: '雾深路迷，行路须谨慎',
  windy: '风劲尘起，行路需防坠物',
  windy_cold: '寒风侵骨，当添衣保暖',
  humid: '暑湿相蒸，易生倦怠',
  sunny_hot: '烈日曝身，当避炎暑',
  heatwave: '酷暑难耐，少出为宜',
  light_snow: '薄雪初覆，道路湿滑',
  moderate_snow: '积雪渐厚，行路不便',
  heavy_snow: '风雪封途，出行暂停',
  sleet: '冰滑难行，当缓步谨慎',
  frost: '晨寒地滑，注意防寒',
  hail: '冰雹伤物，当避檐下',
  typhoon: '狂风大作，闭户避风',
  blizzard: '暴雪狂风，不可远行',
  ice_storm: '冰雨骤急，树木易折',
};

export const MODERN_IMPACTS = {
  light_rain: '可能需要撑伞，出行稍受影响',
  moderate_rain: '户外活动受限，路面湿滑',
  heavy_rain: '不宜外出，注意低洼积水',
  shower: '短时降雨，可能突然开始又突然停止',
  thunderstorm: '电闪雷鸣，不宜在空旷处停留',
  foggy: '能见度低，出行驾车需小心',
  windy: '风力较大，注意防风保暖',
  windy_cold: '寒风凛冽，需要厚衣防寒',
  humid: '空气闷热潮湿，体感偏黏腻',
  sunny_hot: '烈日当空，注意防晒和补水',
  heatwave: '极端高温，尽量减少户外活动',
  light_snow: '薄雪覆盖，路面微滑',
  moderate_snow: '积雪明显，路滑减速',
  heavy_snow: '大雪封路，交通易受阻',
  sleet: '雨雪混杂，地面湿冷难行',
  frost: '地面结霜，清晨微寒',
  hail: '冰雹突降，注意寻找庇护',
  typhoon: '强台风影响，避免非必要外出',
  blizzard: '暴风雪天气，严禁远行',
  ice_storm: '冰冻严重，小心滑倒',
};

const GEO_CACHE = new Map();
const WEATHER_CACHE = new Map();

export const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

const SOLAR_TERM_C_21 = [
  5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
  7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94,
];

export function getSolarTerm(year, month, day) {
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || 1;
  const d = Number(day) || 1;
  const y2 = y % 100;
  const D = 0.2422;
  const termIdx1 = (m - 1) * 2;
  const termIdx2 = termIdx1 + 1;
  const L = Math.floor((y2 - 1) / 4);
  const day1 = Math.floor(y2 * D + SOLAR_TERM_C_21[termIdx1]) - L;
  const day2 = Math.floor(y2 * D + SOLAR_TERM_C_21[termIdx2]) - L;

  if (d === day1) return { term: SOLAR_TERMS[termIdx1], isExactDay: true };
  if (d === day2) return { term: SOLAR_TERMS[termIdx2], isExactDay: true };
  if (d < day1) {
    const prevIdx = (termIdx1 + 23) % 24;
    return { term: SOLAR_TERMS[prevIdx], isExactDay: false };
  }
  if (d < day2) {
    return { term: SOLAR_TERMS[termIdx1], isExactDay: false };
  }
  return { term: SOLAR_TERMS[termIdx2], isExactDay: false };
}

export function getHourlyTemperature(baseTemp, timeStr = '', { season = 'spring', isRainy = false, diurnalRange = null, seed = '' } = {}) {
  const temp = typeof baseTemp === 'number' ? baseTemp : 20;
  if (!timeStr || typeof timeStr !== 'string') return temp;
  const match = /^(\d{1,2})(?::(\d{2}))?/.exec(timeStr.trim());
  if (!match) return temp;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const timeFraction = hour + minute / 60;

  let diurnal = typeof diurnalRange === 'number'
    ? diurnalRange
    : (season === 'summer' ? 6 : season === 'winter' ? 4 : 5);
  if (isRainy) {
    diurnal = Math.max(1.5, diurnal * 0.7);
  }

  const amplitude = Math.max(1, diurnal / 2);
  const curve = Math.cos(((timeFraction - 15) / 12) * Math.PI);
  const offset = curve * amplitude;

  let jitter = 0;
  if (seed) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    jitter = (((h >>> 0) % 1000) / 1000 * 2 - 1) * 0.4;
  }
  return Math.round(temp + offset + jitter);
}

export function defaultWeatherConfig() {
  return {
    enabled: false,
    worldEra: 'auto', // 'auto' | 'modern' | 'ancient'
    defaultCity: '北京',
    ancientLocationMap: [],
    weatherOverrides: {},
    solarTermsEnabled: true,
    injectPrompt: true,
    continuity: 80,
    jitter: 2,
    seedSalt: 0,
  };
}

export function getSeason(month) {
  const m = Number(month) || 1;
  if ([3, 4, 5].includes(m)) return 'spring';
  if ([6, 7, 8, 9].includes(m)) return 'summer';
  if ([10, 11].includes(m)) return 'autumn';
  return 'winter';
}

export function seededRandom(seed = '') {
  let h = 2166136261 >>> 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedRandom(items, rng = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const total = items.reduce((s, i) => s + (Number(i.weight) || 1), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= (Number(item.weight) || 1);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function rollWeather(month, { seed = '' } = {}) {
  const rng = seed ? seededRandom(seed) : Math.random;
  const season = getSeason(month);
  const table = WEATHER_TABLE[season] || WEATHER_TABLE.spring;
  const picked = weightedRandom(table, rng) || table[0];
  const minTemp = picked.tempRange[0];
  const maxTemp = picked.tempRange[1];
  const ratio = seed ? (0.3 + rng() * 0.4) : 0.618;
  const temp = Math.round(minTemp + (maxTemp - minTemp) * ratio);
  return {
    type: picked.type,
    cn: picked.cn,
    en: picked.en,
    temp,
    minTemp,
    maxTemp,
    extreme: Boolean(picked.extreme),
    icon: picked.icon || '⛅',
    season,
    source: 'procedural',
    isRainy: isRainyType(picked.type),
  };
}

export function isRainyType(type) {
  return ['light_rain', 'moderate_rain', 'heavy_rain', 'shower', 'thunderstorm', 'sleet'].includes(type);
}

export function normalizeLocation(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/[·•|]/g, ' ');
  s = s.split(/[\s,，、/]/)[0];
  s = s.replace(/(市|省|自治区|特别行政区|县|区|府|城|郡|道)$/g, '');
  return s;
}

export function mapAncientLocation(raw, ancientMap = []) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const base = normalizeLocation(raw);
  if (Array.isArray(ancientMap)) {
    const hit = ancientMap.find(x => x && (x.from === trimmed || normalizeLocation(x.from) === base));
    if (hit && hit.to) return normalizeLocation(hit.to);
  }
  return ANCIENT_TO_MODERN[trimmed] || ANCIENT_TO_MODERN[base] || trimmed;
}

export async function geocodeLocation(name) {
  const cleanName = normalizeLocation(name);
  if (!cleanName) return null;
  if (GEO_CACHE.has(cleanName)) return GEO_CACHE.get(cleanName);

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanName)}&count=1&language=zh&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.results?.length) {
      const r = data.results[0];
      const info = {
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country,
      };
      GEO_CACHE.set(cleanName, info);
      return info;
    }
  } catch {}
  return null;
}

export async function fetchOpenMeteoWeather(geo, dateStr) {
  if (!geo?.latitude || !geo?.longitude || !dateStr) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const isArchive = dateStr <= todayStr;
  const baseUrl = isArchive ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const url = `${baseUrl}?latitude=${geo.latitude}&longitude=${geo.longitude}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const idx = data?.daily?.time?.indexOf(dateStr) ?? -1;
    if (idx < 0) return null;

    const maxTemp = data.daily.temperature_2m_max?.[idx];
    const minTemp = data.daily.temperature_2m_min?.[idx];
    const wmoCode = data.daily.weather_code?.[idx];
    if (maxTemp == null || minTemp == null) return null;

    const range = Math.max(0, maxTemp - minTemp);
    const temp = Math.round(minTemp + range * 0.618);
    const info = WMO_MAP[wmoCode] || { type: 'cloudy', cn: '多云', en: 'Cloudy', icon: '⛅', extreme: false };

    return {
      type: info.type,
      cn: info.cn,
      en: info.en,
      temp,
      minTemp: Math.round(minTemp),
      maxTemp: Math.round(maxTemp),
      extreme: info.extreme,
      icon: info.icon,
      source: isArchive ? 'archive' : 'forecast',
      isRainy: isRainyType(info.type),
      wmoCode,
    };
  } catch {}
  return null;
}

export function applyContinuity(baseWeather, prevWeather, { continuity = 80, jitter = 2 } = {}) {
  if (!prevWeather) return baseWeather;
  if (Math.random() * 100 > continuity) return baseWeather;

  let temp = baseWeather.temp;
  const prevTemp = typeof prevWeather.temp === 'number' ? prevWeather.temp : temp;
  const diff = prevTemp - temp;
  const clamped = Math.max(-2, Math.min(2, diff)) * 0.5;
  const randomJitter = (Math.random() * 2 - 1) * jitter;
  temp = Math.round(temp + clamped + randomJitter);

  let type = baseWeather.type;
  let cn = baseWeather.cn;
  let icon = baseWeather.icon;
  if (baseWeather.isRainy && prevWeather.isRainy) {
    if (Math.random() < 0.2 && prevWeather.type) {
      type = prevWeather.type;
      cn = prevWeather.cn;
      icon = prevWeather.icon;
    }
  } else if (!baseWeather.isRainy && !prevWeather.isRainy) {
    if (Math.random() < 0.2 && prevWeather.type) {
      type = prevWeather.type;
      cn = prevWeather.cn;
      icon = prevWeather.icon;
    }
  }

  return {
    ...baseWeather,
    type,
    cn,
    icon,
    temp,
    isRainy: isRainyType(type),
  };
}

export async function resolveWeatherForDate({
  dateStr = '',
  month = 1,
  location = '',
  worldEra = 'auto',
  weatherConfig = defaultWeatherConfig(),
  previousWeather = null,
} = {}) {
  const m = Number(month) || 1;
  const era = worldEra === 'auto' ? (weatherConfig.worldEra || 'auto') : worldEra;
  const rawLoc = String(location || weatherConfig.defaultCity || '').trim();
  const isAncient = era === 'ancient';
  const targetLoc = isAncient ? mapAncientLocation(rawLoc, weatherConfig.ancientLocationMap) : normalizeLocation(rawLoc);

  const dateKey = dateStr || (month ? `m${month}` : '');
  const overrides = weatherConfig?.weatherOverrides || {};
  const manual = overrides[dateKey] || overrides[`${dateKey}|${targetLoc}`] || (rawLoc ? overrides[`${dateKey}|${rawLoc}`] : null);
  if (manual) {
    const minTemp = typeof manual.minTemp === 'number' ? manual.minTemp : (typeof manual.temp === 'number' ? manual.temp - 3 : 15);
    const maxTemp = typeof manual.maxTemp === 'number' ? manual.maxTemp : (typeof manual.temp === 'number' ? manual.temp + 4 : 25);
    return {
      type: manual.type || 'cloudy',
      cn: manual.cn || '多云',
      en: manual.en || 'Cloudy',
      temp: typeof manual.temp === 'number' ? manual.temp : 20,
      minTemp,
      maxTemp,
      extreme: Boolean(manual.extreme),
      icon: manual.icon || '⛅',
      season: getSeason(m),
      source: 'manual',
      isRainy: isRainyType(manual.type || 'cloudy'),
      isManual: true,
      note: manual.note || '剧情锁定',
      location: rawLoc,
      mappedLocation: targetLoc,
    };
  }

  const cacheKey = `${targetLoc || 'none'}_${dateStr || `m${m}`}`;
  if (WEATHER_CACHE.has(cacheKey)) {
    const cached = WEATHER_CACHE.get(cacheKey);
    return applyContinuity(cached, previousWeather, weatherConfig);
  }

  let result = null;
  if (targetLoc && dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const geo = await geocodeLocation(targetLoc);
    if (geo) {
      const fetched = await fetchOpenMeteoWeather(geo, dateStr);
      if (fetched) {
        result = {
          ...fetched,
          location: rawLoc,
          mappedLocation: targetLoc,
          season: getSeason(m),
        };
      }
    }
  }

  if (!result) {
    const seed = `${dateKey}_${targetLoc || rawLoc}_${weatherConfig?.seedSalt || ''}`;
    result = rollWeather(m, { seed });
    result.location = rawLoc;
    result.mappedLocation = targetLoc;
  }

  WEATHER_CACHE.set(cacheKey, result);
  return applyContinuity(result, previousWeather, weatherConfig);
}

export function formatWeatherPrompt(weather, { worldEra = 'modern', includeImpact = false, timeStr = '', solarTerm = null } = {}) {
  if (!weather) return '';
  const isAncient = worldEra === 'ancient';
  const displayTemp = timeStr
    ? getHourlyTemperature(weather.temp, timeStr, { season: weather.season, isRainy: weather.isRainy })
    : weather.temp;

  if (isAncient) {
    const text = ANCIENT_WEATHER_TEXT[weather.type] || weather.cn || '天朗气清';
    const tempWordEntry = ANCIENT_TEMP_WORDS.find(w => displayTemp <= w.max) || ANCIENT_TEMP_WORDS.at(-1);
    const tempWord = tempWordEntry?.word || '温润';
    return `当前天气：${text}，${tempWord}`;
  }

  return `当前天气：${weather.cn}，气温约 ${displayTemp}°C`;
}
