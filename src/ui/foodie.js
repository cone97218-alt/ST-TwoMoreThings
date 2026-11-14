import { escape, icon, pageHeading } from './shared.js';
import { DEFAULT_FOODIE_TEMPLATE, DEFAULT_FOODIE_COUNT, getEffectiveDatabases, categorizeFoodRole, parseDishCondition, normalizeCategoryRole, hasStructuredCategories, getDbItemList } from '../foodie-engine.js';

function getTraceWeatherIcon(text) {
  const t = String(text || '').toLowerCase();
  if (/雨/.test(t)) return icon('weather-rain');
  if (/雪|霜|冰/.test(t)) return icon('weather-snow');
  if (/雷/.test(t)) return icon('weather-thunder');
  if (/雾|霾/.test(t)) return icon('weather-fog');
  if (/风|台风/.test(t)) return icon('weather-wind');
  if (/阴|多云/.test(t)) return icon('weather-cloudy');
  if (/晴|热|暑/.test(t)) return icon('weather-sunny');
  return icon('weather-partly-cloudy');
}

export function renderFoodie(state, { ui = {} } = {}) {
  const showSettings = Boolean(ui.foodieShowSettings);
  const foodieState = state.foodie || {};

  if (showSettings) {
    return renderFoodieSettingsView(state, ui);
  }

  const isLocked = Boolean(foodieState.locked);
  const headingActions = `
    <button type="button" class="icon-button" data-action="foodie-refresh" aria-label="换一换" title="换一换">${icon('refresh')}</button>
    <button type="button" class="icon-button ${isLocked ? 'is-active' : ''}" data-action="foodie-toggle-lock" aria-label="${isLocked ? '解锁' : '锁定'}" title="${isLocked ? '解锁' : '锁定'}">${icon(isLocked ? 'lock' : 'unlock')}</button>
    <button type="button" class="icon-button" data-action="open-foodie-settings" aria-label="美食库设置" title="美食库设置">${icon('tuning')}</button>
  `;
  const heading = pageHeading('寻味', headingActions);

  const current = foodieState.current || null;
  const status = isLocked ? 'locked' : (current?.status || 'silent');
  const foods = isLocked ? (foodieState.current?.foods || []) : (current?.foods || []);

  let statusText = '暂无进食契机 · 保持静默';
  if (isLocked) {
    statusText = '已锁定';
  } else if (current?.statusText) {
    statusText = current.statusText;
  }

  const trace = foodieState.lastTrace || current?.trace || {
    locationTrace: '未定位',
    timeTrace: '日常时段',
    storyTrace: '无进食触发点',
    decisionTrace: '动态静默',
    resultTrace: '未注入正文'
  };

  const mainFood = foods[0] || '';
  const subFoods = foods.slice(1);

  return `
    <div class="foodie-view">
      ${heading}
      <div class="foodie-body">
        <!-- 主看板卡片（对标系统 Hero Card） -->
        <div class="foodie-board-card ${status}">
          <div class="foodie-board-top">
            <span class="foodie-tag-pill">
              <span class="pill-icon" aria-hidden="true">${icon('foodie')}</span>
              <span>寻味灵感</span>
            </span>
            <span class="foodie-status-pill ${status}">${escape(statusText)}</span>
          </div>

          <div class="foodie-board-center">
            ${mainFood ? `
              <div class="foodie-main-dish-name">${escape(mainFood)}</div>
              ${subFoods.length ? `
                <div class="foodie-sub-dish-row">
                  ${subFoods.map(f => `<span class="foodie-sub-pill">${escape(f)}</span>`).join('')}
                </div>
              ` : ''}
            ` : `
              <div class="foodie-board-empty">
                <div class="empty-icon-wrap" aria-hidden="true">${icon('foodie')}</div>
                <div class="empty-text-lead">暂未入席 · 静候餐期</div>
                <div class="empty-text-sub">正文出现用餐、饥饿或做饭意向时自动呈现</div>
              </div>
            `}
          </div>

          <div class="foodie-board-footer">
            <div class="foodie-meta-badge">
              <span class="meta-icon" aria-hidden="true">${icon('location')}</span>
              <span>${escape(trace.locationTrace || '未指定地点')}</span>
            </div>
            <div class="foodie-meta-badge">
              <span class="meta-icon" aria-hidden="true">${icon('clock')}</span>
              <span>${escape(trace.timeTrace || '日常时段')}</span>
            </div>
          </div>
        </div>

        <!-- 匹配溯源卡片（时间线流式面板，支持完整向下延伸滑动） -->
        <div class="foodie-trace-card">
          <button type="button" class="foodie-trace-btn" data-action="toggle-foodie-trace" aria-expanded="${ui.foodieTraceOpen ? 'true' : 'false'}">
            <div class="trace-btn-left">
              <span class="trace-icon-svg" aria-hidden="true">${icon('clock')}</span>
              <span class="trace-title">匹配溯源</span>
            </div>
            <div class="trace-btn-right">
              <span class="trace-state-tag ${status}">${status === 'active' || status === 'stable' ? '已触发' : (status === 'locked' ? '已锁定' : '静默')}</span>
              <span class="trace-caret ${ui.foodieTraceOpen ? 'is-open' : ''}" aria-hidden="true">${icon('arrow-down')}</span>
            </div>
          </button>

          ${ui.foodieTraceOpen ? `
            <div class="foodie-timeline-box">
              <!-- 1. 契机感知 -->
              <div class="timeline-node">
                <div class="node-dot ${trace.intentTriggered ? 'is-active' : ''}"></div>
                <div class="node-content">
                  <div class="node-header">
                    <span class="node-title">进食契机感知</span>
                    <span class="trace-pill ${trace.intentTriggered ? 'success' : (status === 'locked' ? 'amber' : 'muted')}">
                      ${trace.intentTriggered ? '已激活' : (status === 'locked' ? '人工锁定' : '保持静默')}
                    </span>
                  </div>
                  <div class="node-desc">
                    <span class="trace-hint-text">${escape(trace.intentSource || trace.storyTrace || '无')}</span>
                    ${trace.hitKeywords?.length ? `
                      <div class="trace-chips-row">
                        ${trace.hitKeywords.map(k => `<span class="trace-chip-kw">${escape(k)}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- 2. 环境感知 -->
              <div class="timeline-node">
                <div class="node-dot is-active"></div>
                <div class="node-content">
                  <span class="node-title">时空与天候感知</span>
                  <div class="trace-env-grid">
                    <div class="trace-env-item">
                      <div class="env-label">
                        <span class="env-icon" aria-hidden="true">${icon('location')}</span>
                        <span>地理位置</span>
                      </div>
                      <span class="env-val">${escape(trace.locationText || trace.locationTrace || '未定位')}</span>
                    </div>
                    <div class="trace-env-item">
                      <div class="env-label">
                        <span class="env-icon" aria-hidden="true">${icon('clock')}</span>
                        <span>生效时段</span>
                      </div>
                      <span class="env-val">${escape(trace.timeSlotLabel || trace.timeTrace || '日常时段')}${trace.timeSource ? ` (${escape(trace.timeSource)})` : ''}</span>
                    </div>
                    <div class="trace-env-item">
                      <div class="env-label">
                        <span class="env-icon" aria-hidden="true">${icon('calendar')}</span>
                        <span>时令与节日</span>
                      </div>
                      <span class="env-val">${escape([trace.festival, trace.jieqi, trace.season].filter(Boolean).join(' · ') || '日常')}</span>
                    </div>
                    <div class="trace-env-item">
                      <div class="env-label">
                        <span class="env-icon" aria-hidden="true">${getTraceWeatherIcon(trace.weatherText)}</span>
                        <span>天气天候</span>
                      </div>
                      <span class="env-val">${escape(trace.weatherText || '常温')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 3. 美食库决策与评分 -->
              <div class="timeline-node">
                <div class="node-dot ${trace.selectedDbLabel ? 'is-active' : ''}"></div>
                <div class="node-content">
                  <div class="node-header">
                    <span class="node-title">美食库决策</span>
                    ${trace.selectedDbLabel ? `<span class="trace-db-badge">${escape(trace.selectedDbKind || '美食库')}</span>` : ''}
                  </div>
                  <div class="node-desc">
                    ${trace.selectedDbLabel ? `
                      <div class="trace-decision-head">
                        <span class="trace-db-name">【${escape(trace.selectedDbLabel)}】</span>
                        <span class="trace-stage-badge">${escape(trace.decisionStage || '综合优选')}</span>
                      </div>
                    ` : ''}
                    <div class="trace-reason-text">${escape(trace.decisionReason || trace.decisionTrace || '动态静默')}</div>

                    ${trace.customScores?.length ? `
                      <div class="trace-scoring-box">
                        <div class="trace-scoring-title">预设库评分明细（开启 ${trace.enabledDbsCount || 0} 个库）：</div>
                        ${trace.customScores.map(cs => `
                          <div class="trace-score-row ${cs.score > 0 ? 'is-matched' : ''}">
                            <div class="score-row-main">
                              <span class="score-label">${escape(cs.label)}</span>
                              <span class="score-val">+${cs.score}分</span>
                            </div>
                            <div class="score-reasons">${escape(cs.reasons.join(' · ') || '未匹配特定条件')}</div>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- 4. 角色组合配餐 -->
              <div class="timeline-node">
                <div class="node-dot ${(trace.comboRoles?.length || foods.length) ? 'is-active' : ''}"></div>
                <div class="node-content">
                  <span class="node-title">智能角色组合</span>
                  <div class="node-desc">
                    ${((trace.comboRoles?.length ? trace.comboRoles : foods.map(f => ({ name: f, roleLabel: '菜品' }))).length) ? `
                      <div class="trace-combo-grid">
                        ${(trace.comboRoles?.length ? trace.comboRoles : foods.map(f => ({ name: f, roleLabel: '菜品' }))).map(item => `
                          <div class="trace-combo-tag">
                            <span class="combo-role-label">${escape(item.roleLabel)}</span>
                            <span class="combo-food-name">${escape(item.name)}</span>
                          </div>
                        `).join('')}
                      </div>
                    ` : `
                      <span class="trace-subtle-hint">未出餐（当前处于静默状态）</span>
                    `}
                  </div>
                </div>
              </div>

              <!-- 5. 正文提示词线索 -->
              <div class="timeline-node">
                <div class="node-dot ${trace.prompt || (status === 'active' || status === 'stable' || status === 'locked') ? 'is-active' : ''}"></div>
                <div class="node-content">
                  <span class="node-title">正文注入线索</span>
                  <div class="node-desc">
                    ${trace.prompt ? `
                      <div class="trace-code-block">${escape(trace.prompt)}</div>
                      <div class="trace-meta-sub">此线索将在下一次大模型回复生成时随手机环境自动注入正文</div>
                    ` : `
                      <span class="trace-subtle-hint">未向正文注入提示词（0 Token 消耗）</span>
                    `}
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// 数据库大分类分组定义
const DB_GROUPS = [
  { id: 'all', label: '全部' },
  { id: 'custom', label: '自建预设' },
  { id: 'cuisine', label: '中国菜系' },
  { id: 'scene', label: '场景业态' },
  { id: 'world', label: '国际风味' },
  { id: 'base', label: '日常基础' },
  { id: 'topic', label: '茶饮专题' }
];

function filterGroupDatabases(databases, groupId = 'all', query = '', filterMode = 'all') {
  let list = databases;

  if (filterMode === 'enabled') {
    list = list.filter(d => d.enabled);
  } else if (filterMode === 'disabled') {
    list = list.filter(d => !d.enabled);
  }

  if (groupId === 'custom') {
    list = list.filter(d => !d.builtin || d.id.startsWith('custom:'));
  } else if (groupId === 'cuisine') {
    list = list.filter(d => d.kind === 'cn-cuisine' || d.kind === 'cn-pian');
  } else if (groupId === 'scene') {
    list = list.filter(d => d.kind === 'scene');
  } else if (groupId === 'world') {
    list = list.filter(d => ['country', 'region'].includes(d.kind) || d.id === 'catalog:international');
  } else if (groupId === 'base') {
    list = list.filter(d => d.kind === 'cn-base');
  } else if (groupId === 'topic') {
    list = list.filter(d => d.kind === 'topic' || d.id === 'cn:drink');
  }

  const q = String(query || '').toLowerCase().trim();
  if (q) {
    list = list.filter(d => (d.label || '').toLowerCase().includes(q)
      || (d.tags || []).some(t => t.toLowerCase().includes(q))
      || (d.keywords || []).some(k => k.toLowerCase().includes(q))
      || (d.mapLocations || []).some(l => l.toLowerCase().includes(q))
      || (d.items || []).some(i => i.toLowerCase().includes(q)));
  }

  return list;
}

// 统计某个库内菜品角色的分布数量（主菜、主食、羹汤、饮品等）
function getDbRoleStats(db) {
  const stats = { hot: 0, staple: 0, soup: 0, cold: 0, drink: 0, dessert: 0 };
  if (hasStructuredCategories(db)) {
    for (const cat of (db.categories || [])) {
      const role = normalizeCategoryRole(cat.role);
      if (role === 'excluded') continue;
      const count = (cat.items || []).length;
      if (stats[role] !== undefined) {
        stats[role] += count;
      } else {
        stats.hot += count;
      }
    }
  } else {
    for (const item of (db.items || [])) {
      const role = categorizeFoodRole(item);
      if (stats[role] !== undefined) stats[role]++;
      else stats.hot++;
    }
  }
  return stats;
}

function renderFoodieSettingsView(state, ui) {
  const foodieState = state.foodie || {};
  const template = foodieState.template || DEFAULT_FOODIE_TEMPLATE;
  const count = foodieState.count || DEFAULT_FOODIE_COUNT;

  const databases = getEffectiveDatabases(state);
  const activeGroupId = ui.foodieActiveGroup || 'all';
  const searchQuery = ui.foodieSearchQuery || '';
  const filterMode = ui.foodieFilterMode || 'all'; // 'all' | 'enabled' | 'disabled'
  const viewMode = ui.foodieSettingsTab || 'list'; // 'list' | 'edit'

  const groupScopedDbs = filterGroupDatabases(databases, activeGroupId, searchQuery, 'all');
  const enabledCount = groupScopedDbs.filter(d => d.enabled).length;
  const disabledCount = groupScopedDbs.length - enabledCount;

  const filteredDbs = filterMode === 'all'
    ? groupScopedDbs
    : filterGroupDatabases(databases, activeGroupId, searchQuery, filterMode);

  // 当前选中的数据库（用于编辑视图）
  let selectedId = ui.foodieSelectedDbId || '';
  if (!selectedId || !databases.some(d => d.id === selectedId)) {
    selectedId = filteredDbs[0]?.id || databases[0]?.id || '';
    ui.foodieSelectedDbId = selectedId;
  }

  const selectedDb = databases.find(d => d.id === selectedId) || filteredDbs[0] || databases[0];
  const roleStats = selectedDb ? getDbRoleStats(selectedDb) : null;
  const isCustomDb = selectedDb && !selectedDb.builtin;

  // 抽屉展开状态（默认全部折叠）
  ui.foodieDrawersOpen = ui.foodieDrawersOpen || {
    location: false,
    time: false,
    weather: false,
    season: false,
    batchImport: false,
    dishes: false
  };

  // 提取当前库的 6 大角色菜品
  const roleLabels = { hot: '主菜', staple: '主食', soup: '羹汤', drink: '饮品', cold: '凉菜', dessert: '点心' };
  const roleBuckets = { hot: [], staple: [], soup: [], drink: [], cold: [], dessert: [] };
  if (selectedDb) {
    if (hasStructuredCategories(selectedDb)) {
      for (const cat of (selectedDb.categories || [])) {
        const r = normalizeCategoryRole(cat.role);
        if (r === 'excluded') continue;
        if (roleBuckets[r]) roleBuckets[r].push(...(cat.items || []));
        else roleBuckets.hot.push(...(cat.items || []));
      }
    } else {
      for (const item of (selectedDb.items || [])) {
        const r = categorizeFoodRole(item);
        if (roleBuckets[r]) roleBuckets[r].push(item);
        else roleBuckets.hot.push(item);
      }
    }
  }

  // 当前激活的菜品角色 Tab（若当前 Tab 在本库为空且非用户在本库内主动切换，则自动切到首个非空角色分类）
  const roleOrder = ['hot', 'staple', 'soup', 'drink', 'cold', 'dessert'];
  const firstNonEmptyRole = roleOrder.find(r => (roleBuckets[r]?.length || 0) > 0) || 'hot';
  const activeRole = (
    ui.foodieActiveRoleTab &&
    ((roleBuckets[ui.foodieActiveRoleTab]?.length || 0) > 0 || ui.foodieActiveRoleTabDbId === selectedDb?.id)
  )
    ? ui.foodieActiveRoleTab
    : firstNonEmptyRole;
  ui.foodieActiveRoleTab = activeRole;

  // 1. 地图地点候选：直接从系统地图（places/regions/cities）提取真实地点，拒绝硬编码无关城市
  const availableMapPlaces = [];
  if (state.map?.places?.length) {
    for (const p of state.map.places) {
      if (p.name && !availableMapPlaces.includes(p.name)) availableMapPlaces.push(p.name);
    }
  }
  if (state.map?.regions?.length) {
    for (const r of state.map.regions) {
      if (r.name && !availableMapPlaces.includes(r.name)) availableMapPlaces.push(r.name);
    }
  }
  if (state.map?.cities?.length) {
    for (const c of state.map.cities) {
      if (c.name && !availableMapPlaces.includes(c.name)) availableMapPlaces.push(c.name);
    }
  }

  // 2. 时段候选：纯原生时间区间 HH:MM-HH:MM（支持跨午夜如 21:00-02:00，联动日历自定义时段），拒绝人工加工别名
  const availableTimeSlots = [
    '07:00-09:30',
    '11:30-13:30',
    '14:00-16:30',
    '17:30-20:30',
    '21:00-02:00'
  ];
  if (state.calendar?.workdayConfig?.timeSlots?.length) {
    for (const s of state.calendar.workdayConfig.timeSlots) {
      if (s.startTime && s.endTime) {
        const slotRange = `${s.startTime}-${s.endTime}`;
        if (!availableTimeSlots.includes(slotRange)) availableTimeSlots.push(slotRange);
      }
    }
  }

  // 3. 天气候选：直接从系统气象引擎标准天气类型提取
  const availableWeather = [
    '晴朗', '晴间多云', '多云', '阴天', '小雨', '中雨', '大雨', '雷阵雨', '小雪', '大雪', '大风', '大雾', '晴热', '晴冷'
  ];

  // 4. 时令与节日候选：直接从日历项（角色自定义节日 + 真实日历节日）与四季节气提取
  const customCalFestivals = (state.calendar?.items || [])
    .filter(it => it && (it.type === 'festival' || it.name))
    .map(it => it.name)
    .filter(Boolean);
  const defaultFestivals = ['元旦', '除夕', '春节', '元宵', '端午', '中秋', '国庆节', '情人节', '圣诞节'];
  const seasonsAndTerms = ['春季', '夏季', '秋季', '冬季', '立春', '夏至', '立秋', '冬至'];
  const availableFestivalsAndSeasons = [...new Set([...customCalFestivals, ...seasonsAndTerms, ...defaultFestivals])];

  // 标题栏
  let heading = '';
  if (viewMode === 'list') {
    heading = `<header class="page-heading">
      <div class="page-title-row">
        <div class="page-heading-left" style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="icon-button back-button" data-action="foodie-close-settings" aria-label="返回">${icon('arrow')}</button>
          <h1>美食库设置</h1>
        </div>
        <div class="heading-actions">
          <button type="button" class="icon-button" data-action="foodie-new-db" aria-label="新建自建预设" title="新建自建预设">${icon('plus')}</button>
        </div>
      </div>
    </header>`;
  } else {
    heading = `<header class="page-heading">
      <div class="page-title-row">
        <div class="page-heading-left" style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="icon-button back-button" data-action="foodie-back-to-list" aria-label="返回清单" title="返回清单">${icon('arrow')}</button>
          <h1 style="font-size:16px;">${escape(selectedDb?.label || '预设编辑')}</h1>
        </div>
        <div class="heading-actions">
          <button type="button" class="icon-button" data-action="foodie-save-db" data-db-id="${escape(selectedDb?.id || '')}" aria-label="保存修改" title="保存修改">${icon('save')}</button>
          <button type="button" class="icon-button" data-action="foodie-close-settings" aria-label="退出设置" title="退出设置">${icon('close')}</button>
        </div>
      </div>
    </header>`;
  }

  return `
    <div class="foodie-view foodie-settings-view">
      ${heading}
      <div class="foodie-body">
        ${viewMode === 'list' ? `
          <!-- 基础参数配置卡片（全局） -->
          <div class="foodie-panel-card">
            <div class="panel-row">
              <span class="panel-label">单餐抽取数量</span>
              <input type="number" id="foodie-count-input" class="foodie-select-number" min="1" max="5" value="${count}">
            </div>
            <div class="panel-row vertical">
              <span class="panel-label">进食契机词</span>
              <input type="text" id="foodie-custom-intents-input" class="foodie-input-clean" value="${escape(foodieState.customIntentWords || '吃, 喝, 饿, 尝, 吃饭, 做饭, 点餐, 宵夜, 饮茶, 饱, 嘴馋')}" placeholder="逗号分隔，如：吃, 喝, 饿, 吃饭, 做饭, 点餐">
            </div>
            <div class="panel-row vertical">
              <span class="panel-label">正文注入模板</span>
              <input type="text" id="foodie-template-input" class="foodie-input-clean" value="${escape(template)}" placeholder="[食物线索：{{food}}]">
            </div>
          </div>

          <!-- 清单速控模式卡片 -->
          <div class="foodie-panel-card">
            <!-- 一级分类横向胶囊 Tab -->
            <div class="foodie-group-tabs">
              ${DB_GROUPS.map(g => `
                <button type="button" class="foodie-group-tab ${activeGroupId === g.id ? 'is-active' : ''}" data-action="foodie-switch-group" data-foodie-group="${g.id}">
                  ${escape(g.label)}
                </button>
              `).join('')}
            </div>

            <!-- 搜索与三态快捷状态过滤器 -->
            <div class="foodie-filter-row">
              <div class="foodie-filter-bar">
                <span class="filter-icon" aria-hidden="true">${icon('magnifier')}</span>
                <input type="search" id="foodie-db-search-input" class="foodie-filter-input" placeholder="搜索库名、城市、菜品..." value="${escape(searchQuery)}">
                ${searchQuery ? `<button type="button" class="icon-button foodie-filter-clear" data-action="foodie-clear-search">${icon('close')}</button>` : ''}
              </div>
              <div class="foodie-list-quick-actions">
                <button type="button" class="quick-chip-btn icon-only" data-action="foodie-trigger-import" title="导入预设库 (JSON)" aria-label="导入预设库">${icon('upload')}</button>
                <input type="file" id="foodie-import-file-input" accept=".json,.foodie.json" style="display:none;">
                <button type="button" class="quick-chip-btn icon-only" data-action="foodie-new-db" title="新建自建预设库" aria-label="新建自建预设库">${icon('plus')}</button>
                ${activeGroupId === 'custom' && databases.some(d => !d.builtin || d.id.startsWith('custom:')) ? `
                  <button type="button" class="quick-chip-btn icon-only" data-action="foodie-export-all-custom" title="导出全部自建预设库" aria-label="导出全部自建预设库">${icon('download')}</button>
                  <button type="button" class="quick-chip-btn danger-chip icon-only" data-action="foodie-delete-all-custom" title="清空全部自建美食库" aria-label="清空全部自建美食库">${icon('trash')}</button>
                ` : ''}
              </div>
            </div>

            <!-- 状态快速筛选药丸 -->
            <div class="foodie-status-filter-pills">
              <button type="button" class="filter-pill-btn ${filterMode === 'all' ? 'is-active' : ''}" data-action="foodie-set-filter-mode" data-mode="all">
                全部 (${groupScopedDbs.length})
              </button>
              <button type="button" class="filter-pill-btn ${filterMode === 'enabled' ? 'is-active' : ''}" data-action="foodie-set-filter-mode" data-mode="enabled">
                已开启 (${enabledCount})
              </button>
              <button type="button" class="filter-pill-btn ${filterMode === 'disabled' ? 'is-active' : ''}" data-action="foodie-set-filter-mode" data-mode="disabled">
                未开启 (${disabledCount})
              </button>
            </div>

            <!-- 垂直速控列表：双排精致卡片，直观开关与点击编辑 -->
            <div class="db-quick-list">
              ${filteredDbs.length ? filteredDbs.map(d => {
                const isCustom = !d.builtin || d.id.startsWith('custom:');
                const boundMeta = [];
                if (d.mapLocations?.length) boundMeta.push(`<span class="chip-svg">${icon('location')}</span>${escape(d.mapLocations.slice(0, 2).join('、'))}`);
                if (d.calendarSlots?.length) boundMeta.push(`<span class="chip-svg">${icon('clock')}</span>${escape(d.calendarSlots.slice(0, 2).join('、'))}`);
                if (d.weatherConditions?.length) boundMeta.push(`<span class="chip-svg">${icon('weather-sunny')}</span>${escape(d.weatherConditions.slice(0, 2).join('、'))}`);
                if (d.calendarFestivals?.length) boundMeta.push(`<span class="chip-svg">${icon('calendar')}</span>${escape(d.calendarFestivals.slice(0, 2).join('、'))}`);

                return `
                  <div class="db-list-row ${d.enabled ? 'is-enabled' : ''}">
                    <!-- 第一排：库名称 (左) + 快捷开关与进入箭头 (右) -->
                    <div class="db-row-header">
                      <button type="button" class="db-row-title-wrap" data-action="foodie-open-edit-db" data-db-id="${escape(d.id)}">
                        <span class="db-row-name">${escape(d.label || d.id)}</span>
                      </button>
                      <div class="db-row-actions">
                        <label class="switch" title="开启/关闭">
                          <input type="checkbox" role="switch" data-action="foodie-toggle-db-enable" data-db-id="${escape(d.id)}" ${d.enabled ? 'checked' : ''}>
                          <span></span>
                        </label>
                        <button type="button" class="icon-button micro-btn" data-action="foodie-open-edit-db" data-db-id="${escape(d.id)}" aria-label="查看详情" title="查看详情">${icon('chevron-right')}</button>
                      </div>
                    </div>

                    <!-- 第二排：来源、道数、触发词、关联地点与时令标签 -->
                    <button type="button" class="db-row-badges-line" data-action="foodie-open-edit-db" data-db-id="${escape(d.id)}">
                      <span class="db-origin-chip ${isCustom ? 'custom' : 'builtin'}">${isCustom ? '自建' : '内置'}</span>
                      <span class="db-count-chip">${getDbItemList(d).length}道菜品</span>
                      ${d.keywords?.length ? `
                        <span class="db-meta-chip kw-chip"><span class="chip-svg">${icon('edit')}</span>${escape(d.keywords.slice(0, 3).join('、'))}</span>
                      ` : ''}
                      ${boundMeta.map(m => `<span class="db-meta-chip">${m}</span>`).join('')}
                    </button>
                  </div>
                `;
              }).join('') : `
                <div class="foodie-empty-search">
                  ${filterMode === 'enabled' ? '暂无开启的美食库，请在上方选择【全部】进行开启' : (activeGroupId === 'custom' ? '暂无自建预设库，点击右上角加号或下方按钮创建' : '未找到匹配的美食库')}
                  ${activeGroupId === 'custom' ? `
                    <div style="margin-top:10px;">
                      <button type="button" class="quick-chip-btn" data-action="foodie-new-db" style="padding:6px 14px;font-size:12px;">${icon('plus')} 新建预设库</button>
                    </div>
                  ` : ''}
                </div>
              `}
            </div>
          </div>
        ` : `
          <!-- 预设详情编辑卡片 -->
          <div class="foodie-panel-card">
            <!-- 顶部工具栏 -->
            <div class="selected-db-toolbar">
              <div class="db-chip-left">
                <span class="db-origin-chip ${isCustomDb ? 'custom' : 'builtin'}">
                  ${isCustomDb ? '自建' : '内置'} · ${selectedDb ? getDbItemList(selectedDb).length : 0} 道
                </span>
              </div>
              <div class="db-actions-right">
                <button type="button" class="icon-button micro-btn" data-action="foodie-export-db" data-db-id="${escape(selectedDb?.id || '')}" aria-label="导出当前美食库" title="导出当前美食库 (JSON)">${icon('download')}</button>
                <label class="switch" title="启用/禁用">
                  <input type="checkbox" role="switch" data-action="foodie-toggle-db-enable" data-db-id="${escape(selectedDb?.id || '')}" ${selectedDb?.enabled ? 'checked' : ''}>
                  <span></span>
                </label>
                <button type="button" class="icon-button micro-btn" data-action="foodie-save-db" data-db-id="${escape(selectedDb?.id || '')}" aria-label="保存" title="保存">${icon('save')}</button>
                ${selectedDb?.builtin
                  ? `<button type="button" class="icon-button micro-btn" data-action="foodie-reset-db" data-db-id="${escape(selectedDb?.id || '')}" aria-label="恢复默认" title="恢复默认">${icon('undo')}</button>`
                  : `<button type="button" class="icon-button micro-btn danger-icon-btn" data-action="foodie-delete-db" data-db-id="${escape(selectedDb?.id || '')}" aria-label="删除自建库" title="删除自建库">${icon('trash')}</button>`}
              </div>
            </div>

            <!-- 菜品角色细分指示条 -->
            <div class="db-role-stats-row">
              <span class="role-stat-chip hot">主菜 <b>${roleStats?.hot || 0}</b></span>
              <span class="role-stat-chip staple">主食 <b>${roleStats?.staple || 0}</b></span>
              <span class="role-stat-chip soup">羹汤 <b>${roleStats?.soup || 0}</b></span>
              <span class="role-stat-chip drink">饮品 <b>${roleStats?.drink || 0}</b></span>
              <span class="role-stat-chip cold">凉菜 <b>${roleStats?.cold || 0}</b></span>
              <span class="role-stat-chip dessert">点心 <b>${roleStats?.dessert || 0}</b></span>
            </div>

            <!-- 统一预设详情构建器（内置库与自建库共享透明管理） -->
            <div class="guided-db-editor">
              <!-- 基本信息 -->
              <div class="guided-step-card">
                <div class="section-badge-title">
                  <span class="section-title-icon">${icon('edit')}</span>
                  <span class="step-name">基本信息</span>
                </div>
                <div class="guided-step-body">
                  <label class="db-form-field">
                    <span class="field-label">名称</span>
                    <input type="text" class="foodie-input-clean" id="edit-db-label" value="${escape(selectedDb?.label || '')}" placeholder="如：深夜食堂、姑苏家宴">
                  </label>
                  <label class="db-form-field">
                    <span class="field-label">触发词</span>
                    <input type="text" class="foodie-input-clean" id="edit-db-keywords" value="${escape((selectedDb?.keywords || selectedDb?.tags || []).join(', '))}" placeholder="逗号分隔，如：小聚, 喝酒, 饿了, 烤肉">
                  </label>
                </div>
              </div>

              <!-- 菜品清单（核心编辑区，直铺展示，随手打标签即可分组） -->
              <div class="guided-step-card">
                <div class="section-badge-title">
                  <span class="section-title-icon">${icon('foodie')}</span>
                  <span class="step-name">菜品清单</span>
                  <span class="drawer-summary-pill" id="foodie-total-dishes-badge" style="margin-left:auto;">${selectedDb ? getDbItemList(selectedDb).length : 0} 道菜品</span>
                </div>
                <div class="guided-step-body">
                  <!-- 角色单选切换栏 -->
                  <div class="role-selector-tabs">
                    ${[
                      { role: 'hot', label: '主菜', count: roleBuckets.hot.length },
                      { role: 'staple', label: '主食', count: roleBuckets.staple.length },
                      { role: 'soup', label: '羹汤', count: roleBuckets.soup.length },
                      { role: 'drink', label: '饮品', count: roleBuckets.drink.length },
                      { role: 'cold', label: '凉菜', count: roleBuckets.cold.length },
                      { role: 'dessert', label: '点心', count: roleBuckets.dessert.length }
                    ].map(r => `
                      <button type="button" class="role-tab-btn ${activeRole === r.role ? 'is-active' : ''}" data-action="foodie-switch-role-tab" data-role="${r.role}">
                        ${r.label} <span class="role-count-num" data-role-count="${r.role}">(${r.count})</span>
                      </button>
                    `).join('')}
                  </div>

                  <!-- 快捷时令/节气/时段/地点分组前缀按钮栏（点击自动添加 [前缀]，轻松分类无需多分库） -->
                  <div class="quick-dish-condition-bar">
                    <span class="quick-cond-title">快捷分组:</span>
                    ${[
                      '立春', '清明', '端午', '中秋', '冬至',
                      '辰时', '午时', '戌时',
                      '07:00-09:30', '11:30-13:30', '21:00-02:00',
                      '春季', '夏季', '冬季',
                      ...availableMapPlaces.slice(0, 6)
                    ].map(cond => `
                      <button type="button" class="quick-cond-chip" data-action="foodie-insert-dish-prefix" data-prefix="[${cond}]">+${cond}</button>
                    `).join('')}
                  </div>

                  <!-- 快速添加菜品栏（放在分类标签正下方，选完分类直接加，根本无需滑动到底部） -->
                  <div class="role-add-row">
                    <input type="text" id="foodie-new-dish-input" class="foodie-input-clean" placeholder="如：[清明] 青团, 螺蛳 或直接输入常食菜品，回车添加..." data-role="${activeRole}" data-db-id="${escape(selectedDb?.id || '')}">
                    <button type="button" class="quick-chip-btn add-dish-btn" data-action="foodie-add-role-dish" data-db-id="${escape(selectedDb?.id || '')}" data-role="${activeRole}">${icon('plus')} 添加</button>
                  </div>

                  <!-- 菜品展示区折叠开关栏 -->
                  <div class="dishes-display-ctrl">
                    <div class="dishes-display-title">
                      <span>已录入菜品</span>
                      <span class="role-count-badge" data-role-count-badge="${activeRole}">(${roleBuckets[activeRole]?.length || 0})</span>
                    </div>
                    <button type="button" class="role-dishes-collapse-btn" data-action="foodie-toggle-dishes-box">
                      <span class="dishes-box-toggle-text">${ui.foodieDishesBoxOpen === false ? '展开菜品' : '折叠收起'}</span>
                      <span class="caret-icon ${ui.foodieDishesBoxOpen === false ? '' : 'is-open'}">${icon('arrow-down')}</span>
                    </button>
                  </div>

                  <!-- 预渲染全部 6 个角色面板，支持一键折叠收起 -->
                  <div class="role-panes-wrapper" style="display: ${ui.foodieDishesBoxOpen === false ? 'none' : 'block'};">
                    ${['hot', 'staple', 'soup', 'drink', 'cold', 'dessert'].map(role => `
                      <div class="role-dish-chips-box ${activeRole === role ? 'is-active' : ''}" data-role-pane="${role}" style="display: ${activeRole === role ? 'flex' : 'none'};">
                        ${roleBuckets[role]?.length ? roleBuckets[role].map((dish, idx) => {
                          const parsed = parseDishCondition(dish);
                          return `
                            <span class="role-dish-tag ${parsed.condition ? 'has-condition' : ''}" data-dish-name="${escape(dish)}">
                              ${parsed.condition ? `<span class="dish-cond-badge">${escape(parsed.condition)}</span>` : ''}
                              <span class="dish-name-text">${escape(parsed.name)}</span>
                              <button type="button" class="dish-remove-btn" data-action="foodie-remove-role-dish" data-db-id="${escape(selectedDb?.id || '')}" data-role="${role}" data-dish="${escape(dish)}" title="删除">${icon('close')}</button>
                            </span>
                          `;
                        }).join('') : '<div class="role-dishes-empty">暂无菜品</div>'}
                      </div>
                    `).join('')}
                  </div>

                                    <!-- 注入提示词示例预览 -->
                  <div class="db-prompt-preview-line">
                    <span class="preview-badge">注入预览</span>
                    <span class="preview-code">${escape(template.replace('{{food}}', [roleBuckets.hot[0] || '招牌主菜', roleBuckets.staple[0] || roleBuckets.soup[0] || '精选主食'].join('、')))}</span>
                  </div>

                  <!-- 隐藏式六角色数据中继，供保存时一并提取 -->
                  <div style="display:none;">
                    <textarea id="edit-db-hot">${escape(roleBuckets.hot.join('\n'))}</textarea>
                    <textarea id="edit-db-staple">${escape(roleBuckets.staple.join('\n'))}</textarea>
                    <textarea id="edit-db-soup">${escape(roleBuckets.soup.join('\n'))}</textarea>
                    <textarea id="edit-db-drink">${escape(roleBuckets.drink.join('\n'))}</textarea>
                    <textarea id="edit-db-cold">${escape(roleBuckets.cold.join('\n'))}</textarea>
                    <textarea id="edit-db-dessert">${escape(roleBuckets.dessert.join('\n'))}</textarea>
                  </div>
                </div>
              </div>

              <!-- 底部操作栏：返回清单与保存预设 -->
              <div class="guided-db-footer">
                <button type="button" class="foodie-footer-btn secondary" data-action="foodie-back-to-list" title="返回清单" aria-label="返回清单">
                  <span class="btn-icon-svg">${icon('arrow')}</span>
                </button>
                <button type="button" class="foodie-footer-btn secondary" data-action="foodie-export-db" data-db-id="${escape(selectedDb?.id || '')}" title="导出预设" aria-label="导出预设">
                  <span class="btn-icon-svg">${icon('download')}</span>
                </button>
                ${isCustomDb ? `
                  <button type="button" class="foodie-footer-btn danger" data-action="foodie-delete-db" data-db-id="${escape(selectedDb?.id || '')}" title="整库删除" aria-label="整库删除">
                    <span class="btn-icon-svg">${icon('trash')}</span>
                  </button>
                ` : `
                  <button type="button" class="foodie-footer-btn secondary" data-action="foodie-reset-db" data-db-id="${escape(selectedDb?.id || '')}" title="恢复内置" aria-label="恢复内置">
                    <span class="btn-icon-svg">${icon('undo')}</span>
                  </button>
                `}
                <button type="button" class="foodie-footer-btn primary" data-action="foodie-save-db" data-db-id="${escape(selectedDb?.id || '')}" title="保存预设" aria-label="保存预设">
                  <span class="btn-icon-svg">${icon('save')}</span>
                </button>
              </div>
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}
