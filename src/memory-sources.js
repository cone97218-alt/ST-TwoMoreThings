export const MEMORY_CONFLICT_CODE = 'MEMORY_SOURCE_CONFLICT';

function boundedHistory(nodes, maxCharacters) {
  const selected = [];
  let remaining = maxCharacters;
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (typeof node?.text !== 'string' || !node.text.trim()) continue;
    const times = [node.timeStart, node.timeEnd].filter(value => typeof value === 'string' && value.trim());
    const label = times.length ? [...new Set(times)].join(' → ') : typeof node.timeLabel === 'string' ? node.timeLabel.trim() : '';
    const text = `${label ? `【${label}】` : ''}${node.text.trim()}`;
    const cost = text.length + (selected.length ? 2 : 0);
    if (cost > remaining) {
      // 通常保留完整摘要；单条本身超限时只截这一条，仍遵守原上下文预算。
      if (!selected.length) selected.push(text.slice(0, remaining));
      break;
    }
    selected.unshift(text); remaining -= cost;
  }
  return selected.join('\n\n');
}

export function createMemorySources({ target, settingsProvider = () => ({}), qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1, baiBaiBookProvider = () => globalThis.STBaiBaiBook }) {
  function select() {
    const bridge = qqjBridgeProvider?.(), status = bridge?.getStatus?.()?.status;
    const qqjActive = status === 'ready' || status === 'not-ready';
    const api = baiBaiBookProvider?.() || globalThis.STBaiBaiBook || (typeof window !== 'undefined' ? window.STBaiBaiBook : null);
    const stCtx = typeof globalThis.SillyTavern?.getContext === 'function' ? globalThis.SillyTavern.getContext() : null;
    const rawSettings = settingsProvider?.();
    const settings = rawSettings && Object.keys(rawSettings).length ? rawSettings : (stCtx?.extensionSettings || {});
    const book = settings?.baibai_book;
    // 柏宝书 1.3.2 的公开 API 不含开关；只读其现有设置及共享角色排除名单。
    const excluded = Array.isArray(settings?.baibai_exclude_settings?.excludedChars) ? settings.baibai_exclude_settings.excludedChars : Array.isArray(book?.excludedChars) ? book.excludedChars : [];
    const charName = target?.character?.name || stCtx?.name2?.trim() || '';
    const isExcluded = Boolean(charName && excluded.includes(charName));
    const liveMetadata = target?.metadata?.baibai_book ? target.metadata : (stCtx?.chatMetadata || target?.metadata);
    const liveMessages = Array.isArray(target?.messages) && target.messages.length ? target.messages : (stCtx?.chat || target?.messages);
    const hasMetadata = Array.isArray(liveMetadata?.baibai_book?.summaries) && liveMetadata.baibai_book.summaries.length > 0;
    const hasLeaves = Array.isArray(liveMessages) && liveMessages.some(m => m?.extra?.bbs_leaf);
    const isBookEnabled = book ? book.enabled !== false : Boolean(api || (!qqjActive && (hasMetadata || hasLeaves)));
    const bbsActive = Boolean((api || (!qqjActive && (hasMetadata || hasLeaves))) && isBookEnabled && (target?.groupId || !isExcluded));
    if (qqjActive && bbsActive) {
      const error = new Error('千千结和柏宝书同时开启，请在其中一个插件中关闭总开关，再继续使用手机记忆。');
      error.code = MEMORY_CONFLICT_CODE;
      throw error;
    }
    return qqjActive ? { kind: 'qqj', bridge } : bbsActive ? { kind: 'bbs', api } : { kind: 'none' };
  }
  return {
    select,
    readStoryMemory(source, maxCharacters) {
      const stCtx = typeof globalThis.SillyTavern?.getContext === 'function' ? globalThis.SillyTavern.getContext() : null;
      const rawSettings = settingsProvider?.();
      const settings = rawSettings && Object.keys(rawSettings).length ? rawSettings : (stCtx?.extensionSettings || {});
      const book = settings?.baibai_book;
      const excluded = Array.isArray(settings?.baibai_exclude_settings?.excludedChars) ? settings.baibai_exclude_settings.excludedChars : Array.isArray(book?.excludedChars) ? book.excludedChars : [];
      const charName = target?.character?.name || stCtx?.name2?.trim() || '';
      const isExcluded = Boolean(charName && excluded.includes(charName));
      const liveMetadata = target?.metadata?.baibai_book ? target.metadata : (stCtx?.chatMetadata || target?.metadata);
      const liveMessages = Array.isArray(target?.messages) && target.messages.length ? target.messages : (stCtx?.chat || target?.messages);

      if (source.kind !== 'bbs') {
        let qqjActive = false;
        try {
          const bridge = qqjBridgeProvider?.(), status = bridge?.getStatus?.()?.status;
          qqjActive = status === 'ready' || status === 'not-ready';
        } catch {}
        if (qqjActive || book?.enabled === false || (!target?.groupId && isExcluded)) return '';
        if (Array.isArray(liveMetadata?.baibai_book?.summaries) && liveMetadata.baibai_book.summaries.length) {
          const validSummaries = liveMetadata.baibai_book.summaries.filter(s => typeof s?.text === 'string' && s.text.trim());
          if (validSummaries.length) return boundedHistory(validSummaries, maxCharacters);
        }
        if (Array.isArray(liveMessages)) {
          const leaves = liveMessages.map(m => m?.extra?.bbs_leaf).filter(l => l && typeof l.text === 'string' && l.text.trim());
          if (leaves.length) return boundedHistory(leaves, maxCharacters);
        }
        return '';
      }
      if (source.api && (source.api.apiVersion !== 1 || typeof source.api.getInjectedHistory !== 'function')) {
        throw new Error('柏宝书的记忆接口不可用，请更新柏宝书并刷新酒馆后重试。');
      }
      try {
        let history = source.api && typeof source.api.getInjectedHistory === 'function' ? source.api.getInjectedHistory() : null;
        let bounded = Array.isArray(history?.nodes) && history.nodes.length ? boundedHistory(history.nodes, maxCharacters) : '';
        if (!bounded && typeof history?.relativeText === 'string' && history.relativeText.trim()) {
          bounded = history.relativeText.trim().slice(0, maxCharacters);
        }
        if (!bounded && typeof history?.text === 'string' && history.text.trim()) {
          bounded = history.text.trim().slice(0, maxCharacters);
        }

        // 如果正常注入口径（滑窗外隐藏节点）为空，尝试读取当前楼层前的完整历史剧情摘要
        if (!bounded && source.api && typeof source.api.getHistory === 'function') {
          try {
            const fullHistory = source.api.getHistory();
            if (Array.isArray(fullHistory?.nodes) && fullHistory.nodes.length) {
              bounded = boundedHistory(fullHistory.nodes, maxCharacters);
            } else if (typeof fullHistory?.relativeText === 'string' && fullHistory.relativeText.trim()) {
              bounded = fullHistory.relativeText.trim().slice(0, maxCharacters);
            } else if (typeof fullHistory?.text === 'string' && fullHistory.text.trim()) {
              bounded = fullHistory.text.trim().slice(0, maxCharacters);
            }
          } catch {}
        }

        // 终极兜底：直接从 chatMetadata 的 baibai_book 森林或消息 leaf 读取
        const stCtx = typeof globalThis.SillyTavern?.getContext === 'function' ? globalThis.SillyTavern.getContext() : null;
        const liveMetadata = stCtx?.chatMetadata || target?.metadata;
        const liveMessages = stCtx?.chat || target?.messages;
        if (!bounded && Array.isArray(liveMetadata?.baibai_book?.summaries) && liveMetadata.baibai_book.summaries.length) {
          const validSummaries = liveMetadata.baibai_book.summaries.filter(s => typeof s?.text === 'string' && s.text.trim());
          if (validSummaries.length) bounded = boundedHistory(validSummaries, maxCharacters);
        }
        if (!bounded && Array.isArray(liveMessages)) {
          const leaves = liveMessages.map(m => m?.extra?.bbs_leaf).filter(l => l && typeof l.text === 'string' && l.text.trim());
          if (leaves.length) bounded = boundedHistory(leaves, maxCharacters);
        }

        return bounded || '';
      } catch (err) {
        if (err.message && err.message.includes('不可用')) throw err;
        const stCtx = typeof globalThis.SillyTavern?.getContext === 'function' ? globalThis.SillyTavern.getContext() : null;
        const liveMetadata = stCtx?.chatMetadata || target?.metadata;
        const liveMessages = stCtx?.chat || target?.messages;
        if (Array.isArray(liveMetadata?.baibai_book?.summaries) && liveMetadata.baibai_book.summaries.length) {
          const validSummaries = liveMetadata.baibai_book.summaries.filter(s => typeof s?.text === 'string' && s.text.trim());
          if (validSummaries.length) return boundedHistory(validSummaries, maxCharacters);
        }
        if (Array.isArray(liveMessages)) {
          const leaves = liveMessages.map(m => m?.extra?.bbs_leaf).filter(l => l && typeof l.text === 'string' && l.text.trim());
          if (leaves.length) return boundedHistory(leaves, maxCharacters);
        }
        throw new Error('柏宝书记忆读取失败，请检查柏宝书后重试。');
      }
    },
  };
}
