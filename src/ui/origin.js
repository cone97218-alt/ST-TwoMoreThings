import { action, empty, escape, icon, pageHeading, getSkillIcon } from './shared.js';
import { taskRemainingTurns, resolvePersona, DEFAULT_ORIGIN_TEMPLATES } from '../origin-engine.js';

export function renderOrigin(state, { ui = {} } = {}) {
  const origin = state.origin || {};
  const activeTab = ui.originTab || 'tasks';
  const showSettings = ui.originShowSettings || false;

  if (showSettings) {
    const heading = `<header class="page-heading">
      <div class="page-title-row">
        <div class="page-heading-left" style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="icon-button back-button" data-action="origin-close-settings" aria-label="返回系统">${icon('arrow')}</button>
          <h1>系统设置</h1>
        </div>
        <div class="heading-actions">
          <button type="button" class="icon-button" data-action="origin-close-settings" aria-label="完成">${icon('close')}</button>
        </div>
      </div>
    </header>`;
    return `<div class="origin-view">
      ${heading}
      ${renderOriginSettings(origin)}
      ${renderOriginModals(ui, origin)}
    </div>`;
  }

  const heading = `<header class="page-heading">
    <div class="page-title-row">
      <div class="page-heading-left" style="display:flex;align-items:center;gap:6px;">
        <button type="button" class="icon-button back-button" data-action="origin-back" aria-label="返回桌面">${icon('arrow')}</button>
        <h1>${escape(origin.sysName || '系统')}</h1>
      </div>
      <div class="heading-actions">
        <button type="button" class="icon-button" data-action="origin-toggle-settings" aria-label="系统设置">${icon('settings')}</button>
      </div>
    </div>
  </header>`;

  if (!origin.enabled) {
    return `<div class="origin-view">
      ${heading}
      <div class="empty-state">
        <div class="empty-symbol">${icon('origin')}</div>
        <h2>系统尚未激活</h2>
        <p>激活后将自动派发剧情任务、记录积分与属性成长、开启商城与祈愿，并在手机短信中建立系统专属私聊。</p>
        <button type="button" class="save-button" data-action="origin-enable-system" style="margin-top: 14px;">
          立即激活系统
        </button>
      </div>
      ${renderOriginModals(ui, origin)}
    </div>`;
  }

  return `<div class="origin-view" data-origin-active-tab="${escape(activeTab)}">
    ${heading}
    <div class="origin-body">
      ${renderOriginHero(origin)}
      ${renderOriginTabBar(activeTab)}
      <div class="origin-tab-content">
        ${renderTabContent(activeTab, origin, ui, state)}
      </div>
    </div>
    ${renderOriginModals(ui, origin)}
  </div>`;
}

function renderOriginHero(origin) {
  const expPercent = Math.min(100, Math.round(((origin.exp || 0) / (origin.expMax || 100)) * 100));
  const bindTo = origin.bindTo || '宿主';

  return `<div class="origin-hero-card">
    <div class="origin-hero-top">
      <div class="origin-host-info">
        <span class="origin-chip origin-host-chip">${icon('role-user')} <span>${escape(bindTo)}</span></span>
        ${origin.world ? `<span class="origin-chip origin-world-chip">${escape(origin.world)}</span>` : ''}
      </div>
      <button type="button" class="origin-sms-btn" data-action="origin-open-sms" aria-label="与系统私聊">
        ${icon('comment')} <span>系统私聊</span>
      </button>
    </div>
    <div class="origin-hero-middle">
      <div class="origin-points-display">
        <small>当前可用积分</small>
        <strong>${origin.points || 0}</strong>
      </div>
      <div class="origin-level-badge">
        <span>Lv.${origin.level || 1}</span>
      </div>
    </div>
    <div class="origin-exp-row">
      <div class="origin-exp-bar">
        <i style="width: ${expPercent}%"></i>
      </div>
      <span class="origin-exp-text">EXP ${origin.exp || 0} / ${origin.expMax || 100}</span>
    </div>
  </div>`;
}

function renderOriginTabBar(activeTab) {
  const tabs = [
    { id: 'tasks', label: '任务' },
    { id: 'stats', label: '属性' },
    { id: 'bag', label: '背包' },
    { id: 'shop', label: '商城' },
    { id: 'gacha', label: '祈愿' },
    { id: 'achieve', label: '成就' },
    { id: 'log', label: '日志' },
  ];
  return `<nav class="origin-nav-tabs" aria-label="系统分页">
    ${tabs.map(t => `<button type="button" class="origin-nav-tab ${activeTab === t.id ? 'is-active' : ''}" data-action="origin-switch-tab" data-origin-tab="${t.id}">
      ${escape(t.label)}
    </button>`).join('')}
  </nav>`;
}

function renderTabContent(activeTab, origin, ui, state) {
  switch (activeTab) {
    case 'tasks': return renderTasksTab(origin, ui);
    case 'stats': return renderStatsTab(origin, ui);
    case 'bag': return renderBagTab(origin, ui);
    case 'shop': return renderShopTab(origin, ui);
    case 'gacha': return renderGachaTab(origin, ui);
    case 'achieve': return renderAchieveTab(origin);
    case 'log': return renderLogTab(origin, ui);
    default: return renderTasksTab(origin, ui);
  }
}

// ---------------- 任务页 ----------------
function renderTasksTab(origin, ui) {
  const tasks = origin.tasks || [];
  const filter = ui.taskFilter || 'all';
  const filtered = tasks.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'active') return t.status === 'active';
    if (filter === 'done') return t.status === 'done';
    if (filter === 'failed') return t.status === 'failed';
    return t.type === filter;
  });

  return `<div class="origin-tasks-view">
    <div class="origin-filter-pills">
      ${[
        { id: 'all', label: '全部' },
        { id: 'active', label: '进行中' },
        { id: '主线', label: '主线' },
        { id: '支线', label: '支线' },
        { id: '日常', label: '日常' },
        { id: 'done', label: '已完成' },
      ].map(f => `<button type="button" class="origin-pill ${filter === f.id ? 'is-active' : ''}" data-action="origin-filter-tasks" data-origin-filter="${f.id}">
        ${escape(f.label)}
      </button>`).join('')}
    </div>

    <div class="origin-tasks-list">
      ${filtered.length === 0 ? `<div class="origin-empty-placeholder">
        <p>暂无相关任务</p>
      </div>` : filtered.map(t => renderTaskCard(t, origin)).join('')}
    </div>

    <div class="origin-actions-bar">
      <button type="button" class="icon-button" data-action="origin-open-new-task" title="发布新任务" aria-label="发布新任务">
        ${icon('plus')}
      </button>
      <button type="button" class="icon-button" data-action="origin-ai-conceive-task" title="AI推演任务" aria-label="AI推演任务">
        ${icon('sparkles')}
      </button>
      <button type="button" class="icon-button" data-action="origin-open-direction" title="设定期望方向" aria-label="设定期望方向">
        ${icon('target')}
      </button>
    </div>
  </div>`;
}

function renderTaskCard(task, origin) {
  const currentTurn = origin.currentTurn !== undefined ? origin.currentTurn : 0;
  const rem = taskRemainingTurns(task, currentTurn);
  const isUrgent = rem !== null && rem <= 2 && task.status === 'active';

  return `<div class="origin-task-card origin-task-${task.status}" data-task-id="${escape(task.id)}">
    <div class="origin-task-header">
      <div class="origin-task-meta-bar">
        <span class="origin-tag tg-${escape(task.type || '支线')}">${escape(task.type || '支线')}</span>
        <div class="origin-task-header-meta">
          ${task.status === 'active' && rem !== null ? `<span class="origin-timer-chip ${isUrgent ? 'is-urgent' : ''}">${icon('clock')} <span>剩 ${rem} 回合</span></span>` : ''}
          <span class="origin-status-badge is-${task.status}">${task.status === 'active' ? '进行中' : task.status === 'done' ? '已达成' : '已失败'}</span>
        </div>
      </div>
      <h3 class="origin-task-title">${escape(task.title)}</h3>
    </div>

    ${task.cond ? `<div class="origin-task-cond"><small class="origin-task-cond-label">目标条件</small><span class="origin-task-cond-content">${escape(task.cond)}</span></div>` : ''}
    ${task.desc ? `<p class="origin-task-desc">${escape(task.desc)}</p>` : ''}

    <div class="origin-task-progress-row">
      <div class="origin-task-progress-bar">
        <i style="width: ${Math.min(100, Math.max(0, task.progress || 0))}%"></i>
      </div>
      <span class="origin-task-progress-num">${task.progress || 0}%</span>
    </div>

    <div class="origin-task-rewards">
      ${task.reward ? `<span class="rw">${icon('gift')} <span>奖励: ${escape(task.reward)}</span></span>` : ''}
      ${task.penalty ? `<span class="fl">${icon('warning')} <span>惩罚: ${escape(task.penalty)}</span></span>` : ''}
    </div>

    <div class="origin-task-actions">
      ${task.status === 'active' ? `
        <button type="button" class="quiet-button" data-action="origin-complete-task" data-task-id="${escape(task.id)}">结算完成</button>
        <button type="button" class="quiet-button danger" data-action="origin-fail-task" data-task-id="${escape(task.id)}">标记失败</button>
      ` : ''}
      <button type="button" class="quiet-button" data-action="origin-edit-task" data-task-id="${escape(task.id)}">编辑</button>
      <button type="button" class="quiet-button danger" data-action="origin-delete-task" data-task-id="${escape(task.id)}">删除</button>
    </div>
  </div>`;
}

// ---------------- 属性与技能页 ----------------
function renderStatsTab(origin, ui) {
  const stats = origin.stats || [];
  const perks = origin.perks || [];
  const skills = origin.skills || [];
  const isBusy = Boolean(ui?.isEvaluatingStats);
  const isEditing = Boolean(ui?.originStatsEditing);

  return `<div class="origin-stats-view ${isEditing ? 'is-editing-mode' : ''}">
    <!-- 1. 属性 -->
    <section class="origin-section">
      <div class="origin-section-header">
        <div class="origin-section-title-group">
          <h4 class="origin-section-heading">属性</h4>
          <span class="origin-count-chip">${stats.length}</span>
        </div>
        <div class="origin-section-actions">
          <button type="button" class="icon-button ${isBusy ? 'is-loading' : ''}" data-action="origin-open-evaluate-stats" title="${stats.length === 0 ? 'AI构想属性·技能·特权' : 'AI评估综合成长'}" aria-label="${stats.length === 0 ? 'AI构想属性·技能·特权' : 'AI评估综合成长'}" ${isBusy ? 'disabled' : ''}>
            ${icon('sparkles')}
          </button>
          <button type="button" class="icon-button ${isEditing ? 'is-active' : ''}" data-action="origin-toggle-stats-edit" title="${isEditing ? '完成管理（切换只读）' : '管理与编辑各板块'}" aria-label="${isEditing ? '完成管理（切换只读）' : '管理与编辑各板块'}">
            ${icon('edit')}
          </button>
          <button type="button" class="icon-button" data-action="origin-open-new-stat" title="新增属性" aria-label="新增属性">${icon('plus')}</button>
        </div>
      </div>
      <div class="origin-stats-grid">
        ${stats.length === 0 ? `
          <div class="origin-empty-box">
            <span class="origin-empty-hint">暂无数值属性记录</span>
            <button type="button" class="origin-empty-action-btn" data-action="origin-open-evaluate-stats" ${isBusy ? 'disabled' : ''}>
              ${icon('sparkles')} ${isBusy ? '正在智能构想中...' : '智能构想（属性·技能·特权）'}
            </button>
          </div>
        ` : stats.map(s => `<div class="origin-stat-card">
          <span class="origin-stat-name">${escape(s.name)}</span>
          <div class="origin-stat-controls">
            ${isEditing ? `
              <button type="button" class="origin-stat-btn" data-action="origin-mod-stat" data-stat="${escape(s.name)}" data-delta="-1">-</button>
              <strong class="origin-stat-val">${s.val}</strong>
              <button type="button" class="origin-stat-btn" data-action="origin-mod-stat" data-stat="${escape(s.name)}" data-delta="1">+</button>
              <button type="button" class="icon-button danger" data-action="origin-delete-stat" data-stat="${escape(s.name)}" title="删除属性" aria-label="删除属性">${icon('trash')}</button>
            ` : `
              <strong class="origin-stat-val is-readonly">${s.val}</strong>
            `}
          </div>
        </div>`).join('')}
      </div>
    </section>

    <!-- 2. 技能 -->
    <section class="origin-section">
      <div class="origin-section-header">
        <div class="origin-section-title-group">
          <h4 class="origin-section-heading">技能</h4>
          <span class="origin-count-chip">${skills.length}</span>
        </div>
        <div class="origin-section-actions">
          <button type="button" class="icon-button" data-action="origin-open-new-skill" title="添加技能" aria-label="添加技能">${icon('plus')}</button>
        </div>
      </div>
      <div class="origin-skills-list">
        ${skills.length === 0 ? `
          <div class="origin-empty-box">
            <span class="origin-empty-hint">暂无已掌握技能</span>
            <button type="button" class="origin-empty-action-btn" data-action="origin-open-new-skill">
              ${icon('plus')} 掌握新技能
            </button>
          </div>
        ` : skills.map(sk => {
          const hasExp = Boolean(sk.expMax);
          const percent = hasExp ? Math.min(100, Math.max(0, Math.round(((sk.exp || 0) / sk.expMax) * 100))) : 0;
          return `<div class="origin-skill-card ${hasExp ? 'has-exp' : 'is-pure-text'}" data-skill-name="${escape(sk.name)}">
            <div class="origin-skill-head" style="display:flex;justify-content:space-between;align-items:center;">
              <div class="origin-skill-title-row" style="display:inline-flex;align-items:center;gap:6px;">
                <span class="origin-skill-icon">${icon(getSkillIcon(sk.name))}</span>
                <span class="origin-skill-name">${escape(sk.name)}</span>
                ${hasExp ? `<span class="origin-skill-badge" style="font-size:10.5px;padding:1px 6px;border-radius:10px;background:var(--pp-accent-dim);color:var(--pp-accent);font-weight:600;">Lv.${sk.level || 1}</span>` : ''}
              </div>
              ${isEditing ? `
                <div class="origin-skill-card-actions" style="display:inline-flex;align-items:center;gap:4px;">
                  <button type="button" class="icon-button" data-action="origin-edit-skill" data-skill="${escape(sk.name)}" title="编辑技能" aria-label="编辑技能">
                    ${icon('edit')}
                  </button>
                  <button type="button" class="icon-button danger" data-action="origin-delete-skill" data-skill="${escape(sk.name)}" title="删除技能" aria-label="删除技能">
                    ${icon('trash')}
                  </button>
                </div>
              ` : ''}
            </div>
            ${sk.desc ? `<div class="origin-skill-desc" style="font-size:11.5px;color:var(--pp-muted);margin-top:4px;">${escape(sk.desc)}</div>` : ''}
            ${hasExp ? `
              <div class="origin-skill-exp-row" style="margin-top:8px;display:flex;align-items:center;gap:8px;">
                <div class="origin-exp-bar" style="flex:1;">
                  <i style="width: ${percent}%;"></i>
                </div>
                <span class="origin-exp-text" style="font-size:10px;white-space:nowrap;">EXP ${sk.exp || 0}/${sk.expMax}</span>
                ${isEditing ? `
                  <div class="origin-skill-exp-ctrls" style="display:inline-flex;gap:4px;">
                    <button type="button" class="origin-stat-btn" data-action="origin-mod-skill-exp" data-skill="${escape(sk.name)}" data-delta="-10" title="熟练度 -10" style="padding:1px 6px;font-size:10px;">-10</button>
                    <button type="button" class="origin-stat-btn" data-action="origin-mod-skill-exp" data-skill="${escape(sk.name)}" data-delta="10" title="熟练度 +10" style="padding:1px 6px;font-size:10px;">+10</button>
                  </div>
                ` : ''}
              </div>
            ` : (isEditing ? `
              <div class="origin-pure-skill-footer" style="margin-top:6px;display:flex;justify-content:flex-end;">
                <button type="button" class="quiet-button" data-action="origin-enable-skill-exp" data-skill="${escape(sk.name)}" style="font-size:11px;padding:2px 8px;">
                  + 启用经验条
                </button>
              </div>
            ` : '')}
          </div>`;
        }).join('')}
      </div>
    </section>

    <!-- 3. 特权 -->
    <section class="origin-section">
      <div class="origin-section-header">
        <div class="origin-section-title-group">
          <h4 class="origin-section-heading">特权</h4>
          <span class="origin-count-chip">${perks.length}</span>
        </div>
        <div class="origin-section-actions">
          <button type="button" class="icon-button" data-action="origin-open-new-perk" title="新增特权" aria-label="新增特权">${icon('plus')}</button>
        </div>
      </div>
      <div class="origin-perks-list">
        ${perks.length === 0 ? `
          <div class="origin-empty-box">
            <span class="origin-empty-hint">暂无已开启的特权</span>
            <button type="button" class="origin-empty-action-btn" data-action="origin-open-new-perk">
              ${icon('plus')} 添加特权
            </button>
          </div>
        ` : perks.map(p => `<div class="origin-perk-card">
          <div class="origin-perk-head" style="display:flex;justify-content:space-between;align-items:center;">
            <div class="origin-perk-title-row" style="display:inline-flex;align-items:center;gap:6px;">
              <span class="origin-perk-icon">${icon('sparkles')}</span>
              <span class="origin-perk-name origin-perk-badge">${escape(p.name)}</span>
            </div>
            ${isEditing ? `
              <div class="origin-card-actions" style="display:inline-flex;align-items:center;gap:4px;">
                <button type="button" class="icon-button" data-action="origin-edit-perk" data-perk="${escape(p.name)}" title="编辑特权" aria-label="编辑特权">${icon('edit')}</button>
                <button type="button" class="icon-button danger" data-action="origin-delete-perk" data-perk="${escape(p.name)}" title="删除特权" aria-label="删除特权">${icon('trash')}</button>
              </div>
            ` : ''}
          </div>
          ${p.desc ? `<div class="origin-perk-desc">${escape(p.desc)}</div>` : ''}
        </div>`).join('')}
      </div>
    </section>
  </div>`;
}

// ---------------- 背包页 ----------------
function renderBagTab(origin, ui) {
  const bag = origin.bag || [];
  return `<div class="origin-bag-view">
    <div class="origin-bag-notice">
      ${icon('bulb')} <span>使用道具后将在下一回合剧情自然呈现其效果</span>
    </div>
    <div class="origin-bag-grid">
      ${bag.length === 0 ? '<div class="origin-empty-placeholder"><p>背包空空如也，前往商城或祈愿获取道具吧！</p></div>' : bag.map(item => `<div class="origin-item-card">
        <div class="origin-item-header">
          <span class="origin-item-badge">道具</span>
          <span class="origin-item-count">×${item.count || 1}</span>
        </div>
        <h4 class="origin-item-name">${escape(item.name)}</h4>
        ${item.desc ? `<p class="origin-item-desc">${escape(item.desc)}</p>` : ''}
        ${item.effect ? `<div class="origin-item-effect">效果: ${escape(item.effect)}</div>` : ''}
        <button type="button" class="save-button origin-use-item-btn" data-action="origin-use-item" data-item="${escape(item.name)}">
          使用道具
        </button>
      </div>`).join('')}
    </div>
  </div>`;
}

// ---------------- 商城页 ----------------
function renderShopTab(origin, ui) {
  const shop = origin.shop || [];
  const catalog = origin.shopCatalog || [];
  const points = origin.points || 0;
  const isBusy = Boolean(ui?.isConceivingShop);

  return `<div class="origin-shop-view">
    <div class="origin-shop-banner">
      <div class="origin-shop-points">
        ${icon('diamond')} <span>当前积分：</span>
        <strong>${points}</strong>
      </div>
      <div class="origin-shop-header-actions origin-icon-bar" style="display:flex;gap:4px;align-items:center;">
        <button type="button" class="icon-button" data-action="origin-refresh-shop" title="换一批（从商品总库随机抽取上架）" aria-label="换一批">
          ${icon('refresh')}
        </button>
        <button type="button" class="icon-button ${isBusy ? 'is-loading' : ''}" data-action="origin-open-conceive-shop" title="AI批量进货（结合剧情世界观构想新商品）" aria-label="AI进货" ${isBusy ? 'disabled' : ''}>
          ${icon('sparkles')}
        </button>
        <button type="button" class="icon-button" data-action="origin-open-shop-catalog" title="商品总库 (${catalog.length || shop.length}件)" aria-label="商品总库">
          ${icon('cards')}
        </button>
      </div>
    </div>

    <div class="origin-shop-grid">
      ${shop.length === 0 ? `
        <div class="origin-empty-box" style="grid-column: 1 / -1; margin-top: 10px;">
          <span class="origin-empty-hint">商城货架空空如也，暂无在售商品</span>
          <button type="button" class="origin-empty-action-btn" data-action="origin-open-conceive-shop" ${isBusy ? 'disabled' : ''}>
            ${icon('sparkles')} ${isBusy ? '正在进货推演中...' : 'AI 批量进货（构想新商品）'}
          </button>
        </div>
      ` : shop.map(item => {
        const canBuy = points >= item.price;
        return `<div class="origin-shop-card">
          <div class="origin-shop-card-head">
            <h4 class="origin-shop-title">${escape(item.name)}</h4>
            <div class="origin-shop-price">${icon('diamond')} <span>${item.price} 积分</span></div>
          </div>
          ${item.desc ? `<p class="origin-shop-desc">${escape(item.desc)}</p>` : ''}
          ${item.effect ? `<div class="origin-shop-effect">效果: ${escape(item.effect)}</div>` : ''}
          <button type="button" class="save-button origin-shop-buy-btn ${canBuy ? '' : 'is-disabled'}" data-action="origin-buy-item" data-item="${escape(item.name)}" ${canBuy ? '' : 'disabled'}>
            ${canBuy ? '立即兑换' : '积分不足'}
          </button>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ---------------- 祈愿抽奖页 ----------------
function renderGachaTab(origin, ui) {
  const pool = origin.gachaPool || [];
  const catalog = origin.gachaCatalog || [];
  const cost = origin.drawCost || 300;
  const points = origin.points || 0;
  const hasItems = (catalog.length > 0 || pool.length > 0);
  const canSingle = hasItems && points >= cost;
  const canTen = hasItems && points >= cost * 10;
  const isBusy = Boolean(ui?.isConceivingGacha);

  return `<div class="origin-gacha-view">
    <div class="origin-gacha-hero">
      <div class="origin-gacha-sparkles">${icon('sparkles')}</div>
      <h2>万象祈愿池</h2>
      <p>消耗系统积分，抽取神秘奇物与改命特权</p>
    </div>

    <div class="origin-gacha-controls">
      <button type="button" class="save-button ${canSingle ? '' : 'is-disabled'}" data-action="origin-draw-gacha" data-count="1" ${canSingle ? '' : 'disabled'}>
        ${hasItems ? `单次祈愿 (${cost} 积分)` : '奖池暂无物品'}
      </button>
      <button type="button" class="save-button ${canTen ? '' : 'is-disabled'}" data-action="origin-draw-gacha" data-count="10" ${canTen ? '' : 'disabled'}>
        ${hasItems ? `十连祈愿 (${cost * 10} 积分)` : '奖池暂无物品'}
      </button>
    </div>

    <section class="origin-section origin-pool-preview">
      <div class="origin-pool-preview-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="margin:0;">当前轮换预览</h4>
        <div class="origin-icon-bar" style="display:flex;gap:4px;align-items:center;">
          <button type="button" class="icon-button" data-action="origin-refresh-gacha" title="轮换奖池预览" aria-label="轮换奖池">
            ${icon('refresh')}
          </button>
          <button type="button" class="icon-button ${isBusy ? 'is-loading' : ''}" data-action="origin-open-conceive-gacha" title="AI批量构想新奖品并扩充奖池" aria-label="AI扩充奖池" ${isBusy ? 'disabled' : ''}>
            ${icon('sparkles')}
          </button>
          <button type="button" class="icon-button" data-action="origin-open-gacha-catalog" title="祈愿奖池总库 (${catalog.length || pool.length}件)" aria-label="奖池总库">
            ${icon('cards')}
          </button>
        </div>
      </div>
      <div class="origin-pool-list">
        ${pool.length === 0 ? `
          <div class="origin-empty-box" style="margin-top: 6px;">
            <span class="origin-empty-hint">祈愿池空空如也，暂无奖品</span>
            <button type="button" class="origin-empty-action-btn" data-action="origin-open-conceive-gacha" ${isBusy ? 'disabled' : ''}>
              ${icon('sparkles')} ${isBusy ? '正在推演奖池中...' : 'AI 批量构想祈愿奖品'}
            </button>
          </div>
        ` : pool.map(item => `<div class="origin-pool-item tier-${item.tier || 'N'}">
          <span class="origin-tier-badge">${item.tier || 'N'}</span>
          <span class="origin-pool-name">${escape(item.name)}</span>
          <span class="origin-pool-effect">${escape(item.desc || item.effect || '')}</span>
        </div>`).join('')}
      </div>
    </section>
  </div>`;
}

// ---------------- 成就页 ----------------
function renderAchieveTab(origin) {
  const achievements = origin.achievements || [];
  return `<div class="origin-achieve-view">
    <div class="origin-achieve-grid">
      ${achievements.length === 0 ? '<div class="origin-empty-placeholder"><p>尚未达成任何高光成就，继续推进剧情吧！</p></div>' : achievements.map(a => `<div class="origin-achieve-card">
        <div class="origin-achieve-medal">${icon('trophy')}</div>
        <div class="origin-achieve-body">
          <h4>${escape(a.name)}</h4>
          <p>${escape(a.desc || '达成重要剧情节点')}</p>
          <small>解锁时间: ${escape(a.unlockedAt || '已达成')}</small>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

// ---------------- 日志页 ----------------
function renderLogTab(origin, ui) {
  const logs = origin.log || [];
  const filter = ui.originLogFilter || 'all';

  const matchesFilter = (item) => {
    if (filter === 'all') return true;
    const type = item.type || 'info';
    if (filter === 'task') return ['new-task', 'progress', 'success', 'warning'].includes(type);
    if (filter === 'stat') return ['stat', 'skill', 'level-up', 'perk', 'eval-stats'].includes(type);
    if (filter === 'points') return type === 'points';
    if (filter === 'item') return ['bag', 'shop', 'use-item', 'gacha', 'item-gain'].includes(type);
    if (filter === 'eval') return ['eval-stats', 'shop-refresh'].includes(type);
    return true;
  };

  const filtered = logs.filter(matchesFilter);

  const getLogTypeBadge = (type) => {
    switch (type) {
      case 'new-task': return { label: '新任务', cls: 'badge-task' };
      case 'progress': return { label: '任务进度', cls: 'badge-progress' };
      case 'success': return { label: '任务达成', cls: 'badge-success' };
      case 'warning': return { label: '任务警示', cls: 'badge-warning' };
      case 'points': return { label: '积分变动', cls: 'badge-points' };
      case 'stat': return { label: '属性变动', cls: 'badge-stat' };
      case 'skill': return { label: '技能领悟', cls: 'badge-skill' };
      case 'level-up': return { label: '等级提升', cls: 'badge-level' };
      case 'perk': return { label: '特权觉醒', cls: 'badge-perk' };
      case 'achievement': return { label: '成就达成', cls: 'badge-achieve' };
      case 'eval-stats': return { label: 'AI评估', cls: 'badge-eval' };
      case 'shop':
      case 'shop-refresh': return { label: '系统商城', cls: 'badge-shop' };
      case 'use-item':
      case 'bag':
      case 'item-gain': return { label: '道具物品', cls: 'badge-item' };
      case 'gacha': return { label: '祈愿抽取', cls: 'badge-gacha' };
      case 'broadcast': return { label: '系统播报', cls: 'badge-broadcast' };
      default: return { label: '系统记录', cls: 'badge-info' };
    }
  };

  return `<div class="origin-log-view">
    <div class="origin-log-header">
      <div class="origin-filter-pills">
        ${[
          { id: 'all', label: '全部' },
          { id: 'task', label: '任务' },
          { id: 'stat', label: '属性/技能' },
          { id: 'points', label: '积分' },
          { id: 'item', label: '道具/商城' },
          { id: 'eval', label: 'AI推演' },
        ].map(f => `<button type="button" class="origin-pill ${filter === f.id ? 'is-active' : ''}" data-action="origin-filter-logs" data-origin-filter="${f.id}">
          ${escape(f.label)}
        </button>`).join('')}
      </div>
      ${logs.length > 0 ? `
        <button type="button" class="quiet-button origin-clear-log-btn" data-action="origin-clear-logs" title="清空所有履历日志">
          ${icon('trash')} <span>清空日志</span>
        </button>
      ` : ''}
    </div>

    <div class="origin-log-list">
      ${filtered.length === 0 ? `
        <div class="origin-empty-placeholder">
          <p>${logs.length === 0 ? '暂无系统履历日志，在剧情中推进任务、获得属性成长或积分结算时将在此完整保留理由与记录。' : '当前分类下暂无日志记录。'}</p>
        </div>
      ` : filtered.map(item => {
        const badge = getLogTypeBadge(item.type);
        return `<div class="origin-log-item origin-log-type-${escape(item.type || 'info')}">
          <div class="origin-log-meta">
            <span class="origin-log-badge ${badge.cls}">${badge.label}</span>
            <span class="origin-log-time">${escape(item.time || '')}${item.turn !== undefined && item.turn !== null ? ` · 回合#${item.turn}` : ''}</span>
          </div>
          <div class="origin-log-text">${escape(item.text)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ---------------- 设置页 ----------------
const INJECT_SECTION_DEFS = [
  { key: 'panel', name: '宿主与系统面板', desc: '等级、积分、属性与技能', vars: '{{sysName}}, {{hostName}}, {{world}}, {{points}}, {{level}}, {{stats}}, {{skills}}, {{perks}}' },
  { key: 'tasks', name: '进行中任务清单', desc: '主线/支线/日常任务与进度', vars: '{{tasks}}, {{content}}' },
  { key: 'inventory', name: '背包道具与商城', desc: '持有物品与商城在售货架', vars: '{{bag}}, {{shop}}, {{content}}' },
  { key: 'action', name: '本回合动作与事件', desc: '道具生效与系统事件反应', vars: '{{actions}}, {{content}}' },
  { key: 'rules', name: '系统行为与口吻规则', desc: '人设口吻、发布频率与规则', vars: '{{taskRule}} (冷却纯文字规则), {{persona}}, {{direction}}, {{content}}' },
  { key: 'output', name: '数据回传与输出规范', desc: '回传数据块规范 (关或留空则不索取数据块)', vars: '留空或关闭则不索取数据块' },
];

function renderOriginSectionsSettings(sections = {}) {
  return INJECT_SECTION_DEFS.map(def => {
    const sec = sections[def.key] || {};
    const enabled = sec.enabled !== false;
    const currentVal = sec.template !== undefined ? sec.template : (DEFAULT_ORIGIN_TEMPLATES[def.key] || '');
    return `<div class="origin-section-item" style="border-top:1px solid var(--pp-divider-soft);padding-top:8px;margin-top:8px;">
      <label class="compact-switch-row">
        <div>
          <div style="font-weight:500;font-size:13px;">${escape(def.name)}</div>
          <div style="font-size:11px;color:var(--pp-muted);">${escape(def.desc)}</div>
        </div>
        <span class="switch">
          <input type="checkbox" name="section_${def.key}_enabled" role="switch" aria-label="${escape(def.name)}" ${enabled ? 'checked' : ''}>
          <span></span>
        </span>
      </label>
      <details class="origin-section-details" style="margin-top:4px;">
        <summary style="font-size:11px;color:var(--pp-accent,#d4883b);cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;padding:2px 0;">
          <span>编辑提示词</span>
          <button type="button" class="quiet-button" data-action="origin-fill-default-tpl" data-key="${def.key}" style="font-size:10px;padding:1px 6px;margin-left:auto;">填入默认</button>
        </summary>
        <div style="margin-top:6px;">
          <textarea name="section_${def.key}_template" rows="3" placeholder="留空则不注入该模块">${escape(currentVal)}</textarea>
          ${def.vars ? `<div style="font-size:10.5px;color:var(--pp-muted);margin-top:3px;line-height:1.4;">可用变量：${escape(def.vars)}</div>` : ''}
        </div>
      </details>
    </div>`;
  }).join('');
}

function renderOriginSettings(origin) {
  const personas = ['冷澈', '毒舌', '傲娇', '温和'];
  return `<div class="origin-settings-view">
    <form class="origin-settings-form" data-origin-form="settings">
      <div class="origin-settings-card">
        <div class="origin-card-title">基础运行</div>
        <label class="compact-switch-row">
          <span>启用系统</span>
          <span class="switch">
            <input type="checkbox" name="enabled" role="switch" aria-label="启用系统" ${origin.enabled !== false ? 'checked' : ''}>
            <span></span>
          </span>
        </label>
        <div class="origin-setting-item">
          <label class="field-label">系统名称</label>
          <input type="text" name="sysName" value="${escape(origin.sysName || '系统')}" placeholder="系统名称">
        </div>
        <div class="origin-setting-item">
          <label class="field-label">当前世界 / 位面名称（选填）</label>
          <input type="text" name="world" value="${escape(origin.world || '')}" placeholder="例如：现代都市、修仙界、提瓦特... 留空显示未设定">
          <small class="field-label">用于无限流/快穿等题材，告知系统宿主当前所处的位面环境</small>
        </div>
        <div class="origin-setting-item">
          <label class="field-label">绑定对象 (宿主)</label>
          <input type="text" name="bindTo" value="${escape(origin.bindTo || '宿主')}" placeholder="默认'宿主'；填角色名进入反串模式">
          <small class="field-label">若填入角色名，系统将绑定于该角色（主角金手指），宿主为旁观者</small>
        </div>
      </div>

      <div class="origin-settings-card">
        <div class="origin-card-title">人格与口吻</div>
        <div class="origin-setting-item">
          <label class="field-label">系统人格风格</label>
          <select name="personality">
            ${personas.map(p => `<option value="${p}" ${origin.personality === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="origin-setting-item">
          <label class="field-label">自定义口吻（选填，留空则使用预设风格）</label>
          <textarea name="personaText" rows="3" placeholder="例如：毒舌腹黑，习惯在任务说明里夹带私货嘲弄宿主...">${escape(origin.personaText || '')}</textarea>
        </div>
      </div>

      <div class="origin-settings-card">
        <div class="origin-card-title">任务机制</div>
        <div class="origin-setting-item">
          <label class="field-label">任务派发频率 (每 N 回合)</label>
          <input type="number" name="freq" min="1" max="20" value="${origin.freq || 3}">
        </div>
        <div class="origin-setting-item">
          <label class="field-label">打破第四面墙吐槽概率 (%)</label>
          <input type="number" name="fourthWall" min="0" max="100" value="${origin.fourthWall || 0}">
        </div>
        <label class="compact-switch-row" style="margin-top: 4px;">
          <span>未完成主线时阻断新任务</span>
          <span class="switch">
            <input type="checkbox" name="blockWhenUnfinished" role="switch" aria-label="未完成主线时阻断新任务" ${origin.blockWhenUnfinished !== false ? 'checked' : ''}>
            <span></span>
          </span>
        </label>
      </div>

      <div class="origin-settings-card">
        <div class="origin-card-title">正文注入模块与提示词定制</div>
        <small class="field-label" style="display:block;margin-bottom:6px;color:var(--pp-muted);">
          自由选择哪些系统模块注入主聊天正文；展开可编辑该模块的提示词模板（留空则使用内置默认格式）。
        </small>
        ${renderOriginSectionsSettings(origin.sections || {})}
      </div>

      <div class="origin-settings-card">
        <div class="origin-card-title">各模块独立捕获标签 (自定义 XML 标签别名)</div>
        <small class="field-label" style="display:block;margin-bottom:8px;color:var(--pp-muted);">
          支持正文中分散包裹各模块数据（如 &lt;成就&gt;千人斩|击败强敌&lt;/成就&gt;、&lt;属性&gt;力量+2&lt;/属性&gt;）。底层采用<strong>单次线性扫描 (Single-Pass)</strong>技术，一次遍历同时识别并剥离全部标签，零性能负担。多个别名用逗号或斜杠隔开。
        </small>
        <div class="origin-module-tags-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:8px;">
          <div class="origin-setting-item">
            <label class="field-label">成就模块标签</label>
            <input type="text" name="moduleTag_achievement" value="${escape(origin.moduleTags?.achievement ?? '成就, achievement, 功业')}" placeholder="成就, achievement, 功业">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">技能模块标签</label>
            <input type="text" name="moduleTag_skill" value="${escape(origin.moduleTags?.skill ?? '技能, skill, 神通, 功法')}" placeholder="技能, skill, 神通, 功法">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">属性模块标签</label>
            <input type="text" name="moduleTag_stat" value="${escape(origin.moduleTags?.stat ?? '属性, stat, 状态, 数值')}" placeholder="属性, stat, 状态, 数值">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">任务模块标签</label>
            <input type="text" name="moduleTag_task" value="${escape(origin.moduleTags?.task ?? '任务, task, 使命')}" placeholder="任务, task, 使命">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">积分模块标签</label>
            <input type="text" name="moduleTag_points" value="${escape(origin.moduleTags?.points ?? '积分, points, 经验')}" placeholder="积分, points, 经验">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">道具模块标签</label>
            <input type="text" name="moduleTag_item" value="${escape(origin.moduleTags?.item ?? '道具, item, 获得, 物品')}" placeholder="道具, item, 获得, 物品">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">权限模块标签</label>
            <input type="text" name="moduleTag_perk" value="${escape(origin.moduleTags?.perk ?? '权限, perk, 特权')}" placeholder="权限, perk, 特权">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">播报模块标签</label>
            <input type="text" name="moduleTag_broadcast" value="${escape(origin.moduleTags?.broadcast ?? '播报, notice, 公告, 系统提示')}" placeholder="播报, notice, 公告, 系统提示">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">私聊模块标签</label>
            <input type="text" name="moduleTag_chat" value="${escape(origin.moduleTags?.chat ?? '私聊, chat, 系统私聊')}" placeholder="私聊, chat, 系统私聊">
          </div>
          <div class="origin-setting-item">
            <label class="field-label">综合数据块标签</label>
            <input type="text" name="moduleTag_origin" value="${escape(origin.moduleTags?.origin ?? 'origin, 系统')}" placeholder="origin, 系统">
          </div>
        </div>
      </div>

      <div class="origin-settings-card">
        <div class="origin-card-title">正文侦听与标签正则设置</div>
        <div class="origin-setting-item">
          <label class="field-label">自然播报匹配正则 (自定义)</label>
          <input type="text" name="storyRegex" value="${escape(origin.storyRegex ?? '【(?:叮[！!]|系统).*?】')}" placeholder="例如：【(?:叮[！!]|系统).*?】">
          <small class="field-label">从故事正文中自动捕获自然语气的系统播报（如【叮！触发支线任务：...】）</small>
        </div>
        <div class="origin-setting-item" style="margin-top: 8px;">
          <label class="field-label">标签包裹匹配正则 (自定义)</label>
          <input type="text" name="tagRegex" value="${escape(origin.tagRegex ?? '<(?:origin|系统)>([\\s\\S]*?)</(?:origin|系统)>')}" placeholder="例如：<(?:origin|系统)>([\\s\\S]*?)</(?:origin|系统)>">
          <small class="field-label">从故事正文中提取特定标签包裹的结构化数据块（不局限于 &lt;origin&gt;，支持自定义为 &lt;系统&gt; 或任意 XML 标签）</small>
        </div>
      </div>

      <div class="origin-setting-actions">
        <button type="submit" class="save-button">保存设置</button>
        <button type="button" class="quiet-button danger" data-action="origin-reset-data" title="仅重置任务、属性、背包、商城、祈愿、成就与日志，正文注入与提示词定制等设置将保持稳定">重置系统数据</button>
      </div>
    </form>
  </div>`;
}

// ---------------- 模态框 (任务编辑 / 祈愿结果 / 期望方向) ----------------
function renderOriginModals(ui, origin) {
  if (ui.originModal === 'conceive-shop-guidance') {
    const isBusy = Boolean(ui.isConceivingShop);
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="AI批量进货引导">
        <header class="origin-modal-head">
          <h3>商城 AI 批量进货</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭" ${isBusy ? 'disabled' : ''}>${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="conceive-shop">
          <p class="origin-modal-tip" style="margin:0 0 10px 0;font-size:12px;color:var(--pp-muted);line-height:1.5;">
            系统将结合当前剧情世界观，自动构想并批量进货 8~12 种新商品上架。可在此输入你的进货偏好进行针对性引导（可留空由系统自主推演）：
          </p>
          <label>期望商品流派 / 进货引导（选填）</label>
          <textarea name="direction" rows="3" placeholder="例如：主打回复丹药、破境灵草、高阶护身法宝、暗器毒药，或赛博强化模块…" ${isBusy ? 'disabled' : ''}></textarea>
          
          ${isBusy ? `
            <div class="origin-eval-loading-state" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 6px;margin-top:6px;font-size:12.5px;color:var(--pp-active);background:var(--pp-pale);border-radius:8px;">
              <span class="origin-loading-spinner"></span>
              <span>系统核心正在进货推演中，请稍候...</span>
            </div>
          ` : ''}

          <div class="origin-modal-btns" style="margin-top:12px;">
            <button type="button" class="quiet-button" data-action="origin-close-modal" ${isBusy ? 'disabled' : ''}>取消</button>
            <button type="submit" class="save-button" ${isBusy ? 'disabled' : ''}>
              ${isBusy ? '正在进货中...' : '开始批量进货'}
            </button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'conceive-gacha-guidance') {
    const isBusy = Boolean(ui.isConceivingGacha);
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="AI构想奖池引导">
        <header class="origin-modal-head">
          <h3>祈愿池 AI 构想扩充</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭" ${isBusy ? 'disabled' : ''}>${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="conceive-gacha">
          <p class="origin-modal-tip" style="margin:0 0 10px 0;font-size:12px;color:var(--pp-muted);line-height:1.5;">
            系统将结合当前世界观，构想 8~15 种涵盖各品阶（N/R/SR/SSR/UR）的稀有奖品扩充入库。可在此输入期望的奖池风格偏好（可留空）：
          </p>
          <label>期望奖品流派 / 奖池偏好（选填）</label>
          <textarea name="direction" rows="3" placeholder="例如：主修剑道相关的无上飞剑、改命级神品特权、异界召唤券、极品洗髓灵丹…" ${isBusy ? 'disabled' : ''}></textarea>
          
          ${isBusy ? `
            <div class="origin-eval-loading-state" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 6px;margin-top:6px;font-size:12.5px;color:var(--pp-active);background:var(--pp-pale);border-radius:8px;">
              <span class="origin-loading-spinner"></span>
              <span>系统核心正在推演构想奖池中，请稍候...</span>
            </div>
          ` : ''}

          <div class="origin-modal-btns" style="margin-top:12px;">
            <button type="button" class="quiet-button" data-action="origin-close-modal" ${isBusy ? 'disabled' : ''}>取消</button>
            <button type="submit" class="save-button" ${isBusy ? 'disabled' : ''}>
              ${isBusy ? '正在构想中...' : '开始构想奖池'}
            </button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'evaluate-stats-guidance') {
    const isBusy = Boolean(ui.isEvaluatingStats);
    const hasStats = Array.isArray(origin.stats) && origin.stats.length > 0;
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="智能构想与成长评估">
        <header class="origin-modal-head">
          <h3>${hasStats ? '智能成长评估与结算' : '智能构想能力面板'}</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭" ${isBusy ? 'disabled' : ''}>${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="evaluate-stats">
          <p class="origin-modal-tip" style="margin:0 0 10px 0;font-size:12px;color:var(--pp-muted);line-height:1.5;">
            ${hasStats
              ? '系统核心将结合最近的剧情经历，全盘推演角色的属性提升、技能领悟与特权突破。可输入你的成长期望或流派偏好进行针对性引导（可留空由系统自主推演）：'
              : '系统核心将结合最近剧情与世界观，为宿主全新构想初始属性、技能与特权面板。可输入你的流派偏好（如剑修、魔法师、高敏捷暗杀等，也可留空）：'}
          </p>
          <label>期望流派 / 构想引导偏好（选填）</label>
          <textarea name="direction" rows="3" placeholder="例如：主修剑道、悟性极高、身手矫健敏捷、希望能领悟御剑术相关的技能或特权…" ${isBusy ? 'disabled' : ''}></textarea>
          
          ${isBusy ? `
            <div class="origin-eval-loading-state" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 6px;margin-top:6px;font-size:12.5px;color:var(--pp-active);background:var(--pp-pale);border-radius:8px;">
              <span class="origin-loading-spinner"></span>
              <span>系统核心正在推演构想中，请稍候...</span>
            </div>
          ` : ''}

          <div class="origin-modal-btns" style="margin-top:12px;">
            <button type="button" class="quiet-button" data-action="origin-close-modal" ${isBusy ? 'disabled' : ''}>取消</button>
            <button type="submit" class="save-button" ${isBusy ? 'disabled' : ''}>
              ${isBusy ? '正在推演中...' : (hasStats ? '开始成长评估' : '开始智能构想')}
            </button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'edit-stat') {
    const stat = ui.originModalData || {};
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="新增数值属性">
        <header class="origin-modal-head">
          <h3>新增角色属性</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="stat">
          <label>属性名称</label>
          <input type="text" name="name" value="${escape(stat.name || '')}" required placeholder="例如：力量、敏捷、灵力、神识、智力">
          <label>初始数值</label>
          <input type="number" name="val" value="${stat.val !== undefined && stat.val !== null ? stat.val : 10}" required placeholder="建议 10 左右">
          <div class="origin-modal-btns" style="margin-top:12px;">
            <button type="button" class="quiet-button" data-action="origin-close-modal">取消</button>
            <button type="submit" class="save-button">保存属性</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'edit-perk') {
    const perk = ui.originModalData || {};
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="编辑永久特权">
        <header class="origin-modal-head">
          <h3>${perk.name ? '编辑特权' : '新增永久特权'}</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="perk">
          <label>特权名称</label>
          <input type="text" name="name" value="${escape(perk.name || '')}" required placeholder="例如：天道庇佑、商城八折、过目不忘">
          <label>特权效果说明</label>
          <textarea name="desc" rows="2" placeholder="永久特权的被动效果或叙事指引">${escape(perk.desc || '')}</textarea>
          <div class="origin-modal-btns" style="margin-top:12px;">
            <button type="button" class="quiet-button" data-action="origin-close-modal">取消</button>
            <button type="submit" class="save-button">保存特权</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'edit-skill') {
    const skill = ui.originModalData || {};
    const hasExp = Boolean(skill.expMax !== null && skill.expMax !== undefined && skill.expMax !== '');
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="编辑技能">
        <header class="origin-modal-head">
          <h3>${skill.name ? '编辑技能' : '新增技能'}</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="skill">
          <label>技能名称</label>
          <input type="text" name="name" value="${escape(skill.name || '')}" required placeholder="例如：御剑术、三昧真火">
          
          <label>技能描述</label>
          <textarea name="desc" rows="2" placeholder="技能功用、招式描述或特殊威力">${escape(skill.desc || '')}</textarea>
          
          <label class="compact-switch-row" style="margin-top: 8px;">
            <span>启用等级与熟练度经验条</span>
            <span class="switch">
              <input type="checkbox" name="hasExp" role="switch" aria-label="启用等级与熟练度经验条" ${hasExp ? 'checked' : ''}>
              <span></span>
            </span>
          </label>
          <small class="field-label" style="display:block;margin-bottom:6px;color:var(--pp-muted);">
            关闭则保持纯文字词条；开启后将显示实时熟练度进度条，正文输出 &lt;技能&gt;技能名+20&lt;/技能&gt; 可自动增加熟练度并晋级。
          </small>

          <div class="origin-skill-exp-fields" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:4px;">
            <div>
              <label>当前等级</label>
              <input type="number" name="level" min="1" value="${skill.level || 1}">
            </div>
            <div>
              <label>当前经验</label>
              <input type="number" name="exp" min="0" value="${skill.exp || 0}">
            </div>
            <div>
              <label>升级所需上限</label>
              <input type="number" name="expMax" min="1" value="${skill.expMax || 100}">
            </div>
          </div>

          <div class="origin-modal-btns" style="margin-top:12px;">
            <button type="button" class="quiet-button" data-action="origin-close-modal">取消</button>
            <button type="submit" class="save-button">保存技能</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'edit-task') {
    const task = ui.originModalData || {};
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="编辑任务">
        <header class="origin-modal-head">
          <h3>${task.id ? '编辑任务' : '发布新任务'}</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="task">
          <input type="hidden" name="id" value="${escape(task.id || '')}">
          <label>任务类型</label>
          <select name="type">
            <option value="主线" ${task.type === '主线' ? 'selected' : ''}>主线任务</option>
            <option value="支线" ${task.type === '支线' || !task.type ? 'selected' : ''}>支线任务</option>
            <option value="日常" ${task.type === '日常' ? 'selected' : ''}>日常任务</option>
          </select>
          <label>标题</label>
          <input type="text" name="title" value="${escape(task.title || '')}" required placeholder="任务标题">
          <label>目标条件</label>
          <input type="text" name="cond" value="${escape(task.cond || '')}" placeholder="完成的具体条件">
          <label>奖励描述</label>
          <input type="text" name="reward" value="${escape(task.reward || '')}" placeholder="例如：积分+300 魅力+2">
          <label>惩罚描述</label>
          <input type="text" name="penalty" value="${escape(task.penalty || '')}" placeholder="例如：积分-100">
          <label>时限回合数 (0为不限)</label>
          <input type="number" name="limit" min="0" value="${task.limit || 0}">
          <div class="origin-modal-btns">
            <button type="button" class="quiet-button" data-action="origin-close-modal">取消</button>
            <button type="submit" class="save-button">保存</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'gacha-result') {
    const results = ui.originModalData || [];
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog origin-gacha-result-dialog" role="dialog" aria-label="祈愿结果">
        <header class="origin-modal-head">
          <h3>祈愿降临</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <div class="origin-gacha-cards-flow">
          ${results.map(r => `<div class="origin-gacha-card-reveal tier-${r.tier || 'N'}">
            <span class="origin-tier-badge">${r.tier || 'N'}</span>
            <h4>${escape(r.name)}</h4>
            <p>${escape(r.desc || r.effect || '')}</p>
          </div>`).join('')}
        </div>
        <div class="origin-modal-btns">
          <button type="button" class="save-button" data-action="origin-close-modal">收入背包</button>
        </div>
      </div>
    </div>`;
  }

  if (ui.originModal === 'direction') {
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog" role="dialog" aria-label="设定任务方向">
        <header class="origin-modal-head">
          <h3>设定宿主期望任务方向</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <form class="origin-modal-form" data-origin-form="direction">
          <p class="origin-tip">给系统一个提示，AI 发布新任务时会尽可能结合此方向。</p>
          <textarea name="direction" rows="3" placeholder="例如：探查后山秘境、提升宗门好感度、搞钱经商">${escape(origin.direction || '')}</textarea>
          <div class="origin-modal-btns">
            <button type="button" class="quiet-button" data-action="origin-close-modal">取消</button>
            <button type="submit" class="save-button">设定</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  if (ui.originModal === 'shop-catalog') {
    const catalog = origin.shopCatalog || origin.shop || [];
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog origin-catalog-modal-dialog" role="dialog" aria-label="商品总库">
        <header class="origin-modal-head">
          <h3>商品总库 (${catalog.length}件)</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <p class="origin-tip">总库涵盖所有可用商品。商城“换一批”会随机抽取6件上架。</p>
        
        <div class="origin-catalog-scroll-list">
          ${catalog.length === 0 ? '<div class="origin-empty-placeholder"><p>总库为空，请点击 AI 批量进货或手动添加。</p></div>' : catalog.map(it => `<div class="origin-catalog-item-row">
            <div class="origin-catalog-item-info">
              <div class="origin-catalog-item-title">
                <strong>${escape(it.name)}</strong>
                <span class="origin-catalog-price">${icon('diamond')} ${it.price} 积分</span>
              </div>
              ${it.desc ? `<small class="origin-catalog-desc">${escape(it.desc)}</small>` : ''}
              ${it.effect ? `<small class="origin-catalog-effect">效果: ${escape(it.effect)}</small>` : ''}
            </div>
            <button type="button" class="icon-button danger" data-action="origin-delete-shop-item" data-item="${escape(it.name)}" title="从总库中删除" aria-label="删除">
              ${icon('close')}
            </button>
          </div>`).join('')}
        </div>

        <form class="origin-modal-form origin-catalog-add-form" data-origin-form="shop-item">
          <h4>添加新商品入库</h4>
          <div style="display:flex;gap:6px;">
            <input type="text" name="name" required placeholder="商品名" style="flex:2;">
            <input type="number" name="price" min="1" value="100" placeholder="积分" style="flex:1;">
          </div>
          <input type="text" name="desc" placeholder="简要描述">
          <input type="text" name="effect" placeholder="使用或持有效果">
          <button type="submit" class="save-button" style="margin-top:4px;">保存并加入总库</button>
        </form>

        <div class="origin-modal-btns">
          <button type="button" class="quiet-button" data-action="origin-close-modal">关闭</button>
        </div>
      </div>
    </div>`;
  }

  if (ui.originModal === 'gacha-catalog') {
    const catalog = origin.gachaCatalog || origin.gachaPool || [];
    const tiers = ['UR', 'SSR', 'SR', 'R', 'N'];
    return `<div class="origin-modal-backdrop" data-action="origin-close-modal">
      <div class="origin-modal-dialog origin-catalog-modal-dialog" role="dialog" aria-label="祈愿总库">
        <header class="origin-modal-head">
          <h3>祈愿奖池总库 (${catalog.length}件)</h3>
          <button type="button" class="icon-button" data-action="origin-close-modal" aria-label="关闭">${icon('close')}</button>
        </header>
        <p class="origin-tip">祈愿抽奖的完整奖池。祈愿将在此全库中按稀有度权重真实随机出目。</p>
        
        <div class="origin-catalog-scroll-list">
          ${catalog.length === 0 ? '<div class="origin-empty-placeholder"><p>奖池总库为空，请点击 AI 扩充奖池或手动添加。</p></div>' : tiers.map(tier => {
            const group = catalog.filter(it => (it.tier || 'N') === tier);
            if (group.length === 0) return '';
            return `<div class="origin-catalog-tier-group tier-${tier}">
              <div class="origin-catalog-tier-label">${tier} 级奖品 (${group.length}件)</div>
              ${group.map(it => `<div class="origin-catalog-item-row">
                <div class="origin-catalog-item-info">
                  <div class="origin-catalog-item-title">
                    <span class="origin-tier-badge">${tier}</span>
                    <strong>${escape(it.name)}</strong>
                    <span class="origin-catalog-weight">权重:${it.weight ?? 10}</span>
                  </div>
                  ${it.desc ? `<small class="origin-catalog-desc">${escape(it.desc)}</small>` : ''}
                  ${it.effect ? `<small class="origin-catalog-effect">效果: ${escape(it.effect)}</small>` : ''}
                </div>
                <button type="button" class="icon-button danger" data-action="origin-delete-gacha-item" data-item="${escape(it.name)}" title="从奖池中删除" aria-label="删除">
                  ${icon('close')}
                </button>
              </div>`).join('')}
            </div>`;
          }).join('')}
        </div>

        <form class="origin-modal-form origin-catalog-add-form" data-origin-form="gacha-item">
          <h4>添加新奖品入库</h4>
          <div style="display:flex;gap:6px;">
            <input type="text" name="name" required placeholder="奖品名" style="flex:2;">
            <select name="tier" style="flex:1;">
              <option value="N">N</option>
              <option value="R" selected>R</option>
              <option value="SR">SR</option>
              <option value="SSR">SSR</option>
              <option value="UR">UR</option>
            </select>
            <input type="number" name="weight" min="1" value="10" placeholder="权重" style="flex:1;">
          </div>
          <input type="text" name="desc" placeholder="简要描述">
          <input type="text" name="effect" placeholder="效果说明">
          <button type="submit" class="save-button" style="margin-top:4px;">保存并加入奖池</button>
        </form>

        <div class="origin-modal-btns">
          <button type="button" class="quiet-button" data-action="origin-close-modal">关闭</button>
        </div>
      </div>
    </div>`;
  }

  return '';
}
