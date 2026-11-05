export const displayName = person => person?.nickname || person?.name || '我';

export function normalizeAvatarUrl(url) {
  const str = String(url || '').trim();
  if (!str) return '';
  if (/^(?:User Avatars|characters|img|thumbnail)\//i.test(str)) return `/${str}`;
  return str;
}

export function avatarSource(value) {
  const source = normalizeAvatarUrl(value);
  if (!source) return '';
  if (/^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif|avif);base64,|data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,)/i.test(source)) {
    return source;
  }
  // 支持酒馆内常用相对头像路径（/User Avatars/..., /characters/..., /thumbnail..., ./...）
  if (/^(?:\/|\.\/)/i.test(source)) {
    return source;
  }
  return '';
}

export function cleanProfile(draft, contact = false) {
  const text = key => String(draft[key] || '').trim();
  if (!text('name')) throw new Error('请填写姓名。');
  if (text('avatar') && !avatarSource(draft.avatar)) throw new Error('头像地址需使用 http 或 https，也可以选择本地图片。');
  return { name: text('name'), nickname: text('nickname'), avatar: avatarSource(draft.avatar),
    ...(contact ? { expression: text('expression'), language: text('language') } : {}),
  };
}
