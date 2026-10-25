import { messageText } from '../content.js';
import { displayName } from '../profiles.js';
import { getSocialAuthor, readSocialPosts } from '../social.js';
import { avatar, escape, icon, renderEmojiText } from './shared.js';

const fallbackPreview = '点击查看';

function preview(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallbackPreview;
}

function noticeButton(kind, id, title, content, visual) {
  const identifier = id ? ` data-notice-id="${escape(id)}"` : '';
  return `<div class="phone-top-notice" role="status">
    <button type="button" class="phone-top-notice-open" data-action="open-phone-notice" data-notice-kind="${escape(kind)}"${identifier} aria-label="${escape(`${title}：${content}`)}">
      <span class="phone-top-notice-visual">${visual}</span>
      <span class="phone-top-notice-copy"><strong>${escape(title)}</strong><span>${renderEmojiText(content)}</span></span>
    </button>
    <button type="button" class="phone-top-notice-dismiss" data-action="dismiss-phone-notice" aria-label="关闭${escape(title)}通知">${icon('close')}</button>
  </div>`;
}

function messageNotice(state, id) {
  const person = [...(state.contacts || []), ...(state.groups || [])].find(item => item.id === id);
  const last = (state.conversations?.[id] || []).findLast(item => item.role === 'assistant');
  if (!person || !last) return '';
  return noticeButton('message', id, displayName(person), preview(messageText(last)), avatar(person, true));
}

function socialReplyNotice(state, id) {
  const post = (state.social?.posts || []).find(item => item.id === id);
  const comment = post?.comments?.findLast(item => item.replyToId && item.read === false);
  if (!post || !comment) return '';
  const author = comment.authorId ? getSocialAuthor(state, comment.authorId) : null;
  const person = author || { name: comment.name || '有人' };
  const title = `${displayName(person)} 回复了你`;
  return noticeButton('social-reply', id, title, preview(comment.text), avatar(person, true));
}

function socialFeedNotice(state) {
  const post = readSocialPosts(state)[0];
  if (!post) return '';
  const author = getSocialAuthor(state, post.authorId);
  const content = post.text || post.image?.description;
  return noticeButton('social-feed', undefined, 'ainstgram已更新', preview(content), author ? avatar(author, true) : icon('social'));
}

function socialAuthorNotice(state, id) {
  const author = getSocialAuthor(state, id);
  if (!author) return '';
  const post = readSocialPosts(state, { authorId: id })[0];
  return noticeButton('social-author', id, `${displayName(author)}的动态已更新`, preview(post?.text || post?.image?.description), avatar(author, true));
}

function forumNotice(state) {
  const post = state.forum?.posts?.[0];
  if (!post) return '';
  return noticeButton('forum', undefined, '论坛有新内容', preview(post.title || post.content), icon('forum'));
}

function calendarAiNotice(notice) {
  return noticeButton('calendar-ai', undefined, notice.title || '日历生成完毕', preview(notice.content || '点击回到日历界面'), icon('sparkles'));
}

export function renderPhoneNotice(state, notice) {
  if (!notice || !state) return '';
  switch (notice.kind) {
    case 'message': return notice.id ? messageNotice(state, notice.id) : '';
    case 'social-reply': return notice.id ? socialReplyNotice(state, notice.id) : '';
    case 'social-feed': return socialFeedNotice(state);
    case 'social-author': return notice.id ? socialAuthorNotice(state, notice.id) : '';
    case 'forum': return forumNotice(state);
    case 'calendar-ai': return calendarAiNotice(notice);
    default: return '';
  }
}
