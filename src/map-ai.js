import { parseJsonObject } from './api.js';
import { MAP_BASEMAPS, buildMapProjection, readBaiBaiBookMapSnapshot } from './map-engine.js';
import { compilePromptPreset, collapseMessages, getActivePreset, sanitizePhoneContext } from './preset-engine.js';

export function createMapAiService({ contextReader, modelClient, target, store }) {
  return {
    async organizeMap({ instruction = '' } = {}) {
      const sources = await contextReader.readDirectorySources({ readMemory: true });
      const state = store?.read?.() || {};
      const baibaiSnapshot = readBaiBaiBookMapSnapshot();
      const projection = buildMapProjection({
        state,
        baibaiSnapshot,
        messages: target?.messages || [],
      });

      const existingPlaces = (projection.places || []).map(p => ({
        name: p.name,
        role: p.role,
        parentName: (projection.places.find(x => x.id === p.parentId)?.name) || '',
        desc: p.desc || '',
        facilities: p.facilities || [],
      }));

      const payload = sanitizePhoneContext({
        currentLocation: projection.userPosition?.label || '',
        existingPlaces: existingPlaces.slice(0, 40),
        userInstruction: instruction ? `用户特别指定的地图整理/构想要求：${instruction}` : '',
      });

      const activePreset = getActivePreset(state);
      const storyHistoryText = (sources.story || []).map(item => `${item.speaker || ''}：${item.text}`).join('\n\n');
      const latestUserInput = instruction
        ? `地图整理与构想指令：${instruction}`
        : '请根据当前世界观、剧情与已有地点，整理并补充完整的层级地图结构。';

      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: sources.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: sources.storyMemory || '',
        phoneContext: payload,
        latestUserInput,
      }, 'map_organize', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: 'AI 地图构想与整理',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(payload) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });

      const parsed = parseJsonObject(reply);
      const rawPlaces = Array.isArray(parsed?.places) ? parsed.places : [];
      const basemap = parsed?.basemap && MAP_BASEMAPS[parsed.basemap] ? parsed.basemap : '';
      const currentLocation = String(parsed?.currentLocation || '').trim();

      const stamp = Date.now().toString(36);
      const places = rawPlaces
        .map((item, idx) => {
          const name = String(item?.name || '').trim();
          if (!name) return null;
          const role = ['area', 'site', 'interior'].includes(item?.role) ? item.role : '';
          const parentName = String(item?.parentName || item?.parent || '').trim();
          const desc = String(item?.desc || item?.description || '').trim();
          const facilities = Array.isArray(item?.facilities)
            ? item.facilities.map(s => String(s).trim()).filter(Boolean)
            : [];
          const relations = Array.isArray(item?.relations)
            ? item.relations
              .map(r => ({
                targetName: String(r?.targetName || r?.place || '').trim(),
                type: String(r?.type || '邻近').trim(),
                note: String(r?.note || '').trim(),
              }))
              .filter(r => r.targetName)
            : [];
          return {
            id: `ai:place:${stamp}:${idx}`,
            name,
            parentName,
            role: role || (parentName ? 'site' : 'area'),
            desc,
            facilities,
            relations,
            selected: true,
          };
        })
        .filter(Boolean);

      return {
        basemap,
        currentLocation,
        places,
      };
    },
  };
}
