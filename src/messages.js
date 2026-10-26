import { parsePayload, parseJsonObject, extractReasoning } from './api.js';
import { getPrompt, CONTACTS_PROMPT, MESSAGES_PROMPT, TODO_SUGGESTIONS_PROMPT, THOUGHT_PROMPT } from './prompts.js';
import { readTimeline } from './timeline.js';
import { normalizeContent, messageText, formatForwardedContextText, generateMessageId, shortenMessageId, extractLatestUserInput, RICH_MESSAGES_PROMPT } from './content.js';
import { CALENDAR_PROMPT } from './calendar.js';
import { parseTodoCandidates } from './todos.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';
import { replyToMessage } from './replies.js';
import { createOldMaidInvitation, acceptOldMaidGame, rejectOldMaidGame, aiDrawCard } from './games/old-maid.js';
import {
  createBuckshotInvitation,
  acceptBuckshotGame,
  rejectBuckshotGame,
  shootOpponent as buckshotShootOpponent,
  shootSelf as buckshotShootSelf,
  useItem as buckshotUseItem,
  getAiBuckshotDecision,
} from './games/buckshot-roulette.js';

export function record(role, text, clock, translation, batch) {
  const now = new Date();
  // createdAt 记录消息创建时间，供通知排序；可见时间和剧情日期在创建时确定，之后不追改历史短信。
  return { id: generateMessageId(), role, text, createdAt: now.toISOString(), timeLabel: clock.time,
    ...(translation ? { translation } : {}),
    ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),
    ...(clock.source === 'story' ? { storyDate: clock.date, storyWeekday: clock.weekday } : {}),
  };
}

export function createMessageService({ target, store, contextReader, modelClient }) {
  return {
    async sendCard(id, draft, { replyToId } = {}) {
      const content = normalizeContent(draft);
      if (!content?.type) throw new Error('消息卡内容不完整，请检查后发送。');
      const state = store.read();
      if (!state.contacts.some(person => person.id === id)) throw new Error('请先选择一位联系人。');
      if (content.type === 'transfer') content.transfer.recipientId = id;
      const batch = readTimeline(target.messages);
      const thread = state.conversations[id] || [];
      await store.appendMessage(id, { ...record('user', content.text, batch.clock, '', batch), ...content, ...replyToMessage(thread, replyToId) });
    },
    async refineOnlineStyle(id) {
      const contact = store.read().contacts.find(person => person.id === id);
      if (!contact) throw new Error('这个联系人已不存在，请返回短信重新选择。');
      const state = store.read();
      const activePreset = getActivePreset(state);

      let sources = {};
      if (contextReader?.readDirectorySources) {
        try {
          sources = await contextReader.readDirectorySources({ readMemory: true }) || {};
        } catch {}
      }
      const storyHistoryText = (sources.story || []).map(item => `${item.speaker || '角色'}：${item.text}`).join('\n\n');
      const payload = sanitizePhoneContext({ people: [{ sourceId: contact.id, name: contact.name, personality: contact.personality || '', expression: contact.expression || '', language: contact.language || '' }] });
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: sources.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: sources.storyMemory || '',
        phoneContext: payload,
        charPersonality: `${contact.name}：${contact.personality || ''}\n线上风格：${contact.expression || ''}`,
      }, 'contacts', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: '联系人风格提炼',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(payload) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const result = parsePayload(reply, 'contacts').find(person => person.sourceId === id);
      if (!result?.expression) throw new Error('没有生成这位联系人的线上聊天方式，请重新提炼。');
      return result.expression;
    },
    async send(id, text, { replyToId } = {}) {
      const content = String(text || '').trim();
      if (!content) return;
      const state = store.read();
      if (!state.contacts.some(x => x.id === id)) throw new Error('请先选择一位联系人。');
      const batch = readTimeline(target.messages);
      const thread = state.conversations[id] || [];
      await store.appendMessage(id, { ...record('user', content, batch.clock, '', batch), ...replyToMessage(thread, replyToId) });
    },
    async generateThought(id, messageId, speakerId = '') {
      const state = store.read();
      const thread = state.conversations[id] || [];
      const shortTargetId = shortenMessageId(messageId);
      const targetMsg = thread.find(item => item.id === messageId || (item.id && shortenMessageId(item.id) === shortTargetId) || (item.id && (item.id.startsWith(messageId) || messageId.startsWith(item.id))));
      if (!targetMsg || targetMsg.role !== 'assistant') throw new Error('只能查看对方发出的消息心声。');
      const isGroup = state.groups?.some(group => group.id === id);
      const resolvedSpeakerId = speakerId || targetMsg.speakerId || id;
      const contact = state.contacts.find(person => person.id === resolvedSpeakerId);
      if (!contact) throw new Error('未找到对应的角色资料。');

      const context = isGroup
        ? await contextReader.readForGroup(id)
        : await contextReader.readForContact(id);
      const msgIndex = thread.findIndex(item => item === targetMsg);
      const sliceStart = Math.max(0, msgIndex - 7);
      const recentMessages = thread.slice(sliceStart, msgIndex + 1).map(item => ({
        role: item.role,
        ...(item.speakerId ? { speakerId: item.speakerId } : {}),
        text: messageText(item),
      }));

      const userPayload = {
        character: {
          id: contact.id,
          name: contact.name,
          nickname: contact.nickname || '',
          personality: contact.personality || '',
          expression: contact.expression || '',
        },
        clock: context.clock,
        story: (context.story || []).slice(-4),
        recentMessages,
        targetMessage: {
          text: messageText(targetMsg),
          ...(targetMsg.withdrawn && targetMsg.withdrawnText ? { withdrawn: true, withdrawnText: targetMsg.withdrawnText } : {}),
          ...(targetMsg.translation ? { translation: targetMsg.translation } : {}),
          timeLabel: targetMsg.timeLabel || '',
        },
      };

      const activePreset = getActivePreset(state);
      const storyHistoryText = (context.story || []).map(item => `${item.speaker || '角色'}：${item.text}`).join('\n\n');
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: context.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: context.storyMemory || '',
        phoneContext: userPayload,
        charPersonality: `${contact.name}：${contact.personality || ''}\n线上风格：${contact.expression || ''}`,
      }, 'thought', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: '角色隐秘心声生成',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(userPayload) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const parsed = parseJsonObject(reply);
      const thought = String(parsed?.thought ?? parsed?.innerThought ?? parsed?.text ?? '').trim();
      if (!thought) throw new Error('未能解析出有效的心声内容，请重试。');
      await store.updateMessageThought(id, messageId, thought);
      return thought;
    },
    async continueChat(id) {
      const context = await contextReader.readForContact(id);
      const clock = context.clock;
      const state = store.read();
      const activePreset = getActivePreset(state);

      const rawThread = state.conversations[id] || [];
      const historySources = (context.history && context.history.length) ? context.history : rawThread;
      const latestUserInput = extractLatestUserInput(historySources, {
        contactName: context.contact?.name || '角色',
        userName: context.user || '<user>',
      });

      const storyHistoryText = (context.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
      const phoneContextData = sanitizePhoneContext(context);
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: context.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: context.storyMemory || '',
        calendar: context.calendar,
        phoneContext: phoneContextData,
        charPersonality: `${context.contact?.name || ''}：${context.contact?.personality || ''}\n线上风格：${context.contact?.expression || ''}`,
        latestUserInput,
      }, 'chat', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: '私聊短信生成',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : messagesPayload,
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });
      const reasoning = extractReasoning(reply);
      const answer = parseJsonObject(reply);
      const actions = Array.isArray(answer.transferActions) ? answer.transferActions : [];
      const rawMsgActions = [
        ...(Array.isArray(answer.messageActions) ? answer.messageActions : []),
        ...(Array.isArray(answer.reactionActions) ? answer.reactionActions.map(item => ({ ...item, action: 'react' })) : []),
      ];
      const existingThread = store.read().conversations[id] || [];
      const existingIds = new Set(existingThread.map(item => item.id));
      const resolveReplyId = rawId => {
        if (!rawId) return '';
        if (existingIds.has(rawId)) return rawId;
        const shortRaw = shortenMessageId(rawId);
        const byPrefix = existingThread.find(m => m.id && (m.id.startsWith(shortRaw) || shortRaw.startsWith(shortenMessageId(m.id))));
        if (byPrefix) return byPrefix.id;
        const byText = [...existingThread].reverse().find(m => m.text === rawId || messageText(m) === rawId);
        return byText ? byText.id : '';
      };

      const pendingInvite = [...existingThread].reverse().find(m => m.type === 'game' && m.game?.status === 'invited');
      const activeGameMsg = [...existingThread].reverse().find(m => m.type === 'game' && m.game?.status === 'playing');
      const rawGameAction = answer.gameAction;
      const gameActionKind = typeof rawGameAction === 'string'
        ? rawGameAction
        : String(rawGameAction?.action || rawGameAction?.status || '').trim();
      const isGameTurn = Boolean(activeGameMsg && activeGameMsg.game?.turn === 'ai');
      const hasGameAction = Boolean(rawGameAction);
      const contactName = context.contact?.name || '对方';
      const userName = context.userProfile?.name || context.userName || '你';

      let reasoningAssigned = false;
      const allowEmpty = actions.length > 0 || rawMsgActions.length > 0 || hasGameAction || isGameTurn;
      const indexedMessages = parsePayload(reply, 'messages', { allowEmpty, indexed: true }).map(content => {
        if (!content) return null;
        if (content.type === 'transfer') content.transfer.recipientId = '@user';
        if (content.type === 'game') {
          const kind = String(content.game?.kind || '').trim() || 'old_maid';
          const wager = String(content.game?.wager || '').trim() || '纯娱乐';
          if (kind === 'buckshot_roulette') {
            const invite = createBuckshotInvitation({ sender: 'ai', wager, userName, contactName });
            content.game = {
              kind: 'buckshot_roulette',
              title: '恶魔轮盘',
              gameId: invite.id,
              status: 'invited',
              sender: 'ai',
              wager: invite.wager,
              state: invite,
              lastAction: invite.lastAction,
            };
          } else {
            const invite = createOldMaidInvitation({ sender: 'ai', wager, userName, contactName });
            content.game = {
              kind: 'old_maid',
              title: '抽鬼牌',
              gameId: invite.id,
              status: 'invited',
              sender: 'ai',
              wager: invite.wager,
              state: invite,
              lastAction: invite.lastAction,
            };
          }
          content.text = messageText(content);
        }
        if (content.type === 'poke') {
          content.poke.actorId = id;
          if (!content.poke.actorName || content.poke.actorName === '对方') {
            content.poke.actorName = context.contact?.name || '对方';
          }
          content.text = messageText(content);
        }
        if (content.replyToId) {
          const resolved = resolveReplyId(content.replyToId);
          if (resolved) content.replyToId = resolved;
          else delete content.replyToId;
        }
        const reasoningData = (!reasoningAssigned && reasoning) ? { reasoning } : {};
        reasoningAssigned = true;
        return { ...record('assistant', content.text, clock, content.translation, context.batch), ...content, ...reasoningData };
      });
      const messages = indexedMessages.filter(Boolean);

      if (messages.filter(m => m.role === 'assistant').length === 0 && (isGameTurn || hasGameAction)) {
        const extraText = String(answer.reply || answer.text || (typeof rawGameAction === 'object' && (rawGameAction.message || rawGameAction.talk)) || '').trim();
        if (extraText) {
          messages.unshift({
            ...record('assistant', extraText, clock, '', context.batch),
            text: extraText,
          });
        } else if (isGameTurn) {
          const cleanReply = String(reply || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          if (cleanReply && !cleanReply.includes('{') && !cleanReply.includes('}')) {
            messages.unshift({
              ...record('assistant', cleanReply, clock, '', context.batch),
              text: cleanReply,
            });
          }
        }
      }

      const todoCandidates = parseTodoCandidates(answer.todoSuggestions ?? answer.todos, { conversationId: id, messages: indexedMessages, participantIds: (context.todoPeople || []).map(person => person.id) });
      for (const item of actions) {
        const targetTransferId = resolveReplyId(item.transferId) || item.transferId;
        await store.respondTransfer(id, targetTransferId, item.status, id, context.batch);
      }

      if (pendingInvite && rawGameAction) {
        const gameKind = pendingInvite.game?.kind || 'old_maid';
        const gameTitle = gameKind === 'buckshot_roulette' ? '恶魔轮盘' : '抽鬼牌';
        if (gameActionKind === 'accept' || gameActionKind === 'accepted') {
          const wager = String(typeof rawGameAction === 'object' && rawGameAction.wager ? rawGameAction.wager : pendingInvite.game.wager || '纯娱乐').trim();
          let startedGame;
          if (gameKind === 'buckshot_roulette') {
            startedGame = acceptBuckshotGame(pendingInvite.game.state || pendingInvite.game, { wager, starter: 'user', userName, contactName });
          } else {
            startedGame = acceptOldMaidGame(pendingInvite.game.state || pendingInvite.game, { wager, starter: 'user', userName, contactName });
          }
          await store.updateGameMessage(id, pendingInvite.id, startedGame);
          if (startedGame.lastAction?.description) {
            messages.push({
              ...record('system', startedGame.lastAction.description, clock, '', context.batch),
              type: 'game-action',
            });
          }
        } else if (gameActionKind === 'counter' || gameActionKind === 'negotiate') {
          const newWager = String(typeof rawGameAction === 'object' && rawGameAction.wager ? rawGameAction.wager : '').trim();
          if (newWager) {
            const updatedInvite = {
              ...pendingInvite.game,
              wager: newWager,
              status: 'countered',
              state: { ...(pendingInvite.game.state || pendingInvite.game), wager: newWager, status: 'countered' },
            };
            await store.updateGameMessage(id, pendingInvite.id, updatedInvite);
            messages.push({
              ...record('system', `【${contactName}】提议将${gameTitle}赌注更换为【${newWager}】`, clock, '', context.batch),
              type: 'game-action',
            });
          }
        } else if (gameActionKind === 'reject' || gameActionKind === 'rejected') {
          const reason = String(typeof rawGameAction === 'object' && rawGameAction.reason ? rawGameAction.reason : '').trim();
          let rejectedGame;
          if (gameKind === 'buckshot_roulette') {
            rejectedGame = rejectBuckshotGame(pendingInvite.game.state || pendingInvite.game, { reason, contactName });
          } else {
            rejectedGame = rejectOldMaidGame(pendingInvite.game.state || pendingInvite.game, { reason, contactName });
          }
          await store.updateGameMessage(id, pendingInvite.id, rejectedGame);
        }
      }

      // 进行中的牌局：检查 AI 是否在动作中提议更换/加码赌注
      if (activeGameMsg && typeof rawGameAction === 'object' && rawGameAction.wager) {
        const proposedWager = String(rawGameAction.wager).trim();
        const currentGame = activeGameMsg.game.state || activeGameMsg.game;
        if (proposedWager && proposedWager !== currentGame.wager) {
          currentGame.wager = proposedWager;
          activeGameMsg.game.wager = proposedWager;
          messages.push({
            ...record('system', `【${contactName}】将本局赌注变更为【${proposedWager}】`, clock, '', context.batch),
            type: 'game-action',
          });
        }
      }

      // 进行中的牌局：若轮到对方行动，自动出牌推进回合
      if (activeGameMsg && activeGameMsg.game?.turn === 'ai') {
        const gameKind = activeGameMsg.game?.kind || 'old_maid';
        const customNotice = String(typeof rawGameAction === 'object' && (rawGameAction.notice || rawGameAction.text) ? (rawGameAction.notice || rawGameAction.text) : '').trim();
        let currentGameState = activeGameMsg.game.state || activeGameMsg.game;

        if (gameKind === 'buckshot_roulette') {
          // 恶魔轮盘行动分发：支持连续决策（如使用道具或开枪赌空弹保留回合）
          let loopCount = 0;
          while (currentGameState.status === 'playing' && currentGameState.turn === 'ai' && loopCount < 8) {
            loopCount++;
            let actionType = typeof rawGameAction === 'object' && loopCount === 1 ? (rawGameAction.action || '') : '';
            let itemKey = typeof rawGameAction === 'object' && loopCount === 1 ? (rawGameAction.item || '') : '';

            // 如果非首轮循环或模型未给出合法动作，由 AI 算法自主决策兜底
            if (!actionType || (actionType === 'use_item' && !itemKey)) {
              const aiDecision = getAiBuckshotDecision(currentGameState);
              if (!aiDecision) {
                actionType = 'shoot_opponent';
              } else {
                actionType = aiDecision.action;
                itemKey = aiDecision.item;
              }
            }

            let stepResult = null;
            if (actionType === 'use_item' && itemKey) {
              stepResult = buckshotUseItem(currentGameState, {
                actor: 'ai',
                itemKey,
                userName,
                contactName,
                customNotice: loopCount === 1 ? customNotice : '',
              });
            } else if (actionType === 'shoot_self') {
              stepResult = buckshotShootSelf(currentGameState, {
                actor: 'ai',
                userName,
                contactName,
                customNotice: loopCount === 1 ? customNotice : '',
              });
            } else {
              // 默认射击对手
              stepResult = buckshotShootOpponent(currentGameState, {
                actor: 'ai',
                userName,
                contactName,
                customNotice: loopCount === 1 ? customNotice : '',
              });
            }

            if (stepResult && !stepResult.error && stepResult.game) {
              currentGameState = stepResult.game;
              if (activeGameMsg.game.wager) currentGameState.wager = activeGameMsg.game.wager;
              await store.updateGameMessage(id, activeGameMsg.id, currentGameState);
              if (currentGameState.lastAction?.description) {
                messages.push({
                  ...record('system', currentGameState.lastAction.description, clock, '', context.batch),
                  type: 'game-action',
                  gameKind: 'buckshot_roulette',
                });
              }
              if (currentGameState.reloadedNotice) {
                messages.push({
                  ...record('system', currentGameState.reloadedNotice, clock, '', context.batch),
                  type: 'game-action',
                  gameKind: 'buckshot_roulette',
                });
                delete currentGameState.reloadedNotice;
              }
            } else {
              // 道具使用异常或失败时，兜底执行射击对手，避免回合卡死
              const fallbackShoot = buckshotShootOpponent(currentGameState, {
                actor: 'ai',
                userName,
                contactName,
              });
              if (fallbackShoot && !fallbackShoot.error && fallbackShoot.game) {
                currentGameState = fallbackShoot.game;
                if (activeGameMsg.game.wager) currentGameState.wager = activeGameMsg.game.wager;
                await store.updateGameMessage(id, activeGameMsg.id, currentGameState);
                if (currentGameState.lastAction?.description) {
                  messages.push({
                    ...record('system', currentGameState.lastAction.description, clock, '', context.batch),
                    type: 'game-action',
                    gameKind: 'buckshot_roulette',
                  });
                }
                if (currentGameState.reloadedNotice) {
                  messages.push({
                    ...record('system', currentGameState.reloadedNotice, clock, '', context.batch),
                    type: 'game-action',
                    gameKind: 'buckshot_roulette',
                  });
                  delete currentGameState.reloadedNotice;
                }
              }
              break;
            }
          }

          // 绝对保底：若因道具耗尽或其他原因提前退出循环但回合仍停留在 AI，强制扣动扳机射击对手
          if (currentGameState.status === 'playing' && currentGameState.turn === 'ai') {
            const finalShoot = buckshotShootOpponent(currentGameState, {
              actor: 'ai',
              userName,
              contactName,
            });
            if (finalShoot && !finalShoot.error && finalShoot.game) {
              currentGameState = finalShoot.game;
              if (activeGameMsg.game.wager) currentGameState.wager = activeGameMsg.game.wager;
              await store.updateGameMessage(id, activeGameMsg.id, currentGameState);
              if (currentGameState.lastAction?.description) {
                messages.push({
                  ...record('system', currentGameState.lastAction.description, clock, '', context.batch),
                  type: 'game-action',
                  gameKind: 'buckshot_roulette',
                });
              }
              if (currentGameState.reloadedNotice) {
                messages.push({
                  ...record('system', currentGameState.reloadedNotice, clock, '', context.batch),
                  type: 'game-action',
                  gameKind: 'buckshot_roulette',
                });
                delete currentGameState.reloadedNotice;
              }
            }
          }

          if (currentGameState.status === 'finished') {
            const winnerDesc = currentGameState.winner === 'user' ? '<user>' : '角色';
            messages.push({
              ...record('system', `[小游戏：恶魔轮盘对决结束，赌注：${currentGameState.wager || '纯娱乐'}，胜者：${winnerDesc}]`, clock, '', context.batch),
              type: 'game',
              game: {
                kind: 'buckshot_roulette',
                title: '恶魔轮盘',
                status: 'finished',
                winner: currentGameState.winner,
                loser: currentGameState.loser,
                wager: currentGameState.wager || '纯娱乐',
                round: currentGameState.round,
                state: currentGameState,
              },
            });
          }
        } else {
          // 抽鬼牌行动
          const drawIndex = typeof rawGameAction === 'object' && rawGameAction.drawIndex !== undefined
            ? Number(rawGameAction.drawIndex)
            : undefined;
          const result = aiDrawCard(currentGameState, drawIndex, { userName, contactName, customNotice });
          if (!result.error) {
            if (activeGameMsg.game.wager) result.game.wager = activeGameMsg.game.wager;
            await store.updateGameMessage(id, activeGameMsg.id, result.game);
            if (result.game.lastAction?.description) {
              messages.push({
                ...record('system', result.game.lastAction.description, clock, '', context.batch),
                type: 'game-action',
              });
            }
          }
        }
      } else if (activeGameMsg && typeof rawGameAction === 'object' && rawGameAction.wager) {
        // 非摸牌回合但变更了赌注，同步保存至 store
        const gameState = activeGameMsg.game.state || activeGameMsg.game;
        await store.updateGameMessage(id, activeGameMsg.id, gameState);
      }
      for (const item of rawMsgActions) {
        if (!item || typeof item !== 'object') continue;
        const kind = String(item.action ?? item.type ?? '').trim();
        const targetId = resolveReplyId(String(item.messageId ?? item.id ?? '').trim());
        if (!targetId) continue;
        const targetMsg = (store.read().conversations[id] || []).find(m => m.id === targetId);
        if (!targetMsg) continue;
        if ((kind === 'react' || kind === 'reaction') && item.emoji) {
          await store.addMessageReaction(id, targetId, String(item.emoji).trim());
        } else if ((kind === 'withdraw' || kind === 'recall') && targetMsg.role === 'assistant') {
          await store.withdrawMessage(id, targetId);
        } else if (kind === 'edit' && targetMsg.role === 'assistant' && !targetMsg.type && !targetMsg.withdrawn) {
          const nextText = String(item.text ?? item.newText ?? item.content ?? '').trim();
          if (nextText) await store.editMessage(id, targetId, nextText);
        }
      }
      if (messages.length) await store.appendMessages(id, messages, { todoCandidates });
      return messages;
    },
  };
}
