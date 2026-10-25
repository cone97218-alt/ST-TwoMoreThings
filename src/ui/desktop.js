import { homeImage } from './home.js';
import { escape, icon } from './shared.js';
import { pendingTodoCount } from '../todos.js';

function renderCalendarWidget(calendar) {
  if (!calendar) return '';
  const todayIndex = calendar.days.findIndex(day => day.isToday);
  const index = Math.max(0, todayIndex);
  const start = Math.max(0, index - (index + calendar.leading) % calendar.columns);
  const week = calendar.days.slice(start, start + calendar.columns);
  const today = calendar.days[todayIndex];
  const names = today?.items.map(item => item.name).join(' · ') || '';
  return `<button type="button" class="desktop-calendar" data-action="open-calendar" aria-label="打开日历">
    <span class="desktop-calendar-copy">
      <small>${escape(calendar.yearLabel)}</small>
      <strong>${escape(calendar.monthName)}</strong>
      <span>${escape(names || calendar.today)}</span>
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
  return `<img class="desktop-wallpaper ${image.custom ? 'is-custom' : ''}"
      src="${escape(image.src)}" alt="" draggable="false">
    <div class="desktop-content">
      ${renderCalendarWidget(calendar)}
      <nav class="desktop-apps" aria-label="桌面应用">
        ${apps.map(({ id, label }) => `<button type="button" class="desktop-app" data-tab="${id}" aria-label="${id === 'calendar' && pending ? `${label}，${pending} 项未完成` : label}">
          <span class="desktop-app-icon desktop-app-${id}">${icon(id)}${id === 'calendar' && pending ? `<b class="desktop-app-badge" aria-hidden="true">${pending > 99 ? '99+' : pending}</b>` : ''}</span>
          <span>${label}</span>
        </button>`).join('')}
      </nav>
      <span class="desktop-page-dot" aria-hidden="true"></span>
    </div>`;
}
