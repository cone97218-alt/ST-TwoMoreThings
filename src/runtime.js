import { getSharedBodyWrappers } from './shared-body-wrappers.js';
import { createHostAdapter, renderUpdateMarkdown } from './host.js';
import { createPhoneStore } from './store.js';
import { createApiSettings, createModelClient } from './api.js';
import { createContextReader, createBackflowService } from './context.js';
import { createMessageService } from './messages.js';
import { createForumService } from './forum.js';
import { createGroupService } from './groups.js';
import { createDirectoryService } from './directory.js';
import { mountPhone } from './ui.js';
import { readPhoneTime } from './time.js';
import { readTimeline } from './timeline.js';
import { createWallpaperService } from './wallpaper.js';
import { createPhoneEntries } from './entries.js';
import { createPhoneControl } from './control.js';
import { createPhoneImageService } from './phone-images.js';
import { readLockWeather } from './weather.js';
import { createAuthoringService, stateFromPreset } from './authoring.js';
import { createCalendarReader } from './calendar.js';
import { createCalendarAiService } from './calendar-ai.js';
import { logger, detectRequestTitle } from './logger.js';
import { createSocialService } from './social.js';
import { createImageFiles } from './image-files.js';
import { createImageProviders } from './image-providers.js';
import { createAppearanceSettings } from './appearance.js';
import { createPluginUpdates } from './plugin-updates.js';
import { createEmbeddedUpdates } from './embedded-updates.js';
import { UPDATE_NOTICE_PATH } from './release.js';
import { VERSION } from './version.js';
import { createMemorySources } from './memory-sources.js';
import { collapseMessages } from './preset-engine.js';
export { createPhoneControl, createPhoneImageService };

export function initialize({ mode = 'standalone', host = createHostAdapter({ mode }), documentRef = document, qqjBridgeProvider, preset, coreUrl, release, updateError, replaceCore } = {}) {
  const updates = host.mode === 'embedded'
    ? createEmbeddedUpdates({ coreUrl, version: VERSION, release, updateError, replaceCore })
    : createPluginUpdates({ moduleUrl: import.meta.url, extensionTypes: () => host.readExtensionTypes(), headers: () => host.getRequestHeaders(), noticePath: UPDATE_NOTICE_PATH });
  const wrapperSettingsProvider = () => ({ ...getSharedBodyWrappers(host.readSettings()) });
  const initialState = preset ? stateFromPreset(preset) : undefined;
  const files = createImageFiles({ host });
  const imageProviders = createImageProviders({ host });
  const appearance = createAppearanceSettings({ host, documentRef });
  const makeStore = (target, options = {}) => createPhoneStore({ target, host, initialState, removeImages: files.remove, ...options });
  let phone, phoneTarget, activeRequests = 0;
  const entries = createPhoneEntries({ host, documentRef, open, defaults: preset?.entries,
    isEnabled: () => createPhoneControl({ host, target: host.captureChat() }).isEnabled(),
    toggle: () => phone?.isOpen && phone.isFrontmost ? phone.close() : open() });
  const unsubscribeEntries = host.onChatChanged?.(() => {
    entries.refreshVisibility();
    if (phone?.isOpen) open();
  });
  const onBusyChange = value => { activeRequests += value ? 1 : -1; entries.fab.setBusy(activeRequests > 0); };
  const unsubscribe = host.onBeforeMainGeneration(async (type, _params, dryRun) => {
    if (dryRun || ['quiet', 'impersonate'].includes(type)) return;
    const target = host.captureChat();
    host.setPrompt('');
    logger.setLastBackflowPrompt('');
    const control = createPhoneControl({ host, target });
    if (!control.isEnabled()) return;
    const store = makeStore(target);
    const calendar = createCalendarReader({ store, target });
    const modelClient = createModelClient({ host, sourceProvider: createApiSettings({ host }), onBusyChange });
    try {
      const prompt = await createBackflowService({ target, store, modelClient, isEnabled: control.isEnabled, wrapperSettingsProvider, calendar }).prepare(type);
      host.setPrompt(prompt);
      logger.setLastBackflowPrompt(prompt);
    }
    catch (error) { host.reportError(`手机参考准备失败，本次正文未带入手机消息。${error.message || '请检查手机生成连接后重试。'}`); }
  });
  const unsubscribeTime = host.onStoryChanged(() => phone?.refreshTime());
  function open() {
    const target = host.captureChat();
    // 宿主首次加载聊天会替换 metadata 根；重开时让窗口绑定实际载入的档案。
    if (phone && phoneTarget.id === target.id && phoneTarget.metadata === target.metadata) { phone.open(); return; }
    phone?.dispose();
    phoneTarget = target;
    const control = createPhoneControl({ host, target });
    let currentPhone;
    const store = makeStore(target, { assertEnabled: control.assertEnabled, isReading: id => currentPhone?.isReading(id), onIncomingMessage: id => currentPhone?.notifyMessage(id) });
    const apiSettings = createApiSettings({ host, onBusyChange });
    const client = createModelClient({ host, sourceProvider: apiSettings, onBusyChange });
    const modelClient = {
      async complete(request) {
        control.assertEnabled();
        try {
          const answer = await client.complete(request);
          control.assertEnabled();
          const sys = request.system || (request.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n\n---\n\n') || '';
          const collapsed = request.collapsedMessages || (Array.isArray(request.entries) && request.entries.length ? collapseMessages(request.entries) : request.messages || []);
          logger.addLog({
            title: detectRequestTitle(request),
            systemPrompt: sys,
            messages: collapsed,
            entries: request.entries || (request.messages || []),
            reply: answer,
            error: null,
          });
          return answer;
        } catch (err) {
          const sys = request.system || (request.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n\n---\n\n') || '';
          const collapsed = request.collapsedMessages || (Array.isArray(request.entries) && request.entries.length ? collapseMessages(request.entries) : request.messages || []);
          logger.addLog({
            title: detectRequestTitle(request),
            systemPrompt: sys,
            messages: collapsed,
            entries: request.entries || (request.messages || []),
            reply: '',
            error: err.message || String(err),
          });
          throw err;
        }
      }
    };
    const calendar = createCalendarReader({ store, target });
    const memorySources = createMemorySources({ target, qqjBridgeProvider, settingsProvider: host.readSettings });
    const contextReader = createContextReader({ target, store, qqjBridgeProvider, calendar, wrapperSettingsProvider, memorySources });
    const calendarAi = createCalendarAiService({ contextReader, modelClient, target, store });
    currentPhone = mountPhone({ mount: documentRef.documentElement, store, qqjBridgeProvider, defaultUser: target.user, readTime: () => readPhoneTime(target.messages), readTimeline: () => readTimeline(target.messages),
      host,
      messages: createMessageService({ target, store, contextReader, modelClient }),
      groups: createGroupService({ target, store, contextReader, modelClient }),
      directory: createDirectoryService({ store, contextReader, modelClient }),
      forum: createForumService({ store, contextReader, modelClient }), apiSettings, calendar, calendarAi, logger,
      previewBackflow: async () => {
        const backflowService = createBackflowService({ target, store, modelClient, isEnabled: control.isEnabled, wrapperSettingsProvider, calendar });
        return await backflowService.prepare('normal');
      },
      social: createSocialService({ store, contextReader, modelClient, defaultUser: target.user, isReadingPost: id => currentPhone?.isReadingSocial(id) }),
      wallpaper: createWallpaperService({ host, store }), entries, appearance, authoring: createAuthoringService({ host, store, readEntries: entries.read }), mode: host.mode,
      updates, renderUpdateMarkdown, notifyUpdate: notification => {
        if (notification.kind === 'error') host.reportError(notification.text);
        else if (globalThis.toastr?.success) globalThis.toastr.success(notification.text);
        else globalThis.alert?.(notification.text);
      },
      control, imageProviders, images: createPhoneImageService({ store, modelClient, files, providers: imageProviders, assertEnabled: control.assertEnabled, onBusyChange, defaultUser: target.user }), readWeather: readLockWeather,
      onContextChange: () => { host.setPrompt(''); logger.setLastBackflowPrompt(''); },
      onClose: () => entries.focus(),
    });
    phone = currentPhone;
  }
  return { open, dispose(options) { phone?.dispose(); unsubscribe(); unsubscribeTime(); unsubscribeEntries?.(); entries.dispose(options); host.setPrompt(''); } };
}
