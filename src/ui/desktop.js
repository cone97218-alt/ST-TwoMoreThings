import { homeImage } from './home.js';
import { escape, icon, weatherSvgIcon } from './shared.js';
import { pendingTodoCount } from '../todos.js';
import { ANCIENT_WEATHER_TEXT } from '../weather.js';

function renderCalendarWidget(calendar) {
  if (!calendar) return '';
  const todayIndex = calendar.days.findIndex(day => day.isToday);
  const index = Math.max(0, todayIndex);
  const start = Math.max(0, index - (index + calendar.leading) % calendar.columns);
  const week = calendar.days.slice(start, start + calendar.columns);
  const today = calendar.days[todayIndex];
  const names = today?.items.map(item => item.name).join(' · ') || '';
  const weather = calendar.weather;
  let weatherHtml = '';
  if (weather) {
    const isAncient = weather.worldEra === 'ancient';
    const text = (isAncient ? (ANCIENT_WEATHER_TEXT[weather.type] || weather.cn) : weather.cn) || '';
    const tempText = isAncient ? '' : (weather.temp != null ? ` ${weather.temp}°C` : '');
    const lockText = weather.isManual ? ' 🔒' : '';
    const locTip = weather.location
      ? `地点：${weather.location}${weather.locationSourceLabel ? ` · 来源：${weather.locationSourceLabel}` : ''}\n`
      : '';
    const fullDesc = `${locTip}${weather.prompt || ''}`.trim() || `天气：${text}${tempText}`;
    weatherHtml = `
      <span class="desktop-calendar-weather" data-action="open-calendar-weather-detail" role="button" tabindex="0" title="${escape(fullDesc)}" aria-label="查看天气详情：${escape(text)}${escape(tempText)}">
        <span class="desktop-calendar-weather-icon" aria-hidden="true">${weatherSvgIcon(weather.type)}</span>
        <span class="desktop-calendar-weather-text">${escape(text)}${escape(tempText)}${lockText}</span>
      </span>
    `;
  }
  return `<button type="button" class="desktop-calendar" data-action="open-calendar" aria-label="打开日历">
    <span class="desktop-calendar-copy">
      <small>${escape(calendar.yearLabel)}</small>
      <strong>${escape(calendar.monthName)}</strong>
      <span>${escape(names || calendar.today)}</span>
      ${weatherHtml}
    </span>
    <span class="desktop-week" style="--desktop-week-columns:${calendar.columns}">
      ${week.map(day => {
        const weekday = calendar.weekdays[(calendar.leading + day.day - 1) % calendar.columns];
        return `<span class="desktop-week-day ${day.isToday ? 'is-today' : ''}">
          ${weekday ? `<small>${escape(weekday)}</small>` : ''}<span>${day.day}</span>
          ${day.items.length ? '<i></i>' : ''}
        </span>`;
      }).join('')}
    </span>
  </button>`;
}

export function renderDesktop(state, { apps, calendar }) {
  const image = homeImage(state);
  const pending = pendingTodoCount(state);
  const originPending = (state.origin?.tasks || []).filter(t => t.status === 'active').length;
  return `<img class="desktop-wallpaper ${image.custom ? 'is-custom' : ''}"
      src="${escape(image.src)}" alt="" draggable="false">
    <div class="desktop-content">
      ${renderCalendarWidget(calendar)}
      <nav class="desktop-apps" aria-label="桌面应用">
        ${apps.map(({ id, label }) => {
          const badgeCount = id === 'calendar' ? pending : id === 'origin' ? originPending : 0;
          return `<button type="button" class="desktop-app" data-tab="${id}" aria-label="${badgeCount ? `${label}，${badgeCount} 项未完成` : label}">
          <span class="desktop-app-icon desktop-app-${id}">${icon(id)}${badgeCount ? `<b class="desktop-app-badge" aria-hidden="true">${badgeCount > 99 ? '99+' : badgeCount}</b>` : ''}</span>
          <span>${label}</span>
        </button>`;
        }).join('')}
      </nav>
      <span class="desktop-page-dot" aria-hidden="true"></span>
    </div>`;
}
