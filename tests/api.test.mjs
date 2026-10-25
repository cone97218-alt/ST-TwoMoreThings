import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiSettings, createModelClient, parsePayload, parseJsonObject } from '../src/api.js';
import { createHarness } from './harness.mjs';

test('manual model discovery needs only URL and key, normalizes the list, and does not save settings', async () => {
  const h = createHarness({ completion: { data: [{ id: 'z-model' }, { id: 'a-model' }, 'z-model', null] } });
  const api = createApiSettings({ host: h.host });
  const models = await api.fetchModels({ url: 'https://example.invalid/v1/chat/completions', key: 'test-key' });
  assert.deepEqual(models, ['a-model', 'z-model']);
  assert.equal(h.modelRequests[0].path, '/api/backends/chat-completions/status');
  assert.equal(h.modelRequests[0].body.reverse_proxy, 'https://example.invalid/v1');
  assert.equal(h.modelRequests[0].body.proxy_password, 'test-key');
  assert.equal(h.settingsSaves, 0);
});

test('choosing an API source preserves floating and QR preferences', async () => {
  const h = createHarness({ settings: { pocketPhone: { fabShow: false, qrShow: true }, qianqianjie: { apiUrl: 'https://example.invalid', apiKey: 'test', apiModel: 'm' } } });
  await createApiSettings({ host: h.host }).select({ kind: 'qqj-current' });
  assert.deepEqual(h.context.extensionSettings.pocketPhone, { fabShow: false, qrShow: true, apiSourceRef: { kind: 'qqj-current' } });
});

test('model discovery reports an empty list and request errors without reflecting credentials', async () => {
  const h = createHarness({ completion: { models: [] } });
  const api = createApiSettings({ host: h.host });
  await assert.rejects(api.fetchModels({ url: 'https://example.invalid', key: 'private-key' }), /没有返回可用模型/);
  await assert.rejects(api.fetchModels({ url: '', key: '' }), /接口地址和密钥/);
  h.host.request = async () => Response.json({ error: 'private-key' }, { status: 401 });
  await assert.rejects(api.fetchModels({ url: 'https://example.invalid', key: 'private-key' }), error => error.message.includes('401') && !error.message.includes('private-key'));
});

test('reads the selected shared source fresh without changing other plugins', async () => {
  const settings = { qianqianjie: { apiMode: 'seven-preset', selectedSevenDaysPresetId: 'p' }, 'schedule-planner': { apiPresetActiveId: 'other', apiPresets: [{ id: 'p', name: '日常', url: 'https://example.invalid/v1', key: 'test-key', model: 'first', qqjTemperature: 0.3 }] } };
  const h = createHarness({ settings });
  const api = createApiSettings({ host: h.host });
  const client = createModelClient({ host: h.host, sourceProvider: api });
  assert.equal(h.settingsSaves, 0);
  await client.complete({ system: '只回复短信。', messages: [{ role: 'user', content: '你好' }] });
  settings['schedule-planner'].apiPresets[0].model = 'second';
  await client.complete({ system: '只回复短信。', messages: [] });
  assert.deepEqual(h.modelRequests.map(x => x.body.model), ['first', 'second']);
  assert.equal(h.modelRequests[0].path, '/api/backends/chat-completions/generate');
  assert.equal(h.modelRequests[0].body.reverse_proxy, 'https://example.invalid/v1');
  assert.equal(h.modelRequests[0].body.proxy_password, 'test-key');
  assert.equal(h.modelRequests[0].headers['X-CSRF-Token'], 'test-csrf');
  assert.equal(settings['schedule-planner'].apiPresetActiveId, 'other');
  assert.equal(settings['schedule-planner'].apiPresets[0].qqjTemperature, 0.3);
});

test('manual setup adds to the shared pool and stores only its source reference', async () => {
  const h = createHarness({ settings: { 'schedule-planner': { apiPresetActiveId: 'old', apiPresets: [{ id: 'old', unknown: { keep: true } }] } } });
  const api = createApiSettings({ host: h.host });
  await api.saveManual({ url: 'https://example.invalid/v1/chat/completions', key: 'test-key', model: 'chosen' });
  assert.equal(api.resolve().url, 'https://example.invalid/v1');
  assert.equal(h.context.extensionSettings['schedule-planner'].apiPresets.length, 2);
  assert.deepEqual(h.context.extensionSettings['schedule-planner'].apiPresets[0], { id: 'old', unknown: { keep: true } });
  assert.deepEqual(Object.keys(h.context.extensionSettings.pocketPhone), ['apiSourceRef']);
  assert.equal(h.context.extensionSettings['schedule-planner'].apiPresetActiveId, 'old');
});

test('does not silently change an explicitly missing source or choose among several presets', () => {
  const h = createHarness({ settings: { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'gone' } }, 'schedule-planner': { apiUrl: 'https://example.invalid', apiKey: 'key', apiModel: 'm' } } });
  assert.throws(() => createApiSettings({ host: h.host }).resolve(), /选择|补全/);
  delete h.context.extensionSettings.pocketPhone;
  h.context.extensionSettings['schedule-planner'] = { apiPresets: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(createApiSettings({ host: h.host }).getSelected(), null);
});

test('extracts formal answers and keeps valid parts without inventing attribution', () => {
  assert.deepEqual(parsePayload('说明\n```json\n{"data":{"replies":[{"content":"你好"},{"role":"user","text":"不要代写"},{}]}}\n```', 'messages'), [{ text: '你好' }]);
  const posts = parsePayload('{"posts":[{"title":"散步","author":"路人甲","content":"晚风很好","replies":[{"author":"路人乙","content":"同感"}]},{"title":"无作者","content":"不猜作者"}]}', 'forum');
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].comments, [{ author: '路人乙', text: '同感' }]);
  assert.throws(() => parsePayload('只有一段无法归属的正文', 'forum'), /没有|无法/);
});

test('reports request failure without reflecting provider credentials into the UI', async () => {
  const h = createHarness({ settings: { qianqianjie: { apiUrl: 'https://example.invalid', apiKey: 'test-secret', apiModel: 'm' } } });
  h.host.request = async () => Response.json({ error: 'Bearer test-secret https://example.invalid' }, { status: 401 });
  const client = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });
  await assert.rejects(client.complete({ system: 'test', messages: [] }), error => /401/.test(error.message) && !/test-secret|example.invalid/.test(error.message));
});

test('handles think tags cleanly in parsePayload and parseJsonObject', () => {
  const rawWithThink = '<think>I should output JSON with prompt: {"characters": ["invalid"]} </think>```json\n{"prompt":"rainy street","characters":[]}\n```';
  assert.deepEqual(parseJsonObject(rawWithThink), { prompt: 'rainy street', characters: [] });
  const payloadWithThink = '<think>Thinking...\n</think>{"messages":[{"text":"你好呀"}]}';
  assert.deepEqual(parsePayload(payloadWithThink, 'messages'), [{ text: '你好呀' }]);
});

test('surfaces upstream API error or token exhaustion clearly', async () => {
  const settings = { qianqianjie: { apiUrl: 'https://example.invalid', apiKey: 'test', apiModel: 'm' } };
  const h = createHarness({ settings });
  const client = createModelClient({ host: h.host, sourceProvider: createApiSettings({ host: h.host }) });

  h.host.request = async () => Response.json({ error: { message: 'Quota exceeded' } });
  await assert.rejects(client.complete({ system: 'test', messages: [] }), /接口报错：Quota exceeded/);

  h.host.request = async () => Response.json({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
  await assert.rejects(client.complete({ system: 'test', messages: [] }), /Token 已耗尽/);
});

test('shares API channels with ST-BaiBai-Book seamlessly', async () => {
  const baibaiChannel1 = { id: 'ch_1', name: 'DeepSeek R1', url: 'https://api.deepseek.com/v1', key: 'sk-ds', model: 'deepseek-reasoner', reasoningEffort: 'high', maxTokens: 32768 };
  const baibaiChannel2 = { id: 'ch_2', name: 'Claude Sonnet', url: 'https://api.anthropic.com/v1', key: 'sk-ant', model: 'claude-3-7-sonnet' };
  const settings = {
    baibai_api_channels: {
      schemaVersion: 1,
      revision: 2,
      channels: [baibaiChannel1, baibaiChannel2],
    },
    baibai_book: {
      assignments: { summary: 'ch_1', resummary: 'ch_2' },
    },
  };

  const h = createHarness({ settings });
  const api = createApiSettings({ host: h.host });
  const sources = api.listSources();

  // 1. Validates following BaiBaiBook summary/resummary and direct channels
  assert.ok(sources.some(s => s.ref.kind === 'baibai-book-summary' && s.model === 'deepseek-reasoner'));
  assert.ok(sources.some(s => s.ref.kind === 'baibai-book-resummary' && s.model === 'claude-3-7-sonnet'));
  assert.ok(sources.some(s => s.ref.kind === 'baibai-channel' && s.ref.channelId === 'ch_1'));

  // 2. Selects following summary
  await api.select({ kind: 'baibai-book-summary' });
  const resolved = api.resolve();
  assert.equal(resolved.url, 'https://api.deepseek.com/v1');
  assert.equal(resolved.key, 'sk-ds');
  assert.equal(resolved.model, 'deepseek-reasoner');
  assert.equal(resolved.reasoningEffort, 'high');
  assert.equal(resolved.maxTokens, 32768);

  const client = createModelClient({ host: h.host, sourceProvider: api });
  await client.complete({ system: 'test', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(h.modelRequests.at(-1).body.max_tokens, 32768);

  // 3. Selects direct channel (defaults to 65535 when channel maxTokens not specified)
  await api.select({ kind: 'baibai-channel', channelId: 'ch_2' });
  const resolved2 = api.resolve();
  assert.equal(resolved2.model, 'claude-3-7-sonnet');
  assert.equal(resolved2.maxTokens, 65535);
});

test('跟随构画 (gouhua-current) has been removed from api sources and resolver', async () => {
  const settings = {
    'schedule-planner': {
      apiUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      apiModel: 'gouhua-model',
    },
  };
  const h = createHarness({ settings });
  const api = createApiSettings({ host: h.host });
  const sources = api.listSources();
  assert.equal(sources.some(s => s.ref.kind === 'gouhua-current'), false);
  assert.equal(sources.some(s => s.label?.includes('跟随构画')), false);
  assert.throws(() => api.resolve({ kind: 'gouhua-current' }), /选择|补全/);
});
