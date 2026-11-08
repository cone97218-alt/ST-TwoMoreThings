export const ORIGIN_MOD = 'origin';
export const SYSTEM_CONTACT_ID = 'contact:origin-system';

export const DEFAULT_GACHA_CATALOG = [
  // N 阶 (日常实用物资)
  { name: '日常物资包', tier: 'N', weight: 45, desc: '生活日用物资组合', effect: '积分+50' },
  { name: '帆布环保袋', tier: 'N', weight: 45, desc: '朴素耐用的大容量提袋', effect: '积分+30' },
  { name: '多功能小刀', tier: 'N', weight: 40, desc: '便携实用的随身工具', effect: '力量+1' },
  { name: '纯净矿泉水', tier: 'N', weight: 40, desc: '清甜解渴的瓶装水', effect: '状态微复' },
  { name: '泛黄旧便签', tier: 'N', weight: 35, desc: '记录着零碎线索的便签页', effect: '积分+40' },
  // R 阶 (基础资源与增益)
  { name: '闪烁星石', tier: 'R', weight: 28, desc: '散发柔润微光的幸运石', effect: '积分+200' },
  { name: '精力冲剂', tier: 'R', weight: 26, desc: '快速补充体能与充沛精力', effect: '体魄+2' },
  { name: '舒缓草本茶', tier: 'R', weight: 25, desc: '香气怡人的健康茶饮', effect: '心境平静' },
  { name: '荧光钥匙扣', tier: 'R', weight: 22, desc: '在暗处散发温润微光的小挂件', effect: '积分+150' },
  { name: '安神香薰包', tier: 'R', weight: 20, desc: '令身心放松的舒缓香包', effect: '情绪舒缓' },
  // SR 阶 (潜能激发与特殊能力)
  { name: '潜能激活胶囊', tier: 'SR', weight: 15, desc: '激发个人魅力与从容谈吐', effect: '魅力+5' },
  { name: '敏锐怀表', tier: 'SR', weight: 14, desc: '指针精准，行动时刻领先一步', effect: '敏捷+5' },
  { name: '灵感手账', tier: 'SR', weight: 12, desc: '捕捉灵光一闪的思路与策略', effect: '智力+5' },
  { name: '防身喷雾', tier: 'SR', weight: 10, desc: '关键时刻化解正面肢体冲突', effect: '力量+5' },
  // SSR 阶 (关键机缘与深度羁绊)
  { name: '心动告白信', tier: 'SSR', weight: 6, desc: '直击心灵的情感共鸣道具', effect: '好感+30' },
  { name: '全能进阶卡', tier: 'SSR', weight: 5, desc: '个人综合素养的全面跃升', effect: '全属性+3' },
  { name: '洞察之镜', tier: 'SSR', weight: 4, desc: '一眼洞悉局势暗流与隐藏心思', effect: '局势洞察' },
  { name: '羁绊手绳', tier: 'SSR', weight: 4, desc: '加深彼此不可割舍的心灵牵绊', effect: '好感+35' },
  // UR 阶 (改命特权与至尊道具)
  { name: '逆转契机卡', tier: 'UR', weight: 1, desc: '一次扭转既定局面的破局契机', effect: '剧情逆转' },
  { name: '时空回溯表', tier: 'UR', weight: 1, desc: '掌控关键因果节律的神奇怀表', effect: '时空掌控' },
  { name: '绝对庇佑守护', tier: 'UR', weight: 1, desc: '无论遭遇何种困境均能全身而退', effect: '永久庇佑' },
];

export const DEFAULT_GACHA = [
  DEFAULT_GACHA_CATALOG[0],
  DEFAULT_GACHA_CATALOG[5],
  DEFAULT_GACHA_CATALOG[10],
  DEFAULT_GACHA_CATALOG[14],
  DEFAULT_GACHA_CATALOG[18],
];

export const DEFAULT_SHOP_CATALOG = [
  { name: '活力功能饮', price: 150, desc: '快速驱散疲惫，提振精神活力', effect: '精力恢复' },
  { name: '伪装口罩', price: 300, desc: '低调隐匿面容，避免被熟人认出', effect: '隐匿伪装' },
  { name: '魅力香水', price: 600, desc: '散发令人心动的宜人气息，魅力显著提升', effect: '魅力+5' },
  { name: '心意巧克盒', price: 400, desc: '赠送后使目标对象对你的好感度显著提升', effect: '好感+15' },
  { name: '悔棋时光券', price: 1200, desc: '【核心特权】重置或回溯本回合抉择，从头再来', effect: '时空回溯' },
  { name: '幸运扭蛋券', price: 300, desc: '立刻免费抽取一次祈愿池', effect: '祈愿一次' },
  { name: '塑形健身卡', price: 800, desc: '强化基础身体机能，体魄永久提升', effect: '体魄+5' },
  { name: '深思手账本', price: 500, desc: '理清复杂思路与线索，智力与洞察提升', effect: '智力+5' },
  { name: '静音耳机', price: 350, desc: '屏蔽外界杂乱干扰，情绪保持绝对冷静', effect: '心境专注' },
  { name: '真心话卡牌', price: 450, desc: '促使目标在接下来的对话中坦露真实心迹', effect: '真言吐露' },
  { name: '轻便跑鞋', price: 600, desc: '行动迅速敏捷，行动效率提升', effect: '敏捷+5' },
  { name: '百搭造型包', price: 250, desc: '一秒换上完美契合当前社交场合的得体装扮', effect: '形象焕新' },
  { name: '真心红绳', price: 750, desc: '加深彼此心中的羁绊与隐秘情愫', effect: '好感+25' },
  { name: '关键转机卡', price: 1500, desc: '【破局道具】在局面陷入僵局或困境时带来意外转机', effect: '绝境破局' },
  { name: '镇静薄荷糖', price: 200, desc: '压制紧张慌乱与负面焦虑情绪', effect: '情绪抗性+10' },
  { name: '秘密便签纸', price: 100, desc: '留下只有特定人能心领神会的隐秘讯息', effect: '隐秘传讯' },
  { name: '免责金牌', price: 2000, desc: '【终极特权】抵消一次任务失败惩罚或严重负面后果', effect: '惩罚豁免' },
  { name: '录音笔', price: 300, desc: '完整留存关键对话证据或动人时刻的声音', effect: '证据留存' },
];

export const DEFAULT_SHOP = DEFAULT_SHOP_CATALOG.slice(0, 6);

export const DEFAULT_PERSONAS = {
  冷澈: '冷静、克制、公事公办，偶尔一针见血。',
  毒舌: '爱吐槽、损，但损得有分寸，刀子嘴豆腐心。',
  傲娇: '嘴上嫌弃、其实上心，会别扭地关心宿主。',
  温和: '温和耐心，像个可靠的向导。',
};

export const DEFAULT_ORIGIN_TEMPLATES = {
  panel: `【{{sysName}} 状态】\n世界：{{world}}\n积分：{{points}} ｜ 等级 Lv.{{level}}\n属性：{{stats}}\n{{skills}}`,
  tasks: `宿主进行中任务：\n{{tasks}}`,
  inventory: `宿主背包：{{bag}}\n商城（可花积分买）：{{shop}}`,
  action: `{{actions}}`,
  rules: `【本回合系统指引与规则】\n1. 依据正文里实际发生的事更新任务进度；若完成条件达成，请输出『完成|任务id』。禁止替宿主无理由自动完结。\n2. 允许结合情境发布新任务，宿主期望方向：{{direction}}\n3. 系统说话口吻：{{persona}}`,
  output: `【输出】在回复最末尾另起一行，输出数据块（此块不属于正文，不向读者展示）：\n<origin>\n进度|任务id|新百分比0-100|依据\n完成|任务id\n失败|任务id\n新任务|类型:主线或支线或日常|标题:…|描述:…|条件:…|奖励:积分300|惩罚:…|时限:整数|对象:宿主或角色名\n积分|+N或-N|理由\n属性|名称|+N或-N\n获得|名称|数量\n用道具|名称\n播报|一句系统口吻的话\n私聊|系统 或 角色名|一句话\n成就|名称|说明\n</origin>`,
};

export function defaultOriginSections() {
  return {
    panel: { enabled: true, template: DEFAULT_ORIGIN_TEMPLATES.panel },
    tasks: { enabled: true, template: DEFAULT_ORIGIN_TEMPLATES.tasks },
    inventory: { enabled: true, template: DEFAULT_ORIGIN_TEMPLATES.inventory },
    action: { enabled: true, template: DEFAULT_ORIGIN_TEMPLATES.action },
    rules: { enabled: true, template: DEFAULT_ORIGIN_TEMPLATES.rules },
    output: { enabled: true, template: DEFAULT_ORIGIN_TEMPLATES.output },
  };
}

export function defaultOriginModuleTags() {
  return {
    origin: 'origin, 系统',
    task: '任务, task, 使命',
    stat: '属性, stat, 状态, 数值',
    skill: '技能, skill, 神通, 功法',
    perk: '权限, perk, 特权',
    item: '道具, item, 获得, 物品',
    points: '积分, points, 经验',
    achievement: '成就, achievement, 功业',
    broadcast: '播报, notice, 公告, 系统提示',
    chat: '私聊, chat, 系统私聊',
  };
}

export function defaultOriginSettings() {
  return {
    enabled: false,
    judgeMode: 'A',
    freq: 3,
    blockWhenUnfinished: true,
    taskSource: 'auto',
    fourthWall: 0,
    sysName: '系统',
    personality: '冷澈',
    personaText: '',
    accent: '#d4883b',
    rewardPref: '',
    penaltyPref: '',
    bindTo: '宿主',
    autoEcon: false,
    budget: 1400,
    drawCost: 300,
    limitMin: 0,
    limitMax: 0,
    punishEvent: true,
    achieveOn: true,
    shopRefresh: 0,
    gachaRefresh: 0,
    tagRegex: '<(?:origin|系统)>([\\s\\S]*?)</(?:origin|系统)>',
    storyRegex: '【(?:叮[！!]|系统).*?】',
    moduleTags: defaultOriginModuleTags(),
    sections: defaultOriginSections(),
    mods: {
      stat: true,
      bag: true,
      shop: true,
      gacha: true,
      ach: true,
      chat: true,
    },
  };
}

export function defaultOriginState() {
  return {
    ...defaultOriginSettings(),
    world: '',
    points: 0,
    level: 1,
    exp: 0,
    expMax: 100,
    stats: [],
    tasks: [],
    log: [],
    lastTaskTurn: -99,
    lastShopTurn: -99,
    lastGachaTurn: -99,
    direction: '',
    nextId: 1,
    bag: [],
    shopCatalog: [],
    gachaCatalog: [],
    shop: [],
    gachaPool: [],
    pendingUse: [],
    pendingEvent: [],
    achievements: [],
    skills: [],
    perks: [],
    rewardsLog: [],
  };
}

export function normalizeOriginState(raw) {
  const fallback = defaultOriginState();
  if (!raw || typeof raw !== 'object') return fallback;
  const merged = { ...fallback, ...raw };
  merged.mods = { ...fallback.mods, ...(raw.mods || {}) };
  const defaultTags = defaultOriginModuleTags();
  const rawTags = (raw && typeof raw.moduleTags === 'object' && raw.moduleTags !== null) ? raw.moduleTags : {};
  merged.moduleTags = {};
  for (const key of Object.keys(defaultTags)) {
    merged.moduleTags[key] = (rawTags[key] !== undefined && rawTags[key] !== null) ? String(rawTags[key]) : defaultTags[key];
  }
  const defaultSections = defaultOriginSections();
  const rawSections = (raw && typeof raw.sections === 'object' && raw.sections !== null) ? raw.sections : {};
  merged.sections = {};
  for (const key of Object.keys(defaultSections)) {
    merged.sections[key] = {
      enabled: rawSections[key]?.enabled !== false,
      template: rawSections[key]?.template !== undefined ? String(rawSections[key].template) : defaultSections[key].template,
    };
  }
  if (!Array.isArray(merged.tasks)) merged.tasks = [];
  if (!Array.isArray(merged.stats)) merged.stats = [];
  if (!Array.isArray(merged.bag)) merged.bag = [];
  if (!Array.isArray(merged.shopCatalog)) merged.shopCatalog = [];
  if (!Array.isArray(merged.shop)) merged.shop = [];
  if (!Array.isArray(merged.gachaCatalog)) merged.gachaCatalog = [];
  if (!Array.isArray(merged.gachaPool)) merged.gachaPool = [];
  if (!Array.isArray(merged.pendingUse)) merged.pendingUse = [];
  if (!Array.isArray(merged.pendingEvent)) merged.pendingEvent = [];
  if (!Array.isArray(merged.achievements)) merged.achievements = [];
  if (!Array.isArray(merged.skills)) merged.skills = [];
  merged.skills = merged.skills.map(s => {
    if (!s || typeof s !== 'object') return { name: String(s || ''), desc: '', level: null, exp: null, expMax: null };
    return {
      name: String(s.name || ''),
      desc: String(s.desc || ''),
      level: (s.level !== undefined && s.level !== null && s.level !== '') ? Math.max(1, Number(s.level) || 1) : null,
      exp: (s.exp !== undefined && s.exp !== null && s.exp !== '') ? Math.max(0, Number(s.exp) || 0) : null,
      expMax: (s.expMax !== undefined && s.expMax !== null && s.expMax !== '') ? Math.max(1, Number(s.expMax) || 100) : null,
    };
  });
  if (!Array.isArray(merged.perks)) merged.perks = [];
  if (!Array.isArray(merged.log)) merged.log = [];
  merged.points = Number(merged.points) || 0;
  merged.level = Math.max(1, Number(merged.level) || 1);
  merged.exp = Math.max(0, Number(merged.exp) || 0);
  merged.expMax = Math.max(10, Number(merged.expMax) || 100);
  merged.nextId = Math.max(1, Number(merged.nextId) || (merged.tasks.length + 1));
  merged.currentTurn = Number(merged.currentTurn) || 0;
  return merged;
}

export function resolvePersona(state) {
  if (state?.personaText && state.personaText.trim()) return state.personaText.trim();
  return DEFAULT_PERSONAS[state?.personality] || DEFAULT_PERSONAS.冷澈;
}

export function taskRemainingTurns(task, currentTurn = 0) {
  if (!task || task.limit === undefined || task.limit === null) return null;
  const numLimit = parseInt(String(task.limit).replace(/[^0-9]/g, ''), 10);
  if (isNaN(numLimit) || numLimit <= 0) return null;
  const start = parseInt(String(task.startTurn ?? task.turn ?? currentTurn).replace(/[^0-9]/g, ''), 10) || 0;
  const curr = parseInt(String(currentTurn).replace(/[^0-9]/g, ''), 10) || 0;
  const elapsed = Math.max(0, curr - start);
  return Math.max(0, numLimit - elapsed);
}

export function isTaskExpired(task, currentTurn = 0) {
  const rem = taskRemainingTurns(task, currentTurn);
  return rem !== null && rem <= 0;
}

export function pushOriginLog(state, text, type = 'info') {
  if (!state || !text) return;
  state.log = state.log || [];
  state.log.unshift({
    text: String(text),
    type,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  });
  if (state.log.length > 50) state.log.length = 50;
}

export function applyStatEffect(state, effectText, multiplier = 1) {
  if (!state || !effectText) return;
  const str = String(effectText).trim();

  // Match forms like 积分300, 积分+50, 积分-50
  const rePoints = /积分\s*([+-]?\s*\d+)/g;
  let m;
  while ((m = rePoints.exec(str)) !== null) {
    const numStr = m[1].replace(/\s+/g, '');
    const rawVal = parseInt(numStr, 10);
    if (!isNaN(rawVal)) {
      const hasSign = /^[+-]/.test(numStr);
      const delta = hasSign ? rawVal : rawVal * multiplier;
      state.points = Math.max(0, (state.points || 0) + delta);
    }
  }

  // Match stats like 魅力+5, 力量-2, 敏捷5
  const reStats = /([\u4e00-\u9fa5a-zA-Z0-9]+)\s*([+-]?\s*\d+)/g;
  while ((m = reStats.exec(str)) !== null) {
    const name = m[1].trim();
    if (name === '积分' || !name) continue;
    const numStr = m[2].replace(/\s+/g, '');
    const rawVal = parseInt(numStr, 10);
    if (isNaN(rawVal)) continue;
    const hasSign = /^[+-]/.test(numStr);
    const delta = hasSign ? rawVal : rawVal * multiplier;
    state.stats = state.stats || [];
    const stat = state.stats.find(s => s.name === name);
    if (stat) {
      stat.val = (Number(stat.val) || 0) + delta;
    } else {
      state.stats.push({ name, val: delta });
    }
  }
}

export function completeOriginTask(state, taskId) {
  const task = state.tasks?.find(t => String(t.id) === String(taskId));
  if (!task || task.status !== 'active') return null;
  task.status = 'done';
  task.progress = 100;
  if (task.reward) applyStatEffect(state, task.reward, 1);
  const expGain = task.type === '主线' ? 50 : task.type === '支线' ? 25 : 10;
  gainOriginExp(state, expGain);
  pushOriginLog(state, `完成任务「${task.title}」${task.reward ? `（${task.reward}）` : ''}`, 'success');
  return task;
}

export function failOriginTask(state, taskId, reason = '') {
  const task = state.tasks?.find(t => String(t.id) === String(taskId));
  if (!task || task.status !== 'active') return null;
  task.status = 'failed';
  if (task.penalty) applyStatEffect(state, task.penalty, -1);
  pushOriginLog(state, `任务「${task.title}」失败${task.penalty ? `：${task.penalty}` : ''}${reason ? ` (${reason})` : ''}`, 'warning');
  if (state.punishEvent) {
    state.pendingEvent = state.pendingEvent || [];
    state.pendingEvent.push(`任务「${task.title}」失败${task.penalty ? `（${task.penalty}）` : ''}，请让剧情出现一个相称的不利后果${state.penaltyPref ? `（倾向：${state.penaltyPref}）` : ''}`);
  }
  return task;
}

export function checkOriginExpiry(state, currentTurn = 0) {
  if (!state || !state.tasks || state.paused) return [];
  const expiredTasks = [];
  for (const task of state.tasks) {
    if (task.status === 'active' && isTaskExpired(task, currentTurn)) {
      failOriginTask(state, task.id, '超时未达成');
      expiredTasks.push(task);
    }
  }
  return expiredTasks;
}

export function gainOriginExp(state, amount) {
  if (!state || !amount || amount <= 0) return;
  state.exp = (state.exp || 0) + amount;
  state.level = state.level || 1;
  state.expMax = state.expMax || 100;
  while (state.exp >= state.expMax) {
    state.exp -= state.expMax;
    state.level += 1;
    state.expMax = Math.round(state.expMax * 1.4);
    pushOriginLog(state, `系统等级提升至 Lv.${state.level}！`, 'level-up');
  }
}

export function gainSkillExp(state, skillName, amount) {
  if (!state || !skillName) return null;
  state.skills = state.skills || [];
  let skill = state.skills.find(s => s.name === skillName);
  if (!skill) {
    skill = {
      name: skillName,
      desc: '',
      level: 1,
      exp: 0,
      expMax: 100,
    };
    state.skills.push(skill);
  } else {
    if (skill.level === undefined || skill.level === null) skill.level = 1;
    if (skill.exp === undefined || skill.exp === null) skill.exp = 0;
    if (skill.expMax === undefined || skill.expMax === null) skill.expMax = 100;
  }

  const num = Number(amount) || 0;
  skill.exp = Math.max(0, (skill.exp || 0) + num);
  let leveledUp = false;
  while (skill.exp >= skill.expMax) {
    skill.exp -= skill.expMax;
    skill.level += 1;
    skill.expMax = Math.round(skill.expMax * 1.5);
    leveledUp = true;
    pushOriginLog(state, `技能「${skill.name}」熟练度突破，晋升至 Lv.${skill.level}！`, 'level-up');
  }
  if (!leveledUp && num !== 0) {
    pushOriginLog(state, `技能「${skill.name}」熟练度 ${num >= 0 ? `+${num}` : num}（${skill.exp}/${skill.expMax}）`, 'skill');
  }
  return skill;
}

export function saveSkill(state, draft) {
  if (!state || !draft || !draft.name) return null;
  state.skills = state.skills || [];
  const name = draft.name.trim();
  let existing = state.skills.find(s => s.name === name);
  const hasExp = Boolean(draft.hasExp || (draft.expMax !== undefined && draft.expMax !== null && draft.expMax !== ''));
  const normalized = {
    name,
    desc: (draft.desc || '').trim(),
    level: hasExp ? Math.max(1, Number(draft.level) || 1) : null,
    exp: hasExp ? Math.max(0, Number(draft.exp) || 0) : null,
    expMax: hasExp ? Math.max(1, Number(draft.expMax) || 100) : null,
  };
  if (existing) {
    Object.assign(existing, normalized);
    return existing;
  }
  state.skills.push(normalized);
  return normalized;
}

export function deleteSkill(state, skillName) {
  if (!state || !state.skills || !skillName) return false;
  const idx = state.skills.findIndex(s => s.name === skillName);
  if (idx !== -1) {
    state.skills.splice(idx, 1);
    pushOriginLog(state, `移除技能「${skillName}」`, 'warning');
    return true;
  }
  return false;
}

export function deleteStat(state, statName) {
  if (!state || !state.stats || !statName) return false;
  const idx = state.stats.findIndex(s => s.name === statName);
  if (idx !== -1) {
    state.stats.splice(idx, 1);
    pushOriginLog(state, `移除属性「${statName}」`, 'warning');
    return true;
  }
  return false;
}

export function savePerk(state, draft) {
  if (!state || !draft || !draft.name) return null;
  state.perks = state.perks || [];
  const name = draft.name.trim();
  const desc = (draft.desc || '').trim();
  let existing = state.perks.find(p => p.name === name);
  if (existing) {
    existing.desc = desc;
    return existing;
  }
  const perk = { name, desc };
  state.perks.push(perk);
  pushOriginLog(state, `解锁新特权「${name}」`, 'perk');
  return perk;
}

export function deletePerk(state, perkName) {
  if (!state || !state.perks || !perkName) return false;
  const idx = state.perks.findIndex(p => p.name === perkName);
  if (idx !== -1) {
    state.perks.splice(idx, 1);
    pushOriginLog(state, `移除特权「${perkName}」`, 'warning');
    return true;
  }
  return false;
}

export function refreshShopShelf(state, count = 6) {
  if (!state) return [];
  const catalog = Array.isArray(state.shopCatalog) ? state.shopCatalog : [];
  state.shopCatalog = catalog.map(x => ({ ...x }));
  if (catalog.length === 0) {
    state.shop = [];
    return [];
  }
  const shuffled = [...catalog].sort(() => Math.random() - 0.5);
  state.shop = shuffled.slice(0, Math.min(count, shuffled.length));
  return state.shop;
}

export function refreshGachaPool(state) {
  if (!state) return [];
  const catalog = Array.isArray(state.gachaCatalog) ? state.gachaCatalog : [];
  state.gachaCatalog = catalog.map(x => ({ ...x }));
  if (catalog.length === 0) {
    state.gachaPool = [];
    return [];
  }
  const pool = [];
  for (const tier of ['N', 'R', 'SR', 'SSR', 'UR']) {
    const matching = catalog.filter(x => x.tier === tier);
    if (matching.length) {
      const take = tier === 'N' || tier === 'R' ? Math.min(2, matching.length) : 1;
      const shuffled = [...matching].sort(() => Math.random() - 0.5);
      pool.push(...shuffled.slice(0, take));
    }
  }
  state.gachaPool = pool.length ? pool : catalog.slice(0, 5);
  return state.gachaPool;
}

export function buyShopItem(state, itemName) {
  if (!state) throw new Error('系统状态未就绪');
  const item = state.shop?.find(x => x.name === itemName) || state.shopCatalog?.find(x => x.name === itemName);
  if (!item) throw new Error(`商城中未找到商品「${itemName}」`);
  if ((state.points || 0) < item.price) throw new Error(`积分不足，需要 ${item.price} 积分（当前 ${state.points} 积分）`);
  state.points -= item.price;
  addItemToBag(state, {
    name: item.name,
    desc: item.desc || '',
    effect: item.effect || '',
    count: 1,
  });
  pushOriginLog(state, `兑换商品「${item.name}」，扣除 ${item.price} 积分`, 'shop');
  return item;
}

export function addItemToBag(state, { name, desc = '', effect = '', count = 1 }) {
  if (!state || !name) return;
  state.bag = state.bag || [];
  const existing = state.bag.find(b => b.name === name);
  if (existing) {
    existing.count = (existing.count || 1) + count;
  } else {
    state.bag.push({ name, desc, effect, count });
  }
}

export function useBagItem(state, itemName) {
  if (!state) throw new Error('系统状态未就绪');
  state.bag = state.bag || [];
  const item = state.bag.find(b => b.name === itemName);
  if (!item || item.count <= 0) throw new Error(`背包中没有「${itemName}」`);
  item.count -= 1;
  if (item.count <= 0) {
    state.bag = state.bag.filter(b => b.name !== itemName);
  }
  if (item.effect) applyStatEffect(state, item.effect, 1);
  state.pendingUse = state.pendingUse || [];
  state.pendingUse.push({ name: item.name, desc: item.desc || item.effect || '' });
  pushOriginLog(state, `使用了道具「${item.name}」`, 'use-item');
  return item;
}

export function performGachaDraw(state, count = 1, isFree = false) {
  if (!state) throw new Error('系统状态未就绪');
  const pool = (Array.isArray(state.gachaCatalog) && state.gachaCatalog.length)
    ? state.gachaCatalog
    : (Array.isArray(state.gachaPool) && state.gachaPool.length ? state.gachaPool : []);
  if (!pool.length) {
    throw new Error('当前祈愿池暂无奖品，请先通过 AI 构想奖池或添加奖品后再进行祈愿！');
  }
  const cost = state.drawCost || 300;
  const totalCost = isFree ? 0 : cost * count;
  if (!isFree && (state.points || 0) < totalCost) {
    throw new Error(`积分不足以祈愿，需要 ${totalCost} 积分（当前 ${state.points} 积分）`);
  }
  if (!isFree) state.points -= totalCost;

  const totalWeight = pool.reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
  const results = [];

  for (let i = 0; i < count; i++) {
    let rand = Math.random() * totalWeight;
    let picked = pool[0];
    for (const item of pool) {
      rand -= (Number(item.weight) || 1);
      if (rand <= 0) {
        picked = item;
        break;
      }
    }
    results.push({ ...picked });
    addItemToBag(state, {
      name: picked.name,
      desc: picked.desc || '',
      effect: picked.effect || '',
      count: 1,
    });
  }

  const resultNames = results.map(r => `[${r.tier || 'N'}] ${r.name}`).join('、');
  pushOriginLog(state, `祈愿抽取 ${count} 次：${resultNames}`, 'gacha');
  return results;
}

export function unlockAchievement(state, { name, desc = '' }) {
  if (!state || !name) return false;
  state.achievements = state.achievements || [];
  if (state.achievements.some(a => a.name === name)) return false;
  state.achievements.push({
    name,
    desc,
    unlockedAt: new Date().toLocaleDateString('zh-CN'),
  });
  pushOriginLog(state, `达成成就【${name}】！${desc ? `（${desc}）` : ''}`, 'achievement');
  return true;
}
