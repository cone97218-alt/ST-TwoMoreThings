import {
  resolvePersona,
  taskRemainingTurns,
  completeOriginTask,
  failOriginTask,
  checkOriginExpiry,
  applyStatEffect,
  gainOriginExp,
  gainSkillExp,
  saveSkill,
  deleteSkill,
  addItemToBag,
  useBagItem,
  buyShopItem,
  performGachaDraw,
  unlockAchievement,
  pushOriginLog,
  defaultOriginSections,
  defaultOriginModuleTags,
} from './origin-engine.js';

export function buildOriginInjection(state, { currentTurn = 0 } = {}) {
  if (!state || !state.enabled || state.paused) return '';
  checkOriginExpiry(state, currentTurn);

  const sysName = state.sysName || '系统';
  const hostName = (state.bindTo && state.bindTo !== '宿主') ? state.bindTo : '';
  const autoEcon = state.autoEcon || Boolean(hostName);
  const sections = state.sections || defaultOriginSections();

  const secPanel = sections.panel || { enabled: true, template: '' };
  const secTasks = sections.tasks || { enabled: true, template: '' };
  const secInventory = sections.inventory || { enabled: true, template: '' };
  const secAction = sections.action || { enabled: true, template: '' };
  const secRules = sections.rules || { enabled: true, template: '' };
  const secOutput = sections.output || { enabled: true, template: '' };

  const parts = [];

  // 1. 宿主与系统面板
  if (secPanel.enabled !== false && secPanel.template && secPanel.template.trim()) {
    let panelText = `【${sysName} 状态】\n`;
    if (hostName) {
      panelText += `★本系统绑定的是角色【${hostName}】，不是宿主(user)。任务/积分/属性/成就都属于 ${hostName}；请让 ${hostName} 像突然获得金手指系统的主角那样思考、并主动推进系统任务。宿主(user)是旁观者或其他在场角色，系统不向 user 派任务、也不对 user 说话（除非 user 正在扮演 ${hostName}）。\n`;
    }
    panelText += `世界：${state.world || '未设定'}\n`;
    panelText += `积分：${state.points || 0} ｜ 等级 Lv.${state.level || 1}\n`;

    const statsStr = (state.mods?.stat && Array.isArray(state.stats) && state.stats.length)
      ? state.stats.map(x => `${x.name}${x.val >= 0 ? '+' : ''}${x.val}`).join(' ')
      : '';
    if (statsStr) {
      panelText += `属性：${statsStr}\n`;
    }

    const perksStr = (Array.isArray(state.perks) && state.perks.length)
      ? state.perks.map(k => `${k.name}${k.desc ? `（${k.desc}）` : ''}`).join('；')
      : '';
    if (perksStr) {
      panelText += `${hostName || '宿主'}已开启的权限/特权（永久有效）：${perksStr}\n`;
    }

    const skillsStr = (Array.isArray(state.skills) && state.skills.length)
      ? state.skills.map(k => {
          const lvInfo = (k.level !== undefined && k.level !== null && k.expMax)
            ? ` [Lv.${k.level} 熟练度:${k.exp || 0}/${k.expMax}]`
            : (k.level !== undefined && k.level !== null ? ` [Lv.${k.level}]` : '');
          return `${k.name}${lvInfo}${k.desc ? `（${k.desc}）` : ''}`;
        }).join('；')
      : '';
    if (skillsStr) {
      panelText += `${hostName || '宿主'}已掌握的技能（永久持有，写剧情时要体现起作用）：${skillsStr}\n`;
    }

    let custom = secPanel.template.trim()
      .replace(/\{\{content\}\}/g, panelText.trim())
      .replace(/\{\{sysName\}\}/g, sysName)
      .replace(/\{\{hostName\}\}/g, hostName || '宿主')
      .replace(/\{\{world\}\}/g, state.world || '未设定')
      .replace(/\{\{points\}\}/g, String(state.points || 0))
      .replace(/\{\{level\}\}/g, String(state.level || 1))
      .replace(/\{\{stats\}\}/g, statsStr)
      .replace(/\{\{perks\}\}/g, perksStr)
      .replace(/\{\{skills\}\}/g, skillsStr);
    if (custom.trim()) parts.push(custom.trim());
  }

  // 2. 进行中任务
  const active = (state.tasks || []).filter(t => t.status === 'active');
  const fmtT = t => {
    const rem = taskRemainingTurns(t, currentTurn);
    return `  [${t.type}#${t.id}] ${t.title}（进度${t.progress || 0}%${rem !== null ? `，剩${rem}回合` : ''}）｜要求:${t.cond || '—'}${t.reward ? `｜奖:${t.reward}` : ''}${t.penalty ? `｜罚:${t.penalty}` : ''}\n`;
  };

  const primary = hostName || '宿主';
  const mine = active.filter(t => (t.owner || '宿主') === primary);
  const theirs = active.filter(t => (t.owner || '宿主') !== primary);

  if (secTasks.enabled !== false && secTasks.template && secTasks.template.trim()) {
    let taskText = '';
    if (mine.length) {
      for (const t of mine) taskText += fmtT(t);
    } else if (!theirs.length) {
      taskText += '  （暂无进行中任务）\n';
    }

    if (theirs.length) {
      if (taskText) taskText += '\n';
      taskText += '系统给角色布置的任务（请让对应角色在剧情里自己朝这些目标行动）：\n';
      for (const t of theirs) taskText += `  【给${t.owner}】${fmtT(t).trimStart()}`;
    }

    const pureTasks = taskText.trim();
    let custom = secTasks.template.trim()
      .replace(/\{\{content\}\}/g, pureTasks)
      .replace(/\{\{tasks\}\}/g, pureTasks);
    if (custom.trim()) parts.push(custom.trim());
  }

  // 3. 背包与商城
  if (secInventory.enabled !== false && secInventory.template && secInventory.template.trim()) {
    let invText = '';
    const bagStr = (state.mods?.bag && Array.isArray(state.bag) && state.bag.length)
      ? state.bag.map(b => `${b.name}×${b.count || 1}`).join('，')
      : '';
    if (bagStr) {
      invText += `${hostName || '宿主'}背包：${bagStr}\n`;
    }

    const shopStr = (autoEcon && state.mods?.shop && Array.isArray(state.shop) && state.shop.length)
      ? state.shop.slice(0, 8).map(x => `${x.name}(${x.price})`).join(' ／ ')
      : '';
    if (shopStr) {
      invText += `商城（可花积分买，当前积分${state.points || 0}）：${shopStr}\n`;
    }

    let custom = secInventory.template.trim()
      .replace(/\{\{content\}\}/g, invText.trim())
      .replace(/\{\{bag\}\}/g, bagStr || '（空）')
      .replace(/\{\{shop\}\}/g, shopStr || '（暂无）');
    if (custom.trim()) parts.push(custom.trim());
  }

  // 4. 本回合动作与系统事件
  if (secAction.enabled !== false && secAction.template && secAction.template.trim()) {
    let actionText = '';
    if (Array.isArray(state.pendingUse) && state.pendingUse.length) {
      actionText += `【本回合宿主动作】${state.pendingUse.map(u => `使用了道具「${u.name}」${u.desc ? `（${u.desc}）` : ''}`).join('；')}——请让剧情与角色对此作出合理反应。\n`;
    }
    if (Array.isArray(state.pendingEvent) && state.pendingEvent.length) {
      actionText += `【本回合系统事件】${state.pendingEvent.join('；')}——请把它自然写进正文。\n`;
    }

    let custom = secAction.template.trim()
      .replace(/\{\{content\}\}/g, actionText.trim())
      .replace(/\{\{actions\}\}/g, actionText.trim());
    if (custom.trim()) parts.push(custom.trim());
  }

  // 5. 行为指引与口吻规则
  if (secRules.enabled !== false && secRules.template && secRules.template.trim()) {
    const freq = state.freq || 3;
    const allowNew = (currentTurn - (state.lastTaskTurn || -99) >= freq) &&
      (!state.blockWhenUnfinished || !active.some(t => t.type === '主线' || t.type === '支线'));

    let rulesText = '【本回合系统指引与规则】\n';
    if (secOutput.enabled !== false && secOutput.template && secOutput.template.trim()) {
      rulesText += '0. 写完正文后，若进行了任务推进或获得了系统奖惩，必须在末尾输出 <origin> 数据块。\n';
    }
    rulesText += '1. 依据正文里实际发生的事更新任务进度；若完成条件达成，请输出『完成|任务id』。禁止替宿主无理由自动完结。\n';

    if (state.taskSource === 'manual') {
      rulesText += '2. 本回合不要自动发布新任务（用户设置为手动）。\n';
    } else if (allowNew) {
      if (!active.length) {
        rulesText += '2. 当前无任务：请在本回合发起 1 个贴合当前情境的新任务（优先主线）。';
      } else {
        rulesText += '2. 允许发布新任务：若当前剧情合适，可发起 1 个新任务（主线/支线/日常）。';
      }
      if (state.direction) rulesText += ` 宿主期望的任务方向：${state.direction}。`;
      rulesText += '\n';
    } else {
      rulesText += '2. 本回合不要发布新任务。\n';
    }

    if (state.fourthWall > 0) {
      rulesText += `3. 第四面墙：有约 ${state.fourthWall}% 的几率，系统可短暂吐槽一句打破第四面墙。\n`;
    } else {
      rulesText += '3. 不要打破第四面墙。\n';
    }

    const personaStr = resolvePersona(state);
    rulesText += `4. 系统说话口吻：${personaStr}\n`;
    rulesText += '5. 奖励是对宿主有利的（加积分/属性/道具/技能），惩罚是不利的。\n';
    if (state.rewardPref) rulesText += `6. 奖励偏好：${state.rewardPref}。\n`;
    if (state.penaltyPref) rulesText += `7. 惩罚偏好：${state.penaltyPref}。\n`;

    let custom = secRules.template.trim()
      .replace(/\{\{content\}\}/g, rulesText.trim())
      .replace(/\{\{persona\}\}/g, personaStr)
      .replace(/\{\{direction\}\}/g, state.direction || '契合当前情境自然展开')
      .replace(/\{\{freq\}\}/g, String(freq));
    if (custom.trim()) parts.push(custom.trim());
  }

  // 6. 数据回传与输出规范
  if (secOutput.enabled !== false && secOutput.template && secOutput.template.trim()) {
    let outputText = '【输出】在回复最末尾另起一行，输出数据块（此块不属于正文，不向读者展示）：\n' +
      '<origin>\n' +
      '进度|任务id|新百分比0-100|依据\n' +
      '完成|任务id\n' +
      '失败|任务id\n' +
      '新任务|类型:主线或支线或日常|标题:…|描述:…|条件:…|奖励:积分300|惩罚:…|时限:整数|对象:宿主或角色名\n' +
      '积分|+N或-N|理由\n' +
      '属性|名称|+N或-N\n' +
      '获得|名称|数量\n' +
      '用道具|名称\n' +
      '播报|一句系统口吻的话\n' +
      '私聊|系统 或 角色名|一句话\n' +
      '成就|名称|说明\n' +
      '</origin>';

    let custom = secOutput.template.trim()
      .replace(/\{\{content\}\}/g, outputText.trim());
    if (custom.trim()) parts.push(custom.trim());
  }

  let out = parts.filter(Boolean).join('\n\n');
  const budget = state.budget || 1400;
  if (out.length > budget) {
    const cut = out.lastIndexOf('\n', budget);
    out = out.slice(0, cut > 0 ? cut : budget);
  }
  return out;
}

export const DEFAULT_TAG_REGEX = '<(?:origin|系统)>([\\s\\S]*?)</(?:origin|系统)>';

function resolveTagRegex(customRegex, global = false) {
  if (customRegex instanceof RegExp) {
    if (global && !customRegex.flags.includes('g')) {
      return new RegExp(customRegex.source, customRegex.flags + 'g');
    }
    return customRegex;
  }
  const pattern = (typeof customRegex === 'string' && customRegex.trim()) ? customRegex.trim() : DEFAULT_TAG_REGEX;
  try {
    return new RegExp(pattern, global ? 'gi' : 'i');
  } catch {
    return global ? /<(?:origin|系统)>[\s\S]*?<\/(?:origin|系统)>/gi : /<(?:origin|系统)>([\s\S]*?)<\/(?:origin|系统)>/i;
  }
}

export function buildModuleTagMatcher(moduleTags = null, legacyTagRegex = null) {
  const tagMap = new Map();
  const normalizedTags = {
    ...defaultOriginModuleTags(),
    ...(moduleTags && typeof moduleTags === 'object' ? moduleTags : {}),
  };

  for (const [kind, aliasStr] of Object.entries(normalizedTags)) {
    if (!aliasStr) continue;
    const aliases = String(aliasStr)
      .split(/[,，|/]/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    for (const alias of aliases) {
      tagMap.set(alias, kind);
    }
  }

  let legacyCustomRe = null;
  if (legacyTagRegex) {
    if (typeof legacyTagRegex === 'string' && legacyTagRegex.trim()) {
      const words = legacyTagRegex.match(/[a-zA-Z\u4e00-\u9fa5_][\w\u4e00-\u9fa5_-]*/g) || [];
      for (const w of words) {
        const lower = w.toLowerCase();
        if (lower === 's' || lower === 'i' || lower === 'g') continue;
        if (!tagMap.has(lower)) {
          tagMap.set(lower, 'origin');
        }
      }
      try {
        legacyCustomRe = resolveTagRegex(legacyTagRegex, true);
      } catch (_) {}
    } else if (legacyTagRegex instanceof RegExp) {
      legacyCustomRe = legacyTagRegex;
    }
  }

  if (!tagMap.has('origin')) tagMap.set('origin', 'origin');
  if (!tagMap.has('系统')) tagMap.set('系统', 'origin');

  const sortedAliases = Array.from(tagMap.keys()).sort((a, b) => b.length - a.length);
  const escapedAliases = sortedAliases.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const aliasPattern = escapedAliases.join('|');
  const combinedRegex = new RegExp('<\\s*(' + aliasPattern + ')(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/\\s*\\1\\s*>', 'gi');

  return { tagMap, combinedRegex, legacyCustomRe };
}

export function parseAchievementLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:成就|achievement|功业)[|：:\s]+/i, '').trim();
    if (!clean) continue;
    const parts = clean.split(/[|：:]/).map(p => p.trim());
    const name = parts[0];
    const desc = parts.slice(1).join(' | ').trim();
    if (name) actions.push({ type: 'achievement', name, desc });
  }
  return actions;
}

export function parseSkillLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:技能|skill|神通|功法)[|：:\s]+/i, '').trim();
    if (!clean) continue;

    const expMatch = clean.match(/^([^\s+|：:]+)\s*(?:[|：:]\s*(?:熟练度|经验)?\s*)?[+](\d+)$/);
    if (expMatch) {
      const name = expMatch[1].trim();
      const exp = parseInt(expMatch[2], 10);
      if (name && !isNaN(exp)) {
        actions.push({ type: 'skill-exp', name, exp });
        continue;
      }
    }

    const parts = clean.split(/[|：:]/).map(p => p.trim());
    const name = parts[0];
    if (!name) continue;

    if (parts.length >= 2 && /^(?:[+]|\+?\d+$|(?:经验|熟练度)\s*[+]?\d+)/i.test(parts[1])) {
      const num = parseInt(parts[1].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) {
        actions.push({ type: 'skill-exp', name, exp: num, desc: parts.slice(2).join(' | ').trim() });
        continue;
      }
    }

    let level = null;
    const descParts = [];
    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i];
      const lvM = seg.match(/^(?:Lv\.?|等级|阶位)?\s*(\d+)(?:级|阶)?$/i);
      if (lvM && level === null && (seg.toLowerCase().includes('lv') || seg.includes('级') || seg.includes('阶'))) {
        level = parseInt(lvM[1], 10);
      } else {
        descParts.push(seg);
      }
    }

    const desc = descParts.join(' | ').trim();
    actions.push({ type: 'skill', name, desc, level });
  }
  return actions;
}

export function parsePerkLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:权限|perk|特权)[|：:\s]+/i, '').trim();
    if (!clean) continue;
    const parts = clean.split(/[|：:]/).map(p => p.trim());
    const name = parts[0];
    const desc = parts.slice(1).join(' | ').trim();
    if (name) actions.push({ type: 'perk', name, desc });
  }
  return actions;
}

export function parseStatLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:属性|stat|状态|数值)[|：:\s]+/i, '').trim();
    if (!clean) continue;
    if (clean.includes('|')) {
      const parts = clean.split('|').map(p => p.trim());
      const name = parts[0];
      const delta = parseInt(parts[1], 10);
      if (name && !isNaN(delta)) {
        actions.push({ type: 'stat', name, delta });
        continue;
      }
    }
    const re = /([\u4e00-\u9fa5a-zA-Z0-9]+)\s*([+-]?\s*\d+)/g;
    let m;
    let matchedAny = false;
    while ((m = re.exec(clean)) !== null) {
      const name = m[1].trim();
      const delta = parseInt(m[2].replace(/\s+/g, ''), 10);
      if (name && !isNaN(delta)) {
        actions.push({ type: 'stat', name, delta });
        matchedAny = true;
      }
    }
    if (!matchedAny) {
      const parts = clean.split(/[：:]/).map(p => p.trim());
      if (parts.length >= 2) {
        const delta = parseInt(parts[1], 10);
        if (parts[0] && !isNaN(delta)) actions.push({ type: 'stat', name: parts[0], delta });
      }
    }
  }
  return actions;
}

export function parseTaskLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:任务|task|使命)[|：:\s]+/i, '').trim();
    if (!clean) clean = line;
    const parts = clean.split('|').map(p => p.trim());
    const head = parts[0];
    if (head === '完成') {
      const id = parts[1];
      if (id) actions.push({ type: 'complete', id });
    } else if (head === '失败') {
      const id = parts[1];
      if (id) actions.push({ type: 'fail', id });
    } else if (head === '进度') {
      const id = parts[1];
      const progress = parseInt(parts[2], 10);
      const reason = parts[3] || '';
      if (id && !isNaN(progress)) actions.push({ type: 'progress', id, progress, reason });
    } else {
      const taskFields = (head === '新任务') ? parts.slice(1) : parts;
      const task = parseTaskLine(taskFields);
      if (task && task.title) actions.push({ type: 'new-task', task });
    }
  }
  return actions;
}

export function parsePointsLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:积分|points|经验)[|：:\s]+/i, '').trim();
    if (!clean) clean = line;
    const parts = clean.split(/[|：:]/).map(p => p.trim());
    const delta = parseInt(parts[0], 10);
    const reason = parts.slice(1).join(' | ').trim();
    if (!isNaN(delta)) {
      actions.push({ type: 'points', delta, reason });
    }
  }
  return actions;
}

export function parseItemLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:道具|item|获得|物品)[|：:\s]+/i, '').trim();
    if (!clean) clean = line;
    const parts = clean.split(/[|：:]/).map(p => p.trim());
    if (parts[0] === '用' || parts[0] === '使用' || parts[0] === '用道具') {
      const name = parts[1] || '';
      if (name) actions.push({ type: 'item-use', name });
      continue;
    }
    const rawName = parts[0];
    let count = parseInt(parts[1], 10);
    let name = rawName;
    const countMatch = rawName.match(/([^\d×x*]+)[×x*](\d+)/);
    if (countMatch) {
      name = countMatch[1].trim();
      count = parseInt(countMatch[2], 10);
    }
    if (isNaN(count) || count <= 0) count = 1;
    if (name) actions.push({ type: 'item-gain', name, count });
  }
  return actions;
}

export function parseBroadcastLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:播报|notice|公告|系统提示)[|：:\s]+/i, '').trim();
    if (!clean) clean = line;
    if (clean) actions.push({ type: 'broadcast', message: clean });
  }
  return actions;
}

export function parseChatLines(raw) {
  const actions = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let clean = line.replace(/^(?:私聊|chat|系统私聊)[|：:\s]+/i, '').trim();
    if (!clean) clean = line;
    const parts = clean.split(/[|：:]/).map(p => p.trim());
    if (parts.length >= 2) {
      actions.push({ type: 'private-chat', sender: parts[0], message: parts.slice(1).join('|') });
    } else if (clean) {
      actions.push({ type: 'private-chat', sender: '系统', message: clean });
    }
  }
  return actions;
}

export function parseOriginActionLine(line) {
  const parts = line.split('|').map(p => p.trim());
  const tag = parts[0];
  switch (tag) {
    case '进度': {
      const id = parts[1];
      const progress = parseInt(parts[2], 10);
      const reason = parts[3] || '';
      if (id && !isNaN(progress)) return { type: 'progress', id, progress, reason };
      break;
    }
    case '完成': {
      const id = parts[1];
      if (id) return { type: 'complete', id };
      break;
    }
    case '失败': {
      const id = parts[1];
      if (id) return { type: 'fail', id };
      break;
    }
    case '新任务': {
      const task = parseTaskLine(parts.slice(1));
      if (task && task.title) return { type: 'new-task', task };
      break;
    }
    case '积分': {
      const delta = parseInt(parts[1], 10);
      const reason = parts[2] || '';
      if (!isNaN(delta)) return { type: 'points', delta, reason };
      break;
    }
    case '属性': {
      const name = parts[1];
      const delta = parseInt(parts[2], 10);
      if (name && !isNaN(delta)) return { type: 'stat', name, delta };
      break;
    }
    case '技能': {
      const name = parts[1];
      if (!name) break;
      if (parts.length >= 3 && /^(?:[+]|\+?\d+$|(?:经验|熟练度)\s*[+]?\d+)/i.test(parts[2])) {
        const exp = parseInt(parts[2].replace(/[^0-9]/g, ''), 10);
        if (!isNaN(exp)) return { type: 'skill-exp', name, exp, desc: parts.slice(3).join('|').trim() };
      }
      const desc = parts[2] || '';
      return { type: 'skill', name, desc };
    }
    case '权限': {
      const name = parts[1];
      const desc = parts[2] || '';
      if (name) return { type: 'perk', name, desc };
      break;
    }
    case '获得': {
      const name = parts[1];
      const count = parseInt(parts[2], 10) || 1;
      if (name) return { type: 'item-gain', name, count };
      break;
    }
    case '用道具': {
      const name = parts[1];
      if (name) return { type: 'item-use', name };
      break;
    }
    case '买': {
      const name = parts[1];
      if (name) return { type: 'buy', name };
      break;
    }
    case '抽奖': {
      return { type: 'gacha' };
    }
    case '成就': {
      const name = parts[1];
      const desc = parts[2] || '';
      if (name) return { type: 'achievement', name, desc };
      break;
    }
    case '播报': {
      const message = parts[1] || '';
      if (message) return { type: 'broadcast', message };
      break;
    }
    case '私聊': {
      const sender = parts[1] || '系统';
      const message = parts[2] || '';
      if (message) return { type: 'private-chat', sender, message };
      break;
    }
    case '新商品': {
      const name = parts[1];
      const price = parseInt(parts[2], 10) || 100;
      const desc = parts[3] || '';
      const effect = parts[4] || '';
      if (name) return { type: 'new-shop-item', item: { name, price, desc, effect } };
      break;
    }
    case '新奖品': {
      const name = parts[1];
      const tier = parts[2] || 'R';
      const weight = parseInt(parts[3], 10) || 10;
      const desc = parts[4] || '';
      const effect = parts[5] || '';
      if (name) return { type: 'new-gacha-item', item: { name, tier, weight, desc, effect } };
      break;
    }
  }
  return null;
}

export function parseModuleTagContent(kind, innerContent) {
  if (!innerContent || innerContent === '无') return [];
  switch (kind) {
    case 'achievement': return parseAchievementLines(innerContent);
    case 'skill': return parseSkillLines(innerContent);
    case 'perk': return parsePerkLines(innerContent);
    case 'stat': return parseStatLines(innerContent);
    case 'task': return parseTaskLines(innerContent);
    case 'points': return parsePointsLines(innerContent);
    case 'item': return parseItemLines(innerContent);
    case 'broadcast': return parseBroadcastLines(innerContent);
    case 'chat': return parseChatLines(innerContent);
    case 'origin':
    default: {
      const actions = [];
      const lines = innerContent.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const act = parseOriginActionLine(line);
        if (act) actions.push(act);
      }
      return actions;
    }
  }
}

export function parseAllOriginTags(text, moduleTags = null, legacyTagRegex = null) {
  if (!text || typeof text !== 'string') return null;
  const { tagMap, combinedRegex, legacyCustomRe } = buildModuleTagMatcher(moduleTags, legacyTagRegex);

  const actions = [];
  const allLines = [];
  const rawParts = [];
  const tagMatches = [];

  let m;
  const re = new RegExp(combinedRegex.source, combinedRegex.flags);
  while ((m = re.exec(text)) !== null) {
    const fullTag = m[0];
    const tagName = m[1].toLowerCase();
    const innerContent = (m[2] || '').trim();
    const kind = tagMap.get(tagName) || 'origin';

    rawParts.push(innerContent);
    tagMatches.push({ tag: m[1], kind, fullMatch: fullTag, inner: innerContent });

    if (!innerContent || innerContent === '无') continue;

    const moduleActions = parseModuleTagContent(kind, innerContent);
    actions.push(...moduleActions);

    const lines = innerContent.split('\n').map(l => l.trim()).filter(Boolean);
    allLines.push(...lines);
  }

  if (tagMatches.length === 0 && legacyCustomRe) {
    const legacyRe = resolveTagRegex(legacyCustomRe, false);
    const lm = text.match(legacyRe);
    if (lm) {
      const raw = (lm[1] !== undefined ? lm[1] : lm[0]).trim();
      tagMatches.push({ tag: 'legacy', kind: 'origin', fullMatch: lm[0], inner: raw });
      rawParts.push(raw);
      if (raw && raw !== '无') {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        allLines.push(...lines);
        for (const line of lines) {
          const act = parseOriginActionLine(line);
          if (act) actions.push(act);
        }
      }
    }
  }

  const hasMatchedTags = tagMatches.length > 0;
  const raw = rawParts.join('\n');

  return {
    hasMatchedTags,
    raw,
    lines: allLines,
    actions,
    tagMatches,
  };
}

export function parseOriginBlock(text, customRegex = DEFAULT_TAG_REGEX, moduleTags = null) {
  if (!text || typeof text !== 'string') return null;
  const res = parseAllOriginTags(text, moduleTags, customRegex);
  if (!res || !res.hasMatchedTags) return null;
  return {
    raw: res.raw,
    lines: res.lines,
    actions: res.actions,
    hasMatchedTags: res.hasMatchedTags,
    tagMatches: res.tagMatches,
  };
}

function parseTaskLine(fields) {
  const task = {
    type: '支线',
    title: '',
    desc: '',
    cond: '',
    reward: '',
    penalty: '',
    limit: 0,
    owner: '宿主',
    progress: 0,
    status: 'active',
  };
  const hasKey = fields.some(f => f.includes(':') || f.includes('：'));
  if (!hasKey && fields.length >= 2) {
    const isType = ['主线', '支线', '日常'].includes(fields[0]);
    if (isType) {
      task.type = fields[0];
      task.title = fields[1] || '';
      task.cond = fields[2] || '';
      task.reward = fields[3] || '';
      task.penalty = fields[4] || '';
      const limitRaw = String(fields[5] || '');
      task.limit = parseInt(limitRaw.replace(/[^0-9]/g, ''), 10) || 0;
    } else {
      task.title = fields[0] || '';
      task.cond = fields[1] || '';
      task.reward = fields[2] || '';
      task.penalty = fields[3] || '';
      const limitRaw = String(fields[4] || '');
      task.limit = parseInt(limitRaw.replace(/[^0-9]/g, ''), 10) || 0;
    }
    return task;
  }
  for (const f of fields) {
    const colon = f.indexOf(':') !== -1 ? f.indexOf(':') : f.indexOf('：');
    if (colon === -1) continue;
    const k = f.slice(0, colon).trim();
    const v = f.slice(colon + 1).trim();
    switch (k) {
      case '类型': task.type = v; break;
      case '标题': task.title = v; break;
      case '描述': task.desc = v; break;
      case '条件': task.cond = v; break;
      case '奖励': task.reward = v; break;
      case '惩罚': task.penalty = v; break;
      case '时限': task.limit = parseInt(v.replace(/[^0-9]/g, ''), 10) || 0; break;
      case '对象': task.owner = v; break;
    }
  }
  return task;
}

export function applyOriginBlock(state, block, { currentTurn = 0 } = {}) {
  if (!state || !block || !Array.isArray(block.actions)) return { broadcasts: [], privateChats: [] };

  const broadcasts = [];
  const privateChats = [];

  for (const act of block.actions) {
    switch (act.type) {
      case 'progress': {
        const t = state.tasks?.find(x => String(x.id) === String(act.id));
        if (t && t.status === 'active') {
          t.progress = Math.min(100, Math.max(0, act.progress));
          if (t.progress >= 100) completeOriginTask(state, t.id);
          else if (act.reason) pushOriginLog(state, `任务「${t.title}」进度: ${t.progress}%（${act.reason}）`, 'progress');
        }
        break;
      }
      case 'complete': {
        completeOriginTask(state, act.id);
        break;
      }
      case 'fail': {
        failOriginTask(state, act.id);
        break;
      }
      case 'new-task': {
        state.tasks = state.tasks || [];
        const newId = state.nextId || (state.tasks.length + 1);
        state.nextId = newId + 1;
        const task = {
          ...act.task,
          id: newId,
          startTurn: currentTurn,
          progress: 0,
          status: 'active',
        };
        state.tasks.push(task);
        state.lastTaskTurn = currentTurn;
        pushOriginLog(state, `发布新任务「${task.title}」[${task.type}]`, 'new-task');
        broadcasts.push(`【系统新任务】[${task.type}] ${task.title}：${task.cond || task.desc || ''}`);
        break;
      }
      case 'points': {
        state.points = Math.max(0, (state.points || 0) + act.delta);
        pushOriginLog(state, `积分变动 ${act.delta >= 0 ? `+${act.delta}` : act.delta}${act.reason ? `（${act.reason}）` : ''}`, 'points');
        break;
      }
      case 'stat': {
        applyStatEffect(state, `${act.name}${act.delta >= 0 ? `+${act.delta}` : act.delta}`);
        pushOriginLog(state, `属性变动: ${act.name} ${act.delta >= 0 ? `+${act.delta}` : act.delta}`, 'stat');
        break;
      }
      case 'skill': {
        state.skills = state.skills || [];
        let s = state.skills.find(x => x.name === act.name);
        if (!s) {
          s = {
            name: act.name,
            desc: act.desc || '',
            level: act.level ? Math.max(1, Number(act.level)) : null,
            exp: act.level ? 0 : null,
            expMax: act.level ? 100 : null,
          };
          state.skills.push(s);
          pushOriginLog(state, `掌握新技能「${act.name}」`, 'skill');
        } else {
          if (act.desc) s.desc = act.desc;
          if (act.level) s.level = act.level;
        }
        break;
      }
      case 'skill-exp': {
        gainSkillExp(state, act.name, act.exp);
        break;
      }
      case 'perk': {
        state.perks = state.perks || [];
        if (!state.perks.some(p => p.name === act.name)) {
          state.perks.push({ name: act.name, desc: act.desc });
          pushOriginLog(state, `解锁新特权「${act.name}」`, 'perk');
        }
        break;
      }
      case 'item-gain': {
        addItemToBag(state, { name: act.name, count: act.count });
        pushOriginLog(state, `获得物品「${act.name}」×${act.count}`, 'item-gain');
        break;
      }
      case 'item-use': {
        try { useBagItem(state, act.name); } catch (_) {}
        break;
      }
      case 'buy': {
        try { buyShopItem(state, act.name); } catch (_) {}
        break;
      }
      case 'gacha': {
        try { performGachaDraw(state, 1, false); } catch (_) {}
        break;
      }
      case 'achievement': {
        unlockAchievement(state, { name: act.name, desc: act.desc });
        broadcasts.push(`【达成成就】${act.name}${act.desc ? `：${act.desc}` : ''}`);
        break;
      }
      case 'broadcast': {
        broadcasts.push(act.message);
        pushOriginLog(state, act.message, 'broadcast');
        break;
      }
      case 'private-chat': {
        privateChats.push({ sender: act.sender, message: act.message });
        break;
      }
      case 'new-shop-item': {
        state.shop = state.shop || [];
        if (!state.shop.some(x => x.name === act.item.name)) {
          state.shop.push(act.item);
        }
        state.lastShopTurn = currentTurn;
        break;
      }
      case 'new-gacha-item': {
        state.gachaPool = state.gachaPool || [];
        state.gachaPool.push(act.item);
        state.lastGachaTurn = currentTurn;
        break;
      }
    }
  }

  // 清空已消耗的 pending
  state.pendingUse = [];
  state.pendingEvent = [];

  return { broadcasts, privateChats };
}

export function stripAllOriginTags(text, moduleTags = null, legacyTagRegex = null) {
  if (!text || typeof text !== 'string') return '';
  const { combinedRegex, legacyCustomRe } = buildModuleTagMatcher(moduleTags, legacyTagRegex);
  let cleaned = text.replace(combinedRegex, '');
  if (legacyCustomRe) {
    cleaned = cleaned.replace(legacyCustomRe, '');
  }
  return cleaned.trim();
}

export function stripOriginBlock(text, customRegex = DEFAULT_TAG_REGEX, moduleTags = null) {
  if (!text || typeof text !== 'string') return '';
  return stripAllOriginTags(text, moduleTags, customRegex);
}
