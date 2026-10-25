import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openApp } from './navigation.mjs';

const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
  for (const [kind, mode] of [['native', 'standalone'], ['luker', 'embedded']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(6000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('**/scripts/extensions.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const extensionTypes = {};' }));
    await page.route('**/scripts/world-info.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const selected_world_info = [], world_info = {}; export async function loadWorldInfo() { return {entries:{}}; }' }));
    await page.route('**/api/backends/chat-completions/generate', async route => {
      const body = route.request().postDataJSON(), input = JSON.parse(body.messages[1].content);
      requests.push({ body, input });
      const result = input.task === 'feed' || input.task === 'author' ? {
        npcs: input.authors.filter(person => person.kind === 'npc').map(person => ({ id: person.id, name: '街边店主', description: '喜欢记录日常。' })),
        posts: input.authors.map(person => ({ authorId: person.id, text: '早晨的书店很安静。', publishedAt: '2031/4/8 09:20', comments: [] })),
      } : input.task === 'comment' ? { comments: [] }
        : input.group ? { anchor: { memberIds: input.group.members.map(person => person.id), speakerIds: ['lin'] }, messages: [{ speakerId: 'lin', text: '在书店见。' }] }
          : input.setting !== undefined ? { posts: [{ title: '街边新店', author: '路人', content: '街边开了一家书店。', comments: [] }] }
            : { messages: [{ text: '一会儿书店见。' }] };
      await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(result) } }] } });
    });
    await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${kind}&entry=extension&group=1`);
    await page.getByRole('button', { name: '打开两三事', exact: true }).waitFor();
    await page.evaluate(async mode => {
      const h = previewHarness;
      for (const person of h.metadata.pocketPhone.contacts) person.source = { kind: 'qqj', entityId: person.id };
      h.qqjStatus = 'ready'; h.memoryReads = { qqj: 0, bbs: 0 };
      globalThis.qqj_v3_public_bridge_v1 = {
        getStatus: () => ({ status: h.qqjStatus }),
        async readContext({ entityIds }) { h.memoryReads.qqj++; return { status: 'ready', actors: entityIds.map(entityId => ({ entityId, memoryText: `${entityId}的独立记忆` })) }; },
      };
      globalThis.STBaiBaiBook = { apiVersion: 1, getInjectedHistory() { h.memoryReads.bbs++; return { nodes: [{ text: '已选剧情摘要', timeStart: '2031/4/7 18:00', timeEnd: '2031/4/7 19:00' }] }; }, getHistory() { throw new Error('不能读全档'); } };
      h.settings.baibai_book = { enabled: false };
      h.mainMessages[0].mes = '<bbs_start>2031/4/8 09:10</bbs_start>街上很安静。<BBS_END source="story"> 2031/4/8 09:30 </BBS_END>';
      if (mode === 'embedded') {
        h.settings.pocketPhone = { disabledCards: { 'chat:preview': true } };
        const { mountEmbedded } = await import('/embed.js');
        h.embedded = mountEmbedded({ release: { version: '0.3.9', sha: 'a'.repeat(40) } });
      }
    }, mode);
    const phone = page.locator(mode === 'embedded' ? '#pocket-phone-card-host' : '#pocket-phone-host');
    await page.getByRole('button', { name: mode === 'embedded' ? '打开两三事 · 随卡' : '打开两三事', exact: true }).click();
    assert.equal(await phone.locator('.status-time').textContent(), '09:30');
    assert.equal(await phone.locator('.home-date').textContent(), '2031/4/8');
    await openApp(phone, '设置');
    const select = phone.locator('#api-source');
    await select.selectOption(await select.locator('option').evaluateAll(options => options.find(option => option.value && option.value !== 'manual').value));
    await page.waitForFunction(() => previewHarness.settingsSaves > 0);
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click();
    await phone.getByRole('button', { name: '继续', exact: true }).click();
    await phone.getByText('一会儿书店见。', { exact: true }).waitFor();
    assert.equal(requests[0].input.related, 'lin的独立记忆');
    assert.equal(requests[0].input.storyMemory, undefined);
    await page.evaluate(() => { previewHarness.qqjStatus = 'disabled'; previewHarness.settings.baibai_book.enabled = true; previewHarness.context.saveSettingsDebounced(); });
    await phone.getByRole('button', { name: '继续', exact: true }).click();
    await page.waitForFunction(() => previewHarness.metadata.pocketPhone.conversations.lin.filter(row => row.text === '一会儿书店见。').length === 2);
    assert.equal(requests[1].input.storyMemory, undefined); assert.ok(requests[1].body.messages[0].content.includes('【2031/4/7 18:00 → 2031/4/7 19:00】已选剧情摘要'));
    assert.equal(requests[1].input.related, '');
    assert.equal(requests[1].input.story, undefined); assert.ok(requests[1].body.messages[0].content.includes('林舟：街上很安静。'));
    assert.deepEqual(await page.evaluate(() => { const saved = previewHarness.metadata.pocketPhone.conversations.lin.at(-1); return [saved.storyDate, saved.timeLabel, saved.storyWeekday, JSON.parse(saved.batch.key)]; }), ['2031/4/8', '09:30', '', [0, '2031/4/8', '09:30']]);
    await openApp(phone, '短信'); await phone.locator('[data-group="preview-friends"]').click();
    await phone.getByRole('button', { name: '继续', exact: true }).click();
    await phone.getByText('在书店见。', { exact: true }).waitFor();
    assert.equal(requests[2].body.messages[0].content.includes('已选剧情摘要'), true);
    assert.ok(requests[2].input.group.members.every(person => !person.related && !person.storyMemory));
    await openApp(phone, 'ainstgram'); await phone.getByRole('button', { name: '刷新动态', exact: true }).click();
    await phone.locator('.social-post').first().waitFor();
    assert.equal(requests[3].body.messages[0].content.includes('已选剧情摘要'), true);
    assert.ok(requests[3].input.authors.every(person => !person.related && !person.storyMemory));
    await phone.locator('.social-comment-toggle').first().click();
    const form = phone.locator('.social-comment-form').first();
    await form.locator('textarea').fill('早上好。'); await form.getByRole('button', { name: '发送', exact: true }).click();
    await page.waitForFunction(() => previewHarness.memoryReads.bbs === 4);
    await phone.getByText('早上好。', { exact: true }).waitFor();
    assert.ok(requests[4].body.messages[0].content.includes('已选剧情摘要')); assert.equal(JSON.stringify(requests[4].input).includes('已选剧情摘要'), false);
    assert.equal(requests[4].input.storyMemory, undefined);
    await page.evaluate(() => { previewHarness.qqjStatus = 'not-ready'; });
    await form.locator('textarea').fill('双开保留草稿');
    const beforeConflict = await page.evaluate(() => ({ saves: previewHarness.metadataSaves, data: JSON.stringify(previewHarness.metadata), reads: { ...previewHarness.memoryReads } }));
    await form.getByRole('button', { name: '发送', exact: true }).click();
    await phone.getByRole('dialog', { name: '记忆插件冲突' }).waitFor();
    assert.equal(requests.length, 5);
    assert.deepEqual(await page.evaluate(() => ({ saves: previewHarness.metadataSaves, data: JSON.stringify(previewHarness.metadata), reads: { ...previewHarness.memoryReads } })), beforeConflict);
    await phone.getByRole('button', { name: '知道了', exact: true }).click();
    assert.equal(await form.locator('textarea').inputValue(), '双开保留草稿');
    await openApp(phone, '短信'); await phone.locator('[data-contact="lin"]').click();
    await phone.getByRole('button', { name: '继续', exact: true }).click();
    await phone.getByRole('dialog', { name: '记忆插件冲突' }).waitFor();
    assert.equal(requests.length, 5);
    await phone.getByRole('button', { name: '知道了', exact: true }).click();
    await phone.getByRole('textbox', { name: '短信内容' }).fill('双开仍能保存普通短信');
    await phone.getByRole('button', { name: '发送', exact: true }).click();
    await phone.getByText('双开仍能保存普通短信', { exact: true }).waitFor();
    assert.equal(requests.length, 5);
    await openApp(phone, '论坛'); await phone.getByRole('button', { name: '刷新', exact: true }).click();
    await phone.getByText('街边新店', { exact: true }).waitFor();
    assert.equal(requests[5].input.storyMemory, undefined);
    assert.deepEqual(await page.evaluate(() => previewHarness.memoryReads), beforeConflict.reads);
    await openApp(phone, '设置');
    await phone.getByRole('button', { name: '内容设置', exact: true }).click();
    await phone.getByRole('switch', { name: '短信带入正文' }).check();
    await page.evaluate(() => previewHarness.beforeGeneration());
    assert.equal(requests.length, 6, 'short backflow adds no model request or external memory read');
    assert.ok(await page.evaluate(() => previewHarness.prompt.includes('2031/4/8') && previewHarness.prompt.includes('09:30') && previewHarness.prompt.includes('一会儿书店见。')));
    assert.deepEqual(errors, []);
    console.log(`${kind}/${mode}: live QQJ→BBS selection, single-copy 4 BBS reads, BBS clock/SMS/batch/backflow, group/feed/comment payloads, conflict modal before save with retained draft, pure send and forum unaffected; 6 simulated model calls.`);
    await page.close();
  }
} finally { await browser.close(); }
