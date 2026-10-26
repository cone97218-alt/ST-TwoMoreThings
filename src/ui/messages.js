import { action, avatar, empty, escape, icon, pageHeading, renderEmojiText, renderMentionText } from './shared.js';
import { displayName } from '../profiles.js';
import { partitionHistory } from '../timeline.js';
import { messageText } from '../content.js';
import { renderAttachments, renderCardActions, renderCardBody } from './cards.js';
import { renderGameBoard } from './game-board.js';
import { chatBackgroundStyle } from '../backgrounds.js';
import { renderTodoCandidate } from './todos.js';
import { replyContext } from '../replies.js';

const DEFAULT_QUICK_REACTIONS = ['❤️', '🥰', '👍', '👌', '😂', '🤔'];
const EXTENDED_REACTIONS = ['🥹', '😭', '😤', '😳', '🙏', '🎉', '🔥', '👀', '💔', '🤝', '🫡', '✨'];

function getQuickReactions(state) {
  const recent = Array.isArray(state?.recentReactions) ? state.recentReactions.filter(Boolean) : [];
  const merged = [...recent];
  for (const emoji of DEFAULT_QUICK_REACTIONS) {
    if (!merged.includes(emoji)) merged.push(emoji);
  }
  return merged.slice(0, 6);
}

export function renderInbox(state, { ui, busy }) {
  const groups = state.groups || [];
  const options = `<div class="inbox-options">
    ${action('inbox-menu', '通讯录操作', 'plus', 'icon-button')}
    ${ui.inboxMenu ? `<div class="chat-menu">
      ${action('organize', busy.has('directory') ? '整理中…' : '整理通讯录', '', 'menu-item', busy.has('directory'))}
      ${action('add-contact', '添加联系人', '', 'menu-item')}
      ${action('add-group', '创建群聊', '', 'menu-item')}
    </div>` : ''}
  </div>`;
  const groupRows = groups.map(group => {
    const last = state.conversations[group.id]?.at(-1), sender = state.contacts.find(person => person.id === last?.speakerId);
    const preview = last
      ? (last.type === 'poke' || last.withdrawn
        ? messageText(last)
        : `${last.role === 'user' ? '我' : displayName(sender || { name: '群成员' })}：${messageText(last)}`)
      : `${group.memberIds.length + Number(group.userIsMember)} 位成员`;
    return `<button type="button" class="contact-row" data-group="${escape(group.id)}">
      ${avatar(group)}
      <span class="contact-copy">
        <span class="contact-title">
          <strong>${escape(group.name)}</strong>
          <span class="contact-time">${escape(last?.timeLabel || '')}</span>
        </span>
        <span class="contact-preview">${renderEmojiText(preview)}</span>
      </span>
      ${icon('next')}
    </button>`;
  }).join('');
  const contactRows = state.contacts.map(contact => {
    const last = state.conversations[contact.id]?.at(-1);
    return `<button type="button" class="contact-row" data-contact="${escape(contact.id)}">
      ${avatar(contact)}
      <span class="contact-copy">
        <span class="contact-title">
          <strong>${escape(displayName(contact))}</strong>
          <span class="contact-time">${escape(last?.timeLabel || '')}</span>
        </span>
        ${last ? `<span class="contact-preview">${renderEmojiText(messageText(last))}</span>` : ''}
      </span>
      ${icon('next')}
    </button>`;
  }).join('');
  return `${pageHeading('短信', options)}
    ${groups.length ? `
      <div class="section-label"><span>群聊</span><span>${groups.length} 个</span></div>
      <div class="contact-list">${groupRows}</div>` : ''}
    <div class="section-label"><span>联系人</span><span>${state.contacts.length} 位</span></div>
    <div class="contact-list">${contactRows}</div>
    ${!state.contacts.length ? empty('还没有联系人') : ''}`;
}

function renderMessage(message, previous, next, { contact, user, selected, deleting, isGroup, busy, readOnly = false, state, ui, conversationId }) {
  const mine = message.role === 'user';
  const sender = isGroup && !mine ? state.contacts?.find(person => person.id === message.speakerId) || { name: '群成员' } : null;
  const senderDisplayName = mine ? '你' : displayName(sender || contact);

  if (message.type === 'poke') {
    const actorName = message.poke?.actorName || senderDisplayName;
    const targetName = message.poke?.targetName || (mine ? displayName(contact) : '你');
    const suffix = message.poke?.suffix || '的头像';
    return `<div class="message-row is-system is-poke" data-poke-id="${escape(message.id)}" data-message-row-id="${escape(message.id)}">
      <div class="poke-notice" role="status">
        <span class="poke-icon" aria-hidden="true">👉🏻</span>
        <span class="poke-actor">${escape(actorName)}</span>
        <span class="poke-verb">拍了拍</span>
        <span class="poke-target">${escape(targetName)}</span>
        <span class="poke-suffix">${escape(suffix)}</span>
        ${!readOnly ? `<button type="button" class="system-notice-delete" data-action="delete-system-message" data-message-id="${escape(message.id)}" aria-label="删除拍一拍">×</button>` : ''}
      </div>
    </div>`;
  }

  const thoughtOpen = !mine && ui.thoughtMessageId === message.id;
  const thoughtBusy = busy.has(`thought:${message.id}`);
  const thoughtCard = thoughtOpen ? `<div class="chat-avatar-thought" role="region" aria-label="角色心声">
    <div class="chat-avatar-thought__head">
      <span class="chat-avatar-thought__badge">💭 ${escape(displayName(sender || contact))} 的隐秘心声</span>
      <div class="chat-avatar-thought__actions">
        <button type="button" class="thought-action-btn" data-action="generate-thought" data-message-id="${escape(message.id)}" data-speaker-id="${escape(sender?.id || contact.id)}" ${thoughtBusy ? 'disabled' : ''}>${thoughtBusy ? '推演中…' : (message.thought ? '重新推演' : '推演心声')}</button>
        <button type="button" class="thought-close-btn" data-action="close-thought" aria-label="关闭心声">×</button>
      </div>
    </div>
    ${message.withdrawn && message.withdrawnText ? `<p class="chat-avatar-thought__body">撤回原话：「${escape(message.withdrawnText)}」</p>` : ''}
    <p class="chat-avatar-thought__body">${thoughtBusy ? '正在倾听TA发这条消息时的潜台词…' : escape(message.thought || '点击右上角「推演心声」，窥探TA发这条消息时的真实想法。')}</p>
  </div>` : '';

  const reasoningOpen = Boolean(ui.openReasoningIds?.has(message.id));
  const reasoningBlock = message.reasoning ? `<div class="message-reasoning-wrap">
    <button type="button" class="message-reasoning-toggle${reasoningOpen ? ' is-open' : ''}" data-action="toggle-reasoning" data-message-id="${escape(message.id)}" aria-expanded="${reasoningOpen}">
      <span class="reasoning-icon">${icon('clock')}</span>
      <span class="reasoning-label">思考过程</span>
      <span class="reasoning-arrow">${icon('chevron-right')}</span>
    </button>
    ${reasoningOpen ? `<div class="message-reasoning-card" role="region" aria-label="模型思考过程">
      <div class="message-reasoning-content">${escape(message.reasoning)}</div>
    </div>` : ''}
  </div>` : '';

  if (message.withdrawn) {
    return `<div class="message-row is-system is-withdrawn" data-withdrawn-id="${escape(message.id)}" data-message-row-id="${escape(message.id)}">
      <div class="withdrawn-notice" role="status">
        <span>${escape(mine ? '你撤回了一条消息' : `${senderDisplayName}撤回了一条消息`)}</span>
        ${mine && message.withdrawnText && !readOnly ? `<button type="button" class="withdrawn-reedit-btn" data-action="reedit-withdrawn" data-message-id="${escape(message.id)}">重新编辑</button>` : ''}
        ${!mine && !readOnly ? `<button type="button" class="withdrawn-reedit-btn" data-action="toggle-thought" data-message-id="${escape(message.id)}">💭 心声</button>` : ''}
        ${!readOnly ? `<button type="button" class="system-notice-delete" data-action="delete-system-message" data-message-id="${escape(message.id)}" aria-label="删除撤回提示">×</button>` : ''}
      </div>
      ${thoughtCard}
    </div>`;
  }

  const party = item => item && !item.withdrawn && item.type !== 'poke' && (item.speakerId || item.role);
  const hasPrev = party(previous) === party(message), hasNext = party(next) === party(message);
  const grouped = `${hasPrev ? ' grouped-top' : ''}${hasNext ? ' grouped-bottom' : ''}${previous && !hasPrev ? ' group-start' : ''}`;
  const multiSelect = Boolean(ui.multiSelectMode && !readOnly);
  const multiChecked = Boolean(multiSelect && ui.selectedMessageIds?.has(message.id));
  const chosen = !multiSelect && selected === message.id;
  const observer = isGroup && !contact.userIsMember;

  const bubbleAttributes = message.type === 'image' && !multiSelect
    ? `data-action="photo" data-photo="${escape(message.id)}" aria-label="${message.image.path ? '查看图片' : '生成图片'}" ${busy.has(`image:${message.id}`) ? 'disabled' : ''}`
    : `data-message="${escape(message.id)}" aria-label="短信：${escape(messageText(message))}" aria-expanded="${chosen}"`;

  const hasMetaBadges = Boolean(message.forwarded || message.editedAt || message.favorite);
  const showFoot = Boolean((!hasNext && message.timeLabel) || hasMetaBadges);
  const timestamp = showFoot
    ? `<div class="message-foot">
        ${message.forwarded ? '<span class="message-meta-badge">转发</span>' : ''}
        ${message.editedAt ? '<span class="message-meta-badge">已编辑</span>' : ''}
        ${message.favorite ? '<span class="message-meta-badge is-favorite" title="已收藏">★</span>' : ''}
        ${message.timeLabel ? `<time title="${escape([message.storyDate, message.storyWeekday, message.timeLabel].filter(Boolean).join(' '))}" datetime="${escape(message.createdAt || '')}">${escape(message.timeLabel)}</time>` : ''}
      </div>`
    : '';

  const groupPeople = isGroup ? [{ ...user, id: '@user', name: user.name || ui.defaultUser || '我' }, ...(state.contacts || []).filter(person => contact.memberIds?.includes(person.id))] : [];
  let messageAvatar;
  if (isGroup && !mine && sender?.id) {
    messageAvatar = `<button type="button" class="mention-avatar" data-mention-id="${escape(sender.id)}" data-poke-target-id="${escape(sender.id)}" data-poke-target-name="${escape(displayName(sender))}" data-message-id="${escape(message.id)}" title="单击 @提及 · 双击拍一拍" aria-label="提及${escape(displayName(sender))}">${avatar(sender, true)}</button>`;
  } else if (!isGroup && !mine) {
    messageAvatar = `<button type="button" class="chat-avatar-btn${message.thought ? ' has-thought' : ''}" data-action="toggle-thought" data-message-id="${escape(message.id)}" data-poke-target-id="${escape(contact.id)}" data-poke-target-name="${escape(displayName(contact))}" title="单击查看心声 · 双击拍一拍" aria-label="查看${escape(displayName(contact))}心声">${avatar(contact, true)}</button>`;
  } else {
    messageAvatar = avatar(mine ? { tone: 'lilac', ...user } : contact, true);
  }

  const reply = replyContext(message, state.conversations?.[conversationId] || []);
  const replyName = reply && !reply.missing
    ? displayName(
      reply.role === 'user'
        ? user
        : (isGroup
          ? state.contacts.find(person => person.id === reply.speakerId) || { name: '已移除联系人' }
          : contact),
    )
    : '';
  let replyText = '';
  if (reply) {
    if (reply.missing) {
      replyText = '原消息已删除';
    } else if (reply.withdrawn) {
      replyText = '原消息已撤回';
    } else {
      const raw = String(reply.messageText || '').trim();
      const firstLine = raw.split('\n')[0].trim();
      replyText = firstLine.length > 20 ? `${firstLine.slice(0, 20)}…` : (raw.includes('\n') && !firstLine.endsWith('…') ? `${firstLine}…` : (firstLine || '消息'));
    }
  }
  const replyBlock = reply ? `<div class="message-reply${reply.missing || reply.withdrawn ? ' is-missing' : ''}" role="button" tabindex="0" data-action="locate-reply-message" data-target-id="${escape(reply.messageId)}" title="点击跳转定位至被引用的消息"><small>引用${replyName ? ` ${escape(replyName)}` : ''}</small><span>${renderMentionText(replyText, groupPeople)}</span></div>` : '';
  const forwardedBlock = message.forwarded
    ? `<div class="message-forwarded-head"><small>↪ 转发自 ${escape(message.forwardedFrom?.senderName || '聊天记录')}${message.forwardedFrom?.isGroup && message.forwardedFrom?.chatName ? ` · ${escape(message.forwardedFrom.chatName)}` : ''}</small></div>`
    : '';
  const body = !message.type ? `<span class="message-original">${renderMentionText(message.text, groupPeople)}</span>${message.translation ? `<span class="message-translation" lang="zh-CN">${renderMentionText(message.translation, groupPeople)}</span>` : ''}` : renderCardBody(message, busy.has(`image:${message.id}`));

  const quickEmojis = getQuickReactions(state);
  const moreOpen = ui.reactionMoreMessageId === message.id;
  const reactionBar = chosen && !readOnly ? `<div class="message-reaction-bar" role="group" aria-label="表情回应">
    <div class="message-reaction-quick">
      ${quickEmojis.map(emoji => `<button type="button" class="reaction-pick-btn${message.reactions?.includes(emoji) ? ' is-active' : ''}" data-action="react-message" data-message-id="${escape(message.id)}" data-emoji="${escape(emoji)}" aria-label="回应 ${escape(emoji)}">${escape(emoji)}</button>`).join('')}
      <button type="button" class="reaction-more-btn${moreOpen ? ' is-open' : ''}" data-action="toggle-reaction-more" data-message-id="${escape(message.id)}" aria-label="更多表情">+</button>
    </div>
    ${moreOpen ? `<div class="message-reaction-drawer">
      ${EXTENDED_REACTIONS.map(emoji => `<button type="button" class="reaction-pick-btn${message.reactions?.includes(emoji) ? ' is-active' : ''}" data-action="react-message" data-message-id="${escape(message.id)}" data-emoji="${escape(emoji)}" aria-label="回应 ${escape(emoji)}">${escape(emoji)}</button>`).join('')}
    </div>` : ''}
  </div>` : '';

  const reactionsRow = Array.isArray(message.reactions) && message.reactions.length
    ? `<div class="message-reactions" aria-label="已添加的表情回应">
        ${message.reactions.map(emoji => `<button type="button" class="message-reaction-chip" data-action="toggle-message-reaction" data-message-id="${escape(message.id)}" data-emoji="${escape(emoji)}" aria-label="取消或切换回应 ${escape(emoji)}" ${readOnly ? 'disabled' : ''}><span>${escape(emoji)}</span></button>`).join('')}
      </div>`
    : '';

  const selectCol = multiSelect ? `<div class="message-select-col">
    <button type="button" class="message-select-checkbox${multiChecked ? ' is-checked' : ''}" data-action="toggle-select-message" data-message-id="${escape(message.id)}" aria-label="选择消息" aria-pressed="${multiChecked}">
      ${multiChecked ? '✓' : ''}
    </button>
    ${ui.multiSelectAnchorId === message.id
      ? '<span class="message-range-anchor">起点</span>'
      : (ui.multiSelectAnchorId ? `<button type="button" class="message-range-btn" data-action="select-range-to" data-message-id="${escape(message.id)}">选到这里</button>` : '')}
  </div>` : '';

  return `<div class="message-row ${mine ? 'is-mine' : 'is-theirs'}${chosen ? ' is-selected' : ''}${multiSelect ? ' is-multi-selecting' : ''}${multiChecked ? ' is-multi-checked' : ''}${showFoot ? ' has-time' : ''}${grouped}" data-message-row-id="${escape(message.id)}">
    ${selectCol}
    ${messageAvatar}
    <div class="message-body">
      <div class="message-copy">
        ${isGroup && !mine && !hasPrev ? `<span class="message-sender">${escape(displayName(sender || contact))}</span>` : ''}
        ${reasoningBlock}
        ${thoughtCard}
        <div class="bubble-line">
          ${reactionBar}
          <button type="button" class="bubble ${message.type ? `${message.type}-message` : ''}" ${bubbleAttributes}>${forwardedBlock}${body}</button>
          ${chosen ? `<div class="message-actions" role="group" aria-label="短信操作">
            ${!readOnly && !observer ? action('reply-message', '引用', 'message-reply', 'message-action message-reply-action') : ''}
            ${!readOnly && !message.type ? action('edit-message', '编辑', 'message-edit', 'message-action') : ''}
            ${action('copy-message', '复制', 'message-copy', 'message-action')}
            ${!readOnly ? action('favorite-message', message.favorite ? '已藏' : '收藏', message.favorite ? 'message-star-active' : 'message-star', `message-action${message.favorite ? ' is-active' : ''}`) : ''}
            ${!readOnly ? action('forward-message', '转发', 'message-forward', 'message-action') : ''}
            ${!readOnly ? action('multi-select-message', '多选', 'message-select', 'message-action') : ''}
            ${!readOnly && !mine ? action('open-message-thought', '心声', 'message-thought', `message-action${message.thought ? ' is-active' : ''}`) : ''}
            ${!readOnly && !mine && !observer ? action('poke-contact', '拍拍', 'message-poke', 'message-action') : ''}
            ${!readOnly ? action('withdraw-message', '撤回', 'message-undo', 'message-action') : ''}
            <button type="button" class="message-action message-delete danger" data-action="delete-message" aria-label="删除这条短信" ${deleting ? 'disabled' : ''}>${icon('message-delete')}<span>删除</span></button>
          </div>` : ''}
        </div>
        ${replyBlock}
        ${reactionsRow}
        ${renderCardActions(message, { readOnly, busy })}
        ${(state?.todos || []).filter(todo => ['candidate', 'open'].includes(todo.status) && todo.sourceConversationId === conversationId && todo.sourceMessageIds?.[0] === message.id).map(todo => renderTodoCandidate(todo, state, ui, busy)).join('')}
        ${timestamp}
      </div>
    </div>
  </div>`;
}

function renderEditModal(state, ui, conversationId) {
  if (!ui.editingMessageId) return '';
  const thread = state.conversations?.[conversationId] || [];
  const target = thread.find(item => item.id === ui.editingMessageId);
  if (!target) return '';
  const draftText = ui.editingMessageDraft !== undefined ? ui.editingMessageDraft : (target.text || '');
  return `<div class="chat-modal-backdrop" data-action="cancel-edit-message">
    <section class="chat-modal-card" role="dialog" aria-modal="true" aria-label="编辑消息">
      <header class="chat-modal-head">
        <h2>编辑消息</h2>
        <button type="button" class="icon-button" data-action="cancel-edit-message" aria-label="关闭编辑">${icon('close')}</button>
      </header>
      <div class="chat-modal-body">
        <textarea id="message-edit-textarea" class="chat-modal-textarea" rows="4" aria-label="编辑后的消息内容">${escape(draftText)}</textarea>
      </div>
      <footer class="chat-modal-foot">
        ${action('cancel-edit-message', '取消', '', 'quiet-button')}
        ${action('save-edit-message', '保存修改', '', 'primary-pill-button')}
      </footer>
    </section>
  </div>`;
}

function renderForwardModal(state, ui, conversationId) {
  const forwardIds = Array.isArray(ui.forwardMessageIds) ? ui.forwardMessageIds : [];
  if (!forwardIds.length) return '';
  const contacts = state.contacts || [];
  const groups = (state.groups || []).filter(g => g.userIsMember !== false);
  const selectedTarget = ui.forwardTargetId || contacts.find(c => c.id !== conversationId)?.id || contacts[0]?.id || groups[0]?.id || '';
  return `<div class="chat-modal-backdrop" data-action="close-forward">
    <section class="chat-modal-card forward-modal-card" role="dialog" aria-modal="true" aria-label="转发消息">
      <header class="chat-modal-head">
        <h2>转发 ${forwardIds.length} 条消息</h2>
        <button type="button" class="icon-button" data-action="close-forward" aria-label="关闭转发">${icon('close')}</button>
      </header>
      <div class="chat-modal-body">
        <div class="forward-target-list" role="listbox" aria-label="选择转发对象">
          ${groups.map(group => `<button type="button" class="forward-target-item${selectedTarget === group.id ? ' is-selected' : ''}" data-action="select-forward-target" data-target-id="${escape(group.id)}">
            ${avatar(group, true)}
            <span class="forward-target-name">${escape(group.name)} <small>群聊</small></span>
            ${selectedTarget === group.id ? '<span class="forward-target-check">✓</span>' : ''}
          </button>`).join('')}
          ${contacts.map(person => `<button type="button" class="forward-target-item${selectedTarget === person.id ? ' is-selected' : ''}" data-action="select-forward-target" data-target-id="${escape(person.id)}">
            ${avatar(person, true)}
            <span class="forward-target-name">${escape(displayName(person))}</span>
            ${selectedTarget === person.id ? '<span class="forward-target-check">✓</span>' : ''}
          </button>`).join('')}
        </div>
        <input type="text" id="forward-note-input" class="forward-note-input" placeholder="给对方留言（可选）" value="${escape(ui.forwardNote || '')}" aria-label="转发附言">
      </div>
      <footer class="chat-modal-foot">
        ${action('close-forward', '取消', '', 'quiet-button')}
        ${action('confirm-forward', '确认转发', '', 'primary-pill-button', !selectedTarget)}
      </footer>
    </section>
  </div>`;
}

function renderFavoritesModal(state, ui, contact, user, isGroup) {
  if (!ui.favoritesOpen) return '';
  const thread = state.conversations?.[contact.id] || [];
  const favorites = thread.filter(msg => msg.favorite && !msg.withdrawn);
  return `<div class="chat-modal-backdrop" data-action="close-favorites">
    <section class="chat-modal-card favorites-modal-card" role="dialog" aria-modal="true" aria-label="本会话收藏">
      <header class="chat-modal-head">
        <h2>收藏夹 (${favorites.length})</h2>
        <button type="button" class="icon-button" data-action="close-favorites" aria-label="关闭收藏夹">${icon('close')}</button>
      </header>
      <div class="chat-modal-body favorites-list">
        ${favorites.length ? favorites.map(msg => {
          const senderName = msg.role === 'user'
            ? displayName(user)
            : displayName(isGroup ? (state.contacts.find(p => p.id === msg.speakerId) || { name: '群成员' }) : contact);
          return `<article class="favorite-item">
            <div class="favorite-item-head">
              <strong>${escape(senderName)}</strong>
              <time>${escape(msg.timeLabel || '')}</time>
            </div>
            <p class="favorite-item-text">${renderEmojiText(messageText(msg))}</p>
            <div class="favorite-item-actions">
              <button type="button" class="quiet-button" data-action="copy-favorite-item" data-message-id="${escape(msg.id)}">复制</button>
              <button type="button" class="quiet-button danger" data-action="unfavorite-item" data-message-id="${escape(msg.id)}">取消收藏</button>
            </div>
          </article>`;
        }).join('') : '<p class="favorites-empty">暂无收藏消息，点击气泡菜单中的「收藏」即可加入。</p>'}
      </div>
    </section>
  </div>`;
}

export function renderChat(state, { ui, busy }) {
  const isGroup = ui.view === 'group-chat';
  const contact = isGroup ? state.groups?.find(item => item.id === ui.groupId) : state.contacts.find(item => item.id === ui.contactId);
  if (!contact) return empty('还没有选择联系人', '返回消息页，选择一个想聊的人。');
  const allMessages = state.conversations[contact.id] || [];
  const { current: history, past } = partitionHistory(allMessages, ui.batch);
  const visible = history.slice(-ui.visibleMessages);
  const generating = busy.has(`continue:${contact.id}`), saving = busy.has(`send:${contact.id}`);
  const user = state.userProfile || { name: ui.defaultUser };
  const deleting = busy.has(`delete:${contact.id}`);
  const messageView = {
    contact, user, selected: ui.selectedMessage, state, ui, conversationId: contact.id,
    deleting, isGroup, busy,
  };
  const profileAction = isGroup ? 'edit-group' : 'profile';
  const observer = isGroup && !contact.userIsMember;
  const reply = ui.replyToId ? replyContext({ replyToId: ui.replyToId }, allMessages) : undefined;
  const replySenderName = reply && !reply.missing
    ? (reply.role === 'user'
      ? displayName(user)
      : displayName(isGroup ? (state.contacts.find(p => p.id === reply.speakerId) || { name: '群成员' }) : contact))
    : '';
  const replyPreview = reply && !observer ? `<div class="reply-preview"><div><small>引用${replySenderName ? ` ${escape(replySenderName)}` : ''}${reply.missing ? ' · 原消息已删除' : ''}</small><span>${reply.missing ? '原消息已删除' : escape(reply.messageText)}</span></div>${action('cancel-reply', '取消引用', 'close', 'icon-button')}</div>` : '';
  const renderList = (items, readOnly = false) => items.map((message, index) => renderMessage(
    message, items[index - 1], items[index + 1], {
      ...messageView, readOnly,
      contact,
    },
  )).join('');
  const historySections = [];
  let remaining = ui.visibleHistory;
  if (ui.historyOpen) for (let index = past.length - 1; index >= 0 && remaining > 0; index--) {
    const group = past[index], items = group.messages.slice(-remaining);
    remaining -= items.length;
    historySections.unshift(`<section class="past-batch" aria-label="历史聊天，只读">
      <div class="message-date"><span>${escape(group.label)}</span></div>
      ${renderList(items, true)}
    </section>`);
  }
  const pastCount = past.reduce((sum, group) => sum + group.messages.length, 0);
  const favCount = allMessages.filter(m => m.favorite && !m.withdrawn).length;
  const chatMenu = ui.chatMenu ? `<div class="chat-menu">
    ${action(profileAction, isGroup ? '编辑群聊' : '编辑联系人', '', 'menu-item')}
    ${!isGroup ? action('poke-chat-partner', '拍一拍对方', '', 'menu-item') : ''}
    ${action('open-favorites', `收藏夹 (${favCount})`, '', 'menu-item')}
    ${action('enter-multi-select', '多选消息', '', 'menu-item')}
    ${action('clear-chat', '清空聊天', '', 'menu-item danger', generating || saving)}
    ${action(isGroup ? 'remove-group' : 'remove-contact', isGroup ? '删除群聊' : '删除联系人', '', 'menu-item danger')}
  </div>` : '';
  const clearConfirmation = ui.confirmClear ? `<section class="clear-confirm" role="alert">
    <p>清空当前主楼时间点之后的消息及草稿，同时删除相关生成图片；过去的记录保留。</p>
    <div>
      ${action('cancel-clear', '取消', '', 'quiet-button')}
      ${action('confirm-clear', '确认清空', '', 'quiet-button danger', busy.has(`clear:${contact.id}`))}
    </div>
  </section>` : '';

  const selectedCount = ui.selectedMessageIds ? ui.selectedMessageIds.size : 0;
  const multiToolbar = `<div class="message-multi-toolbar" role="toolbar" aria-label="批量操作">
    <div class="multi-toolbar-info">
      <strong>已选 ${selectedCount} 条</strong>
      <small>${ui.multiSelectAnchorId ? '点击另一条消息旁「选到这里」可连选区间' : '点击消息可勾选'}</small>
    </div>
    <div class="multi-toolbar-actions">
      ${action('batch-forward', '转发', 'message-forward', 'multi-action-btn', !selectedCount)}
      ${action('batch-favorite', '收藏', 'message-star', 'multi-action-btn', !selectedCount)}
      ${action('batch-delete', '删除', 'message-delete', 'multi-action-btn danger', !selectedCount || deleting)}
      ${action('leave-multi-select', '完成', 'close', 'multi-action-btn')}
    </div>
  </div>`;

  const isPlayingGame = Boolean(ui.activeGame && ui.activeGame.status === 'playing');
  const composer = ui.multiSelectMode ? multiToolbar : isPlayingGame ? `<div class="composer game-locked-composer">
    <span class="game-locked-hint">抽鬼牌对决中 · 请在牌桌操作</span>
    <button type="button" class="game-surrender-btn" data-action="surrender-game">认输结算</button>
  </div>` : observer ? `<div class="composer observer-composer">
    <span>旁观群聊</span>
    ${action('continue', '继续', 'refresh', 'continue-button', generating)}
  </div>` : `<form class="composer">
    <div class="composer-input">
      ${action('attachments', '添加消息', 'plus', 'icon-button attachment-button')}
      <label class="sr-only" for="sms-draft">短信内容</label>
      <textarea id="sms-draft" name="message" rows="1" aria-label="短信内容">${escape(ui.drafts.get(contact.id) || '')}</textarea>
      ${action('continue', '继续', 'refresh', 'continue-button', generating || saving)}
      ${action('send', '发送', 'send', 'send-button', saving)}
    </div>
  </form>
  ${renderAttachments(state, ui, busy, contact, isGroup)}`;
  return `<header class="conversation-heading">
      ${action('back-inbox', '返回消息', 'arrow', 'icon-button back-button')}
      ${avatar(contact, true)}
      <button type="button" class="conversation-person" data-action="${profileAction}" aria-label="聊天资料">
        <h1>${escape(displayName(contact))}</h1>
        ${isGroup ? `<small>${contact.memberIds.length + Number(contact.userIsMember)} 位成员${observer ? ' · 旁观' : ''}</small>` : ''}
      </button>
      <div class="chat-options">
        ${action('chat-menu', '聊天选项', 'more', 'icon-button')}
        ${chatMenu}
      </div>
    </header>
    ${clearConfirmation}
    <div class="chat-stage ${contact.background && !contact.background.startsWith('color:') ? 'has-wallpaper' : ''}" style="${escape(chatBackgroundStyle(contact.background, state.theme))}">
      <div class="message-feed" role="log" aria-label="短信记录" aria-live="polite">
        ${pastCount ? `<button type="button" class="history-fold" data-action="history" aria-expanded="${ui.historyOpen}"><span>${ui.historyOpen ? '收起过去' : '查看过去'}</span></button>` : ''}
        ${ui.historyOpen && pastCount > ui.visibleHistory ? action('earlier-history', '查看更早的历史', '', 'earlier-button') : ''}
        ${historySections.join('')}
        ${history.length > visible.length ? action('earlier', '查看更早的短信', '', 'earlier-button') : ''}
        ${visible.length ? `<div class="message-date current-batch-label"><span>${escape(ui.batch.label)}</span></div>` : ''}
        ${renderList(visible)}
        ${generating ? `<div class="message-row is-theirs">
          ${avatar(contact, true)}
          <div class="typing" role="status" aria-label="正在生成回复"><i></i><i></i><i></i></div>
        </div>` : ''}
      </div>
    </div>
    ${!ui.multiSelectMode ? replyPreview : ''}${composer}
    ${ui.activeGame ? (ui.gameBoardFolded
      ? `<button type="button" class="game-floating-pill" data-action="unfold-game-board" aria-label="展开抽鬼牌牌桌">
          ${icon('gamepad')} 抽鬼牌进行中 · 第 ${ui.activeGame.round || 1} 轮
        </button>`
      : renderGameBoard(ui.activeGame, { contact, isGroup, busy })) : ''}
    ${renderEditModal(state, ui, contact.id)}
    ${renderForwardModal(state, ui, contact.id)}
    ${renderFavoritesModal(state, ui, contact, user, isGroup)}`;
}
