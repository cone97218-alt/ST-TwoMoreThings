import {
  selectWorldEntries,
  sortWorldInfoEntriesLikeST,
  readBaiBaiExcludeSettings,
  isWorldInfoEntryExcluded,
  renderWorldInfoContent,
} from './worldbook.js';
import { OPEN_COMMAND } from './quick-reply.js';
import { readCardPreset } from './authoring.js';

const PROMPT_ID = 'pocket-phone-context';

export async function renderUpdateMarkdown(text) {
  const { showdown, DOMPurify } = await import(new URL('/lib.js', globalThis.location.href).href);
  return DOMPurify.sanitize(new showdown.Converter().makeHtml(text), { FORBID_TAGS: ['img', 'iframe', 'object', 'embed', 'style', 'form'], FORBID_ATTR: ['style'] });
}

export function createHostAdapter({ contextProvider = () => (globalThis.SillyTavern || globalThis.Luker)?.getContext(), fetchImpl = (...args) => globalThis.fetch(...args), worldInfoBindings, mode = 'standalone' } = {}) {
  const embedded = mode === 'embedded', promptId = embedded ? `${PROMPT_ID}-card` : PROMPT_ID, openCommand = embedded ? 'tmt-card-open' : OPEN_COMMAND;
  const context = () => {
    const value = contextProvider();
    if (!value) throw new Error('暂时无法读取酒馆，请刷新页面后再打开小手机。');
    return value;
  };
  const host = {
    mode, phoneSettingsKey: embedded ? 'twoMoreThingsEmbedded' : 'pocketPhone', openCommand,
    captureChat() {
      const ctx = context();
      const character = ctx.characters?.[ctx.characterId];
      let currentMessages = ctx.chat || [];
      const target = {
        id: ctx.chatId ?? ctx.getCurrentChatId?.(),
        groupId: ctx.groupId,
        embeddedPhone: readCardPreset(character),
        metadata: ctx.chatMetadata || {},
        get messages() {
          try {
            const live = context();
            const liveId = live.chatId ?? live.getCurrentChatId?.();
            if (Array.isArray(live.chat) && (!target.id || liveId === target.id) && (currentMessages === live.chat || (!currentMessages.length && live.chat.length))) {
              currentMessages = live.chat;
            }
          } catch {}
          return currentMessages;
        },
        set messages(value) {
          currentMessages = Array.isArray(value) ? value : [];
        },
        character: character ? { name: character.name, avatar: character.avatar, description: character.description || character.data?.description || '', personality: character.personality || character.data?.personality || '', scenario: character.scenario || character.data?.scenario || '', world: character.data?.extensions?.world || '' } : null,
        user: ctx.name1 || '我', personaWorld: ctx.powerUserSettings?.persona_description_lorebook || '',
        host,
        async saveMetadata() {
          if (!target.id) {
            // 在未命名的极新空白聊天中，暂无聊天文件，先记录在 target.metadata 中
            return;
          }
          try {
            const live = context();
            if (live.chatMetadata && target.metadata?.pocketPhone && live.chatMetadata !== target.metadata) {
              live.chatMetadata.pocketPhone = target.metadata.pocketPhone;
            }
            if (typeof ctx.saveChatMetadata === 'function') {
              if (await ctx.saveChatMetadata() !== true) throw new Error('未能保存');
            } else if (typeof ctx.saveMetadata === 'function') await ctx.saveMetadata();
            else throw new Error('当前酒馆未提供保存接口');
          } catch { throw new Error('手机内容保存失败，请检查酒馆连接后重试。'); }
        },
      };
      target.readWorldInfo = options => host.readWorldInfo(target, options);
      return target;
    },
    readSettings: () => context().extensionSettings,
    getRequestHeaders: () => context().getRequestHeaders(),
    async readExtensionTypes() { return (await import(new URL('/scripts/extensions.js', globalThis.location.href).href)).extensionTypes; },
    getEventSource: () => context().eventSource,
    saveSettings: () => context().saveSettingsDebounced(),
    readQuickReplies: () => globalThis.quickReplyApi,
    registerOpenCommand(open) {
      const { SlashCommandParser: parser, SlashCommand: Command } = context();
      if (!parser?.addCommandObject || !Command?.fromProps) return null;
      if (parser.commands?.[openCommand]) throw new Error('两三事的快捷命令已被占用。');
      const command = Command.fromProps({ name: openCommand, helpString: '打开两三事。', callback: () => { open(); return ''; } });
      parser.addCommandObject(command);
      return () => { if (parser.commands?.[openCommand] === command) delete parser.commands[openCommand]; };
    },
    onReady(callback) {
      const ctx = context(), name = ctx.eventTypes?.APP_READY;
      if (!name || !ctx.eventSource) { callback(); return () => {}; }
      ctx.eventSource.on(name, callback);
      return () => ctx.eventSource.removeListener(name, callback);
    },
    onChatChanged(callback) {
      const ctx = context(), name = ctx.eventTypes?.CHAT_CHANGED;
      if (!name || !ctx.eventSource) return () => {};
      ctx.eventSource.on(name, callback);
      return () => ctx.eventSource.removeListener(name, callback);
    },
    listWorldInfoNames() {
      const ctx = context();
      if (typeof ctx?.getWorldInfoNames === 'function') {
        try {
          const names = ctx.getWorldInfoNames();
          if (Array.isArray(names)) return names.filter(Boolean);
        } catch {}
      }
      if (typeof globalThis.world_info_list === 'function') {
        try {
          const names = globalThis.world_info_list();
          if (Array.isArray(names)) return names.filter(Boolean);
        } catch {}
      }
      if (Array.isArray(globalThis.world_info_list)) {
        return globalThis.world_info_list.filter(Boolean);
      }
      if (typeof document !== 'undefined') {
        const opts = document.querySelectorAll('#world_editor_select option');
        const out = [];
        for (const o of opts) {
          if (o.value !== '' && o.textContent) out.push(o.textContent.trim());
        }
        if (out.length) return [...new Set(out)];
      }
      return [];
    },
    async readWorldInfo(target, { scanText, excludeSettings } = {}) {
      const ctx = context();
      const stSettings = ctx?.extensionSettings || globalThis.extension_settings || {};
      const excludes = excludeSettings || readBaiBaiExcludeSettings(() => stSettings);

      // 核心可从CDN加载，宿主模块仍必须从当前酒馆页面的地址读取。
      const bindings = worldInfoBindings || await import(new URL('/scripts/world-info.js', globalThis.location.href).href).then(world => ({
        getNames: current => [...(world.selected_world_info || []), ...[current.metadata.world_info || []].flat(), ...(world.world_info?.charLore?.find(x => x.name === current.character?.avatar?.replace(/\.[^.]+$/, ''))?.extraBooks || [])],
        load: world.loadWorldInfo,
        defaults: { caseSensitive: world.world_info_case_sensitive, matchWholeWords: world.world_info_match_whole_words },
      }));

      const allNames = [...new Set([target.character?.world, target.personaWorld, ...(bindings.getNames?.(target) || [])].filter(Boolean))];
      // 对接柏宝书：整本排除过滤
      const names = allNames.filter(name => !excludes.excludedWorldNames.includes(name));

      const allMatchingEntries = [];
      for (const name of names) {
        const book = await bindings.load(name);
        if (!book) throw new Error('关联世界书读取失败，请检查世界书是否可用。');
        const rows = Object.values(book.entries || {}).map(entry => ({ ...entry, world: entry.world || name }));
        const entries = scanText === undefined ? rows : selectWorldEntries(rows, scanText, { defaults: bindings.defaults, user: target.user, char: target.character?.name, excludeSettings: excludes });
        for (const entry of entries) {
          if (entry.disable || entry.disabled || entry.enabled === false || typeof entry.content !== 'string') continue;
          if (isWorldInfoEntryExcluded(entry, excludes)) continue;
          allMatchingEntries.push(entry);
        }
      }

      // 对齐 SillyTavern 标准主提示词装配顺序（位置桶 + 深度 + order 升序，修复此前颠倒问题）
      const sortedEntries = sortWorldInfoEntriesLikeST(allMatchingEntries);

      const parts = [];
      const seen = new Set();
      let remaining = 24000;
      for (const entry of sortedEntries) {
        // 对接柏宝书：支持世界书宏展开与 EJS 模板求值
        const rendered = await renderWorldInfoContent(entry.content, entry, { renderTemplates: excludes.renderWorldInfoTemplates, ctx });
        const trimmed = (rendered || '').trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        const text = trimmed.slice(0, remaining);
        parts.push(text);
        remaining -= text.length;
        if (!remaining) return parts.join('\n\n');
      }
      return parts.join('\n\n');
    },
    setPrompt(text) { context().setExtensionPrompt(promptId, text, 1, 0, false, 0); },
    reportError(message) { if (globalThis.toastr) globalThis.toastr.error(message); else globalThis.alert?.(message); },
    reportNotice(message) { if (globalThis.toastr) globalThis.toastr.warning(message); else globalThis.alert?.(message); },
    onBeforeMainGeneration(callback) {
      const ctx = context();
      const name = ctx.eventTypes?.GENERATION_AFTER_COMMANDS;
      if (!name || !ctx.eventSource) throw new Error('当前酒馆未提供正文参考接口。');
      ctx.eventSource.on(name, callback);
      return () => ctx.eventSource.removeListener(name, callback);
    },
    onStoryChanged(callback) {
      const ctx = context();
      const names = ['GENERATION_ENDED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED'].map(key => ctx.eventTypes[key]);
      for (const name of names) ctx.eventSource.on(name, callback);
      globalThis.addEventListener?.('st-sevendayscal:display-changed', callback);
      return () => { for (const name of names) ctx.eventSource.removeListener(name, callback); globalThis.removeEventListener?.('st-sevendayscal:display-changed', callback); };
    },
    request(path, init) { return fetchImpl(path, { ...init, headers: { ...context().getRequestHeaders(), ...init.headers } }); },
  };
  return host;
}
