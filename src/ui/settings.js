import { renderModelPicker } from './models.js';
import { homeImage } from './home.js';
import { action, avatar, escape, icon, pageHeading, refKey } from './shared.js';
import { displayName } from '../profiles.js';
import { renderBackgroundPicker } from './backgrounds.js';
import { VERSION } from '../version.js';
import { getAllPrompts } from '../prompts.js';
import { DEFAULT_PROMPT_PRESETS, PRESET_SLOTS, normalizePromptPresets } from '../preset-engine.js';
import { readBaiBaiExcludeSettings } from '../worldbook.js';

export function renderPromptPresetSettings(state, ui) {
  const presets = normalizePromptPresets(state?.promptPresets);
  const activePresetId = state?.activePresetId || presets[0]?.id || 'default_preset';
  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];
  const entries = activePreset?.entries || [];
  const storyLayers = activePreset?.storyLayers || 1;

  return `<div class="preset-manager">
    <!-- 预设选择器栏 -->
    <div class="preset-header-card">
      <div class="preset-selector-row">
        <div class="preset-label-col">
          <label class="preset-card-label" for="preset-select">当前预设</label>
          <select id="preset-select" class="preset-select-clean" data-action="switch-prompt-preset">
            ${presets.map(p => `
              <option value="${escape(p.id)}" ${p.id === activePresetId ? 'selected' : ''}>${escape(p.name)}${p.isBuiltin ? ' · 内置' : ''}</option>
            `).join('')}
          </select>
        </div>
        <div class="preset-header-actions">
          <button type="button" class="preset-ghost-btn" data-action="export-prompt-preset" data-preset-id="${escape(activePreset.id)}" title="导出当前预设配置为 JSON 文件">导出</button>
          <button type="button" class="preset-ghost-btn" data-action="import-prompt-preset-btn" title="从 JSON 文件导入预设">导入</button>
          <input type="file" class="preset-import-file-input" style="display:none;" accept=".json" data-action="import-prompt-preset-file">
          <button type="button" class="preset-ghost-btn" data-action="open-new-preset-dialog">另存为</button>
          ${activePreset?.isBuiltin || activePreset?.id === 'default_preset' ? `<button type="button" class="preset-ghost-btn" data-action="reset-prompt-preset" data-preset-id="${escape(activePreset.id)}" title="重置当前预设为最新默认配置">重置</button>` : ''}
          ${!activePreset?.isBuiltin && activePreset?.id !== 'default_preset' ? `<button type="button" class="preset-ghost-btn danger" data-action="delete-prompt-preset" data-preset-id="${escape(activePreset.id)}">删除</button>` : ''}
        </div>
      </div>
      
      <!-- 主聊天层数输入框 -->
      <div class="preset-layers-row">
        <div class="preset-layers-head">
          <span class="preset-meta-label">主聊天历史提取</span>
          <div class="preset-layers-input-wrap">
            <input type="number" class="preset-number-clean" min="1" max="30" value="${storyLayers}" data-action="change-story-layers-input">
            <span class="preset-layers-unit">楼</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 预设条目列表 -->
    <div class="preset-entries-wrap">
      <div class="preset-section-head">
        <span class="preset-section-title">条目装配管线 <small>(${entries.length} 个条目)</small></span>
        <button type="button" class="preset-add-btn" data-action="add-preset-entry">+ 新增条目</button>
      </div>

      <div class="preset-cards-stack">
        ${!entries.length ? `<div class="preset-empty-hint">当前预设暂无条目，请点击上方按钮新增条目。</div>` : entries.map((entry, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === entries.length - 1;
          const isExpanded = ui.expandedPresetEntries instanceof Set ? ui.expandedPresetEntries.has(entry.id) : false;
          const scope = entry.scope || '通用';

          return `<div class="preset-item-card ${entry.enabled ? '' : 'is-muted'}" data-entry-id="${escape(entry.id)}">
            <div class="preset-item-header">
              <!-- 左侧：开关与折叠标题 -->
              <div class="preset-item-left">
                <label class="preset-checkbox-wrap" title="启用/禁用此条目">
                  <input type="checkbox" data-action="toggle-preset-entry" data-entry-id="${escape(entry.id)}" ${entry.enabled ? 'checked' : ''}>
                  <span class="preset-custom-check"></span>
                </label>
                <button type="button" class="preset-item-fold-trigger" data-action="toggle-preset-entry-fold" data-entry-id="${escape(entry.id)}">
                  <span class="preset-item-name">${escape(entry.name || '未命名条目')}</span>
                  <span class="preset-scope-pill ${scope === '通用' ? 'scope-common' : 'scope-app'}">${escape(scope)}</span>
                </button>
              </div>

              <!-- 右侧：角色选择与调序按钮 -->
              <div class="preset-item-controls">
                <button type="button" class="preset-role-cycle-btn role-${entry.role || 'system'}" data-action="cycle-entry-role" data-entry-id="${escape(entry.id)}" aria-label="切换身份(${entry.role || 'system'})" title="身份: ${entry.role || 'system'} (点击切换)">
                  ${icon(entry.role === 'user' ? 'role-user' : ['assistant', 'ai'].includes(entry.role) ? 'role-assistant' : 'role-system')}
                </button>
                <button type="button" class="preset-tool-btn" data-action="move-preset-entry" data-direction="up" data-entry-id="${escape(entry.id)}" ${isFirst ? 'disabled' : ''} title="上移">↑</button>
                <button type="button" class="preset-tool-btn" data-action="move-preset-entry" data-direction="down" data-entry-id="${escape(entry.id)}" ${isLast ? 'disabled' : ''} title="下移">↓</button>
                <button type="button" class="preset-tool-btn delete" data-action="delete-preset-entry" data-entry-id="${escape(entry.id)}" title="删除条目">×</button>
              </div>
            </div>

            <!-- 折叠编辑区域（默认折叠） -->
            ${isExpanded ? `
              <div class="preset-item-drawer">
                <div class="preset-edit-row">
                  <input type="text" class="preset-name-field" placeholder="条目显示名称" value="${escape(entry.name || '')}" data-action="edit-entry-name" data-entry-id="${escape(entry.id)}">
                  <div class="preset-scope-wrap">
                    <input type="text" list="preset-scope-options" class="preset-scope-field" placeholder="生效范围(如 通用、短信、日历+待办)" value="${escape(scope)}" data-action="edit-entry-scope" data-entry-id="${escape(entry.id)}">
                    <datalist id="preset-scope-options">
                      <option value="通用">全部任务通用</option>
                      <option value="短信">私聊短信生成</option>
                      <option value="群聊">群聊多角色续写</option>
                      <option value="通讯录">通讯录发掘与整理</option>
                      <option value="联系人">联系人线上风格提炼</option>
                      <option value="动态">Ainstagram 动态发布</option>
                      <option value="动态+短信">动态留言与角色互动</option>
                      <option value="论坛">公众论坛帖子与回帖</option>
                      <option value="日历">AI 节日构想</option>
                      <option value="日历+待办">日程推演与待办规划</option>
                      <option value="短信+待办">短信提取待办</option>
                      <option value="摘要">短信回流正文记忆摘要</option>
                      <option value="生图">照片转绘图描述提示词</option>
                    </datalist>
                  </div>
                </div>

                <div class="preset-macro-toolbar">
                  <span class="preset-macro-title">插入插槽：</span>
                  <div class="preset-macro-chips">
                    ${PRESET_SLOTS.map(s => `
                      <button type="button" class="preset-chip-btn" data-action="insert-slot-macro" data-entry-id="${escape(entry.id)}" data-macro="${escape(s.macro)}" title="${escape(s.desc)}">
                        ${escape(s.name)}
                      </button>
                    `).join('')}
                  </div>
                </div>

                <textarea class="preset-content-editor" rows="6" placeholder="输入提示词内容，可插入插槽宏..." data-action="edit-entry-content" data-entry-id="${escape(entry.id)}">${escape(entry.content || '')}</textarea>
              </div>
            ` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

export function renderPromptSettings(state, ui) {
  const activeTab = ui.promptSettingsTab || 'presets';
  return `<div class="prompts-outer-container">
    <div class="calendar-tabs" style="margin-bottom: 12px;">
      <button type="button" class="calendar-tab${activeTab === 'presets' ? ' is-active' : ''}" data-action="switch-prompt-settings-tab" data-prompt-tab="presets">提示词预设与装配</button>
      <button type="button" class="calendar-tab${activeTab === 'library' ? ' is-active' : ''}" data-action="switch-prompt-settings-tab" data-prompt-tab="library">功能提示词库</button>
    </div>
    ${activeTab === 'presets' ? renderPromptPresetSettings(state, ui) : renderPromptLibrarySettings(state, ui)}
  </div>`;
}

export function renderPromptLibrarySettings(state, ui) {
  const allPrompts = getAllPrompts(state);
  const categories = ['全部', '短信与通讯', '群聊', '社交与论坛', '日历与日程', '待办与正文', '通用规则'];
  const activeCategory = ui.promptCategory || '全部';
  const customCount = allPrompts.filter(p => p.isCustom).length;
  const search = (ui.promptSearch || '').trim().toLowerCase();

  let filtered = activeCategory === '全部' ? allPrompts : allPrompts.filter(p => p.category === activeCategory);
  if (search) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(search) ||
      p.description.toLowerCase().includes(search) ||
      p.category.toLowerCase().includes(search) ||
      p.currentPrompt.toLowerCase().includes(search)
    );
  }

  return `<div class="prompts-manager">
    <div class="prompt-tabs-scroll">
      <div class="prompt-filter-tabs">
        ${categories.map(cat => `
          <button type="button" class="prompt-tab ${activeCategory === cat ? 'active' : ''}" data-action="filter-prompt-category" data-category="${escape(cat)}">${escape(cat)}</button>
        `).join('')}
      </div>
    </div>
    <div class="prompt-search-row">
      <input type="search" class="prompt-search-input" placeholder="搜索提示词名称或内容..." value="${escape(ui.promptSearch || '')}" data-action="search-prompts">
    </div>
    <div class="prompt-summary-row">
      <span class="prompt-summary-text">共 16 项${customCount > 0 ? ` · 已修改 ${customCount} 项` : ' · 均为默认'}</span>
      ${customCount > 0 ? `<button type="button" class="prompt-reset-all-btn" data-action="reset-all-prompts">全部恢复默认</button>` : ''}
    </div>
    <div class="prompt-cards-list">
      ${filtered.length === 0 ? `<div class="prompt-empty-hint">未找到匹配的提示词</div>` : filtered.map(item => {
        const draft = ui.promptDrafts?.[item.id];
        const val = draft !== undefined ? draft : item.currentPrompt;
        return `<div class="prompt-card" data-prompt-id="${escape(item.id)}">
          <div class="prompt-card-header">
            <div class="prompt-title-group">
              <span class="prompt-card-title">${escape(item.title)}</span>
              <span class="prompt-category-badge">${escape(item.category)}</span>
              <span class="prompt-status-tag ${item.isCustom ? 'custom' : 'default'}">${item.isCustom ? '已修改' : '默认'}</span>
            </div>
          </div>
          <div class="prompt-desc">
            <span>${escape(item.description)}</span>
            <span class="prompt-macro-note">对应插槽宏：<code>${escape(item.macro || `{{${item.id}_prompt}}`)}</code></span>
          </div>
          <textarea class="prompt-textarea" data-prompt-textarea="${escape(item.id)}" rows="7" spellcheck="false" placeholder="输入提示词内容...">${escape(val)}</textarea>
          <div class="prompt-card-actions">
            <button type="button" class="prompt-action-btn primary-btn" data-action="save-prompt" data-prompt-id="${escape(item.id)}">保存修改</button>
            ${item.isCustom ? `<button type="button" class="prompt-action-btn secondary-btn" data-action="reset-prompt" data-prompt-id="${escape(item.id)}">恢复默认</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

export function renderLogSettings(state, ui, { logger, backflowPreview } = {}) {
  const logs = logger?.getLogs?.() || [];
  const lastBackflow = backflowPreview !== undefined ? backflowPreview : (logger?.getLastBackflowPrompt?.() || '');
  const isInjectEnabled = Boolean(state?.injectEnabled || state?.injectCalendarEnabled);

  return `<div class="logs-manager">
    <div class="log-section">
      <div class="log-section-header">
        <div class="log-section-title">
          <strong>下一轮注入主聊天内容</strong>
          <span class="log-status-tag ${isInjectEnabled ? 'success' : 'warning'}">${isInjectEnabled ? '带入正文开启' : '带入正文未开启'}</span>
        </div>
        <div class="log-actions">
          <button type="button" class="log-mini-btn" data-action="refresh-backflow-preview">刷新预览</button>
          ${lastBackflow ? `<button type="button" class="log-mini-btn primary" data-action="copy-backflow-prompt">复制内容</button>` : ''}
        </div>
      </div>
      <p class="log-desc">主聊天生成时将作为「手机参考」附在正文提示词中，包含近期短信、待办与日历节日线索。</p>
      <textarea class="log-textarea" readonly rows="6" placeholder="当前无待注入正文的内容（未开启短信/日历带入正文，或当前批次暂无新短信、待办，或当前无剧情日期/临近7天内无节日日程）">${escape(lastBackflow)}</textarea>
    </div>

    <div class="log-section" style="margin-top: 14px;">
      <div class="log-section-header">
        <div class="log-section-title">
          <strong>模型请求与输出记录</strong>
          <span class="log-count-badge">${logs.length ? `共 ${logs.length} 条` : '暂无记录'}</span>
        </div>
        ${logs.length ? `<button type="button" class="log-mini-btn danger" data-action="clear-logs">清空日志</button>` : ''}
      </div>
      <p class="log-desc">记录当前会话下发送的完整提示词、输入材料及大模型返回的原始结果。</p>

      ${!logs.length ? `<div class="log-empty-hint">暂无请求记录。在手机中发送短信、生成动态或调用 AI 后将在此显示详细日志。</div>` : `
        <div class="log-list">
          ${logs.map((item, idx) => {
            const isExpanded = ui.expandedLogs instanceof Set ? ui.expandedLogs.has(item.id) : idx === 0;
            const messagesJson = item.messages ? JSON.stringify(item.messages, null, 2) : '';
            return `<div class="log-card ${item.error ? 'is-error' : ''}" data-log-id="${escape(item.id)}">
              <button type="button" class="log-card-header" data-action="toggle-log-card" data-log-id="${escape(item.id)}">
                <div class="log-card-title-group">
                  <span class="log-time">${escape(item.time)}</span>
                  <span class="log-card-title">${escape(item.title)}</span>
                  <span class="log-status-pill ${item.error ? 'error' : 'success'}">${item.error ? '失败' : '成功'}</span>
                </div>
                <span class="log-toggle-icon" aria-hidden="true">
                  ${icon(isExpanded ? 'down' : 'next')}
                </span>
              </button>
              ${isExpanded ? `
                <div class="log-card-body">
                  ${Array.isArray(item.entries) && item.entries.length > 0 ? `
                    <div class="log-block">
                      <div class="log-block-head">
                        <span>提示词装配条目 (${item.entries.length} 个条目，按预设顺序)</span>
                      </div>
                      <div class="log-entries-list">
                        ${item.entries.map((ent, eIdx) => `
                          <div class="log-entry-item">
                            <div class="log-entry-meta">
                              <span class="preset-scope-pill ${ent.role === 'system' ? 'scope-common' : 'scope-app'}">${escape(ent.role || 'system')}</span>
                              <strong class="log-entry-name">${eIdx + 1}. ${escape(ent.name || '未命名条目')}</strong>
                              <button type="button" class="log-copy-inline" data-action="copy-log-text" data-copy-type="entry" data-entry-index="${eIdx}" data-log-id="${escape(item.id)}">复制</button>
                            </div>
                            <textarea class="log-block-pre" readonly rows="${Math.min(6, Math.max(2, (ent.content || '').split('\n').length))}">${escape(ent.content || '')}</textarea>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}
                  <div class="log-block">
                    <div class="log-block-head">
                      <span>发送的系统提示词</span>
                      <button type="button" class="log-copy-inline" data-action="copy-log-text" data-copy-type="system" data-log-id="${escape(item.id)}">复制</button>
                    </div>
                    <textarea class="log-block-pre" readonly rows="5">${escape(item.systemPrompt)}</textarea>
                  </div>
                  <div class="log-block">
                    <div class="log-block-head">
                      <span>实际发送给大模型的消息序列 (Messages)</span>
                      <button type="button" class="log-copy-inline" data-action="copy-log-text" data-copy-type="messages" data-log-id="${escape(item.id)}">复制</button>
                    </div>
                    <textarea class="log-block-pre" readonly rows="6">${escape(messagesJson)}</textarea>
                  </div>
                  <div class="log-block">
                    <div class="log-block-head">
                      <span>模型返回原始结果</span>
                      <button type="button" class="log-copy-inline" data-action="copy-log-text" data-copy-type="reply" data-log-id="${escape(item.id)}">复制</button>
                    </div>
                    <textarea class="log-block-pre ${item.error ? 'error-text' : ''}" readonly rows="5">${escape(item.error ? `错误：${item.error}` : item.reply)}</textarea>
                  </div>
                </div>
              ` : ''}
            </div>`;
          }).join('')}
        </div>
      `}
    </div>
  </div>`;
}

export function renderWorldbookExcludeSettings(state, ui, busy, { host } = {}) {
  const excludeSettings = readBaiBaiExcludeSettings(() => host?.readSettings?.());
  const excludedWorlds = excludeSettings.excludedWorldNames || [];
  const patterns = excludeSettings.excludedWorldInfoPatterns || [];

  return `<div class="worldbook-exclude-settings">
    <label class="compact-switch-row">
      <span>渲染世界书模板</span>
      <span class="switch">
        <input id="render-world-templates" type="checkbox" role="switch" aria-label="渲染世界书模板" ${excludeSettings.renderWorldInfoTemplates ? 'checked' : ''} ${busy?.has?.('world-excludes') ? 'disabled' : ''}>
        <span></span>
      </span>
    </label>
    <small class="field-label">开启后会对两三事读取到的世界书条目进行宏展开与 EJS 模板运算。</small>

    <div class="settings-sub-divider"></div>

    <div class="compact-switch-row exclude-channel-bar">
      <span>整本排除 · 已选 ${excludedWorlds.length} 本</span>
      <button type="button" class="exclude-text-btn" data-action="open-exclude-world-modal" ${busy?.has?.('world-excludes') ? 'disabled' : ''}>编辑名单</button>
    </div>

    ${excludedWorlds.length ? `
      <ul class="exclude-chips-list">
        ${excludedWorlds.map(name => `
          <li class="exclude-chip">
            <span class="exclude-chip-name" title="${escape(name)}">${escape(name)}</span>
            <button type="button" class="exclude-chip-del" data-action="remove-exclude-world" data-world-name="${escape(name)}" title="移出名单">×</button>
          </li>
        `).join('')}
      </ul>
    ` : `<p class="setting-note">未排除任何世界书，全部激活条目都会进上下文参考。</p>`}

    <div class="settings-sub-divider"></div>

    <div class="compact-switch-row">
      <span class="field-label-bold">按条目名过滤</span>
    </div>
    <small class="field-label">填条目备注名（comment）即按包含匹配（不分大小写）。也支持正则，如 <code>\\[mvu[\\s\\S]*?\\]</code> 过滤 MVU 机制条目。</small>

    <div class="exclude-input-bar">
      <input type="text" class="exclude-pattern-input" placeholder="条目名或正则，如 附加 或 ^规则" value="${escape(ui.wiPatternDraft || '')}" data-action="draft-wi-pattern">
      <button type="button" class="exclude-text-btn" data-action="add-wi-pattern" ${busy?.has?.('world-excludes') ? 'disabled' : ''}>+ 添加</button>
    </div>

    ${patterns.length ? `
      <ul class="exclude-chips-list">
        ${patterns.map(pat => `
          <li class="exclude-chip">
            <span class="exclude-chip-name" title="${escape(pat)}">${escape(pat)}</span>
            <button type="button" class="exclude-chip-del" data-action="remove-wi-pattern" data-pattern="${escape(pat)}" title="移除">×</button>
          </li>
        `).join('')}
      </ul>
    ` : `<p class="setting-note">未设置过滤正则。</p>`}
  </div>`;
}

export function renderExcludeWorldModal(ui, availableWorldNames = [], excludeSettings = {}) {
  if (!ui.excludeWorldModalOpen) return '';
  const search = (ui.excludeWorldSearch || '').trim().toLowerCase();
  const excludedSet = new Set(excludeSettings.excludedWorldNames || []);
  const filtered = availableWorldNames.filter(name => !search || name.toLowerCase().includes(search));

  return `<div class="calendar-modal-backdrop exclude-world-backdrop" data-action="close-exclude-world-modal">
    <div class="calendar-modal-dialog exclude-world-dialog">
      <div class="calendar-form-head">
        <h3 class="exclude-modal-title">整本排除世界书</h3>
        <button type="button" class="icon-button" data-action="close-exclude-world-modal" aria-label="关闭">${icon('close')}</button>
      </div>

      <div class="exclude-search-wrap">
        <input type="search" class="exclude-search-input" placeholder="搜索世界书名…" value="${escape(ui.excludeWorldSearch || '')}" data-action="search-exclude-world" spellcheck="false">
      </div>

      <div class="exclude-world-list">
        ${!availableWorldNames.length ? `
          <p class="setting-note">未读取到世界书。请先在酒馆中加载或挂载世界书。</p>
        ` : !filtered.length ? `
          <p class="setting-note">没有匹配「${escape(ui.excludeWorldSearch)}」的世界书。</p>
        ` : filtered.map(name => {
          const isExcluded = excludedSet.has(name);
          return `<label class="compact-switch-row exclude-world-row">
            <span class="exclude-world-row-label" title="${escape(name)}">${escape(name)}</span>
            <span class="switch">
              <input type="checkbox" role="switch" data-action="toggle-exclude-world-item" data-world-name="${escape(name)}" ${isExcluded ? 'checked' : ''}>
              <span></span>
            </span>
          </label>`;
        }).join('')}
      </div>

      <div class="exclude-modal-foot">
        <span class="exclude-modal-count">共 ${availableWorldNames.length} 本 · 已排除 ${excludedSet.size}</span>
        <button type="button" class="save-button" data-action="close-exclude-world-modal">完成</button>
      </div>
    </div>
  </div>`;
}

export function renderSettings(state, { ui, busy, apiSettings, imageProviders, entries, appearance, control, mode, updates, logger, backflowPreview, host }) {
  const sources = apiSettings.listSources(), selected = apiSettings.getSelected();
  const current = sources.find(source => refKey(source.ref) === refKey(selected));
  const manual = ui.manual || !sources.length, preferences = entries.read();
  const instanceLabel = mode === 'embedded' ? '随卡版' : '插件版';
  const drawer = (key, title, content) => `<section class="settings-drawer">
    <button type="button" class="settings-drawer-toggle" data-drawer="${key}" aria-expanded="${ui.drawers[key]}">
      <span>${title}</span>${icon('next')}
    </button>
    ${ui.drawers[key] ? `<div class="settings-drawer-body">${content}</div>` : ''}
  </section>`;
  const entrySwitch = (key, label) => `<label class="compact-switch-row">
    <span>${label}</span>
    <span class="switch">
      <input type="checkbox" role="switch" aria-label="${label}" data-entry-preference="${key}" ${preferences[key] ? 'checked' : ''} ${busy.has('entry') ? 'disabled' : ''}>
      <span></span>
    </span>
  </label>`;
  const connectionDetails = manual ? `<form class="api-form">
    <label class="field-label" for="api-url">接口地址</label>
    <input id="api-url" name="url" type="url" placeholder="https://…/v1" value="${escape(ui.apiDraft.url || '')}" required>
    <label class="field-label" for="api-key">密钥</label>
    <input id="api-key" name="key" type="password" placeholder="输入 API 密钥" value="${escape(ui.apiDraft.key || '')}" autocomplete="off" required>
    ${renderModelPicker(ui, busy)}
    <button type="submit" class="save-button" ${busy.has('api') ? 'disabled' : ''}>保存</button>
  </form>` : current ? `<div class="connection-summary">
    <span class="connection-dot"></span>
    <strong>${escape(current.model || '尚未选择模型')}</strong>
  </div>` : '';
  const connection = `<label class="field-label" for="api-source">使用的配置</label>
    <select id="api-source" aria-label="使用的配置">
      ${!manual && !current ? '<option value="" selected disabled>请选择现有连接</option>' : ''}
      <option value="manual" ${manual ? 'selected' : ''}>自行填写</option>
      ${sources.map(source => `<option value="${escape(refKey(source.ref))}" ${!manual && refKey(source.ref) === refKey(selected) ? 'selected' : ''}>${escape(source.label)}</option>`).join('')}
    </select>
    ${connectionDetails}`;
  const appearanceContent = `<label class="field-label" for="phone-theme">主题</label>
    <select id="phone-theme" aria-label="外观主题">
      <option value="day" ${state.theme !== 'night' ? 'selected' : ''}>日间 · 回声</option>
      <option value="night" ${state.theme === 'night' ? 'selected' : ''}>夜间 · 深蓝</option>
    </select>
    <label class="compact-switch-row">
      <span>启用锁屏</span>
      <span class="switch">
        <input id="lock-screen-enabled" type="checkbox" role="switch" aria-label="启用锁屏" ${state.lockScreenEnabled !== false ? 'checked' : ''} ${busy.has('lock-screen') ? 'disabled' : ''}>
        <span></span>
      </span>
    </label>
    <label class="compact-switch-row">
      <span>记忆上次打开位置</span>
      <span class="switch">
        <input id="remember-last-view-enabled" type="checkbox" role="switch" aria-label="记忆上次打开位置" ${state.rememberLastView === true ? 'checked' : ''} ${busy.has('remember-last-view') ? 'disabled' : ''}>
        <span></span>
      </span>
    </label>
    <label class="compact-switch-row" for="phone-lock-style">
      <span>锁屏样式</span>
      <select id="phone-lock-style" class="lock-style-select" aria-label="锁屏样式" ${busy.has('lock-style') || state.lockScreenEnabled === false ? 'disabled' : ''}>
        <option value="classic" ${!['stacked', 'rounded'].includes(state.lockStyle) ? 'selected' : ''}>默认</option>
        <option value="stacked" ${state.lockStyle === 'stacked' ? 'selected' : ''}>纵时</option>
        <option value="rounded" ${state.lockStyle === 'rounded' ? 'selected' : ''}>圆时</option>
      </select>
    </label>
    ${entrySwitch('fabShow', '悬浮球')}
    ${entrySwitch('qrShow', 'QR')}
    <label class="compact-switch-row">
      <span>粒子效果</span>
      <span class="switch">
        <input id="particles-enabled" type="checkbox" role="switch" aria-label="粒子效果" ${appearance.particlesEnabled() ? 'checked' : ''} ${busy.has('particles') ? 'disabled' : ''}>
        <span></span>
      </span>
    </label>
    <span class="field-label">锁屏背景</span>
    <div class="wallpaper-editor">
      ${renderBackgroundPicker({ value: state.wallpapers?.[state.theme === 'night' ? 'night' : 'day'], theme: state.theme,
        defaultPreset: state.lockStyle === 'stacked' ? 'glass-lake' : state.lockStyle === 'rounded' ? 'paper-petals' : undefined,
        busy: busy.has('wallpaper'), preview: homeImage({ ...state, wallpapers: {} }).src })}
    </div>`;
  const content = `<label class="compact-switch-row">
    <span>短信带入正文</span>
    <span class="switch">
      <input id="inject-enabled" type="checkbox" role="switch" aria-label="短信带入正文" ${state.injectEnabled ? 'checked' : ''}>
      <span></span>
    </span>
  </label>
  <label class="compact-switch-row">
    <span>日历节日带入正文</span>
    <span class="switch">
      <input id="inject-calendar-enabled" type="checkbox" role="switch" aria-label="日历节日带入正文" ${state.injectCalendarEnabled ? 'checked' : ''}>
      <span></span>
    </span>
  </label>
  <small class="field-label">临近 7 天内的节日、纪念日与推演日程可作为背景线索带入正文。</small>
  <small class="field-label">短材料由主楼一起判断；超过3000字才额外生成摘要。</small>
  <label class="compact-switch-row" for="image-provider">
    <span>生图设置</span>
    <select id="image-provider" class="image-provider-select" aria-label="生图设置" ${busy.has('image-provider') ? 'disabled' : ''}>
      <option value="baibai" ${imageProviders?.getSelected() !== 'chatu8' ? 'selected' : ''}>柏宝绘</option>
      <option value="chatu8" ${imageProviders?.getSelected() === 'chatu8' ? 'selected' : ''}>智绘姬</option>
    </select>
  </label>
  <div class="compact-switch-row settings-export-row">
    <span>导出酒馆助手脚本</span>
    <button type="button" class="switch-button" data-action="authoring" aria-label="导出酒馆助手脚本" ${control.isEnabled() ? '' : 'disabled'}>导出</button>
  </div>`;
  return `${pageHeading('设置')}
    <div class="master-switch-row">
    <label class="compact-switch-row master-switch">
      <span>启用两三事</span>
      <span class="switch">
        <input id="phone-enabled" type="checkbox" role="switch" aria-label="启用两三事" ${control.isEnabled() ? 'checked' : ''} ${busy.has('enabled') ? 'disabled' : ''}>
        <span></span>
      </span>
    </label>
    ${updates ? '<div data-update-controls></div>' : ''}
    </div>
    ${updates ? '<div data-update-feedback></div>' : ''}
    ${control.isEnabled() ? '' : `<p class="setting-note">${instanceLabel}已在当前角色卡停用，重新开启后可使用其他页面。</p>`}
    <section class="settings-section">
      <button type="button" class="my-profile" data-action="edit-user" aria-label="编辑我的资料" ${control.isEnabled() ? '' : 'disabled'}>
        ${avatar(state.userProfile || { name: ui.defaultUser })}
        <span>
          <strong>${escape(displayName(state.userProfile || { name: ui.defaultUser }))}</strong>
          <small>我的资料</small>
        </span>
        ${icon('next')}
      </button>
    </section>
    ${drawer('connection', '连接设置', connection)}
    ${drawer('appearance', '外观设置', appearanceContent)}
    ${drawer('content', '内容设置', content)}
    ${drawer('worldbook_excludes', '排除世界书内容', renderWorldbookExcludeSettings(state, ui, busy, { host }))}
    ${drawer('prompts', '提示词可视化', renderPromptSettings(state, ui))}
    ${drawer('logs', '提示词与生成日志', renderLogSettings(state, ui, { logger, backflowPreview }))}
    <small class="app-version"><span class="app-version-label"><span>两三事 ${VERSION}</span> · <span>${instanceLabel}</span></span>${updates ? '<span data-update-notice></span>' : ''}</small>
    ${renderExcludeWorldModal(ui, host?.listWorldInfoNames?.() || [], readBaiBaiExcludeSettings(() => host?.readSettings?.()))}`;
}
