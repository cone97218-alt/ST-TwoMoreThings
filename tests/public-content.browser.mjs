import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { openApp } from './navigation.mjs';
const { chromium } = createRequire('/tmp/st-tools-browser/package.json')('playwright');
const output = '/tmp/mobile-plugin-reference-research/public-content-round';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/tmp/st-tools-browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/st-tools-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
try {
 for (const host of ['native', 'luker']) for (const width of [320, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__font/*', route => {
   const name = basename(new URL(route.request().url()).pathname), path = '/tmp/mobile-plugin-reference-research/preview-fonts/' + name;
   return route.fulfill({ path: existsSync(path) ? path : '/tmp/myriad-home-design-20261016/' + name, contentType: 'font/woff2' });
  });
  await page.goto(`http://127.0.0.1:8917/tests/preview.html?host=${host}&clock=story`);
  await page.locator('.phone-shell').waitFor();
  await page.evaluate(async css => {
   const face = document.createElement('style'); face.textContent = css; document.head.append(face);
   const style = document.createElement('style'); style.textContent = ':host{font-family:PocketPreviewCJK,sans-serif}'; document.querySelector('.pocket-phone').shadowRoot.append(style);
   await document.fonts.load('13px PocketPreviewCJK', '论坛回帖河畔新增步道夜间有路灯散步'); await document.fonts.ready;
   previewHarness.reply = { posts: [{ title: 'A new riverside path', titleTranslation: '河畔新增步道', author: 'EveningWalker', category: '街区生活',
    content: 'The new path is open. Lamps stay on until ten.', contentTranslation: '新步道开放了，路灯亮到晚上十点。',
    comments: [{ author: 'RiverWind', text: 'Lovely for an evening walk.', translation: '很适合傍晚散步。' }],
   }] };
  }, readFileSync('/tmp/mobile-plugin-reference-research/preview-fonts.css', 'utf8').replaceAll('Nowar Rounded TW Wc', 'PocketPreviewCJK'));
  await openApp(page, '论坛');
  assert.equal(await page.evaluate(() => previewHarness.requests.length), 0);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.waitForFunction(() => previewHarness.metadata.pocketPhone.forum.posts[0].title === 'A new riverside path');
  assert.equal(await page.evaluate(() => previewHarness.requests.length), 1, '双语在同次请求内生成');
  const input = await page.evaluate(() => JSON.parse(previewHarness.requests[0].body.messages[1].content));
  assert.equal('user' in input || 'userProfile' in input, false, '论坛没有用户资料');
  assert.equal(input.storyBackground, undefined);
  assert.equal(typeof input.setting, 'string');
  assert.equal(input.clock.time, '23:58');
  assert.equal(await page.locator('.post-title .message-original').textContent(), 'A new riverside path');
  assert.equal(await page.locator('.post-title .message-translation').textContent(), '河畔新增步道');
  assert.equal(await page.locator('.post-excerpt .message-translation').isVisible(), true, '预览不把译文裁掉');
  await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-forum.png` });
  await page.locator('.forum-card').click();
  assert.equal(await page.locator('.post-detail h1 .message-translation').textContent(), '河畔新增步道');
  assert.equal(await page.locator('.post-body .message-translation').textContent(), '新步道开放了，路灯亮到晚上十点。');
  assert.equal(await page.locator('.comment-row .message-translation').textContent(), '很适合傍晚散步。');
  assert.equal(await page.locator('.comment-row .message-translation').evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
  assert.equal(await page.locator('.phone-main').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.evaluate(() => { previewHarness.metadata.pocketPhone.theme = 'night'; previewHarness.app.open(); });
  await page.locator('.phone-shell').screenshot({ path: `${output}/${host}-${width}-post-night.png` });
  await page.getByRole('button', { name: '返回论坛', exact: true }).click();
  assert.equal(await page.evaluate(() => previewHarness.requests.length), 1, '读帖和返回不请求翻译');
  await page.evaluate(() => { previewHarness.reply = { posts: [{ title: '中文帖子', author: '路人', content: '仅中文内容。', comments: [{ author: '邻居', text: '收到。' }] }] }; });
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.waitForFunction(() => previewHarness.metadata.pocketPhone.forum.posts[0].title === '中文帖子');
  assert.equal(await page.locator('.message-translation').count(), 0, '没有译文的旧帖或中文帖不留空隔线');
  assert.deepEqual(errors, []);
  await page.close();
 }
 console.log('Forum: native/Luker 320/390; external-context input, one-call bilingual storage, translated title/body/comments and previews, read-only navigation, Chinese defaults and day/night layouts passed. Mock model only.');
} finally { await browser.close(); }
