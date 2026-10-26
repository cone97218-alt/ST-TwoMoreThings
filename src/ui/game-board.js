// 抽鬼牌对弈面板（In-Chat Game Board Drawer）
import { action, escape, icon, asset } from './shared.js';
import { cardDisplayName } from '../games/old-maid.js';
import { displayName } from '../profiles.js';

export function renderGameBoard(game, { contact, isGroup, busy }) {
  if (!game || game.status !== 'playing' && game.status !== 'finished') return '';

  const isFinished = game.status === 'finished';
  const isUserTurn = game.turn === 'user' && !isFinished;
  const isAiTurn = game.turn === 'ai' && !isFinished;
  const cardBackUrl = asset('cards/BACK.svg');

  // 对手手牌区（背面牌按钮）
  const aiHand = game.aiCards.map((card, index) => {
    const isTarget = isUserTurn;
    return `<button type="button" class="playing-card card-back ${isTarget ? 'pickable' : ''}"
      ${isTarget ? `data-game-action="user-draw" data-card-index="${index}" aria-label="抽取第 ${index + 1} 张牌"` : 'disabled'}
      ${busy.has(`game:${game.id}`) || (contact?.id && busy.has(`continue:${contact.id}`)) ? 'disabled' : ''}>
      <img src="${escape(cardBackUrl)}" alt="扑克背面" draggable="false" loading="lazy">
    </button>`;
  }).join('');

  // 玩家手牌区（明牌按钮）
  const userHand = game.userCards.map((card, index) => {
    const cardUrl = asset(`cards/${card.id}.svg`);
    const isBluffed = game.bluffCardIndex === index;
    const canBluff = isAiTurn;
    return `<button type="button" class="playing-card card-front ${card.isJoker ? 'is-joker' : ''} ${isBluffed ? 'is-bluffed' : ''} ${canBluff ? 'bluffable' : ''}"
      ${canBluff ? `data-game-action="toggle-bluff" data-card-index="${index}" aria-label="微抽第 ${index + 1} 张牌"` : ''}>
      <img src="${escape(cardUrl)}" alt="${escape(cardDisplayName(card))}" draggable="false" loading="lazy">
      ${card.isJoker ? '<span class="joker-badge">鬼牌</span>' : ''}
    </button>`;
  }).join('');

  // 状态指示
  let statusBanner = '';
  if (isFinished) {
    const isUserWinner = game.winner === 'user';
    statusBanner = `<div class="game-status-banner ${isUserWinner ? 'winner-user' : 'winner-ai'}">
      <div class="banner-text">
        <strong>${isUserWinner ? '你赢了！' : '你输了！'}</strong>
        <p>${isUserWinner ? '对方手握鬼牌落败。' : '你手握鬼牌落败。'}</p>
        <button type="button" class="wager-fulfill is-clickable" data-action="edit-game-wager" title="点击更换赌注">赌注：${escape(game.wager || '纯娱乐')} ✎</button>
      </div>
    </div>`;
  } else if (isUserTurn) {
    statusBanner = `<div class="game-turn-banner user-turn">
      <span class="turn-dot"></span>
      <span class="turn-desc">你的回合：点击抽取对方的一张牌</span>
    </div>`;
  } else {
    statusBanner = `<div class="game-turn-banner ai-turn">
      <span class="turn-dot ai"></span>
      <span class="turn-desc">对方回合：对方正在抽牌与回应…</span>
    </div>`;
  }

  // 终局操作
  let finishActions = '';
  if (isFinished) {
    const isUserWinner = game.winner === 'user';
    finishActions = `<div class="game-finish-actions">
      ${isUserWinner ? `
        <button type="button" class="fulfill-button" data-game-action="urge-wager">
          催促对方兑现赌注
        </button>
      ` : `
        <button type="button" class="fulfill-button admit-defeat" data-game-action="admit-defeat">
          承认落败并受罚
        </button>
      `}
      <button type="button" class="restart-button" data-game-action="rematch">
        再来一局
      </button>
    </div>`;
  }

  const lastActionText = game.lastAction?.description || '';

  return `<section class="game-board-drawer" role="dialog" aria-label="抽鬼牌对弈桌">
    <header class="game-board-header">
      <div class="game-board-title">
        <span class="game-icon">${icon('gamepad')}</span>
        <span class="game-round-pill">${game.round || 1}</span>
        <button type="button" class="game-wager-pill is-clickable" data-action="edit-game-wager" title="点击更换赌注">赌注：${escape(game.wager || '纯娱乐')} ✎</button>
      </div>
      <div class="game-board-controls">
        ${!isFinished ? `<button type="button" class="game-surrender-inline-btn" data-action="surrender-game" title="认输结算">认输</button>` : ''}
        ${action('fold-game-board', '折叠牌桌', 'arrow-down', 'icon-button game-ctrl-btn')}
        ${action('close-game-board', '关闭牌桌', 'close', 'icon-button game-ctrl-btn')}
      </div>
    </header>

    <div class="game-board-content">
      <!-- 对方区域 -->
      <div class="game-section ai-section">
        <div class="player-header">
          <span class="player-label">${escape(displayName(contact))} 的手牌 · ${game.aiCards.length} 张</span>
        </div>
        <div class="cards-fan ai-cards-fan">
          ${aiHand}
        </div>
      </div>

      <!-- 中央战况指示 -->
      <div class="game-section table-section">
        ${statusBanner}
        ${lastActionText ? `<div class="last-action-feed">${escape(lastActionText)}</div>` : ''}
      </div>

      <!-- 玩家区域 -->
      <div class="game-section user-section">
        <div class="player-header">
          <span class="player-label">你的手牌 · ${game.userCards.length} 张</span>
          <span class="discard-counter">已成对消除：${game.discardPile.length} 对</span>
        </div>
        <div class="cards-fan user-cards-fan">
          ${userHand}
        </div>
        ${finishActions}
      </div>
    </div>
  </section>`;
}
