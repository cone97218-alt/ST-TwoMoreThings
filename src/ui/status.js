import { escape, icon, weatherSvgIcon } from './shared.js';

export function renderLockMeta(weather) {
  return `<div class="lock-meta">
    <span class="lock-weather" title="${escape(weather?.title || (weather?.source === 'decoration' ? '装饰天气' : '构画剧情天气'))}">
      ${weather?.type ? weatherSvgIcon(weather.type) : icon('sun')}<span>${escape(weather?.text || '')} ${escape(weather?.temperature || '')}</span>
    </span>
    <span class="home-date"></span>
  </div>`;
}

export function renderStatusBar() {
  return `<header class="phone-status" aria-label="手机状态栏">
    <time class="status-time"></time>
    <span class="status-indicators" aria-hidden="true" title="装饰状态">
      <span class="status-indicator">${icon('signal')}</span>
      <span class="status-indicator">${icon('wifi')}</span>
      <span class="status-indicator">${icon('battery')}</span>
    </span>
  </header>`;
}

// 状态栏和锁屏共用一个时钟；只有现实时间回退才安排下一次刷新。
export function createPhoneClock({ root, element, readTime }) {
  let timer;
  function refresh() {
    clearTimeout(timer);
    if (element.hidden) return;
    const clock = readTime();
    const status = root.querySelector('.status-time');
    if (status) status.textContent = clock.time;
    const digits = root.querySelector('[data-clock-digits]');
    if (digits) {
      const values = clock.time.replace(':', '');
      for (let i = 0; i < 4; i++) digits.children[i].textContent = values[i];
      root.querySelector('.home-clock').setAttribute('aria-label', `当前时间 ${clock.time}`);
    }
    const date = root.querySelector('.home-date');
    if (date) {
      const label = clock.source === 'real' ? clock.date.slice(5).replace('-', '.') : clock.date || '日期未明确';
      date.textContent = label;
      if (clock.weekday) {
        const weekday = date.ownerDocument.createElement('span');
        weekday.className = 'home-weekday'; weekday.textContent = `${label ? ' / ' : ''}${clock.weekday}`;
        date.append(weekday);
      }
      date.title = date.textContent;
    }
    if (clock.source === 'real') timer = setTimeout(refresh, 60000 - Date.now() % 60000);
  }
  return { refresh, stop: () => clearTimeout(timer) };
}
