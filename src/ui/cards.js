import { action, escape, icon, renderBilingual } from './shared.js';
import { findSticker, stickerPacks, stickers } from '../stickers.js';
import { displayName } from '../profiles.js';
import { imageSource } from '../image-files.js';
import { blobEmojis } from '../emojis.js';

export function renderCardBody(message, generating = false) {
  if (message.type === 'sticker') {
    const sticker = findSticker(message.stickerId);
    return sticker ? `<img src="${escape(sticker.src)}" alt="${escape(sticker.label)}" draggable="false" loading="lazy">` : escape(message.text);
  }
  if (message.type === 'location') return `<span class="card-label">${icon('location')}定位</span>
    <span class="location-map" aria-hidden="true"><i></i>${icon('location')}</span>
    <strong>${escape(message.location.name)}</strong>
    ${message.location.address ? `<small>${escape(message.location.address)}</small>` : ''}`;
  if (message.type === 'transfer') return `<span class="card-label">${icon('transfer')}转账</span>
    <strong class="transfer-amount">${escape(message.transfer.currency)} ${escape(message.transfer.amount)}</strong>
    ${message.transfer.note ? `<span>${escape(message.transfer.note)}</span>` : ''}
    <small>${{ pending: '待收款', accepted: '已收下', returned: '已退回' }[message.transfer.status] || '待收款'}</small>`;
  if (message.type === 'image') {
    const photo = message.image.path
      ? `<img class="message-photo" data-phone-image="${escape(message.image.path)}" src="${escape(imageSource(message.image.path))}" alt="${escape(message.image.description)}" loading="lazy">`
      : `<span class="photo-placeholder">${icon('image')}</span>`;
    return `${photo}
      <span class="photo-description">${escape(message.image.description)}</span>
      <small>${message.image.path ? '查看图片' : generating ? '生成中…' : '点击生成'}</small>`;
  }
  if (message.type === 'game') {
    const game = message.game || {};
    const isUserSender = message.role === 'user' || game.sender === 'user';
    let statusPill = '';
    if (game.status === 'invited') {
      statusPill = `<small class="game-card-status pending">${isUserSender ? '等待邀请结果' : '收到对决邀请'}</small>`;
    } else if (game.status === 'rejected') {
      statusPill = `<small class="game-card-status lose">已拒绝邀请</small>`;
    } else if (game.status === 'finished') {
      statusPill = `<small class="game-card-status ${game.winner === 'user' ? 'win' : 'lose'}">${game.winner === 'user' ? '你赢了' : '对方获胜'}</small>`;
    } else {
      statusPill = `<small class="game-card-status active">进行中 · 第 ${game.round || 1} 轮</small>`;
    }

    return `<span class="card-label">${icon('gamepad')}抽鬼牌</span>
      <div class="game-card-body">
        <span class="game-card-wager">赌注：${escape(game.wager || '纯娱乐')}</span>
        ${statusPill}
      </div>`;
  }
  return renderBilingual(message.text, message.translation);
}

export function renderCardActions(message, { readOnly, busy }) {
  const transfer = message.transfer;
  const actions = message.type === 'transfer' && !readOnly && transfer.recipientId === '@user' && transfer.status === 'pending'
    ? `<button type="button" data-transfer-id="${escape(message.id)}" data-transfer-status="accepted" ${busy.has(`transfer:${message.id}`) ? 'disabled' : ''}>收下</button>
      <button type="button" data-transfer-id="${escape(message.id)}" data-transfer-status="returned" ${busy.has(`transfer:${message.id}`) ? 'disabled' : ''}>退回</button>`
    : '';
  const more = message.type === 'image'
    ? `<button type="button" class="icon-button card-more" data-message="${escape(message.id)}" aria-label="图片消息操作">${icon('more')}</button>`
    : '';

  let gameAction = '';
  if (message.type === 'game' && !readOnly) {
    const game = message.game || {};
    const isUserSender = message.role === 'user' || game.sender === 'user';
    if (game.status === 'invited') {
      if (!isUserSender && game.sender === 'ai') {
        gameAction = `<button type="button" class="game-open-action" data-game-invite-id="${escape(message.id)}" data-game-invite-action="accept">接受对决</button>
          <button type="button" class="game-open-action secondary" data-game-invite-id="${escape(message.id)}" data-game-invite-action="reject">拒绝</button>`;
      }
    } else if (game.status === 'playing') {
      gameAction = `<button type="button" class="game-open-action" data-open-game-id="${escape(message.id)}" aria-label="进入牌桌">进入牌桌</button>`;
    } else if (game.status === 'finished') {
      gameAction = `<button type="button" class="game-open-action" data-open-game-id="${escape(message.id)}" aria-label="查看战局">查看战局</button>`;
    }
  }

  return actions || more || gameAction ? `<div class="card-actions">${actions}${more}${gameAction}</div>` : '';
}

export function renderAttachments(state, ui, busy, contact, isGroup) {
  if (!ui.attachment) return '';
  const heading = `<div class="attachment-heading">
    <span>${({ menu: '', stickers: '表情', location: '定位', transfer: '转账', games: '抽鬼牌' })[ui.attachment] || ''}</span>
    ${action('close-attachment', '收起附件', 'close', 'icon-button')}
  </div>`;
  if (ui.attachment === 'menu') return `<section class="attachment-panel">
    <div class="attachment-shortcuts">
      ${action('choose-stickers', '表情', 'smile')}
      ${action('choose-location', '定位', 'location')}
      ${action('choose-transfer', '转账', 'transfer')}
      ${action('choose-games', '抽鬼牌', 'gamepad')}
    </div>
  </section>`;
  if (ui.attachment === 'stickers') {
    const packs = [{ id: 'emoji', name: '小表情', credit: 'Google / C1710 · Apache 2.0' }, ...stickerPacks];
    const pack = packs.find(item => item.id === ui.stickerPack) || packs[0], inline = pack.id === 'emoji';
    const tabs = packs.map(item => `<button type="button" role="tab" aria-selected="${item.id === pack.id}" data-sticker-pack="${item.id}">${item.name}</button>`).join('');
    const choices = (inline ? blobEmojis : stickers.filter(item => item.pack === pack.id)).map(item => `<button type="button" ${inline ? `data-inline-emoji="${item.code}"` : `data-sticker="${item.id}"`} aria-label="${inline ? '插入' : '发送'}表情：${item.label}" ${busy.has(`send:${contact.id}`) ? 'disabled' : ''}>
      <img src="${escape(item.src)}" alt="" loading="lazy" draggable="false">
    </button>`).join('');
    return `<section class="attachment-panel sticker-picker">
      ${heading}
      <div class="sticker-tabs" role="tablist" aria-label="表情包">${tabs}</div>
      <div class="sticker-grid ${inline ? 'emoji-grid' : ''}">${choices}</div>
      <small class="sticker-credit">${escape(pack.credit)}</small>
    </section>`;
  }
  if (ui.attachment === 'games') {
    const draft = ui.attachmentDraft || {};
    const currentWager = draft.wager ?? '';
    return `<section class="attachment-panel game-invite-picker">
      ${heading}
      <form class="attachment-form game-invite-form">
        <label class="attachment-field">
          <span>赌注</span>
          <input name="wager" aria-label="赌注" type="text" value="${escape(currentWager)}" placeholder="输入赌注，如：答应赢家一个要求">
        </label>
        <button type="submit" class="save-button" aria-label="发起抽鬼牌" ${busy.has(`send:${contact.id}`) ? 'disabled' : ''}>
          发起邀请
        </button>
      </form>
    </section>`;
  }
  const draft = ui.attachmentDraft;
  const field = (name, label, type = 'text', value = draft[name] || '') => `<label class="attachment-field">
    <span>${label}</span>
    <input name="${name}" aria-label="${label}" type="${type}" value="${escape(value)}"
      ${['name', 'amount'].includes(name) ? 'required' : ''} ${name === 'amount' ? 'min="0.01" step="0.01" inputmode="decimal"' : ''}>
  </label>`;
  let fields;
  if (ui.attachment === 'location') {
    fields = `${field('name', '地点')}${field('address', '地址')}`;
  } else {
    const recipient = isGroup ? `<label class="attachment-field">
      <span>收款人</span>
      <select name="recipientId" aria-label="收款人" required>
        <option value="">选择群成员</option>
        ${contact.memberIds.map(id => state.contacts.find(person => person.id === id)).filter(Boolean).map(person => `<option value="${escape(person.id)}" ${draft.recipientId === person.id ? 'selected' : ''}>${escape(displayName(person))}</option>`).join('')}
      </select>
    </label>` : '';
    fields = `<div class="attachment-columns">
      ${field('amount', '金额', 'number')}
      ${field('currency', '币种', 'text', draft.currency || 'CNY')}
    </div>
    ${recipient}
    ${field('note', '备注')}`;
  }
  return `<section class="attachment-panel">
    ${heading}
    <form class="attachment-form">
      ${fields}
      <button type="submit" class="save-button" aria-label="发送${ui.attachment === 'location' ? '定位' : '转账'}" ${busy.has(`send:${contact.id}`) ? 'disabled' : ''}>发送</button>
    </form>
  </section>`;
}

export function renderPhotoViewer(photo) {
  return photo ? `<div class="photo-viewer" role="dialog" aria-label="查看图片" aria-modal="true">
    ${action('close-photo', '关闭图片', 'close', 'icon-button')}
    <img data-phone-image="${escape(photo.path)}" src="${escape(imageSource(photo.path))}" alt="${escape(photo.description)}">
    <p>${escape(photo.description)}</p>
  </div>` : '';
}
