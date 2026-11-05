import { action, empty, escape, icon, pageHeading } from './shared.js';
import { taskRemainingTurns, resolvePersona } from '../origin-engine.js';

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
      <div class="origin-task-title-group">
        <span class="origin-tag tg-${escape(task.type || '支线')}">${escape(task.type || '支线')}</span>
        <h3 class="origin-task-title">${escape(task.title)}</h3>
      </div>
      <div class="origin-task-header-meta">
        ${task.status === 'active' && rem !== null ? `<span class="origin-timer-chip ${isUrgent ? 'is-urgent' : ''}">${icon('clock')} <span>剩 ${rem} 回合</span></span>` : ''}
        <span class="origin-status-badge is-${task.status}">${task.status === 'active' ? '进行中' : task.status === 'done' ? '已达成' : '已失败'}</span>
      </div>
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

  return `<div class="origin-stats-view">
    <section class="origin-section">
      <div class="origin-section-header">
        <h4>角色数值属性</h4>
        <div class="origin-section-actions" style="display:flex;gap:6px;">
          <button type="button" class="icon-button" data-action="origin-ai-evaluate-stats" title="AI评估成长" aria-label="AI评估成长">${icon('sparkles')}</button>
          <button type="button" class="icon-button" data-action="origin-add-stat" title="新增属性" aria-label="新增属性">${icon('plus')}</button>
        </div>
      </div>
      <div class="origin-stats-grid">
        ${stats.length === 0 ? '<p class="origin-empty-text">暂无属性记录</p>' : stats.map(s => `<div class="origin-stat-card">
          <span class="origin-stat-name">${escape(s.name)}</span>
          <div class="origin-stat-controls">
            <button type="button" class="origin-stat-btn" data-action="origin-mod-stat" data-stat="${escape(s.name)}" data-delta="-1">-</button>
            <strong class="origin-stat-val">${s.val}</strong>
            <button type="button" class="origin-stat-btn" data-action="origin-mod-stat" data-stat="${escape(s.name)}" data-delta="1">+</button>
          </div>
        </div>`).join('')}
      </div>
    </section>

    <section class="origin-section">
      <div class="origin-section-header">
        <h4>已解锁永久特权 / 权限</h4>
      </div>
      <div class="origin-perks-list">
        ${perks.length === 0 ? '<p class="origin-empty-text">暂无特权</p>' : perks.map(p => `<div class="origin-perk-card">
          <div class="origin-perk-name">${icon('sparkles')} <span>${escape(p.name)}</span></div>
          ${p.desc ? `<div class="origin-perk-desc">${escape(p.desc)}</div>` : ''}
        </div>`).join('')}
      </div>
    </section>

    <section class="origin-section">
      <div class="origin-section-header">
        <h4>掌握的技能 / 异能</h4>
      </div>
      <div class="origin-skills-list">
        ${skills.length === 0 ? '<p class="origin-empty-text">暂无已掌握技能</p>' : skills.map(sk => `<div class="origin-skill-card">
          <div class="origin-skill-name">${icon('lightning')} <span>${escape(sk.name)}</span></div>
          ${sk.desc ? `<div class="origin-skill-desc">${escape(sk.desc)}</div>` : ''}
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
        <button type="button" class="save-button" data-action="origin-use-item" data-item="${escape(item.name)}">
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
        <button type="button" class="icon-button" data-action="origin-ai-conceive-shop" title="AI批量进货（结合剧情世界观构想新商品）" aria-label="AI进货">
          ${icon('sparkles')}
        </button>
        <button type="button" class="icon-button" data-action="origin-open-shop-catalog" title="商品总库 (${catalog.length || shop.length}件)" aria-label="商品总库">
          ${icon('cards')}
        </button>
      </div>
    </div>

    <div class="origin-shop-grid">
      ${shop.map(item => {
        const canBuy = points >= item.price;
        return `<div class="origin-shop-card">
          <div class="origin-shop-card-head">
            <h4>${escape(item.name)}</h4>
            <span class="origin-shop-price">${icon('diamond')} <span>${item.price} 积分</span></span>
          </div>
          ${item.desc ? `<p class="origin-shop-desc">${escape(item.desc)}</p>` : ''}
          ${item.effect ? `<div class="origin-shop-effect">效果: ${escape(item.effect)}</div>` : ''}
          <button type="button" class="save-button ${canBuy ? '' : 'is-disabled'}" data-action="origin-buy-item" data-item="${escape(item.name)}" ${canBuy ? '' : 'disabled'}>
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
  const canSingle = points >= cost;
  const canTen = points >= cost * 10;

  return `<div class="origin-gacha-view">
    <div class="origin-gacha-hero">
      <div class="origin-gacha-sparkles">${icon('sparkles')}</div>
      <h2>万象祈愿池</h2>
      <p>消耗系统积分，抽取神秘奇物与改命特权</p>
    </div>

    <div class="origin-gacha-controls">
      <button type="button" class="save-button ${canSingle ? '' : 'is-disabled'}" data-action="origin-draw-gacha" data-count="1" ${canSingle ? '' : 'disabled'}>
        单次祈愿 (${cost} 积分)
      </button>
      <button type="button" class="save-button ${canTen ? '' : 'is-disabled'}" data-action="origin-draw-gacha" data-count="10" ${canTen ? '' : 'disabled'}>
        十连祈愿 (${cost * 10} 积分)
      </button>
    </div>

    <section class="origin-section origin-pool-preview">
      <div class="origin-pool-preview-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="margin:0;">当前轮换预览</h4>
        <div class="origin-icon-bar" style="display:flex;gap:4px;align-items:center;">
          <button type="button" class="icon-button" data-action="origin-refresh-gacha" title="轮换奖池预览" aria-label="轮换奖池">
            ${icon('refresh')}
          </button>
          <button type="button" class="icon-button" data-action="origin-ai-conceive-gacha" title="AI结合剧情世界观批量构想新奖品并扩充奖池" aria-label="AI扩充奖池">
            ${icon('sparkles')}
          </button>
          <button type="button" class="icon-button" data-action="origin-open-gacha-catalog" title="祈愿奖池总库 (${catalog.length || pool.length}件)" aria-label="奖池总库">
            ${icon('cards')}
          </button>
        </div>
      </div>
      <div class="origin-pool-list">
        ${pool.map(item => `<div class="origin-pool-item tier-${item.tier || 'N'}">
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

// ---------------- 设置页 ----------------
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
        <button type="button" class="quiet-button danger" data-action="origin-reset-data">重置系统数据</button>
      </div>
    </form>
  </div>`;
}

// ---------------- 模态框 (任务编辑 / 祈愿结果 / 期望方向) ----------------
function renderOriginModals(ui, origin) {
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
