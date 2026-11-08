import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollWeather,
  mapAncientLocation,
  formatWeatherPrompt,
  applyContinuity,
  defaultWeatherConfig,
  normalizeLocation,
  isRainyType,
  ANCIENT_TO_MODERN,
} from '../src/weather.js';
import { resolveCalendarWeatherPrompt } from '../src/calendar-engine.js';
import { createCalendarReader } from '../src/calendar.js';

test('weather: rollWeather generates reasonable seasonal temperatures and types', () => {
  // 春
  const spring = rollWeather(4);
  assert.ok(spring.temp >= 5 && spring.temp <= 30);
  assert.equal(spring.season, 'spring');
  assert.ok(spring.cn);
  assert.ok(spring.icon);

  // 夏
  const summer = rollWeather(7);
  assert.ok(summer.temp >= 15 && summer.temp <= 45);
  assert.equal(summer.season, 'summer');

  // 秋
  const autumn = rollWeather(10);
  assert.ok(autumn.temp >= 0 && autumn.temp <= 25);
  assert.equal(autumn.season, 'autumn');

  // 冬
  const winter = rollWeather(1);
  assert.ok(winter.temp >= -25 && winter.temp <= 10);
  assert.equal(winter.season, 'winter');
});

test('weather: isRainyType properly identifies precipitation', () => {
  assert.equal(isRainyType('light_rain'), true);
  assert.equal(isRainyType('heavy_rain'), true);
  assert.equal(isRainyType('thunderstorm'), true);
  assert.equal(isRainyType('sunny'), false);
  assert.equal(isRainyType('cloudy'), false);
});

test('weather: normalizeLocation and mapAncientLocation correctly resolve ancient cities', () => {
  assert.equal(mapAncientLocation('长安'), '西安');
  assert.equal(mapAncientLocation('临安府'), '杭州');
  assert.equal(mapAncientLocation('建康'), '南京');
  assert.equal(mapAncientLocation('姑苏城'), '苏州');
  assert.equal(mapAncientLocation('未知古城'), '未知古城');

  // 自定义映射
  const customMap = [{ from: '江东', to: '南京' }, { from: '广陵', to: '扬州' }];
  assert.equal(mapAncientLocation('江东', customMap), '南京');
  assert.equal(mapAncientLocation('广陵', customMap), '扬州');
});

test('weather: formatWeatherPrompt formats modern and ancient texts cleanly without English', () => {
  const sampleWeather = {
    type: 'partly_cloudy',
    cn: '晴间多云',
    en: 'Partly Cloudy',
    temp: 22,
    icon: '⛅',
    extreme: false,
  };

  const modern = formatWeatherPrompt(sampleWeather, { worldEra: 'modern' });
  assert.ok(modern.includes('当前天气：晴间多云，气温约 22°C'));
  assert.ok(!modern.includes('Partly Cloudy'));

  const ancient = formatWeatherPrompt(sampleWeather, { worldEra: 'ancient' });
  assert.ok(ancient.includes('当前天气：'));
  assert.ok(ancient.includes('温润宜人'));
  assert.ok(!ancient.includes('°C'));
  assert.ok(!ancient.includes('Partly Cloudy'));
});

test('weather: applyContinuity smooths temperature jumps', () => {
  const base = { type: 'sunny', cn: '晴朗', temp: 28, isRainy: false };
  const prev = { type: 'sunny', cn: '晴朗', temp: 20, isRainy: false };
  const result = applyContinuity(base, prev, { continuity: 100, jitter: 0 });
  // 差距为 8，被限制为 clamp(-2, 2) * 0.5 = -1，预期温度向昨天靠拢
  assert.ok(result.temp <= 28);
});

test('calendar-engine: resolveCalendarWeatherPrompt creates valid weather prompt object', () => {
  const timeInfo = { date: '2025-05-18', time: '14:30', weekday: '周日' };
  const cal = { era: '', months: [{ days: 31 }, { days: 28 }, { days: 31 }, { days: 30 }, { days: 31 }] };
  const weatherConfig = { enabled: true, worldEra: 'modern', defaultCity: '北京' };

  const resolved = resolveCalendarWeatherPrompt(timeInfo, cal, weatherConfig);
  assert.ok(resolved);
  assert.equal(resolved.worldEra, 'modern');
  assert.ok(resolved.weather);
  assert.ok(resolved.prompt.includes('当前天气：'));
});

test('calendar: createCalendarReader provides weatherPrompt and weatherInfo', () => {
  const store = {
    read() {
      return {
        calendar: {
          weatherConfig: {
            enabled: true,
            worldEra: 'ancient',
            defaultCity: '长安',
          },
        },
      };
    },
  };
  const target = {
    messages: [
      { message: { mes: '[[WORLD]] location=长安 | time=2025年05月01日 12:00[[/WORLD]]' } },
    ],
  };

  const reader = createCalendarReader({ store, target });
  const weather = reader.weatherInfo();
  assert.ok(weather);
  assert.equal(weather.worldEra, 'ancient');
  assert.ok(weather.prompt.includes('当前天气：'));
});

test('weather: getHourlyTemperature calculates diurnal curve properly', async () => {
  const { getHourlyTemperature } = await import('../src/weather.js');
  const base = 20;
  const temp15 = getHourlyTemperature(base, '15:00', { season: 'spring' });
  const temp03 = getHourlyTemperature(base, '03:00', { season: 'spring' });
  assert.ok(temp15 > temp03, '15:00 should be warmer than 03:00');
  assert.ok(temp15 >= 22);
  assert.ok(temp03 <= 18);
});

test('weather: getSolarTerm accurately calculates solar terms', async () => {
  const { getSolarTerm } = await import('../src/weather.js');
  const jingzhe = getSolarTerm(2025, 3, 5);
  assert.equal(jingzhe.term, '惊蛰');
  assert.equal(jingzhe.isExactDay, true);

  const xiazhi = getSolarTerm(2025, 6, 21);
  assert.equal(xiazhi.term, '夏至');
  assert.equal(xiazhi.isExactDay, true);

  const dongzhi = getSolarTerm(2025, 12, 21);
  assert.equal(dongzhi.term, '冬至');
  assert.equal(dongzhi.isExactDay, true);
});

test('weather: manual weather override locks weather on specific date', async () => {
  const { resolveWeatherForDate } = await import('../src/weather.js');
  const weatherConfig = {
    enabled: true,
    weatherOverrides: {
      '2025-05-20': {
        type: 'thunderstorm',
        cn: '特大雷暴',
        temp: 16,
        extreme: true,
        note: '山庄暴雨剧情杀',
      },
    },
  };

  const locked = await resolveWeatherForDate({
    dateStr: '2025-05-20',
    month: 5,
    location: '北京',
    weatherConfig,
  });

  assert.equal(locked.type, 'thunderstorm');
  assert.equal(locked.cn, '特大雷暴');
  assert.equal(locked.temp, 16);
  assert.equal(locked.extreme, true);
  assert.equal(locked.isManual, true);
});

test('weather: seeded generation ensures identical weather across multiple turns on the same day', () => {
  const seed = '2026-11-08_北京';
  const roll1 = rollWeather(11, { seed });
  const roll2 = rollWeather(11, { seed });
  const roll3 = rollWeather(11, { seed });

  assert.equal(roll1.type, roll2.type);
  assert.equal(roll1.temp, roll2.temp);
  assert.equal(roll2.type, roll3.type);
  assert.equal(roll2.temp, roll3.temp);

  // Different date yields natural difference
  const nextDay = rollWeather(11, { seed: '2026-11-09_北京' });
  assert.ok(nextDay.type);
});

test('weather: formatWeatherPrompt is pure weather without solar terms, impact tips or warnings', () => {
  const sample = { type: 'windy', cn: '秋风', temp: 14 };
  const formatted = formatWeatherPrompt(sample, {
    worldEra: 'modern',
    solarTerm: { term: '立冬' },
    includeImpact: true,
  });
  assert.equal(formatted, '当前天气：秋风，气温约 14°C');
  assert.ok(!formatted.includes('立冬'));
  assert.ok(!formatted.includes('出行'));
  assert.ok(!formatted.includes('影响'));
  assert.ok(!formatted.includes('警报'));

  const ancient = formatWeatherPrompt(sample, {
    worldEra: 'ancient',
    solarTerm: { term: '立冬' },
    includeImpact: true,
  });
  assert.ok(!ancient.includes('立冬'));
  assert.ok(!ancient.includes('出行'));
  assert.ok(!ancient.includes('°C'));
  assert.ok(ancient.startsWith('当前天气：'));
});

test('ui: weatherSvgIcon returns valid SVG icon markup without emoji', async () => {
  const { weatherSvgIcon } = await import('../src/ui/shared.js');
  const svgSunny = weatherSvgIcon('sunny');
  assert.ok(svgSunny.includes('<svg'));
  assert.ok(svgSunny.includes('viewBox="0 0 24 24"'));

  const svgWind = weatherSvgIcon('windy');
  assert.ok(svgWind.includes('<svg'));

  const svgRain = weatherSvgIcon('light_rain');
  assert.ok(svgRain.includes('<svg'));
});

test('weather: injectPrompt switch controls prompt injection', () => {
  const store = {
    state: {
      calendar: {
        weatherConfig: {
          enabled: true,
          injectPrompt: false,
          worldEra: 'modern',
          defaultCity: '北京',
        },
      },
    },
    read() { return this.state; },
  };
  const target = {
    messages: [
      { message: { mes: '[[WORLD]] location=北京 | time=2025年05月01日 12:00[[/WORLD]]' } },
    ],
  };

  const reader = createCalendarReader({ store, target });
  // Prompt injection is disabled -> returns null
  assert.equal(reader.weatherPrompt(), null);

  // Re-enabled
  store.state.calendar.weatherConfig.injectPrompt = true;
  assert.ok(reader.weatherPrompt()?.prompt);
});

test('weather: parseTopFormatLocation extracts primary location from top format and respects movement arrows', async () => {
  const { parseTopFormatLocation, resolveStoryLocation } = await import('../src/calendar.js');

  const mes1 = '✧2026年11月8日 10:30 星期日|北京市 - 海淀区 - 颐和园|秋高气爽✧\n今天阳光正好。';
  assert.equal(parseTopFormatLocation(mes1), '北京市');

  const mes2 = '✧2026年11月8日 10:30 星期日|北京市 - 首都机场 → 上海市 - 浦东国际机场|晴朗✧\n飞机平稳落地。';
  assert.equal(parseTopFormatLocation(mes2), '上海市');

  const ancientMes = '✧天顺元年三月初三 惊蛰 午时|临安府 - 钱塘门外 - 西湖断桥|细雨绵绵✧\n游人如织。';
  assert.equal(parseTopFormatLocation(ancientMes), '临安府');

  const resolved = resolveStoryLocation([{ message: { mes: mes1 } }]);
  assert.equal(resolved.location, '北京市');
  assert.equal(resolved.source, 'top_format');
  assert.equal(resolved.sourceLabel, '剧情顶部时间栏');
});

test('weather: resolveStoryLocation reads location from BaiBaiBook state or history leaf', async () => {
  const { resolveStoryLocation } = await import('../src/calendar.js');

  // mock globalThis.STBaiBaiBook
  globalThis.STBaiBaiBook = {
    getSnapshot() {
      return { state: { location: '苏州市 - 姑苏区 - 平江路' } };
    },
  };

  const resolved = resolveStoryLocation([]);
  assert.equal(resolved.location, '苏州市');
  assert.equal(resolved.source, 'baibaibook');
  assert.equal(resolved.sourceLabel, '柏宝书');

  delete globalThis.STBaiBaiBook;
});

test('weather: readLockWeather links with calendar weather', async () => {
  const { readLockWeather } = await import('../src/weather.js');

  const mockCalendar = {
    month() {
      return {
        weather: {
          type: 'heavy_snow',
          cn: '大雪',
          temp: -6,
          isManual: false,
          location: '哈尔滨',
          locationSourceLabel: '剧情正文标注',
          worldEra: 'modern',
        },
      };
    },
  };

  const lockWeather = readLockWeather(null, new Date(), mockCalendar);
  assert.equal(lockWeather.type, 'heavy_snow');
  assert.equal(lockWeather.text, '大雪');
  assert.equal(lockWeather.temperature, '-6°C');
  assert.equal(lockWeather.location, '哈尔滨');
  assert.equal(lockWeather.source, 'calendar');
  assert.ok(lockWeather.title.includes('哈尔滨'));
});

test('weather: renderLockMeta renders dynamic SVG icon based on weather type', async () => {
  const { renderLockMeta } = await import('../src/ui/status.js');
  const weather = {
    type: 'thunderstorm',
    text: '雷暴',
    temperature: '19°C',
    source: 'calendar',
  };

  const html = renderLockMeta(weather);
  assert.ok(html.includes('雷暴 19°C'));
  // Should render thunderstorm SVG icon rather than static sun
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('M13 13l-3 5h4l-2 5'));
});

test('desktop: renderDesktop includes weather in calendar widget when present', async () => {
  const { renderDesktop } = await import('../src/ui/desktop.js');
  const calendarData = {
    yearLabel: '2026年',
    monthName: '11月',
    today: '11月8日',
    columns: 7,
    leading: 0,
    days: [
      { day: 8, isToday: true, items: [] },
    ],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    weather: {
      type: 'light_rain',
      cn: '小雨',
      temp: 13,
      isManual: false,
      location: '上海',
      locationSourceLabel: '剧情正文标注',
      worldEra: 'modern',
    },
  };

  const html = renderDesktop({ theme: 'day' }, { apps: [], calendar: calendarData });
  assert.ok(html.includes('desktop-calendar-weather'));
  assert.ok(html.includes('小雨'));
  assert.ok(html.includes('13°C'));
  assert.ok(html.includes('<svg'));
});

test('calendar: renderCalendar renders clickable weather badge and weather modal for mobile devices', async () => {
  const { renderCalendar } = await import('../src/ui/calendar.js');
  const calendarData = {
    month: 11,
    year: 2026,
    monthName: '11月',
    columns: 7,
    leading: 0,
    days: [{ day: 8, isToday: true, items: [] }],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    weather: {
      type: 'sunny',
      cn: '晴朗',
      temp: 18,
      location: '北京市',
      locationSourceLabel: '剧情顶部时间栏',
      worldEra: 'modern',
      prompt: '当前天气：晴朗，气温约 18°C',
    },
  };

  const state = {
    calendar: {
      weatherConfig: { enabled: true },
    },
  };

  // 1. Weather badge should be a button with data-action for touch devices
  const normalHtml = renderCalendar(state, {
    ui: { calendarWeatherModalOpen: false },
    calendar: calendarData,
  });
  assert.ok(normalHtml.includes('data-action="open-calendar-weather-modal"'));
  assert.ok(normalHtml.includes('calendar-weather-inline'));
  assert.ok(normalHtml.includes('晴朗'));
  assert.ok(!normalHtml.includes('calendar-weather-detail-dialog'));

  // 2. When modal is open, it renders detailed weather dialog
  const modalHtml = renderCalendar(state, {
    ui: { calendarWeatherModalOpen: true },
    calendar: calendarData,
  });
  assert.ok(modalHtml.includes('calendar-weather-detail-dialog'));
  assert.ok(modalHtml.includes('环境气象详情'));
  assert.ok(modalHtml.includes('北京市'));
  assert.ok(modalHtml.includes('剧情顶部时间栏'));
  assert.ok(modalHtml.includes('当前天气：晴朗，气温约 18°C'));
  assert.ok(modalHtml.includes('data-action="jump-calendar-weather-settings"'));
});
