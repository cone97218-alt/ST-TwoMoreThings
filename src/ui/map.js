import { avatar, escape, icon, pageHeading } from './shared.js';
import {
  MAP_BASEMAPS,
  MAP_FACILITY_TAGS,
  QIANCHUANG_BASEMAPS,
  QIANCHUANG_MAP_ASSETS,
  CITY_MAPS,
  listBasemapOptions,
  createGenericMapLoader,
  createCityMapLoader,
  qianchuangIcon,
} from '../map-engine.js';
import { displayName } from '../profiles.js';

const ROLE_LABELS = {
  area: '分区',
  site: '场所',
  interior: '室内',
};

// 外部高精底图 (assets/maps-library/*.svg) 与真实城市底图 (assets/maps-real/*.svg) 异步加载缓存
const loadedSvgMarkupCache = new Map();
const pendingSvgLoads = new Set();

let genericMapLoader = null;
let cityMapLoader = null;

function stripOuterSvgTag(svgText = '') {
  const raw = String(svgText || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim();
}

function requestExternalBasemapSvg(assetId) {
  if (!assetId || loadedSvgMarkupCache.has(assetId) || pendingSvgLoads.has(assetId)) {
    return;
  }
  if (typeof globalThis.window === 'undefined' || typeof globalThis.fetch !== 'function') {
    return;
  }
  const isCity = Boolean(CITY_MAPS[assetId]);
  const isLibrary = Boolean(QIANCHUANG_MAP_ASSETS[assetId]);
  if (!isCity && !isLibrary) return;

  try {
    if (isCity && !cityMapLoader) {
      cityMapLoader = createCityMapLoader();
    }
    if (isLibrary && !genericMapLoader) {
      genericMapLoader = createGenericMapLoader();
    }
    const loader = isCity ? cityMapLoader : genericMapLoader;
    if (!loader) return;

    pendingSvgLoads.add(assetId);
    Promise.resolve(loader(assetId))
      .then(svgText => {
        pendingSvgLoads.delete(assetId);
        const inner = stripOuterSvgTag(svgText);
        if (inner) {
          loadedSvgMarkupCache.set(assetId, inner);
          if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            globalThis.dispatchEvent(new CustomEvent('st-tmt-map-svg-loaded', { detail: { assetId } }));
          }
        }
      })
      .catch(() => {
        pendingSvgLoads.delete(assetId);
      });
  } catch {
    pendingSvgLoads.delete(assetId);
  }
}

function renderPolygonPoints(points = [], vbWidth = 1000, vbHeight = 1000) {
  const sx = vbWidth / 100;
  const sy = vbHeight / 100;
  return points.map(([x, y]) => `${Math.round(x * sx * 10) / 10},${Math.round(y * sy * 10) / 10}`).join(' ');
}

function renderTrajectoryPathSvg(trajectory = [], vbWidth = 1000, vbHeight = 1000) {
  if (!Array.isArray(trajectory) || trajectory.length < 2) return '';
  const pts = trajectory.map(t => [t.x * vbWidth / 100, t.y * vbHeight / 100]);
  let d = `M ${Math.round(pts[0][0])},${Math.round(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    d += ` Q ${Math.round(prev[0])},${Math.round(curr[1])} ${Math.round(curr[0])},${Math.round(curr[1])}`;
  }
  return d;
}

function renderTrajectoryMarkersSvg(trajectory = [], vbWidth = 1000, vbHeight = 1000) {
  if (!Array.isArray(trajectory) || trajectory.length < 2) return '';
  return trajectory.map(t => {
    const cx = Math.round(t.x * vbWidth / 100);
    const cy = Math.round(t.y * vbHeight / 100);
    return `
      <g class="qc-trajectory-milestone" transform="translate(${cx}, ${cy})">
        <circle r="12" class="qc-traj-bg"/>
        <text text-anchor="middle" dominant-baseline="central" class="qc-traj-num">${t.step}</text>
      </g>
    `;
  }).join('');
}

function renderSiteAvatarCluster(characters = []) {
  if (!Array.isArray(characters) || !characters.length) return '';
  const visible = characters.slice(0, 2);
  const extraCount = characters.length - visible.length;
  return `
    <span class="qc-pin-avatar-cluster" title="${escape(characters.map(c => `${c.role}：${c.name}`).join('、'))}">
      ${visible.map(c => `
        <span class="qc-cluster-avatar ${c.isUser ? 'is-user' : 'is-npc'}" data-role="${escape(c.role || '')}">
          ${avatar({ name: c.name, avatar: c.avatar }, true)}
        </span>
      `).join('')}
      ${extraCount > 0 ? `<span class="qc-cluster-more">+${extraCount}</span>` : ''}
    </span>
  `;
}

function renderExpandedAvatarCard(site) {
  const characters = site.charactersHere || [];
  if (!characters.length) return '';
  return `
    <div class="qc-pin-avatar-card" role="dialog" aria-label="${escape(site.name)}在场人员">
      <div class="qc-avatar-card-head">
        <strong class="qc-avatar-card-title">${escape(site.name)}</strong>
        <span class="qc-avatar-card-badge">${characters.length}人在此</span>
      </div>
      <div class="qc-avatar-card-list">
        ${characters.map(c => `
          <div class="qc-avatar-card-item ${c.isUser ? 'is-user' : ''}">
            <div class="qc-card-avatar-wrap">
              ${avatar({ name: c.name, avatar: c.avatar }, true)}
            </div>
            <div class="qc-card-avatar-info">
              <span class="qc-card-char-name">
                <b>${escape(c.name)}</b>
                <small class="qc-badge role-${c.isUser ? 'user' : 'npc'}">${escape(c.role || '在场')}</small>
              </span>
              ${c.relation ? `<small class="qc-card-char-rel">${escape(c.relation)}</small>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPlaceBadges(place) {
  const badges = [];
  if (place.isCurrent) {
    badges.push('<span class="qc-badge is-current">当前所在</span>');
  }
  badges.push(`<span class="qc-badge role-${escape(place.role || 'site')}">${escape(ROLE_LABELS[place.role] || '场所')}</span>`);
  if (place.source === 'baibai') {
    badges.push('<span class="qc-badge is-baibai">柏宝书</span>');
  } else if (place.source === 'worldbook') {
    badges.push('<span class="qc-badge is-baibai">世界书</span>');
  }
  return badges.join('');
}

function renderFacilityTagList(place) {
  const facilityTags = Array.isArray(place.facilityTags) && place.facilityTags.length
    ? place.facilityTags
    : (Array.isArray(place.facilities)
      ? place.facilities.map(f => ({ key: f, label: f, svg: qianchuangIcon(f) }))
      : []);
  if (!facilityTags.length) return '';
  return `
    <div class="qc-tag-row">
      ${facilityTags.map(tag => `
        <span class="qc-facility-tag" data-facility-key="${escape(tag.key || tag.label)}">
          <span class="qc-facility-icon">${tag.svg || qianchuangIcon(tag.key || tag.label)}</span>
          <span>${escape(tag.label)}</span>
        </span>
      `).join('')}
    </div>
  `;
}

function renderPlaceMetaDetails(place, editMode = false) {
  const sections = [];
  if (place.desc) {
    sections.push(`<p class="qc-place-desc">${escape(place.desc)}</p>`);
  }
  const facHtml = renderFacilityTagList(place);
  if (facHtml) {
    sections.push(facHtml);
  }
  if (place.npcs?.length) {
    sections.push(`
      <div class="qc-meta-block">
        <span class="qc-meta-label">在场人物</span>
        <div class="qc-chip-list">
          ${place.npcs.map(npc => `
            <span class="qc-entity-chip is-npc" title="${escape([npc.title, npc.relation].filter(Boolean).join(' · '))}">
              <b>${escape(npc.name)}</b>
              ${npc.follow ? '<small>同行</small>' : npc.subPlaceName ? `<small>${escape(npc.subPlaceName)}</small>` : ''}
            </span>
          `).join('')}
        </div>
      </div>
    `);
  }
  if (place.items?.length) {
    sections.push(`
      <div class="qc-meta-block">
        <span class="qc-meta-label">存放物品</span>
        <div class="qc-chip-list">
          ${place.items.map(it => `
            <span class="qc-entity-chip is-item" title="${escape(it.desc || '')}">${escape(it.name)}</span>
          `).join('')}
        </div>
      </div>
    `);
  }
  if (place.todos?.length) {
    sections.push(`
      <div class="qc-meta-block">
        <span class="qc-meta-label">相关待办</span>
        <div class="qc-chip-list">
          ${place.todos.map(td => `
            <span class="qc-entity-chip is-todo">${escape(td.title)}</span>
          `).join('')}
        </div>
      </div>
    `);
  }
  if (place.relations?.length) {
    sections.push(`
      <div class="qc-meta-block">
        <span class="qc-meta-label">空间方位</span>
        <div class="qc-chip-list">
          ${place.relations.map(r => `
            <span class="qc-entity-chip">${escape(r.type || '邻近')}：${escape(r.targetName)}${r.note ? `（${escape(r.note)}）` : ''}</span>
          `).join('')}
        </div>
      </div>
    `);
  }
  if (place.interiors?.length) {
    sections.push(`
      <div class="qc-meta-block">
        <span class="qc-meta-label">内部空间</span>
        <div class="qc-interior-list">
          ${place.interiors.map(room => `
            <div class="qc-interior-item ${room.isCurrent ? 'is-current' : ''}">
              <div class="qc-interior-head">
                <strong>${escape(room.name)}</strong>
                ${room.isCurrent ? '<span class="qc-badge is-current">当前</span>' : ''}
                ${editMode ? `<div class="qc-interior-actions">
                  <button type="button" class="qc-mini-btn" data-action="set-map-current" data-place-id="${escape(room.id)}" title="定位到此室内">定位</button>
                  <button type="button" class="qc-mini-btn" data-action="edit-map-place" data-place-id="${escape(room.id)}" title="编辑">编辑</button>
                  <button type="button" class="qc-mini-btn danger" data-action="delete-map-place" data-place-id="${escape(room.id)}" title="删除">×</button>
                </div>` : ''}
              </div>
              ${room.desc ? `<small class="qc-interior-desc">${escape(room.desc)}</small>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `);
  }
  return sections.join('');
}

function renderPlaceCard(place, ui) {
  const editMode = Boolean(ui.mapEditMode);
  const isSelected = ui.mapSelectedPlaceId === place.id || place.isCurrent;
  const subSites = (place.subPlaces || []).filter(p => p.role !== 'interior');

  return `
    <details class="qc-place-card ${place.isCurrent ? 'is-current' : ''} ${ui.mapSelectedPlaceId === place.id ? 'is-selected' : ''}"
      data-place-card="${escape(place.id)}" ${isSelected || ui.mapSearch ? 'open' : ''}>
      <summary class="qc-place-summary" data-action="select-map-place" data-place-id="${escape(place.id)}">
        <div class="qc-place-title-row">
          <strong class="qc-place-name">${escape(place.name)}</strong>
          <div class="qc-place-badges">
            ${renderPlaceBadges(place)}
            ${place.npcs?.length ? `<span class="qc-pill-count is-npc" title="在场人物">${place.npcs.length}人</span>` : ''}
            ${place.todos?.length ? `<span class="qc-pill-count is-todo" title="待办事项">${place.todos.length}待办</span>` : ''}
          </div>
        </div>
      </summary>
      <div class="qc-place-body">
        ${renderPlaceMetaDetails(place, editMode)}
        <div class="qc-place-actions">
          ${editMode ? `<button type="button" class="qc-action-btn" data-action="set-map-current" data-place-id="${escape(place.id)}">
            ${place.isCurrent ? '已在当前位置' : '设为当前位置'}
          </button>` : ''}
          ${place.hasDrilldown ? `
            <button type="button" class="qc-action-btn primary" data-action="drill-map-scope" data-scope-id="${escape(place.id)}">
              进入分区 (${subSites.length})
            </button>
          ` : ''}
          ${editMode ? `<button type="button" class="qc-action-btn" data-action="open-map-form" data-parent-id="${escape(place.id)}">+ 子地点</button>
          <button type="button" class="qc-action-btn" data-action="edit-map-place" data-place-id="${escape(place.id)}">编辑</button>
          <button type="button" class="qc-action-btn danger" data-action="delete-map-place" data-place-id="${escape(place.id)}">删除</button>` : ''}
        </div>
        ${subSites.length ? `
          <div class="qc-subplaces-tree">
            ${subSites.map(sub => renderPlaceCard(sub, ui)).join('')}
          </div>
        ` : ''}
      </div>
    </details>
  `;
}

function renderBasemapSelectOptions(options, selectedId) {
  const groups = new Map();
  for (const opt of options) {
    const gKey = opt.groupLabel || '底图列表';
    const list = groups.get(gKey) || [];
    list.push(opt);
    groups.set(gKey, list);
  }
  return [...groups.entries()].map(([gLabel, list]) => `
    <optgroup label="${escape(gLabel)}">
      ${list.map(opt => `
        <option value="${escape(opt.id)}" ${selectedId === opt.id ? 'selected' : ''}>
          ${escape(opt.label)} — ${escape(opt.desc)}
        </option>
      `).join('')}
    </optgroup>
  `).join('');
}

export function renderMap(state, { ui, mapProjection, busy }) {
  const headingActions = `
    <button type="button" class="icon-button ${ui.mapEditMode ? 'is-active' : ''}" data-action="toggle-map-edit-mode" aria-pressed="${ui.mapEditMode ? 'true' : 'false'}" aria-label="编辑地点" title="${ui.mapEditMode ? '退出编辑' : '编辑地点'}">${icon('edit')}</button>
    <button type="button" class="icon-button" data-action="open-map-ai" aria-label="AI地图整理" title="AI 构想与整理地图">${icon('sparkles')}</button>
    <button type="button" class="icon-button" data-action="open-map-form" aria-label="新增地点" title="手动添加地点">${icon('plus')}</button>
    <button type="button" class="icon-button" data-action="open-map-settings" aria-label="地图设置" title="底图风格与定位设置">${icon('tuning')}</button>
  `;
  const heading = pageHeading('地图', headingActions);
  if (!mapProjection) return heading;

  const {
    basemap,
    basemapId,
    assetId: rawAssetId,
    basemapSelection,
    places,
    userPosition,
    sheets,
    activeSheetId,
    scopePlaceId,
    scopeNode,
    scopeBreadcrumb,
    layoutGroups,
    directoryTree,
    trajectory = [],
    baibaiConnected,
  } = mapProjection;

  const assetId = rawAssetId || basemap?.defaultAssetId || basemapId;
  requestExternalBasemapSvg(assetId);

  const loadedExternalSvg = loadedSvgMarkupCache.get(assetId) || '';
  const familyKey = (basemap?.family || basemapId) === 'old-town' ? 'town' : (basemap?.family || basemapId || 'modern');
  const inlineFallback = QIANCHUANG_BASEMAPS[familyKey] || QIANCHUANG_BASEMAPS.modern;

  const vbWidth = loadedExternalSvg ? (basemap?.width || 1000) : (inlineFallback.width || 1000);
  const vbHeight = loadedExternalSvg ? (basemap?.height || 1000) : (inlineFallback.height || 1000);
  const activeSvgInner = loadedExternalSvg || basemap?.svg || inlineFallback.markup;
  const isRealCity = Boolean(CITY_MAPS[assetId] || CITY_MAPS[basemapId]);

  const userAvatarHtml = avatar(
    state?.userProfile || { name: displayName(state?.userProfile || { name: ui.defaultUser || '我' }) },
    true,
  );

  // 1. 手动新增/编辑地点弹窗
  const draft = ui.mapDraft || {};
  const selectedFacilities = new Set(Array.isArray(draft.facilities) ? draft.facilities : []);
  const parentOptions = places.filter(p => p.id !== draft.id && p.role !== 'interior');
  const formModalHtml = ui.mapFormOpen ? `
    <div class="calendar-modal-backdrop" data-action="close-map-form">
      <form class="calendar-modal-dialog" data-map-form>
        <div class="calendar-form-head">
          <h4>${draft.id ? '编辑地点' : '新增地点'}</h4>
          <button type="button" class="icon-button" data-action="close-map-form" aria-label="关闭">${icon('close')}</button>
        </div>
        <input type="hidden" name="id" value="${escape(draft.id || '')}">
        <label class="field-label" for="map-f-name">地点名称</label>
        <input id="map-f-name" name="name" type="text" placeholder="如：归雁客栈 / 城西商业区 / 二楼雅间" value="${escape(draft.name || '')}" required maxlength="40">
        <div class="form-row">
          <div>
            <label class="field-label" for="map-f-role">层级类型</label>
            <select id="map-f-role" name="role">
              <option value="area" ${draft.role === 'area' ? 'selected' : ''}>分区 / 城区 (Area)</option>
              <option value="site" ${!draft.role || draft.role === 'site' ? 'selected' : ''}>具体场所 / 地标 (Site)</option>
              <option value="interior" ${draft.role === 'interior' ? 'selected' : ''}>室内 / 房间 (Interior)</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="map-f-parent">所属上级地点</label>
            <select id="map-f-parent" name="parentId">
              <option value="">（顶层独立节点）</option>
              ${parentOptions.map(p => `
                <option value="${escape(p.id)}" ${draft.parentId === p.id ? 'selected' : ''}>
                  ${escape(p.name)} (${ROLE_LABELS[p.role] || '场所'})
                </option>
              `).join('')}
            </select>
          </div>
        </div>
        <label class="field-label" for="map-f-desc">环境与场景描述（自动识别 177 类场所设施）</label>
        <textarea id="map-f-desc" name="desc" rows="2" placeholder="简述该地点的环境氛围、建筑特点或内置设施（如：带有独立卫浴和吧台，无厨房）..." maxlength="240">${escape(draft.desc || '')}</textarea>
        <label class="field-label">常用场所设施标签（点击可多选）</label>
        <div class="qc-facility-picker">
          ${MAP_FACILITY_TAGS.map(tag => `
            <button type="button" class="qc-facility-pick-btn ${selectedFacilities.has(tag.id) ? 'is-active' : ''}"
              data-action="toggle-map-draft-facility" data-facility="${escape(tag.id)}">
              <span class="qc-facility-icon">${qianchuangIcon(tag.icon)}</span>
              <span>${escape(tag.label)}</span>
            </button>
          `).join('')}
        </div>
        <input name="facilitiesCustom" type="text" placeholder="其他自定义设施标签（用逗号分隔，可选）"
          value="${escape([...selectedFacilities].filter(f => !MAP_FACILITY_TAGS.some(t => t.id === f)).join('，'))}" maxlength="60">
        <label class="compact-switch-row" style="margin-top: 6px;">
          <span>保存后将此地点设为当前所在位置</span>
          <span class="switch">
            <input name="setAsCurrent" type="checkbox" role="switch" ${draft.setAsCurrent ? 'checked' : ''}>
            <span></span>
          </span>
        </label>
        <div class="compact-switch-row" style="margin-top: 12px; justify-content: flex-end; gap: 8px;">
          <button type="button" class="quiet-button" data-action="close-map-form">取消</button>
          <button type="submit" class="save-button" style="margin-top: 0; width: auto; padding: 4px 16px;">保存地点</button>
        </div>
      </form>
    </div>
  ` : '';

  // 2. 底图风格与设置弹窗
  const basemapOptions = listBasemapOptions();
  const deletedCount = Array.isArray(state?.map?.deletedIds) ? state.map.deletedIds.length : 0;
  const activeAssetLabel = MAP_BASEMAPS[assetId]?.label || MAP_BASEMAPS[basemapId]?.label || '现代都市';
  const settingsModalHtml = ui.mapSettingsOpen ? `
    <div class="calendar-modal-backdrop" data-action="close-map-settings">
      <div class="calendar-modal-dialog">
        <div class="calendar-form-head">
          <h4>地图与底图设置</h4>
          <button type="button" class="icon-button" data-action="close-map-settings" aria-label="关闭">${icon('close')}</button>
        </div>
        <label class="field-label" for="map-s-basemap">选择底图视觉风格（含 6 大主题 / 10 座真实城市 / 24 款高精底图）</label>
        <select id="map-s-basemap" data-action="change-map-basemap">
          ${renderBasemapSelectOptions(basemapOptions, basemapSelection)}
        </select>
        <small class="field-label">当前激活底图：<strong>${escape(activeAssetLabel)}</strong></small>

        <div class="settings-sub-divider" style="margin: 12px 0;"></div>

        <label class="compact-switch-row">
          <span>将地图与位置线索带入聊天正文</span>
          <span class="switch">
            <input type="checkbox" role="switch" data-action="toggle-map-inject" ${state?.injectMapEnabled ? 'checked' : ''}>
            <span></span>
          </span>
        </label>
        <small class="field-label">开启后，当前所在地、所属分区与周边地标将自动作为背景线索提供给 AI。</small>

        ${userPosition.isManual ? `
          <div class="compact-switch-row" style="margin-top: 10px;">
            <span>当前位置已手动锁定为「${escape(userPosition.label)}」</span>
            <button type="button" class="quiet-button" data-action="clear-map-manual-location">恢复自动跟随剧情</button>
          </div>
        ` : ''}

        ${deletedCount > 0 ? `
          <div class="compact-switch-row" style="margin-top: 10px;">
            <span>已隐藏 ${deletedCount} 个自动同步场景</span>
            <button type="button" class="quiet-button" data-action="restore-deleted-map-places">全部恢复显示</button>
          </div>
        ` : ''}

        <div class="compact-switch-row" style="margin-top: 14px; justify-content: flex-end;">
          <button type="button" class="save-button" style="margin-top: 0; width: auto; padding: 4px 18px;" data-action="close-map-settings">完成</button>
        </div>
      </div>
    </div>
  ` : '';

  // 3. AI 地图构想与整理弹窗
  const isAiBusy = busy?.has?.('map-ai');
  const aiResults = ui.mapAiResults;
  const aiModalHtml = ui.mapAiModalOpen ? `
    <div class="calendar-modal-backdrop" data-action="close-map-ai">
      <div class="calendar-modal-dialog">
        <div class="calendar-form-head">
          <h4>AI 地图构想与整理</h4>
          <button type="button" class="icon-button" data-action="close-map-ai" aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="calendar-ai-body">
          <p class="calendar-ai-desc">结合世界书、近期剧情与柏宝书场景，自动梳理或构想「分区 → 场所 → 室内」三层地图结构，并匹配最契合的千窗底图与设施标签。</p>
          <div class="calendar-ai-inputs">
            <div>
              <label class="field-label" for="map-ai-instruction">补充指令或世界观重点（可选）</label>
              <input id="map-ai-instruction" type="text" placeholder="如：补齐王都四大坊市与主要店铺 / 构想赛博黑市周边据点" value="${escape(ui.mapAiInstruction || '')}">
            </div>
            <button type="button" class="save-button" data-action="run-map-ai" ${isAiBusy ? 'disabled' : ''}>
              ${isAiBusy ? '正在推演与绘制地图版图...' : '开始 AI 地图构想与整理'}
            </button>
          </div>
          ${Array.isArray(aiResults?.places) && aiResults.places.length ? `
            <div class="calendar-ai-results">
              <div class="qc-ai-summary-bar">
                <span>共构想 <strong>${aiResults.places.length}</strong> 处地点</span>
                ${aiResults.basemap && MAP_BASEMAPS[aiResults.basemap] ? `<span class="qc-badge">推荐底图：${escape(MAP_BASEMAPS[aiResults.basemap].label)}</span>` : ''}
              </div>
              <div class="calendar-ai-list">
                ${aiResults.places.map((item, idx) => `
                  <label class="calendar-ai-item">
                    <input type="checkbox" data-action="toggle-map-ai-item" data-index="${idx}" ${item.selected !== false ? 'checked' : ''}>
                    <div class="calendar-ai-item-info">
                      <strong>
                        ${escape(item.name)}
                        <span class="qc-badge role-${escape(item.role || 'site')}">${escape(ROLE_LABELS[item.role] || '场所')}</span>
                        ${item.parentName ? `<small>所属：${escape(item.parentName)}</small>` : ''}
                      </strong>
                      ${item.desc ? `<p>${escape(item.desc)}</p>` : ''}
                      ${item.facilities?.length ? `<small>设施：${escape(item.facilities.join('、'))}</small>` : ''}
                    </div>
                  </label>
                `).join('')}
              </div>
              <div class="compact-switch-row" style="margin-top: 10px; justify-content: space-between; gap: 8px;">
                <select id="map-ai-save-mode" style="width: auto; min-width: 130px;">
                  <option value="merge">合并补充现有地图</option>
                  <option value="replace">替换重置现有地图</option>
                </select>
                <button type="button" class="save-button" style="margin-top: 0; width: auto; padding: 4px 16px;" data-action="save-map-ai-results">应用选中地点</button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  ` : '';

  // 4. 顶部当前位置状态栏 + 多图幅切换 + 作用域面包屑
  const breadcrumbText = userPosition.breadcrumb?.length > 0
    ? userPosition.breadcrumb.map(b => b.name).join(' · ')
    : userPosition.label;

  const sheetsBarHtml = sheets.length > 1 ? `
    <div class="qc-sheets-bar" role="tablist" aria-label="区域图幅切换">
      ${sheets.map(sheet => `
        <button type="button" role="tab"
          class="qc-sheet-tab ${sheet.id === activeSheetId ? 'is-active' : ''}"
          aria-selected="${sheet.id === activeSheetId}"
          data-action="select-map-sheet" data-sheet-id="${escape(sheet.id)}">
          <span>${escape(sheet.title)}</span>
          <small>${sheet.count}</small>
        </button>
      `).join('')}
    </div>
  ` : '';

  const scopeBarHtml = scopeBreadcrumb.length > 1 ? `
    <nav class="qc-scope-breadcrumb" aria-label="地图层级导航">
      <button type="button" class="qc-crumb-btn" data-action="drill-map-scope" data-scope-id="">全图视野</button>
      ${scopeBreadcrumb.map((node, idx) => `
        <span class="qc-crumb-sep">/</span>
        <button type="button" class="qc-crumb-btn ${idx === scopeBreadcrumb.length - 1 ? 'is-current' : ''}"
          data-action="drill-map-scope" data-scope-id="${escape(node.id)}">
          ${escape(node.name)}
        </button>
      `).join('')}
    </nav>
  ` : '';

  // 5. 交互式千窗底图画布 (SVG 区域轮廓 + 锚点图钉 + 主角头像气泡)
  const regionPolysSvg = layoutGroups
    .filter(g => g.area && g.contours?.length)
    .map(g => {
      const isCurrentArea = g.area.isCurrent || g.sites?.some(s => s.isCurrent);
      const isSelectedArea = ui.mapSelectedPlaceId === g.area.id;
      return `
        <g class="qc-region-group ${isCurrentArea ? 'is-current' : ''} ${isSelectedArea ? 'is-selected' : ''}">
          ${g.contours.map(pts => `<polygon points="${renderPolygonPoints(pts, vbWidth, vbHeight)}" class="qc-region-poly"/>`).join('')}
        </g>
      `;
    })
    .join('');

  const areaLabelsHtml = layoutGroups
    .filter(g => g.area && g.labelBox)
    .map(g => {
      const { left, top, width, height } = g.labelBox;
      const isSelected = ui.mapSelectedPlaceId === g.area.id;
      return `
        <button type="button"
          class="qc-area-label ${g.area.isCurrent ? 'is-current' : ''} ${isSelected ? 'is-selected' : ''}"
          style="left:${left}%;top:${top}%;width:${width}%;min-height:${height}%"
          data-action="${g.area.hasDrilldown ? 'drill-map-scope' : 'select-map-place'}"
          data-scope-id="${escape(g.area.id)}"
          data-place-id="${escape(g.area.id)}"
          title="${escape(g.area.name)}${g.area.hasDrilldown ? '（点击进入分区）' : ''}">
          <span class="qc-area-label-text">${escape(g.area.name)}</span>
        </button>
      `;
    })
    .join('');

  const trajectorySvg = ui.mapShowTrajectory && trajectory.length >= 2
    ? `
      <g class="qc-trajectory-group">
        <path d="${renderTrajectoryPathSvg(trajectory, vbWidth, vbHeight)}" class="qc-trajectory-path"/>
        ${renderTrajectoryMarkersSvg(trajectory, vbWidth, vbHeight)}
      </g>
    `
    : '';

  const sitePinsHtml = layoutGroups
    .flatMap(g => g.sites || [])
    .map(site => {
      const isSelected = ui.mapSelectedPlaceId === site.id;
      const isCurrent = Boolean(site.isCurrent);
      const isExpanded = ui.mapExpandedAvatarPlaceId === site.id;
      const hasChars = Boolean(site.charactersHere?.length);
      const avatarClusterHtml = hasChars
        ? renderSiteAvatarCluster(site.charactersHere)
        : (isCurrent ? `<span class="qc-pin-avatar">${userAvatarHtml}</span>` : '');
      const expandedCardHtml = isExpanded ? renderExpandedAvatarCard(site) : '';

      return `
        <div class="qc-pin-wrapper" style="left:${site.x}%;top:${site.y}%;">
          <button type="button"
            class="qc-pin ${isCurrent ? 'is-current' : ''} ${isSelected ? 'is-selected' : ''} ${isExpanded ? 'is-expanded' : ''}"
            data-action="select-map-place"
            data-place-id="${escape(site.id)}"
            data-label-align="${site.labelAlign || 'center'}"
            data-label-above="${site.labelAbove ? 'true' : 'false'}"
            data-has-characters="${hasChars ? 'true' : 'false'}"
            aria-label="${escape(site.name)}${hasChars ? '，点击展开在场人物' : ''}">
            ${avatarClusterHtml}
            <span class="qc-pin-dot">
              ${site.todos?.length ? '<i class="qc-pin-badge is-todo"></i>' : ''}
              ${site.npcs?.length ? '<i class="qc-pin-badge is-npc"></i>' : ''}
            </span>
            <span class="qc-pin-label">${escape(site.name)}</span>
          </button>
          ${expandedCardHtml}
        </div>
      `;
    })
    .join('');

  return `
    ${heading}
    ${formModalHtml}
    ${settingsModalHtml}
    ${aiModalHtml}
    <div class="qc-map-page">
      <!-- 顶部主人公位置状态条 -->
      <div class="qc-position-bar">
        <div class="qc-position-info">
          <span class="qc-position-icon">${icon('location')}</span>
          <div class="qc-position-text">
            <small>
              当前位置
              ${baibaiConnected ? '<span class="qc-sync-tag">柏宝书已同步</span>' : ''}
              ${userPosition.isManual ? '<span class="qc-sync-tag is-manual">手动锁定</span>' : ''}
            </small>
            <strong>${escape(breadcrumbText)}</strong>
          </div>
        </div>
        ${userPosition.placeId ? `
          <button type="button" class="qc-locate-btn" data-action="locate-current-place" data-place-id="${escape(userPosition.placeId)}" data-sheet-id="${escape(userPosition.sheetId || '')}">
            定位
          </button>
        ` : ''}
      </div>

      ${sheetsBarHtml}
      ${scopeBarHtml}

      <!-- 交互式 SVG 底图视窗 -->
      <section class="qc-map-viewport" aria-label="${escape(scopeNode?.name || activeAssetLabel)}地图" data-basemap-id="${escape(basemapId)}" data-asset-id="${escape(assetId)}">
        <div class="qc-map-canvas" style="aspect-ratio: ${vbWidth} / ${vbHeight};">
          <svg viewBox="0 0 ${vbWidth} ${vbHeight}" class="qc-basemap-svg qc-theme-${escape(basemap?.family || basemapId)} ${isRealCity ? 'qqj-real-basemap' : ''}" aria-hidden="true">
            ${activeSvgInner}
            ${regionPolysSvg}
            ${trajectorySvg}
          </svg>
          <div class="qc-map-overlay">
            ${areaLabelsHtml}
            ${sitePinsHtml}
          </div>
        </div>
        <div class="qc-map-caption">
          <div class="qc-caption-left">
            <span>${escape(activeAssetLabel)}${isRealCity ? ' · © OpenStreetMap contributors · ODbL' : ''}</span>
            <span>${places.length ? `共 ${places.length} 处地点` : `点击右上角 <span class="qc-caption-sparkle">${icon('sparkles')}</span> 由 AI 自动构建地图`}</span>
          </div>
          <div class="qc-caption-actions">
            ${trajectory.length >= 2 ? `
              <button type="button" class="qc-caption-toggle-btn ${ui.mapShowTrajectory ? 'is-active' : ''}"
                data-action="toggle-map-trajectory" title="${ui.mapShowTrajectory ? '隐藏行动轨迹' : '显示剧情移动轨迹'}">
                ${icon('compass')} <span>行动轨迹 (${trajectory.length})</span>
              </button>
            ` : ''}
          </div>
        </div>
      </section>

      <!-- 搜索与分层折叠地点目录 -->
      <section class="qc-directory-section">
        <div class="qc-directory-toolbar">
          <input type="search" class="qc-search-input" placeholder="搜索地点、描述或 177 类设施标签..."
            value="${escape(ui.mapSearch || '')}" data-action="search-map-places">
          ${scopeBreadcrumb.length > 1 ? `
            <button type="button" class="qc-back-scope-btn" data-action="drill-map-scope" data-scope-id="${escape(scopeBreadcrumb[scopeBreadcrumb.length - 2]?.id || '')}">
              返回上级
            </button>
          ` : ''}
        </div>

        ${!directoryTree.length ? `
          <div class="qc-empty-box">
            <p>${ui.mapSearch ? `没有找到匹配「${escape(ui.mapSearch)}」的地点。` : '当前尚无场景地点数据。'}</p>
            <div class="qc-empty-actions">
              <button type="button" class="save-button" style="width:auto;padding:6px 16px;margin:0;gap:6px;" data-action="open-map-ai">${icon('sparkles')}<span>AI 自动整理地图</span></button>
              <button type="button" class="quiet-button" data-action="open-map-form">+ 手动添加地点</button>
            </div>
          </div>
        ` : `
          <div class="qc-directory-list">
            ${directoryTree.map(node => renderPlaceCard(node, ui)).join('')}
          </div>
        `}
      </section>
    </div>
  `;
}
