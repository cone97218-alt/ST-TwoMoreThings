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
