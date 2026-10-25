import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginUpdates, resolvePluginInstallation } from '../src/plugin-updates.js';
import { createEmbeddedUpdates } from '../src/embedded-updates.js';
import { readRelease, RELEASE_URL, releaseUrlForCore } from '../src/release.js';

const oldSha = '56a6614198bd177f967a9406f7b6f425f9a810af', newSha = 'a'.repeat(40);
const released = { version: '0.3.7', sha: newSha, update_notice: 'docs/updates-0.3.7.md' };
for (const type of ['local', 'global']) test(`${type}: plugin updates use only the actual installation and host headers`, async () => {
  const requests = [], moduleUrl = 'https://tavern.invalid/scripts/extensions/third-party/My%20Phone/src/runtime.js';
  const updates = createPluginUpdates({ moduleUrl, extensionTypes: async () => ({ 'third-party/My Phone': type }), headers: () => ({ 'X-CSRF-Token': 'fixture', 'Content-Type': 'application/json' }), fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return Response.json(url.endsWith('/version') ? { currentBranchName: 'main', currentCommitHash: oldSha, remoteUrl: 'https://github.com/owner/repo.git', isUpToDate: false } : { isUpToDate: true, shortCommitHash: newSha.slice(0, 7) });
  } });
  await updates.ensureChecked(); await updates.ensureChecked();
  assert.equal(updates.getState().status, 'available');
  await updates.update();
  assert.equal(updates.getState().status, 'stable');
  assert.deepEqual(requests.map(item => item.url), ['/api/extensions/version', '/api/extensions/update']);
  for (const { init } of requests) {
    assert.deepEqual(JSON.parse(init.body), { extensionName: 'My Phone', global: type === 'global' });
    assert.equal(init.headers['X-CSRF-Token'], 'fixture');
  }
  assert.throws(() => resolvePluginInstallation({ moduleUrl: 'https://cdn.jsdelivr.net/gh/a/b@main/embed.js', extensionTypes: {} }), /安装位置/);
});

test('unavailable notices do not prevent an explicit plugin update, and failed updates preserve available state', async () => {
  let failUpdate = true;
  const updates = createPluginUpdates({ moduleUrl: 'https://tavern.invalid/scripts/extensions/third-party/Phone/index.js', extensionTypes: { 'third-party/Phone': 'local' }, fetchImpl: async url => {
    if (url.endsWith('/version')) return Response.json({ currentBranchName: 'main', currentCommitHash: oldSha, remoteUrl: 'https://github.com/owner/repo.git', isUpToDate: false });
    if (url.endsWith('/update')) return Response.json({ isUpToDate: true, shortCommitHash: 'aaaaaaa' }, { status: failUpdate ? 409 : 200 });
    return new Response(null, { status: 404 });
  } });
  await updates.check();
  assert.equal((await updates.readNotice('available')).ok, false);
  await assert.rejects(updates.update(), /本地修改或版本冲突/);
  assert.equal(updates.getState().status, 'available');
  failUpdate = false; await updates.update();
  assert.equal(updates.getState().status, 'stable');
});

test('plugin check failure remains a readable update error without repeating the initial check', async () => {
  let requests = 0;
  const updates = createPluginUpdates({ moduleUrl: 'https://tavern.invalid/scripts/extensions/third-party/Phone/index.js', extensionTypes: { 'third-party/Phone': 'global' }, fetchImpl: async () => { requests++; return new Response(null, { status: 403 }); } });
  await updates.ensureChecked(); await updates.ensureChecked();
  assert.equal(requests, 1);
  assert.equal(updates.getState().status, 'error');
  assert.match(updates.getState().error, /管理员账号.*扩展页更新/);
});

test('embedded uses the already fetched release, public requests and one immutable core without extension pull', async () => {
  const requests = [], replacements = [];
  const updates = createEmbeddedUpdates({ coreUrl: `https://cdn.jsdelivr.net/gh/cone97218-alt/ST-TwoMoreThings@${oldSha}/embed.js`, version: '0.3.6', release: { version: '0.3.6', sha: oldSha }, fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return Response.json(released);
  }, replaceCore: async (...args) => replacements.push(args) });
  await updates.ensureChecked();
  assert.equal(requests.length, 0);
  await updates.check();
  assert.equal(updates.getState().status, 'available');
  await updates.update();
  assert.equal(updates.getState().status, 'stable');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, RELEASE_URL);
  assert.equal(requests[0].init.credentials, 'omit');
  assert.equal(requests[0].init.headers, undefined);
  assert.deepEqual(replacements, [[`https://cdn.jsdelivr.net/gh/cone97218-alt/ST-TwoMoreThings@${newSha}/embed.js`, released]]);
});

test('embedded import failure keeps the update available and does not issue another request', async () => {
  let requests = 0;
  const updates = createEmbeddedUpdates({ version: '0.3.6', fetchImpl: async () => { requests++; return Response.json(released); }, replaceCore: async () => { throw new Error('模拟核心加载失败'); } });
  await updates.check();
  await assert.rejects(updates.update(), /核心加载失败/);
  assert.equal(updates.getState().status, 'available');
  assert.equal(requests, 1);
});

test('a failed bootstrap check is reused until the user checks again', async () => {
  let requests = 0;
  const updates = createEmbeddedUpdates({ version: '0.3.6', updateError: '未能检查手机更新，请稍后手动检查。', fetchImpl: async () => { requests++; return Response.json(released); } });
  await updates.ensureChecked(); assert.equal(requests, 0); assert.equal(updates.getState().status, 'error');
  await updates.check(); assert.equal(requests, 1); assert.equal(updates.getState().status, 'available');
});

test('release reader rejects incomplete commits and aborts its single request at the configured deadline', async () => {
  await assert.rejects(readRelease({ fetchImpl: async () => Response.json({ version: '0.3.7', sha: 'short' }) }), /发布版本/);
  let requests = 0;
  await assert.rejects(readRelease({ timeoutMs: 5, fetchImpl: async (_url, { signal }) => {
    requests++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } }), /检查更新超时.*稍后再试/);
  assert.equal(requests, 1);
});

test('same or older releases stay stable even when a pointer commit differs; forks keep their source', async () => {
  const url = `https://fastly.jsdelivr.net/gh/another-owner/phone@${oldSha}/embed.js`, calls = [];
  assert.equal(releaseUrlForCore(url), 'https://raw.githubusercontent.com/another-owner/phone/main/release.json');
  const updates = createEmbeddedUpdates({ coreUrl: url, version: '0.3.7', fetchImpl: async () => Response.json(released) });
  await updates.check(); assert.equal(updates.getState().status, 'stable');
  const older = createEmbeddedUpdates({ version: '0.3.8', fetchImpl: async () => Response.json(released) });
  await older.check(); assert.equal(older.getState().status, 'stable');
  const current = createEmbeddedUpdates({ coreUrl: url, version: '0.3.6', fetchImpl: async (path, init) => {
    calls.push(path);
    return path.endsWith('release.json') ? Response.json(released) : new Response('新版公告');
  }, replaceCore: async () => {} });
  await current.check(); await current.update();
  assert.deepEqual(await current.readNotice('installed'), { ok: true, markdown: '新版公告' });
  assert.deepEqual(calls, ['https://raw.githubusercontent.com/another-owner/phone/main/release.json', `https://fastly.jsdelivr.net/gh/another-owner/phone@${newSha}/docs/updates-0.3.7.md`]);
});
