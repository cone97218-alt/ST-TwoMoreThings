import {
  SYSTEM_CONTACT_ID,
  normalizeOriginState,
  buyShopItem,
  useBagItem,
  performGachaDraw,
  completeOriginTask,
  failOriginTask,
  pushOriginLog,
  gainOriginExp,
  gainSkillExp,
  deleteStat,
  saveSkill,
  deleteSkill,
  savePerk,
  deletePerk,
  applyStatEffect,
  addItemToBag,
  unlockAchievement,
  refreshShopShelf,
  refreshGachaPool,
} from './origin-engine.js';
import {
  buildOriginInjection,
  parseOriginBlock,
  parseAllOriginTags,
  applyOriginBlock,
  stripOriginBlock,
  stripAllOriginTags,
} from './origin-injection.js';
import { createSystemMessage } from './origin-chat.js';
import { readTimeline } from './timeline.js';
import { parseJsonObject } from './api.js';
import { compilePromptPreset, getActivePreset, collapseMessages } from './preset-engine.js';

export function extractJsonArray(text) {
  if (!text) return null;
  const clean = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(clean.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch (_) {}
  }
  return null;
}

export function isAiMessage(m) {
  if (!m) return false;
  if (m.is_user || m.role === 'user') return false;
  if (m.is_system || m.role === 'system') return false;
  return true;
}

export function countAiTurns(messages = []) {
  if (!Array.isArray(messages)) return 0;
  return messages.filter(isAiMessage).length;
}

export function findLastAiMessage(messages = []) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (isAiMessage(m)) return { message: m, index: i };
  }
  return null;
}

export function createOriginService({ target, store, host, logger = null, notifyPhone = () => {}, modelClient = null, contextReader = null }) {
  function getTurn() {
    return countAiTurns(target?.messages || []);
  }

  function getSwipeKey(m) {
    return typeof m?.swipe_id === 'number' ? m.swipe_id : 0;
  }

  function getMessageSnapshot(m) {
    if (!m || !m.extra) return null;
    const key = getSwipeKey(m);
    if (m.extra.originSnaps && m.extra.originSnaps[key]) {
      return m.extra.originSnaps[key];
    }
    return m.extra.originSnap || null;
  }

  function setMessageSnapshot(m, originState) {
    if (!m) return;
    if (!m.extra) m.extra = {};
    m.extra.originSnaps = m.extra.originSnaps || {};
    const key = getSwipeKey(m);
    const serialized = JSON.stringify(originState);
    m.extra.originSnaps[key] = serialized;
    m.extra.originSnap = serialized;
  }

  return {
    getTurn,
    isEnabled() {
      const state = store.read();
      return Boolean(state.origin?.enabled);
    },
    preparePrompt() {
      const state = store.read();
      const injectOrigin = Boolean(state.origin?.enabled && (state.injectOriginEnabled ?? true));
      if (!injectOrigin) return '';
      return buildOriginInjection(state.origin, { currentTurn: getTurn() });
    },
    async harvestLastMessage() {
      const state = store.read();
      if (!state.origin?.enabled) return;

      const last = findLastAiMessage(target?.messages || []);
      if (!last || !last.message) return;
      const m = last.message;
      const content = m.mes || m.text || '';

      // 1. 结构化标签数据块与各模块独立自定义标签侦听 (高性能单次扫描 Single-Pass)
      const moduleTags = state.origin?.moduleTags;
      const tagRegex = state.origin?.tagRegex;
      const block = parseAllOriginTags(content, moduleTags, tagRegex);
      if (block && block.hasMatchedTags) {
        let appliedResult = null;
        if (block.actions && block.actions.length > 0) {
          await store.updateOrigin(current => {
            current.currentTurn = getTurn();
            appliedResult = applyOriginBlock(current, block, { currentTurn: getTurn() });
            setMessageSnapshot(m, current);
            return current;
          });
        }

        // 剔除正文中的原始标签，保持阅读纯净（单次线性剥离）
        const stripped = stripAllOriginTags(content, moduleTags, tagRegex);
        if (stripped && stripped !== content) {
          if ('mes' in m) m.mes = stripped;
          if ('text' in m) m.text = stripped;
        }

        // 记录到提示词日志中供宿主查阅
        if (appliedResult && logger?.addLog) {
          try {
            logger.addLog({
              title: '系统剧情演进与结算 (结构化标签)',
              systemPrompt: '大模型在正文回传了结构化标签数据块，系统引擎已解析并结算任务与属性。',
              messages: [{ role: 'assistant', content: block.raw || '（解析成功）' }],
              reply: JSON.stringify({
                broadcasts: appliedResult.broadcasts || [],
                privateChats: appliedResult.privateChats || [],
                completed: (appliedResult.completed || []).map(t => t.title),
                newTasks: (appliedResult.newTasks || []).map(t => t.title),
              }, null, 2),
            });
          } catch (_) {}
        }

        // 处理系统私聊与广播
        if (appliedResult) {
          const { broadcasts, privateChats } = appliedResult;
          const batch = readTimeline(target?.messages || []);
          const clock = batch.clock;
          const newMessages = [];

          for (const bc of broadcasts) {
            newMessages.push(createSystemMessage({
              text: bc,
              clock,
              batch,
              kind: 'broadcast',
            }));
          }
          for (const pc of privateChats) {
            newMessages.push(createSystemMessage({
              text: pc.message,
              clock,
              batch,
              kind: 'chat',
            }));
          }

          if (newMessages.length > 0) {
            await store.appendMessages(SYSTEM_CONTACT_ID, newMessages);
            notifyPhone({
              kind: 'system-notice',
              text: newMessages[0].text,
              count: newMessages.length,
            });
          }
        }
        return;
      }

      // 2. 路线 C：正文用户自定义正则侦听 (如 【叮！...】 或 【系统...】 或用户自定义 pattern)
      const userRegexStr = (state.origin?.storyRegex || '').trim() || '【(?:叮[！!]|系统).*?】';
      let regex = null;
      try {
        regex = new RegExp(userRegexStr, 'gu');
      } catch (_) {
        regex = /【(?:叮[！!]|系统).*?】/gu;
      }

      const matches = content.match(regex);
      if (matches && matches.length > 0) {
        const broadcasts = [];
        const newTasks = [];
        const completedTaskQueries = [];
        const gainedItems = [];
        const unlockedAchs = [];

        for (const matchText of matches) {
          broadcasts.push(matchText);

          // 1. 尝试提取发布新任务：形如 【叮！触发支线任务：探索后山。奖励：积分+200】
          const isComplete = matchText.includes('完成') || matchText.includes('达成');
          const isGainItem = matchText.includes('获得道具') || matchText.includes('获得：') || matchText.includes('获得:');
          const isAch = matchText.includes('成就');

          if (!isComplete && !isGainItem && !isAch) {
            const taskTypeMatch = matchText.match(/(主线|支线|日常)/);
            const taskType = taskTypeMatch ? taskTypeMatch[1] : '支线';
            const titleMatch = matchText.match(/(?:任务|触发|发布)[：:\s]+([^，。；\n|】]+)/);
            const rewardMatch = matchText.match(/奖(?:励)?[：:\s]+([^，。；\n|】]+)/);
            const ptsMatch = matchText.match(/积分([+-]?\d+)/);

            if (titleMatch) {
              const title = titleMatch[1].trim();
              if (title && !title.includes('提示') && !title.includes('公告')) {
                newTasks.push({
                  type: taskType,
                  title,
                  reward: rewardMatch ? rewardMatch[1].trim() : (ptsMatch ? `积分${ptsMatch[1]}` : ''),
                  cond: '依剧情推进达成',
                });
              }
            }
          }

          // 2. 尝试提取任务完成：形如 【叮！完成任务：夜袭黑风寨】 或 【任务「xxx」已达成】
          if (isComplete && !isAch) {
            const cm = matchText.match(/(?:完成|达成)任务[：:\s]+([^，。；\n|】]+)/) ||
                       matchText.match(/任务[「『]([^」』]+)[」』](?:已)?(?:完成|达成)/);
            if (cm) {
              completedTaskQueries.push(cm[1].trim());
            }
          }

          // 3. 尝试提取道具获得（背包）：形如 【获得道具：凝神丹x2】 或 【获得：灵石一颗】
          if (isGainItem) {
            const im = matchText.match(/获得(?:道具)?[：:\s]+([^，。；\n|】]+)/);
            if (im) {
              const rawItem = im[1].trim();
              if (!rawItem.includes('积分')) {
                const countMatch = rawItem.match(/([^\d×x*]+)[×x*](\d+)/);
                const itemName = (countMatch ? countMatch[1] : rawItem).trim();
                const itemCount = countMatch ? parseInt(countMatch[2], 10) : 1;
                if (itemName) {
                  gainedItems.push({ name: itemName, count: itemCount });
                }
              }
            }
          }

          // 4. 尝试提取成就解锁：形如 【达成成就：初露锋芒】 或 【解锁成就：逆天改命】
          if (isAch) {
            const am = matchText.match(/(?:达成|解锁)成就[：:\s]+([^，。；\n|】]+)/);
            if (am) {
              unlockedAchs.push(am[1].trim());
            }
          }
        }

        await store.updateOrigin(current => {
          current.currentTurn = getTurn();
          // 结算已完成任务
          for (const query of completedTaskQueries) {
            const matchTask = (current.tasks || []).find(t => t.status === 'active' && (String(t.id) === query || t.title.includes(query) || query.includes(t.title)));
            if (matchTask) {
              completeOriginTask(current, matchTask.id);
            }
          }
          // 存入新任务
          for (const t of newTasks) {
            const newId = current.nextId || ((current.tasks?.length || 0) + 1);
            current.nextId = newId + 1;
            current.tasks = current.tasks || [];
            current.tasks.push({
              id: newId,
              type: t.type,
              title: t.title,
              cond: t.cond,
              reward: t.reward,
              status: 'active',
              startTurn: getTurn(),
              owner: current.bindTo || '宿主',
            });
            pushOriginLog(current, `通过正文正则侦听捕获新任务「${t.title}」`, 'new-task');
          }
          // 存入背包道具
          for (const item of gainedItems) {
            addItemToBag(current, item);
            pushOriginLog(current, `通过正文正则侦听获得道具「${item.name}」×${item.count}`, 'bag');
          }
          // 解锁成就
          for (const achName of unlockedAchs) {
            unlockAchievement(current, { name: achName });
          }
          // 属性与积分变动
          for (const bc of broadcasts) {
            applyStatEffect(current, bc);
          }
          setMessageSnapshot(m, current);
          return current;
        });

        if (logger?.addLog) {
          logger.addLog({
            title: '正文系统自定义正则侦听',
            systemPrompt: `侦听正则: ${userRegexStr}\n从正文捕获到 ${matches.length} 处系统播报片段。`,
            messages: [{ role: 'assistant', content: matches.join('\n') }],
            reply: JSON.stringify({
              capturedBroadcasts: broadcasts,
              newTasks: newTasks.map(t => t.title),
              completedTasks: completedTaskQueries,
              gainedItems: gainedItems.map(i => `${i.name}×${i.count}`),
              unlockedAchievements: unlockedAchs,
            }, null, 2),
          });
        }

        const batch = readTimeline(target?.messages || []);
        const clock = batch.clock;
        const newMessages = broadcasts.map(bc => createSystemMessage({
          text: bc,
          clock,
          batch,
          kind: 'broadcast',
        }));

        if (newMessages.length > 0) {
          await store.appendMessages(SYSTEM_CONTACT_ID, newMessages);
          notifyPhone({
            kind: 'system-notice',
            text: newMessages[0].text,
            count: newMessages.length,
          });
        }
        return;
      }

      const snap = getMessageSnapshot(m);
      if (snap) {
        try {
          const restored = JSON.parse(snap);
          await store.updateOrigin(() => normalizeOriginState(restored));
        } catch (_) {}
      }
    },
    restoreFromSnapshot() {
      const state = store.read();
      if (!state.origin?.enabled) return;

      const last = findLastAiMessage(target?.messages || []);
      if (!last || !last.message) return;
      const m = last.message;
      const snapJson = getMessageSnapshot(m);

      if (snapJson) {
        try {
          const restored = JSON.parse(snapJson);
          store.updateOrigin(() => normalizeOriginState(restored));
        } catch (_) {}
      }
    },
    // 操作接口
    async buyItem(itemName) {
      return store.updateOrigin(current => {
        buyShopItem(current, itemName);
        return current;
      });
    },
    async useItem(itemName) {
      return store.updateOrigin(current => {
        useBagItem(current, itemName);
        return current;
      });
    },
    async drawGacha(count = 1, isFree = false) {
      let results = [];
      await store.updateOrigin(current => {
        results = performGachaDraw(current, count, isFree);
        return current;
      });
      return results;
    },
    async completeTask(id) {
      return store.updateOrigin(current => {
        completeOriginTask(current, id);
        return current;
      });
    },
    async failTask(id, reason) {
      return store.updateOrigin(current => {
        failOriginTask(current, id, reason);
        return current;
      });
    },
    async deleteTask(id) {
      return store.updateOrigin(current => {
        current.tasks = (current.tasks || []).filter(t => String(t.id) !== String(id));
        pushOriginLog(current, `删除了任务 #${id}`, 'delete-task');
        return current;
      });
    },
    async saveTask(id, draft) {
      return store.updateOrigin(current => {
        current.currentTurn = getTurn();
        current.tasks = current.tasks || [];
        const existing = current.tasks.find(t => String(t.id) === String(id));
        if (existing) {
          Object.assign(existing, draft);
          if (draft.limit !== undefined) existing.limit = Math.max(0, parseInt(draft.limit, 10) || 0);
          pushOriginLog(current, `修改了任务「${existing.title}」`, 'edit-task');
        } else {
          const newId = current.nextId || (current.tasks.length + 1);
          current.nextId = newId + 1;
          const task = {
            id: newId,
            type: draft.type || '支线',
            title: draft.title || '新任务',
            desc: draft.desc || '',
            cond: draft.cond || '',
            reward: draft.reward || '',
            penalty: draft.penalty || '',
            limit: Math.max(0, parseInt(draft.limit, 10) || 0),
            startTurn: getTurn(),
            progress: Number(draft.progress) || 0,
            status: draft.status || 'active',
            owner: draft.owner || '宿主',
          };
          current.tasks.push(task);
          pushOriginLog(current, `创建了新任务「${task.title}」`, 'new-task');
        }
        return current;
      });
    },
    async updateStat(name, delta) {
      return store.updateOrigin(current => {
        applyStatEffect(current, `${name}${delta >= 0 ? `+${delta}` : delta}`);
        return current;
      });
    },
    async deleteStat(name) {
      return store.updateOrigin(current => {
        deleteStat(current, name);
        return current;
      });
    },
    async updateSkillExp(name, delta) {
      return store.updateOrigin(current => {
        gainSkillExp(current, name, delta);
        return current;
      });
    },
    async saveSkill(draft) {
      return store.updateOrigin(current => {
        saveSkill(current, draft);
        return current;
      });
    },
    async deleteSkill(name) {
      return store.updateOrigin(current => {
        deleteSkill(current, name);
        return current;
      });
    },
    async savePerk(draft) {
      return store.updateOrigin(current => {
        savePerk(current, draft);
        return current;
      });
    },
    async deletePerk(name) {
      return store.updateOrigin(current => {
        deletePerk(current, name);
        return current;
      });
    },
    async updateSettings(patch) {
      return store.updateOrigin(current => {
        Object.assign(current, patch);
        return current;
      });
    },
    async conceiveTask({ direction } = {}) {
      if (!modelClient) throw new Error('未配置大模型客户端，无法推演新任务。');
      const state = store.read();
      const originState = state.origin || {};
      const sysName = originState.sysName || '系统';
      const hostName = originState.bindTo || state.userProfile?.name || '宿主';
      const activeTasks = (originState.tasks || []).filter(t => t.status === 'active');
      const activeTasksSummary = activeTasks.length
        ? activeTasks.map(t => `[${t.type}] ${t.title}`).join('；')
        : '无进行中任务';
      const statsSummary = (originState.stats || []).map(s => `${s.name}:${s.val}`).join('，') || '暂无属性';
      const effectiveDirection = direction || originState.direction || '切合当前世界观与剧情，自然展开';

      let storyText = '';
      if (contextReader) {
        try {
          const ctx = await contextReader.readForContact(SYSTEM_CONTACT_ID);
          storyText = (ctx.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
        } catch (_) {}
      }
      if (!storyText && Array.isArray(target?.messages)) {
        storyText = target.messages.slice(-8).map(m => `${m.name || (m.is_user ? '用户' : '角色')}：${m.mes || m.text || ''}`).join('\n\n');
      }

      const defaultTaskSystemPrompt = `你是随身金手指系统【${sysName}】的任务构想中枢。
当前宿主：${hostName}
系统等级：Lv.${originState.level || 1}
宿主属性：${statsSummary}
当前进行中任务：${activeTasksSummary}
宿主期望任务方向：${effectiveDirection}

请结合最近正文剧情与期望方向，为宿主构想 1 个契合情境的新任务。
必须严格输出合法的 JSON 格式，不输出任何思考过程或多余解释：
{
  "type": "主线",
  "title": "任务简明标题",
  "desc": "任务背景描述",
  "cond": "具体完成目标与触发条件",
  "reward": "任务奖励描述（例如 积分+200 敏捷+1）",
  "penalty": "失败惩罚（例如 积分-50 或 无）",
  "limit": 0
}`;

      const activePreset = getActivePreset(state);
      const originInjectionText = buildOriginInjection(originState, { currentTurn: getTurn() });

      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: '',
        storyHistory: storyText,
        storyMemory: '',
        charPersonality: `【随身系统】${sysName} · 任务推演中枢\n当前宿主：${hostName}\n当前属性：${statsSummary}\n进行中任务：${activeTasksSummary}`,
        latestUserInput: `[宿主期望新任务方向]\n${effectiveDirection}`,
        originPromptText: originInjectionText,
        state,
      }, 'origin-task', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemMessages = collapsed.filter(m => m.role === 'system');
      const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || defaultTaskSystemPrompt;
      const otherMessages = collapsed.filter(m => m.role !== 'system');
      const modelMessages = otherMessages.length > 0 ? otherMessages : [
        { role: 'user', content: `[最近剧情参考]\n${storyText || '（暂无前序正文）'}\n\n请结合剧情与期望方向（${effectiveDirection}），为宿主构想新任务并严格输出对应 JSON。` },
      ];

      const reply = await modelClient.complete({
        label: '系统 AI 构想任务',
        system: systemPrompt,
        messages: modelMessages,
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });

      const parsed = parseJsonObject(reply);
      if (!parsed || !parsed.title) {
        throw new Error('未能从模型回复中解析出有效的新任务，请重试。');
      }

      let newTask = null;
      await store.updateOrigin(current => {
        const newId = current.nextId || ((current.tasks?.length || 0) + 1);
        current.nextId = newId + 1;
        current.tasks = current.tasks || [];
        newTask = {
          id: newId,
          type: ['主线', '支线', '日常'].includes(parsed.type) ? parsed.type : '支线',
          title: String(parsed.title).trim(),
          desc: String(parsed.desc || '').trim(),
          cond: String(parsed.cond || '').trim(),
          reward: String(parsed.reward || '').trim(),
          penalty: String(parsed.penalty || '').trim(),
          limit: Number(parsed.limit) || 0,
          startTurn: getTurn(),
          progress: 0,
          status: 'active',
          owner: hostName,
        };
        current.tasks.push(newTask);
        pushOriginLog(current, `AI 构想并发布了新任务「${newTask.title}」`, 'new-task');
        return current;
      });

      notifyPhone({
        kind: 'system-notice',
        text: `【新任务发布】[${newTask.type}] ${newTask.title}`,
        count: 1,
      });

      return newTask;
    },
    async evaluateStats(options = {}) {
      if (!modelClient) throw new Error('未配置大模型客户端，无法评估属性。');
      const { direction = '' } = options;
      const state = store.read();
      const originState = state.origin || {};
      const sysName = originState.sysName || '系统';
      const hostName = originState.bindTo || state.userProfile?.name || '宿主';
      const hasStats = Array.isArray(originState.stats) && originState.stats.length > 0;
      const statsSummary = hasStats
        ? originState.stats.map(s => `${s.name}:${s.val}`).join('，')
        : '暂无数值属性（本次将为宿主全新构建属性面板）';
      const skillsSummary = (Array.isArray(originState.skills) && originState.skills.length)
        ? originState.skills.map(s => `${s.name}${s.level ? `(Lv.${s.level})` : ''}`).join('，')
        : '暂无已掌握技能';
      const perksSummary = (Array.isArray(originState.perks) && originState.perks.length)
        ? originState.perks.map(p => p.name).join('，')
        : '暂无特权';

      let storyText = '';
      if (contextReader) {
        try {
          const ctx = await contextReader.readForContact(SYSTEM_CONTACT_ID);
          storyText = (ctx.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
        } catch (_) {}
      }
      if (!storyText && Array.isArray(target?.messages)) {
        storyText = target.messages.slice(-8).map(m => `${m.name || (m.is_user ? '用户' : '角色')}：${m.mes || m.text || ''}`).join('\n\n');
      }

      const userGuidanceText = direction?.trim()
        ? `\n\n【宿主指定的成长与构想引导方向】\n${direction.trim()}\n★注意：请务必紧扣宿主给出的上述流派/成长偏好，构想或演进相应的属性、技能与特权！`
        : '';

      const defaultStatsSystemPrompt = `你是随身金手指系统【${sysName}】的角色综合成长评估与能力构建中枢。
当前宿主：${hostName}
宿主当前数值属性：${statsSummary}
宿主当前已掌握技能：${skillsSummary}
宿主当前已开启特权：${perksSummary}
${userGuidanceText}

请结合宿主在最近剧情中的经历、战斗、顿悟、机缘或社交进展，全面评估宿主的能力成长（属性提升、技能领悟或熟练度增长、特权觉醒）：
${!hasStats ? '★宿主当前尚无属性面板，请结合世界观（修仙玄幻、西幻魔法、科幻赛博、末世、现代都市等）及宿主期望为宿主构想新建 4~6 项核心属性（放入 newStats 数组，初始值约 10 左右）。\n' : ''}
必须严格输出合法的 JSON 格式，不输出任何多余分析：
{
  "summary": "1-2句简炼总结宿主本次在属性、技能或特权上的突破与成长因由",
  "statChanges": [
    { "name": "属性名", "delta": 1 }
  ],
  "newStats": [
    { "name": "属性名", "val": 10 }
  ],
  "newSkills": [
    { "name": "技能名", "desc": "技能效果说明", "hasExp": true, "level": 1, "expMax": 100 }
  ],
  "skillExpChanges": [
    { "name": "已有技能名", "exp": 30 }
  ],
  "newPerks": [
    { "name": "特权名", "desc": "特权效果说明" }
  ],
  "pointsGain": 100
}`;

      const activePreset = getActivePreset(state);
      const originInjectionText = buildOriginInjection(originState, { currentTurn: getTurn() });

      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: '',
        storyHistory: storyText,
        storyMemory: '',
        charPersonality: `【随身系统】${sysName} · ${hasStats ? '角色能力综合评估中枢' : '角色能力综合构建中枢'}\n当前宿主：${hostName}\n当前属性：${statsSummary}\n当前技能：${skillsSummary}\n当前特权：${perksSummary}`,
        latestUserInput: (hasStats
          ? `[宿主最近剧情与成长诉求]\n请评估近期剧情对宿主属性、技能熟练度、特权及积分的成长影响。`
          : `[宿主综合能力面板新建诉求]\n宿主当前尚无属性面板，请结合世界观与最近剧情，为宿主构想并新建 4~6 项核心数值属性，以及可选的初始技能或特权。`) + userGuidanceText,
        originPromptText: originInjectionText,
        state,
      }, 'origin-stats', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemMessages = collapsed.filter(m => m.role === 'system');
      const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || defaultStatsSystemPrompt;
      const otherMessages = collapsed.filter(m => m.role !== 'system');
      const modelMessages = otherMessages.length > 0 ? otherMessages : [
        { role: 'user', content: (hasStats
            ? `[最近剧情参考]\n${storyText || '（暂无前序正文）'}\n\n请评估宿主属性、技能与特权成长并严格输出对应 JSON。`
            : `[最近剧情参考]\n${storyText || '（暂无前序正文）'}\n\n宿主当前暂无属性，请结合世界观为宿主构想新建核心属性并严格输出对应 JSON。`) + userGuidanceText },
      ];

      const reply = await modelClient.complete({
        label: hasStats ? '系统 AI 评估成长' : '系统 AI 新建属性',
        system: systemPrompt,
        messages: modelMessages,
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });

      const parsed = parseJsonObject(reply);
      if (!parsed) {
        throw new Error('未能从模型回复中解析出属性评估数据，请重试。');
      }

      const pointsGain = Math.max(0, Number(parsed.pointsGain) || 0);
      const summary = String(parsed.summary || (hasStats ? '宿主经历了近期的剧情波澜，心境与实力有所成长。' : '系统已为宿主初始化核心属性面板。')).trim();

      let appliedNewStats = [];
      let statChanges = Array.isArray(parsed.statChanges) ? parsed.statChanges : [];
      let appliedNewSkills = [];
      let appliedNewPerks = [];

      await store.updateOrigin(current => {
        if (!current.mods) current.mods = {};
        current.mods.stat = true;

        if (pointsGain > 0) {
          current.points = (current.points || 0) + pointsGain;
          gainOriginExp(current, Math.round(pointsGain / 2));
        }

        if (!hasStats) {
          const candidateStats = Array.isArray(parsed.newStats) && parsed.newStats.length
            ? parsed.newStats
            : statChanges.map(s => ({ name: s.name, val: Number(s.delta || s.val || 10) }));

          const validStats = candidateStats.filter(s => s && s.name).map(s => ({
            name: String(s.name).trim(),
            val: Number(s.val ?? s.delta) || 10,
          }));

          if (validStats.length > 0) {
            current.stats = validStats;
            appliedNewStats = validStats;
          } else {
            current.stats = [
              { name: '力量', val: 10 },
              { name: '敏捷', val: 10 },
              { name: '体质', val: 10 },
              { name: '精神', val: 10 },
            ];
            appliedNewStats = current.stats;
          }
          pushOriginLog(current, `AI 新建能力面板：${summary}`, 'eval-stats');
        } else {
          for (const sc of statChanges) {
            if (sc.name && sc.delta) {
              applyStatEffect(current, `${sc.name}${sc.delta >= 0 ? `+${sc.delta}` : sc.delta}`);
            }
          }
          pushOriginLog(current, `AI 评估成长：${summary}`, 'eval-stats');
        }

        // 应用新领悟技能与经验增长
        if (Array.isArray(parsed.newSkills)) {
          for (const nsk of parsed.newSkills) {
            if (nsk && nsk.name) {
              const saved = saveSkill(current, nsk);
              if (saved) appliedNewSkills.push(saved);
            }
          }
        }
        if (Array.isArray(parsed.skillExpChanges)) {
          for (const sec of parsed.skillExpChanges) {
            if (sec && sec.name && sec.exp) {
              gainSkillExp(current, sec.name, sec.exp);
            }
          }
        }

        // 应用新觉醒特权
        if (Array.isArray(parsed.newPerks)) {
          for (const npk of parsed.newPerks) {
            if (npk && npk.name) {
              const saved = savePerk(current, npk);
              if (saved) appliedNewPerks.push(saved);
            }
          }
        }

        return current;
      });

      return {
        summary,
        statChanges,
        newStats: appliedNewStats,
        newSkills: appliedNewSkills,
        newPerks: appliedNewPerks,
        pointsGain,
        isNewStats: !hasStats,
      };
    },
    async refreshShop(count = 6) {
      return store.updateOrigin(current => {
        refreshShopShelf(current, count);
        pushOriginLog(current, '商城货架已随机轮换。', 'shop-refresh');
        return current;
      });
    },
    async refreshGacha() {
      return store.updateOrigin(current => {
        refreshGachaPool(current);
        pushOriginLog(current, '祈愿奖池预览已轮换。', 'gacha-refresh');
        return current;
      });
    },
    async saveShopCatalogItem(draft) {
      if (!draft || !draft.name) return;
      return store.updateOrigin(current => {
        current.shopCatalog = current.shopCatalog || [];
        const existing = current.shopCatalog.find(i => i.name === draft.name);
        if (existing) {
          Object.assign(existing, draft);
        } else {
          current.shopCatalog.push({
            name: draft.name,
            price: Math.max(1, Number(draft.price) || 100),
            desc: draft.desc || '',
            effect: draft.effect || '',
            type: draft.type || '道具',
          });
        }
        refreshShopShelf(current, 6);
        return current;
      });
    },
    async deleteShopCatalogItem(name) {
      return store.updateOrigin(current => {
        current.shopCatalog = (current.shopCatalog || []).filter(i => i.name !== name);
        current.shop = (current.shop || []).filter(i => i.name !== name);
        if (current.shop.length < 6) refreshShopShelf(current, 6);
        return current;
      });
    },
    async saveGachaCatalogItem(draft) {
      if (!draft || !draft.name) return;
      return store.updateOrigin(current => {
        current.gachaCatalog = current.gachaCatalog || [];
        const existing = current.gachaCatalog.find(i => i.name === draft.name);
        if (existing) {
          Object.assign(existing, draft);
        } else {
          current.gachaCatalog.push({
            name: draft.name,
            tier: draft.tier || 'R',
            weight: Math.max(1, Number(draft.weight) || 10),
            desc: draft.desc || '',
            effect: draft.effect || '',
          });
        }
        refreshGachaPool(current);
        return current;
      });
    },
    async deleteGachaCatalogItem(name) {
      return store.updateOrigin(current => {
        current.gachaCatalog = (current.gachaCatalog || []).filter(i => i.name !== name);
        current.gachaPool = (current.gachaPool || []).filter(i => i.name !== name);
        if (current.gachaPool.length < 5) refreshGachaPool(current);
        return current;
      });
    },
    async conceiveShopItems(options = {}) {
      if (!modelClient) throw new Error('未配置大模型客户端，无法构想商城商品。');
      const { direction = '' } = options;
      const state = store.read();
      const originState = state.origin || {};
      const sysName = originState.sysName || '系统';
      const hostName = originState.bindTo || state.userProfile?.name || '宿主';

      let storyText = '';
      if (contextReader) {
        try {
          const ctx = await contextReader.readForContact(SYSTEM_CONTACT_ID);
          storyText = (ctx.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
        } catch (_) {}
      }
      if (!storyText && Array.isArray(target?.messages)) {
        storyText = target.messages.slice(-8).map(m => `${m.name || (m.is_user ? '用户' : '角色')}：${m.mes || m.text || ''}`).join('\n\n');
      }

      const userGuidanceText = direction?.trim()
        ? `\n\n【宿主特别指定的进货偏好 / 构想期望】\n${direction.trim()}\n★注意：请务必紧扣宿主给出的上述商品流派或物品偏好构想新商品！`
        : '';

      const activePreset = getActivePreset(state);
      const originInjectionText = buildOriginInjection(originState, { currentTurn: getTurn() });

      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: '',
        storyHistory: storyText,
        storyMemory: '',
        charPersonality: `【随身系统】${sysName} · 商城进货推演中枢\n当前宿主：${hostName}\n当前等级：Lv.${originState.level || 1}`,
        latestUserInput: `[商城进货诉求]\n请结合剧情世界观，批量构想 8 到 12 种全新商品。${userGuidanceText}`,
        originPromptText: originInjectionText,
        state,
      }, 'origin-shop', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemMessages = collapsed.filter(m => m.role === 'system');
      const systemPrompt = (systemMessages.map(m => m.content).join('\n\n') || '请为随身金手指系统构想一批切合剧情世界观的商城商品，输出合法 JSON 数组。') + userGuidanceText;
      const otherMessages = collapsed.filter(m => m.role !== 'system');
      const modelMessages = otherMessages.length > 0 ? otherMessages : [
        { role: 'user', content: `[最近剧情参考]\n${storyText || '（暂无前序正文）'}\n\n请结合剧情为系统商城构想 8~12 种商品，严格输出 JSON 数组格式。${userGuidanceText}` },
      ];

      const reply = await modelClient.complete({
        label: '系统 AI 批量进货',
        system: systemPrompt,
        messages: modelMessages,
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });

      const parsed = extractJsonArray(reply);
      if (!parsed || parsed.length === 0) {
        throw new Error('未能从模型回复中解析出商品列表，请重试。');
      }

      const validItems = parsed.filter(i => i && i.name).map(i => ({
        name: String(i.name).trim(),
        price: Math.max(10, Number(i.price) || 100),
        desc: String(i.desc || '').trim(),
        effect: String(i.effect || '').trim(),
        type: String(i.type || '道具').trim(),
      }));

      if (validItems.length === 0) {
        throw new Error('模型返回的商品列表缺少有效字段。');
      }

      await store.updateOrigin(current => {
        current.shopCatalog = current.shopCatalog || [];
        for (const it of validItems) {
          const idx = current.shopCatalog.findIndex(x => x.name === it.name);
          if (idx !== -1) current.shopCatalog[idx] = it;
          else current.shopCatalog.push(it);
        }
        refreshShopShelf(current, 6);
        pushOriginLog(current, `AI 进货入库：成功新增 ${validItems.length} 件新商品并刷新了货架。`, 'shop-stock');
        return current;
      });

      return { count: validItems.length, items: validItems };
    },
    async conceiveGachaItems(options = {}) {
      if (!modelClient) throw new Error('未配置大模型客户端，无法构想祈愿奖品。');
      const { direction = '' } = options;
      const state = store.read();
      const originState = state.origin || {};
      const sysName = originState.sysName || '系统';
      const hostName = originState.bindTo || state.userProfile?.name || '宿主';

      let storyText = '';
      if (contextReader) {
        try {
          const ctx = await contextReader.readForContact(SYSTEM_CONTACT_ID);
          storyText = (ctx.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
        } catch (_) {}
      }
      if (!storyText && Array.isArray(target?.messages)) {
        storyText = target.messages.slice(-8).map(m => `${m.name || (m.is_user ? '用户' : '角色')}：${m.mes || m.text || ''}`).join('\n\n');
      }

      const userGuidanceText = direction?.trim()
        ? `\n\n【宿主特别指定的奖池偏好 / 构想期望】\n${direction.trim()}\n★注意：请务必紧扣宿主给出的上述奖品流派或设定偏好构想涵盖各品阶的新奖品！`
        : '';

      const activePreset = getActivePreset(state);
      const originInjectionText = buildOriginInjection(originState, { currentTurn: getTurn() });

      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: '',
        storyHistory: storyText,
        storyMemory: '',
        charPersonality: `【随身系统】${sysName} · 祈愿奖池推演中枢\n当前宿主：${hostName}\n当前等级：Lv.${originState.level || 1}`,
        latestUserInput: `[祈愿奖池扩充诉求]\n请结合剧情世界观，批量构想 8 到 15 种涵盖 N/R/SR/SSR/UR 的祈愿奖品。${userGuidanceText}`,
        originPromptText: originInjectionText,
        state,
      }, 'origin-gacha', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemMessages = collapsed.filter(m => m.role === 'system');
      const systemPrompt = (systemMessages.map(m => m.content).join('\n\n') || '请为随身金手指系统构想一批切合剧情世界观的祈愿奖池奖品，输出合法 JSON 数组。') + userGuidanceText;
      const otherMessages = collapsed.filter(m => m.role !== 'system');
      const modelMessages = otherMessages.length > 0 ? otherMessages : [
        { role: 'user', content: `[最近剧情参考]\n${storyText || '（暂无前序正文）'}\n\n请结合剧情为系统祈愿池构想 8~15 种奖品（含各稀有度），严格输出 JSON 数组格式。${userGuidanceText}` },
      ];

      const reply = await modelClient.complete({
        label: '系统 AI 扩充奖池',
        system: systemPrompt,
        messages: modelMessages,
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });

      const parsed = extractJsonArray(reply);
      if (!parsed || parsed.length === 0) {
        throw new Error('未能从模型回复中解析出奖品列表，请重试。');
      }

      const validItems = parsed.filter(i => i && i.name).map(i => {
        const tier = ['UR', 'SSR', 'SR', 'R', 'N'].includes(i.tier) ? i.tier : 'R';
        const defaultWeights = { N: 60, R: 30, SR: 15, SSR: 5, UR: 1 };
        return {
          name: String(i.name).trim(),
          tier,
          weight: Math.max(1, Number(i.weight) || defaultWeights[tier] || 10),
          desc: String(i.desc || '').trim(),
          effect: String(i.effect || '').trim(),
        };
      });

      if (validItems.length === 0) {
        throw new Error('模型返回的奖品列表缺少有效字段。');
      }

      await store.updateOrigin(current => {
        current.gachaCatalog = current.gachaCatalog || [];
        for (const it of validItems) {
          const idx = current.gachaCatalog.findIndex(x => x.name === it.name);
          if (idx !== -1) current.gachaCatalog[idx] = it;
          else current.gachaCatalog.push(it);
        }
        refreshGachaPool(current);
        pushOriginLog(current, `AI 扩充奖池：成功新增 ${validItems.length} 件奖品入库并轮换了预览。`, 'gacha-stock');
        return current;
      });

      return { count: validItems.length, items: validItems };
    },
  };
}
