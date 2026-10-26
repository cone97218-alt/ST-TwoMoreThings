export const RELEASE_URL = 'https://raw.githubusercontent.com/cone97218-alt/ST-TwoMoreThings/main/release.json';
export const STABLE_CORE_URL = 'https://cdn.jsdelivr.net/gh/cone97218-alt/ST-TwoMoreThings@56a6614198bd177f967a9406f7b6f425f9a810af/embed.js';
export const UPDATE_NOTICE_PATH = 'docs/updates-0.4.6.md';

// 导出启动器会嵌入此函数；保持自包含，公共请求不携带酒馆请求头或凭证。
export async function readRelease({ url = 'https://raw.githubusercontent.com/cone97218-alt/ST-TwoMoreThings/main/release.json', fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error('暂时无法读取发布版本，请稍后再检查更新。');
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release?.version) || !/^[a-f0-9]{40}$/i.test(release?.sha)) throw new Error('发布版本信息不完整，请稍后再检查更新。');
    return release;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('检查更新超时，请稍后再试。');
    throw new Error(error.message === '发布版本信息不完整，请稍后再检查更新。' ? error.message : '暂时无法读取发布版本，请检查网络或稍后再试。');
  } finally { clearTimeout(timeout); }
}

export function releaseUrlForCore(coreUrl) {
  const url = new URL(coreUrl), match = url.hostname.endsWith('.jsdelivr.net') && url.pathname.match(/^\/gh\/([^/]+)\/([^/@]+)@[^/]+\//);
  return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/release.json` : new URL('./release.json', url).href;
}

export function releaseCoreUrl(release, coreUrl = 'https://cdn.jsdelivr.net/gh/cone97218-alt/ST-TwoMoreThings@main/embed.js') {
  const url = new URL(coreUrl);
  if (!url.hostname.endsWith('.jsdelivr.net') || !/^\/gh\/[^/]+\/[^/@]+@[^/]+\//.test(url.pathname)) throw new Error('当前随卡核心来源不支持在线更新，请重新导出随卡脚本。');
  url.pathname = url.pathname.replace(/@[^/]+\//, `@${release.sha}/`);
  return url.href;
}
