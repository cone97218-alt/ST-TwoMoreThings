import { action, escape, icon, pageHeading } from './shared.js';
import { ALL_NAGER_COUNTRIES, POPULAR_COUNTRIES } from '../calendar-presets.js';

export function renderCalendar(state, { ui, calendar }) {
  const headingActions = `
    <button type="button" class="icon-button" data-action="open-calendar-ai" aria-label="AI">${icon('sparkles')}</button>
    <button type="button" class="icon-button" data-action="open-calendar-settings" aria-label="设置">${icon('tuning')}</button>
    ${calendar ? action('calendar-today', '回到本月', '', 'quiet-button') : ''}
  `;
  const heading = pageHeading('日历', headingActions);
  if (!calendar) return heading;

  const selected = calendar.days.find(day => day.day === ui.calendarDay);
  const days = selected ? [selected] : calendar.days;
  const year = calendar.yearLabel;
  const events = [...new Map(days.flatMap(day => day.items).map(item => [item.id, item])).values()];
  const monthTitle = [calendar.title === calendar.eraLabel ? '' : calendar.title, year].filter(Boolean).join(' · ');
  const dayButtons = calendar.days.map(day => {
    const dots = [...new Set(day.items.map(item => item.type))];
    const label = `${escape(day.label)}${day.items.length ? `：${escape(day.items.map(item => item.name).join('、'))}` : ''}`;
    return `<button type="button" class="calendar-day${day.isToday ? ' is-today' : ''}${selected?.day === day.day ? ' is-selected' : ''}"
        data-calendar-day="${day.day}" aria-label="${label}" aria-pressed="${selected?.day === day.day}" ${day.isToday ? 'aria-current="date"' : ''}>
      <span>${day.day}</span>
      <span class="calendar-dots" aria-hidden="true">${dots.map(type => `<i class="calendar-dot ${type}"></i>`).join('')}</span>
    </button>`;
  }).join('');

  // 1. 手动添加/编辑表单
  const draft = ui.calendarDraft;
  const formHtml = ui.calendarFormOpen ? `<form class="calendar-form" data-calendar-form>
    <div class="calendar-form-head">
      <h4>${draft?.id ? '编辑事件' : '添加事件'}</h4>
      <button type="button" class="icon-button" data-action="close-calendar-form" aria-label="关闭">${icon('close')}</button>
    </div>
    <label class="field-label" for="cal-f-name">名称</label>
    <input id="cal-f-name" name="name" type="text" placeholder="相识纪念日 / 庆典" value="${escape(draft?.name || '')}" required maxlength="40">
    <label class="field-label" for="cal-f-type">类型</label>
    <select id="cal-f-type" name="type">
      <option value="festival" ${draft?.type === 'festival' ? 'selected' : ''}>节日</option>
      <option value="anniversary" ${!draft?.type || draft?.type === 'anniversary' ? 'selected' : ''}>纪念日</option>
      <option value="todo" ${draft?.type === 'todo' ? 'selected' : ''}>待办事项</option>
    </select>
    <div class="form-row">
      <div>
        <label class="field-label" for="cal-f-month">月份</label>
        <input id="cal-f-month" name="month" type="number" min="1" max="${calendar.totalMonths || 12}" value="${draft?.month || calendar.month || 1}" required>
      </div>
      <div>
        <label class="field-label" for="cal-f-day">日期</label>
        <input id="cal-f-day" name="day" type="number" min="1" max="${calendar.daysInMonth || 31}" value="${draft?.day || selected?.day || 1}" required>
      </div>
      <div>
        <label class="field-label" for="cal-f-days">天数</label>
        <input id="cal-f-days" name="days" type="number" min="1" max="365" value="${draft?.days || 1}">
      </div>
    </div>
    <label class="field-label" for="cal-f-note">说明</label>
    <input id="cal-f-note" name="note" type="text" placeholder="事件说明" value="${escape(draft?.note || '')}" maxlength="100">
    <div class="compact-switch-row" style="margin-top: 10px; justify-content: flex-end; gap: 8px;">
      <button type="button" class="quiet-button" data-action="close-calendar-form">取消</button>
      <button type="submit" class="save-button" style="margin-top: 0; width: auto; padding: 4px 16px;">保存</button>
    </div>
  </form>` : '';

  // 2. 地区与历法设置表单
  const calDesc = state?.calendar?.descriptor || {};
  const currentCountry = String(calDesc.country || 'CN');
  const customPresets = Array.isArray(state?.calendar?.customPresets) ? state.calendar.customPresets : [];
  const settingsTab = ui.calendarSettingsTab || 'presets';
  const isCustomSelected = currentCountry.startsWith('custom_preset:') || currentCountry.startsWith('custom:');

  const presetTabContent = `
    <label class="field-label" for="cal-s-country">选择预设历法</label>
    <select id="cal-s-country" name="country">
      ${customPresets.length ? `
        <optgroup label="我的自定义历法">
          ${customPresets.map(p => `
            <option value="${escape(p.id)}" ${currentCountry === p.id ? 'selected' : ''}>${escape(p.name)}</option>
          `).join('')}
        </optgroup>
      ` : ''}
      <optgroup label="常用现代国家">
        ${POPULAR_COUNTRIES.map(c => `
          <option value="${c.code}" ${currentCountry.toUpperCase() === c.code ? 'selected' : ''}>${escape(c.name)}${c.name !== c.en ? ` · ${escape(c.en)}` : ''}</option>
        `).join('')}
      </optgroup>
      <optgroup label="全部国家与地区 (Nager.Date 数据库)">
        ${ALL_NAGER_COUNTRIES.filter(c => !POPULAR_COUNTRIES.some(p => p.code === c.code)).map(c => `
          <option value="${c.code}" ${currentCountry.toUpperCase() === c.code ? 'selected' : ''}>${escape(c.name)}${c.name !== c.en ? ` · ${escape(c.en)}` : ''}</option>
        `).join('')}
      </optgroup>
    </select>
    <label class="field-label" for="cal-s-mode">应用方式</label>
    <select id="cal-s-mode" name="mode">
      <option value="merge">保留我的自定义节日</option>
      <option value="replace">重置为该预设内容</option>
    </select>
    <div class="compact-switch-row" style="margin-top: 10px; justify-content: flex-end; gap: 8px;">
      ${isCustomSelected ? `
        <button type="button" class="quiet-button" style="color: var(--pp-error); margin-right: auto;" data-action="delete-custom-calendar-preset" data-preset-id="${escape(currentCountry)}">删除预设</button>
      ` : ''}
      <button type="button" class="quiet-button" data-action="close-calendar-settings">取消</button>
      <button type="button" class="save-button" style="margin-top: 0; width: auto; padding: 4px 16px;" data-action="apply-calendar-preset">应用</button>
    </div>

    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--pp-divider-soft);">
      <label class="field-label" for="cal-s-save-name">将当前日历与节日存为预设</label>
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <input id="cal-s-save-name" type="text" placeholder="预设名称，如：我的世界历" maxlength="30" style="flex: 1; min-width: 0;">
        <button type="button" class="save-button" style="margin-top: 0; width: auto; padding: 4px 14px; white-space: nowrap;" data-action="save-current-as-preset">保存预设</button>
      </div>
    </div>
  `;

  const customTabContent = `
    <div class="calendar-ai-inputs">
      <div class="form-row">
        <div>
          <label class="field-label" for="cal-c-title">历法名称</label>
          <input id="cal-c-title" name="title" type="text" placeholder="如：四季大陆历" value="${escape(calDesc.title || '')}" maxlength="30" required>
        </div>
        <div>
          <label class="field-label" for="cal-c-era">纪年标签</label>
          <input id="cal-c-era" name="era" type="text" placeholder="如：新历 / 帝国历" value="${escape(calDesc.era || '')}" maxlength="20">
        </div>
        <div>
          <label class="field-label" for="cal-c-year">初始年份</label>
          <input id="cal-c-year" name="currentYear" type="number" min="1" max="9999" value="${calDesc.currentYear || 1}" required>
        </div>
      </div>
      <div class="form-row">
        <div>
          <label class="field-label" for="cal-c-month-count">月数或季数</label>
          <input id="cal-c-month-count" name="monthCount" type="number" min="1" max="24" value="${calDesc.months?.length || 4}" required>
        </div>
        <div>
          <label class="field-label" for="cal-c-days-per-month">每月天数</label>
          <input id="cal-c-days-per-month" name="daysPerMonth" type="number" min="1" max="100" value="${calDesc.months?.[0]?.days || 28}" required>
        </div>
      </div>
      <div class="form-row">
        <div>
          <label class="field-label" for="cal-c-weekday-cycle">一周天数</label>
          <input id="cal-c-weekday-cycle" name="weekdayCycle" type="number" min="1" max="14" value="${calDesc.weekdayCycle || 7}" required>
        </div>
        <div>
          <label class="field-label" for="cal-c-weekdays">星期名称 (逗号分隔)</label>
          <input id="cal-c-weekdays" name="weekdays" type="text" placeholder="一,二,三,四,五,六,日" value="${escape((calDesc.weekdays || ['一', '二', '三', '四', '五', '六', '日']).join(','))}">
        </div>
      </div>
      <div>
        <label class="field-label" for="cal-c-month-names">各月自定义名称 (逗号分隔，可选)</label>
        <input id="cal-c-month-names" name="monthNames" type="text" placeholder="如：春之月, 夏之月, 秋之月, 冬之月" value="${escape((calDesc.months || []).map(m => m.name).join(','))}">
      </div>
      <div>
        <label class="field-label" for="cal-c-preset-name">同时保存为预设名称 (可选)</label>
        <input id="cal-c-preset-name" name="presetName" type="text" placeholder="填写后同时存入预设列表以供随时切换" maxlength="30">
      </div>
      <div class="compact-switch-row" style="margin-top: 10px; justify-content: flex-end; gap: 8px;">
        <button type="button" class="quiet-button" data-action="close-calendar-settings">取消</button>
        <button type="button" class="save-button" style="margin-top: 0; width: auto; padding: 4px 16px;" data-action="create-custom-calendar">创建并应用</button>
      </div>
    </div>
  `;

  const settingsHtml = ui.calendarSettingsOpen ? `
    <div class="calendar-form">
      <div class="calendar-form-head">
        <div class="calendar-tabs">
          <button type="button" class="calendar-tab${settingsTab === 'presets' ? ' is-active' : ''}" data-action="switch-calendar-settings-tab" data-calendar-settings-tab="presets">历法预设</button>
          <button type="button" class="calendar-tab${settingsTab === 'custom' ? ' is-active' : ''}" data-action="switch-calendar-settings-tab" data-calendar-settings-tab="custom">自定义新历法</button>
        </div>
        <button type="button" class="icon-button" data-action="close-calendar-settings" aria-label="关闭">${icon('close')}</button>
      </div>
      ${settingsTab === 'presets' ? presetTabContent : customTabContent}
    </div>
  ` : '';

  // 3. AI 构想与推演面板
  const aiTab = ui.calendarAiTab || 'festivals';
  const aiFestivals = ui.calendarAiFestivals || [];
  const aiSchedules = ui.calendarAiSchedules || [];
  const aiBusy = ui.calendarAiBusy || false;

  const aiFestivalsContent = `
    <div class="calendar-ai-inputs">
      <label class="field-label" for="cal-ai-setting">世界观</label>
      <input id="cal-ai-setting" name="setting" type="text" placeholder="设定要求或风格" value="${escape(ui.calendarAiSetting || '')}" maxlength="100">
      <div class="form-row">
        <div>
          <label class="field-label" for="cal-ai-count">数量</label>
          <input id="cal-ai-count" name="count" type="number" min="1" max="6" value="${ui.calendarAiCount || 3}">
        </div>
        <div style="display: flex; align-items: flex-end;">
          <button type="button" class="save-button" style="margin: 0; width: 100%; height: 38px;" data-action="run-calendar-ai-festivals" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '构想中...' : '构想'}</button>
        </div>
      </div>
    </div>
    ${aiFestivals.length ? `
      <div class="calendar-ai-results">
        ${aiFestivals.map((item, idx) => `
          <div class="calendar-ai-item">
            <input type="checkbox" data-ai-item-index="${idx}" ${item.selected ? 'checked' : ''}>
            <div class="calendar-ai-item-info">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <strong>${escape(item.name)}</strong>
                <span style="font-size: 10px; color: var(--pp-bronze); flex-shrink: 0;">${item.type === 'festival' ? '节日' : '纪念日'}</span>
              </div>
              <small>${item.month}月${item.day}日 · ${item.days}天</small>
              ${item.note ? `<p>${escape(item.note)}</p>` : ''}
            </div>
          </div>
        `).join('')}
        <button type="button" class="save-button" style="margin-top: 10px;" data-action="apply-calendar-ai-festivals">加入日历</button>
      </div>
    ` : ''}
  `;

  const aiSchedulesContent = `
    <div class="calendar-ai-inputs">
      <div class="form-row">
        <div>
          <label class="field-label" for="cal-ai-days">天数</label>
          <input id="cal-ai-days" name="days" type="number" min="1" max="7" value="${ui.calendarAiDays || 3}">
        </div>
        <div>
          <label class="field-label" for="cal-ai-focus">偏好</label>
          <select id="cal-ai-focus" name="focus">
            <option value="全部" ${ui.calendarAiFocus === '全部' ? 'selected' : ''}>全部</option>
            <option value="日常" ${ui.calendarAiFocus === '日常' ? 'selected' : ''}>日常</option>
            <option value="约会" ${ui.calendarAiFocus === '约会' ? 'selected' : ''}>约会</option>
            <option value="工作" ${ui.calendarAiFocus === '工作' ? 'selected' : ''}>工作</option>
            <option value="冒险" ${ui.calendarAiFocus === '冒险' ? 'selected' : ''}>冒险</option>
          </select>
        </div>
      </div>
      <button type="button" class="save-button" style="margin-top: 10px;" data-action="run-calendar-ai-schedules" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '推演中...' : '推演'}</button>
    </div>
    ${aiSchedules.length ? `
      <div class="calendar-ai-results">
        ${aiSchedules.map((item, idx) => `
          <div class="calendar-ai-item">
            <input type="checkbox" data-ai-item-index="${idx}" ${item.selected ? 'checked' : ''}>
            <div class="calendar-ai-item-info">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <strong>${escape(item.title)}</strong>
                <span style="font-size: 10px; color: var(--pp-bronze); flex-shrink: 0;">${escape(item.time ? `${item.time} · 待办事项` : '待办事项')}</span>
              </div>
              <small>${item.month}月${item.day}日${item.location ? ` · ${escape(item.location)}` : ''}</small>
              ${item.note ? `<p>${escape(item.note)}</p>` : ''}
            </div>
          </div>
        `).join('')}
        <button type="button" class="save-button" style="margin-top: 10px;" data-action="apply-calendar-ai-schedules-calendar">加入日历</button>
      </div>
    ` : ''}
  `;

  const aiHtml = ui.calendarAiOpen ? `
    <div class="calendar-modal-backdrop">
      <div class="calendar-modal-dialog">
        <div class="calendar-form-head">
          <div class="calendar-tabs">
            <button type="button" class="calendar-tab${aiTab === 'festivals' ? ' is-active' : ''}" data-action="switch-calendar-ai-tab" data-calendar-tab="festivals">构想节日</button>
            <button type="button" class="calendar-tab${aiTab === 'schedules' ? ' is-active' : ''}" data-action="switch-calendar-ai-tab" data-calendar-tab="schedules">推演日程</button>
          </div>
          <button type="button" class="icon-button" data-action="close-calendar-ai" aria-label="关闭">${icon('close')}</button>
        </div>
        ${aiTab === 'festivals' ? aiFestivalsContent : aiSchedulesContent}
      </div>
    </div>
  ` : '';

  const eventTypeLabel = item => item.type === 'festival'
    ? '节日'
    : item.type === 'todo'
      ? (item.done ? '待办事项 · 已完成' : '待办事项')
      : '纪念日';

  const eventCards = events.map(item => `<article class="calendar-event ${item.type}${item.done ? ' is-done' : ''}" ${item.todoId ? `data-todo-row="${escape(item.todoId)}"` : ''}>
    <span class="calendar-event-mark" aria-hidden="true"></span>
    <div>
      <div class="calendar-event-title">
        <h3>${escape(item.name)}</h3>
        <div class="calendar-event-meta">
          <small>${eventTypeLabel(item)}</small>
          ${item.type === 'todo' ? `<button type="button" class="quiet-button calendar-todo-toggle" data-action="toggle-calendar-todo" data-calendar-event-id="${escape(item.id)}">${item.done ? '取消完成' : '完成'}</button>` : ''}
          ${!item.isBuiltin ? `<button type="button" class="icon-button" data-action="delete-calendar-event" data-calendar-event-id="${escape(item.id)}" aria-label="删除">${icon('close')}</button>` : ''}
        </div>
      </div>
      <span class="calendar-event-date">${escape(item.date)}${item.days > 1 ? ` · ${item.days}天` : ''}</span>
      ${item.note ? `<p>${escape(item.note)}</p>` : ''}
    </div>
  </article>`).join('');

  return `${heading}
    <section class="calendar-sheet">
      <header class="calendar-month">
        <button type="button" class="icon-button" data-action="calendar-prev" aria-label="上个月">${icon('arrow')}</button>
        <div>
          <small>${escape(monthTitle)}</small>
          <h2>${escape(calendar.monthName)}</h2>
        </div>
        <button type="button" class="icon-button" data-action="calendar-next" aria-label="下个月">${icon('next')}</button>
      </header>
      <div class="calendar-grid" style="--calendar-columns:${calendar.columns}" aria-label="${escape(calendar.monthName)}月历">
        ${calendar.weekdays.map(day => `<span class="calendar-weekday">${escape(day)}</span>`).join('')}
        ${Array.from({ length: calendar.leading }, () => '<span aria-hidden="true"></span>').join('')}
        ${dayButtons}
      </div>
      <div class="calendar-detail-head">
        <span class="calendar-detail-date">${escape(selected?.label || '本月')}</span>
        <div class="calendar-detail-actions">
          ${selected ? action('calendar-month', '看全月', '', 'quiet-button') : ''}
          ${action('open-calendar-form', '添加', 'plus', 'quiet-button')}
        </div>
      </div>
      ${settingsHtml}
      ${formHtml}
      <div class="calendar-events">${eventCards}</div>
    </section>
    ${aiHtml}`;
}
