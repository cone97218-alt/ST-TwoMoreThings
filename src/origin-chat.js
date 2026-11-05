import { SYSTEM_CONTACT_ID, resolvePersona } from './origin-engine.js';
import { generateMessageId } from './content.js';

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

export function buildSystemChatPrompt({ originState = {}, userProfile = {}, conversation = [], customChatPrompt = '' }) {
  const hostName = userProfile.name || '宿主';
  const persona = resolvePersona(originState);
  const activeTasks = (originState.tasks || []).filter(t => t.status === 'active');
  const tasksSummary = activeTasks.length
    ? activeTasks.map(t => `[${t.type}] ${t.title} (进度:${t.progress || 0}%, 奖励:${t.reward || '无'})`).join('；')
    : '暂无进行中任务';

  const statsSummary = (originState.stats || []).map(s => `${s.name}:${s.val}`).join('，') || '暂无特殊属性';
  const bagSummary = (originState.bag || []).map(b => `${b.name}×${b.count}`).join('，') || '背包为空';

  let systemInstruction = `你是绑定在【${hostName}】身上的专属金手指系统【${originState.sysName || '系统'}】。
你的人格风格设定：${persona}

当前宿主状态：
- 宿主称呼：${hostName}
- 系统等级：Lv.${originState.level || 1} (EXP: ${originState.exp || 0}/${originState.expMax || 100})
- 宿主积分：${originState.points || 0}
- 宿主属性：${statsSummary}
- 进行中任务：${tasksSummary}
- 背包物品：${bagSummary}

你现在正通过随身手机的专属端与宿主进行直接私聊。
回复规则：
1. 始终严格贯彻你的人格口吻（如冷澈公事公办、毒舌傲娇、或温和指引）。
2. 解答宿主关于任务推进、商城兑换、积分获取或世界观的疑问，给予中肯的建议或符合性格的吐槽。
3. 保持简短精炼（通常 1 到 3 句话，不要啰嗦长篇大论），像真实的手机即时通讯对话。禁止输出 <origin> 标签。`;

  if (customChatPrompt) {
    systemInstruction += `\n\n[自定义规则与补充说明]\n${customChatPrompt}`;
  }

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
