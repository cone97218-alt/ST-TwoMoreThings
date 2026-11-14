import { avatar, escape, icon, refKey, weatherSvgIcon } from './ui/shared.js';

import { partitionHistory } from './timeline.js';

import { renderHome } from './ui/home.js';

import { createPhoneClock } from './ui/status.js';

import { renderFeedback, renderShell } from './ui/shell.js';

import { renderDesktop } from './ui/desktop.js';

import { renderInbox, renderChat } from './ui/messages.js';

import { renderForum, renderPost } from './ui/forum.js';

import { renderSettings } from './ui/settings.js';

import { renderProfile } from './ui/profiles.js';

import { readImage } from './ui/images.js';

import { renderGroupProfile } from './ui/groups.js';

import { renderDeletion } from './ui/deletion.js';

import { renderModelOptions } from './ui/models.js';

import { readLockWeather } from './weather.js';

import { renderAuthoring } from './ui/authoring.js';

import { LOCAL_CORE_URL, REMOTE_CORE_URL } from './authoring.js';

import { renderCalendar } from './ui/calendar.js';

import { renderMap } from './ui/map.js';

import { renderOrigin } from './ui/origin.js';

import { renderFoodie } from './ui/foodie.js';

import { DEFAULT_FOODIE_TEMPLATE, evaluateFoodieMatch, getEffectiveDatabases, parseDishCondition, splitDishesInput } from './foodie-engine.js';

import { sanitizeStoryBody, getSharedBodyWrappers } from './shared-body-wrappers.js';

import { SYSTEM_CONTACT_ID, DEFAULT_ORIGIN_TEMPLATES, resetOriginData } from './origin-engine.js';

import { buildMapProjection, readBaiBaiBookMapSnapshot } from './map-engine.js';

import { createCalendarReader } from './calendar.js';

import { defaultWorkdayConfig } from './calendar-engine.js';

import { mountChatParticles } from './ui/particles.js';

import { mountAvatarCropper } from './ui/avatar-cropper.js';

import { createPhoneWindow } from './ui/window.js';

import { createChatScroll } from './ui/chat-scroll.js';

import { renderSocial, renderSocialProfile } from './ui/social.js';

import { imagePath } from './image-files.js';

import { findBlobEmoji } from './emojis.js';

import { readContactAvatars } from './contact-avatars.js';

import { displayName } from './profiles.js';

import { renderTodos } from './ui/todos.js';

import { renderPhoneNotice } from './ui/notifications.js';

import { createOldMaidGame, createOldMaidInvitation, acceptOldMaidGame, rejectOldMaidGame, userDrawCard, aiDrawCard, setBluffCard, getAiMicroExpression } from './games/old-maid.js';

import {

  createBuckshotGame,

  createBuckshotInvitation,

  acceptBuckshotGame,

  rejectBuckshotGame,

  shootOpponent as buckshotShootOpponent,

  shootSelf as buckshotShootSelf,

  useItem as buckshotUseItem,

} from './games/buckshot-roulette.js';

import { readSocialPosts } from './social.js';

import { DEFAULT_PROMPT_PRESETS, normalizePromptPresets, exportPresetToPayload, createPresetFromPayload, toggleScopeSelection } from './preset-engine.js';

import { createPluginUpdatesView } from './ui/plugin-updates-view.js';

import { createPhoneDialog } from './ui/dialog.js';

import { MEMORY_CONFLICT_CODE } from './memory-sources.js';

import { readBaiBaiExcludeSettings, saveBaiBaiExcludeSettings, SHARED_EXCLUDES_EVENT } from './worldbook.js';



// 新应用在这里注册入口和页面，页面模板保留在 src/ui/。

const apps = [

  { id: 'messages', label: '短信', view: 'inbox' },

  { id: 'origin', label: '系统', view: 'origin' },

  { id: 'forum', label: '论坛', view: 'forum' },

  { id: 'calendar', label: '日历', view: 'calendar' },

  { id: 'map', label: '地图', view: 'map' },

  { id: 'foodie', label: '寻味', view: 'foodie' },

  { id: 'settings', label: '设置', view: 'settings' },

  { id: 'social', label: 'ainstgram', view: 'social' },

];

const pages = {

  home: renderHome,

  desktop: renderDesktop,

  inbox: renderInbox,

  chat: renderChat,

  'group-chat': renderChat,

  'group-profile': renderGroupProfile,

  'delete-confirm': renderDeletion,

  forum: renderForum,

  post: renderPost,

  origin: renderOrigin,

  foodie: renderFoodie,

  settings: renderSettings,

  'contact-profile': renderProfile,

  'user-profile': renderProfile,

  authoring: renderAuthoring,

  calendar: renderCalendar,

  todos: renderCalendar,

  map: renderMap,

  social: renderSocial,

  'social-profile': renderSocialProfile,

};



export function mountPhone({ mount, store, messages, groups, directory, forum, social, origin: originService = {}, apiSettings, imageProviders, wallpaper, entries, appearance, images, authoring, mode, updates, renderUpdateMarkdown, notifyUpdate, qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1, calendar = createCalendarReader(), calendarAi = { async conceiveFestivals() { return []; }, async deduceSchedules() { return []; } }, mapAi = { async organizeMap() { return { places: [] }; } }, readChatMessages = () => [], logger = null, previewBackflow = null, summarizeBackflow = null, control = { isEnabled: () => true }, readWeather = readLockWeather, readTime, readTimeline, defaultUser = '我', defaultUserAvatar = '', onClose, onContextChange = () => {}, host }) {

  const doc = mount.ownerDocument;

  const element = doc.createElement('div');

  element.id = mode === 'embedded' ? 'pocket-phone-card-host' : 'pocket-phone-host';

  element.dataset.mode = mode || 'standalone';

  element.className = 'pocket-phone';

  const root = element.attachShadow({ mode: 'open' });

  const fontStyle = doc.createElement('style');

  fontStyle.dataset.pocketPhoneFont = '';

  fontStyle.textContent = `@font-face { font-family: PocketPhoneClock; src: url("${new URL('../assets/clock-dorsa.ttf', import.meta.url).href}") format("truetype"); font-display: block; }

    @font-face { font-family: PocketPhoneRoundClock; src: url("${new URL('../assets/clock-fredoka.woff2', import.meta.url).href}") format("woff2"); font-weight: 500; font-display: block; }`;

  doc.head.append(fontStyle);

  const stylesheet = doc.createElement('link');

  stylesheet.rel = 'stylesheet';

  stylesheet.href = `${new URL('../style.css', import.meta.url).href}?v=${Date.now()}`;

  const surface = doc.createElement('div');

  surface.className = 'phone-shell';

  surface.setAttribute('role', 'region');

  surface.setAttribute('aria-label', '两三事');

  root.append(stylesheet, surface);

  mount.append(element);

  const windowControls = createPhoneWindow(surface);

  const chatScroll = createChatScroll(root);

  const dialog = createPhoneDialog({ mount: surface, documentRef: doc });

  const updatesView = updates && createPluginUpdatesView({ updates, dialog, documentRef: doc, renderMarkdown: renderUpdateMarkdown, notifyUser: notifyUpdate,

    ...(mode === 'embedded' ? { successText: '两三事已更新，可继续使用。' } : {}) });

  // 这里只持有未保存的页面状态；联系人和消息始终从 store 读取。

  const ui = {

    view: 'home', feedback: null, defaultUser, defaultUserAvatar, conflict: control.hasConflict?.(doc) === true,

    contactId: '', groupId: '', postId: '',

    drafts: new Map(), visibleMessages: 60, batch: null,

    historyOpen: false, visibleHistory: 60,

    inboxMenu: false, chatMenu: false, selectedMessage: '', confirmClear: false,

    editor: '', editId: '', profileDraft: {},

    groupEditId: '', groupDraft: {}, deletion: null,

    groupMembersOpen: false,

    socialAuthorId: '', socialPastOpen: false, socialLimit: 30, socialScroll: 0,

    socialCommentOpen: new Set(), socialDrafts: new Map(), notice: null,

    drawers: { connection: true, appearance: false, content: false, worldbook_excludes: false, prompts: false, logs: false },

    expandedLogs: null, backflowPreview: undefined, expandedPresetEntries: new Set(),

    promptCategory: '全部', promptSearch: '', promptDrafts: {},

    manual: false, apiDraft: {}, models: [], modelSearch: '', modelsOpen: false,

    attachment: '', attachmentDraft: {}, stickerPack: 'emoji', photo: null,

    calendarOffset: 0, calendarDay: null, calendarScroll: 0, hasOpenedOnce: false, lastOpenView: '',

    calendarFormOpen: false, calendarDraft: null, calendarWeatherModalOpen: false,

    calendarSettingsOpen: false, calendarAiOpen: false, calendarAiTab: 'festivals',

    calendarAiSetting: '', calendarAiCount: 3, calendarAiDays: 3, calendarAiFocus: '全部',

    calendarAiFestivals: [], calendarAiSchedules: [], calendarAiBusy: false,

    mapSheetId: '', mapScopeId: '', mapSelectedPlaceId: '', mapSearch: '',

    mapFormOpen: false, mapDraft: null, mapSettingsOpen: false, mapEditMode: false,

    mapAiModalOpen: false, mapAiInstruction: '', mapAiResults: null,

    todoEditing: new Set(), todoDrafts: new Map(),

    activeGame: null, activeGameMessageId: '', gameBoardFolded: false, gameGuideOpen: false, gameGuideTab: 'guide',

    replyToId: '',

    reactionMoreMessageId: '',

    thoughtMessageId: '',

    openReasoningIds: new Set(),

    editingMessageId: '',

    editingMessageDraft: undefined,

    multiSelectMode: false,

    selectedMessageIds: new Set(),

    multiSelectAnchorId: '',

    forwardMessageIds: [],

    forwardTargetId: '',

    forwardNote: '',

    favoritesOpen: false,

    excludeWorldModalOpen: false,

    excludeWorldSearch: '',

    wiPatternDraft: '',

  };

  const busy = new Set();

  if (!control.isEnabled()) ui.view = 'settings';

  const clock = createPhoneClock({ root, element, readTime });

  const inChat = () => ['chat', 'group-chat'].includes(ui.view);

  const conversationId = () => ui.view === 'group-chat' ? ui.groupId : ui.contactId;

  let particles = null, avatarCropper = null, lockImageNode = null, lockImageSrc = '', noticeTimer;



  function dismissPhoneNotice() {

    doc.defaultView.clearTimeout(noticeTimer);

    ui.notice = null;

    root.querySelector('.phone-top-notice')?.remove();

  }

  const promptWagerDialog = async (currentWager = '') => {

    const container = doc.createElement('div');

    container.className = 'wager-dialog-body';



    const tip = doc.createElement('p');

    tip.textContent = '设置或修改对决赌注（输家需履行的惩罚或约定）：';

    tip.className = 'dialog-field-tip';



    const inputEl = doc.createElement('input');

    inputEl.type = 'text';

    inputEl.className = 'dialog-field-input';

    inputEl.value = currentWager || '';

    inputEl.placeholder = '输入新赌注，例如：答应赢家一个要求';

    inputEl.setAttribute('aria-label', '新赌注');



    container.append(tip, inputEl);



    let resultValue = null;

    const ok = await dialog.custom({

      title: '修改对决赌注',

      content: container,

      confirmText: '确认更换',

      cancelText: '取消',

      submit: () => {

        const val = inputEl.value.trim();

        if (!val) return false;

        resultValue = val;

        return true;

      },

    });



    return ok ? resultValue : null;

  };

  function pushPhoneNotice(notice) {

    if (element.hidden || !element.isConnected || !control.isEnabled()) return;

    dismissPhoneNotice();

    ui.notice = notice;

    noticeTimer = doc.defaultView.setTimeout(dismissPhoneNotice, 6000);

  }

  function visibleInPage(node, page) {

    if (!node || !page) return false;

    const box = node.getBoundingClientRect(), frame = page.getBoundingClientRect();

    return box.bottom > frame.top && box.top < frame.bottom;

  }

  function isReadingSocial(postId) {

    if (element.hidden || !element.isConnected || !['social', 'social-profile'].includes(ui.view)) return false;

    const post = root.querySelector(`.social-post[data-social-post="${CSS.escape(postId)}"]`);

    return visibleInPage(post?.querySelector('.social-comment:last-child') || post?.querySelector('.social-stats'), root.querySelector('.phone-main'));

  }

  function readVisibleSocialReplies(event) {

    if (event && !event.target.matches?.('.view-social, .view-social-profile')) return;

    if (element.hidden || !['social', 'social-profile'].includes(ui.view)) return;

    const main = root.querySelector('.phone-main');

    const ids = [...new Set([...root.querySelectorAll('.social-comment[data-unread-reply]')]

      .filter(node => visibleInPage(node, main)).map(node => node.closest('.social-post').dataset.socialPost))];

    if (!ids.length) return;

    void social.markRepliesRead(ids).then(() => {

      for (const id of ids) root.querySelectorAll(`.social-post[data-social-post="${CSS.escape(id)}"] [data-unread-reply]`).forEach(node => node.removeAttribute('data-unread-reply'));

      if (ui.notice?.kind === 'social-reply' && ids.includes(ui.notice.id)) dismissPhoneNotice();

    }).catch(() => { ui.feedback = { error: true, text: '回复的已读状态未能保存，请检查酒馆连接。' }; render(); });

  }

  function notifyCompletion(key) {

    let notice;

    if (key === 'forum' && ui.view !== 'forum') notice = { kind: 'forum' };

    if (key === 'social' && ui.view !== 'social') notice = { kind: 'social-feed' };

    if (key.startsWith('social-author:')) {

      const id = key.slice('social-author:'.length);

      if (ui.view !== 'social-profile' || ui.socialAuthorId !== id) notice = { kind: 'social-author', id };

    }

    if (notice) pushPhoneNotice(notice);

  }



  function syncParticles() {

    const chatStage = root.querySelector('.chat-stage');

    if (chatStage && !element.hidden && appearance.particlesEnabled()) {

      if (particles) particles.attach(chatStage);

      else particles = mountChatParticles(chatStage);

    } else {

      particles?.dispose();

      particles = null;

    }

  }



  // 导航、草稿、事件与服务调用由控制器统一持有，页面只负责展示。

  function render({ bottom = false } = {}) {

    if (!element.isConnected) return;

    const currentLockImage = root.querySelector('.view-home img.home-wallpaper, .view-home img.home-art');

    if (currentLockImage) {

      lockImageNode = currentLockImage;

      lockImageSrc = currentLockImage.getAttribute('src') || '';

    }

    const previousDraft = root.querySelector('#sms-draft');

    const selection = previousDraft && { text: previousDraft.value, start: previousDraft.selectionStart, end: previousDraft.selectionEnd };

    const activeSocialComment = root.activeElement?.matches?.('.social-comment-form textarea') ? root.activeElement : null;

    const socialSelection = activeSocialComment && {

      postId: activeSocialComment.closest('.social-comment-form')?.dataset.socialCommentForm,

      text: activeSocialComment.value,

      start: activeSocialComment.selectionStart,

      end: activeSocialComment.selectionEnd,

    };

    const previousPromptSearch = root.querySelector('[data-action="search-prompts"]');

    const promptSearchSelection = previousPromptSearch && (root.activeElement === previousPromptSearch) && {

      text: previousPromptSearch.value,

      start: previousPromptSearch.selectionStart,

      end: previousPromptSearch.selectionEnd,

    };

    const previousPresetSearch = root.querySelector('[data-action="search-preset-entries"]');

    const presetSearchSelection = previousPresetSearch && (root.activeElement === previousPresetSearch) && {

      text: previousPresetSearch.value,

      start: previousPresetSearch.selectionStart,

      end: previousPresetSearch.selectionEnd,

    };

    const previousExcludeWorldSearch = root.querySelector('[data-action="search-exclude-world"]');

    const excludeWorldSearchSelection = previousExcludeWorldSearch && (root.activeElement === previousExcludeWorldSearch) && {

      text: previousExcludeWorldSearch.value,

      start: previousExcludeWorldSearch.selectionStart,

      end: previousExcludeWorldSearch.selectionEnd,

    };

    const previousMapSearch = root.querySelector('[data-action="search-map-places"]');

    const mapSearchSelection = previousMapSearch && (root.activeElement === previousMapSearch) && {

      text: previousMapSearch.value,

      start: previousMapSearch.selectionStart,

      end: previousMapSearch.selectionEnd,

    };

    const previousFoodieSearch = root.querySelector('#foodie-db-search-input');

    const foodieSearchSelection = previousFoodieSearch && (root.activeElement === previousFoodieSearch) && {

      text: previousFoodieSearch.value,

      start: previousFoodieSearch.selectionStart,

      end: previousFoodieSearch.selectionEnd,

    };

    const scrollTop = inChat() ? root.querySelector('.message-feed')?.scrollTop : undefined;

    const settingsScroll = ui.savedSettingsScroll !== undefined ? ui.savedSettingsScroll : root.querySelector('.view-settings')?.scrollTop;

    const promptCardsScroll = ui.savedPromptCardsScroll !== undefined ? ui.savedPromptCardsScroll : root.querySelector('.prompt-cards-list')?.scrollTop;

    const socialScroll = ['social', 'social-profile'].includes(ui.view) ? root.querySelector(`.view-${ui.view}`)?.scrollTop : undefined;

    const calendarScroll = ['calendar', 'todos'].includes(ui.view) ? root.querySelector(`.view-${ui.view}`)?.scrollTop : undefined;

    const originScroll = ui.savedOriginScroll !== undefined ? ui.savedOriginScroll : (ui.view === 'origin' ? root.querySelector('.phone-main')?.scrollTop : undefined);
    const foodieScroll = ui.savedFoodieScroll !== undefined ? ui.savedFoodieScroll : (ui.view === 'foodie' ? root.querySelector('.phone-main')?.scrollTop : undefined);

    let state = store.read();

    const enabled = control.isEnabled();

    element.dataset.enabled = String(enabled);

    if (!enabled) { ui.view = 'settings'; ui.photo = null; ui.attachment = ''; }

    if (ui.view === 'home' && state.lockScreenEnabled === false) ui.view = 'desktop';

    if (['inbox', 'chat', 'group-chat', 'group-profile', 'social', 'social-profile'].includes(ui.view)) {

      state = { ...state, contacts: readContactAvatars(state.contacts, qqjBridgeProvider?.()) };

    }

    if (inChat()) {

      const convId = conversationId();

      const currentMsgs = state.conversations?.[convId] || [];

      if (!ui.activeGame) {

        if (ui.activeGameMessageId) {

          const found = currentMsgs.find(m => m.id === ui.activeGameMessageId);

          if (found?.game?.state) {

            ui.activeGame = found.game.state;

          } else if (found?.game) {

            ui.activeGame = found.game;

          }

        } else {

          const ongoing = [...currentMsgs].reverse().find(m => m.type === 'game' && m.game?.status === 'playing');

          if (ongoing) {

            ui.activeGame = ongoing.game.state || ongoing.game;

            ui.activeGameMessageId = ongoing.id;

          }

        }

      } else if (ui.activeGameMessageId) {

        const found = currentMsgs.find(m => m.id === ui.activeGameMessageId);

        const storeGame = found?.game?.state || found?.game;

        if (storeGame && (storeGame.round > ui.activeGame.round || (storeGame.round === ui.activeGame.round && storeGame.turn !== ui.activeGame.turn && storeGame.turn === 'user') || storeGame.status !== ui.activeGame.status)) {

          ui.activeGame = storeGame;

        }

      }

    }

    const batch = readTimeline();

    if (ui.batch?.key !== batch.key) { ui.historyOpen = false; ui.visibleHistory = 60; }

    ui.batch = batch;

    element.dataset.theme = state.theme === 'night' ? 'night' : 'day';

    const page = pages[ui.view] || pages.home;

    let weather = null;

    if (ui.view === 'home' && typeof readWeather === 'function') {

      try {

        weather = readWeather(calendar);

      } catch (err) {

        console.warn('[pocket-phone] readWeather error:', err);

      }

    }

    surface.classList.toggle('is-stacked-lock', ui.view === 'home' && state.lockStyle === 'stacked');

    surface.classList.toggle('is-rounded-theme', ['home', 'desktop'].includes(ui.view) && state.lockStyle === 'rounded');

    const calendarMonth = ui.view === 'calendar'

      ? calendar.month(ui.calendarOffset)

      : ui.view === 'desktop' ? calendar.month(0) : null;

    const mapProjection = ui.view === 'map'

      ? buildMapProjection({

          state,

          context: host?.readCurrentTarget?.() || {},

          baibaiSnapshot: readBaiBaiBookMapSnapshot(doc.defaultView || globalThis),

          messages: readChatMessages(),

          activeSheetId: ui.mapSheetId,

          scopePlaceId: ui.mapScopeId,

          searchQuery: ui.mapSearch,

        })

      : null;

    if (mapProjection?.sheetAssets) {

      const savedAssets = state?.map?.sheetAssets || {};

      for (const [sId, aId] of Object.entries(mapProjection.sheetAssets)) {

        if (aId && savedAssets[sId] !== aId) {

          store.setMapSheetAsset(sId, aId);

        }

      }

    }

    try {

      surface.innerHTML = renderShell({

        content: page(state, { ui, busy, apiSettings, imageProviders, entries, appearance, control, mode, apps, calendar: calendarMonth, mapProjection, weather, todos: store, updates, logger, backflowPreview: ui.backflowPreview, host }),

        view: ui.view, enabled, weather,

        feedback: ui.feedback, photo: ui.photo,

        conflict: ui.conflict, mode, conflictBusy: busy.has('conflict'),

        lockStyle: state.lockStyle,

      });

    } catch (renderError) {

      console.error('[pocket-phone] render error:', renderError);

      surface.innerHTML = renderShell({

        content: `<div style="padding: 24px; text-align: center; color: var(--pp-error); font-size: 13px;">

          <strong>界面渲染出现异常</strong>

          <p style="font-size: 11px; color: var(--pp-muted); margin: 8px 0;">${escape(renderError?.message || String(renderError))}</p>

          <button type="button" class="save-button" data-action="system-home" style="margin: 12px auto; width: auto; font-size: 12px; padding: 6px 16px;">返回主页</button>

        </div>`,

        view: 'home', enabled, weather: null,

        feedback: null, photo: null,

        conflict: false, mode, conflictBusy: false,

        lockStyle: state.lockStyle,

      });

    }

    if (updatesView && ui.view === 'settings') {

      root.querySelector('[data-update-controls]')?.append(updatesView.controls);

      root.querySelector('[data-update-feedback]')?.append(updatesView.feedback);

      root.querySelector('[data-update-notice]')?.append(updatesView.noticeButton);

    }

    dialog.attach();

    if (!ui.conflict && enabled) surface.insertAdjacentHTML('beforeend', renderPhoneNotice(state, ui.notice));

    const nextLockImage = root.querySelector('.view-home img.home-wallpaper, .view-home img.home-art');

    if (lockImageNode && nextLockImage && lockImageSrc === nextLockImage.getAttribute('src')) {

      lockImageNode.alt = nextLockImage.alt;

      lockImageNode.className = nextLockImage.className;

      if (lockImageNode !== nextLockImage) nextLockImage.replaceWith(lockImageNode);

    } else if (nextLockImage) {

      lockImageNode = nextLockImage;

      lockImageSrc = nextLockImage.getAttribute('src') || '';

    }


    if (ui.conflict) {

      for (const child of surface.children) child.inert = !child.classList.contains('phone-dialog-backdrop');

      root.querySelector('[data-action="conflict-continue"]').focus({ preventScroll: true });

    }

    clock.refresh();

    resizeDraft();

    const draft = root.querySelector('#sms-draft');

    if (selection && draft?.value === selection.text) draft.setSelectionRange(selection.start, selection.end);

    if (socialSelection) {

      const textarea = root.querySelector(`[data-social-comment-form="${CSS.escape(socialSelection.postId)}"] textarea`);

      if (textarea?.value === socialSelection.text) {

        textarea.setSelectionRange(socialSelection.start, socialSelection.end);

        textarea.focus({ preventScroll: true });

      }

    }

    if (promptSearchSelection) {

      const searchInput = root.querySelector('[data-action="search-prompts"]');

      if (searchInput && searchInput.value === promptSearchSelection.text) {

        searchInput.focus({ preventScroll: true });

        searchInput.setSelectionRange(promptSearchSelection.start, promptSearchSelection.end);

      }

    }

    if (presetSearchSelection) {

      const searchInput = root.querySelector('[data-action="search-preset-entries"]');

      if (searchInput && searchInput.value === presetSearchSelection.text) {

        searchInput.focus({ preventScroll: true });

        searchInput.setSelectionRange(presetSearchSelection.start, presetSearchSelection.end);

      }

    }

    if (excludeWorldSearchSelection) {

      const searchInput = root.querySelector('[data-action="search-exclude-world"]');

      if (searchInput && searchInput.value === excludeWorldSearchSelection.text) {

        searchInput.focus({ preventScroll: true });

        searchInput.setSelectionRange(excludeWorldSearchSelection.start, excludeWorldSearchSelection.end);

      }

    }

    if (mapSearchSelection) {

      const searchInput = root.querySelector('[data-action="search-map-places"]');

      if (searchInput && searchInput.value === mapSearchSelection.text) {

        searchInput.focus({ preventScroll: true });

        searchInput.setSelectionRange(mapSearchSelection.start, mapSearchSelection.end);

      }

    }

    if (foodieSearchSelection) {

      const searchInput = root.querySelector('#foodie-db-search-input');

      if (searchInput && searchInput.value === foodieSearchSelection.text) {

        searchInput.focus({ preventScroll: true });

        searchInput.setSelectionRange(foodieSearchSelection.start, foodieSearchSelection.end);

      }

    }

    chatScroll.attach();

    if (settingsScroll !== undefined && ui.view === 'settings') {

      const viewEl = root.querySelector('.view-settings');

      if (viewEl) viewEl.scrollTop = settingsScroll;

    }

    if (promptCardsScroll !== undefined) {

      const listEl = root.querySelector('.prompt-cards-list');

      if (listEl) listEl.scrollTop = promptCardsScroll;

    }

    if (socialScroll !== undefined && ['social', 'social-profile'].includes(ui.view)) root.querySelector('.phone-main').scrollTop = socialScroll;

    if (calendarScroll !== undefined && ['calendar', 'todos'].includes(ui.view)) {

      ui.calendarScroll = calendarScroll;

      root.querySelector('.phone-main').scrollTop = calendarScroll;

    }

    if (originScroll !== undefined && ui.view === 'origin') {

      const mainEl = root.querySelector('.phone-main');

      if (mainEl) mainEl.scrollTop = originScroll;

    }
    if (foodieScroll !== undefined && ui.view === 'foodie') {
      const mainEl = root.querySelector('.phone-main');
      if (mainEl) mainEl.scrollTop = foodieScroll;
    }

    if (ui.pinnedPromptId) {

      const card = root.querySelector(`[data-prompt-id="${CSS.escape(ui.pinnedPromptId)}"]`);

      if (card) {

        card.scrollIntoView({ block: 'nearest', inline: 'nearest' });

      }

    }

    const pinnedPromptId = ui.pinnedPromptId;

    const targetSettingsScroll = settingsScroll;

    const targetPromptCardsScroll = promptCardsScroll;

    if (!busy.has('prompt-save') && !busy.has('prompt-reset') && !Array.from(busy).some(b => typeof b === 'string' && b.startsWith('origin-'))) {

      delete ui.pinnedPromptId;

      delete ui.savedSettingsScroll;

      delete ui.savedPromptCardsScroll;

      delete ui.savedOriginScroll;

    }

    if (typeof requestAnimationFrame === 'function') {

      requestAnimationFrame(() => {

        if (targetSettingsScroll !== undefined && ui.view === 'settings') {

          const viewEl = root.querySelector('.view-settings');

          if (viewEl && Math.abs(viewEl.scrollTop - targetSettingsScroll) > 1) {

            viewEl.scrollTop = targetSettingsScroll;

          }

        }

        if (targetPromptCardsScroll !== undefined) {

          const listEl = root.querySelector('.prompt-cards-list');

          if (listEl && Math.abs(listEl.scrollTop - targetPromptCardsScroll) > 1) {

            listEl.scrollTop = targetPromptCardsScroll;

          }

        }

        if (originScroll !== undefined && ui.view === 'origin') {

          const mainEl = root.querySelector('.phone-main');

          if (mainEl && Math.abs(mainEl.scrollTop - originScroll) > 1) {

            mainEl.scrollTop = originScroll;

          }

        }

        if (pinnedPromptId) {

          const card = root.querySelector(`[data-prompt-id="${CSS.escape(pinnedPromptId)}"]`);

          if (card) {

            card.scrollIntoView({ block: 'nearest', inline: 'nearest' });

          }

        }

      });

    }

    if (bottom) {

      const feed = root.querySelector('.message-feed');

      if (feed) feed.scrollTop = feed.scrollHeight;

    } else if (scrollTop !== undefined) root.querySelector('.message-feed').scrollTop = scrollTop;

    syncParticles();

    avatarCropper?.attach();

  }

  async function perform(key, task, after) {

    if (busy.has(key)) return;

    busy.add(key);

    ui.feedback = null;

    render({ bottom: key.startsWith('continue:') || key.startsWith('game:') });

    try { const result = await task(); notifyCompletion(key); after?.(result); }

    catch (error) {

      if (error?.code === MEMORY_CONFLICT_CODE) {

        const content = doc.createElement('p'); content.textContent = error.message;

        void dialog.custom({ title: '记忆插件冲突', content, confirmText: '知道了', submit: () => true });

      } else ui.feedback = { error: true, text: error?.message || '操作未完成，请重试。' };

    }

    finally {

      if (!element.hidden && inChat() && control.isEnabled()) {

        try { await store.markRead(conversationId()); }

        catch { ui.feedback = { error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }; }

      }

      busy.delete(key); render({ bottom: inChat() && (key === 'profile' || key === 'group-profile' || key.startsWith('send:') || key.startsWith('continue:') || key.startsWith('game:')) });

    }

  }

  async function recoverImages(paths) {

    if (!paths.length || !images?.recoverMissing || !control.isEnabled()) return [];

    try {

      const missing = await images.recoverMissing(paths);

      if (missing.length) {

        if (ui.photo && missing.includes(imagePath(ui.photo.path))) ui.photo = null;

        render();

      }

      return missing;

    } catch (error) {

      ui.feedback = { error: true, text: error.message || '图片状态未能保存，请检查酒馆连接。' };

      // 失败只更新提示，避免重挂同一张破图再次触发error。

      const feedback = surface.querySelector('.feedback');

      if (feedback) feedback.outerHTML = renderFeedback(ui.feedback);

      else surface.insertAdjacentHTML('beforeend', renderFeedback(ui.feedback));

      return null;

    }

  }

  const defaultAvatarError = '默认头像未能保存，请检查酒馆连接后重新打开手机。';

  function fillDefaultAvatars() {

    if (!control.isEnabled()) return;

    if (ui.feedback?.text === defaultAvatarError) { ui.feedback = null; surface.querySelector('.feedback')?.remove(); }

    void store.fillMissingAvatars().catch(() => {

      ui.feedback = { error: true, text: defaultAvatarError };

      const feedback = surface.querySelector('.feedback');

      if (feedback) feedback.outerHTML = renderFeedback(ui.feedback);

      else surface.insertAdjacentHTML('beforeend', renderFeedback(ui.feedback));

    });

  }

  function recoverVisibleImages() {

    // 只在打开页面时核对本页图片，捕捉图库删除后仍被浏览器缓存的旧图。

    void recoverImages([...root.querySelectorAll('img[data-phone-image]')].map(image => image.dataset.phoneImage));

  }

  function imageError(event) {

    if (event.target.matches?.('img[data-phone-image]')) void recoverImages([event.target.dataset.phoneImage]);

  }

  async function viewPhoto(readImage) {

    const image = readImage();

    if (!image?.path) return;

    if (await recoverImages([image.path]) === null) return;

    const current = readImage();

    if (current?.path) { ui.photo = current; render(); }

  }

  function close() {

    if (!['home', 'delete-confirm'].includes(ui.view)) ui.lastOpenView = ui.view;

    if (['calendar', 'todos'].includes(ui.view)) ui.calendarScroll = root.querySelector('.phone-main')?.scrollTop || 0;

    avatarCropper?.close();

    dismissMenus();

    dismissPhoneNotice();

    windowControls.stop();

    chatScroll.stop();

    element.hidden = true;

    clock.stop();

    particles?.dispose();

    particles = null;

    onClose?.();

  }

  function isFrontmost() {

    if (element.hidden) return false;

    for (let next = element.nextElementSibling; next; next = next.nextElementSibling) {

      if (next.matches('.pocket-phone:not([hidden])')) return false;

    }

    return true;

  }

  function resetChatTransientUi() {

    ui.reactionMoreMessageId = '';

    ui.thoughtMessageId = '';

    ui.editingMessageId = '';

    ui.editingMessageDraft = undefined;

    ui.multiSelectMode = false;

    ui.selectedMessageIds = new Set();

    ui.multiSelectAnchorId = '';

    ui.forwardMessageIds = [];

    ui.forwardTargetId = '';

    ui.forwardNote = '';

    ui.favoritesOpen = false;

  }

  function sendPoke(targetId, targetName) {

    if (!inChat()) return;

    const id = conversationId();

    const state = store.read();

    if (ui.view === 'group-chat') {

      const group = state.groups?.find(g => g.id === id);

      if (!group || !group.userIsMember) return;

    }

    const user = state.userProfile || { name: ui.defaultUser || '我' };

    const actorName = displayName(user) || '你';

    const service = ui.view === 'group-chat' ? groups : messages;

    const draft = {

      type: 'poke',

      poke: {

        actorId: '@user',

        actorName,

        targetId: targetId || id,

        targetName: targetName || '对方',

        suffix: '的头像',

      },

    };

    void perform(`send:${id}`, () => service.sendCard(id, draft), () => {

      ui.selectedMessage = '';

      ui.reactionMoreMessageId = '';

      ui.chatMenu = false;

      onContextChange();

    });

  }

  function showPage(view, { bottom = false } = {}) {

    if (ui.view === 'social' && view !== 'social') ui.socialScroll = root.querySelector('.view-social')?.scrollTop || 0;

    if (['calendar', 'todos'].includes(ui.view) && !['calendar', 'todos'].includes(view)) ui.calendarScroll = root.querySelector('.phone-main')?.scrollTop || 0;

    if (ui.view === 'origin' && view !== 'origin') ui.originScroll = root.querySelector('.phone-main')?.scrollTop || 0;

    dismissMenus();

    if (!['chat', 'group-chat'].includes(view)) {

      ui.replyToId = '';

      resetChatTransientUi();

    }

    ui.view = view;

    ui.feedback = null;

    ui.confirmClear = false;

    ui.attachment = '';

    ui.photo = null;

    render({ bottom });

    recoverVisibleImages();

    if (view === 'social') root.querySelector('.view-social').scrollTop = ui.socialScroll;

    if (['calendar', 'todos'].includes(view) && ui.calendarScroll) root.querySelector('.phone-main').scrollTop = ui.calendarScroll;

    if (view === 'origin' && ui.originScroll) root.querySelector('.phone-main').scrollTop = ui.originScroll;

    readVisibleSocialReplies();

  }

  function openConversation(id, isGroup = false) {

    if (isGroup) { ui.groupId = id; ui.view = 'group-chat'; }

    else { ui.contactId = id; ui.view = 'chat'; }

    ui.chatMenu = false; ui.inboxMenu = false; ui.confirmClear = false; ui.selectedMessage = ''; ui.visibleMessages = 60; ui.historyOpen = false; ui.visibleHistory = 60; ui.feedback = null;

    ui.attachment = ''; ui.attachmentDraft = {}; ui.replyToId = '';

    resetChatTransientUi();

    render({ bottom: true });

    recoverVisibleImages();

    void store.markRead(id).catch(() => { ui.feedback = { error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }; render(); });

  }

  function openSocialReply(postId) {

    const state = store.read(), post = state.social?.posts.find(item => item.id === postId);

    if (!post) return;

    ui.socialAuthorId = post.authorId;

    ui.socialLimit = Math.max(ui.socialLimit, readSocialPosts(state, { authorId: post.authorId }).findIndex(item => item.id === postId) + 1);

    showPage('social-profile');

    const article = root.querySelector(`.social-post[data-social-post="${CSS.escape(postId)}"]`), main = root.querySelector('.view-social-profile');

    const anchor = article?.querySelector('.social-comments') || article;

    if (anchor && main) main.scrollTop += anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - 8;

    readVisibleSocialReplies();

  }

  // 返回先收起当前聊天的清空确认，再按页面父级走，不另存应用历史栈。

  function goBack() {

    if (inChat() && ui.confirmClear) { ui.confirmClear = false; render(); return; }

    if (ui.view === 'origin' && ui.originShowSettings) { ui.originShowSettings = false; render(); return; }

    let parent = 'desktop';

    switch (ui.view) {

      case 'chat':

      case 'group-chat': parent = 'inbox'; break;

      case 'post': parent = 'forum'; break;

      case 'social-profile': parent = 'social'; break;

      case 'contact-profile':

        parent = ui.editId ? 'chat' : 'inbox';

        ui.profileDraft = {};

        break;

      case 'group-profile':

        parent = ui.groupEditId ? 'group-chat' : 'inbox';

        ui.groupDraft = {};

        break;

      case 'user-profile':

        ui.profileDraft = {};

        parent = 'settings';

        break;

      case 'authoring': parent = 'settings'; break;

      case 'delete-confirm':

        parent = ui.deletion.from;

        ui.deletion = null;

        break;

    }

    showPage(parent, { bottom: ['chat', 'group-chat'].includes(parent) });

  }

  function editGroup(id = '') {

    const group = store.read().groups?.find(item => item.id === id);

    ui.groupEditId = id; ui.groupDraft = { name: group?.name || '', avatar: group?.avatar || '', background: group?.background || '', memberIds: [...(group?.memberIds || [])], userIsMember: group?.userIsMember ?? true };

    ui.groupMembersOpen = !id;

    ui.view = 'group-profile'; ui.chatMenu = false; ui.inboxMenu = false; ui.feedback = null; render();

  }

  function closeModels() {

    ui.modelsOpen = false;

    root.querySelector('.model-popup')?.remove();

    root.querySelector('[data-action="models-menu"]')?.setAttribute('aria-expanded', 'false');

  }

  function dismissMenus(event) {

    if (event) {

      const path = event.composedPath();

      for (const form of root.querySelectorAll('.social-comment-form')) {

        const postId = form.dataset.socialCommentForm;

        if (path.includes(form) || path.some(node => node.dataset?.action === 'social-comment-toggle' && node.dataset.socialPost === postId)) continue;

        const input = form.querySelector('textarea');

        if (root.activeElement === input) input.blur();

        if (input.value.trim()) continue;

        ui.socialCommentOpen.delete(postId);

        ui.socialDrafts.delete(postId);

        form.remove();

        root.querySelector(`[data-action="social-comment-toggle"][data-social-post="${CSS.escape(postId)}"]`)?.setAttribute('aria-expanded', 'false');

      }

    }

    if (ui.attachment && event && !event.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.attachment-panel, .attachment-button'))) {

      ui.attachment = ''; root.querySelector('.attachment-panel')?.remove();

    }

    if (ui.openScopeEntryId && event && !event.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.preset-scope-wrap'))) {

      ui.openScopeEntryId = null;

      render();

    }

    if (ui.modelsOpen && !event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.model-picker'))) closeModels();

    if (!ui.chatMenu && !ui.inboxMenu && !ui.selectedMessage) return;

    if (event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.chat-options, .inbox-options, .bubble, .message-actions, .message-reaction-bar'))) return;

    ui.chatMenu = false; ui.inboxMenu = false; ui.selectedMessage = ''; ui.reactionMoreMessageId = '';

    // 仅移除弹出操作，保留输入节点和焦点，让下一次点击直接开始打字。

    root.querySelectorAll('.chat-menu, .message-actions, .message-reaction-bar').forEach(node => node.remove());

    root.querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'));

    root.querySelectorAll('.bubble[aria-expanded="true"]').forEach(node => node.setAttribute('aria-expanded', 'false'));

  }

  function editProfile(kind, id = '') {

    ui.editor = kind; ui.editId = id;

    const state = store.read();

    const person = kind === 'user' ? state.userProfile || { name: defaultUser, avatar: ui.defaultUserAvatar || '' } : state.contacts.find(item => item.id === id) || {};

    ui.profileDraft = Object.fromEntries(['name', 'nickname', 'avatar', ...(kind === 'contact' ? ['expression', 'language', 'background'] : [])].map(key => [key, person[key] || '']));

    ui.view = `${kind}-profile`; ui.chatMenu = false; ui.inboxMenu = false; ui.feedback = null; render();

  }

  function addWiPattern() {

    const pat = (ui.wiPatternDraft || '').trim();

    if (!pat) return;

    const current = readBaiBaiExcludeSettings(() => host?.readSettings?.());

    if (!current.excludedWorldInfoPatterns.includes(pat)) {

      const nextList = [...current.excludedWorldInfoPatterns, pat];

      void perform('world-excludes', async () => {

        saveBaiBaiExcludeSettings(host?.readSettings?.(), { excludedWorldInfoPatterns: nextList });

        host?.saveSettings?.();

        ui.wiPatternDraft = '';

      });

    } else {

      ui.wiPatternDraft = '';

      render();

    }

  }



  let draggedPresetEntryId = null;



  function onPresetDragStart(event) {

    const card = event.target.closest?.('.preset-item-card');

    if (!card) return;

    if (event.target.closest?.('input, textarea, select, button, .preset-scope-dropdown, .preset-content-editor')) {

      return;

    }

    const entryId = card.dataset.entryId;

    if (!entryId) return;

    draggedPresetEntryId = entryId;

    if (event.dataTransfer) {

      event.dataTransfer.effectAllowed = 'move';

      event.dataTransfer.setData('text/plain', entryId);

    }

    setTimeout(() => {

      card.classList.add('is-dragging');

    }, 0);

  }



  function onPresetDragOver(event) {

    if (!draggedPresetEntryId) return;

    const card = event.target.closest?.('.preset-item-card');

    if (!card) return;

    event.preventDefault();

    if (event.dataTransfer) {

      event.dataTransfer.dropEffect = 'move';

    }

    if (card.dataset.entryId === draggedPresetEntryId) {

      card.classList.remove('drag-over-top', 'drag-over-bottom');

      return;

    }

    const rect = card.getBoundingClientRect();

    const isTop = event.clientY < rect.top + rect.height / 2;

    card.classList.toggle('drag-over-top', isTop);

    card.classList.toggle('drag-over-bottom', !isTop);

  }



  function onPresetDragLeave(event) {

    const card = event.target.closest?.('.preset-item-card');

    if (!card) return;

    const related = event.relatedTarget;

    if (related && card.contains(related)) return;

    card.classList.remove('drag-over-top', 'drag-over-bottom');

  }



  function onPresetDrop(event) {

    if (!draggedPresetEntryId) return;

    const card = event.target.closest?.('.preset-item-card');

    if (!card) return;

    event.preventDefault();



    const targetEntryId = card.dataset.entryId;

    const isTop = card.classList.contains('drag-over-top');

    card.classList.remove('drag-over-top', 'drag-over-bottom');



    const sourceId = draggedPresetEntryId;

    draggedPresetEntryId = null;



    if (!targetEntryId || sourceId === targetEntryId) return;

    const currentActiveId = store.read()?.activePresetId || 'default_preset';

    void store.reorderPresetEntries(currentActiveId, sourceId, targetEntryId, isTop).then(() => render());

  }



  function onPresetDragEnd() {

    draggedPresetEntryId = null;

    root.querySelectorAll('.preset-item-card.is-dragging').forEach(el => el.classList.remove('is-dragging'));

    root.querySelectorAll('.preset-item-card.drag-over-top').forEach(el => el.classList.remove('drag-over-top'));

    root.querySelectorAll('.preset-item-card.drag-over-bottom').forEach(el => el.classList.remove('drag-over-bottom'));

  }



  let touchDragState = null;

  let touchAutoScrollRaf = null;

  let touchFloatingPill = null;



  function cleanupTouchDrag() {

    if (touchAutoScrollRaf) {

      cancelAnimationFrame(touchAutoScrollRaf);

      touchAutoScrollRaf = null;

    }

    if (touchFloatingPill) {

      touchFloatingPill.remove();

      touchFloatingPill = null;

    }

    if (touchDragState?.handle) {

      try {

        if (touchDragState.handle.hasPointerCapture?.(touchDragState.pointerId)) {

          touchDragState.handle.releasePointerCapture(touchDragState.pointerId);

        }

      } catch {}

    }

    doc.removeEventListener('pointermove', onPresetPointerMove);

    doc.removeEventListener('pointerup', onPresetPointerUp);

    doc.removeEventListener('pointercancel', onPresetPointerCancel);



    touchDragState = null;

    root.querySelectorAll('.preset-item-card.is-dragging, .preset-item-card.is-touch-dragging')

      .forEach(el => el.classList.remove('is-dragging', 'is-touch-dragging'));

    root.querySelectorAll('.preset-item-card.drag-over-top, .preset-item-card.drag-over-bottom')

      .forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));

  }



  function findTargetPresetCard(clientX, clientY) {

    const el = root.elementFromPoint?.(clientX, clientY) || doc.elementFromPoint?.(clientX, clientY);

    const directCard = el?.closest?.('.preset-item-card');

    if (directCard) return directCard;



    const cards = [...root.querySelectorAll('.preset-item-card')];

    if (!cards.length) return null;



    let closestCard = null;

    let minDistance = Infinity;



    for (const c of cards) {

      const r = c.getBoundingClientRect();

      if (clientY >= r.top && clientY <= r.bottom) {

        return c;

      }

      const dist = Math.min(Math.abs(clientY - r.top), Math.abs(clientY - r.bottom));

      if (dist < minDistance) {

        minDistance = dist;

        closestCard = c;

      }

    }



    return closestCard;

  }



  function startTouchAutoScroll() {

    if (touchAutoScrollRaf) return;

    const scrollContainer = root.querySelector('.phone-main');

    if (!scrollContainer) return;



    function step() {

      if (!touchDragState || !touchDragState.isDragging) {

        touchAutoScrollRaf = null;

        return;

      }

      const containerRect = scrollContainer.getBoundingClientRect();

      const edgeZone = 45;

      const y = touchDragState.currentY;



      if (y < containerRect.top + edgeZone && y > containerRect.top - 30) {

        const ratio = 1 - Math.max(0, (y - containerRect.top) / edgeZone);

        scrollContainer.scrollTop -= Math.round(3 + ratio * 10);

      } else if (y > containerRect.bottom - edgeZone && y < containerRect.bottom + 30) {

        const ratio = Math.min(1, (y - (containerRect.bottom - edgeZone)) / edgeZone);

        scrollContainer.scrollTop += Math.round(3 + ratio * 10);

      }

      touchAutoScrollRaf = requestAnimationFrame(step);

    }

    touchAutoScrollRaf = requestAnimationFrame(step);

  }



  function onPresetPointerDown(event) {

    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;



    const handle = event.target.closest?.('.preset-drag-handle');

    if (!handle) return;



    const card = handle.closest?.('.preset-item-card');

    if (!card) return;



    const entryId = card.dataset.entryId;

    if (!entryId) return;



    event.preventDefault();



    touchDragState = {

      pointerId: event.pointerId,

      handle,

      card,

      sourceId: entryId,

      startX: event.clientX,

      startY: event.clientY,

      currentY: event.clientY,

      isDragging: false,

      targetEntryId: null,

      isTop: true,

    };



    try {

      handle.setPointerCapture?.(event.pointerId);

    } catch {}



    doc.addEventListener('pointermove', onPresetPointerMove, { passive: false });

    doc.addEventListener('pointerup', onPresetPointerUp);

    doc.addEventListener('pointercancel', onPresetPointerCancel);

  }



  function onPresetPointerMove(event) {

    if (!touchDragState || touchDragState.pointerId !== event.pointerId) return;



    const dx = event.clientX - touchDragState.startX;

    const dy = event.clientY - touchDragState.startY;



    if (!touchDragState.isDragging) {

      if (Math.hypot(dx, dy) < 5) return;

      touchDragState.isDragging = true;

      touchDragState.card.classList.add('is-dragging', 'is-touch-dragging');



      if (!touchFloatingPill) {

        touchFloatingPill = doc.createElement('div');

        touchFloatingPill.className = 'preset-drag-floating-pill';

        const name = touchDragState.card.querySelector('.preset-item-name')?.textContent?.trim() || '预设条目';

        touchFloatingPill.textContent = `↕ ${name}`;

        surface.append(touchFloatingPill);

      }



      startTouchAutoScroll();

    }



    event.preventDefault();

    touchDragState.currentY = event.clientY;



    if (touchFloatingPill) {

      touchFloatingPill.style.left = `${event.clientX}px`;

      touchFloatingPill.style.top = `${event.clientY}px`;

    }



    const targetCard = findTargetPresetCard(event.clientX, event.clientY);



    root.querySelectorAll('.preset-item-card.drag-over-top, .preset-item-card.drag-over-bottom').forEach(el => {

      if (el !== targetCard) el.classList.remove('drag-over-top', 'drag-over-bottom');

    });



    if (targetCard && targetCard.dataset.entryId !== touchDragState.sourceId) {

      const rect = targetCard.getBoundingClientRect();

      const isTop = event.clientY < rect.top + rect.height / 2;

      targetCard.classList.toggle('drag-over-top', isTop);

      targetCard.classList.toggle('drag-over-bottom', !isTop);

      touchDragState.targetEntryId = targetCard.dataset.entryId;

      touchDragState.isTop = isTop;

    } else {

      if (targetCard) {

        targetCard.classList.remove('drag-over-top', 'drag-over-bottom');

      }

      touchDragState.targetEntryId = null;

    }

  }



  function onPresetPointerUp(event) {

    if (!touchDragState || touchDragState.pointerId !== event.pointerId) return;



    const state = touchDragState;

    const wasDragging = state.isDragging;

    const sourceId = state.sourceId;

    const targetEntryId = state.targetEntryId;

    const isTop = state.isTop;



    cleanupTouchDrag();



    if (wasDragging && targetEntryId && targetEntryId !== sourceId) {

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      void store.reorderPresetEntries(currentActiveId, sourceId, targetEntryId, isTop).then(() => render());

    }

  }



  function onPresetPointerCancel(event) {

    if (!touchDragState || touchDragState.pointerId !== event.pointerId) return;

    cleanupTouchDrag();

  }



  function keydown(event) {
    if (event.key === 'Enter' && event.target.id === 'foodie-new-dish-input') {
      event.preventDefault();
      const addBtn = event.target.nextElementSibling;
      if (addBtn) addBtn.click();
      return;
    }

    if (ui.conflict) {
      event.stopPropagation();

      if (event.key === 'Escape' && !busy.has('conflict')) { ui.conflict = false; render(); }

      if (event.key === 'Tab') {

        const buttons = [...root.querySelectorAll('.phone-dialog button:not(:disabled)')], index = buttons.indexOf(root.activeElement);

        event.preventDefault();

        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();

      }

      return;

    }

    const modelOption = event.target.closest('[data-model]');

    if (ui.modelsOpen && (modelOption || event.target.id === 'model-search')) {

      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeModels(); root.querySelector('[data-action="models-menu"]')?.focus(); return; }

      const options = [...root.querySelectorAll('[data-model]')];

      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {

        event.preventDefault(); event.stopPropagation();

        const index = options.indexOf(modelOption), offset = event.key === 'ArrowDown' ? 1 : -1;

        const next = modelOption ? (index + offset + options.length) % options.length : offset > 0 ? 0 : options.length - 1;

        options[next]?.focus(); return;

      }

      if (event.target.id === 'model-search' && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); options[0]?.click(); return; }

      if (modelOption && ['Enter', ' '].includes(event.key)) event.stopPropagation();

    }

    if (event.target.matches('[data-action="draft-wi-pattern"]') && event.key === 'Enter') {

      event.preventDefault();

      event.stopPropagation();

      addWiPattern();

      return;

    }

    if (event.key === 'Escape') {

      event.stopPropagation();

      if (ui.calendarWeatherModalOpen) { ui.calendarWeatherModalOpen = false; render(); }

      else if (ui.excludeWorldModalOpen) { ui.excludeWorldModalOpen = false; ui.excludeWorldSearch = ''; render(); }

      else if (ui.photo) { ui.photo = null; render(); }

      else if (ui.notice) dismissPhoneNotice();

      else close();

    } else if (event.target.matches('input, textarea, select') || event.target.isContentEditable) {

      // Shadow 外只能看到宿主节点的焦点，须在根内阻止编辑键触发酒馆快捷键。

      event.stopPropagation();

    }

  }

  const FOODIE_ROLE_META = [
    { role: 'hot', name: '主菜' },
    { role: 'staple', name: '主食' },
    { role: 'soup', name: '羹汤' },
    { role: 'drink', name: '饮品' },
    { role: 'cold', name: '凉菜' },
    { role: 'dessert', name: '点心' },
  ];

  function collectFoodieCategoriesFromDom(container, extraDishes = [], extraRole = 'hot') {
    const categories = FOODIE_ROLE_META.map(meta => {
      const domBox = container.querySelector(`.role-dish-chips-box[data-role-pane="${meta.role}"]`);
      let items = [];
      if (domBox) {
        items = Array.from(domBox.querySelectorAll('.role-dish-tag'))
          .map(t => t.dataset.dishName || t.querySelector('.dish-name-text')?.textContent?.trim() || '')
          .filter(Boolean);
      } else {
        const el = container.querySelector(`#edit-db-${meta.role}`);
        if (el) {
          items = String(el.value || '').split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
        }
      }
      if (meta.role === extraRole && Array.isArray(extraDishes) && extraDishes.length) {
        for (const d of extraDishes) {
          if (d && !items.includes(d)) items.push(d);
        }
      }
      return { name: meta.name, role: meta.role, items };
    }).filter(c => c.items.length > 0);
    return { categories, items: categories.flatMap(c => c.items) };
  }

  function updateFoodieEditStatsDom(container, categories, isCustomDb, templateStr) {
    const counts = { hot: 0, staple: 0, soup: 0, drink: 0, cold: 0, dessert: 0 };
    const lists = { hot: [], staple: [], soup: [], drink: [], cold: [], dessert: [] };
    for (const cat of (categories || [])) {
      const r = counts[cat.role] !== undefined ? cat.role : 'hot';
      const arr = Array.isArray(cat.items) ? cat.items : [];
      counts[r] += arr.length;
      lists[r].push(...arr);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const originChip = container.querySelector('.selected-db-toolbar .db-origin-chip');
    if (originChip) {
      originChip.textContent = `${isCustomDb ? '自建' : '内置'} · ${total} 道`;
    }
    const totalPill = container.querySelector('#foodie-total-dishes-badge, .drawer-summary-pill');
    if (totalPill) {
      totalPill.textContent = `${total} 道菜品`;
    }
    for (const meta of FOODIE_ROLE_META) {
      const statB = container.querySelector(`.db-role-stats-row .role-stat-chip.${meta.role} b`);
      if (statB) statB.textContent = String(counts[meta.role]);
      const tabNum = container.querySelector(`.role-count-num[data-role-count="${meta.role}"]`);
      if (tabNum) tabNum.textContent = `(${counts[meta.role]})`;
    }
    const countBadge = container.querySelector('.role-count-badge');
    const activeRole = ui.foodieActiveRoleTab || 'hot';
    if (countBadge) {
      countBadge.textContent = `(${counts[activeRole] ?? 0})`;
    }
    const previewCode = container.querySelector('.db-prompt-preview-line .preview-code');
    if (previewCode) {
      const tmpl = templateStr || DEFAULT_FOODIE_TEMPLATE;
      const sampleFoods = [
        lists.hot[0] || '招牌主菜',
        lists.staple[0] || lists.soup[0] || '精选主食'
      ].join('、');
      previewCode.textContent = tmpl.includes('{{food}}') ? tmpl.replace(/\{\{food\}\}/g, sampleFoods) : `[食物线索：${sampleFoods}]`;
    }
  }

  async function syncFoodieFormDraft(containerRoot) {
    if (!containerRoot || ui.foodieSettingsTab !== 'edit') return;
    try {
      const container = containerRoot.querySelector?.('.foodie-view') || containerRoot;
      if (!container) return;
      const dbId = ui.foodieSelectedDbId;
      if (!dbId) return;
      const labelInput = container.querySelector('#edit-db-label');
      const kwInput = container.querySelector('#edit-db-keywords');
      if (!labelInput && !kwInput) return;

      const state = store.read();
      const isCustom = dbId.startsWith('custom:');
      const customs = { ...(state.foodie?.customDatabases || {}) };
      const modified = { ...(state.foodie?.modifiedBuiltins || {}) };
      const effectiveDb = getEffectiveDatabases(state).find(d => d.id === dbId);
      const baseDb = isCustom ? customs[dbId] : (modified[dbId] || effectiveDb);
      if (!baseDb) return;

      const label = labelInput ? (labelInput.value.trim() || baseDb.label) : baseDb.label;
      const keywords = kwInput
        ? kwInput.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
        : (baseDb.keywords || []);

      if (!isCustom) {
        const origKw = baseDb.keywords || baseDb.tags || [];
        const labelUnchanged = label === (baseDb.label || '');
        const kwUnchanged = JSON.stringify(keywords) === JSON.stringify(origKw);
        if (labelUnchanged && kwUnchanged && !modified[dbId]) {
          return;
        }
      }

      const mapInput = container.querySelector('#edit-db-map');
      const mapLocs = mapInput ? mapInput.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : (baseDb.mapLocations || []);

      const calSlotsInput = container.querySelector('#edit-db-cal-slots');
      const calSlots = calSlotsInput ? calSlotsInput.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : (baseDb.calendarSlots || []);

      const weatherInput = container.querySelector('#edit-db-weather');
      const weatherConditions = weatherInput ? weatherInput.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : (baseDb.weatherConditions || []);

      const festivalsInput = container.querySelector('#edit-db-cal-festivals');
      const calFestivals = festivalsInput ? festivalsInput.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : (baseDb.calendarFestivals || []);
      const calendarSeasons = festivalsInput ? calFestivals.filter(f => /春季|夏季|秋季|冬季/.test(f)) : (baseDb.calendarSeasons || []);

      let nextCategories = baseDb.categories;
      let nextItems = baseDb.items;
      if (container.querySelector('.role-dish-chips-box')) {
        const collected = collectFoodieCategoriesFromDom(container);
        // 内置库保留尚未单独改动分类的数据（仅当列表或结构明确修改过、或自建库时覆盖）
        if (isCustom || modified[dbId]?.categories) {
          nextCategories = collected.categories;
          nextItems = collected.items;
        }
      }

      const updatedFields = {
        label,
        keywords,
        tags: keywords,
        mapLocations: mapLocs,
        calendarSlots: calSlots,
        weatherConditions,
        calendarSeasons,
        calendarFestivals: calFestivals,
        ...(nextCategories !== undefined ? { categories: nextCategories } : {}),
        ...(nextItems !== undefined ? { items: nextItems } : {}),
      };

      if (isCustom) {
        customs[dbId] = { ...customs[dbId], ...updatedFields };
        await store.setFoodieState({ customDatabases: customs });
      } else {
        modified[dbId] = { ...(modified[dbId] || {}), id: dbId, ...updatedFields };
        await store.setFoodieState({ modifiedBuiltins: modified });
      }
    } catch (err) {
      console.warn('[foodie] sync draft failed:', err);
    }
  }

  async function click(event) {

    if (ui.conflict) {

      const button = event.target.closest('button');

      if (!button || button.disabled) return;

      if (button.dataset.action === 'conflict-continue') { ui.conflict = false; ui.feedback = null; render(); }

      if (button.dataset.action === 'conflict-disable') void perform('conflict', () => control.setEnabled(false), () => { ui.conflict = false; ui.view = 'settings'; entries.refreshVisibility?.(); onContextChange(); });

      return;

    }

    if (event.target.matches('.photo-viewer')) { ui.photo = null; render(); return; }

    if (event.target.matches('.calendar-modal-backdrop')) { ui.calendarAiOpen = false; ui.calendarWeatherModalOpen = false; render(); return; }

    if (event.target.matches('.origin-modal-backdrop')) { ui.originModal = null; ui.originModalData = null; render(); return; }

    const originJumpNode = event.target.closest('[data-action="origin-jump-app"]');

    if (originJumpNode) {

      ui.view = 'origin';

      ui.originTab = 'tasks';

      render();

      return;

    }

    if (event.target.matches('.chat-modal-backdrop')) {

      ui.editingMessageId = '';

      ui.editingMessageDraft = undefined;

      ui.forwardMessageIds = [];

      ui.forwardTargetId = '';

      ui.forwardNote = '';

      ui.favoritesOpen = false;

      render();

      return;

    }

    const foodieOpenNode = event.target.closest('[data-action="foodie-open-edit-db"]');
    if (foodieOpenNode && !event.target.closest('button, .switch')) {
      const dbId = foodieOpenNode.dataset.dbId;
      if (dbId) {
        ui.foodieSelectedDbId = dbId;
        ui.foodieSettingsTab = 'edit';
        render();
        return;
      }
    }
    const todoOpenNode = event.target.closest('[data-action="open-todo-calendar"]');

    if (todoOpenNode && !event.target.closest('button:not([data-action="open-todo-calendar"]), .todo-form')) {

      const todoId = todoOpenNode.dataset.todoId || todoOpenNode.closest('[data-todo-candidate]')?.dataset.todoCandidate || '';

      ui.calendarOffset = 0;

      ui.calendarDay = null;

      if (todoId) {

        const calMonth = calendar.month(0);

        const matchDay = calMonth?.days?.find(d => d.items?.some(it => it.id === todoId || it.todoId === todoId));

        if (matchDay) ui.calendarDay = matchDay.day;

      }

      showPage('calendar');

      return;

    }

    if (event.target.classList.contains('exclude-world-backdrop') || event.target.dataset.action === 'close-exclude-world-modal') {

      ui.excludeWorldModalOpen = false;

      ui.excludeWorldSearch = '';

      render();

      return;

    }

    const locateReplyNode = event.target.closest('[data-action="locate-reply-message"]');

    if (locateReplyNode) {

      const targetId = locateReplyNode.dataset.targetId;

      if (targetId) {

        let targetRow = root.querySelector(`.message-row[data-message-row-id="${CSS.escape(targetId)}"], [data-message="${CSS.escape(targetId)}"]`)?.closest('.message-row');

        if (!targetRow) {

          const convId = conversationId();

          const allMsgs = store.read()?.conversations?.[convId] || [];

          const exists = allMsgs.some(m => m.id === targetId);

          if (exists) {

            ui.historyOpen = true;

            ui.visibleHistory = Math.max(ui.visibleHistory, allMsgs.length);

            render();

            targetRow = root.querySelector(`.message-row[data-message-row-id="${CSS.escape(targetId)}"], [data-message="${CSS.escape(targetId)}"]`)?.closest('.message-row');

          }

        }

        if (targetRow) {

          targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

          targetRow.classList.remove('is-locate-highlight');

          void targetRow.offsetWidth;

          targetRow.classList.add('is-locate-highlight');

          setTimeout(() => targetRow.classList.remove('is-locate-highlight'), 1800);

        } else {

          ui.feedback = { text: '未能定位到该原消息。' };

          render();

        }

      }

      return;

    }



    // 恶魔轮盘扳机与道具操作响应

    const buckshotActionEl = event.target.closest('[data-buckshot-action]');

    if (buckshotActionEl && ui.activeGame && ui.activeGame.kind === 'buckshot_roulette') {

      const bAction = buckshotActionEl.dataset.buckshotAction;

      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;

      const currentStore = store.read();

      const user = currentStore.userProfile || { name: ui.defaultUser || '我' };

      const userName = displayName(user) || '你';

      const contact = currentStore.contacts?.find(p => p.id === id);

      const contactName = displayName(contact) || '对方';



      if (bAction === 'ai-turn-continue') {

        const targetGameMsgId = ui.activeGameMessageId || (currentStore.conversations[id] || []).find(m => m.type === 'game' && m.game?.status === 'playing')?.id;

        void perform(`continue:${id}`, async () => {

          await service.continueChat(id);

          const latestStore = store.read();

          const updatedMsg = latestStore.conversations?.[id]?.find(m => m.id === targetGameMsgId);

          if (updatedMsg?.game) {

            ui.activeGame = updatedMsg.game.state || updatedMsg.game;

          }

        }, onContextChange);

        return;

      }



      let stepResult = null;

      if (bAction === 'shoot-opponent') {

        stepResult = buckshotShootOpponent(ui.activeGame, { actor: 'user', userName, contactName });

      } else if (bAction === 'shoot-self') {

        stepResult = buckshotShootSelf(ui.activeGame, { actor: 'user', userName, contactName });

      } else if (bAction === 'use-item') {

        const itemKey = buckshotActionEl.dataset.itemKey;

        stepResult = buckshotUseItem(ui.activeGame, { actor: 'user', itemKey, userName, contactName });

      }



      if (stepResult && !stepResult.error && stepResult.game) {

        const nextGame = stepResult.game;

        ui.activeGame = nextGame;

        const targetGameMsgId = ui.activeGameMessageId || (currentStore.conversations[id] || []).find(m => m.type === 'game' && m.game?.status === 'playing')?.id;

        if (targetGameMsgId && !ui.activeGameMessageId) {

          ui.activeGameMessageId = targetGameMsgId;

        }

        const batch = ui.batch;

        const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

        const sysMsg = nextGame.lastAction?.description ? {

          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

          role: 'system',

          type: 'game-action',

          gameKind: nextGame.kind,

          text: nextGame.lastAction.description,

          timeLabel,

          ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

          ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

        } : null;



        const reloadSysMsg = nextGame.reloadedNotice ? {

          id: `${Date.now() + 1}-${Math.random().toString(36).slice(2, 7)}`,

          role: 'system',

          type: 'game-action',

          gameKind: nextGame.kind,

          text: nextGame.reloadedNotice,

          timeLabel,

          ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

          ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

        } : null;

        delete nextGame.reloadedNotice;



        const finishCardMsg = nextGame.status === 'finished' ? {

          id: `${Date.now() + 2}-${Math.random().toString(36).slice(2, 7)}`,

          role: 'system',

          type: 'game',

          game: {

            kind: nextGame.kind,

            title: nextGame.title || '恶魔轮盘',

            status: 'finished',

            winner: nextGame.winner,

            loser: nextGame.loser,

            wager: nextGame.wager || '纯娱乐',

            round: nextGame.round,

            state: nextGame,

          },

          text: `[小游戏：${nextGame.title || '恶魔轮盘'}对决结束，赌注：${nextGame.wager || '纯娱乐'}，胜者：${nextGame.winner === 'user' ? '<user>' : '角色'}]`,

          timeLabel,

          ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

          ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

        } : null;



        void perform(`continue:${id}`, async () => {

          if (targetGameMsgId) {

            await store.updateGameMessage(id, targetGameMsgId, nextGame);

          }

          const msgsToAppend = [sysMsg, reloadSysMsg, finishCardMsg].filter(Boolean);

          if (msgsToAppend.length > 0) {

            await store.appendMessages(id, msgsToAppend);

          }

          // 当轮到 AI 行动，或游戏终局结算时，自动唤醒模型回话对决

          if ((nextGame.status === 'playing' && nextGame.turn === 'ai') || nextGame.status === 'finished') {

            await service.continueChat(id);

            const latestStore = store.read();

            const updatedMsg = latestStore.conversations?.[id]?.find(m => m.id === targetGameMsgId);

            if (updatedMsg?.game) {

              ui.activeGame = updatedMsg.game.state || updatedMsg.game;

            }

          }

        }, onContextChange);

      }

      return;

    }



    // 抽鬼牌卡牌与牌桌操作优先响应（不受普通 button 过滤影响）

    const gameActionEl = event.target.closest('[data-game-action]');

    if (gameActionEl && ui.activeGame) {

      const gAction = gameActionEl.dataset.gameAction;

      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;

      const currentStore = store.read();

      const user = currentStore.userProfile || { name: ui.defaultUser || '我' };

      const userName = displayName(user) || '你';

      const contact = currentStore.contacts?.find(p => p.id === id);

      const contactName = displayName(contact) || '对方';



      if (gAction === 'user-draw') {

        const cardIndex = Number(gameActionEl.dataset.cardIndex);

        const res = userDrawCard(ui.activeGame, cardIndex, { userName, contactName });

        if (!res.error) {

          const nextGame = res.game;

          ui.activeGame = nextGame;

          const targetGameMsgId = ui.activeGameMessageId || (currentStore.conversations[id] || []).find(m => m.type === 'game' && m.game?.status === 'playing')?.id;

          if (targetGameMsgId && !ui.activeGameMessageId) {

            ui.activeGameMessageId = targetGameMsgId;

          }

          const batch = ui.batch;

          const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

          const sysMsg = nextGame.lastAction?.description ? {

            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

            role: 'system',

            type: 'game-action',

            text: nextGame.lastAction.description,

            timeLabel,

            ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

            ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

          } : null;



          void perform(`continue:${id}`, async () => {

            if (targetGameMsgId) {

              await store.updateGameMessage(id, targetGameMsgId, nextGame);

            }

            if (sysMsg) {

              await store.appendMessages(id, [sysMsg]);

            }

            // 用户抽完牌后自动调用 API 让角色出牌并推进对话，无缝交互

            if ((nextGame.status === 'playing' && nextGame.turn === 'ai') || nextGame.status === 'finished') {

              await service.continueChat(id);

              const latestStore = store.read();

              const updatedMsg = latestStore.conversations?.[id]?.find(m => m.id === targetGameMsgId);

              if (updatedMsg?.game) {

                ui.activeGame = updatedMsg.game.state || updatedMsg.game;

              }

            }

          }, onContextChange);

        }

        return;

      }

      if (gAction === 'ai-draw') {

        const res = aiDrawCard(ui.activeGame, undefined, { userName, contactName });

        if (!res.error) {

          ui.activeGame = res.game;

          if (ui.activeGameMessageId) {

            void store.updateGameMessage(id, ui.activeGameMessageId, ui.activeGame);

          }

          render();

          onContextChange();

        }

        return;

      }

      if (gAction === 'toggle-bluff') {

        const cardIndex = Number(gameActionEl.dataset.cardIndex);

        ui.activeGame = setBluffCard(ui.activeGame, cardIndex);

        render();

        return;

      }

      if (gAction === 'urge-wager') {

        const wager = ui.activeGame?.wager || '纯娱乐';

        if (ui.activeGame) {

          ui.activeGame.status = 'finished';

          ui.activeGame.winner = 'user';

          ui.activeGame.loser = 'ai';

          if (ui.activeGameMessageId) {

            store.updateGameMessage(id, ui.activeGameMessageId, ui.activeGame);

          }

        }

        const batch = ui.batch;

        const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

        const sysMsg = {

          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

          role: 'system',

          type: 'game-action',

          text: `【${userName}】提醒【${contactName}】兑现本局约定的赌注【${wager}】。`,

          timeLabel,

          ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

          ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

        };

        ui.activeGame = null;

        ui.activeGameMessageId = '';

        ui.gameBoardFolded = false;

        render();

        onContextChange();

        void perform(`send:${id}`, async () => {

          await store.appendMessages(id, [sysMsg]);

          await service.continueChat(id);

        }, onContextChange);

        return;

      }

      if (gAction === 'admit-defeat') {

        const wager = ui.activeGame?.wager || '纯娱乐';

        if (ui.activeGame) {

          ui.activeGame.status = 'finished';

          ui.activeGame.winner = 'ai';

          ui.activeGame.loser = 'user';

          if (ui.activeGameMessageId) {

            store.updateGameMessage(id, ui.activeGameMessageId, ui.activeGame);

          }

        }

        const batch = ui.batch;

        const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

        const sysMsg = {

          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

          role: 'system',

          type: 'game-action',

          text: `【${userName}】承认落败，等待【${contactName}】提出履行赌注【${wager}】的要求。`,

          timeLabel,

          ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

          ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

        };

        ui.activeGame = null;

        ui.activeGameMessageId = '';

        ui.gameBoardFolded = false;

        render();

        onContextChange();

        void perform(`send:${id}`, async () => {

          await store.appendMessages(id, [sysMsg]);

          await service.continueChat(id);

        }, onContextChange);

        return;

      }

      if (gAction === 'rematch') {

        const gameKind = ui.activeGame?.kind || 'old_maid';

        let newGame;

        let draft;

        if (gameKind === 'buckshot_roulette') {

          newGame = acceptBuckshotGame(createBuckshotInvitation({ sender: 'user', wager: ui.activeGame.wager }));

          draft = {

            type: 'game',

            game: {

              kind: 'buckshot_roulette',

              title: '恶魔轮盘',

              gameId: newGame.id,

              status: newGame.status,

              sender: 'user',

              wager: newGame.wager,

              winner: newGame.winner,

              loser: newGame.loser,

              round: newGame.round,

              turn: newGame.turn,

              state: newGame,

              lastAction: newGame.lastAction,

            }

          };

        } else {

          newGame = acceptOldMaidGame(createOldMaidInvitation({ sender: 'user', wager: ui.activeGame.wager }));

          draft = {

            type: 'game',

            game: {

              kind: 'old_maid',

              title: '抽鬼牌',

              gameId: newGame.id,

              status: newGame.status,

              sender: 'user',

              wager: newGame.wager,

              winner: newGame.winner,

              loser: newGame.loser,

              round: newGame.round,

              turn: newGame.turn,

              state: newGame,

              lastAction: newGame.lastAction,

            }

          };

        }

        void perform(`send:${id}`, async () => {

          await service.sendCard(id, draft);

          const updatedMessages = store.read().conversations[id] || [];

          const savedMsg = [...updatedMessages].reverse().find(m => m.type === 'game' && m.game?.gameId === newGame.id);

          ui.activeGame = newGame;

          ui.activeGameMessageId = savedMsg?.id || '';

          ui.gameBoardFolded = false;

        }, () => {

          onContextChange();

          void service.continueChat(id);

        });

        return;

      }

    }



    // 响应角色发来的邀请（接受或拒绝）

    const gameInviteBtn = event.target.closest('[data-game-invite-id]');

    if (gameInviteBtn) {

      const msgId = gameInviteBtn.dataset.gameInviteId;

      const gInviteAction = gameInviteBtn.dataset.gameInviteAction;

      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;

      const currentStore = store.read();

      const message = currentStore.conversations[id]?.find(m => m.id === msgId);

      if (message?.game) {

        const user = currentStore.userProfile || { name: ui.defaultUser || '我' };

        const userName = displayName(user) || '你';

        const contact = currentStore.contacts?.find(p => p.id === id);

        const contactName = displayName(contact) || '对方';

        const gameKind = message.game?.kind || 'old_maid';

        const gameTitle = gameKind === 'buckshot_roulette' ? '恶魔轮盘' : '抽鬼牌';



        if (gInviteAction === 'accept' || gInviteAction === 'accept-counter') {

          const customWager = gInviteAction === 'accept-counter' ? message.game.wager : undefined;

          let game;

          if (gameKind === 'buckshot_roulette') {

            game = acceptBuckshotGame(message.game.state || message.game, { ...(customWager ? { wager: customWager } : {}), starter: 'random', userName, contactName });

          } else {

            game = acceptOldMaidGame(message.game.state || message.game, { ...(customWager ? { wager: customWager } : {}), starter: 'user', userName, contactName });

          }

          ui.activeGame = game;

          ui.activeGameMessageId = msgId;

          ui.gameBoardFolded = false;

          const batch = ui.batch;

          const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

          const sysMsg = game.lastAction?.description ? {

            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

            role: 'system',

            type: 'game-action',

            text: game.lastAction.description,

            timeLabel,

            ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

            ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

          } : null;

          void perform(`game:${msgId}`, async () => {

            await store.updateGameMessage(id, msgId, game);

            if (sysMsg) {

              await store.appendMessages(id, [sysMsg]);

            }

            if (game.turn === 'ai') {

              await service.continueChat(id);

            }

          }, onContextChange);

        } else if (gInviteAction === 'counter') {

          const currentWager = message.game?.wager || '答应赢家一个要求';

          const newWager = await promptWagerDialog(currentWager);

          if (newWager && newWager !== currentWager) {

            const updatedInvite = {

              ...message.game,

              wager: newWager,

              status: 'countered',

              state: { ...(message.game.state || message.game), wager: newWager, status: 'countered' },

            };

            const batch = ui.batch;

            const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

            const sysMsg = {

              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

              role: 'system',

              type: 'game-action',

              text: `【${userName}】提议将${gameTitle}赌注更换为【${newWager}】`,

              timeLabel,

              ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

              ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

            };

            void perform(`game:${msgId}`, async () => {

              await store.updateGameMessage(id, msgId, updatedInvite);

              await store.appendMessages(id, [sysMsg]);

              await service.continueChat(id);

            }, onContextChange);

          }

        } else if (gInviteAction === 'reject') {

          let game;

          if (gameKind === 'buckshot_roulette') {

            game = rejectBuckshotGame(message.game.state || message.game, { contactName });

          } else {

            game = rejectOldMaidGame(message.game.state || message.game, { contactName });

          }

          const batch = ui.batch;

          const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

          const sysMsg = {

            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

            role: 'system',

            type: 'game-action',

            text: `【${userName}】婉拒了本次${gameTitle}对决邀请。`,

            timeLabel,

            ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

            ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

          };

          render();

          onContextChange();

          void perform(`game:${msgId}`, async () => {

            await store.updateGameMessage(id, msgId, game);

            await store.appendMessages(id, [sysMsg]);

            await service.continueChat(id);

          }, onContextChange);

        }

      }

      return;

    }



    // 打开牌桌

    const openGameBtn = event.target.closest('[data-open-game-id]');

    if (openGameBtn) {

      const msgId = openGameBtn.dataset.openGameId;

      const id = conversationId();

      const message = store.read().conversations[id]?.find(item => item.id === msgId);

      if (message?.game) {

        ui.activeGame = message.game.state || message.game;

        ui.activeGameMessageId = msgId;

        ui.gameBoardFolded = false;

        render();

      }

      return;

    }



    const closeOriginBtn = event.target.closest('button[data-action="origin-close-modal"]');

    const isBackdropClick = event.target.classList?.contains('origin-modal-backdrop');

    if (closeOriginBtn || isBackdropClick) {

      ui.originModal = null;

      ui.originModalData = null;

      render();

      return;

    }



    const button = event.target.closest('button');

    if (!button || button.disabled) return;

    if (button.dataset.wallpaper !== undefined) { const theme = store.read().theme; void perform('wallpaper', () => store.setWallpaper(theme, button.dataset.wallpaper)); return; }

    if (button.dataset.chatBackground !== undefined) {

      const draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;

      draft.background = button.dataset.chatBackground; render(); return;

    }

    if (button.dataset.calendarDay) { ui.calendarDay = Number(button.dataset.calendarDay); render(); return; }

    if (button.dataset.mentionId && ui.view === 'group-chat') {

      const person = store.read().contacts?.find(item => item.id === button.dataset.mentionId), draft = root.querySelector('#sms-draft');

      if (person && draft && !draft.disabled) {

        const mention = `@${displayName(person)} `;

        const start = draft.selectionStart ?? draft.value.length, end = draft.selectionEnd ?? start;

        draft.setRangeText(mention, start, end, 'end');

        draft.focus({ preventScroll: true }); input({ target: draft });

      }

      return;

    }

    const todoContainer = button.closest('[data-todo-candidate], [data-todo-row]');

    if (todoContainer && button.dataset.action?.startsWith('todo-')) {

      const todoId = todoContainer.dataset.todoCandidate || todoContainer.dataset.todoRow;

      if (button.dataset.action === 'todo-edit') {

        if (ui.todoEditing.has(todoId)) ui.todoEditing.delete(todoId); else ui.todoEditing.add(todoId);

        render(); return;

      }

      if (button.dataset.action === 'todo-accept') {

        void perform(`todo:${todoId}`, () => store.confirmTodo(todoId, ui.todoDrafts.get(todoId) || {}), () => { ui.todoEditing.delete(todoId); ui.todoDrafts.delete(todoId); onContextChange(); });

        return;

      }

      if (button.dataset.action === 'todo-done') {

        const todo = store.read().todos?.find(item => item.id === todoId);

        if (todo) void perform(`todo:${todoId}`, () => store.setTodoDone(todoId, todo.status !== 'done'), onContextChange);

        return;

      }

      if (button.dataset.action === 'todo-delete') {

        void perform(`todo:${todoId}`, () => store.deleteTodo(todoId), () => { ui.todoEditing.delete(todoId); ui.todoDrafts.delete(todoId); onContextChange(); });

        return;

      }

    }

    if (button.dataset.inlineEmoji) {

      const emoji = findBlobEmoji(button.dataset.inlineEmoji), draft = root.querySelector('#sms-draft');

      if (emoji && draft && !draft.disabled) {

        draft.setRangeText(emoji.emoji, draft.selectionStart, draft.selectionEnd, 'end');

        input({ target: draft });

      }

      return;

    }

    if (button.dataset.stickerPack) { ui.stickerPack = button.dataset.stickerPack; render(); return; }

    if (button.dataset.sticker) {

      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;

      void perform(`send:${id}`, () => service.sendCard(id, { type: 'sticker', stickerId: button.dataset.sticker }, { replyToId: ui.replyToId }), () => { ui.attachment = ''; ui.replyToId = ''; onContextChange(); }); return;

    }

    if (button.dataset.transferId) {

      const id = conversationId(), batch = ui.batch;

      void perform(`transfer:${button.dataset.transferId}`, () => store.respondTransfer(id, button.dataset.transferId, button.dataset.transferStatus, '@user', batch), onContextChange); return;

    }

    if (button.dataset.model) { ui.apiDraft.model = button.dataset.model; root.querySelector('#api-model').value = button.dataset.model; closeModels(); root.querySelector('[data-action="models-menu"]').focus(); return; }

    if (button.dataset.drawer) { const key = button.dataset.drawer; ui.drawers[key] = !ui.drawers[key]; render(); return; }

    if (button.dataset.tab) {

      showPage(apps.find(app => app.id === button.dataset.tab)?.view || button.dataset.tab);

      return;

    }

    if (button.dataset.contact || button.dataset.group) {

      openConversation(button.dataset.group || button.dataset.contact, Boolean(button.dataset.group)); return;

    }

    if (button.dataset.message) {

      ui.chatMenu = false;

      ui.reactionMoreMessageId = '';

      if (ui.multiSelectMode) {

        const msgId = button.dataset.message;

        if (!(ui.selectedMessageIds instanceof Set)) ui.selectedMessageIds = new Set();

        if (ui.selectedMessageIds.has(msgId)) {

          ui.selectedMessageIds.delete(msgId);

          if (ui.multiSelectAnchorId === msgId) ui.multiSelectAnchorId = [...ui.selectedMessageIds].at(-1) || '';

        } else {

          ui.selectedMessageIds.add(msgId);

          ui.multiSelectAnchorId = msgId;

        }

        render();

        return;

      }

      ui.selectedMessage = ui.selectedMessage === button.dataset.message ? '' : button.dataset.message;

      render();

      return;

    }

    if (button.dataset.post) { ui.postId = button.dataset.post; ui.view = 'post'; ui.feedback = null; render(); return; }

    const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;

    if (button.dataset.action?.startsWith('origin-') && ui.view === 'origin') {

      ui.savedOriginScroll = root.querySelector('.phone-main')?.scrollTop;

    }

    switch (button.dataset.action) {

      case 'dismiss-phone-notice': dismissPhoneNotice(); break;

      case 'open-phone-notice': {

        const notice = ui.notice;

        dismissPhoneNotice();

        if (notice?.kind === 'message') openConversation(notice.id, store.read().groups?.some(group => group.id === notice.id));

        else if (notice?.kind === 'social-reply') openSocialReply(notice.id);

        else if (notice?.kind === 'social-author') { ui.socialAuthorId = notice.id; showPage('social-profile'); }

        else if (notice?.kind === 'social-feed') showPage('social');

        else if (notice?.kind === 'forum') showPage('forum');

        else if (notice?.kind === 'calendar-ai') {

          ui.calendarAiOpen = true;

          ui.calendarAiTab = notice.tab || ui.calendarAiTab || 'festivals';

          showPage('calendar');

        }

        break;

      }

      case 'open-social-reply': dismissPhoneNotice(); openSocialReply(button.dataset.socialPost); break;

      case 'unlock': showPage('desktop'); break;

      case 'system-home': showPage('desktop'); break;

      case 'system-back': goBack(); break;

      case 'social-like': {

        const postId = button.dataset.socialPost;

        void perform(`social-like:${postId}`, () => social.toggleLike(postId));

        break;

      }

      case 'social-refresh': {

        const previousIds = new Set((store.read().social?.posts || []).map(post => post.id));

        void perform('social', () => social.refresh(), result => {

          const currentIds = new Set((Array.isArray(result) ? result : store.read().social?.posts || []).map(post => post.id));

          for (const postId of previousIds) {

            if (!currentIds.has(postId)) {

              ui.socialDrafts.delete(postId);

              ui.socialCommentOpen.delete(postId);

            }

          }

          onContextChange();

        });

        break;

      }

      case 'social-comment-toggle': {

        const postId = button.dataset.socialPost;

        if (ui.socialCommentOpen.has(postId)) ui.socialCommentOpen.delete(postId);

        else ui.socialCommentOpen.add(postId);

        render();

        if (ui.socialCommentOpen.has(postId)) root.querySelector(`[data-social-comment-form="${CSS.escape(postId)}"] textarea`)?.focus({ preventScroll: true });

        break;

      }

      case 'social-author': {

        const authorId = button.dataset.socialAuthor;

        if (ui.view !== 'social-profile' || ui.socialAuthorId !== authorId) {

          ui.socialAuthorId = authorId; showPage('social-profile');

        }

        break;

      }

      case 'social-author-refresh': {

        const authorId = ui.socialAuthorId;

        void perform(`social-author:${authorId}`, () => social.generateAuthor(authorId)); break;

      }

      case 'social-back': goBack(); break;

      case 'social-past': ui.socialPastOpen = !ui.socialPastOpen; render(); break;

      case 'social-earlier': ui.socialLimit += 30; render(); break;

      case 'social-image': {

        const post = store.read().social?.posts.find(item => item.id === button.dataset.socialImage);

        if (post?.image?.path) void viewPhoto(() => store.read().social?.posts.find(item => item.id === button.dataset.socialImage)?.image);

        else void perform(`social-image:${button.dataset.socialImage}`, () => images.generatePost(button.dataset.socialImage));

        break;

      }

      case 'restore-chat-background': {

        const draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;

        draft.background = ''; render(); break;

      }

      // 系统操作

      case 'origin-back':

      case 'back-desktop':

        if (ui.originShowSettings) {

          ui.originShowSettings = false;

          render();

        } else {

          showPage('desktop');

        }

        break;

            // 寻味操作

      case 'open-foodie-settings':

        ui.foodieShowSettings = true;

        render();

        break;

      case 'foodie-close-settings':
        await syncFoodieFormDraft(root);
        ui.foodieShowSettings = false;
        ui.foodieSettingsTab = 'list';
        render();
        onContextChange();
        break;

      case 'toggle-foodie-trace':

        ui.foodieTraceOpen = !ui.foodieTraceOpen;

        render();

        break;

      case 'foodie-refresh': {
        const state = store.read();
        const chatMessages = readChatMessages() || [];
        const beforeIndex = chatMessages.length;
        const wrapperSettings = host?.readSettings ? getSharedBodyWrappers(host.readSettings()) : {};
        const recentFloors = [];
        for (let i = Math.max(0, beforeIndex - 3); i < beforeIndex; i++) {
          const msg = chatMessages[i];
          if (!msg || msg.is_system || msg.role === 'system') continue;
          const raw = String(msg.mes ?? msg.content ?? '');
          if (!raw.trim()) continue;
          const clean = sanitizeStoryBody(raw, wrapperSettings);
          if (clean) recentFloors.push(clean);
        }
        const storyText = recentFloors.join('\n');
        const timeline = readTimeline?.() || null;
        const rawCalCtx = calendar?.context ? calendar.context(timeline?.label || null, { viewerIds: ['@user'] }) : null;
        const extraWeather = (!rawCalCtx?.weather && calendar?.weatherInfo)
          ? calendar.weatherInfo(chatMessages)
          : null;
        const weatherObj = rawCalCtx?.weather || rawCalCtx?.weatherInfo || extraWeather || null;
        const calCtx = {
          ...(rawCalCtx || {}),
          ...(timeline?.clock?.date && !rawCalCtx?.today ? { today: timeline.clock.date } : {}),
          ...(timeline?.clock?.time && !rawCalCtx?.time ? { time: timeline.clock.time } : {}),
          ...(weatherObj ? { weather: weatherObj } : {}),
          ...(weatherObj?.solarTerm && !rawCalCtx?.jieqi ? { jieqi: weatherObj.solarTerm } : {}),
          events: rawCalCtx?.events || [],
        };
        const mapProj = buildMapProjection({
          state,
          context: host?.readCurrentTarget?.() || {},
          baibaiSnapshot: readBaiBaiBookMapSnapshot(doc.defaultView || globalThis),
          messages: chatMessages,
        });
        const res = evaluateFoodieMatch({
          state,
          storyText,
          mapProjection: mapProj,
          calendarContext: calCtx,
          turnIndex: beforeIndex,
          forceRefresh: true,
        });
        if (res) {
          const nextFoodie = {
            ...(state.foodie || {}),
            current: res,
            session: res.session !== undefined
              ? res.session
              : (res.status === 'locked' ? state.foodie?.session : null),
            lastTrace: res.trace,
          };
          void perform('foodie-refresh', async () => {
            await store.setFoodieState(nextFoodie);
            render();
            onContextChange();
          });
        }
        break;
      }

      case 'foodie-toggle-lock': {

        const state = store.read();

        const currentLocked = Boolean(state.foodie?.locked);

        void perform('foodie-lock', async () => {

          await store.setFoodieState({ locked: !currentLocked });

          render();

          onContextChange();

        });

        break;

      }

      case 'foodie-toggle-edit-db': {

        const dbId = button.dataset.dbId;

        ui.foodieEditDbId = ui.foodieEditDbId === dbId ? null : dbId;

        render();

        break;

      }

      case 'foodie-switch-group': {
        ui.foodieActiveGroup = button.dataset.foodieGroup || button.dataset.group || 'all';
        render();
        break;
      }
      case 'foodie-back-to-list': {
        await syncFoodieFormDraft(root);
        ui.foodieSettingsTab = 'list';
        render();
        onContextChange();
        break;
      }
      case 'foodie-open-edit-db': {
        const id = button.dataset.dbId;
        if (id) {
          ui.foodieSelectedDbId = id;
          ui.foodieSettingsTab = 'edit';
          render();
        }
        break;
      }
      case 'foodie-new-db': {
        const state = store.read();
        const customs = { ...(state.foodie?.customDatabases || {}) };
        const newId = `custom:${Date.now()}`;
        const newDb = {
          id: newId,
          label: '自建美食预设',
          builtin: false,
          enabled: true,
          keywords: [],
          tags: [],
          mapLocations: [],
          calendarSlots: [],
          weatherConditions: [],
          calendarSeasons: [],
          calendarFestivals: [],
          categories: [
            { name: '主菜', role: 'hot', items: [] },
            { name: '主食', role: 'staple', items: [] },
            { name: '羹汤', role: 'soup', items: [] },
            { name: '饮品', role: 'drink', items: [] },
            { name: '凉菜', role: 'cold', items: [] },
            { name: '点心', role: 'dessert', items: [] }
          ],
          items: []
        };
        customs[newId] = newDb;
        ui.foodieSelectedDbId = newId;
        ui.foodieSettingsTab = 'edit';
        ui.foodieActiveRoleTab = 'hot';
        ui.foodieActiveGroup = 'all';
        ui.foodieSearchQuery = '';
        ui.foodieDrawersOpen = {
          location: false,
          time: false,
          weather: false,
          season: false,
          batchImport: false,
          dishes: true
        };
        void store.setFoodieState({ customDatabases: customs }).then(() => {
          ui.feedback = { text: '已新建美食库' };
          render();
          onContextChange();
        });
        break;
      }
      case 'foodie-clear-search': {
        ui.foodieSearchQuery = '';
        render();
        break;
      }
      case 'foodie-append-tag': {
        const targetSel = button.dataset.target;
        const val = button.dataset.val;
        const container = button.closest('.foodie-view') || root;
        const targetInput = container?.querySelector(targetSel);
        if (targetInput && val) {
          const current = targetInput.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
          if (!current.includes(val)) {
            current.push(val);
            targetInput.value = current.join(', ');
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        break;
      }
      case 'foodie-set-filter-mode': {
        ui.foodieFilterMode = button.dataset.mode || 'all';
        render();
        break;
      }

      case 'foodie-toggle-drawer': {
        const d = button.dataset.foodieDrawer || button.dataset.drawer;
        if (d) {
          ui.foodieDrawersOpen = ui.foodieDrawersOpen || {};
          ui.foodieDrawersOpen[d] = !ui.foodieDrawersOpen[d];
          const card = button.closest('.accordion-drawer-card');
          if (card) {
            const isOpen = Boolean(ui.foodieDrawersOpen[d]);
            card.classList.toggle('is-open', isOpen);
            const caret = card.querySelector('.drawer-caret');
            if (caret) caret.classList.toggle('is-open', isOpen);
            const body = card.querySelector('.drawer-body-content');
            if (body) body.style.display = isOpen ? 'flex' : 'none';
          } else {
            render();
          }
        }
        break;
      }
      case 'foodie-switch-role-tab': {
        const targetRole = button.dataset.role || 'hot';
        ui.foodieActiveRoleTab = targetRole;
        const container = button.closest('.role-dishes-card') || root;
        if (container) {
          container.querySelectorAll('.role-tab-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.role === targetRole);
          });
          container.querySelectorAll('.role-dish-chips-box').forEach(pane => {
            const isActive = pane.dataset.rolePane === targetRole;
            pane.style.display = isActive ? 'flex' : 'none';
            pane.classList.toggle('is-active', isActive);
          });
          const input = container.querySelector('#foodie-new-dish-input');
          const roleLabels = { hot: '主菜', staple: '主食', soup: '羹汤', drink: '饮品', cold: '凉菜', dessert: '点心' };
          const label = roleLabels[targetRole] || '菜品';
          if (input) {
            input.dataset.role = targetRole;
            input.placeholder = `添加${label}，回车或逗号批量添加...`;
          }
          const addBtn = container.querySelector('.add-dish-btn');
          if (addBtn) addBtn.dataset.role = targetRole;
          const countBadge = container.querySelector('.role-count-badge');
          const countNum = container.querySelector(`.role-count-num[data-role-count="${targetRole}"]`);
          if (countBadge && countNum) {
            countBadge.textContent = countNum.textContent;
          }
        } else {
          render();
        }
        break;
      }
      case 'foodie-toggle-dishes-box': {
        ui.foodieDishesBoxOpen = ui.foodieDishesBoxOpen === false ? true : false;
        const container = button.closest('.role-dishes-card') || root;
        if (container) {
          const panesWrapper = container.querySelector('.role-panes-wrapper');
          const toggleText = container.querySelector('.dishes-box-toggle-text');
          const caret = container.querySelector('.role-dishes-collapse-btn .caret-icon');
          const isOpen = ui.foodieDishesBoxOpen !== false;
          if (panesWrapper) panesWrapper.style.display = isOpen ? 'block' : 'none';
          if (toggleText) toggleText.textContent = isOpen ? '折叠收起' : '展开菜品';
          if (caret) caret.classList.toggle('is-open', isOpen);
        } else {
          render();
        }
        break;
      }
      case 'foodie-insert-dish-prefix': {
        const prefix = button.dataset.prefix;
        const container = button.closest('.drawer-body-content, .guided-step-card, .foodie-view') || root;
        const inputEl = container?.querySelector('#foodie-new-dish-input');
        if (inputEl && prefix) {
          const cur = inputEl.value.trim();
          if (cur.startsWith(prefix)) {
            // already prefixed
          } else {
            const stripped = cur.replace(/^[\[【][^\]】]+[\]】]\s*/, '');
            inputEl.value = `${prefix} ${stripped}`.trim() + (stripped ? '' : ' ');
          }
          inputEl.focus({ preventScroll: true });
        }
        break;
      }
      case 'foodie-add-role-dish': {
        const role = button.dataset.role || ui.foodieActiveRoleTab || 'hot';
        const container = button.closest('.accordion-drawer-card, .role-dishes-card, .foodie-view') || root;
        const inputEl = container?.querySelector('#foodie-new-dish-input');
        const rawVal = inputEl?.value?.trim();
        if (!rawVal) break;

        const newDishes = splitDishesInput(rawVal);
        if (!newDishes.length) break;

        const dbId = button.dataset.dbId || ui.foodieSelectedDbId || '';
        const activePane = container.querySelector(`.role-dish-chips-box[data-role-pane="${role}"]`);
        const existingSet = new Set(
          Array.from(activePane?.querySelectorAll('.role-dish-tag') || [])
            .map(t => t.dataset.dishName || t.textContent.trim())
            .filter(Boolean)
        );
        const dishesToAdd = newDishes.filter(d => d && !existingSet.has(d));

        // 1. 本地 DOM 增量插入（零滚动重置、秒级上屏）
        if (activePane && dishesToAdd.length) {
          const emptyNotice = activePane.querySelector('.role-dishes-empty');
          if (emptyNotice) emptyNotice.remove();
          for (const dish of dishesToAdd) {
            const parsed = parseDishCondition(dish);
            const tag = document.createElement('span');
            tag.className = `role-dish-tag ${parsed.condition ? 'has-condition' : ''}`;
            tag.dataset.dishName = dish;
            tag.innerHTML = `${parsed.condition ? `<span class="dish-cond-badge">${escape(parsed.condition)}</span>` : ''}<span class="dish-name-text">${escape(parsed.name)}</span><button type="button" class="dish-remove-btn" data-action="foodie-remove-role-dish" data-db-id="${escape(dbId)}" data-role="${role}" data-dish="${escape(dish)}" title="删除">${icon('close')}</button>`;
            activePane.appendChild(tag);
          }
        }

        // 2. 同步更新隐藏 textarea (供保存使用)
        const textarea = container.querySelector(`#edit-db-${role}`);
        if (textarea && dishesToAdd.length) {
          const currentLines = textarea.value.split('\n').filter(Boolean);
          for (const d of dishesToAdd) {
            if (!currentLines.includes(d)) currentLines.push(d);
          }
          textarea.value = currentLines.join('\n');
        }

        inputEl.value = '';
        inputEl.focus({ preventScroll: true });

        if (!dishesToAdd.length) break;

        // 3. 收集完整分类并刷新顶部/标签计数与预览
        const state = store.read();
        const isCustom = dbId.startsWith('custom:');
        const { categories, items } = collectFoodieCategoriesFromDom(container);
        updateFoodieEditStatsDom(container, categories, isCustom, state.foodie?.template);

        // 4. 后台持久化到 store 并刷新聊天注入上下文
        if (dbId) {
          if (isCustom) {
            const customs = { ...(state.foodie?.customDatabases || {}) };
            const db = { ...(customs[dbId] || { id: dbId, label: '自建预设', builtin: false, enabled: true }) };
            db.categories = categories;
            db.items = items;
            customs[dbId] = db;
            void store.setFoodieState({ customDatabases: customs }).then(() => {
              onContextChange();
            });
          } else {
            const modified = { ...(state.foodie?.modifiedBuiltins || {}) };
            const orig = getEffectiveDatabases(state).find(d => d.id === dbId) || {};
            const db = { ...(modified[dbId] || orig) };
            db.categories = categories;
            db.items = items;
            modified[dbId] = db;
            void store.setFoodieState({ modifiedBuiltins: modified }).then(() => {
              onContextChange();
            });
          }
        }
        break;
      }
      case 'foodie-remove-role-dish': {
        const role = button.dataset.role;
        const dishName = button.dataset.dish || button.closest('.role-dish-tag')?.dataset.dishName;
        const tagEl = button.closest('.role-dish-tag');
        const container = button.closest('.accordion-drawer-card, .role-dishes-card, .foodie-view') || root;
        if (tagEl) tagEl.remove();

        const activePane = container.querySelector(`.role-dish-chips-box[data-role-pane="${role}"]`);
        if (activePane && activePane.querySelectorAll('.role-dish-tag').length === 0) {
          activePane.innerHTML = '<div class="role-dishes-empty">暂无菜品</div>';
        }

        // 同步从隐藏 textarea 中移除
        const textarea = container.querySelector(`#edit-db-${role}`);
        if (textarea) {
          textarea.value = textarea.value.split('\n').filter(Boolean).filter(d => d !== dishName).join('\n');
        }

        const dbId = button.dataset.dbId || ui.foodieSelectedDbId || '';
        const state = store.read();
        const isCustom = dbId.startsWith('custom:');
        const { categories, items } = collectFoodieCategoriesFromDom(container);
        updateFoodieEditStatsDom(container, categories, isCustom, state.foodie?.template);

        if (dbId) {
          if (isCustom) {
            const customs = { ...(state.foodie?.customDatabases || {}) };
            if (customs[dbId]) {
              const db = { ...customs[dbId], categories, items };
              customs[dbId] = db;
              void store.setFoodieState({ customDatabases: customs }).then(() => {
                onContextChange();
              });
            }
          } else {
            const modified = { ...(state.foodie?.modifiedBuiltins || {}) };
            const orig = getEffectiveDatabases(state).find(d => d.id === dbId) || {};
            const db = { ...(modified[dbId] || orig), categories, items };
            modified[dbId] = db;
            void store.setFoodieState({ modifiedBuiltins: modified }).then(() => {
              onContextChange();
            });
          }
        }
        break;
      }
      case 'foodie-save-db': {
        const dbId = button.dataset.dbId || ui.foodieSelectedDbId;
        const container = button.closest('.foodie-panel-card, .foodie-view') || root;
        if (!container || !dbId) break;

        const label = container.querySelector('#edit-db-label')?.value?.trim() || dbId;
        const keywords = (container.querySelector('#edit-db-keywords')?.value || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);

        const state = store.read();
        const isCustom = dbId.startsWith('custom:');
        const existingDb = isCustom
          ? state.foodie?.customDatabases?.[dbId]
          : (state.foodie?.modifiedBuiltins?.[dbId] || getEffectiveDatabases(state).find(d => d.id === dbId));

        const mapInput = container.querySelector('#edit-db-map');
        const mapLocs = mapInput ? (mapInput.value || '').split(/[,，]/).map(s => s.trim()).filter(Boolean) : (existingDb?.mapLocations || []);

        const parseList = (selector) => {
          const el = container.querySelector(selector);
          if (!el) return null;
          const text = el.value || '';
          return text.split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
        };

        const pendingInput = container.querySelector('#foodie-new-dish-input');
        const pendingVal = pendingInput?.value?.trim();
        const activeRole = ui.foodieActiveRoleTab || 'hot';
        const pendingDishes = pendingVal ? splitDishesInput(pendingVal) : [];
        const { categories, items } = collectFoodieCategoriesFromDom(container, pendingDishes, activeRole);

        const calSlotsInput = container.querySelector('#edit-db-cal-slots');
        const calSlots = calSlotsInput ? (parseList('#edit-db-cal-slots') || []) : (existingDb?.calendarSlots || []);
        const weatherInput = container.querySelector('#edit-db-weather');
        const weatherConditions = weatherInput ? (parseList('#edit-db-weather') || []) : (existingDb?.weatherConditions || []);
        const festivalsInput = container.querySelector('#edit-db-cal-festivals');
        const calFestivals = festivalsInput ? (parseList('#edit-db-cal-festivals') || []) : (existingDb?.calendarFestivals || []);
        const calendarSeasons = festivalsInput ? calFestivals.filter(f => /春季|夏季|秋季|冬季/.test(f)) : (existingDb?.calendarSeasons || []);

        // 同步保存可能修改的全局进食契机词
        const customIntentsInput = root.querySelector('#foodie-custom-intents-input');
        const customIntentWords = customIntentsInput ? customIntentsInput.value.trim() : (state.foodie?.customIntentWords || '');

        if (isCustom) {
          const customs = { ...(state.foodie?.customDatabases || {}) };
          customs[dbId] = {
            ...(customs[dbId] || {}),
            id: dbId,
            label,
            keywords,
            tags: keywords,
            mapLocations: mapLocs,
            calendarSlots: calSlots,
            weatherConditions,
            calendarSeasons,
            calendarFestivals: calFestivals,
            categories,
            items
          };
          void store.setFoodieState({ customDatabases: customs, customIntentWords }).then(() => {
            ui.foodieSettingsTab = 'list';
            ui.feedback = { text: `已保存自建库【${label}】` };
            render();
            onContextChange();
          });
        } else {
          const modified = { ...(state.foodie?.modifiedBuiltins || {}) };
          modified[dbId] = {
            ...(modified[dbId] || {}),
            id: dbId,
            label,
            keywords,
            tags: keywords,
            mapLocations: mapLocs,
            calendarSlots: calSlots,
            weatherConditions,
            calendarSeasons,
            calendarFestivals: calFestivals,
            categories,
            items
          };
          void store.setFoodieState({ modifiedBuiltins: modified, customIntentWords }).then(() => {
            ui.foodieSettingsTab = 'list';
            ui.feedback = { text: `已保存内置库【${label}】修改` };
            render();
            onContextChange();
          });
        }
        break;
      }
      case 'foodie-reset-db': {

        const dbId = button.dataset.dbId;

        const state = store.read();

        const modified = { ...(state.foodie?.modifiedBuiltins || {}) };

        delete modified[dbId];

        void store.setFoodieState({ modifiedBuiltins: modified }).then(() => {

          ui.feedback = { text: '已恢复内置默认数据' };

          render();

          onContextChange();

        });

        break;

      }

      case 'foodie-delete-db': {
        const dbId = button.dataset.dbId;
        const state = store.read();
        const customs = { ...(state.foodie?.customDatabases || {}) };
        delete customs[dbId];
        void store.setFoodieState({ customDatabases: customs }).then(() => {
          ui.foodieSettingsTab = 'list';
          ui.foodieSelectedDbId = null;
          ui.feedback = { text: '已删除自建库' };
          render();
          onContextChange();
        });
        break;
      }

      case 'origin-close-settings':

        ui.originShowSettings = false;

        render();

        break;

      case 'origin-enable-system':

        void perform('origin-enable', () => originService.updateSettings({ enabled: true }), () => {

          ui.feedback = { text: '系统已成功激活，已同步生成专属短信私聊！' };

          onContextChange();

        });

        break;

      case 'origin-switch-tab': ui.originTab = button.dataset.originTab || button.dataset.tab; render(); break;

      case 'origin-toggle-settings': ui.originShowSettings = !ui.originShowSettings; render(); break;

      case 'origin-fill-default-tpl': {

        event.preventDefault();

        event.stopPropagation();

        const key = button.dataset.key;

        const item = button.closest('.origin-section-item');

        const textarea = item?.querySelector(`textarea[name="section_${key}_template"]`);

        if (textarea && DEFAULT_ORIGIN_TEMPLATES?.[key]) {

          textarea.value = DEFAULT_ORIGIN_TEMPLATES[key];

          textarea.dispatchEvent(new Event('input', { bubbles: true }));

        }

        break;

      }

      case 'origin-open-sms': openConversation(SYSTEM_CONTACT_ID, false); break;

      case 'origin-jump-app': ui.view = 'origin'; ui.originTab = 'tasks'; render(); break;

      case 'origin-filter-tasks': ui.taskFilter = button.dataset.originFilter || button.dataset.filter; render(); break;

      case 'origin-filter-logs': ui.originLogFilter = button.dataset.originFilter || button.dataset.filter; render(); break;

      case 'origin-clear-logs':

        void perform('origin-log-clear', () => originService.clearLogs(), () => {

          ui.feedback = { text: '已清空系统履历日志。' };

          onContextChange();

        });

        break;

      case 'origin-open-new-task': ui.originModal = 'edit-task'; ui.originModalData = {}; render(); break;

      case 'origin-edit-task': {

        const taskId = button.dataset.taskId;

        ui.originModal = 'edit-task';

        ui.originModalData = (store.read().origin?.tasks || []).find(t => String(t.id) === String(taskId)) || {};

        render(); break;

      }

      case 'origin-complete-task':

        void perform('origin-task', () => originService.completeTask(button.dataset.taskId), () => { ui.feedback = { text: '任务已结算达成！' }; onContextChange(); }); break;

      case 'origin-fail-task':

        void perform('origin-task', () => originService.failTask(button.dataset.taskId, '手动放弃'), () => { ui.feedback = { text: '任务已标记失败。' }; onContextChange(); }); break;

      case 'origin-delete-task':

        void perform('origin-task', () => originService.deleteTask(button.dataset.taskId), () => { ui.feedback = { text: '任务已删除。' }; onContextChange(); }); break;

      case 'origin-mod-stat':

        void perform('origin-stat', () => originService.updateStat(button.dataset.stat, parseInt(button.dataset.delta, 10)), onContextChange); break;

      case 'origin-delete-stat':

        void perform('origin-stat-del', () => originService.deleteStat(button.dataset.stat), () => {

          ui.feedback = { text: `已移除属性「${button.dataset.stat}」。` };

          onContextChange();

        });

        break;

      case 'origin-toggle-stats-edit':

        ui.originStatsEditing = !ui.originStatsEditing;

        render();

        break;

      case 'origin-open-new-stat':

      case 'origin-add-stat':

        ui.originModal = 'edit-stat';

        ui.originModalData = { name: '', val: 10 };

        render();

        break;

      case 'origin-open-new-perk':

        ui.originModal = 'edit-perk';

        ui.originModalData = { name: '', desc: '' };

        render();

        break;

      case 'origin-edit-perk': {

        const pk = (store.read().origin?.perks || []).find(p => p.name === button.dataset.perk);

        ui.originModal = 'edit-perk';

        ui.originModalData = pk ? { ...pk } : { name: button.dataset.perk, desc: '' };

        render();

        break;

      }

      case 'origin-delete-perk':

        void perform('origin-perk-del', () => originService.deletePerk(button.dataset.perk), () => {

          ui.feedback = { text: `已移除特权「${button.dataset.perk}」。` };

          onContextChange();

        });

        break;

      case 'origin-open-new-skill':

        ui.originModal = 'edit-skill';

        ui.originModalData = { name: '', desc: '', hasExp: false, level: 1, exp: 0, expMax: 100 };

        render();

        break;

      case 'origin-edit-skill': {

        const sk = (store.read().origin?.skills || []).find(s => s.name === button.dataset.skill);

        ui.originModal = 'edit-skill';

        ui.originModalData = sk ? { ...sk, hasExp: Boolean(sk.expMax) } : { name: button.dataset.skill, desc: '', hasExp: false };

        render();

        break;

      }

      case 'origin-delete-skill':

        void perform('origin-skill-del', () => originService.deleteSkill(button.dataset.skill), () => {

          ui.feedback = { text: `已移除技能「${button.dataset.skill}」。` };

          onContextChange();

        });

        break;

      case 'origin-enable-skill-exp':

        void perform('origin-skill-enable', () => originService.updateSkillExp(button.dataset.skill, 0), () => {

          ui.feedback = { text: `已为技能「${button.dataset.skill}」开启熟练度经验条！` };

          onContextChange();

        });

        break;

      case 'origin-mod-skill-exp':

        void perform('origin-skill-exp', () => originService.updateSkillExp(button.dataset.skill, parseInt(button.dataset.delta, 10)), onContextChange);

        break;

      case 'origin-use-item':

        void perform('origin-item', () => originService.useItem(button.dataset.item), () => { ui.feedback = { text: `已使用「${button.dataset.item}」，将在下回合剧情显现。` }; onContextChange(); }); break;

      case 'origin-buy-item':

        void perform('origin-buy', () => originService.buyItem(button.dataset.item), () => { ui.feedback = { text: `已兑换「${button.dataset.item}」，已放入背包！` }; onContextChange(); }); break;

      case 'origin-refresh-shop':

        void perform('origin-shop', () => originService.refreshShop ? originService.refreshShop(6) : originService.updateSettings({ shop: store.read().origin?.shop?.slice().reverse() || [] }), () => { ui.feedback = { text: '商城货架已随机换一批。' }; onContextChange(); }); break;

      case 'origin-refresh-gacha':

        void perform('origin-gacha-refresh', () => originService.refreshGacha ? originService.refreshGacha() : Promise.resolve(), () => { ui.feedback = { text: '祈愿池预览已轮换。' }; onContextChange(); }); break;

      case 'origin-open-conceive-shop':

      case 'origin-ai-conceive-shop':

        ui.originModal = 'conceive-shop-guidance';

        ui.originModalData = {};

        render();

        break;

      case 'origin-open-conceive-gacha':

      case 'origin-ai-conceive-gacha':

        ui.originModal = 'conceive-gacha-guidance';

        ui.originModalData = {};

        render();

        break;

      case 'origin-open-shop-catalog':

        ui.originModal = 'shop-catalog'; render(); break;

      case 'origin-open-gacha-catalog':

        ui.originModal = 'gacha-catalog'; render(); break;

      case 'origin-delete-shop-item':

        void perform('origin-shop-del', () => originService.deleteShopCatalogItem(button.dataset.item), onContextChange); break;

      case 'origin-delete-gacha-item':

        void perform('origin-gacha-del', () => originService.deleteGachaCatalogItem(button.dataset.item), onContextChange); break;

      case 'origin-draw-gacha': {

        const count = parseInt(button.dataset.count, 10) || 1;

        void perform('origin-gacha', () => originService.drawGacha(count), results => {

          ui.originModal = 'gacha-result';

          ui.originModalData = results;

          onContextChange();

        });

        break;

      }

      case 'origin-open-direction':

        ui.originModal = 'direction'; render(); break;

      case 'origin-ai-conceive-task':

        void perform('origin-ai-task', async () => {

          if (!originService.conceiveTask) throw new Error('当前环境未启用模型推演能力');

          return await originService.conceiveTask();

        }, (newTask) => {

          ui.feedback = { text: `AI 成功构想新任务：「${newTask?.title || '新任务'}」！` };

          onContextChange();

        });

        break;

      case 'origin-open-evaluate-stats':

      case 'origin-ai-evaluate-stats':

        ui.originModal = 'evaluate-stats-guidance';

        ui.originModalData = {};

        render();

        break;

      case 'origin-close-modal':

        ui.originModal = null; ui.originModalData = null; render(); break;

      case 'origin-reset-data':

        if (confirm('确认清空本局系统数据吗？任务、属性、背包、商城、祈愿、成就与日志将重置为初始状态，正文注入模块与提示词定制等配置将保持不变。')) {

          void perform('origin-reset', () => store.updateOrigin(curr => resetOriginData(curr)), () => { ui.feedback = { text: '系统数据已重置（已保留提示词与注入配置）。' }; onContextChange(); });

        }

        break;

      case 'open-calendar':

        ui.view = 'calendar'; ui.calendarOffset = 0; ui.calendarDay = null;

        ui.feedback = null; render(); break;

      case 'calendar-prev': ui.calendarOffset--; ui.calendarDay = null; render(); break;

      case 'calendar-next': ui.calendarOffset++; ui.calendarDay = null; render(); break;

      case 'calendar-today': ui.calendarOffset = 0; ui.calendarDay = null; render(); break;

      case 'calendar-month': ui.calendarDay = null; render(); break;

      case 'open-calendar-form': {

        const calMonth = calendar.month(ui.calendarOffset);

        ui.calendarFormOpen = true;

        ui.calendarDraft = { month: calMonth?.month || 1, day: ui.calendarDay || 1, days: 1, type: 'anniversary' };

        render(); break;

      }

      case 'close-calendar-form':

        ui.calendarFormOpen = false; ui.calendarDraft = null; render(); break;

      case 'open-calendar-settings':

        ui.calendarSettingsOpen = true; ui.calendarFormOpen = false; ui.calendarAiOpen = false; render(); break;

      case 'open-calendar-workday':

        ui.calendarSettingsOpen = true; ui.calendarSettingsTab = 'workday'; ui.calendarFormOpen = false; ui.calendarAiOpen = false; render(); break;

      case 'close-calendar-settings':

        ui.calendarSettingsOpen = false; render(); break;

      case 'open-calendar-weather-modal':

        ui.calendarWeatherModalOpen = true; render(); break;

      case 'close-calendar-weather-modal':

        ui.calendarWeatherModalOpen = false; render(); break;

      case 'open-calendar-weather-detail':

        ui.view = 'calendar'; ui.calendarWeatherModalOpen = true; render(); break;

      case 'jump-calendar-weather-settings':

        ui.calendarWeatherModalOpen = false; ui.calendarSettingsOpen = true; ui.calendarSettingsTab = 'weather'; ui.calendarFormOpen = false; ui.calendarAiOpen = false; render(); break;

      case 'switch-calendar-settings-tab':

        ui.calendarSettingsTab = button.dataset.calendarSettingsTab || 'presets'; render(); break;

      case 'apply-calendar-preset': {

        const countrySelect = root.querySelector('#cal-s-country');

        const modeSelect = root.querySelector('#cal-s-mode');

        const selected = countrySelect?.value || 'CN';

        const keepCustom = modeSelect?.value !== 'replace';

        if (selected.startsWith('custom_preset:') || selected.startsWith('custom:')) {

          void perform('calendar-preset', () => store.applyCustomCalendarPreset(selected, { keepCustom }), () => {

            ui.calendarSettingsOpen = false;

            ui.feedback = { text: '已切换历法预设。' };

          });

        } else {

          void perform('calendar-preset', () => store.applyCalendarPreset({ countryId: selected, keepCustom }), () => {

            ui.calendarSettingsOpen = false;

            ui.feedback = { text: '已切换历法预设。' };

          });

        }

        break;

      }

      case 'delete-custom-calendar-preset': {

        const presetId = button.dataset.presetId || root.querySelector('#cal-s-country')?.value;

        if (!presetId) break;

        void perform('calendar-preset', () => store.deleteCustomCalendarPreset(presetId), () => {

          ui.feedback = { text: '已删除该自定义预设。' };

        });

        break;

      }

      case 'save-current-as-preset': {

        const nameInput = root.querySelector('#cal-s-save-name')?.value?.trim();

        if (!nameInput) {

          ui.feedback = { text: '请填写预设名称' };

          render();

          break;

        }

        void perform('calendar-preset', () => store.saveCustomCalendarPreset({ name: nameInput }), () => {

          ui.feedback = { text: `已保存预设「${nameInput}」。` };

        });

        break;

      }

      case 'create-custom-calendar': {

        const title = root.querySelector('#cal-c-title')?.value?.trim() || '自定义历法';

        const era = root.querySelector('#cal-c-era')?.value?.trim() || '';

        const currentYear = Number(root.querySelector('#cal-c-year')?.value) || 1;

        const monthCount = Math.max(1, Math.min(24, Number(root.querySelector('#cal-c-month-count')?.value) || 4));

        const daysPerMonth = Math.max(1, Math.min(100, Number(root.querySelector('#cal-c-days-per-month')?.value) || 28));

        const weekdayCycle = Math.max(1, Math.min(14, Number(root.querySelector('#cal-c-weekday-cycle')?.value) || 7));

        const rawWeekdays = root.querySelector('#cal-c-weekdays')?.value?.trim() || '';

        const weekdays = rawWeekdays ? rawWeekdays.split(/[,，、\s]+/).filter(Boolean) : [];

        const rawMonthNames = root.querySelector('#cal-c-month-names')?.value?.trim() || '';

        const monthNamesList = rawMonthNames ? rawMonthNames.split(/[,，、\s]+/).filter(Boolean) : [];

        const presetName = root.querySelector('#cal-c-preset-name')?.value?.trim() || '';



        const months = Array.from({ length: monthCount }, (_, i) => ({

          name: monthNamesList[i] || `${i + 1}月`,

          days: daysPerMonth,

        }));



        void perform('calendar-preset', () => store.createCustomCalendar({

          title,

          era,

          currentYear,

          months,

          weekdayCycle,

          weekdays: weekdays.length === weekdayCycle ? weekdays : undefined,

          presetName,

        }), () => {

          ui.calendarSettingsOpen = false;

          ui.feedback = { text: `已应用新历法「${title}」${presetName ? '并保存为预设' : ''}。` };

        });

        break;

      }

      case 'open-calendar-ai':

        ui.calendarAiOpen = true; ui.calendarFormOpen = false; ui.calendarSettingsOpen = false; render(); break;

      case 'close-calendar-ai':

        ui.calendarAiOpen = false; render(); break;

      case 'switch-calendar-ai-tab':

        ui.calendarAiTab = button.dataset.calendarTab || 'festivals'; render(); break;

      case 'run-calendar-ai-festivals': {

        const settingInput = root.querySelector('#cal-ai-setting')?.value || ui.calendarAiSetting || '';

        const countInput = Number(root.querySelector('#cal-ai-count')?.value || ui.calendarAiCount || 3);

        ui.calendarAiSetting = settingInput;

        ui.calendarAiCount = countInput;

        ui.calendarAiBusy = true; render();

        void (async () => {

          try {

            const list = await calendarAi.conceiveFestivals({ setting: settingInput, count: countInput });

            ui.calendarAiFestivals = list;

            if (ui.view !== 'calendar') {

              pushPhoneNotice({

                kind: 'calendar-ai',

                tab: 'festivals',

                title: '节日构想完成',

                content: `已构想 ${list.length} 个节日，点击回到日历`,

              });

            }

          } catch (err) {

            if (ui.view !== 'calendar') {

              pushPhoneNotice({

                kind: 'calendar-ai',

                tab: 'festivals',

                title: '节日构想失败',

                content: err.message || '请检查模型连接',

              });

            } else {

              ui.feedback = { text: `构想失败：${err.message || '请检查模型连接'}` };

            }

          } finally {

            ui.calendarAiBusy = false;

            render();

          }

        })();

        break;

      }

      case 'apply-calendar-ai-festivals': {

        const selected = (ui.calendarAiFestivals || []).filter(item => item.selected);

        if (!selected.length) { ui.feedback = { text: '请至少勾选一个节日' }; render(); break; }

        void perform('calendar-event', () => store.saveCalendarEvents(selected), () => {

          ui.calendarAiFestivals = [];

          ui.calendarAiOpen = false;

          ui.feedback = { text: `已加入 ${selected.length} 个节日到日历。` };

          onContextChange();

        });

        break;

      }

      case 'run-calendar-ai-schedules': {

        const daysInput = Number(root.querySelector('#cal-ai-days')?.value || ui.calendarAiDays || 3);

        const focusInput = root.querySelector('#cal-ai-focus')?.value || ui.calendarAiFocus || '全部';

        ui.calendarAiDays = daysInput;

        ui.calendarAiFocus = focusInput;

        ui.calendarAiBusy = true; render();

        void (async () => {

          try {

            const list = await calendarAi.deduceSchedules({ days: daysInput, focus: focusInput });

            ui.calendarAiSchedules = list;

            if (ui.view !== 'calendar') {

              pushPhoneNotice({

                kind: 'calendar-ai',

                tab: 'schedules',

                title: '日程推演完成',

                content: `已推演 ${list.length} 条日程，点击回到日历`,

              });

            }

          } catch (err) {

            if (ui.view !== 'calendar') {

              pushPhoneNotice({

                kind: 'calendar-ai',

                tab: 'schedules',

                title: '日程推演失败',

                content: err.message || '请检查模型连接',

              });

            } else {

              ui.feedback = { text: `推演失败：${err.message || '请检查模型连接'}` };

            }

          } finally {

            ui.calendarAiBusy = false;

            render();

          }

        })();

        break;

      }

      case 'apply-calendar-ai-schedules-calendar': {

        const selected = (ui.calendarAiSchedules || []).filter(item => item.selected);

        if (!selected.length) { ui.feedback = { text: '请至少勾选一条日程' }; render(); break; }

        void perform('calendar-event', () => store.saveCalendarEvents(selected.map(it => ({

          name: it.title,

          month: it.month,

          day: it.day,

          days: it.days,

          type: 'todo',

          note: [it.time, it.location, it.note].filter(Boolean).join(' · '),

        }))), () => {

          ui.calendarAiSchedules = [];

          ui.calendarAiOpen = false;

          ui.feedback = { text: `已加入 ${selected.length} 条待办事项到日历。` };

          onContextChange();

        });

        break;

      }

      case 'apply-calendar-ai-schedules-todo': {

        const selected = (ui.calendarAiSchedules || []).filter(item => item.selected);

        if (!selected.length) { ui.feedback = { text: '请至少勾选一条日程' }; render(); break; }

        void perform('todos', () => store.saveTodosFromSchedule(selected), () => {

          ui.calendarAiSchedules = [];

          ui.calendarAiOpen = false;

          ui.feedback = { text: `已加入 ${selected.length} 条待办事项到日历。` };

        });

        break;

      }

      case 'toggle-calendar-todo': {

        const eventId = button.dataset.calendarEventId;

        if (!eventId) break;

        void perform('calendar-event', () => store.toggleCalendarEventDone(eventId), onContextChange);

        break;

      }

      case 'edit-calendar-event': {

        const eventId = button.dataset.calendarEventId;

        if (!eventId) break;

        const allItems = calendar.items ? calendar.items() : [];

        const monthDays = (calendar.month(ui.calendarOffset)?.days || []).flatMap(d => d.items || []);

        const targetItem = allItems.find(it => it.id === eventId) || monthDays.find(it => it.id === eventId);

        if (targetItem) {

          const month = targetItem.month || (calendar.month(ui.calendarOffset)?.month || 1);

          const day = targetItem.day || 1;

          ui.calendarDraft = {

            id: targetItem.id,

            todoId: targetItem.todoId || '',

            name: targetItem.name,

            type: targetItem.type,

            month,

            day,

            days: targetItem.days || 1,

            note: targetItem.note || '',

          };

          ui.calendarFormOpen = true;

          render();

        }

        break;

      }

      case 'delete-calendar-event': {

        const eventId = button.dataset.calendarEventId;

        if (!eventId) break;

        void perform('calendar-event', () => store.deleteCalendarEvent(eventId), onContextChange);

        break;

      }

      case 'open-map-form': {

        const parentId = button.dataset.parentId || ui.mapScopeId || '';

        ui.mapDraft = {

          id: '',

          name: '',

          role: parentId ? 'site' : 'area',

          parentId,

          desc: '',

          facilities: [],

          setAsCurrent: false,

        };

        ui.mapFormOpen = true;

        render();

        break;

      }

      case 'close-map-form': {

        if (event.target !== button && !event.target.closest('[data-action="close-map-form"]')) break;

        ui.mapFormOpen = false;

        ui.mapDraft = null;

        render();

        break;

      }

      case 'toggle-map-draft-facility': {

        const fac = button.dataset.facility;

        if (!fac || !ui.mapDraft) break;

        const form = root.querySelector('[data-map-form]');

        if (form) {

          ui.mapDraft.name = form.elements.name?.value || ui.mapDraft.name;

          ui.mapDraft.role = form.elements.role?.value || ui.mapDraft.role;

          ui.mapDraft.parentId = form.elements.parentId?.value ?? ui.mapDraft.parentId;

          ui.mapDraft.desc = form.elements.desc?.value ?? ui.mapDraft.desc;

          ui.mapDraft.setAsCurrent = Boolean(form.elements.setAsCurrent?.checked);

        }

        const list = Array.isArray(ui.mapDraft.facilities) ? [...ui.mapDraft.facilities] : [];

        const idx = list.indexOf(fac);

        if (idx >= 0) list.splice(idx, 1);

        else list.push(fac);

        ui.mapDraft.facilities = list;

        render();

        break;

      }

      case 'edit-map-place': {

        const placeId = button.dataset.placeId;

        if (!placeId) break;

        const proj = buildMapProjection({

          state: store.read(),

          baibaiSnapshot: readBaiBaiBookMapSnapshot(doc.defaultView || globalThis),

          messages: readChatMessages(),

        });

        const targetPlace = proj.places.find(p => p.id === placeId);

        if (targetPlace) {

          ui.mapDraft = {

            id: targetPlace.id,

            name: targetPlace.name,

            role: targetPlace.role || 'site',

            parentId: targetPlace.parentId || '',

            desc: targetPlace.desc || '',

            facilities: [...(targetPlace.facilities || [])],

            setAsCurrent: proj.userPosition?.placeId === targetPlace.id,

          };

          ui.mapFormOpen = true;

          render();

        }

        break;

      }

      case 'delete-map-place': {

        const placeId = button.dataset.placeId;

        if (!placeId) break;

        void perform('map-place', () => store.deleteMapPlace(placeId), () => {

          if (ui.mapSelectedPlaceId === placeId) ui.mapSelectedPlaceId = '';

          if (ui.mapScopeId === placeId) ui.mapScopeId = '';

          onContextChange();

        });

        break;

      }

      case 'set-map-current': {

        const placeId = button.dataset.placeId;

        if (!placeId) break;

        void perform('map-current', () => store.setMapCurrentLocation(placeId), () => {

          ui.mapSelectedPlaceId = placeId;

          ui.feedback = { text: '已更新当前所在位置。' };

          onContextChange();

        });

        break;

      }

      case 'clear-map-manual-location': {

        void perform('map-current', () => store.setMapCurrentLocation(''), () => {

          ui.feedback = { text: '已恢复自动跟随剧情位置。' };

          onContextChange();

        });

        break;

      }

      case 'restore-deleted-map-places': {

        void perform('map-restore', () => store.restoreDeletedMapPlaces(), () => {

          ui.feedback = { text: '已恢复所有隐藏的自动同步场景。' };

          onContextChange();

        });

        break;

      }

      case 'locate-current-place': {

        const placeId = button.dataset.placeId;

        if (!placeId) break;

        ui.mapSelectedPlaceId = placeId;

        ui.mapSheetId = button.dataset.sheetId || '';

        ui.mapScopeId = '';

        render();

        const card = root.querySelector(`[data-place-card="${CSS.escape(placeId)}"]`);

        card?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });

        break;

      }

      case 'select-map-place': {

        const placeId = button.dataset.placeId;

        if (!placeId) break;

        ui.mapSelectedPlaceId = placeId;

        if (button.dataset.hasCharacters === 'true') {

          ui.mapExpandedAvatarPlaceId = ui.mapExpandedAvatarPlaceId === placeId ? '' : placeId;

        } else {

          ui.mapExpandedAvatarPlaceId = '';

        }

        if (!button.matches('summary')) {

          render();

          const card = root.querySelector(`[data-place-card="${CSS.escape(placeId)}"]`);

          card?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });

        }

        break;

      }

      case 'toggle-map-trajectory': {

        ui.mapShowTrajectory = !ui.mapShowTrajectory;

        render();

        break;

      }

      case 'select-map-sheet': {

        const sheetId = button.dataset.sheetId || '';

        ui.mapSheetId = sheetId;

        ui.mapScopeId = '';

        render();

        break;

      }

      case 'drill-map-scope': {

        const scopeId = button.dataset.scopeId ?? '';

        ui.mapScopeId = scopeId;

        ui.mapSelectedPlaceId = scopeId;

        render();

        break;

      }

      case 'toggle-map-edit-mode': {

        ui.mapEditMode = !ui.mapEditMode;

        render();

        break;

      }

      case 'open-map-settings': {

        ui.mapSettingsOpen = true;

        render();

        break;

      }

      case 'close-map-settings': {

        if (event.target !== button && !event.target.closest('[data-action="close-map-settings"]')) break;

        ui.mapSettingsOpen = false;

        render();

        break;

      }

      case 'close-avatar-card': {

        ui.mapExpandedAvatarPlaceId = '';

        render();

        break;

      }

      case 'open-map-ai': {

        const state = store.read();

        const baibaiConnected = Boolean(state?.map?.baibaiConnected || state?.map?.stBaiBaiState || state?.map?.baibaiSnapshot);

        if (!ui.mapAiMode) {

          ui.mapAiMode = baibaiConnected ? 'calibrate' : 'organize';

        }

        ui.mapAiModalOpen = true;

        render();

        break;

      }

      case 'close-map-ai': {

        if (event.target !== button && !event.target.closest('[data-action="close-map-ai"]')) break;

        ui.mapAiModalOpen = false;

        render();

        break;

      }

      case 'set-map-ai-mode': {

        ui.mapAiMode = button.dataset.mode === 'calibrate' ? 'calibrate' : 'organize';

        ui.mapAiResults = null;

        render();

        break;

      }

      case 'run-map-ai': {

        const instInput = root.querySelector('#map-ai-instruction');

        if (instInput) ui.mapAiInstruction = instInput.value;

        const state = store.read();

        const baibaiConnected = Boolean(state?.map?.baibaiConnected || state?.map?.stBaiBaiState || state?.map?.baibaiSnapshot);

        const mode = button.dataset.mode || ui.mapAiMode || (baibaiConnected ? 'calibrate' : 'organize');

        const isCalibrate = mode === 'calibrate';

        void perform('map-ai', async () => {

          if (isCalibrate && typeof mapAi.calibrateBaiBaiMap === 'function') {

            ui.mapAiResults = await mapAi.calibrateBaiBaiMap({ instruction: ui.mapAiInstruction });

          } else {

            ui.mapAiResults = await mapAi.organizeMap({ instruction: ui.mapAiInstruction });

          }

        });

        break;

      }

      case 'save-map-ai-results': {

        const results = ui.mapAiResults;

        if (!results || !Array.isArray(results.places)) break;

        const selectedPlaces = results.places.filter(p => p.selected !== false);

        if (!selectedPlaces.length) {

          ui.feedback = { error: true, text: '请至少勾选一处要应用的地点。' };

          render();

          break;

        }

        if (results.overrides && typeof store.saveBaiBaiOverrides === 'function') {

          const filteredOverrides = {};

          for (const p of selectedPlaces) {

            if (results.overrides[p.id]) {

              filteredOverrides[p.id] = results.overrides[p.id];

            }

          }

          void perform('map-ai-save', () => store.saveBaiBaiOverrides(filteredOverrides, {

            basemap: results.basemap,

          }), () => {

            ui.mapAiModalOpen = false;

            ui.mapAiResults = null;

            ui.feedback = { text: `已成功校准并锁定 ${selectedPlaces.length} 处百宝书地点的空间方位与层级。` };

            onContextChange();

          });

        } else {

          const modeSelect = root.querySelector('#map-ai-save-mode');

          const mode = modeSelect?.value === 'replace' ? 'replace' : 'merge';

          void perform('map-ai-save', () => store.saveMapFromAi({

            basemap: results.basemap,

            currentLocation: results.currentLocation,

            places: selectedPlaces,

          }, { mode }), () => {

            ui.mapAiModalOpen = false;

            ui.mapAiResults = null;

            ui.feedback = { text: `已将 ${selectedPlaces.length} 处地点应用到地图。` };

            onContextChange();

          });

        }

        break;

      }

      case 'rollback-map-ai': {

        void perform('map-rollback', () => store.rollbackMapAi(), () => {

          ui.mapAiResults = null;

          ui.feedback = { text: '已撤回本次 AI 地图变动，恢复到上一状态。' };

          onContextChange();

        });

        break;

      }

      case 'reset-map': {

        if (!confirm('确定要将地图重置为初始状态吗？这将清空所有 AI 构想地点与方位校准便签（原百宝书剧情不受影响，且可再次撤回）。')) break;

        void perform('map-reset', () => store.resetMap(), () => {

          ui.mapAiResults = null;

          ui.mapSettingsOpen = false;

          ui.feedback = { text: '地图已重置为初始状态（如需恢复可点击撤回）。' };

          onContextChange();

        });

        break;

      }

      case 'add-workday-slot': {

        const state = store.read();

        const cal = state.calendar || {};

        const config = cal.workdayConfig || defaultWorkdayConfig();

        const slots = Array.isArray(config.timeSlots) ? [...config.timeSlots] : [];

        slots.push({

          id: `slot:${Date.now().toString(36)}`,

          enabled: true,

          dayType: 'workday',

          startTime: '09:00',

          endTime: '18:00',

          prompt: '',

        });

        void perform('calendar-workday', () => store.setCalendarWorkdayConfig({ timeSlots: slots }), render);

        break;

      }

      case 'remove-workday-slot': {

        const sIdx = Number(button.dataset.slotIndex);

        if (Number.isNaN(sIdx)) break;

        const state = store.read();

        const cal = state.calendar || {};

        const config = cal.workdayConfig || defaultWorkdayConfig();

        const slots = Array.isArray(config.timeSlots) ? [...config.timeSlots] : [];

        slots.splice(sIdx, 1);

        void perform('calendar-workday', () => store.setCalendarWorkdayConfig({ timeSlots: slots }), render);

        break;

      }

      case 'toggle-workday-day': {

        button.classList.toggle('is-active');

        const isActive = button.classList.contains('is-active');

        button.style.borderColor = isActive ? 'var(--pp-bronze)' : 'var(--pp-divider-soft)';

        button.style.backgroundColor = isActive ? 'var(--pp-bronze)' : 'var(--pp-control-surface)';

        button.style.color = isActive ? '#fff' : 'var(--pp-text)';

        break;

      }

      case 'save-workday-config': {

        const enabled = root.querySelector('#cal-w-enabled')?.checked === true;

        const prevConfig = store.read()?.calendar?.workdayConfig || defaultWorkdayConfig();

        const injectStory = prevConfig.injectStory ?? true;

        const activeDayPills = Array.from(root.querySelectorAll('.workday-day-pill.is-active'));

        const checkedDays = activeDayPills.map(el => Number(el.dataset.day));

        const overlap = root.querySelector('#cal-w-overlap')?.value || 'festival_overrides';

        const workdayPrompt = root.querySelector('#cal-w-workday-prompt')?.value || '';

        const holidayPrompt = root.querySelector('#cal-w-holiday-prompt')?.value || '';

        const slotCards = Array.from(root.querySelectorAll('.workday-slot-card'));

        const timeSlots = slotCards.map(card => {

          const dayType = card.querySelector('.workday-slot-daytype')?.value || 'all';

          const startTime = card.querySelector('.workday-slot-start')?.value || '09:00';

          const endTime = card.querySelector('.workday-slot-end')?.value || '18:00';

          const prompt = card.querySelector('.workday-slot-prompt')?.value || '';

          return { dayType, startTime, endTime, prompt, enabled: true };

        });

        void perform('calendar-workday', () => store.setCalendarWorkdayConfig({

          enabled,

          injectStory,

          workdays: checkedDays,

          holidayOverlapStrategy: overlap,

          workdayPrompt,

          holidayPrompt,

          timeSlots,

        }), () => {

          ui.calendarSettingsOpen = false;

          ui.feedback = { text: '已保存工作日与作息配置。' };

          onContextChange();

        });

        break;

      }

      case 'save-calendar-weather-config': {

        const enabled = root.querySelector('#cal-we-enabled')?.checked === true;

        const worldEra = root.querySelector('#cal-we-era')?.value || 'auto';

        const defaultCity = root.querySelector('#cal-we-city')?.value?.trim() || '北京';

        const solarTermsEnabled = root.querySelector('#cal-we-solar')?.checked !== false;

        const continuity = Math.max(0, Math.min(100, Number(root.querySelector('#cal-we-continuity')?.value) || 80));

        const prevConfig = store.read()?.calendar?.weatherConfig || {};

        const injectPrompt = prevConfig.injectPrompt !== false;

        void perform('calendar-weather', () => store.setCalendarWeatherConfig({

          ...prevConfig,

          enabled,

          worldEra,

          defaultCity,

          injectPrompt,

          solarTermsEnabled,

          continuity,

        }), () => {

          ui.calendarSettingsOpen = false;

          ui.feedback = { text: '已保存天气配置。' };

          onContextChange();

        });

        break;

      }

      case 'lock-calendar-weather': {

        const dateKey = button.dataset.date;

        if (!dateKey) break;

        const typeSelect = root.querySelector('#cal-we-lock-type');

        const tempInput = root.querySelector('#cal-we-lock-temp');

        const type = typeSelect?.value || 'sunny';

        const typeText = typeSelect?.options?.[typeSelect.selectedIndex]?.text?.replace(/^[^\s]+\s*/, '') || '晴朗';

        const temp = Number(tempInput?.value) || 20;

        const extreme = ['heavy_rain', 'heavy_snow', 'thunderstorm', 'typhoon', 'heatwave', 'blizzard'].includes(type);

        const prevConfig = store.read()?.calendar?.weatherConfig || {};

        const overrides = { ...(prevConfig.weatherOverrides || {}) };

        overrides[dateKey] = {

          type,

          cn: typeText,

          temp,

          extreme,

          note: '剧情锁定',

        };

        void perform('calendar-weather', () => store.setCalendarWeatherConfig({

          ...prevConfig,

          weatherOverrides: overrides,

        }), () => {

          ui.feedback = { text: `已锁定 ${dateKey} 天气为「${typeText} ${temp}°C」` };

          onContextChange();

        });

        break;

      }

      case 'unlock-calendar-weather': {

        const dateKey = button.dataset.date;

        if (!dateKey) break;

        const prevConfig = store.read()?.calendar?.weatherConfig || {};

        const overrides = { ...(prevConfig.weatherOverrides || {}) };

        delete overrides[dateKey];

        void perform('calendar-weather', () => store.setCalendarWeatherConfig({

          ...prevConfig,

          weatherOverrides: overrides,

        }), () => {

          ui.feedback = { text: `已解除 ${dateKey} 的天气锁定` };

          onContextChange();

        });

        break;

      }

      case 'add-calendar-weather-map': {

        const from = root.querySelector('#cal-we-map-from')?.value?.trim();

        const to = root.querySelector('#cal-we-map-to')?.value?.trim();

        if (!from || !to) {

          ui.feedback = { text: '请同时填写古地名和现代城市' };

          render();

          break;

        }

        const prevConfig = store.read()?.calendar?.weatherConfig || {};

        const mapList = Array.isArray(prevConfig.ancientLocationMap) ? [...prevConfig.ancientLocationMap] : [];

        const existingIdx = mapList.findIndex(m => m.from === from);

        if (existingIdx >= 0) {

          mapList[existingIdx] = { from, to };

        } else {

          mapList.push({ from, to });

        }

        void perform('calendar-weather', () => store.setCalendarWeatherConfig({

          ...prevConfig,

          ancientLocationMap: mapList,

        }), () => {

          ui.feedback = { text: `已添加古地名映射「${from} → ${to}」` };

        });

        break;

      }

      case 'remove-calendar-weather-map': {

        const idx = Number(button.dataset.index);

        const prevConfig = store.read()?.calendar?.weatherConfig || {};

        const mapList = Array.isArray(prevConfig.ancientLocationMap) ? [...prevConfig.ancientLocationMap] : [];

        if (idx >= 0 && idx < mapList.length) {

          const removed = mapList.splice(idx, 1)[0];

          void perform('calendar-weather', () => store.setCalendarWeatherConfig({

            ...prevConfig,

            ancientLocationMap: mapList,

          }), () => {

            ui.feedback = { text: `已移除映射「${removed?.from}」` };

          });

        }

        break;

      }

      case 'reroll-calendar-weather': {

        const prevConfig = store.read()?.calendar?.weatherConfig || {};

        const nextSalt = ((Number(prevConfig.seedSalt) || 0) + 1);

        void perform('calendar-weather', () => store.setCalendarWeatherConfig({

          ...prevConfig,

          seedSalt: nextSalt,

        }), () => {

          ui.feedback = { text: '已重新生成当前天气。' };

          onContextChange();

        });

        break;

      }

      case 'authoring': ui.view = 'authoring'; ui.feedback = null; render(); break;

      case 'back-authoring': goBack(); break;

      case 'export-card':

        void perform('export', () => authoring.exportScript({ coreUrl: ui.exportLocal ? LOCAL_CORE_URL : REMOTE_CORE_URL }), result => {

          const url = URL.createObjectURL(new Blob([JSON.stringify(result.script, null, 2)], { type: 'application/json' }));

          const link = doc.createElement('a'); link.href = url; link.download = result.filename; doc.body.append(link); link.click(); link.remove();

          setTimeout(() => URL.revokeObjectURL(url), 0);

          ui.feedback = { text: '酒馆助手脚本已导出。' };

        });

        break;

      case 'attachments': ui.attachment = ui.attachment ? '' : 'menu'; ui.selectedMessage = ''; ui.chatMenu = false; render(); break;

      case 'choose-stickers': ui.attachment = 'stickers'; render(); break;

      case 'choose-location': ui.attachment = 'location'; ui.attachmentDraft = {}; render(); break;

      case 'choose-transfer': ui.attachment = 'transfer'; ui.attachmentDraft = { currency: 'CNY' }; render(); break;

      case 'choose-games': ui.attachment = 'games'; ui.attachmentDraft = { wager: '答应赢家一个要求' }; render(); break;

      case 'fold-game-board': ui.gameBoardFolded = true; ui.gameGuideOpen = false; render(); break;

      case 'unfold-game-board': ui.gameBoardFolded = false; render(); break;

      case 'close-game-board': {

        if (ui.activeGame?.status === 'playing') {

          ui.gameBoardFolded = true;

          ui.gameGuideOpen = false;

        } else {

          ui.activeGame = null;

          ui.activeGameMessageId = '';

          ui.gameBoardFolded = false;

          ui.gameGuideOpen = false;

        }

        render();

        break;

      }

      case 'close-game-guide': ui.gameGuideOpen = false; render(); break;

      case 'toggle-game-guide': ui.gameGuideOpen = !ui.gameGuideOpen; render(); break;

      case 'switch-game-guide-tab': ui.gameGuideTab = button.dataset.guideTab || 'guide'; render(); break;

      case 'toggle-game-fold': {

        const foldId = button.dataset.foldId;

        if (!ui.expandedGameFolds) ui.expandedGameFolds = new Set();

        if (ui.expandedGameFolds.has(foldId)) {

          ui.expandedGameFolds.delete(foldId);

        } else {

          ui.expandedGameFolds.add(foldId);

        }

        render();

        break;

      }

      case 'surrender-game': {

        if (ui.activeGame && ui.activeGame.status === 'playing') {

          const gameKind = ui.activeGame.kind;

          ui.activeGame.status = 'finished';

          ui.activeGame.winner = 'ai';

          ui.activeGame.loser = 'user';

          ui.activeGame.lastAction = { type: 'surrender', actor: 'user', description: '你选择提前认输，对方获得了胜利！' };

          const convId = conversationId(), service = ui.view === 'group-chat' ? groups : messages;

          const batch = ui.batch;

          const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

          const sysMsg = {

            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

            role: 'system',

            type: 'game-action',

            gameKind,

            text: '你选择提前认输，对方获得了胜利！',

            timeLabel,

            ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

            ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

          };

          void perform(`game:${ui.activeGame.id}`, async () => {

            if (ui.activeGameMessageId) {

              await store.updateGameMessage(convId, ui.activeGameMessageId, ui.activeGame);

            }

            await store.appendMessages(convId, [sysMsg]);

            await service.continueChat(convId);

          }, onContextChange);

        }

        break;

      }

      case 'edit-game-wager': {

        const convId = conversationId();

        const service = ui.view === 'group-chat' ? groups : messages;

        const currentWager = ui.activeGame?.wager || '答应赢家一个要求';

        const newWager = await promptWagerDialog(currentWager);

        if (newWager && newWager !== currentWager) {

          if (ui.activeGame) {

            ui.activeGame.wager = newWager;

            if (ui.activeGame.state) ui.activeGame.state.wager = newWager;

          }

          const batch = ui.batch;

          const timeLabel = ui.batch?.clock?.time || new Date().toTimeString().slice(0, 5);

          const currentStore = store.read();

          const user = currentStore.userProfile || { name: ui.defaultUser || '我' };

          const userName = displayName(user) || '你';

          const targetGameMsgId = ui.activeGameMessageId || currentStore.conversations[convId]?.findLast(m => m.type === 'game')?.id;

          const sysMsg = {

            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

            role: 'system',

            type: 'game-action',

            text: `【${userName}】将本局赌注变更为【${newWager}】`,

            timeLabel,

            ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),

            ...(batch?.clock?.source === 'story' ? { storyDate: batch.clock.date, storyWeekday: batch.clock.weekday } : {}),

          };

          render();

          void perform(`continue:${convId}`, async () => {

            if (targetGameMsgId && ui.activeGame) {

              await store.updateGameMessage(convId, targetGameMsgId, ui.activeGame);

            }

            await store.appendMessages(convId, [sysMsg]);

            await service.continueChat(convId);

            const latestStore = store.read();

            const updatedMsg = latestStore.conversations?.[convId]?.find(m => m.id === targetGameMsgId);

            if (updatedMsg?.game) {

              ui.activeGame = updatedMsg.game.state || updatedMsg.game;

              render();

            }

          }, onContextChange);

        }

        break;

      }

      case 'close-attachment': ui.attachment = ''; render(); break;

      case 'close-photo': ui.photo = null; render(); break;

      case 'photo': {

        const message = store.read().conversations[id]?.find(item => item.id === button.dataset.photo);

        if (message?.image.path) void viewPhoto(() => store.read().conversations[id]?.find(item => item.id === button.dataset.photo)?.image);

        else void perform(`image:${button.dataset.photo}`, () => images.generate(id, button.dataset.photo));

        break;

      }

      case 'back-inbox':

      case 'back-forum': goBack(); break;

      case 'profile': editProfile('contact', id); break;

      case 'edit-user': editProfile('user'); break;

      case 'add-contact': editProfile('contact'); break;

      case 'inbox-menu': ui.inboxMenu = !ui.inboxMenu; render(); break;

      case 'add-group': editGroup(); break;

      case 'edit-group': editGroup(ui.groupId); break;

      case 'back-group': goBack(); break;

      case 'organize': ui.inboxMenu = false; void perform('directory', () => directory.organize(), result => { ui.feedback = { text: result.contacts.length || result.groups.length ? `新增 ${result.contacts.length} 位联系人、${result.groups.length} 个群聊。` : '没有需要新增的联系人或群聊。' }; onContextChange(); }); break;

      case 'manual-summary': {

        ui.inboxMenu = false;

        void perform('summary', async () => {

          if (!summarizeBackflow) throw new Error('未提供短信总结服务。');

          return await summarizeBackflow();

        }, summary => {

          const charLen = Array.from(summary || '').length;

          ui.feedback = { text: summary ? `短信总结已完成并保存（${charLen}字）：${summary.slice(0, 30)}...` : '短信总结已更新。' };

          onContextChange();

        });

        break;

      }

      case 'remove-contact':

      case 'remove-group': {

        const group = button.dataset.action === 'remove-group';

        const key = group ? ui.view === 'group-profile' ? ui.groupEditId : ui.groupId : ui.view === 'contact-profile' ? ui.editId : ui.contactId;

        const person = (group ? store.read().groups || [] : store.read().contacts).find(item => item.id === key);

        ui.deletion = { kind: group ? 'group' : 'contact', id: key, name: person.name, from: ui.view };

        ui.chatMenu = false; ui.view = 'delete-confirm'; render(); break;

      }

      case 'cancel-delete': goBack(); break;

      case 'confirm-delete': {

        const item = ui.deletion;

        void perform('remove', () => item.kind === 'group' ? store.deleteGroup(item.id) : store.deleteContact(item.id), () => { ui.drafts.delete(item.id); ui.selectedMessage = ''; ui.profileDraft = {}; ui.groupDraft = {}; ui.deletion = null; ui.view = 'inbox'; onContextChange(); });

        break;

      }

      case 'back-profile': goBack(); break;

      case 'remove-avatar': (ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft).avatar = ''; render(); break;

      case 'refine-style': {

        const draft = ui.profileDraft, original = draft.expression, contactId = ui.editId;

        void perform('style', () => messages.refineOnlineStyle(contactId), result => {

          if (draft.expression === original) draft.expression = result;

          else ui.feedback = { text: '你已手动修改线上方式，保留当前编辑。' };

        });

        break;

      }

      case 'chat-menu': ui.chatMenu = !ui.chatMenu; ui.selectedMessage = ''; render(); break;

      case 'clear-chat': ui.confirmClear = true; ui.chatMenu = false; render(); break;

      case 'cancel-clear': ui.confirmClear = false; render(); break;

      case 'confirm-clear': {

        const anchor = ui.batch;

        void perform(`clear:${id}`, () => store.clearConversation(id, anchor), () => { ui.confirmClear = false; ui.selectedMessage = ''; ui.drafts.delete(id); onContextChange(); }); break;

      }

      case 'delete-message': {

        const messageId = ui.selectedMessage;

        void perform(`delete:${id}`, () => store.deleteMessage(id, messageId), () => { ui.selectedMessage = ''; ui.reactionMoreMessageId = ''; if (ui.replyToId === messageId) ui.replyToId = ''; onContextChange(); }); break;

      }

      case 'reply-message': {

        if (!inChat()) break;

        ui.replyToId = ui.selectedMessage; ui.selectedMessage = ''; ui.reactionMoreMessageId = ''; render(); root.querySelector('#sms-draft')?.focus({ preventScroll: true }); break;

      }

      case 'cancel-reply': ui.replyToId = ''; render(); root.querySelector('#sms-draft')?.focus({ preventScroll: true }); break;

      case 'react-message': {

        const messageId = button.dataset.messageId || ui.selectedMessage;

        const emoji = button.dataset.emoji;

        if (!messageId || !emoji) break;

        void perform(`react:${messageId}`, () => store.toggleMessageReaction(id, messageId, emoji), () => {

          ui.selectedMessage = '';

          ui.reactionMoreMessageId = '';

          onContextChange();

        });

        break;

      }

      case 'toggle-reaction-more': {

        const messageId = button.dataset.messageId || ui.selectedMessage;

        ui.reactionMoreMessageId = ui.reactionMoreMessageId === messageId ? '' : messageId;

        render();

        break;

      }

      case 'toggle-message-reaction': {

        const messageId = button.dataset.messageId;

        const emoji = button.dataset.emoji;

        if (!messageId || !emoji) break;

        void perform(`react:${messageId}`, () => store.toggleMessageReaction(id, messageId, emoji), onContextChange);

        break;

      }

      case 'edit-message': {

        const msg = (store.read().conversations[id] || []).find(item => item.id === ui.selectedMessage);

        if (!msg || msg.type || msg.withdrawn) break;

        ui.editingMessageId = msg.id;

        ui.editingMessageDraft = msg.text || '';

        ui.selectedMessage = '';

        ui.reactionMoreMessageId = '';

        render();

        root.querySelector('#message-edit-textarea')?.focus({ preventScroll: true });

        break;

      }

      case 'cancel-edit-message': {

        ui.editingMessageId = '';

        ui.editingMessageDraft = undefined;

        render();

        break;

      }

      case 'save-edit-message': {

        const messageId = ui.editingMessageId;

        const textarea = root.querySelector('#message-edit-textarea');

        const nextText = (textarea ? textarea.value : (ui.editingMessageDraft ?? '')).trim();

        if (!messageId || !nextText) {

          ui.feedback = { error: true, text: '消息内容不能为空。' };

          render();

          break;

        }

        void perform(`edit:${messageId}`, () => store.editMessage(id, messageId, nextText), () => {

          ui.editingMessageId = '';

          ui.editingMessageDraft = undefined;

          onContextChange();

        });

        break;

      }

      case 'copy-message':

      case 'copy-favorite-item': {

        const messageId = button.dataset.messageId || ui.selectedMessage;

        const msg = (store.read().conversations[id] || []).find(item => item.id === messageId);

        if (msg) {

          const textToCopy = msg.text || '';

          if (textToCopy && globalThis.navigator?.clipboard?.writeText) {

            void globalThis.navigator.clipboard.writeText(textToCopy);

          }

          ui.selectedMessage = '';

          ui.reactionMoreMessageId = '';

          ui.feedback = { text: '已复制消息内容。' };

          render();

        }

        break;

      }

      case 'favorite-message': {

        const messageId = ui.selectedMessage;

        if (!messageId) break;

        void perform(`fav:${messageId}`, () => store.toggleFavoriteMessage(id, messageId), () => {

          const updated = (store.read().conversations[id] || []).find(item => item.id === messageId);

          ui.selectedMessage = '';

          ui.reactionMoreMessageId = '';

          ui.feedback = { text: updated?.favorite ? '已加入收藏。' : '已取消收藏。' };

          onContextChange();

        });

        break;

      }

      case 'unfavorite-item': {

        const messageId = button.dataset.messageId;

        if (!messageId) break;

        void perform(`fav:${messageId}`, () => store.toggleFavoriteMessage(id, messageId), onContextChange);

        break;

      }

      case 'open-favorites': {

        ui.chatMenu = false;

        ui.favoritesOpen = true;

        render();

        break;

      }

      case 'close-favorites': {

        ui.favoritesOpen = false;

        render();

        break;

      }

      case 'withdraw-message': {

        const messageId = ui.selectedMessage;

        if (!messageId) break;

        void perform(`withdraw:${messageId}`, () => store.withdrawMessage(id, messageId), () => {

          ui.selectedMessage = '';

          ui.reactionMoreMessageId = '';

          if (ui.replyToId === messageId) ui.replyToId = '';

          onContextChange();

        });

        break;

      }

      case 'reedit-withdrawn': {

        const messageId = button.dataset.messageId;

        const msg = (store.read().conversations[id] || []).find(item => item.id === messageId);

        if (msg?.withdrawnText) {

          const currentDraft = ui.drafts.get(id) || '';

          ui.drafts.set(id, currentDraft ? `${currentDraft} ${msg.withdrawnText}` : msg.withdrawnText);

          render();

          const draftNode = root.querySelector('#sms-draft');

          if (draftNode) {

            draftNode.focus({ preventScroll: true });

            draftNode.setSelectionRange(draftNode.value.length, draftNode.value.length);

            resizeDraft();

          }

        }

        break;

      }

      case 'delete-system-message': {

        const messageId = button.dataset.messageId;

        if (!messageId) break;

        void perform(`delete:${id}`, () => store.deleteMessage(id, messageId), onContextChange);

        break;

      }

      case 'forward-message': {

        if (!ui.selectedMessage) break;

        const state = store.read();

        const defaultTarget = state.contacts.find(c => c.id !== id)?.id || state.contacts[0]?.id || state.groups?.find(g => g.userIsMember !== false)?.id || '';

        ui.forwardMessageIds = [ui.selectedMessage];

        ui.forwardTargetId = defaultTarget;

        ui.forwardNote = '';

        ui.selectedMessage = '';

        ui.reactionMoreMessageId = '';

        render();

        break;

      }

      case 'batch-forward': {

        const ids = [...(ui.selectedMessageIds || [])];

        if (!ids.length) break;

        const state = store.read();

        const defaultTarget = state.contacts.find(c => c.id !== id)?.id || state.contacts[0]?.id || state.groups?.find(g => g.userIsMember !== false)?.id || '';

        ui.forwardMessageIds = ids;

        ui.forwardTargetId = defaultTarget;

        ui.forwardNote = '';

        render();

        break;

      }

      case 'select-forward-target': {

        ui.forwardTargetId = button.dataset.targetId || '';

        render();

        break;

      }

      case 'close-forward': {

        ui.forwardMessageIds = [];

        ui.forwardTargetId = '';

        ui.forwardNote = '';

        render();

        break;

      }

      case 'confirm-forward': {

        const forwardIds = [...(ui.forwardMessageIds || [])];

        const targetId = ui.forwardTargetId;

        const noteInput = root.querySelector('#forward-note-input');

        const note = noteInput ? noteInput.value : (ui.forwardNote || '');

        if (!forwardIds.length || !targetId) break;

        const batch = ui.batch;

        void perform(`forward:${targetId}`, () => store.forwardMessages(id, forwardIds, targetId, batch, note), () => {

          ui.forwardMessageIds = [];

          ui.forwardTargetId = '';

          ui.forwardNote = '';

          ui.multiSelectMode = false;

          ui.selectedMessageIds = new Set();

          ui.multiSelectAnchorId = '';

          ui.feedback = { text: `已转发 ${forwardIds.length} 条消息。` };

          onContextChange();

        });

        break;

      }

      case 'multi-select-message': {

        const startId = ui.selectedMessage;

        ui.multiSelectMode = true;

        ui.selectedMessageIds = new Set(startId ? [startId] : []);

        ui.multiSelectAnchorId = startId || '';

        ui.selectedMessage = '';

        ui.reactionMoreMessageId = '';

        ui.chatMenu = false;

        render();

        break;

      }

      case 'enter-multi-select': {

        ui.multiSelectMode = true;

        ui.selectedMessageIds = new Set();

        ui.multiSelectAnchorId = '';

        ui.selectedMessage = '';

        ui.chatMenu = false;

        render();

        break;

      }

      case 'toggle-select-message': {

        const msgId = button.dataset.messageId;

        if (!msgId) break;

        if (!(ui.selectedMessageIds instanceof Set)) ui.selectedMessageIds = new Set();

        if (ui.selectedMessageIds.has(msgId)) {

          ui.selectedMessageIds.delete(msgId);

          if (ui.multiSelectAnchorId === msgId) {

            ui.multiSelectAnchorId = [...ui.selectedMessageIds].at(-1) || '';

          }

        } else {

          ui.selectedMessageIds.add(msgId);

          ui.multiSelectAnchorId = msgId;

        }

        render();

        break;

      }

      case 'select-range-to': {

        const endId = button.dataset.messageId;

        const anchorId = ui.multiSelectAnchorId;

        if (!endId || !anchorId) break;

        const { current: history } = partitionHistory(store.read().conversations[id] || [], ui.batch);

        const visible = history.slice(-ui.visibleMessages).filter(m => !m.withdrawn && m.type !== 'poke');

        const startIdx = visible.findIndex(m => m.id === anchorId);

        const endIdx = visible.findIndex(m => m.id === endId);

        if (startIdx !== -1 && endIdx !== -1) {

          const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

          for (let i = from; i <= to; i++) {

            ui.selectedMessageIds.add(visible[i].id);

          }

          ui.multiSelectAnchorId = endId;

          render();

        }

        break;

      }

      case 'batch-favorite': {

        const ids = [...(ui.selectedMessageIds || [])];

        if (!ids.length) break;

        void perform(`fav-batch:${id}`, () => store.favoriteMessages(id, ids, true), () => {

          ui.multiSelectMode = false;

          ui.selectedMessageIds = new Set();

          ui.multiSelectAnchorId = '';

          ui.feedback = { text: `已收藏 ${ids.length} 条消息。` };

          onContextChange();

        });

        break;

      }

      case 'batch-delete': {

        const ids = [...(ui.selectedMessageIds || [])];

        if (!ids.length) break;

        void perform(`delete:${id}`, () => store.deleteMessages(id, ids), () => {

          if (ids.includes(ui.replyToId)) ui.replyToId = '';

          ui.multiSelectMode = false;

          ui.selectedMessageIds = new Set();

          ui.multiSelectAnchorId = '';

          onContextChange();

        });

        break;

      }

      case 'leave-multi-select': {

        ui.multiSelectMode = false;

        ui.selectedMessageIds = new Set();

        ui.multiSelectAnchorId = '';

        render();

        break;

      }

      case 'poke-contact': {

        const msg = (store.read().conversations[id] || []).find(item => item.id === ui.selectedMessage);

        const state = store.read();

        const targetPerson = ui.view === 'group-chat'

          ? state.contacts.find(p => p.id === msg?.speakerId)

          : state.contacts.find(p => p.id === id);

        if (targetPerson) {

          sendPoke(targetPerson.id, displayName(targetPerson));

        }

        break;

      }

      case 'poke-chat-partner': {

        const contact = store.read().contacts.find(p => p.id === id);

        if (contact) sendPoke(contact.id, displayName(contact));

        break;

      }

      case 'toggle-thought': {

        const msgId = button.dataset.messageId;

        if (!msgId) break;

        ui.thoughtMessageId = ui.thoughtMessageId === msgId ? '' : msgId;

        render();

        break;

      }

      case 'toggle-reasoning': {

        const msgId = button.dataset.messageId;

        if (!msgId) break;

        if (!ui.openReasoningIds) ui.openReasoningIds = new Set();

        if (ui.openReasoningIds.has(msgId)) {

          ui.openReasoningIds.delete(msgId);

        } else {

          ui.openReasoningIds.add(msgId);

        }

        render();

        break;

      }

      case 'open-message-thought': {

        const msgId = ui.selectedMessage;

        if (!msgId) break;

        ui.thoughtMessageId = msgId;

        ui.selectedMessage = '';

        ui.reactionMoreMessageId = '';

        const msg = (store.read().conversations[id] || []).find(item => item.id === msgId);

        render();

        if (msg && !msg.thought && messages.generateThought) {

          void perform(`thought:${msgId}`, () => messages.generateThought(id, msgId, msg.speakerId || ''));

        }

        break;

      }

      case 'generate-thought': {

        const msgId = button.dataset.messageId || ui.thoughtMessageId;

        const speakerId = button.dataset.speakerId || '';

        if (!msgId || !messages.generateThought) break;

        void perform(`thought:${msgId}`, () => messages.generateThought(id, msgId, speakerId));

        break;

      }

      case 'close-thought': {

        ui.thoughtMessageId = '';

        render();

        break;

      }

      case 'earlier': ui.visibleMessages += 60; render(); break;

      case 'history': ui.historyOpen = !ui.historyOpen; ui.selectedMessage = ''; render(); break;

      case 'earlier-history': ui.visibleHistory += 60; render(); break;

      case 'dismiss': ui.feedback = null; render(); break;

      case 'close': close(); break;

      case 'send': {

        const text = (ui.drafts.get(id) || '').trim();

        if (text) void perform(`send:${id}`, () => service.send(id, text, { replyToId: ui.replyToId }), () => { if ((ui.drafts.get(id) || '').trim() === text) ui.drafts.set(id, ''); ui.replyToId = ''; onContextChange(); });

        break;

      }

      case 'continue': void perform(`continue:${id}`, () => service.continueChat(id), onContextChange); break;

      case 'refresh': void perform('forum', () => forum.refresh()); break;

      case 'restore-wallpaper': { const theme = store.read().theme; void perform('wallpaper', () => wallpaper.restore(theme)); break; }

      case 'models-menu': ui.modelsOpen = !ui.modelsOpen; render(); if (ui.modelsOpen) root.querySelector('#model-search').focus(); break;

      case 'fetch-models': {

        const draft = { ...ui.apiDraft };

        void perform('models', () => apiSettings.fetchModels(draft), models => {

          if (ui.apiDraft.url !== draft.url || ui.apiDraft.key !== draft.key) { ui.feedback = { text: '连接已修改，请重新拉取模型。' }; return; }

          ui.models = models; ui.modelSearch = ''; ui.modelsOpen = true;

          if (!ui.apiDraft.model) ui.apiDraft.model = models[0];

        });

        break;

      }

      case 'switch-prompt-settings-tab': {

        ui.promptSettingsTab = button.dataset.promptTab || 'presets';

        render();

        break;

      }

      case 'cycle-entry-role': {

        const entryId = button.dataset.entryId;

        const currentActiveId = store.read()?.activePresetId || 'default_preset';

        if (!entryId) break;

        const presets = normalizePromptPresets(store.read()?.promptPresets);

        const preset = presets.find(p => p.id === currentActiveId) || presets[0];

        const entry = preset?.entries?.find(e => e.id === entryId);

        if (entry) {

          const roles = ['system', 'user', 'assistant'];

          const currentIdx = roles.indexOf(entry.role || 'system');

          const nextRole = roles[(currentIdx + 1) % roles.length];

          void store.updatePresetEntry(currentActiveId, entryId, { role: nextRole }).then(() => render());

        }

        break;

      }

      case 'toggle-preset-entry-fold': {

        const entryId = button.dataset.entryId;

        if (!entryId) break;

        if (!(ui.expandedPresetEntries instanceof Set)) ui.expandedPresetEntries = new Set();

        if (ui.expandedPresetEntries.has(entryId)) {

          ui.expandedPresetEntries.delete(entryId);

        } else {

          ui.expandedPresetEntries.add(entryId);

        }

        render();

        break;

      }

      case 'toggle-prompt-card': {

        const promptId = button.dataset.promptId;

        if (!promptId) break;

        if (!(ui.expandedPrompts instanceof Set)) ui.expandedPrompts = new Set();

        if (ui.expandedPrompts.has(promptId)) {

          ui.expandedPrompts.delete(promptId);

        } else {

          ui.expandedPrompts.add(promptId);

        }

        render();

        break;

      }

      case 'toggle-scope-dropdown': {

        const entryId = button.dataset.entryId;

        if (!entryId) break;

        ui.openScopeEntryId = ui.openScopeEntryId === entryId ? null : entryId;

        render();

        break;

      }

      case 'close-scope-dropdown': {

        ui.openScopeEntryId = null;

        render();

        break;

      }

      case 'toggle-scope-item': {

        const entryId = button.dataset.entryId;

        const scopeName = button.dataset.scopeName;

        const currentActiveId = store.read()?.activePresetId || 'default_preset';

        const presets = normalizePromptPresets(store.read()?.promptPresets);

        const preset = presets.find(p => p.id === currentActiveId) || presets[0];

        const entry = preset?.entries?.find(e => e.id === entryId);

        if (entryId && scopeName && entry) {

          const nextScope = toggleScopeSelection(entry.scope, scopeName);

          void store.updatePresetEntry(currentActiveId, entryId, { scope: nextScope }).then(() => render());

        }

        break;

      }

      case 'export-prompt-preset': {

        const presets = normalizePromptPresets(store.read()?.promptPresets);

        const presetId = button.dataset.presetId || store.read()?.activePresetId || 'default_preset';

        const targetPreset = presets.find(p => p.id === presetId) || presets[0];

        if (!targetPreset) {

          ui.feedback = { text: '未找到可导出的预设。' };

          render();

          break;

        }

        try {

          const exportPayload = exportPresetToPayload(targetPreset);

          const safeName = (targetPreset.name || 'preset').replace(/[/\\?%*:|"<>]/g, '_');

          const filename = `TMT-Preset-${safeName}.json`;

          const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });

          const url = URL.createObjectURL(blob);

          const link = doc.createElement('a');

          link.href = url;

          link.download = filename;

          doc.body.append(link);

          link.click();

          link.remove();

          setTimeout(() => URL.revokeObjectURL(url), 0);

          ui.feedback = { text: `已导出预设「${targetPreset.name}」。` };

        } catch (err) {

          ui.feedback = { text: `导出失败：${err?.message || err}` };

        }

        render();

        break;

      }

      case 'import-prompt-preset-btn': {

        const fileInput = root.querySelector('.preset-import-file-input');

        if (fileInput) {

          fileInput.value = '';

          fileInput.click();

        }

        break;

      }

      case 'clear-preset-search': {

        ui.presetSearch = '';

        render();

        break;

      }

      case 'open-new-preset-dialog': {

        const name = prompt('请输入新预设的名称：', '我的自定义预设');

        if (!name || !name.trim()) break;

        const currentActiveId = store.read()?.activePresetId || 'default_preset';

        void perform('prompt-preset', () => store.createPromptPreset({ name: name.trim(), copyFromId: currentActiveId }), () => {

          ui.feedback = { text: `已创建预设「${name.trim()}」。` };

        });

        break;

      }

      case 'reset-prompt-preset': {

        const presetId = button.dataset.presetId;

        if (!presetId) break;

        if (!confirm('确定要将该预设重置为最新默认条目配置吗？')) break;

        void perform('prompt-preset', () => store.resetPromptPreset(presetId), () => {

          ui.feedback = { text: '已将预设重置为最新默认条目配置。' };

        });

        break;

      }

      case 'delete-prompt-preset': {

        const presetId = button.dataset.presetId;

        if (!presetId) break;

        if (!confirm('确定要删除此预设吗？')) break;

        void perform('prompt-preset', () => store.deletePromptPreset(presetId), () => {

          ui.feedback = { text: '已删除预设。' };

        });

        break;

      }

      case 'add-preset-entry': {

        const currentActiveId = store.read()?.activePresetId || 'default_preset';

        void perform('prompt-preset', () => store.addPresetEntry(currentActiveId, { name: '新条目', role: 'system', content: '' }), () => {

          ui.feedback = { text: '已添加新条目。' };

        });

        break;

      }

      case 'move-preset-entry': {

        const currentActiveId = store.read()?.activePresetId || 'default_preset';

        const entryId = button.dataset.entryId;

        const direction = button.dataset.direction;

        if (!entryId || !direction) break;

        void store.movePresetEntry(currentActiveId, entryId, direction).then(() => render());

        break;

      }

      case 'delete-preset-entry': {

        const currentActiveId = store.read()?.activePresetId || 'default_preset';

        const entryId = button.dataset.entryId;

        if (!entryId) break;

        const currentPreset = (store.read()?.promptPresets || []).find(p => p.id === currentActiveId);

        const entry = currentPreset?.entries?.find(e => e.id === entryId);

        const entryName = entry?.name ? `「${entry.name}」` : '此条目';

        if (typeof confirm === 'function' && !confirm(`确定要从当前装配管线中删除条目 ${entryName} 吗？`)) break;

        void perform('prompt-preset', () => store.deletePresetEntry(currentActiveId, entryId), () => {

          if (ui.expandedPresetEntries instanceof Set) ui.expandedPresetEntries.delete(entryId);

          ui.feedback = { text: `已删除条目 ${entryName}。` };

          render();

        });

        break;

      }

      case 'insert-slot-macro': {

        const macro = button.dataset.macro;

        const entryId = button.dataset.entryId;

        if (!macro) break;

        const textarea = entryId ? root.querySelector(`textarea[data-action="edit-entry-content"][data-entry-id="${entryId}"]`) : null;

        if (textarea) {

          const start = textarea.selectionStart ?? textarea.value.length;

          const end = textarea.selectionEnd ?? start;

          textarea.setRangeText(macro, start, end, 'end');

          textarea.dispatchEvent(new Event('input', { bubbles: true }));

          textarea.focus();

        } else {

          ui.feedback = { text: `插槽 ${macro} 已复制。` };

          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(macro);

          render();

        }

        break;

      }

      case 'filter-prompt-category': {

        ui.promptCategory = button.dataset.category || '全部';

        render();

        break;

      }

      case 'save-prompt': {

        const promptId = button.dataset.promptId;

        const textarea = root.querySelector(`textarea[data-prompt-textarea="${promptId}"]`);

        const text = textarea ? textarea.value : (ui.promptDrafts?.[promptId] ?? '');

        ui.pinnedPromptId = promptId;

        ui.savedSettingsScroll = root.querySelector('.view-settings')?.scrollTop;

        ui.savedPromptCardsScroll = root.querySelector('.prompt-cards-list')?.scrollTop;

        void perform('prompt-save', () => store.savePrompt(promptId, text), () => {

          if (ui.promptDrafts) delete ui.promptDrafts[promptId];

          ui.feedback = { text: '提示词已保存。' };

        });

        break;

      }

      case 'reset-prompt': {

        const promptId = button.dataset.promptId;

        if (!promptId) break;

        if (!confirm('确定要将该功能提示词恢复为默认内容吗？未保存的自定义修改将会丢失。')) break;

        ui.pinnedPromptId = promptId;

        ui.savedSettingsScroll = root.querySelector('.view-settings')?.scrollTop;

        ui.savedPromptCardsScroll = root.querySelector('.prompt-cards-list')?.scrollTop;

        void perform('prompt-reset', () => store.resetPrompt(promptId), () => {

          if (ui.promptDrafts) delete ui.promptDrafts[promptId];

          ui.feedback = { text: '已恢复默认提示词。' };

        });

        break;

      }

      case 'reset-all-prompts': {

        if (!confirm('确定要将所有功能提示词全部恢复为默认内容吗？所有自定义修改将被重置。')) break;

        void perform('prompt-reset-all', () => store.resetAllPrompts(), () => {

          ui.promptDrafts = {};

          ui.feedback = { text: '已恢复所有提示词为默认。' };

        });

        break;

      }

      case 'open-exclude-world-modal': {

        ui.excludeWorldModalOpen = true;

        ui.excludeWorldSearch = '';

        render();

        break;

      }

      case 'close-exclude-world-modal': {

        ui.excludeWorldModalOpen = false;

        ui.excludeWorldSearch = '';

        render();

        break;

      }

      case 'remove-exclude-world': {

        const worldName = button.dataset.worldName;

        if (worldName) {

          const current = readBaiBaiExcludeSettings(() => host?.readSettings?.());

          const nextWorlds = current.excludedWorldNames.filter(w => w !== worldName);

          void perform('world-excludes', async () => {

            saveBaiBaiExcludeSettings(host?.readSettings?.(), { excludedWorldNames: nextWorlds });

            host?.saveSettings?.();

          });

        }

        break;

      }

      case 'add-wi-pattern': {

        addWiPattern();

        break;

      }

      case 'remove-wi-pattern': {

        const pat = button.dataset.pattern;

        if (pat) {

          const current = readBaiBaiExcludeSettings(() => host?.readSettings?.());

          const nextList = current.excludedWorldInfoPatterns.filter(p => p !== pat);

          void perform('world-excludes', async () => {

            saveBaiBaiExcludeSettings(host?.readSettings?.(), { excludedWorldInfoPatterns: nextList });

            host?.saveSettings?.();

          });

        }

        break;

      }

      case 'refresh-backflow-preview': {

        if (previewBackflow) {

          void perform('preview-backflow', async () => {

            ui.backflowPreview = await previewBackflow();

          }, () => {

            ui.feedback = { text: '已刷新待注入内容预览。' };

          });

        } else {

          ui.backflowPreview = logger?.getLastBackflowPrompt?.() || '';

          ui.feedback = { text: '已获取最近准备的注入内容。' };

          render();

        }

        break;

      }

      case 'copy-backflow-prompt': {

        const text = ui.backflowPreview !== undefined ? ui.backflowPreview : (logger?.getLastBackflowPrompt?.() || '');

        if (text && globalThis.navigator?.clipboard?.writeText) {

          void globalThis.navigator.clipboard.writeText(text);

        }

        ui.feedback = { text: '待注入内容已复制到剪贴板。' };

        render();

        break;

      }

      case 'clear-logs': {

        logger?.clearLogs?.();

        ui.feedback = { text: '已清空请求日志。' };

        render();

        break;

      }

      case 'toggle-backflow-fold': {

        ui.backflowExpanded = !Boolean(ui.backflowExpanded);

        render();

        break;

      }

      case 'toggle-log-card': {

        const logId = button.dataset.logId;

        if (!(ui.expandedLogs instanceof Set)) {

          const firstId = logger?.getLogs?.()?.[0]?.id;

          ui.expandedLogs = new Set(firstId ? [firstId] : []);

        }

        if (ui.expandedLogs.has(logId)) {

          ui.expandedLogs.delete(logId);

        } else {

          ui.expandedLogs.add(logId);

        }

        render();

        break;

      }

      case 'copy-log-text': {

        const logId = button.dataset.logId;

        const copyType = button.dataset.copyType;

        const targetLog = logger?.getLogs?.()?.find(item => item.id === logId);

        if (targetLog) {

          let toCopy = '';

          if (copyType === 'entry') {

            const idx = Number(button.dataset.entryIndex);

            toCopy = targetLog.entries?.[idx]?.content || '';

          } else if (copyType === 'system') toCopy = targetLog.systemPrompt;

          else if (copyType === 'messages') toCopy = JSON.stringify(targetLog.messages, null, 2);

          else if (copyType === 'reply') toCopy = targetLog.reply || targetLog.error || '';

          if (toCopy && globalThis.navigator?.clipboard?.writeText) {

            void globalThis.navigator.clipboard.writeText(toCopy);

          }

        }

        ui.feedback = { text: '已复制到剪贴板。' };

        render();

        break;

      }

    }

  }

  function resizeDraft() {

    const draft = root.querySelector('#sms-draft');

    if (!draft) return;

    draft.style.height = 'auto';

    draft.style.height = `${Math.min(draft.scrollHeight + 2, 120)}px`;

  }

  function input(event) {

    if (event.target.matches('[data-action="edit-entry-name"]')) {

      const entryId = event.target.dataset.entryId;

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      if (entryId && currentActiveId) {

        void store.updatePresetEntry(currentActiveId, entryId, { name: event.target.value });

      }

      return;

    }

    if (event.target.matches('[data-action="edit-entry-content"]')) {

      const entryId = event.target.dataset.entryId;

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      if (entryId && currentActiveId) {

        void store.updatePresetEntry(currentActiveId, entryId, { content: event.target.value });

      }

      return;

    }

    if (event.target.matches('[data-action="change-story-layers-input"]')) {

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      if (currentActiveId) {

        void store.updatePresetStoryLayers(currentActiveId, event.target.value);

      }

      return;

    }

    if (event.target.matches('[data-action="change-story-layers"]')) {

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      if (currentActiveId) {

        void store.updatePresetStoryLayers(currentActiveId, event.target.value);

        const label = event.target.closest('.preset-layers-config')?.querySelector('.preset-layers-label strong');

        if (label) label.textContent = `${event.target.value} 楼`;

      }

      return;

    }

    if (event.target.matches('[data-action="search-prompts"]')) {

      ui.promptSearch = event.target.value;

      render();

      return;

    }

    if (event.target.matches('[data-action="search-preset-entries"]')) {

      ui.presetSearch = event.target.value;

      render();

      return;

    }

    if (event.target.matches('[data-action="search-exclude-world"]')) {

      ui.excludeWorldSearch = event.target.value;

      render();

      return;

    }

    if (event.target.matches('[data-action="draft-wi-pattern"]')) {

      ui.wiPatternDraft = event.target.value;

      return;

    }

    if (event.target.matches('[data-prompt-textarea]')) {

      const pid = event.target.dataset.promptTextarea;

      if (!ui.promptDrafts) ui.promptDrafts = {};

      ui.promptDrafts[pid] = event.target.value;

      return;

    }

    if (event.target.id === 'message-edit-textarea') { ui.editingMessageDraft = event.target.value; return; }

    if (event.target.id === 'forward-note-input') { ui.forwardNote = event.target.value; return; }

    if (event.target.id === 'cal-ai-setting') ui.calendarAiSetting = event.target.value;

    if (event.target.id === 'cal-ai-count') ui.calendarAiCount = Number(event.target.value);

    if (event.target.id === 'cal-ai-days') ui.calendarAiDays = Number(event.target.value);

    if (event.target.id === 'cal-ai-focus') ui.calendarAiFocus = event.target.value;

    if (event.target.id === 'map-ai-instruction') ui.mapAiInstruction = event.target.value;

    if (event.target.matches('[data-action="search-map-places"]')) {

      ui.mapSearch = event.target.value;

      render();

      return;

    }

    if (event.target.id === 'foodie-db-search-input') {

      ui.foodieSearchQuery = event.target.value;

      render();

      return;

    }

    if (event.target.closest('.attachment-form') && event.target.name) ui.attachmentDraft[event.target.name] = event.target.value;

    if (event.target.id === 'sms-draft') {

      ui.drafts.set(conversationId(), event.target.value);

      resizeDraft();

    }

    const todoForm = event.target.closest('.todo-form');

    if (todoForm && event.target.name) {

      const id = todoForm.dataset.todoForm, source = store.read().todos?.find(item => item.id === id) || {};

      const draft = { ...(ui.todoDrafts.get(id) || source) };

      if (event.target.name === 'participantIds') draft.participantIds = [...event.target.selectedOptions].map(option => option.value);

      else draft[event.target.name] = event.target.value;

      ui.todoDrafts.set(id, draft);

    }

    const socialComment = event.target.closest('.social-comment-form');

    if (socialComment && event.target.name === 'comment') ui.socialDrafts.set(socialComment.dataset.socialCommentForm, event.target.value);

    if (event.target.closest('.api-form') && event.target.name) ui.apiDraft[event.target.name] = event.target.value;

    if (event.target.id === 'model-search') {

      ui.modelSearch = event.target.value;

      root.querySelector('.model-options').innerHTML = renderModelOptions(ui);

    }

    if (['api-url', 'api-key'].includes(event.target.id)) {

      ui.models = []; ui.modelSearch = ''; closeModels(); root.querySelector('.model-list-toggle')?.remove();

    }

    if (event.target.id === 'api-model' && ui.modelsOpen) root.querySelector('.model-options').innerHTML = renderModelOptions(ui);

    const form = event.target.closest('.profile-form, .group-form');

    if (form && event.target.name && event.target.type !== 'checkbox') {

      const draft = form.matches('.group-form') ? ui.groupDraft : ui.profileDraft;

      draft[event.target.name] = event.target.value;

      if (['avatar', 'name', 'nickname'].includes(event.target.name)) root.querySelector('.profile-avatar').innerHTML = avatar(draft);

    }

  }

  async function change(event) {

    if (event.target.matches('[data-action="import-prompt-preset-file"]')) {

      const file = event.target.files?.[0];

      if (!file) return;

      const reader = new FileReader();

      reader.onload = async (e) => {

        try {

          const text = e.target?.result;

          const parsed = JSON.parse(text);

          const fallbackName = file.name.replace(/\.[^/.]+$/, '').replace(/^TMT-Preset-/, '') || '导入预设';

          const newPreset = createPresetFromPayload(parsed, fallbackName);

          await store.savePromptPreset(newPreset);

          ui.feedback = { text: `已成功导入预设「${newPreset.name}」。` };

          render();

        } catch (err) {

          ui.feedback = { text: `导入预设失败：${err?.message || err}` };

          render();

        }

      };

      reader.readAsText(file);

      return;

    }

    if (event.target.matches('[data-action="switch-prompt-preset"]')) {

      void store.setActivePromptPreset(event.target.value).then(() => render());

      return;

    }

    if (event.target.matches('[data-action="change-entry-role"]')) {

      const entryId = event.target.dataset.entryId;

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      if (entryId && currentActiveId) {

        void store.updatePresetEntry(currentActiveId, entryId, { role: event.target.value }).then(() => render());

      }

      return;

    }

    if (event.target.matches('[data-action="toggle-preset-entry"]')) {

      const entryId = event.target.dataset.entryId;

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      if (entryId && currentActiveId) {

        void store.togglePresetEntry(currentActiveId, entryId, event.target.checked).then(() => render());

      }

      return;

    }

    if (event.target.matches('[data-action="edit-entry-scope"]')) {

      const entryId = event.target.dataset.entryId;

      const currentActiveId = store.read()?.activePresetId || 'default_preset';

      if (entryId && currentActiveId) {

        void store.updatePresetEntry(currentActiveId, entryId, { scope: event.target.value }).then(() => render());

      }

      return;

    }

    if (event.target.id === 'cal-ai-focus') ui.calendarAiFocus = event.target.value;

    if (event.target.id === 'cal-ai-count') ui.calendarAiCount = Number(event.target.value);

    if (event.target.id === 'cal-ai-days') ui.calendarAiDays = Number(event.target.value);

    if (event.target.matches('[data-ai-item-index]')) {

      const idx = Number(event.target.dataset.aiItemIndex);

      if (ui.calendarAiTab === 'festivals' && ui.calendarAiFestivals?.[idx]) {

        ui.calendarAiFestivals[idx].selected = event.target.checked;

      } else if (ui.calendarAiTab === 'schedules' && ui.calendarAiSchedules?.[idx]) {

        ui.calendarAiSchedules[idx].selected = event.target.checked;

      }

    }

    const todoForm = event.target.closest('.todo-form');

    if (todoForm && event.target.name) {

      const id = todoForm.dataset.todoForm, source = store.read().todos?.find(item => item.id === id) || {};

      const draft = { ...(ui.todoDrafts.get(id) || source) };

      draft[event.target.name] = event.target.multiple ? [...event.target.selectedOptions].map(option => option.value) : event.target.value;

      ui.todoDrafts.set(id, draft);

    }

    if (event.target.id === 'image-provider') void perform('image-provider', () => imageProviders.select(event.target.value));

    if (event.target.id === 'export-source') { ui.exportLocal = event.target.value === 'local'; render(); }

    if (event.target.id === 'phone-enabled') {

      const enabled = event.target.checked;

      void perform('enabled', () => control.setEnabled(enabled), () => { ui.view = 'settings'; entries.refreshVisibility?.(); onContextChange(); if (enabled) fillDefaultAvatars(); });

    }

    if (event.target.closest('.attachment-form') && event.target.name) ui.attachmentDraft[event.target.name] = event.target.value;

    if (event.target.closest('.group-form') && event.target.name === 'member') {

      const { value, checked } = event.target;

      if (value === '@user') ui.groupDraft.userIsMember = checked;

      else ui.groupDraft.memberIds = checked ? [...ui.groupDraft.memberIds, value] : ui.groupDraft.memberIds.filter(id => id !== value);

      root.querySelector('.group-members-fold summary span').textContent = `${ui.groupDraft.memberIds.length + Number(ui.groupDraft.userIsMember)} 人`;

    }

    if (event.target.id === 'render-world-templates') {

      const enabled = event.target.checked;

      void perform('world-excludes', async () => {

        saveBaiBaiExcludeSettings(host?.readSettings?.(), { renderWorldInfoTemplates: enabled });

        host?.saveSettings?.();

      });

    }

    if (event.target.matches('[data-action="toggle-exclude-world-item"]')) {

      const worldName = event.target.dataset.worldName;

      if (worldName) {

        const current = readBaiBaiExcludeSettings(() => host?.readSettings?.());

        const nextWorlds = event.target.checked

          ? [...new Set([...current.excludedWorldNames, worldName])]

          : current.excludedWorldNames.filter(w => w !== worldName);

        void perform('world-excludes', async () => {

          saveBaiBaiExcludeSettings(host?.readSettings?.(), { excludedWorldNames: nextWorlds });

          host?.saveSettings?.();

        });

      }

    }

    if (event.target.id === 'inject-enabled') {

      const enabled = event.target.checked;

      void perform('injection', async () => { await store.setInjectionEnabled(enabled); onContextChange(); });

    }

    if (event.target.id === 'inject-calendar-enabled') {

      const enabled = event.target.checked;

      void perform('injection-calendar', async () => { await store.setInjectCalendarEnabled(enabled); onContextChange(); });

    }

    if (event.target.id === 'inject-weather-enabled') {

      const enabled = event.target.checked;

      void perform('injection-weather', async () => { await store.setInjectWeatherEnabled(enabled); onContextChange(); });

    }

    if (event.target.id === 'inject-map-enabled' || event.target.matches('[data-action="toggle-map-inject"]')) {

      const enabled = event.target.checked;

      void perform('injection-map', async () => { await store.setInjectMapEnabled(enabled); onContextChange(); });

    }

    if (event.target.id === 'inject-origin-enabled') {

      const enabled = event.target.checked;

      void perform('injection-origin', async () => { await store.setInjectOriginEnabled(enabled); onContextChange(); });

    }

    if (event.target.id === 'inject-foodie-enabled') {

      const enabled = event.target.checked;

      void perform('injection-foodie', async () => { await store.setInjectFoodieEnabled(enabled); onContextChange(); });

    }

    if (event.target.matches('[data-action="change-map-basemap"]')) {

      const val = event.target.value || 'auto';

      void perform('map-basemap', async () => { await store.setMapBasemap(val); onContextChange(); });

    }

    if (event.target.matches('[data-action="toggle-map-ai-item"]')) {

      const idx = Number(event.target.dataset.index);

      if (ui.mapAiResults?.places?.[idx]) {

        ui.mapAiResults.places[idx].selected = event.target.checked;

      }

    }

    if (event.target.id === 'workday-enabled') {

      const enabled = event.target.checked;

      const current = store.read()?.calendar?.workdayConfig || defaultWorkdayConfig();

      void perform('calendar-workday', async () => {

        await store.setCalendarWorkdayConfig({ ...current, injectStory: enabled });

        onContextChange();

      });

    }

    if (event.target.id === 'contact-social-enabled') {

      const enabled = event.target.checked;

      void perform('contact-social', async () => {

        await store.setContactSocialEnabled(enabled);

        onContextChange();

      });

    }

    if (event.target.id === 'group-social-enabled') {

      const enabled = event.target.checked;

      void perform('group-social', async () => {

        await store.setGroupSocialEnabled(enabled);

        onContextChange();

      });

    }

    if (event.target.id === 'summary-mode') {

      const mode = event.target.value;

      void perform('summary-mode', async () => {

        await store.setSummaryMode(mode);

        onContextChange();

      });

    }

    if (event.target.matches('[data-action="foodie-toggle-db-enable"]')) {

      const dbId = event.target.dataset.dbId || ui.foodieSelectedDbId;

      if (!dbId) return;

      const enabled = Boolean(event.target.checked);

      if (ui.foodieSettingsTab === 'edit') {

        await syncFoodieFormDraft(root);

      }

      const state = store.read();

      const isCustom = dbId.startsWith('custom:');

      if (isCustom) {

        const customs = { ...(state.foodie?.customDatabases || {}) };

        if (customs[dbId]) {

          customs[dbId] = { ...customs[dbId], enabled };

          await store.setFoodieState({ customDatabases: customs });

        }

      } else {

        const modified = { ...(state.foodie?.modifiedBuiltins || {}) };

        const orig = getEffectiveDatabases(state).find(d => d.id === dbId) || {};

        modified[dbId] = { ...(modified[dbId] || orig), id: dbId, enabled };

        await store.setFoodieState({ modifiedBuiltins: modified });

      }

      render();

      onContextChange();

      return;

    }

    if (event.target.id === 'foodie-db-select' || event.target.dataset.action === 'foodie-switch-db') {

      ui.foodieSelectedDbId = event.target.value;

      render();

      return;

    }

    if (event.target.id === 'foodie-count-input') {

      const val = Math.min(5, Math.max(1, Number(event.target.value) || 2));

      void store.setFoodieState({ count: val }).then(() => {

        onContextChange();

      });

    }

    if (event.target.id === 'foodie-template-input') {

      const val = event.target.value;

      void store.setFoodieState({ template: val }).then(() => {

        onContextChange();

      });

    }

    if (event.target.id === 'foodie-custom-intents-input') {

      const val = event.target.value.trim();

      void store.setFoodieState({ customIntentWords: val }).then(() => {

        onContextChange();

      });

    }

    if (event.target.id === 'summary-max-characters') {

      const val = Number(event.target.value) || 100;

      void perform('summary-max-chars', async () => {

        await store.setSummaryMaxCharacters(val);

        onContextChange();

      });

    }

    if (event.target.id === 'summary-auto-truncate') {

      const enabled = event.target.checked;

      void perform('summary-truncate', async () => {

        await store.setSummaryAutoTruncate(enabled);

        onContextChange();

      });

    }

    if (event.target.id === 'summary-always-summarize') {

      const enabled = event.target.checked;

      void perform('summary-always', async () => {

        await store.setSummaryAlwaysSummarize(enabled);

        onContextChange();

      });

    }



    if (event.target.dataset.entryPreference) {

      const key = event.target.dataset.entryPreference, value = event.target.checked;

      void perform('entry', () => entries.set(key, value), result => { if (result?.notice) ui.feedback = { text: result.notice }; });

    }

    if (event.target.id === 'particles-enabled') {

      const enabled = event.target.checked;

      void perform('particles', () => appearance.setParticlesEnabled(enabled));

    }

    if (event.target.id === 'phone-theme') void perform('theme', () => store.setTheme(event.target.value));

    if (event.target.id === 'lock-screen-enabled') {

      const enabled = event.target.checked;

      void perform('lock-screen', () => store.setLockScreenEnabled(enabled));

    }

    if (event.target.id === 'remember-last-view-enabled') {

      const enabled = event.target.checked;

      void perform('remember-last-view', () => store.setRememberLastView(enabled));

    }

    if (event.target.id === 'phone-lock-style') void perform('lock-style', () => store.setLockStyle(event.target.value));

    if (event.target.id === 'wallpaper-file' && event.target.files[0]) {

      const file = event.target.files[0], theme = store.read().theme;

      void perform('wallpaper', async () => wallpaper.upload(theme, await readImage(file, doc, 1600)));

    }

    if (event.target.id === 'chat-background-file' && event.target.files[0]) {

      const file = event.target.files[0], draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;

      void perform('chat-background', async () => wallpaper.uploadImage(await readImage(file, doc, 1600)), path => { draft.background = path; });

    }

    if (event.target.matches('.avatar-picker input[type="file"]') && event.target.files[0]) {

      const file = event.target.files[0], draft = event.target.closest('.group-form') ? ui.groupDraft : ui.profileDraft;

      void perform('avatar', async () => {

        avatarCropper = mountAvatarCropper(surface, file);

        try { return await avatarCropper.result; }

        finally { avatarCropper = null; }

      }, value => { if (value) draft.avatar = value; }).then(() => root.querySelector('.avatar-picker input')?.focus({ preventScroll: true }));

    }

    if (event.target.id === 'api-source') {

      ui.manual = event.target.value === 'manual';

      if (ui.manual) { render(); return; }

      const source = apiSettings.listSources().find(item => refKey(item.ref) === event.target.value);

      if (source) void perform('api', () => apiSettings.select(source.ref));

    }

  }

  function submit(event) {

    event.preventDefault();

    if (event.target.matches('.todo-form')) {

      const id = event.target.dataset.todoForm, source = store.read().todos?.find(item => item.id === id);

      if (!source) return;

      const draft = ui.todoDrafts.get(id) || source;

      void perform(`todo:${id}`, async () => {

        if (source.status === 'candidate') await store.confirmTodo(id, draft);

        else await store.saveTodo(id, draft);

      }, () => { ui.todoEditing.delete(id); ui.todoDrafts.delete(id); onContextChange(); });

      return;

    }

    if (event.target.matches('.attachment-form')) {

      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages, type = ui.attachment;

      if (type === 'games') {

        const gameKind = (ui.attachmentDraft?.gameKind || 'buckshot_roulette').trim();

        const wager = (ui.attachmentDraft?.wager || '').trim() || '纯娱乐';

        let invite;

        let title = '恶魔轮盘';

        if (gameKind === 'buckshot_roulette') {

          invite = createBuckshotInvitation({ sender: 'user', wager });

          title = '恶魔轮盘';

        } else {

          invite = createOldMaidInvitation({ sender: 'user', wager });

          title = '抽鬼牌';

        }

        const draft = {

          type: 'game',

          game: {

            kind: gameKind,

            title,

            gameId: invite.id,

            status: 'invited',

            sender: 'user',

            wager: invite.wager,

            state: invite,

            lastAction: invite.lastAction,

          },

        };

        void perform(`send:${id}`, async () => {

          await service.sendCard(id, draft, { replyToId: ui.replyToId });

        }, () => {

          ui.attachment = '';

          ui.attachmentDraft = {};

          ui.replyToId = '';

          onContextChange();

          void perform(`continue:${id}`, () => service.continueChat(id), onContextChange);

        });

        return;

      }

      const draft = { type, [type]: { ...ui.attachmentDraft } };

      void perform(`send:${id}`, () => service.sendCard(id, draft, { replyToId: ui.replyToId }), () => { ui.attachment = ''; ui.attachmentDraft = {}; ui.replyToId = ''; onContextChange(); });

    }

    if (event.target.matches('.composer')) {

      const send = root.querySelector('[data-action="send"]');

      send?.click();

    }

    if (event.target.matches('.social-comment-form')) {

      const postId = event.target.dataset.socialCommentForm;

      const text = (ui.socialDrafts.get(postId) || '').trim();

      if (!text) return;

      let postedId;

      void perform(`social-comment:${postId}`, () => social.comment(postId, text, { onPosted: comment => {

        postedId = comment.id;

        if ((ui.socialDrafts.get(postId) || '').trim() === text) ui.socialDrafts.delete(postId);

        render();

      } }), result => {

        if (!isReadingSocial(postId) && result.comments?.some(comment => comment.replyToId === postedId && comment.read === false)) pushPhoneNotice({ kind: 'social-reply', id: postId });

        onContextChange();

      });

    }

    if (event.target.matches('[data-origin-form]') && ui.view === 'origin') {

      ui.savedOriginScroll = root.querySelector('.phone-main')?.scrollTop;

    }

    if (event.target.matches('[data-origin-form="task"]')) {

      const form = event.target;

      const id = form.elements.id?.value;

      const draft = {

        type: form.elements.type?.value || '支线',

        title: form.elements.title?.value || '',

        cond: form.elements.cond?.value || '',

        reward: form.elements.reward?.value || '',

        penalty: form.elements.penalty?.value || '',

        limit: Number(form.elements.limit?.value) || 0,

      };

      void perform('origin-task-save', () => originService.saveTask(id, draft), () => {

        ui.originModal = null;

        ui.originModalData = null;

        onContextChange();

      });

      return;

    }

    if (event.target.matches('[data-origin-form="direction"]')) {

      const form = event.target;

      const direction = form.elements.direction?.value || '';

      void perform('origin-direction-save', () => originService.updateSettings({ direction }), () => {

        ui.originModal = null;

        ui.feedback = { text: '期望任务方向已保存。' };

        onContextChange();

      });

      return;

    }

    if (event.target.matches('[data-origin-form="settings"]')) {

      const form = event.target;

      const sections = {};

      ['panel', 'tasks', 'inventory', 'action', 'rules', 'output'].forEach(k => {

        sections[k] = {

          enabled: Boolean(form.elements[`section_${k}_enabled`]?.checked),

          template: form.elements[`section_${k}_template`]?.value || '',

        };

      });

      const moduleTags = {

        achievement: form.elements.moduleTag_achievement?.value ?? '成就, achievement, 功业',

        skill: form.elements.moduleTag_skill?.value ?? '技能, skill, 神通, 功法',

        stat: form.elements.moduleTag_stat?.value ?? '属性, stat, 状态, 数值',

        task: form.elements.moduleTag_task?.value ?? '任务, task, 使命',

        points: form.elements.moduleTag_points?.value ?? '积分, points, 经验',

        item: form.elements.moduleTag_item?.value ?? '道具, item, 获得, 物品',

        perk: form.elements.moduleTag_perk?.value ?? '权限, perk, 特权',

        broadcast: form.elements.moduleTag_broadcast?.value ?? '播报, notice, 公告, 系统提示',

        chat: form.elements.moduleTag_chat?.value ?? '私聊, chat, 系统私聊',

        origin: form.elements.moduleTag_origin?.value ?? 'origin, 系统',

      };

      const patch = {

        enabled: form.elements.enabled?.checked,

        sysName: form.elements.sysName?.value || '系统',

        world: form.elements.world?.value?.trim() || '',

        bindTo: form.elements.bindTo?.value || '宿主',

        personality: form.elements.personality?.value || '冷澈',

        personaText: form.elements.personaText?.value || '',

        freq: Number(form.elements.freq?.value) || 3,

        fourthWall: Number(form.elements.fourthWall?.value) || 0,

        blockWhenUnfinished: form.elements.blockWhenUnfinished?.checked,

        tagRegex: form.elements.tagRegex?.value ?? '<(?:origin|系统)>([\\s\\S]*?)</(?:origin|系统)>',

        storyRegex: form.elements.storyRegex?.value ?? '【(?:叮[！!]|系统).*?】',

        moduleTags,

        sections,

      };

      void perform('origin-settings-save', () => originService.updateSettings(patch), () => {

        ui.originShowSettings = false;

        ui.feedback = { text: '系统设置已更新。' };

        onContextChange();

      });

      return;

    }

    if (event.target.matches('[data-origin-form="stat"]')) {

      const form = event.target;

      const name = form.elements.name?.value?.trim();

      const val = Number(form.elements.val?.value) || 10;

      if (name) {

        void perform('origin-stat-save', () => originService.updateStat(name, val), () => {

          ui.originModal = null;

          ui.feedback = { text: `属性「${name}」已添加！` };

          onContextChange();

        });

      }

      return;

    }

    if (event.target.matches('[data-origin-form="perk"]')) {

      const form = event.target;

      const draft = {

        name: form.elements.name?.value?.trim(),

        desc: form.elements.desc?.value?.trim() || '',

      };

      if (draft.name) {

        void perform('origin-perk-save', () => originService.savePerk(draft), () => {

          ui.originModal = null;

          ui.feedback = { text: `特权「${draft.name}」已保存！` };

          onContextChange();

        });

      }

      return;

    }

    if (event.target.matches('[data-origin-form="skill"]')) {

      const form = event.target;

      const draft = {

        name: form.elements.name?.value?.trim(),

        desc: form.elements.desc?.value?.trim() || '',

        hasExp: Boolean(form.elements.hasExp?.checked),

        level: Number(form.elements.level?.value) || 1,

        exp: Number(form.elements.exp?.value) || 0,

        expMax: Number(form.elements.expMax?.value) || 100,

      };

      if (draft.name) {

        void perform('origin-skill-save', () => originService.saveSkill(draft), () => {

          ui.originModal = null;

          ui.feedback = { text: `技能「${draft.name}」已保存！` };

          onContextChange();

        });

      }

      return;

    }

    if (event.target.matches('[data-origin-form="evaluate-stats"]')) {

      const form = event.target;

      const direction = form.elements.direction?.value?.trim() || '';

      ui.isEvaluatingStats = true;

      render();

      void perform('origin-ai-stats', async () => {

        if (!originService.evaluateStats) throw new Error('当前环境未启用模型推演能力');

        return await originService.evaluateStats({ direction });

      }, (res) => {

        ui.isEvaluatingStats = false;

        ui.originModal = null;

        ui.originModalData = null;

        ui.feedback = { text: res?.summary || (res?.isNewStats ? 'AI 已成功为宿主构建初始属性与能力！' : 'AI 已完成成长评估并结算属性！') };

        onContextChange();

      }).catch(() => {

        ui.isEvaluatingStats = false;

        render();

      });

      return;

    }

    if (event.target.matches('[data-origin-form="conceive-shop"]')) {

      const form = event.target;

      const direction = form.elements.direction?.value?.trim() || '';

      ui.isConceivingShop = true;

      render();

      void perform('origin-shop-ai', async () => {

        if (!originService.conceiveShopItems) throw new Error('当前环境未启用模型进货推演能力');

        return await originService.conceiveShopItems({ direction });

      }, (res) => {

        ui.isConceivingShop = false;

        ui.originModal = null;

        ui.originModalData = null;

        ui.feedback = { text: `AI 成功进货 ${res?.count || 0} 件商品并已上架！` };

        onContextChange();

      }).catch(() => {

        ui.isConceivingShop = false;

        render();

      });

      return;

    }

    if (event.target.matches('[data-origin-form="conceive-gacha"]')) {

      const form = event.target;

      const direction = form.elements.direction?.value?.trim() || '';

      ui.isConceivingGacha = true;

      render();

      void perform('origin-gacha-ai', async () => {

        if (!originService.conceiveGachaItems) throw new Error('当前环境未启用模型奖池推演能力');

        return await originService.conceiveGachaItems({ direction });

      }, (res) => {

        ui.isConceivingGacha = false;

        ui.originModal = null;

        ui.originModalData = null;

        ui.feedback = { text: `AI 成功扩充 ${res?.count || 0} 件奖品入库！` };

        onContextChange();

      }).catch(() => {

        ui.isConceivingGacha = false;

        render();

      });

      return;

    }

    if (event.target.matches('[data-origin-form="shop-item"]')) {

      const form = event.target;

      const draft = {

        name: form.elements.name?.value?.trim(),

        price: Number(form.elements.price?.value) || 100,

        desc: form.elements.desc?.value?.trim() || '',

        effect: form.elements.effect?.value?.trim() || '',

      };

      if (draft.name) {

        void perform('origin-catalog-add', () => originService.saveShopCatalogItem(draft), () => {

          form.reset();

          ui.feedback = { text: `商品「${draft.name}」已添加至总库！` };

          onContextChange();

        });

      }

      return;

    }

    if (event.target.matches('[data-origin-form="gacha-item"]')) {

      const form = event.target;

      const draft = {

        name: form.elements.name?.value?.trim(),

        tier: form.elements.tier?.value || 'R',

        weight: Number(form.elements.weight?.value) || 10,

        desc: form.elements.desc?.value?.trim() || '',

        effect: form.elements.effect?.value?.trim() || '',

      };

      if (draft.name) {

        void perform('origin-catalog-add', () => originService.saveGachaCatalogItem(draft), () => {

          form.reset();

          ui.feedback = { text: `奖品「${draft.name}」已添加至祈愿总库！` };

          onContextChange();

        });

      }

      return;

    }

    if (event.target.matches('.api-form')) void perform('api', () => apiSettings.saveManual({ ...ui.apiDraft }), () => { ui.apiDraft = {}; ui.manual = false; ui.feedback = { text: '连接已保存。' }; });

    if (event.target.matches('[data-calendar-form]')) {

      const form = event.target;

      const draft = {

        name: form.elements.name.value,

        type: form.elements.type.value,

        month: Number(form.elements.month.value),

        day: Number(form.elements.day.value),

        days: Number(form.elements.days.value) || 1,

        note: form.elements.note.value,

      };

      if (ui.calendarDraft?.id) draft.id = ui.calendarDraft.id;

      if (ui.calendarDraft?.todoId) draft.todoId = ui.calendarDraft.todoId;

      void perform('calendar-event', () => store.saveCalendarEvent(draft), () => {

        ui.calendarFormOpen = false;

        ui.calendarDraft = null;

        onContextChange();

      });

    }

    if (event.target.matches('[data-map-form]')) {

      const form = event.target;

      const pickedFacilities = Array.isArray(ui.mapDraft?.facilities) ? ui.mapDraft.facilities : [];

      const customFacilities = String(form.elements.facilitiesCustom?.value || '')

        .split(/[,，、\s]+/)

        .map(s => s.trim())

        .filter(Boolean);

      const facilities = [...new Set([...pickedFacilities, ...customFacilities])];

      const placeDraft = {

        id: form.elements.id?.value || ui.mapDraft?.id || '',

        name: form.elements.name?.value || '',

        role: form.elements.role?.value || 'site',

        parentId: form.elements.parentId?.value || '',

        desc: form.elements.desc?.value || '',

        facilities,

      };

      const setAsCurrent = Boolean(form.elements.setAsCurrent?.checked);

      void perform('map-place', async () => {

        const nextState = await store.saveMapPlace(placeDraft);

        if (setAsCurrent) {

          const saved = (nextState?.map?.items || []).find(it => it.name === placeDraft.name.trim());

          await store.setMapCurrentLocation(saved?.id || placeDraft.name.trim());

        }

      }, () => {

        ui.mapFormOpen = false;

        ui.mapDraft = null;

        ui.feedback = { text: '地点已保存。' };

        onContextChange();

      });

    }

    if (event.target.matches('[data-calendar-settings-form]')) {

      const form = event.target;

      const country = form.elements.country?.value || 'china';

      const era = form.elements.era?.value || '';

      const title = form.elements.title?.value || '';

      const mode = form.elements.mode?.value || 'merge';

      void perform('calendar-event', () => {

        store.applyCalendarPreset({ countryId: country, keepCustom: mode === 'merge' });

        if (era || title) {

          store.setCalendarDescriptor({ ...(era ? { era } : {}), ...(title ? { title } : {}) });

        }

      }, () => {

        ui.calendarSettingsOpen = false;

        ui.feedback = { text: '已更新历法与地区。' };

      });

    }

    if (event.target.matches('.profile-form')) {

      const draft = { ...ui.profileDraft }, kind = ui.editor, editId = ui.editId;

      void perform('profile', () => kind === 'user' ? store.saveUserProfile(draft) : store.saveContact(editId, draft), result => {

        if (kind === 'user') ui.view = 'settings';

        else { ui.contactId = result.id; ui.view = 'chat'; }

        ui.profileDraft = {}; onContextChange();

      });

    }

    if (event.target.matches('.group-form')) {

      const draft = { ...ui.groupDraft, memberIds: [...ui.groupDraft.memberIds] }, id = ui.groupEditId;

      void perform('group-profile', () => store.saveGroup(id, draft), result => { ui.groupId = result.id; ui.view = 'group-chat'; ui.groupDraft = {}; ui.selectedMessage = ''; ui.confirmClear = false; });

    }

  }

  function dblclick(event) {

    if (!inChat()) return;

    const avatarBtn = event.target.closest('[data-poke-target-id]');

    if (!avatarBtn) return;

    event.preventDefault();

    const targetId = avatarBtn.dataset.pokeTargetId;

    const targetName = avatarBtn.dataset.pokeTargetName || '对方';

    if (ui.view === 'group-chat') {

      const draft = root.querySelector('#sms-draft');

      const mentionPrefix = `@${targetName} `;

      if (draft && draft.value.endsWith(mentionPrefix)) {

        draft.value = draft.value.slice(0, -mentionPrefix.length);

        ui.drafts.set(conversationId(), draft.value);

        resizeDraft();

      }

    } else if (ui.thoughtMessageId) {

      ui.thoughtMessageId = '';

    }

    sendPoke(targetId, targetName);

  }

  function contextmenu(event) {

    if (!inChat() || ui.multiSelectMode) return;

    const bubble = event.target.closest('.bubble[data-message]');

    if (!bubble) return;

    event.preventDefault();

    ui.chatMenu = false;

    ui.reactionMoreMessageId = '';

    ui.selectedMessage = bubble.dataset.message;

    render();

  }

  const refreshCalendar = () => {

    if (!element.hidden && ['calendar', 'desktop', 'map'].includes(ui.view)) render();

  };

  const rememberMembersFold = event => { if (event.target.matches?.('.group-members-fold')) ui.groupMembersOpen = event.target.open; };

  const unsubscribeAppearance = appearance.subscribe(() => {

    const toggle = root.querySelector('#particles-enabled');

    if (toggle) toggle.checked = appearance.particlesEnabled();

    syncParticles();

  });

  const unsubscribeLogger = logger?.subscribe?.(() => {

    if (ui.view === 'settings' && ui.drawers.logs) render();

  });

  const onSharedChannelsChange = () => { render(); };

  const onExcludeSettingsChange = () => { if (ui.view === 'settings') render(); };

  doc.defaultView?.addEventListener?.('st-baibai-api-channels:changed', onSharedChannelsChange);

  doc.defaultView?.addEventListener?.(SHARED_EXCLUDES_EVENT, onExcludeSettingsChange);

  doc.defaultView?.addEventListener?.('st-sevendayscal:calendar-changed', refreshCalendar);

  doc.defaultView.addEventListener('st-baibai-book:changed', refreshCalendar);

  doc.defaultView.addEventListener('st-baibai-book:ready', refreshCalendar);

  doc.defaultView?.addEventListener?.('st-tmt-map-svg-loaded', refreshCalendar);

  root.addEventListener('keydown', keydown);

  root.addEventListener('click', click);

  root.addEventListener('dblclick', dblclick);

  root.addEventListener('contextmenu', contextmenu);

  root.addEventListener('input', input);

  root.addEventListener('change', change);

  root.addEventListener('submit', submit);

  root.addEventListener('toggle', rememberMembersFold, true);

  root.addEventListener('error', imageError, true);

  root.addEventListener('scroll', readVisibleSocialReplies, true);

  root.addEventListener('dragstart', onPresetDragStart);

  root.addEventListener('dragover', onPresetDragOver);

  root.addEventListener('dragleave', onPresetDragLeave);

  root.addEventListener('drop', onPresetDrop);

  root.addEventListener('dragend', onPresetDragEnd);

  root.addEventListener('pointerdown', onPresetPointerDown);

  doc.addEventListener('pointerdown', dismissMenus, true);

  render();

  fillDefaultAvatars();

  void updates?.ensureChecked();

  return {

    get isOpen() { return !element.hidden; },

    get isFrontmost() { return isFrontmost(); },

    isReading(id) { return element.isConnected && !element.hidden && inChat() && conversationId() === id; },

    isReadingSocial,

    notifyMessage(id) { if (!(inChat() && conversationId() === id)) pushPhoneNotice({ kind: 'message', id }); },

    close,

    open() {

      ui.conflict = control.hasConflict?.(doc) === true;

      // 关闭后重开：若启用「记忆上次打开位置」则恢复关闭前所在页面；否则按锁屏设置进入锁屏或桌面。

      if (element.hidden) {

        const currentState = store.read();

        const defaultEntry = currentState.lockScreenEnabled === false ? 'desktop' : 'home';

        const remembered = ui.lastOpenView;

        if (currentState.rememberLastView === true && remembered && !['home', 'delete-confirm'].includes(remembered)) {

          if (remembered === 'chat' && !currentState.contacts?.some(c => c.id === ui.contactId)) {

            ui.view = 'inbox';

          } else if (remembered === 'group-chat' && !currentState.groups?.some(g => g.id === ui.groupId)) {

            ui.view = 'inbox';

          } else {

            ui.view = remembered;

          }

        } else {

          ui.view = defaultEntry;

        }

        ui.photo = null;

        ui.attachment = '';

      }

      element.hidden = false;

      // 两份手机共享层级；打开已有窗口时按同层 DOM 顺序置前，不改另一份状态。

      if (!isFrontmost()) mount.append(element);

      render();

      if (['calendar', 'todos'].includes(ui.view) && ui.calendarScroll) {

        const main = root.querySelector('.phone-main');

        if (main) main.scrollTop = ui.calendarScroll;

      }

      if (inChat() && control.isEnabled()) {

        void store.markRead(conversationId()).catch(() => {});

      }

      fillDefaultAvatars();

      recoverVisibleImages();

      windowControls.refresh();

    },

    refreshTime() {

      clock.refresh();

      if (element.hidden) return;

      if (inChat() || ['calendar', 'desktop', 'map'].includes(ui.view)) render();

      if (ui.view === 'home') {

        let weather = null;

        if (typeof readWeather === 'function') {

          try {

            weather = readWeather(calendar);

          } catch {}

        }

        const label = root.querySelector('.lock-weather');

        if (label && weather) {

          label.title = weather.title || (weather.source === 'decoration' ? '装饰天气' : '构画剧情天气');

          const span = label.querySelector('span:not(.weather-svg-icon)') || label.lastElementChild;

          if (span) span.textContent = `${weather.text} ${weather.temperature}`.trim();

          const iconEl = label.querySelector('.weather-svg-icon') || label.firstElementChild;

          if (iconEl && weather.type) {

            iconEl.innerHTML = weatherSvgIcon(weather.type);

          }

        }

      }

    },

    dispose() {

      dialog.dispose(); updatesView?.dispose();

      dismissPhoneNotice();

      avatarCropper?.close();

      unsubscribeAppearance();

      unsubscribeLogger?.();

      clock.stop();

      particles?.dispose();

      chatScroll.dispose();

      windowControls.dispose();

      lockImageNode = null;

      lockImageSrc = '';

      doc.defaultView?.removeEventListener?.('st-baibai-api-channels:changed', onSharedChannelsChange);

      doc.defaultView?.removeEventListener?.(SHARED_EXCLUDES_EVENT, onExcludeSettingsChange);

      doc.defaultView.removeEventListener('st-sevendayscal:calendar-changed', refreshCalendar);

      doc.defaultView.removeEventListener('st-baibai-book:changed', refreshCalendar);

      doc.defaultView.removeEventListener('st-baibai-book:ready', refreshCalendar);

      doc.defaultView?.removeEventListener?.('st-tmt-map-svg-loaded', refreshCalendar);

      doc.removeEventListener('pointerdown', dismissMenus, true);

      root.removeEventListener('keydown', keydown);

      root.removeEventListener('click', click);

      root.removeEventListener('input', input);

      root.removeEventListener('change', change);

      root.removeEventListener('submit', submit);

      root.removeEventListener('toggle', rememberMembersFold, true);

      root.removeEventListener('error', imageError, true);

      root.removeEventListener('scroll', readVisibleSocialReplies, true);

      root.removeEventListener('dragstart', onPresetDragStart);

      root.removeEventListener('dragover', onPresetDragOver);

      root.removeEventListener('dragleave', onPresetDragLeave);

      root.removeEventListener('drop', onPresetDrop);

      root.removeEventListener('dragend', onPresetDragEnd);

      root.removeEventListener('pointerdown', onPresetPointerDown);

      cleanupTouchDrag();

      element.remove(); fontStyle.remove();

    },

  };

}

