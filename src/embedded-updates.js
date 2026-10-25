import { readRelease, releaseCoreUrl, releaseUrlForCore, UPDATE_NOTICE_PATH } from './release.js';

const isNewer = (next, current) => {
  const previous = current.split('.').map(Number), values = next.split('.').map(Number);
  const index = values.findIndex((value, at) => value !== previous[at]);
  return index >= 0 && values[index] > previous[index];
};

export function createEmbeddedUpdates({ coreUrl = 'https://cdn.jsdelivr.net/gh/cone97218-alt/ST-TwoMoreThings@main/embed.js', releaseUrl = releaseUrlForCore(coreUrl), version, release, updateError = '', replaceCore, fetchImpl = globalThis.fetch } = {}) {
  let installedNotice = release?.version === version ? release.update_notice || '' : UPDATE_NOTICE_PATH;
  let state = Object.freeze({ status: release ? isNewer(release.version, version) ? 'available' : 'stable' : updateError ? 'error' : 'unchecked', versionInfo: release ?? null, error: updateError }), checkedOnce = Boolean(release || updateError), pending = null;
  const listeners = new Set();
  const publish = value => { state = Object.freeze(value); for (const listener of listeners) listener(state); return state; };
  const check = () => {
    checkedOnce = true;
    if (pending) return pending;
    publish({ ...state, status: 'checking', error: '' });
    pending = (async () => {
      try {
        const info = await readRelease({ url: releaseUrl, fetchImpl });
        return publish({ status: isNewer(info.version, version) ? 'available' : 'stable', versionInfo: info, error: '' });
      } catch (error) { return publish({ status: 'error', versionInfo: null, error: error.message }); }
      finally { pending = null; }
    })();
    return pending;
  };
  const update = () => {
    if (state.status === 'updating') return pending;
    if (state.status !== 'available') return Promise.reject(new Error('请先检查更新，再更新两三事。'));
    const previous = state; publish({ ...state, status: 'updating', error: '' });
    pending = (async () => {
      try {
        const info = previous.versionInfo;
        const nextCoreUrl = releaseCoreUrl(info, coreUrl);
        await replaceCore(nextCoreUrl, info);
        coreUrl = nextCoreUrl; installedNotice = info.update_notice || '';
        version = info.version;
        return publish({ status: 'stable', versionInfo: info, error: '' });
      } catch (error) { publish({ ...previous, error: error.message }); throw error; }
      finally { pending = null; }
    })();
    return pending;
  };
  const readNotice = async (kind = 'installed') => {
    const available = kind === 'available';
    try {
      const base = available ? releaseCoreUrl(state.versionInfo, coreUrl) : coreUrl;
      const pointer = available ? state.versionInfo.update_notice : installedNotice;
      const root = new URL('./', base).href, url = typeof pointer === 'string' && pointer.trim() ? new URL(pointer, root) : null;
      if (!url || !url.href.startsWith(root) || url.search || url.hash) return { ok: false, message: available ? '更新来源尚未提供可用公告，仍可更新。' : '当前版本未提供更新公告。' };
      const response = await fetchImpl(url.href, { credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new Error();
      const markdown = await response.text(); if (!markdown.trim()) throw new Error();
      return { ok: true, markdown };
    } catch { return { ok: false, message: available ? '暂时无法读取更新公告，仍可更新。' : '暂时无法读取已安装版本公告，请稍后再试。' }; }
  };
  return Object.freeze({ getState: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, ensureChecked: () => checkedOnce ? Promise.resolve(state) : check(), check, update, readNotice });
}
