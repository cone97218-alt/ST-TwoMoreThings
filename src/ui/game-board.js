// 小游戏对弈面板（In-Chat Game Board Drawer）
// 支持：抽鬼牌 (Old Maid) 与 恶魔轮盘 (Buckshot Roulette)
import { action, escape, icon, asset } from './shared.js';
import { cardDisplayName } from '../games/old-maid.js';
import { ITEM_INFO, getChamberCounts } from '../games/buckshot-roulette.js';
import { displayName } from '../profiles.js';

// 渲染抽鬼牌面板
function renderOldMaidBoard(game, { contact, isGroup, busy, guideOpen }) {
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

  const guideBody = `
    <div class="game-guide-view">
      <div class="game-guide-header">
        <h3>${icon('gamepad')} 抽鬼牌 · 玩法规则</h3>
        <button type="button" class="game-guide-close-btn" data-action="close-game-guide" title="关闭说明，返回对决">
          ${icon('close')} <span>返回对决</span>
        </button>
      </div>
      <div class="game-guide-section">
        <h4>基础规则</h4>
        <p>1. 两人轮流从对方的手牌中抽取一张牌。</p>
        <p>2. 若抽到的牌与自己手牌中某张牌点数相同，则自动配对成对并弃置消去。</p>
        <p>3. 率先清空手中所有牌的一方获得胜利！</p>
        <p>4. 场上有一张无法配对的唯一【鬼牌 (JOKER)】，最后手中只剩下鬼牌者落败。</p>
      </div>
    </div>`;

  return `<section class="game-board-drawer" role="dialog" aria-label="抽鬼牌对弈桌">
    <header class="game-board-header">
      <div class="game-board-title">
        <button type="button" class="game-icon-btn is-clickable ${guideOpen ? 'is-active' : ''}" data-action="toggle-game-guide" title="游戏规则与说明">
          ${icon('gamepad')}
        </button>
        <span class="game-round-pill">${game.round || 1}</span>
        <button type="button" class="game-wager-pill is-clickable" data-action="edit-game-wager" title="赌注：${escape(game.wager || '纯娱乐')}（点击更换赌注）">
          <span class="wager-text">赌注：${escape(game.wager || '纯娱乐')} ✎</span>
        </button>
      </div>
      <div class="game-board-controls">
        ${!isFinished ? `<button type="button" class="game-surrender-inline-btn" data-action="surrender-game" title="认输结算">认输</button>` : ''}
        ${action('fold-game-board', '折叠牌桌', 'arrow-up', 'icon-button game-ctrl-btn')}
        ${action('close-game-board', '关闭牌桌', 'close', 'icon-button game-ctrl-btn')}
      </div>
    </header>

    <div class="game-board-content">
      ${guideOpen ? guideBody : `
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
      `}
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
function renderBuckshotBoard(game, { contact, isGroup, busy, guideOpen, guideTab = 'guide' }) {
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
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="turn-dot ai"></span>
        <span class="turn-desc">【${escape(displayName(contact))}】的回合：正在抉择与扣动扳机…</span>
      </div>
      ${!isBusy ? `<button type="button" class="ai-draw-trigger-button is-clickable" data-buckshot-action="ai-turn-continue" title="催促对方扣动扳机">催促开枪</button>` : ''}
    </div>`;
  }

  // 弹药与局势信息（采用统一线性图标）
  const chamberInfo = `<div class="buckshot-chamber-bar">
    <div class="chamber-stat">
      <span class="chamber-label">当前弹仓剩余：<strong>${total}</strong> 发</span>
      <span class="chamber-detail">（初始装填：${game.initialLive || live} 实弹 · ${game.initialBlank || blank} 空弹）</span>
    </div>
    <div class="chamber-badges">
      ${game.sawedOff ? `<span class="chamber-badge is-sawed">${icon('saw')} 枪管已锯短（实弹 2 倍致命伤害！）</span>` : ''}
      ${game.handcuffed ? `<span class="chamber-badge is-cuffed">${icon('handcuffs')} 【${game.handcuffed === 'user' ? '你' : escape(displayName(contact))}】被手铐锁住</span>` : ''}
      ${game.userKnownNext !== null && isUserTurn ? `<span class="chamber-badge is-known">${icon('magnifier')} 放大镜私密情报：下一发是【${game.userKnownNext ? '实弹' : '空弹'}】</span>` : ''}
    </div>
  </div>`;

  // 对方道具展示（带统一线性图标）
  const aiItems = (game.aiItems || []).map(key => {
    const item = ITEM_INFO[key] || { name: key, icon: 'gamepad' };
    return `<span class="buckshot-item-pill is-opponent" title="${escape(item.desc || '')}">
      <span class="item-icon">${icon(item.icon || 'gamepad')}</span>
      <span>${escape(item.name)}</span>
    </span>`;
  }).join('') || '<span class="buckshot-empty-hint">暂无道具</span>';

  // 玩家道具展示（可点击使用，带统一线性图标）
  const userItems = (game.userItems || []).map(key => {
    const item = ITEM_INFO[key] || { name: key, icon: 'gamepad' };
    const canUse = isUserTurn && !isBusy;
    return `<button type="button" class="buckshot-item-pill is-user ${canUse ? 'is-usable' : ''}"
      data-buckshot-action="use-item" data-item-key="${escape(key)}"
      ${canUse ? '' : 'disabled'}
      title="${escape(item.desc || '')}">
      <span class="item-icon">${icon(item.icon || 'gamepad')}</span>
      <strong>${escape(item.name)}</strong>
    </button>`;
  }).join('') || '<span class="buckshot-empty-hint">暂无可用道具</span>';

  // 扳机操作区（朝对方开枪 / 朝自己开枪）
  const triggerActions = !isFinished ? `<div class="buckshot-trigger-controls">
    <button type="button" class="buckshot-shoot-btn shoot-opponent"
      data-buckshot-action="shoot-opponent"
      ${isUserTurn && !isBusy ? '' : 'disabled'}>
      <span class="shoot-title">瞄准【${escape(displayName(contact))}】开枪</span>
    </button>
    <button type="button" class="buckshot-shoot-btn shoot-self"
      data-buckshot-action="shoot-self"
      ${isUserTurn && !isBusy ? '' : 'disabled'}>
      <span class="shoot-title">朝自己开枪</span>
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

  // 战局档案记录视窗
  const chronicleBody = `
    <div class="game-chronicle-view">
      <div class="chronicle-summary">
        <div class="chronicle-stat-row">
          <span>赌注：<strong>${escape(game.wager || '纯娱乐')}</strong></span>
          <span>双方生命：<strong>${game.userHp}/${game.maxHp}</strong> vs <strong>${game.aiHp}/${game.maxHp}</strong></span>
        </div>
      </div>
      <div class="chronicle-rounds-list">
        ${(game.rounds || [{ roundNumber: game.round || 1, initialLive: game.initialLive || 0, initialBlank: game.initialBlank || 0, actions: [] }]).map(r => `
          <div class="chronicle-round-card ${r.roundNumber === (game.round || 1) ? 'is-current' : ''}">
            <div class="chronicle-round-head">
              <span class="round-badge">第 ${r.roundNumber} 轮${r.roundNumber === (game.round || 1) ? '（激战中）' : '（已完结）'}</span>
              <span class="bullet-tally">初始装弹: ${r.initialLive} 实 · ${r.initialBlank} 空</span>
            </div>
            <div class="chronicle-round-body">
              <div class="fired-stat">本轮已打出：<strong>${r.firedLive || 0}</strong> 实弹 · <strong>${r.firedBlank || 0}</strong> 空弹</div>
              ${(r.actions && r.actions.length) ? `
                <ul class="chronicle-events-list">
                  ${r.actions.map(a => `<li>${escape(a.summary)}</li>`).join('')}
                </ul>
              ` : '<p class="chronicle-empty-events">等待本轮交锋展开…</p>'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;

  // 玩法规则与道具图鉴视窗（单色线性图标风格）
  const rulesBody = `
    <div class="game-guide-section">
      <h4>基础规则</h4>
      <p>1. 弹仓装填未知数量的【实弹】与【空弹】，入膛顺序全随机。</p>
      <p>2. 朝对方开枪：若为实弹对方扣除 1 点生命（枪管锯短为 2 点）；若为空弹则安全，回合移交对方。</p>
      <p>3. 朝自己开枪：若为空弹无伤，且【额外保留行动回合】继续由你出招！若为实弹则自损生命，回合移交对方。</p>
      <p>4. 弹仓子弹射空后，系统将自动重新装弹并补给双方道具，直至一方生命归零分出胜负。</p>
    </div>
    <div class="game-guide-section">
      <h4>战术道具说明</h4>
      <div class="game-guide-items-grid">
        <div class="guide-item-card">
          <span class="guide-item-icon">${icon('magnifier')}</span>
          <div class="guide-item-info">
            <strong>放大镜</strong>
            <p>私密窥视弹膛，立即洞悉当前膛内下一发子弹是实弹还是空弹。</p>
          </div>
        </div>
        <div class="guide-item-card">
          <span class="guide-item-icon">${icon('saw')}</span>
          <div class="guide-item-info">
            <strong>手锯</strong>
            <p>锯短霰弹枪枪管，使下一发实弹命中时造成 2 点致命伤害（打出空弹则失效）。</p>
          </div>
        </div>
        <div class="guide-item-card">
          <span class="guide-item-icon">${icon('beer')}</span>
          <div class="guide-item-info">
            <strong>啤酒</strong>
            <p>退膛弹出当前膛内的一发子弹，并当场向双方公布被退出的子弹是实弹还是空弹。</p>
          </div>
        </div>
        <div class="guide-item-card">
          <span class="guide-item-icon">${icon('handcuffs')}</span>
          <div class="guide-item-info">
            <strong>手铐</strong>
            <p>锁住对方，使其在下个轮次中被跳过行动，为你赢得连续出招的机会。</p>
          </div>
        </div>
        <div class="guide-item-card">
          <span class="guide-item-icon">${icon('cigarette')}</span>
          <div class="guide-item-info">
            <strong>香烟</strong>
            <p>平复心绪，立即恢复 1 点生命值（无法超出初始上限）。</p>
          </div>
        </div>
      </div>
    </div>`;

  const guideBody = `
    <div class="game-guide-view">
      <div class="game-guide-header">
        <div class="game-guide-tabs">
          <button type="button" class="game-guide-tab ${guideTab === 'guide' ? 'is-active' : ''}" data-action="switch-game-guide-tab" data-guide-tab="guide">规则图鉴</button>
          <button type="button" class="game-guide-tab ${guideTab === 'chronicle' ? 'is-active' : ''}" data-action="switch-game-guide-tab" data-guide-tab="chronicle">战局档案</button>
        </div>
        <button type="button" class="game-guide-close-btn" data-action="close-game-guide" title="关闭说明，返回对决">
          ${icon('close')} <span>返回对决</span>
        </button>
      </div>
      ${guideTab === 'chronicle' ? chronicleBody : rulesBody}
    </div>`;

  return `<section class="game-board-drawer buckshot-drawer" role="dialog" aria-label="恶魔轮盘对决桌">
    <header class="game-board-header">
      <div class="game-board-title">
        <button type="button" class="game-icon-btn is-clickable ${guideOpen ? 'is-active' : ''}" data-action="toggle-game-guide" title="游戏规则与道具说明">
          ${icon('gamepad')}
        </button>
        <span class="game-round-pill">${game.round || 1} 轮</span>
        <button type="button" class="game-wager-pill is-clickable" data-action="edit-game-wager" title="赌注：${escape(game.wager || '纯娱乐')}（点击更换赌注）">
          <span class="wager-text">赌注：${escape(game.wager || '纯娱乐')} ✎</span>
        </button>
      </div>
      <div class="game-board-controls">
        ${!isFinished ? `<button type="button" class="game-surrender-inline-btn" data-action="surrender-game" title="认输结算">认输</button>` : ''}
        ${action('fold-game-board', '折叠对决桌', 'arrow-up', 'icon-button game-ctrl-btn')}
        ${action('close-game-board', '关闭对决桌', 'close', 'icon-button game-ctrl-btn')}
      </div>
    </header>

    <div class="game-board-content buckshot-content">
      ${guideOpen ? guideBody : `
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
            <span class="items-label">你的道具：</span>
            <div class="items-list user-items-grid">${userItems}</div>
          </div>
          ${finishActions}
        </div>
      `}
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
