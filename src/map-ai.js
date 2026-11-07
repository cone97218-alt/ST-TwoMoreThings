import { parseJsonObject } from './api.js';
import {
  MAP_BASEMAPS,
  buildMapProjection,
  readBaiBaiBookMapSnapshot,
  validQianchuangMapStyle,
  normalizeQianchuangMapLayout,
} from './map-engine.js';
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

      const projPlaces = projection.places || [];
      const placeById = new Map(projPlaces.map(p => [p.id, p]));
      const pathOf = p => {
        const names = [];
        const seen = new Set();
        let cur = p;
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); names.unshift(cur.name); cur = placeById.get(cur.parentId); }
        return names.join(' > ');
      };
      // 柏宝书既定地点优先放进提示词，避免被截断；AI 只能在其下补充，不得改名或改层级
      const ordered = [...projPlaces].sort((a, b) => (b.source === 'baibai') - (a.source === 'baibai'));
      const existingPlaces = ordered.slice(0, 120).map(p => ({
        name: p.name,
        path: pathOf(p),
        role: p.role,
        parentName: placeById.get(p.parentId)?.name || '',
        source: p.source === 'baibai' ? '柏宝书既定' : '已有',
        desc: p.desc || '',
        facilities: p.facilities || [],
      }));

      const payload = sanitizePhoneContext({
        currentLocation: projection.userPosition?.label || '',
        currentLocationPath: (projection.userPosition?.breadcrumb || []).map(b => b.name).join(' > '),
        existingPlaces,
        rules: '标注“柏宝书既定”的地点来自剧情记录，名称与层级不可更改、不可重复创建；新增地点必须通过 parentName 挂到已有地点（或本次新增的地点）之下，parentName 须与已有名称完全一致；不要输出 currentLocation，当前位置由剧情自动决定。',
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
      const existingByName = new Map();
      for (const p of projPlaces) {
        const k = String(p.name || '').trim().toLowerCase();
        existingByName.set(k, existingByName.has(k) ? null : p);
      }
      const places = rawPlaces
        .map((item, idx) => {
          const name = String(item?.name || '').trim();
          if (!name) return null;
          const role = ['area', 'site', 'interior'].includes(item?.role) ? item.role : '';
          const mapLevel = ['city', 'country', 'scope'].includes(item?.mapLevel) ? item.mapLevel : '';
          const mapStyle = validQianchuangMapStyle(item?.mapStyle) ? item.mapStyle : '';
          const mapLayout = normalizeQianchuangMapLayout(item?.mapLayout, mapStyle || basemap) || '';
          const parentName = String(item?.parentName || item?.parent || '').trim();
          const desc = String(item?.desc || item?.description || '').trim();
          const facilities = Array.isArray(item?.facilities)
            ? item.facilities.map(s => (typeof s === 'string' ? s.trim() : String(s?.label || '').trim())).filter(Boolean)
            : [];
          const aliases = Array.isArray(item?.aliases)
            ? item.aliases.map(s => String(s).trim()).filter(Boolean)
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
            parentId: existingByName.get(parentName.toLowerCase())?.id || '',
            role: role || (parentName ? 'site' : 'area'),
            mapLevel,
            mapStyle,
            mapLayout,
            desc,
            facilities,
            aliases,
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
    async calibrateBaiBaiMap({ instruction = '' } = {}) {
      const sources = await contextReader.readDirectorySources({ readMemory: true });
      const state = store?.read?.() || {};
      const baibaiSnapshot = readBaiBaiBookMapSnapshot();
      const rawScenes = Array.isArray(baibaiSnapshot?.scenes) ? baibaiSnapshot.scenes : [];
      if (!rawScenes.length) {
        throw new Error('当前未检测到百宝书场景数据，请先在百宝书中记录场景或开启百宝书。');
      }

      const sceneByName = new Map();
      const existingScenes = rawScenes.map(s => {
        const id = String(s.id || '').trim();
        const name = String(s.name || '').trim();
        const path = Array.isArray(s.path) ? s.path : [name];
        const item = {
          id: id ? `baibai:${id}` : `baibai:${path.join('/')}`,
          rawId: id,
          name,
          path: path.join(' > '),
          parentId: s.parentId ? `baibai:${s.parentId}` : '',
          desc: String(s.desc || '').trim(),
        };
        const nk = name.toLowerCase();
        if (nk) sceneByName.set(nk, item);
        return item;
      });

      const payload = sanitizePhoneContext({
        currentLocation: baibaiSnapshot?.location || '',
        currentLocationPath: (baibaiSnapshot?.locationPath || []).join(' > '),
        scenes: existingScenes,
        rules: '【铁律限制】严禁添加列表中不存在的任何新地点，严禁修改已有地点名称。只针对给出的 scenes 列表，审阅世界观补齐 role（area分区/site建筑/interior室内）、quadrant（east/west/south/north/center/inner/outer）、facilities 设施标签与 relations 拓扑关系。',
        userInstruction: instruction ? `用户补充校准要求：${instruction}` : '',
      });

      const activePreset = getActivePreset(state);
      const storyHistoryText = (sources.story || []).map(item => `${item.speaker || ''}：${item.text}`).join('\n\n');
      const latestUserInput = instruction
        ? `百宝书地图方位校准指令：${instruction}`
        : '请根据当前世界观与正文，严格在给定的百宝书地点范围内，补齐空间方位、角色层级与设施标签。';

      const messagesPayload = compilePromptPreset(activePreset, {
        worldbook: sources.worldbook || '',
        storyHistory: storyHistoryText,
        storyMemory: sources.storyMemory || '',
        phoneContext: payload,
        latestUserInput,
      }, 'map_calibrate', state);

      const collapsed = collapseMessages(messagesPayload);
      const systemEntries = messagesPayload.filter(m => m.role === 'system');
      const userEntries = messagesPayload.filter(m => m.role !== 'system');
      const systemPrompt = systemEntries.map(m => m.content).join('\n\n');

      const reply = await modelClient.complete({
        label: 'AI 百宝书地图方位校准',
        system: systemPrompt,
        messages: userEntries.length ? userEntries : [{ role: 'user', content: JSON.stringify(payload) }],
        entries: messagesPayload,
        collapsedMessages: collapsed,
      });

      const parsed = parseJsonObject(reply);
      const basemap = parsed?.basemap && MAP_BASEMAPS[parsed.basemap] ? parsed.basemap : '';
      const rawPlaces = Array.isArray(parsed?.places) ? parsed.places : [];

      const overrides = {};
      const calibratedPlaces = [];

      for (const item of rawPlaces) {
        const name = String(item?.name || '').trim();
        if (!name) continue;
        const matched = sceneByName.get(name.toLowerCase());
        if (!matched) continue;

        const role = ['area', 'site', 'interior'].includes(item?.role) ? item.role : '';
        const quadrant = ['east', 'west', 'south', 'north', 'center', 'inner', 'outer'].includes(item?.quadrant)
          ? item.quadrant
          : '';
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
            .filter(r => r.targetName && sceneByName.has(r.targetName.toLowerCase()))
          : [];

        const overrideData = {
          ...(role ? { role } : {}),
          ...(quadrant ? { quadrant } : {}),
          ...(facilities.length ? { facilities } : {}),
          ...(relations.length ? { relations } : {}),
        };

        overrides[matched.id] = overrideData;
        if (matched.rawId) {
          overrides[matched.rawId] = overrideData;
        }

        calibratedPlaces.push({
          id: matched.id,
          name: matched.name,
          path: matched.path,
          role: role || (matched.parentId ? 'site' : 'area'),
          quadrant,
          facilities,
          relations,
          selected: true,
        });
      }

      return {
        basemap,
        overrides,
        places: calibratedPlaces,
        totalScenes: existingScenes.length,
      };
    },
  };
}
