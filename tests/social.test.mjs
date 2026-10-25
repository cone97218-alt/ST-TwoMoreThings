import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createContextReader } from '../src/context.js';
import { createSocialService, getSocialAuthor, readSocialPosts, readSocialFeed } from '../src/social.js';

async function setup(count = 5, bridge = null) {
  const h = createHarness({
    metadata: { foreign: { keep: true } },
    messages: [{ name: '林舟', mes: '午后正在街边散步。<!-- QQJ-end | date=2026年10月19日 | weekday=周一 | time=14:20 -->' }],
    settings: { qianqianjie: { apiUrl: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'm' } },
  });
  const store = createPhoneStore({ target: h.host.captureChat() });
  await store.upsertContacts(Array.from({ length: count }, (_, i) => ({ id: `friend-${i}`, name: `朋友${i}`, nickname: `昵称${i}`, personality: '随和',
    ...(bridge ? { source: { kind: 'qqj', entityId: `entity-${i}` } } : {}),
  })));
  const contextReader = createContextReader({ target: h.host.captureChat(), store, qqjBridgeProvider: () => bridge });
  const modelClient = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  const create = (options = {}) => createSocialService({ store, contextReader, modelClient, random: () => 0, ...options });
  h.completion = (_path, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    return { choices: [{ message: { content: JSON.stringify({
      npcs: input.authors.filter(author => author.kind === 'npc').map(author => ({ id: author.id, name: '花店店主', description: '街角花店的店主。' })),
      posts: input.authors.map(author => ({ authorId: author.id, text: `${author.name || '店主'}的午后。`, publishedAt: '2026-10-19 14:10',
        image: author.kind === 'npc' ? undefined : { description: '窗边的一杯茶。', path: 'https://example.invalid/model-image.png' },
        likes: 12, reposts: 2, commentsCount: 3, comments: [{ name: '路过的人', text: '下午好。' }],
      })),
    }) } }] };
  };
  return { h, store, create, service: create() };
}

test('feed chooses five friends, replaces the previous batch and its profile history, and preserves other metadata', async () => {
  const { h, store, service } = await setup(7);
  const before = h.metadataSaves;
  await service.refresh();
  const first = structuredClone(store.read().social.posts);
  assert.equal(first.length, 5);
  assert.equal(new Set(first.map(post => post.authorId)).size, 5);
  assert.ok(first.every(post => store.read().contacts.some(person => person.id === post.authorId)));
  assert.equal(h.modelRequests.length, 1);
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(JSON.parse(h.modelRequests[0].body.messages[1].content).authors.length, 5);
  assert.equal(first[0].publishedAt, '2026-10-19 14:10');
  assert.equal(first[0].batch.clock.time, '14:20', '生成卡口不随发布时间移动');
  assert.deepEqual([first[0].likes, first[0].reposts, first[0].commentsCount], [12, 2, 3]);
  assert.deepEqual(first[0].comments, [{ name: '路过的人', text: '下午好。' }]);
  assert.equal('translation' in first[0], false);
  assert.deepEqual(first[0].image, { description: '窗边的一杯茶。' }, 'text generation cannot supply a generated image path');
  await store.updateSocial(social => ({ ...social, posts: [...social.posts, { id: 'old-history', authorId: first[0].authorId, text: '过去的日常。' }],
    npcs: [{ id: 'old-npc', name: '旧路人' }], expandedAuthors: [first[0].authorId] }));
  await service.refresh();
  assert.equal(h.modelRequests.length, 2);
  assert.equal(store.read().social.posts.length, 5);
  assert.equal(store.read().social.posts.some(post => first.some(old => old.id === post.id) || post.id === 'old-history'), false);
  assert.deepEqual(store.read().social.npcs, []);
  assert.equal(store.read().social.expandedAuthors, undefined);
  assert.equal(store.read().social.feedIds.length, 5);
  assert.ok(store.read().social.feedIds.every(id => !first.some(post => post.id === id)));
  assert.deepEqual(h.context.chatMetadata.foreign, { keep: true });
  assert.equal(h.context.chat.length, 1);
  assert.equal(h.promptSlots.size, 0);
});

test('four friends are supplemented by one stable NPC without inserting it in contacts', async () => {
  const { h, store, service } = await setup(4);
  const before = h.metadataSaves;
  await service.refresh();
  const state = store.read(), npc = state.social.npcs[0];
  assert.equal(state.contacts.length, 4);
  assert.equal(state.social.npcs.length, 1);
  assert.ok(npc.id.startsWith('npc:'));
  assert.deepEqual({ name: npc.name, description: npc.description }, { name: '花店店主', description: '街角花店的店主。' });
  assert.equal(state.social.posts.length, 5);
  assert.equal(state.social.posts.filter(post => post.authorId === npc.id).length, 1);
  assert.equal(state.social.posts.find(post => post.authorId === npc.id).image, undefined);
  assert.equal(getSocialAuthor(state, npc.id).kind, 'npc');
  assert.match(npc.avatar, /^data:image\/svg\+xml;/, 'new NPC portraits are generated locally in the original feed save');
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(service.getAuthor(npc.id).avatar, npc.avatar);
  const saves = h.metadataSaves;
  await store.fillMissingAvatars();
  assert.equal(store.read().social.npcs[0].avatar, npc.avatar, 'opening retains the saved NPC portrait');
  assert.equal(h.metadataSaves, saves);
  assert.equal(service.getAuthor('friend-0').nickname, '昵称0');
  assert.equal(h.modelRequests.length, 1);
});

test('foreign post and comment translations survive generation, storage and read-only queries', async () => {
  const { h, store, service } = await setup(1);
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [{ authorId: 'friend-0',
    text: '今日はパン屋が早く開いた。', translation: '今天面包店开门很早。',
    comments: [{ name: '路人', text: 'Le pain sent bon.', translation: '面包闻起来真香。' }, { name: '邻居', text: '👍' }],
  }] }) } }] };
  await service.refresh();
  const post = service.readPosts({ authorId: 'friend-0' })[0];
  assert.equal(post.text, '今日はパン屋が早く開いた。');
  assert.equal(post.translation, '今天面包店开门很早。');
  assert.equal(post.comments[0].text, 'Le pain sent bon.');
  assert.equal(post.comments[0].translation, '面包闻起来真香。');
  assert.deepEqual(post.comments[1], { name: '邻居', text: '👍' });
  assert.deepEqual(store.read().social.posts[0], post);
  assert.equal(h.modelRequests.length, 1);
});

test('explicit author refresh appends posts without changing the home feed and can be requested again', async () => {
  const { h, store, service, create } = await setup();
  await service.refresh();
  const feedIds = [...store.read().social.feedIds];
  const authorId = store.read().social.posts[0].authorId;
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [
    { authorId, text: '回家的路上看见落叶。', publishedAt: '2026-08-01 18:10', likes: 1 },
    { authorId, text: '窗台上的花开了。', publishedAt: '2026-10-18 11:20', comments: [{ name: '朋友', text: '真好。' }] },
  ] }) } }] };
  const result = await service.generateAuthor(authorId);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(post => post.publishedAt), ['2026-10-19 14:10', '2026-10-18 11:20', '2026-08-01 18:10']);
  assert.equal(store.read().social.posts.length, 7);
  assert.deepEqual(store.read().social.feedIds, feedIds);
  const input = JSON.parse(h.modelRequests[1].body.messages[1].content);
  assert.deepEqual(input.authors.map(author => author.id), [authorId]);
  assert.equal(input.existingPosts.length, 1, 'author generation receives its saved posts to avoid repeating them');
  assert.equal(input.historyBefore, '2026-10-19 14:10');
  const before = h.metadataSaves;
  await create().generateAuthor(authorId);
  assert.equal(h.modelRequests.length, 3, 'only explicit author refreshes generate new posts');
  assert.equal(h.metadataSaves, before + 1);
  assert.equal(service.readPosts({ authorId }).length, 5);
  assert.equal(JSON.parse(h.modelRequests[2].body.messages[1].content).historyBefore, '2026-08-01 18:10');
});

test('sorting uses publication time for new and legacy records, and preserves ties without changing saved posts', () => {
  const posts = [
    { id: 'latest', authorId: 'a', publishedAt: '2026-10-19 14:10', createdAt: '2020-01-01' },
    { id: 'old', authorId: 'a', publishedAt: '2026-07-08 12:00', createdAt: '2030-01-01' },
    { id: 'middle', authorId: 'a', storyDate: '2026年10月18日', timeLabel: '20:00' },
    { id: 'tie-1', authorId: 'a', publishedAt: '2026-10-19 14:10' },
    { id: 'tie-2', authorId: 'a', publishedAt: '2026-10-19 14:10' },
  ];
  const state = { social: { posts } }, before = structuredClone(state);
  assert.deepEqual(readSocialPosts(state).map(post => post.id), ['latest', 'tie-1', 'tie-2', 'middle', 'old']);
  assert.deepEqual(state, before);
});

test('home keeps the selected authors and resolves each latest saved publication after history is added', () => {
  const state = { social: { posts: [
    { id: 'a-first', authorId: 'a', publishedAt: '2026-10-18 12:00' },
    { id: 'b-new', authorId: 'b', publishedAt: '2026-10-19 12:00' },
    { id: 'a-new', authorId: 'a', publishedAt: '2026-10-19 13:00' },
    { id: 'a-old', authorId: 'a', publishedAt: '2026-09-01 12:00' },
    { id: 'unselected', authorId: 'c', publishedAt: '2026-10-19 14:00' },
  ], feedIds: ['a-first', 'b-new'] } };
  assert.deepEqual(readSocialFeed(state).map(post => post.id), ['a-new', 'b-new']);
});

test('feed input includes latest posts for newly selected friends outside the previous home selection', async () => {
  const { h, service, store } = await setup(7);
  await store.updateSocial(social => ({ ...social, posts: [
    { id: 'previous-home', authorId: 'friend-0', text: '上次主页的作者。', publishedAt: '2026-10-18 10:00' },
    { id: 'other-history', authorId: 'friend-1', text: '新入选作者也有历史。', publishedAt: '2026-10-18 11:00' },
  ], feedIds: ['previous-home'] }));
  await service.refresh();
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(input.existingPosts.some(post => post.authorId === 'friend-1'), true);
  assert.equal(input.existingPosts.some(post => post.authorId === 'friend-0'), false);
});

test('history without known publication times supplies the story clock as its boundary', async () => {
  const { h, service } = await setup(1);
  await service.generateAuthor('friend-0');
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(input.historyBefore, '2026年10月19日 14:20');
});

test('history boundary uses the oldest comparable date instead of an undated clock time', async () => {
  const { h, service, store } = await setup(1);
  await store.updateSocial(social => ({ ...social, posts: [
    { id: 'dated', authorId: 'friend-0', text: '已知日期。', publishedAt: '2026-08-01 12:00' },
    { id: 'undated', authorId: 'friend-0', text: '只有几点。', publishedAt: '09:30' },
  ] }));
  await service.generateAuthor('friend-0');
  assert.equal(JSON.parse(h.modelRequests[0].body.messages[1].content).historyBefore, '2026-08-01 12:00');
});

test('an unambiguous single post can use author_id and a publication field alias', async () => {
  const { h, service } = await setup(1);
  h.completion = { choices: [{ message: { content: JSON.stringify({ author_id: 'friend-0', caption: '只有一条也保留。', published_at: '2026-08-01 12:00' }) } }] };
  const posts = await service.generateAuthor('friend-0');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].authorId, 'friend-0');
  assert.equal(posts[0].text, '只有一条也保留。');
  assert.equal(posts[0].publishedAt, '2026-08-01 12:00');
});

test('author generation keeps clear format variants and missing optional times instead of losing usable posts', async () => {
  const { h, service, store } = await setup(1);
  await service.refresh();
  h.completion = { choices: [{ message: { content: '```json\n' + JSON.stringify([
    { caption: '一段有效旧日常。', date: '2026年9月8日', time: '12:00' },
    { content: '没有时间也保留正文。', author_id: 'friend-0' },
    { authorId: 123, text: '给了无法确认的作者编号，不能当成省略。' },
    { authorId: 'wrong-person', text: '不能猜归属。', publishedAt: '2026-09-01 09:00' },
  ]) + '\n```' } }] };
  const saved = await service.generateAuthor('friend-0');
  assert.equal(saved.length, 3);
  assert.equal(saved[0].text, '朋友0的午后。');
  assert.equal(saved[1].text, '一段有效旧日常。');
  assert.equal(saved[2].text, '没有时间也保留正文。');
  assert.equal(saved[2].publishedAt, '');
  assert.equal(store.read().social.posts.some(post => post.authorId === 'wrong-person'), false);
});

test('usable posts survive unrelated invalid authors and optional fields while identities remain exact', async () => {
  const { h, store, service } = await setup(1);
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [
    { authorId: 'invented-author', text: '不能归属。' },
    { authorId: 'friend-0', content: '有效正文。', likes: -3, reposts: '4', commentsCount: 'bad', comments: [
      { name: '旁观者', text: '不错。' }, { name: '假身份', authorId: 'invented-author', text: '不应存入。' },
    ] },
  ] }) } }] };
  await service.refresh();
  const posts = store.read().social.posts;
  assert.equal(posts.length, 1);
  assert.equal(posts[0].authorId, 'friend-0');
  assert.equal(posts[0].text, '有效正文。');
  assert.deepEqual([posts[0].likes, posts[0].reposts, posts[0].commentsCount], [0, 4, 1]);
  assert.deepEqual(posts[0].comments, [{ name: '旁观者', text: '不错。' }]);
  assert.equal(store.read().social.npcs.length, 0, 'unnamed NPC slots do not become saved people');
});

test('empty or unowned author replies preserve saved posts', async () => {
  const { h, store, service } = await setup();
  await service.refresh();
  const before = structuredClone(store.read().social);
  h.completion = { choices: [{ message: { content: '{"posts":[{"authorId":"other","text":"不能归属"}]}' } }] };
  await assert.rejects(service.generateAuthor('friend-0'), /动态/);
  assert.deepEqual(store.read().social, before);
  const requests = h.modelRequests.length;
  await assert.rejects(service.generateAuthor('missing'), /作者|人物/);
  assert.equal(h.modelRequests.length, requests);
});

test('feed safely resolves NPC posts when model omits npcs array', async () => {
  const { h, store, service } = await setup(0); // 0 contacts -> 5 NPC slots
  h.completion = (_path, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const npc1 = input.authors[0].id;
    const npc2 = input.authors[1].id;
    // Omit npcs array completely, returning only posts for these npc authorIds
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            posts: [
              {
                authorId: npc1,
                text: '阴雨一整天，窗外的水汽把玻璃糊得看不清路。',
                publishedAt: '',
                image: { description: 'Rain-blurred windows' }
              },
              {
                authorId: npc2,
                text: '巷子里的青苔被雨泡得发亮。',
                publishedAt: ''
              }
            ]
          })
        }
      }]
    };
  };

  const saved = await service.refresh();
  assert.equal(saved.length, 2);
  assert.equal(store.read().social.posts.length, 2);
  assert.equal(store.read().social.npcs.length, 2);
  assert.ok(store.read().social.npcs.every(npc => npc.name && npc.avatar));
});

test('read-only post queries filter author and batch without generation, writes, or exposing mutable save objects', async () => {
  const { h, store, service } = await setup();
  await service.refresh();
  const authorId = store.read().social.posts[0].authorId;
  const batchKey = store.read().social.posts[0].batch.key;
  const before = { requests: h.modelRequests.length, saves: h.metadataSaves };
  const result = service.readPosts({ authorId, batchKey, limit: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].authorId, authorId);
  assert.equal(readSocialPosts(store.read(), { batchKey: 'other' }).length, 0);
  result[0].text = '外部修改';
  result[0].comments[0].text = '外部评论修改';
  assert.notEqual(store.read().social.posts.find(post => post.authorId === authorId).text, '外部修改');
  assert.equal(store.read().social.posts.find(post => post.authorId === authorId).comments[0].text, '下午好。');
  assert.deepEqual({ requests: h.modelRequests.length, saves: h.metadataSaves }, before);
});

test('a genuinely deleted friend is not restored as an author or named comment when a feed reply is saved', async () => {
  const { h, store, service } = await setup();
  let deletion;
  h.completion = () => {
    deletion = store.deleteContact('friend-1');
    return { choices: [{ message: { content: JSON.stringify({ posts: [
      { authorId: 'friend-0', text: '保留的动态', comments: [
        { authorId: 'friend-1', name: '朋友1', text: '已删除者的评论' },
        { name: '路过的人', text: '保留的评论' },
      ] },
      { authorId: 'friend-1', text: '已删除者的动态' },
    ] }) } }] };
  };
  await service.refresh();
  await deletion;
  const posts = store.read().social.posts;
  assert.deepEqual(posts.map(post => post.authorId), ['friend-0']);
  assert.deepEqual(posts[0].comments, [{ name: '路过的人', text: '保留的评论' }]);
});

test('social context scopes selected friends private SMS for proactive replies and excludes unrelated memory', async () => {
  const calls = [];
  const bridge = { getStatus: () => ({ status: 'ready' }), readContext: async request => {
    calls.push(request);
    return { status: 'ready', actors: [
      ...request.entityIds.map(entityId => ({ entityId, stateText: `${entityId}的状态`, memoryText: `${entityId}的记忆` })),
      { entityId: 'unrelated', memoryText: '不相关人物的秘密' },
    ] };
  } };
  const { h, store, service } = await setup(4, bridge);
  await store.appendMessage('friend-0', { id: 'private-sms', role: 'user', text: '不应进入动态的私信' });
  await service.refresh();
  const input = JSON.parse(h.modelRequests[0].body.messages[1].content);
  assert.equal(calls.length, 1);
  assert.deepEqual([...calls[0].entityIds].sort(), ['entity-0', 'entity-1', 'entity-2', 'entity-3']);
  assert.equal(input.authors.find(author => author.id === 'friend-0').related, 'entity-0的状态\nentity-0的记忆');
  assert.equal(input.authors.find(author => author.kind === 'npc').related, '');
  assert.equal(JSON.stringify(input).includes('不相关人物的秘密'), false);
  assert.equal(input.authors.find(author => author.id === 'friend-0').privateHistory[0].text, '不应进入动态的私信');
  assert.equal(input.authors.filter(author => author.id !== 'friend-0').some(author => JSON.stringify(author).includes('不应进入动态的私信')), false);
});

test('comment uses one model call after publishing the user comment, then saves replies and unread SMS together', async () => {
  const { h, store, service } = await setup(2);
  await service.refresh();
  const post = store.read().social.posts[0];
  await store.updateSocial(social => ({ ...social, posts: social.posts.map(item => item.id === post.id
    ? { ...item, comments: [...item.comments, { authorId: 'friend-0', name: '昵称0', text: '我之前来过。' }] } : item) }));
  h.completion = { choices: [{ message: { content: JSON.stringify({
    comments: [
      { authorId: post.authorId, text: '看到啦。' },
      { authorId: 'friend-0', text: '私も行きたい。', translation: '我也想去。' },
      { authorId: 'invented', text: '不应保存。' },
    ],
    proactiveMessages: [{ contactId: post.authorId, messages: [{ text: '你刚才的留言我看到了。' }] }],
  }) } }] };
  const before = h.metadataSaves;
  const result = await service.comment(post.id, '我也喜欢这里。');
  assert.equal(h.modelRequests.length, 2);
  assert.equal(h.metadataSaves, before + 2);
  const saved = store.read().social.posts.find(item => item.id === post.id);
  assert.equal(saved.commentsCount, 6, 'virtual count 3 plus user comment and two accepted replies');
  assert.deepEqual(saved.comments.slice(-3).map(({ id, createdAt, replyToId, read, ...comment }) => comment), [
    { role: 'user', name: '我', text: '我也喜欢这里。' },
    { name: '昵称1', text: '看到啦。', authorId: 'friend-1' },
    { name: '昵称0', text: '私も行きたい。', translation: '我也想去。', authorId: 'friend-0' },
  ]);
  assert.equal(store.read().conversations[post.authorId].length, 1);
  assert.equal(store.read().conversations[post.authorId][0].read, false);
  assert.equal('translation' in store.read().conversations[post.authorId][0], false);
  assert.equal(result.id, post.id);
  const userComment = saved.comments.at(-3);
  assert.ok(userComment.id);
  assert.ok(saved.comments.slice(-2).every(comment => comment.replyToId === userComment.id && comment.read === false));
});

test('comment is persisted and reported before the reply finishes, while later likes and drafts remain independent', async () => {
  const { store, service, create } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  let finish, start, posted;
  const waiting = new Promise(resolve => { finish = resolve; });
  const started = new Promise(resolve => { start = resolve; });
  const slow = create({ modelClient: { complete: async () => { start(); return waiting; } } });
  const pending = slow.comment(post.id, '先发布的留言', { onPosted: comment => { posted = comment; } });
  try {
    await started;
    const saved = store.read().social.posts[0];
    assert.equal(saved.comments.at(-1).text, '先发布的留言');
    assert.equal(posted.id, saved.comments.at(-1).id);
    await service.toggleLike(post.id);
  } finally { finish(JSON.stringify({ comments: [{ authorId: post.authorId, text: '稍后到达的回复' }] })); await pending; }
  const saved = store.read().social.posts[0];
  assert.equal(saved.userLiked, true);
  assert.equal(saved.comments.filter(comment => comment.text === '先发布的留言').length, 1);
  assert.equal(saved.comments.at(-1).replyToId, posted.id);
});

test('model failure retains the published comment, while an initial save failure sends no model request', async () => {
  const { h, store, service } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  h.completion = { choices: [{ message: { content: '这不是JSON' } }] };
  await assert.rejects(service.comment(post.id, '已经发布'), /评论已发布/);
  assert.equal(store.read().social.posts[0].comments.at(-1).text, '已经发布');
  const saved = structuredClone(store.read().social.posts[0]), requests = h.modelRequests.length;
  h.saveFailure = new Error('save failed');
  await assert.rejects(service.comment(post.id, '保存失败草稿'));
  assert.deepEqual(store.read().social.posts[0], saved);
  assert.equal(h.modelRequests.length, requests);
});

test('reply save failure retains the published comment and does not create unread replies or SMS', async () => {
  const { h, store, service } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  h.completion = () => {
    h.saveFailure = new Error('save failed');
    return { choices: [{ message: { content: JSON.stringify({ comments: [{ authorId: post.authorId, text: '回应' }], proactiveMessages: [{ contactId: post.authorId, messages: [{ text: '私信' }] }] }) } }] };
  };
  await assert.rejects(service.comment(post.id, '我已发送'), /评论已发布.*保存/);
  assert.equal(store.read().social.posts[0].comments.at(-1).text, '我已发送');
  assert.equal(store.read().conversations[post.authorId], undefined);
  assert.equal(store.read().social.posts[0].comments.some(comment => comment.read === false), false);
});

test('only actual new comment replies create unread notifications and reading keeps their content', async () => {
  const { unreadSocialReplies } = await import('../src/notifications.js');
  const { h, store, service, create } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  assert.deepEqual(unreadSocialReplies(store.read()), [], 'existing generated comments are not new reply notifications');
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [{ authorId: post.authorId, text: '看到你了。' }, { name: '路人甲', text: '欢迎！' }] }) } }] };
  await service.comment(post.id, '我来啦');
  const notices = unreadSocialReplies(store.read());
  assert.equal(notices.length, 1);
  assert.equal(notices[0].id, post.id);
  assert.equal(notices[0].count, 2);
  assert.equal(notices[0].preview, '欢迎！');
  const before = store.read().social.posts[0].comments.map(comment => comment.text);
  await service.markRepliesRead(post.id);
  assert.deepEqual(unreadSocialReplies(store.read()), []);
  assert.deepEqual(store.read().social.posts[0].comments.map(comment => comment.text), before);
  await create({ isReadingPost: id => id === post.id }).comment(post.id, '我就在这里看着');
  assert.deepEqual(unreadSocialReplies(store.read()), [], 'a reply already visible in its post is saved as read');
  h.completion = { choices: [{ message: { content: '{"comments":[]}' } }] };
  await service.comment(post.id, '也可以没有回应');
  assert.deepEqual(unreadSocialReplies(store.read()), []);
});

test('historical author generation ignores optional proactive messages', async () => {
  const { h, store, service } = await setup(1);
  await service.refresh();
  const authorId = store.read().social.posts[0].authorId;
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [{ authorId, text: '旧日常。' }], proactiveMessages: [{ contactId: authorId, messages: [{ text: '不应发出。' }] }] }) } }] };
  await service.generateAuthor(authorId);
  assert.equal(store.read().conversations[authorId], undefined);
});

test('feed accepts proactive text only once and rejects a contact not present in returned posts', async () => {
  const { h, store, service } = await setup(2);
  h.completion = { choices: [{ message: { content: JSON.stringify({ posts: [{ authorId: 'friend-0', text: '新动态。' }], proactiveMessages: [
    { contactId: 'friend-1', messages: [{ text: '不应因为未出现在动态中而发送。' }] },
    { contactId: 'friend-0', messages: [{ text: 'あとで写真を送るね。', translation: '晚点把照片发给你。' }] },
  ] }) } }] };
  await service.refresh();
  assert.equal(h.modelRequests.length, 1);
  assert.equal(store.read().conversations['friend-0'].length, 1);
  assert.equal(store.read().conversations['friend-0'][0].text, 'あとで写真を送るね。');
  assert.equal(store.read().conversations['friend-0'][0].translation, '晚点把照片发给你。');
  assert.equal(store.read().conversations['friend-1'], undefined);
  h.saveFailure = new Error('save failed');
  await assert.rejects(service.refresh());
  assert.equal(store.read().social.posts[0].text, '新动态。');
  assert.equal(store.read().conversations['friend-0'].length, 1, 'failed replacement keeps the existing post and SMS together');
});

test('comment supplies saved publication and photo context and can answer an anonymous commenter by exact name', async () => {
  const { h, store, service } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  await store.updateSocial(social => ({ ...social, posts: social.posts.map(item => item.id === post.id ? { ...item, publishedAt: '2026-10-01 09:00', image: { description: '窗边的蓝色花瓶。' }, comments: [{ name: '路过的阿青', text: '好看。' }], commentsCount: 1 } : item) }));
  h.completion = (_path, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    assert.equal(input.post.publishedAt, '2026-10-01 09:00');
    assert.equal(input.post.image.description, '窗边的蓝色花瓶。');
    return { choices: [{ message: { content: JSON.stringify({ comments: [{ name: '路过的阿青', text: '确实很有气氛。' }] }) } }] };
  };
  await service.comment(post.id, '我也觉得。');
  assert.equal(store.read().social.posts.find(item => item.id === post.id).comments.at(-1).name, '路过的阿青');
});

test('comment with an explicit empty comments array still saves the user comment', async () => {
  const { h, store, service } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [] }) } }] };
  await service.comment(post.id, '今天也来看看。');
  assert.equal(store.read().social.posts.find(item => item.id === post.id).comments.at(-1).text, '今天也来看看。');
});

test('an identified existing commenter can send a private SMS without adding a public reply', async () => {
  const { h, store, service } = await setup(2);
  await service.refresh();
  const post = store.read().social.posts.find(item => item.authorId === 'friend-1');
  await store.updateSocial(social => ({ ...social, posts: social.posts.map(item => item.id === post.id
    ? { ...item, comments: [{ authorId: 'friend-0', name: '昵称0', text: '那家书店不错。' }] } : item) }));
  await store.appendMessage('friend-0', { id: 'existing', role: 'user', text: '保留原短信。' });
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [],
    proactiveMessages: [{ contactId: 'friend-0', messages: [{ text: '我私下把地址发给你。' }] }],
  }) } }] };
  const before = h.metadataSaves, calls = h.modelRequests.length;
  await service.comment(post.id, '在哪儿？');
  assert.equal(h.metadataSaves, before + 2);
  assert.equal(h.modelRequests.length, calls + 1);
  assert.deepEqual(store.read().conversations['friend-0'].map(item => item.text), ['保留原短信。', '我私下把地址发给你。']);
  assert.equal(store.read().conversations['friend-0'].at(-1).read, false);
  assert.equal(store.read().social.posts.find(item => item.id === post.id).comments.at(-1).text, '在哪儿？');
});

test('a later comment cannot save a reply under the user name while keeping a valid named reply', async () => {
  const { h, store, service } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [{ name: '我', text: '冒充用户。' }, { name: '新路人', text: '路过回应。' }] }) } }] };
  await service.comment(post.id, '第一条留言。');
  h.completion = { choices: [{ message: { content: JSON.stringify({ comments: [{ name: '我', text: '再次冒充。' }, { authorId: post.authorId, text: '角色回应。' }] }) } }] };
  await service.comment(post.id, '第二条留言。');
  const comments = store.read().social.posts.find(item => item.id === post.id).comments;
  assert.equal(comments.filter(item => item.role === 'user').length, 2);
  assert.equal(comments.some(item => item.text === '再次冒充。'), false);
  assert.equal(comments.at(-1).authorId, post.authorId);
});

test('toggleLike saves only virtual user state and derives the displayed count', async () => {
  const { h, store, service } = await setup(1);
  await service.refresh();
  const post = store.read().social.posts[0];
  const baseLikes = post.likes;
  const before = h.metadataSaves;
  const liked = await service.toggleLike(post.id);
  assert.equal(liked.userLiked, true);
  assert.equal(liked.likes, baseLikes + 1);
  assert.equal(store.read().social.posts[0].likes, baseLikes);
  assert.equal(store.read().social.posts[0].userLiked, true);
  assert.equal(h.modelRequests.length, 1, 'toggling a like does not call the model');
  assert.equal(h.metadataSaves, before + 1);

  const unliked = await service.toggleLike(post.id);
  assert.equal(unliked.userLiked, false);
  assert.equal(unliked.likes, baseLikes);
  assert.equal(store.read().social.posts[0].likes, baseLikes);
  assert.equal(store.read().social.posts[0].userLiked, false);
  assert.equal(h.modelRequests.length, 1, 'cancelling a like does not call the model');
  assert.equal(h.metadataSaves, before + 2);
});

test('toggleLike reports a missing post without saving or calling the model', async () => {
  const { h, service } = await setup(1);
  const before = h.metadataSaves;
  await assert.rejects(service.toggleLike('missing-post'), /动态已不存在/);
  assert.equal(h.metadataSaves, before);
  assert.equal(h.modelRequests.length, 0);
});
