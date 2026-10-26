// 小游戏对弈面板（In-Chat Game Board Drawer）
// 支持：抽鬼牌 (Old Maid) 与 恶魔轮盘 (Buckshot Roulette)
import { action, escape, icon, asset } from './shared.js';
import { cardDisplayName } from '../games/old-maid.js';
import { ITEM_INFO, getChamberCounts } from '../games/buckshot-roulette.js';
import { displayName } from '../profiles.js';

// 渲染抽鬼牌面板
function renderOldMaidBoard(game, { contact, isGroup, busy }) {
  const isFinished = game.status === 'finished';
  const isUserTurn = game.turn === 'user' && !isFinished;
  const isAiTurn = game.turn === 'ai' && !isFinished;
  const cardBackUrl = asset('cards/BACK.svg');

  // 对手手牌区（背面牌按钮）
  const aiHand = (game.aiCards || []).map((card, index) => {
    const isTarget = isUserTurn;
    return `<button type="button" class="playing-card card-back ${isTarget ? 'pickable' : ''}"
      ${isTarget ? `data-game-action="user-draw" data-card-index="${index}" aria-label="抽取第 ${index + 1} 张牌"` : 'disabled'}
      ${busy.has(`game:${game.id}`) || (contact?.id && busy.has(`continue:${contact.id}`)) ? 'disabled' : ''}>
      <img src="${escape(cardBackUrl)}" alt="扑克背面" draggable="false" loading="lazy">
    </button>`;
  }).join('');

  // 玩家手牌区（明牌按钮）
  const userHand = (game.userCards || []).map((card, index) => {
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
        ${action('fold-game-board', '折叠牌桌', 'arrow-up', 'icon-button game-ctrl-btn')}
        ${action('close-game-board', '关闭牌桌', 'close', 'icon-button game-ctrl-btn')}
      </div>
    </header>

    <div class="game-board-content">
      <!-- 对方区域 -->
      <div class="game-section ai-section">
        <div class="player-header">
          <span class="player-label">${escape(displayName(contact))} 的手牌 · ${(game.aiCards || []).length} 张</span>
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
          <span class="player-label">你的手牌 · ${(game.userCards || []).length} 张</span>
          <span class="discard-counter">已成对消除：${(game.discardPile || []).length} 对</span>
        </div>
        <div class="cards-fan user-cards-fan">
          ${userHand}
        </div>
        ${finishActions}
      </div>
    </div>
  </section>`;
}

// 渲染恶魔轮盘生命点数
function renderHpPips(hp = 0, maxHp = 3) {
  const pips = [];
  for (let i = 0; i < maxHp; i++) {
    const isFilled = i < hp;
    pips.push(`<span class="hp-pip ${isFilled ? 'is-filled' : 'is-lost'}" title="${isFilled ? '存活' : '已损耗'}"></span>`);
  }
  return `<div class="hp-pips-group">${pips.join('')}<span class="hp-num">${hp}/${maxHp}</span></div>`;
}

// 渲染恶魔轮盘面板
function renderBuckshotBoard(game, { contact, isGroup, busy }) {
  const isFinished = game.status === 'finished';
  const isUserTurn = game.turn === 'user' && !isFinished;
  const isAiTurn = game.turn === 'ai' && !isFinished;
  const isBusy = busy.has(`game:${game.id}`) || (contact?.id && busy.has(`continue:${contact.id}`));

  const chamber = game.chamber || [];
  const { live, blank, total } = getChamberCounts(chamber);

  // 状态指示
  let statusBanner = '';
  if (isFinished) {
    const isUserWinner = game.winner === 'user';
    const isTie = !game.winner && !game.loser;
    let bannerTitle = '你赢了！';
    let bannerDesc = `【${escape(displayName(contact))}】倒下，你赢得了这场恶魔轮盘生死博弈！`;
    if (isTie) {
      bannerTitle = '同归于尽！';
      bannerDesc = '双方生命同时耗尽，此局为平手！';
    } else if (!isUserWinner) {
      bannerTitle = '你输了！';
      bannerDesc = '你的生命值已归零，落败倒下。';
    }
    statusBanner = `<div class="game-status-banner ${isUserWinner ? 'winner-user' : 'winner-ai'}">
      <div class="banner-text">
        <strong>${bannerTitle}</strong>
        <p>${bannerDesc}</p>
        <button type="button" class="wager-fulfill is-clickable" data-action="edit-game-wager" title="点击更换赌注">赌注：${escape(game.wager || '纯娱乐')} ✎</button>
      </div>
    </div>`;
  } else if (isUserTurn) {
    statusBanner = `<div class="game-turn-banner user-turn">
      <span class="turn-dot"></span>
      <span class="turn-desc">你的回合：选择使用道具或扣动扳机</span>
    </div>`;
  } else {
    statusBanner = `<div class="game-turn-banner ai-turn">
      <span class="turn-dot ai"></span>
      <span class="turn-desc">【${escape(displayName(contact))}】的回合：正在抉择与扣动扳机…</span>
    </div>`;
  }

  // 弹药与局势信息
  const chamberInfo = `<div class="buckshot-chamber-bar">
    <div class="chamber-stat">
      <span class="chamber-label">当前弹仓剩余：<strong>${total}</strong> 发</span>
      <span class="chamber-detail">（初始装填：${game.initialLive || live} 实弹 · ${game.initialBlank || blank} 空弹）</span>
    </div>
    <div class="chamber-badges">
      ${game.sawedOff ? `<span class="chamber-badge is-sawed">🪚 枪管已锯短（实弹 2 倍致命伤害！）</span>` : ''}
      ${game.handcuffed ? `<span class="chamber-badge is-cuffed">⛓️ 【${game.handcuffed === 'user' ? '你' : escape(displayName(contact))}】被手铐锁住</span>` : ''}
      ${game.userKnownNext !== null && isUserTurn ? `<span class="chamber-badge is-known">🔍 放大镜私密情报：下一发是【${game.userKnownNext ? '实弹 ⚡' : '空弹 💨'}】</span>` : ''}
    </div>
  </div>`;

  // 对方道具展示（展示名字和数量）
  const aiItems = (game.aiItems || []).map(key => {
    const item = ITEM_INFO[key] || { name: key };
    return `<span class="buckshot-item-pill is-opponent" title="${escape(item.desc || '')}">
      ${escape(item.name)}
    </span>`;
  }).join('') || '<span class="buckshot-empty-hint">暂无道具</span>';

  // 玩家道具展示（可点击使用）
  const userItems = (game.userItems || []).map(key => {
    const item = ITEM_INFO[key] || { name: key };
    const canUse = isUserTurn && !isBusy;
    return `<button type="button" class="buckshot-item-pill is-user ${canUse ? 'is-usable' : ''}"
      data-buckshot-action="use-item" data-item-key="${escape(key)}"
      ${canUse ? '' : 'disabled'}
      title="${escape(item.desc || '')}（点击使用）">
      <strong>${escape(item.name)}</strong>
      <small>${escape(item.desc || '')}</small>
    </button>`;
  }).join('') || '<span class="buckshot-empty-hint">暂无可用道具</span>';

  // 扳机操作区（朝对方开枪 / 朝自己开枪）
  const triggerActions = !isFinished ? `<div class="buckshot-trigger-controls">
    <button type="button" class="buckshot-shoot-btn shoot-opponent"
      data-buckshot-action="shoot-opponent"
      ${isUserTurn && !isBusy ? '' : 'disabled'}>
      <span class="shoot-title">瞄准【${escape(displayName(contact))}】开枪</span>
      <span class="shoot-sub">实弹造成伤害，空弹虚惊一场</span>
    </button>
    <button type="button" class="buckshot-shoot-btn shoot-self"
      data-buckshot-action="shoot-self"
      ${isUserTurn && !isBusy ? '' : 'disabled'}>
      <span class="shoot-title">朝自己开枪</span>
      <span class="shoot-sub">空弹无伤且【额外保留行动回合】</span>
    </button>
  </div>` : '';

  // 终局结算按钮
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

  return `<section class="game-board-drawer buckshot-drawer" role="dialog" aria-label="恶魔轮盘对决桌">
    <header class="game-board-header">
      <div class="game-board-title">
        <span class="game-icon">${icon('gamepad')}</span>
        <span class="game-round-pill">恶魔轮盘 · 第 ${game.round || 1} 轮</span>
        <button type="button" class="game-wager-pill is-clickable" data-action="edit-game-wager" title="点击更换赌注">赌注：${escape(game.wager || '纯娱乐')} ✎</button>
      </div>
      <div class="game-board-controls">
        ${!isFinished ? `<button type="button" class="game-surrender-inline-btn" data-action="surrender-game" title="认输结算">认输</button>` : ''}
        ${action('fold-game-board', '折叠对决桌', 'arrow-up', 'icon-button game-ctrl-btn')}
        ${action('close-game-board', '关闭对决桌', 'close', 'icon-button game-ctrl-btn')}
      </div>
    </header>

    <div class="game-board-content buckshot-content">
      <!-- 对方状态 -->
      <div class="buckshot-side ai-side">
        <div class="player-header">
          <span class="player-label">${escape(displayName(contact))}</span>
          ${renderHpPips(game.aiHp, game.maxHp)}
        </div>
        <div class="buckshot-items-bar">
          <span class="items-label">持有道具：</span>
          <div class="items-list">${aiItems}</div>
        </div>
      </div>

      <!-- 中央战况与弹仓指示 -->
      <div class="game-section table-section buckshot-center">
        ${chamberInfo}
        ${statusBanner}
        ${lastActionText ? `<div class="last-action-feed">${escape(lastActionText)}</div>` : ''}
        ${triggerActions}
      </div>

      <!-- 玩家状态与背包 -->
      <div class="buckshot-side user-side">
        <div class="player-header">
          <span class="player-label">你的生命值</span>
          ${renderHpPips(game.userHp, game.maxHp)}
        </div>
        <div class="buckshot-items-bar">
          <span class="items-label">你的战术道具（点击立即使用）：</span>
          <div class="items-list user-items-grid">${userItems}</div>
        </div>
        ${finishActions}
      </div>
    </div>
  </section>`;
}

// 主渲染入口
export function renderGameBoard(game, options) {
  if (!game || (game.status !== 'playing' && game.status !== 'finished')) return '';
  if (game.kind === 'buckshot_roulette') {
    return renderBuckshotBoard(game, options);
  }
  return renderOldMaidBoard(game, options);
}
