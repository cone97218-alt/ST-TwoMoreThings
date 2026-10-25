import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createContextReader } from '../src/context.js';
import { createApiSettings, createModelClient } from '../src/api.js';
import { createForumService } from '../src/forum.js';

for (const hostKind of ['native', 'luker']) test(`${hostKind}: one forum refresh saves separate translations and reads them without another request`, async () => {
  const main = [{ is_user: false, mes: '广场开放周末集市。<!-- QQJ-end | date=2026-10-18 | time=18:00 -->' }];
  const translated = {
    title: 'Marché du week-end', titleTranslation: '周末集市', author: 'Une passante',
    content: 'Le marché ouvre samedi.', contentTranslation: '集市周六开放。', category: '城市生活',
    comments: [{ author: 'Voisine', text: 'À bientôt.', translation: '到时见。' }],
  };
  const chinese = { title: '街角书店', author: '读者', content: '书店周末开放阅读区。', comments: [{ author: '路人', text: '好耶！' }, { author: '邻居', text: '👍' }] };
  const h = createHarness({ hostKind, messages: main, metadata: { foreign: { keep: true } },
    settings: { qianqianjie: { apiUrl: 'https://example.invalid', apiKey: 'mock-key', apiModel: 'mock-model' } },
    completion: { choices: [{ message: { content: JSON.stringify({ posts: [translated, chinese] }) } }] },
  });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.saveUserProfile({ name: '私有用户姓名', nickname: '私有用户网名' });
  await store.upsertContacts([{ id: 'lin', name: '林舟' }]);
  await store.appendMessage('lin', { id: 'private', role: 'user', text: '不应发给论坛的私聊' });
  const before = structuredClone(store.read()), mainBefore = structuredClone(main), saves = h.metadataSaves;
  const service = createForumService({ store,
    contextReader: createContextReader({ target, store, qqjBridgeProvider: () => { throw new Error('论坛不应召回人物记忆'); } }),
    modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }),
  });
  assert.equal(h.modelRequests.length, 0);
  await service.refresh();
  assert.equal(h.modelRequests.length, 1);
  const sent = JSON.parse(h.modelRequests[0].body.messages.find(message => message.role === 'user').content);
  assert.deepEqual(Object.keys(sent).sort(), ['clock', 'setting']);
  assert.equal(sent.clock.time, '18:00');
  assert.ok(h.modelRequests[0].body.messages.find(message => message.role === 'system').content.includes('广场开放周末集市。'));
  for (const privateText of ['私有用户姓名', '私有用户网名', '不应发给论坛的私聊']) assert.equal(JSON.stringify(sent).includes(privateText), false);
  const posts = store.read().forum.posts;
  assert.equal(posts.length, 2);
  const { id, ...saved } = posts[0];
  assert.ok(id);
  assert.deepEqual(saved, translated);
  assert.equal('titleTranslation' in posts[1], false);
  assert.equal('contentTranslation' in posts[1], false);
  assert.equal('translation' in posts[1].comments[0], false);
  assert.equal('translation' in posts[1].comments[1], false);
  assert.deepEqual(createPhoneStore({ target }).read().forum.posts, posts, 'reopening uses the persisted bilingual fields');
  assert.deepEqual(service.getPost(id), posts[0]);
  assert.equal(h.modelRequests.length, 1, 'reading original and translation needs no translation request');
  assert.equal(h.metadataSaves, saves + 1);
  assert.deepEqual(store.read(), { ...before, forum: { posts } });
  assert.deepEqual(h.persistedMetadata, { foreign: { keep: true }, pocketPhone: store.read() });
  assert.deepEqual(main, mainBefore);
  assert.equal(h.promptSlots.size, 0);
});

test('refresh replaces the batch; reading posts is free and preserves main messages', async () => {
  const main = [{ mes: '在街上散步。', is_user: false }];
  const h = createHarness({ messages: main, settings: { qianqianjie: { apiUrl: 'https://example.invalid', apiKey: 'key', apiModel: 'm' } }, completion: { choices: [{ message: { content: '{"posts":[{"title":"晚风","author":"路人甲","content":"今晚很凉快","comments":[{"author":"路人乙","text":"适合散步"}]},{"title":"小店","author":"路人丙","content":"新开了一家面馆"}]}' } }] } });
  const target = h.host.captureChat(), store = createPhoneStore({ target });
  await store.replaceForum([{ id: 'old', title: '旧帖' }]);
  const service = createForumService({ store, contextReader: createContextReader({ target, store }), modelClient: createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) }) });
  assert.equal(h.modelRequests.length, 0);
  await service.refresh();
  assert.equal(store.read().forum.posts.length, 2);
  assert.equal(service.getPost('old'), undefined);
  assert.equal(service.getPost(store.read().forum.posts[0].id).comments[0].text, '适合散步');
  assert.equal(h.modelRequests.length, 1);
  assert.deepEqual(main, [{ mes: '在街上散步。', is_user: false }]);
});
