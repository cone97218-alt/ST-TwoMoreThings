import {
  resolvePersona,
  taskRemainingTurns,
  completeOriginTask,
  failOriginTask,
  checkOriginExpiry,
  applyStatEffect,
  gainOriginExp,
  addItemToBag,
  useBagItem,
  buyShopItem,
  performGachaDraw,
  unlockAchievement,
  pushOriginLog,
} from './origin-engine.js';

export function buildOriginInjection(state, { currentTurn = 0 } = {}) {
  if (!state || !state.enabled || state.paused) return '';
  checkOriginExpiry(state, currentTurn);

  const sysName = state.sysName || '系统';
  const hostName = (state.bindTo && state.bindTo !== '宿主') ? state.bindTo : '';
  const autoEcon = state.autoEcon || Boolean(hostName);

  let out = `【${sysName} 状态】\n`;
  if (hostName) {
    out += `★本系统绑定的是角色【${hostName}】，不是宿主(user)。任务/积分/属性/成就都属于 ${hostName}；请让 ${hostName} 像突然获得金手指系统的主角那样思考、并主动推进系统任务。宿主(user)是旁观者或其他在场角色，系统不向 user 派任务、也不对 user 说话（除非 user 正在扮演 ${hostName}）。\n`;
  }
  out += `世界：${state.world || '未设定'}\n`;
  out += `积分：${state.points || 0} ｜ 等级 Lv.${state.level || 1}\n`;

  if (state.mods?.stat && Array.isArray(state.stats) && state.stats.length) {
    out += `属性：${state.stats.map(x => `${x.name}${x.val >= 0 ? '+' : ''}${x.val}`).join(' ')}\n`;
  }
  if (Array.isArray(state.perks) && state.perks.length) {
    out += `${hostName || '宿主'}已开启的权限/特权（永久有效）：${state.perks.map(k => `${k.name}${k.desc ? `（${k.desc}）` : ''}`).join('；')}\n`;
  }
  if (Array.isArray(state.skills) && state.skills.length) {
    out += `${hostName || '宿主'}已掌握的技能（永久持有，写剧情时要体现起作用）：${state.skills.map(k => `${k.name}${k.desc ? `（${k.desc}）` : ''}`).join('；')}\n`;
  }

  const active = (state.tasks || []).filter(t => t.status === 'active');
  const fmtT = t => {
    const rem = taskRemainingTurns(t, currentTurn);
    return `  [${t.type}#${t.id}] ${t.title}（进度${t.progress || 0}%${rem !== null ? `，剩${rem}回合` : ''}）｜要求:${t.cond || '—'}${t.reward ? `｜奖:${t.reward}` : ''}${t.penalty ? `｜罚:${t.penalty}` : ''}\n`;
  };

  const primary = hostName || '宿主';
  const mine = active.filter(t => (t.owner || '宿主') === primary);
  const theirs = active.filter(t => (t.owner || '宿主') !== primary);

  out += `${hostName ? `【${hostName}】` : '宿主(user)'}的进行中任务：\n`;
  if (mine.length) {
    for (const t of mine) out += fmtT(t);
  } else {
    out += '  （暂无）\n';
  }

  if (theirs.length) {
    out += '系统给角色布置的任务（请让对应角色在剧情里自己朝这些目标行动）：\n';
    for (const t of theirs) out += `  【给${t.owner}】${fmtT(t).trimStart()}`;
  }

  if (state.mods?.bag && Array.isArray(state.bag) && state.bag.length) {
    out += `${hostName || '宿主'}背包：${state.bag.map(b => `${b.name}×${b.count || 1}`).join('，')}\n`;
  }

  if (autoEcon && state.mods?.shop && Array.isArray(state.shop) && state.shop.length) {
    out += `商城（可花积分买，当前积分${state.points || 0}）：${state.shop.slice(0, 8).map(x => `${x.name}(${x.price})`).join(' ／ ')}\n`;
  }

  if (Array.isArray(state.pendingUse) && state.pendingUse.length) {
    out += `【本回合宿主动作】${state.pendingUse.map(u => `使用了道具「${u.name}」${u.desc ? `（${u.desc}）` : ''}`).join('；')}——请让剧情与角色对此作出合理反应。\n`;
  }
  if (Array.isArray(state.pendingEvent) && state.pendingEvent.length) {
    out += `【本回合系统事件】${state.pendingEvent.join('；')}——请把它自然写进正文。\n`;
  }

  // 任务生成指引
  out += '\n【本回合系统指引与规则】\n';
  out += '0. 写完正文后，若进行了任务推进或获得了系统奖惩，必须在末尾输出 <origin> 数据块。\n';
  out += '1. 依据正文里实际发生的事更新任务进度；若完成条件达成，请输出『完成|任务id』。禁止替宿主无理由自动完结。\n';

  const freq = state.freq || 3;
  const allowNew = (currentTurn - (state.lastTaskTurn || -99) >= freq) &&
    (!state.blockWhenUnfinished || !active.some(t => t.type === '主线' || t.type === '支线'));

  if (state.taskSource === 'manual') {
    out += '2. 本回合不要自动发布新任务（用户设置为手动）。\n';
  } else if (allowNew) {
    if (!active.length) {
      out += '2. 当前无任务：请在本回合发起 1 个贴合当前情境的新任务（优先主线）。';
    } else {
      out += '2. 允许发布新任务：若当前剧情合适，可发起 1 个新任务（主线/支线/日常）。';
    }
    if (state.direction) out += ` 宿主期望的任务方向：${state.direction}。`;
    out += '\n';
  } else {
    out += '2. 本回合不要发布新任务。\n';
  }

  if (state.fourthWall > 0) {
    out += `3. 第四面墙：有约 ${state.fourthWall}% 的几率，系统可短暂吐槽一句打破第四面墙。\n`;
  } else {
    out += '3. 不要打破第四面墙。\n';
  }

  out += `4. 系统说话口吻：${resolvePersona(state)}\n`;
  out += '5. 奖励是对宿主有利的（加积分/属性/道具/技能），惩罚是不利的。\n';
  if (state.rewardPref) out += `6. 奖励偏好：${state.rewardPref}。\n`;
  if (state.penaltyPref) out += `7. 惩罚偏好：${state.penaltyPref}。\n`;

  out += '\n【输出】在回复最末尾另起一行，输出数据块（此块不属于正文，不向读者展示）：\n';
  out += '<origin>\n';
  out += '进度|任务id|新百分比0-100|依据\n';
  out += '完成|任务id\n';
  out += '失败|任务id\n';
  out += '新任务|类型:主线或支线或日常|标题:…|描述:…|条件:…|奖励:积分300|惩罚:…|时限:整数|对象:宿主或角色名\n';
  out += '积分|+N或-N|理由\n';
  out += '属性|名称|+N或-N\n';
  out += '获得|名称|数量\n';
  out += '用道具|名称\n';
  out += '播报|一句系统口吻的话\n';
  out += '私聊|系统 或 角色名|一句话\n';
  out += '成就|名称|说明\n';
  out += '</origin>\n';

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

export function parseOriginBlock(text, customRegex = DEFAULT_TAG_REGEX) {
  if (!text || typeof text !== 'string') return null;
  const re = resolveTagRegex(customRegex, false);
  const match = text.match(re);
  if (!match) return null;
  const raw = (match[1] !== undefined ? match[1] : match[0]).trim();
  if (!raw || raw === '无') return { raw, lines: [], actions: [] };

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const actions = [];

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());
    const tag = parts[0];
    switch (tag) {
      case '进度': {
        const id = parts[1];
        const progress = parseInt(parts[2], 10);
        const reason = parts[3] || '';
        if (id && !isNaN(progress)) actions.push({ type: 'progress', id, progress, reason });
        break;
      }
      case '完成': {
        const id = parts[1];
        if (id) actions.push({ type: 'complete', id });
        break;
      }
      case '失败': {
        const id = parts[1];
        if (id) actions.push({ type: 'fail', id });
        break;
      }
      case '新任务': {
        const task = parseTaskLine(parts.slice(1));
        if (task && task.title) actions.push({ type: 'new-task', task });
        break;
      }
      case '积分': {
        const delta = parseInt(parts[1], 10);
        const reason = parts[2] || '';
        if (!isNaN(delta)) actions.push({ type: 'points', delta, reason });
        break;
      }
      case '属性': {
        const name = parts[1];
        const delta = parseInt(parts[2], 10);
        if (name && !isNaN(delta)) actions.push({ type: 'stat', name, delta });
        break;
      }
      case '技能': {
        const name = parts[1];
        const desc = parts[2] || '';
        if (name) actions.push({ type: 'skill', name, desc });
        break;
      }
      case '权限': {
        const name = parts[1];
        const desc = parts[2] || '';
        if (name) actions.push({ type: 'perk', name, desc });
        break;
      }
      case '获得': {
        const name = parts[1];
        const count = parseInt(parts[2], 10) || 1;
        if (name) actions.push({ type: 'item-gain', name, count });
        break;
      }
      case '用道具': {
        const name = parts[1];
        if (name) actions.push({ type: 'item-use', name });
        break;
      }
      case '买': {
        const name = parts[1];
        if (name) actions.push({ type: 'buy', name });
        break;
      }
      case '抽奖': {
        actions.push({ type: 'gacha' });
        break;
      }
      case '成就': {
        const name = parts[1];
        const desc = parts[2] || '';
        if (name) actions.push({ type: 'achievement', name, desc });
        break;
      }
      case '播报': {
        const message = parts[1] || '';
        if (message) actions.push({ type: 'broadcast', message });
        break;
      }
      case '私聊': {
        const sender = parts[1] || '系统';
        const message = parts[2] || '';
        if (message) actions.push({ type: 'private-chat', sender, message });
        break;
      }
      case '新商品': {
        const name = parts[1];
        const price = parseInt(parts[2], 10) || 100;
        const desc = parts[3] || '';
        const effect = parts[4] || '';
        if (name) actions.push({ type: 'new-shop-item', item: { name, price, desc, effect } });
        break;
      }
      case '新奖品': {
        const name = parts[1];
        const tier = parts[2] || 'R';
        const weight = parseInt(parts[3], 10) || 10;
        const desc = parts[4] || '';
        const effect = parts[5] || '';
        if (name) actions.push({ type: 'new-gacha-item', item: { name, tier, weight, desc, effect } });
        break;
      }
    }
  }

  return { raw, lines, actions };
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
        if (!state.skills.some(s => s.name === act.name)) {
          state.skills.push({ name: act.name, desc: act.desc });
          pushOriginLog(state, `掌握新技能「${act.name}」`, 'skill');
        }
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

export function stripOriginBlock(text, customRegex = DEFAULT_TAG_REGEX) {
  if (!text || typeof text !== 'string') return '';
  const re = resolveTagRegex(customRegex, true);
  return text.replace(re, '').trim();
}
