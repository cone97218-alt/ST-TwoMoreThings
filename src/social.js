import { parseJsonObject } from './api.js';
import { createCameoAvatar } from './cameo-avatar.js';
import { getPrompt, SOCIAL_PROMPT, COMMENT_PROMPT, LANGUAGE_RULE, STORY_MEMORY_RULE, TODO_SUGGESTIONS_PROMPT } from './prompts.js';
import { hasPublicationDate, publicationLabel, publicationValue, sortSocialPosts } from './social-time.js';
import { normalizeContent, generateMessageId } from './content.js';
import { record } from './messages.js';
import { parseTodoCandidates } from './todos.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';

const getPrivateTodosPrompt = state => `${getPrompt('todo_suggestions', state)}\n动态和评论不提取私人待办；只有proactiveMessages里的短信可提建议，每项内放自己的todoSuggestions，索引对应该项messages。对应authors里的todoPeople/todos仅供该作者私信使用；storyProgress仅供核对后续进展，不公开，也不代表其他作者知道。`;
const PRIVATE_TODOS_PROMPT = `${TODO_SUGGESTIONS_PROMPT}\n动态和评论不提取私人待办；只有proactiveMessages里的短信可提建议，每项内放自己的todoSuggestions，索引对应该项messages。对应authors里的todoPeople/todos仅供该作者私信使用；storyProgress仅供核对后续进展，不公开，也不代表其他作者知道。`;

const text = value => typeof value === 'string' ? value.trim() : '';
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

// 好友资料仍以通讯录为准；动态只拥有自己的NPC简档，不复制第二份好友资料。
export function getSocialAuthor(state, id) {
  const contact = state.contacts?.find(person => person.id === id);
  if (contact) return { ...contact, kind: 'contact' };
  const npc = state.social?.npcs?.find(person => person.id === id);
  return npc ? { ...npc, kind: 'npc' } : null;
}

export function readSocialPosts(state, { authorId, batchKey, limit } = {}) {
  const posts = sortSocialPosts((state.social?.posts || []).filter(post => (!authorId || post.authorId === authorId) && (batchKey === undefined || post.batch?.key === batchKey)));
  return limit === undefined ? posts : posts.slice(0, count(limit));
}

// feedIds只确定本批入选作者；各页面仍引用其唯一存档里真正最新的帖子。
export function readSocialFeed(state, ordered = readSocialPosts(state)) {
  const social = state.social || { posts: [], feedIds: [] };
  const byId = new Map(social.posts.map(post => [post.id, post.authorId]));
  return latestByAuthor(ordered, new Set(social.feedIds.map(id => byId.get(id))));
}

function latestByAuthor(ordered, selected) {
  const shown = new Set();
  return ordered.filter(post => {
    if (!selected.has(post.authorId) || shown.has(post.authorId)) return false;
    shown.add(post.authorId); return true;
  });
}

const briefPost = post => ({ authorId: post.authorId, text: post.text,
  ...(post.image ? { image: { description: post.image.description } } : {}), publishedAt: publicationLabel(post),
});

function chooseFriends(contacts, random) {
  const candidates = [...contacts];
  for (let index = candidates.length - 1; index > 0; index--) {
    const selected = Math.floor(random() * (index + 1));
    [candidates[index], candidates[selected]] = [candidates[selected], candidates[index]];
  }
  return candidates.slice(0, 5).map(person => ({ ...person, kind: 'contact' }));
}

function parsePosts(answer, authors, context, perAuthor) {
  const known = new Map(authors.map(person => [person.id, person]));
  const used = new Map(), createdAt = new Date().toISOString();
  const singleAuthor = perAuthor > 1 && authors.length === 1;
  const rows = Array.isArray(answer) ? answer : answer.posts ?? answer.items ?? answer.dynamics ?? (answer.authorId != null || answer.author_id != null || singleAuthor ? [answer] : []);
  return (Array.isArray(rows) ? rows : []).flatMap(item => {
    const suppliedId = item?.authorId ?? item?.author_id;
    const missingId = suppliedId == null || typeof suppliedId === 'string' && !suppliedId.trim();
    const authorId = missingId && singleAuthor ? authors[0].id : text(suppliedId);
    if (!item || !known.has(authorId) || (used.get(authorId) || 0) >= perAuthor) return [];
    const body = text(item.text ?? item.content ?? item.caption), translation = text(item.translation ?? item.translatedText), description = text(item.image?.description);
    if (!body && !description) return [];
    const comments = (Array.isArray(item.comments) ? item.comments : []).flatMap(comment => {
      const body = text(comment?.text ?? comment?.content);
      if (!body || comment.authorId && !known.has(comment.authorId)) return [];
      const author = comment.authorId ? known.get(comment.authorId) : null;
      const name = author?.nickname || author?.name || text(comment.name ?? comment.author);
      const translation = text(comment.translation ?? comment.translatedText);
      return name ? [{ name, text: body, ...(translation ? { translation } : {}), ...(author ? { authorId: author.id } : {}) }] : [];
    }).slice(0, 2);
    used.set(authorId, (used.get(authorId) || 0) + 1);
    return [{ id: globalThis.crypto.randomUUID(), authorId, text: body, ...(body && translation ? { translation } : {}),
      ...(description ? { image: { description } } : {}),
      likes: count(item.likes), reposts: count(item.reposts), commentsCount: Math.max(count(item.commentsCount), comments.length), comments,
      createdAt, batch: context.batch, publishedAt: publicationValue(item, context.clock, perAuthor > 1),
    }];
  });
}

function parseCommentReplies(answer, authors, userNames) {
  const known = new Map(authors.map(person => [person.id, person]));
  const rows = answer.comments ?? answer.replies ?? answer.responses ?? [];
  return (Array.isArray(rows) ? rows : []).flatMap(item => {
    const suppliedId = item?.authorId ?? item?.author_id;
    const authorId = text(suppliedId);
    const name = text(item?.name ?? item?.author);
    const explicitId = suppliedId != null && (typeof suppliedId !== 'string' || suppliedId.trim());
    if (item?.role === 'user' || authorId === '@user' || (explicitId && (!authorId || !known.has(authorId)))) return [];
    if (!authorId && (!name || userNames.has(name))) return [];
    const body = text(item?.text ?? item?.content ?? item?.message);
    if (!body) return [];
    const translation = text(item?.translation ?? item?.translatedText);
    const author = known.get(authorId);
    return [{ name: author ? author.nickname || author.name : name, text: body, ...(translation ? { translation } : {}), ...(author ? { authorId } : {}) }];
  }).slice(0, 3);
}

function parseIncomingMessages(answer, context, state, allowedIds) {
  const known = new Map((state.contacts || []).map(person => [person.id, person]));
  const rows = answer.proactiveMessages ?? answer.proactive ?? [];
  return (Array.isArray(rows) ? rows : []).flatMap(entry => {
    const contactId = text(entry?.contactId ?? entry?.authorId);
    if (!contactId || !allowedIds.has(contactId) || !known.has(contactId)) return [];
    const source = Array.isArray(entry.messages) ? entry.messages : [entry];
    const indexedMessages = source.map(item => {
      const content = normalizeContent(item);
      return content && !content.type ? { ...record('assistant', content.text, context.clock, content.translation, context.batch), ...content } : null;
    });
    const messages = indexedMessages.filter(Boolean);
    const todoCandidates = parseTodoCandidates(entry.todoSuggestions ?? entry.todos, { conversationId: contactId, messages: indexedMessages, participantIds: ['@user', contactId] });
    return messages.length ? [{ contactId, messages, todoCandidates }] : [];
  });
}

export function createSocialService({ store, contextReader, modelClient, random = Math.random, defaultUser = '我', isReadingPost = () => false }) {
  return {
    getAuthor: id => {
      const author = getSocialAuthor(store.read(), id);
      return author ? structuredClone(author) : null;
    },
    // 后续消费者只得到查询结果副本；读取不会生成动态、改存档或注入正文。
    readPosts: options => structuredClone(readSocialPosts(store.read(), options)),
    async refresh() {
      const authors = chooseFriends(store.read().contacts || [], random);
      while (authors.length < 5) authors.push({ id: `npc:${globalThis.crypto.randomUUID()}`, kind: 'npc', name: '', description: '' });
      const context = await contextReader.readForSocial(authors, { includePrivateMessages: true });
      const selected = new Set(authors.map(person => person.id)), existingPosts = latestByAuthor(readSocialPosts(store.read()), selected).map(briefPost);
      const state = store.read();
      const activePreset = getActivePreset(state);

      const storyHistoryText = (context.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
      const phoneContextData = sanitizePhoneContext({ ...context, task: 'feed', existingPosts });
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: context.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: context.storyMemory || '',
        phoneContext: phoneContextData,
      }, 'social-feed', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const answer = parseJsonObject(await modelClient.complete({
        label: 'Ainstagram 动态生成',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(phoneContextData) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      }));
      const slots = new Set(authors.filter(author => author.kind === 'npc').map(author => author.id));
      const npcs = new Map();
      for (const item of Array.isArray(answer.npcs) ? answer.npcs : []) {
        if (slots.has(item?.id) && text(item.name) && !npcs.has(item.id)) npcs.set(item.id, { id: item.id, name: text(item.name), description: text(item.description) });
      }
      // 容错补全：若模型对 NPC 槽位生成了动态或评论，但未显式在 npcs 列表中给出身份，自动提取或赋予路人身份，避免整批动态丢失
      const rawRows = Array.isArray(answer) ? answer : answer.posts ?? answer.items ?? answer.dynamics ?? (answer.authorId != null || answer.author_id != null ? [answer] : []);
      const defaultNpcNames = ['同城住客', '街坊邻里', '路过市民', '附近的人', '同城旅人'];
      let autoNpcIndex = 0;
      for (const row of Array.isArray(rawRows) ? rawRows : []) {
        const id = text(row?.authorId ?? row?.author_id);
        if (id && slots.has(id) && !npcs.has(id)) {
          const directName = text(row?.name ?? row?.author ?? row?.authorName ?? row?.nickname);
          const name = directName || defaultNpcNames[autoNpcIndex % defaultNpcNames.length];
          autoNpcIndex++;
          npcs.set(id, { id, name, description: text(row?.description) || '同城公众' });
        }
        for (const c of Array.isArray(row?.comments) ? row.comments : []) {
          const cId = text(c?.authorId ?? c?.author_id);
          if (cId && slots.has(cId) && !npcs.has(cId)) {
            const cName = text(c?.name ?? c?.author ?? c?.authorName);
            const name = cName || defaultNpcNames[autoNpcIndex % defaultNpcNames.length];
            autoNpcIndex++;
            npcs.set(cId, { id: cId, name, description: '同城公众' });
          }
        }
      }
      const resolved = authors.flatMap(author => author.kind !== 'npc' ? [author] : npcs.has(author.id) ? [{ ...npcs.get(author.id), kind: 'npc' }] : []);
      const posts = parsePosts(answer, resolved, context, 1);
      if (!posts.length) throw new Error('没有生成可用的动态，请重新刷新。');
      const returnedAuthorIds = new Set(posts.flatMap(post => [post.authorId, ...(post.comments || []).map(comment => comment.authorId)]));
      const contactAuthors = new Set(resolved.filter(author => author.kind === 'contact' && returnedAuthorIds.has(author.id)).map(author => author.id));
      const incomingMessages = parseIncomingMessages(answer, context, store.read(), contactAuthors);
      let saved = [];
      await store.updateSocial((social, state) => {
        // 保存时仅排除真正已删除的好友；已生成的其他作者内容仍可保留。
        const remaining = new Set([...state.contacts, ...social.npcs, ...npcs.values()].map(person => person.id));
        saved = posts.filter(post => remaining.has(post.authorId)).map(post => ({
          ...post, comments: post.comments.filter(comment => !comment.authorId || remaining.has(comment.authorId)),
        }));
        if (!saved.length) throw new Error('动态作者已不存在，请重新刷新。');
        const published = new Set(saved.flatMap(post => [post.authorId, ...post.comments.map(comment => comment.authorId)]));
        return { posts: saved, feedIds: saved.map(post => post.id), npcs: [...npcs.values()].filter(person => published.has(person.id)).map(person => ({ ...person, avatar: createCameoAvatar() })) };
      }, { cleanImages: true, incomingMessages });
      return saved;
    },
    async generateAuthor(id) {
      const state = store.read(), author = getSocialAuthor(state, id);
      if (!author) throw new Error('这位动态作者已不存在，请返回动态列表。');
      const context = await contextReader.readForSocial([author]);
      const history = readSocialPosts(state, { authorId: id });
      const examples = [...new Map([...history.slice(0, 3), ...history.slice(-2)].map(post => [post.id, post])).values()];
      const existingPosts = examples.map(briefPost);
      const oldestDated = history.filter(hasPublicationDate).at(-1);
      const historyBefore = oldestDated ? publicationLabel(oldestDated) : [context.clock?.date, context.clock?.time].filter(Boolean).join(' ');
      const activePreset = getActivePreset(state);

      const storyHistoryText = (context.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
      const phoneContextData = sanitizePhoneContext({ ...context, task: 'author', existingPosts, historyBefore });
      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: context.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: context.storyMemory || '',
        phoneContext: phoneContextData,
      }, 'social-author', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const answer = parseJsonObject(await modelClient.complete({
        label: 'Ainstagram 动态生成',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(phoneContextData) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      }));
      const posts = parsePosts(answer, [author], context, 3);
      if (!posts.length) throw new Error('没有生成可用的个人动态，请点右上角刷新重试。');
      await store.updateSocial((social, current) => {
        if (!getSocialAuthor(current, id)) throw new Error('这位动态作者已不存在，请返回动态列表。');
        return { ...social, posts: [...social.posts, ...posts] };
      });
      return this.readPosts({ authorId: id });
    },
    async toggleLike(postId) {
      const state = store.read(), post = state.social?.posts?.find(item => item.id === postId);
      if (!post) throw new Error('这条动态已不存在，请返回动态列表。');
      let saved;
      await store.updateSocial((social) => {
        const current = social.posts.find(item => item.id === postId);
        if (!current) throw new Error('这条动态已不存在，请返回动态列表。');
        saved = { ...current, userLiked: !Boolean(current.userLiked) };
        return { ...social, posts: social.posts.map(item => item.id === postId ? saved : item) };
      });
      return { ...structuredClone(saved), likes: count(saved.likes) + Number(saved.userLiked) };
    },
    async markRepliesRead(postId) {
      const ids = new Set(Array.isArray(postId) ? postId : [postId]);
      return store.updateSocial(social => {
        if (!social.posts.some(post => ids.has(post.id) && post.comments?.some(comment => comment.read === false))) return social;
        return { ...social, posts: social.posts.map(item => ids.has(item.id) ? { ...item, comments: (item.comments || []).map(comment => comment.read === false ? { ...comment, read: true } : comment) } : item) };
      });
    },
    async comment(postId, userText, { onPosted = () => {} } = {}) {
      contextReader.assertMemorySources?.();
      const state = store.read(), post = state.social?.posts?.find(item => item.id === postId);
      const content = text(userText);
      if (!post) throw new Error('这条动态已不存在，请返回动态列表。');
      if (!content) throw new Error('请先写下评论。');
      const author = getSocialAuthor(state, post.authorId);
      if (!author) throw new Error('这条动态的作者已不存在，请返回动态列表。');
      const commenters = (post.comments || []).map(item => item.authorId).filter(Boolean).map(id => getSocialAuthor(state, id)).filter(Boolean);
      const authors = [...new Map([author, ...commenters].map(item => [item.id, item])).values()];
      const userName = text(state.userProfile?.nickname || state.userProfile?.name || defaultUser) || '我';
      const userComment = { id: generateMessageId(), role: 'user', name: userName, text: content, createdAt: new Date().toISOString() };
      await store.updateSocial(social => {
        const currentPost = social.posts.find(item => item.id === postId);
        if (!currentPost) throw new Error('这条动态已不存在，请返回动态列表。');
        const saved = { ...currentPost, comments: [...(currentPost.comments || []), userComment], commentsCount: Math.max(count(currentPost.commentsCount), (currentPost.comments || []).length) + 1 };
        return { ...social, posts: social.posts.map(item => item.id === postId ? saved : item) };
      });
      onPosted(structuredClone(userComment));
      let context, answer;
      try {
        context = await contextReader.readForSocial(authors, { includePrivateMessages: true });
        const state = store.read();
        const activePreset = getActivePreset(state);

        const storyHistoryText = (context.story || []).map(item => `${item.speaker}：${item.text}`).join('\n\n');
        const phoneContextData = sanitizePhoneContext({
          ...context,
          task: 'comment',
          post: {
            authorId: post.authorId,
            text: post.text,
            translation: post.translation,
            publishedAt: post.publishedAt || '',
            ...(post.image?.description ? { image: { description: post.image.description } } : {}),
            comments: (post.comments || []).map(({ name, text, translation, authorId, role }) => ({ name, text, ...(translation ? { translation } : {}), ...(authorId ? { authorId } : {}) })),
          },
          userComment: { name: userName, text: content },
          existingCommenters: authors.map(item => ({ id: item.id, name: item.name, nickname: item.nickname || '' })),
        });
        const messagesPayload = compilePromptPreset(activePreset, {
          worldbook: context.worldbook || '',
          storyHistory: storyHistoryText,
          storyMemory: context.storyMemory || '',
          phoneContext: phoneContextData,
          latestUserInput: content ? `用户在动态下的评论：${content}` : '',
        }, 'social-comment', state);

        const collapsed = collapseMessages(messagesPayload);
        const systemEntries = messagesPayload.filter(m => m.role === 'system');
        const userEntries = messagesPayload.filter(m => m.role !== 'system');
        const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

        answer = parseJsonObject(await modelClient.complete({
          label: '动态互动回复',
          system: systemPrompt,
          messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(phoneContextData) }],
          entries: messagesPayload,
          collapsedMessages: collapsed,
        }));
      } catch (error) { throw new Error(`评论已发布，但回复生成失败。${error.message || '请检查手机的生成连接。'}`); }
      const userNames = new Set([context.userProfile?.name, context.userProfile?.nickname, context.user].map(text).filter(Boolean));
      const replies = parseCommentReplies(answer, authors, userNames);
      const allowedIds = new Set(authors.filter(item => item.kind === 'contact').map(item => item.id));
      const incomingMessages = parseIncomingMessages(answer, context, state, allowedIds);
      let saved;
      try { await store.updateSocial((social, current) => {
        const currentPost = social.posts.find(item => item.id === postId);
        if (!currentPost) throw new Error('这条动态已不存在，请返回动态列表。');
        const activeIds = new Set([...(current.contacts || []), ...(current.social?.npcs || [])].map(item => item.id));
        const read = Boolean(isReadingPost(postId)), createdAt = new Date().toISOString();
        const validReplies = replies.filter(reply => !reply.authorId || activeIds.has(reply.authorId)).map(reply => ({ ...reply, id: generateMessageId(), replyToId: userComment.id, createdAt, read }));
        saved = validReplies.length ? { ...currentPost, comments: [...(currentPost.comments || []), ...validReplies], commentsCount: Math.max(count(currentPost.commentsCount), (currentPost.comments || []).length) + validReplies.length } : currentPost;
        if (saved === currentPost) return social;
        return { ...social, posts: social.posts.map(item => item.id === postId ? saved : item) };
      }, { incomingMessages }); }
      catch (error) { throw new Error(`评论已发布，但回复未能保存。${error.message || '请检查酒馆连接。'}`); }
      return structuredClone(saved);
    },
  };
}
