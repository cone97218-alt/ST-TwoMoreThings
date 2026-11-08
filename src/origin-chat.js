import { SYSTEM_CONTACT_ID, resolvePersona } from './origin-engine.js';
import { generateMessageId } from './content.js';
import { ORIGIN_CHAT_PROMPT } from './prompts.js';

export const RAW_SYSTEM_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" rx="28" fill="#2d3748"/>
  <circle cx="50" cy="50" r="32" fill="none" stroke="#e2e8f0" stroke-width="2.5" opacity="0.3"/>
  <polygon points="50,22 76,37 76,67 50,82 24,67 24,37" fill="none" stroke="#e2e8f0" stroke-width="3"/>
  <circle cx="50" cy="50" r="10" fill="#e2e8f0"/>
</svg>`;

export const SYSTEM_AVATAR_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(RAW_SYSTEM_AVATAR_SVG)}`;

export function createSystemContact(originState = {}) {
  const name = originState.sysName || '系统';
  return {
    id: SYSTEM_CONTACT_ID,
    name,
    nickname: '系统',
    avatar: SYSTEM_AVATAR_SVG,
    signature: '随身全能系统 · 正在竭诚为你服务',
    isSystem: true,
    manualFields: ['name', 'nickname', 'avatar', 'signature'],
  };
}

export function formatOriginChatMacros(originState = {}, userProfile = {}, options = {}) {
  const hostName = (originState.bindTo && originState.bindTo !== '宿主') ? originState.bindTo : (userProfile?.name || '宿主');
  const userName = userProfile?.name || 'User';
  const persona = resolvePersona(originState);
  const activeTasks = (originState.tasks || []).filter(t => t.status === 'active');
  const tasksSummary = activeTasks.length
    ? activeTasks.map(t => `[${t.type}] ${t.title} (进度:${t.progress || 0}%, 奖励:${t.reward || '无'})`).join('；')
    : '暂无进行中任务';

  const statsSummary = (originState.stats || []).map(s => `${s.name}:${s.val}`).join('，') || '暂无特殊属性';
  const bagSummary = (originState.bag || []).map(b => `${b.name}×${b.count}`).join('，') || '背包为空';

  return {
    sysName: originState.sysName || '系统',
    hostName,
    userName,
    hostPersonality: options.hostPersonality || `宿主角色【${hostName}】`,
    persona,
    level: originState.level || 1,
    exp: originState.exp || 0,
    expMax: originState.expMax || 100,
    points: originState.points || 0,
    stats: statsSummary,
    tasks: tasksSummary,
    bag: bagSummary,
  };
}

export function fillOriginChatPrompt(template, originState = {}, userProfile = {}, options = {}) {
  const m = formatOriginChatMacros(originState, userProfile, options);
  return (template || '')
    .replace(/\{\{sysName\}\}/g, m.sysName)
    .replace(/\{\{hostName\}\}/g, m.hostName)
    .replace(/\{\{userName\}\}/g, m.userName)
    .replace(/\{\{hostPersonality\}\}/g, m.hostPersonality)
    .replace(/\{\{persona\}\}/g, m.persona)
    .replace(/\{\{level\}\}/g, String(m.level))
    .replace(/\{\{exp\}\}/g, String(m.exp))
    .replace(/\{\{expMax\}\}/g, String(m.expMax))
    .replace(/\{\{points\}\}/g, String(m.points))
    .replace(/\{\{stats\}\}/g, m.stats)
    .replace(/\{\{tasks\}\}/g, m.tasks)
    .replace(/\{\{bag\}\}/g, m.bag);
}

export function buildSystemChatPrompt({ originState = {}, userProfile = {}, conversation = [], customChatPrompt = '' }) {
  const template = customChatPrompt || ORIGIN_CHAT_PROMPT;
  const systemInstruction = fillOriginChatPrompt(template, originState, userProfile);

  const messages = (conversation || []).slice(-10).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text || m.content || '',
  }));

  return {
    system: systemInstruction,
    messages,
  };
}

export function createSystemMessage({ text, clock, batch, kind = 'chat' }) {
  const now = new Date();
  return {
    id: generateMessageId(),
    role: 'assistant',
    text,
    createdAt: now.toISOString(),
    timeLabel: clock?.time || now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),
    ...(clock?.source === 'story' ? { storyDate: clock.date, storyWeekday: clock.weekday } : {}),
    isSystemNotice: kind !== 'chat',
  };
}
