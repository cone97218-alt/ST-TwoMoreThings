// 地图（千窗）核心引擎：无坐标层级场景 -> 主题底图/高精底图库/真实城市底图区域与锚点投影 + 177类设施NLP识别 + 1958枚Lucide图标 + 世界书提取 + 柏宝书(STBaiBaiBook)与聊天顶栏联动

import {
  QIANCHUANG_MAP_ASSETS,
  qianchuangMapCandidates,
  selectQianchuangMapAsset,
} from './qianchuang-map-assets.js';
import {
  QIANCHUANG_MAP_STYLES,
  validQianchuangMapStyle,
  validQianchuangMapLayout,
  normalizeQianchuangMapLayout,
  normalizePlaceFacilities,
  qianchuangFacilityDirectory,
} from './qianchuang-display-hints.js';
import {
  QIANCHUANG_MAP_BASE_URL,
  qianchuangMapCatalogEntries,
  createQianchuangMapCatalog,
} from './qianchuang-map-catalog.js';
import { QIANCHUANG_BASEMAPS } from './ui/qianchuang-basemaps.js';
import { GENERIC_BASEMAPS } from './ui/qianchuang-generic-trio.js';
import { QIANCHUANG_MAP_REGIONS } from './ui/qianchuang-map-regions.js';
import { QIANCHUANG_MAP_ANCHORS } from './ui/qianchuang-map-anchors.js';
import { qianchuangMapLayout } from './ui/qianchuang-map-layout.js';
import { createGenericMapLoader } from './ui/qianchuang-map-loader.js';
import {
  CITY_MAPS,
  cityMapForPlace,
  cityMapsForPlaceAddresses,
  createCityMapLoader,
  citySchematicLayout,
} from './ui/qianchuang-city-maps.js';
import {
  placeMapLevel,
  projectQianchuangSheets,
  snapshotForCitySheet,
} from './ui/qianchuang-city-sheets.js';
import { projectQianchuangBrowse } from './ui/qianchuang-browse.js';
import { QIANCHUANG_FACILITY_TERMS } from './ui/qianchuang-facility-terms.js';
import { qianchuangFacilityTags } from './ui/qianchuang-facilities.js';
import { LUCIDE_ICONS } from './ui/qianchuang-lucide-data.js';
import {
  qianchuangIcon,
  qianchuangIconName,
  qianchuangIconNames,
  qianchuangIconCanonicalName,
} from './ui/qianchuang-icons.js';
import {
  indexQianchuangWorldInfo,
  projectQianchuangWorldInfo,
} from './ui/qianchuang-worldbook.js';
import {
  captureQianchuangCharacterSources,
} from './place-worldbook-material.js';

export {
  QIANCHUANG_MAP_ASSETS,
  qianchuangMapCandidates,
  selectQianchuangMapAsset,
  QIANCHUANG_MAP_STYLES,
  validQianchuangMapStyle,
  validQianchuangMapLayout,
  normalizeQianchuangMapLayout,
  normalizePlaceFacilities,
  qianchuangFacilityDirectory,
  QIANCHUANG_MAP_BASE_URL,
  qianchuangMapCatalogEntries,
  createQianchuangMapCatalog,
  QIANCHUANG_BASEMAPS,
  GENERIC_BASEMAPS,
  QIANCHUANG_MAP_REGIONS,
  QIANCHUANG_MAP_ANCHORS,
  qianchuangMapLayout,
  createGenericMapLoader,
  CITY_MAPS,
  cityMapForPlace,
  cityMapsForPlaceAddresses,
  createCityMapLoader,
  citySchematicLayout,
  placeMapLevel,
  projectQianchuangSheets,
  snapshotForCitySheet,
  projectQianchuangBrowse,
  QIANCHUANG_FACILITY_TERMS,
  qianchuangFacilityTags,
  LUCIDE_ICONS,
  qianchuangIcon,
  qianchuangIconName,
  qianchuangIconNames,
  qianchuangIconCanonicalName,
  indexQianchuangWorldInfo,
  projectQianchuangWorldInfo,
  captureQianchuangCharacterSources,
};

// 快捷设施标签（供手动编辑面板一键点选，同时映射 Lucide 图标）
export const MAP_FACILITY_TAGS = [
  { id: '餐饮', label: '餐饮', icon: 'Utensils' },
  { id: '住宿', label: '住宿', icon: 'BedDouble' },
  { id: '购物', label: '购物', icon: 'ShoppingBag' },
  { id: '交通', label: '交通', icon: 'TrainFront' },
  { id: '医疗', label: '医疗', icon: 'Cross' },
  { id: '娱乐', label: '娱乐', icon: 'Sparkles' },
  { id: '办公', label: '办公', icon: 'BriefcaseBusiness' },
  { id: '住宅', label: '住宅', icon: 'House' },
  { id: '景观', label: '景观', icon: 'Trees' },
  { id: '学府', label: '学府', icon: 'BookOpen' },
  { id: '秘境', label: '秘境', icon: 'Compass' },
  { id: '防务', label: '防务', icon: 'Shield' },
  { id: '独立卫浴', label: '独立卫浴', icon: 'Bath' },
  { id: '厨房', label: '厨房', icon: 'CookingPot' },
  { id: '仓储', label: '仓储', icon: 'Archive' },
];

const QUICK_TAG_ICON_MAP = new Map(MAP_FACILITY_TAGS.map(t => [t.id, t.icon]));

const STYLE_THEME_DEFS = [
  {
    id: 'modern',
    basemapKey: 'modern',
    defaultAssetId: 'modern-inland',
    label: '现代都市',
    desc: '高架路网、跨江大桥与核心商圈街区',
    keywords: ['市', '区', '大厦', '写字楼', '地铁', '大道', '广场', '公寓', '医院', '大学', 'CBD', '商圈', '百货', '高架', '集团'],
  },
  {
    id: 'modern-town',
    basemapKey: 'modern-town',
    defaultAssetId: 'modern-town-plain',
    label: '现代小城',
    desc: '河谷沿岸、车站老街与宁静住宅社区',
    keywords: ['镇', '县', '车站', '小巷', '商店街', '河畔', '中学', '便利店', '诊所', '社区', '小镇'],
  },
  {
    id: 'old-town',
    basemapKey: 'town',
    defaultAssetId: 'old-town-inland',
    label: '古风城镇',
    desc: '护城河池、四方城垣、朱雀长街与坊市',
    keywords: ['城', '坊', '客栈', '酒楼', '镖局', '衙门', '书院', '茶楼', '寺', '庙', '巷', '府', '阁', '王都', '公会', '铁匠铺'],
  },
  {
    id: 'palace',
    basemapKey: 'palace',
    defaultAssetId: 'palace-axial',
    label: '宫苑庭院',
    desc: '中轴重门、前后殿宇、曲池假山与东西跨院',
    keywords: ['宫', '殿', '苑', '轩', '斋', '亭', '院', '庄', '宗', '门派', '长老', '后山', '御花园', '本丸', '天守'],
  },
  {
    id: 'terrain',
    basemapKey: 'terrain',
    defaultAssetId: 'terrain-forest',
    label: '自然山野',
    desc: '连绵山脉、林海河谷、荒原古道与秘境',
    keywords: ['山', '谷', '林', '森林', '海', '岛', '湖', '洞', '崖', '原', '村', '营地', '遗迹', '秘境', '荒漠', '雪原'],
  },
  {
    id: 'sci-fi',
    basemapKey: 'sci-fi',
    defaultAssetId: 'sci-fi-linear',
    label: '科幻设施',
    desc: '环形轨道舱、中央反应核心与扇区矩阵',
    keywords: ['舱', '舰', '基地', '实验室', '核心', '甲板', '太空', '星', '轨道', '赛博', '港区', '扇区', '空间站'],
  },
];

// 构建完整的底图注册表：包含 6 大主题风格、24 项高精地图库资产、10 座真实城市底图
export const MAP_BASEMAPS = {};

for (const theme of STYLE_THEME_DEFS) {
  const inlineBase = QIANCHUANG_BASEMAPS[theme.basemapKey] || QIANCHUANG_BASEMAPS.modern;
  const asset = QIANCHUANG_MAP_ASSETS[theme.defaultAssetId];
  MAP_BASEMAPS[theme.id] = {
    id: theme.id,
    kind: 'style',
    group: 'style',
    family: theme.id,
    layout: asset?.layout || '',
    defaultAssetId: theme.defaultAssetId,
    file: asset?.file || '',
    width: inlineBase.width || 1000,
    height: inlineBase.height || 1000,
    label: theme.label,
    desc: theme.desc,
    keywords: theme.keywords,
    regions: QIANCHUANG_MAP_REGIONS[theme.basemapKey] || asset?.regions || QIANCHUANG_MAP_REGIONS.modern,
    anchors: QIANCHUANG_MAP_ANCHORS[theme.basemapKey] || asset?.anchors || QIANCHUANG_MAP_ANCHORS.modern,
    origin: asset?.origin || '千窗内置主题几何底图',
    svg: inlineBase.markup,
  };
}

// 兼容 'town' 别名指向 'old-town'
MAP_BASEMAPS.town = {
  ...MAP_BASEMAPS['old-town'],
  id: 'town',
};

// 注入 24 项高精库底图资产 (QIANCHUANG_MAP_ASSETS)
for (const [assetId, asset] of Object.entries(QIANCHUANG_MAP_ASSETS)) {
  const familyKey = asset.family === 'old-town' ? 'town' : asset.family;
  const inlineBase = QIANCHUANG_BASEMAPS[familyKey] || QIANCHUANG_BASEMAPS.modern;
  MAP_BASEMAPS[assetId] = {
    id: assetId,
    kind: 'library',
    group: 'library',
    family: asset.family,
    layout: asset.layout,
    file: asset.file,
    sha256: asset.sha256,
    width: asset.width || 1000,
    height: asset.height || 1000,
    label: asset.label,
    desc: (asset.shortTags || []).join(' · ') || asset.label,
    keywords: asset.shortTags || [],
    regions: asset.regions,
    anchors: asset.anchors,
    origin: asset.origin || '',
    svg: inlineBase.markup,
  };
}

// 注入 10 座真实世界城市底图 (CITY_MAPS)
for (const [cityId, city] of Object.entries(CITY_MAPS)) {
  const inlineBase = QIANCHUANG_BASEMAPS.modern;
  MAP_BASEMAPS[cityId] = {
    id: cityId,
    kind: 'city',
    group: 'city',
    family: 'modern',
    layout: 'city',
    file: city.file,
    sha256: city.sha256,
    width: city.width || 1000,
    height: city.height || 1000,
    label: `真实城市·${city.label}`,
    cityName: city.label,
    desc: `${city.label}真实路网与水系底图（OSM）`,
    keywords: city.aliases || [city.label],
    aliases: city.aliases || [city.label],
    slots: city.slots || [],
    groups: city.groups || [],
    origin: '© OpenStreetMap contributors · ODbL',
    svg: inlineBase.markup,
  };
}

export function listBasemapOptions() {
  const styleOptions = STYLE_THEME_DEFS.map(t => ({
    id: t.id,
    label: `主题·${t.label}`,
    desc: t.desc,
    group: 'style',
    groupLabel: '主题风格底图（自动优选高精子底图）',
  }));
  const libraryOptions = Object.values(QIANCHUANG_MAP_ASSETS).map(a => ({
    id: a.id,
    label: a.label,
    desc: (a.shortTags || []).join(' · ') || a.label,
    group: 'library',
    groupLabel: '千窗高精几何底图库（21款）',
  }));
  const cityOptions = Object.values(CITY_MAPS).map(c => ({
    id: c.id,
    label: `真实城市·${c.label}`,
    desc: `${c.label}真实路网与水系底图`,
    group: 'city',
    groupLabel: '真实世界城市底图（10城）',
  }));
  return [
    {
      id: 'auto',
      label: '自动匹配底图',
      desc: '根据当前城市/场景名称与环境描述自动匹配真实城市、主题风格与细分地貌',
      group: 'auto',
      groupLabel: '智能匹配',
    },
    ...styleOptions,
    ...cityOptions,
    ...libraryOptions,
  ];
}

const LAYOUT_HINT_KEYWORDS = [
  { style: 'palace', layout: 'honmaru', keywords: ['本丸', '天守', '御殿', '刀剑', '和风院落', '日式院落'] },
  { style: 'palace', layout: 'courtyard', keywords: ['园林', '假山', '曲池', '后苑', '山庄', '跨院'] },
  { style: 'palace', layout: 'axial', keywords: ['太和', '乾清', '中轴', '皇宫', '大殿', '金銮', '正殿'] },
  { style: 'sci-fi', layout: 'ring', keywords: ['环状', '环形', '离心', '空间站', '穹顶', '轨道环'] },
  { style: 'sci-fi', layout: 'linear', keywords: ['甲板', '生活舱', '走廊', '舰桥', '船舱'] },
  { style: 'terrain', layout: 'desert', keywords: ['沙漠', '荒漠', '戈壁', '沙丘', '绿洲', '大漠'] },
  { style: 'terrain', layout: 'snow', keywords: ['雪山', '冰原', '雪原', '北境', '极地', '冰川', '冻土'] },
  { style: 'terrain', layout: 'coast', keywords: ['海岸', '海滩', '海岛', '海湾', '礁石', '群岛'] },
  { style: 'terrain', layout: 'grassland', keywords: ['草原', '平原', '牧场', '原野', '草甸'] },
  { style: 'terrain', layout: 'forest-river', keywords: ['林谷', '溪谷', '密林河谷'] },
  { style: 'terrain', layout: 'mountain', keywords: ['山谷', '山脉', '峡谷', '高峰', '险峰', '山道'] },
  { style: 'terrain', layout: 'forest', keywords: ['森林', '密林', '林海', '古树', '丛林'] },
  { style: 'old-town', layout: 'coast', keywords: ['港', '码头', '海港', '渡口', '船坞'] },
  { style: 'old-town', layout: 'river', keywords: ['河畔', '水乡', '江南', '运河', '画舫', '桥'] },
  { style: 'old-town', layout: 'mountain', keywords: ['山城', '山寨', '关隘', '山门'] },
  { style: 'modern', layout: 'coast', keywords: ['海滨', '滨海', '海湾', '外滩', '港区', '维港'] },
  { style: 'modern', layout: 'river', keywords: ['江畔', '跨江', '江北', '江南', '滨江', '河畔'] },
  { style: 'modern-town', layout: 'coast', keywords: ['海滨小镇', '渔村', '海湾镇'] },
  { style: 'modern-town', layout: 'hills', keywords: ['山麓', '坡道', '山坡小镇'] },
  { style: 'modern-town', layout: 'river', keywords: ['溪畔', '河岸小镇', '水岸小镇'] },
];

export function inferMapLayoutHint(styleId, places = [], scopeNode = null) {
  const normalizedStyle = styleId === 'town' ? 'old-town' : styleId;
  if (scopeNode?.mapLayout && validQianchuangMapLayout(scopeNode.mapLayout, normalizedStyle)) {
    return scopeNode.mapLayout;
  }
  const explicitPlace = (places || []).find(
    p => p.mapLayout && validQianchuangMapLayout(p.mapLayout, normalizedStyle),
  );
  if (explicitPlace) return explicitPlace.mapLayout;

  const corpus = [
    scopeNode ? `${scopeNode.name || ''} ${scopeNode.desc || ''}` : '',
    ...(places || []).map(p => `${p.name || ''} ${p.desc || ''} ${(p.facilities || []).join(' ')}`),
  ].join(' ');

  for (const rule of LAYOUT_HINT_KEYWORDS) {
    if (rule.style === normalizedStyle && rule.keywords.some(kw => corpus.includes(kw))) {
      return rule.layout;
    }
  }
  return null;
}

export function resolveBasemapId(requestedId, places = [], scopeNode = null) {
  if (requestedId && requestedId !== 'auto' && MAP_BASEMAPS[requestedId]) {
    return requestedId === 'town' ? 'old-town' : requestedId;
  }

  // 1. 检查当前作用域节点或地点列表是否显式指定了 mapStyle
  if (scopeNode?.mapStyle && MAP_BASEMAPS[scopeNode.mapStyle]) {
    return scopeNode.mapStyle === 'town' ? 'old-town' : scopeNode.mapStyle;
  }

  // 2. 检查是否匹配 10 座真实世界城市 (首尔/北京/上海/广州/东京/纽约/洛杉矶/重庆/香港/名古屋)
  const candidatesForCity = scopeNode ? [scopeNode, ...(places || [])] : (places || []);
  for (const p of candidatesForCity) {
    const matchedCity = cityMapForPlace({
      displayName: p.name || p.displayName || '',
      aliases: p.aliases || [],
    });
    if (matchedCity && MAP_BASEMAPS[matchedCity.id]) {
      return matchedCity.id;
    }
  }

  const explicitStylePlace = (places || []).find(p => p.mapStyle && MAP_BASEMAPS[p.mapStyle]);
  if (explicitStylePlace) {
    return explicitStylePlace.mapStyle === 'town' ? 'old-town' : explicitStylePlace.mapStyle;
  }

  // 3. 关键词打分匹配 6 大主题风格
  const corpus = (places || [])
    .map(p => `${p.name || ''} ${p.desc || ''} ${(p.facilities || []).join(' ')}`)
    .join(' ');
  if (!corpus.trim()) return 'modern';

  let bestId = 'modern';
  let bestScore = 0;
  for (const theme of STYLE_THEME_DEFS) {
    let score = 0;
    for (const kw of theme.keywords || []) {
      if (corpus.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = theme.id;
    }
  }
  return bestId;
}

/**
 * 根据解析出的 basemapId（可能是主题风格如 'old-town'、真实城市如 'seoul' 或具体库资产如 'modern-coast'）
 * 进一步通过 selectQianchuangMapAsset 解析出对应的高精底图资产 ID
 */
export function resolveMapAssetId(basemapId, places = [], scopeNode = null, previousAssetId = null, usedAssetIds = []) {
  if (!basemapId) return 'modern-inland';
  if (CITY_MAPS[basemapId]) return basemapId;
  if (QIANCHUANG_MAP_ASSETS[basemapId]) return basemapId;

  const styleId = basemapId === 'town' ? 'old-town' : basemapId;
  const layoutHint = inferMapLayoutHint(styleId, places, scopeNode);
  const entityKey = scopeNode?.id || scopeNode?.name || places[0]?.id || places[0]?.name || styleId;
  const selected = selectQianchuangMapAsset({
    entityId: entityKey,
    style: styleId,
    layout: layoutHint,
    previousAssetId,
    usedAssetIds,
  });
  return selected || STYLE_THEME_DEFS.find(t => t.id === styleId)?.defaultAssetId || 'modern-inland';
}

/**
 * 提取单个地点的设施标签（结合 177 类中文设施词典 NLP 正负向判定 + 显式设施列表 + Lucide SVG 图标）
 */
export function extractPlaceFacilityTags(place = {}) {
  const features = [];
  if (place.desc) {
    features.push({ text: place.desc, kind: 'stable' });
  }
  const supplements = [];
  if (place.name) {
    supplements.push({ text: place.name, kind: 'stable' });
  }
  const rawFacilities = Array.isArray(place.facilities) ? place.facilities : [];
  for (const item of rawFacilities) {
    if (typeof item === 'string' && item.trim()) {
      features.push({ text: `设有${item.trim()}`, kind: 'stable' });
    } else if (item && typeof item === 'object' && item.label) {
      features.push({ text: `设有${item.label}`, kind: 'stable' });
    }
  }

  const nlpTags = qianchuangFacilityTags(features, supplements);
  const byLabel = new Map();

  for (const tag of nlpTags) {
    const iconName = qianchuangIconName(tag.key) || 'MapPin';
    byLabel.set(tag.label, {
      key: tag.key,
      icon: iconName,
      label: tag.label,
      svg: qianchuangIcon(iconName),
    });
  }

  // 确保用户/AI 手动填写的设施标签也在结果中
  for (const raw of rawFacilities) {
    const label = typeof raw === 'string' ? raw.trim() : String(raw?.label || '').trim();
    if (!label || byLabel.has(label)) continue;
    const explicitIcon = (typeof raw === 'object' && raw?.icon)
      || QUICK_TAG_ICON_MAP.get(label)
      || qianchuangIconName(label)
      || 'MapPin';
    byLabel.set(label, {
      key: explicitIcon,
      icon: qianchuangIconName(explicitIcon) || 'MapPin',
      label,
      svg: qianchuangIcon(explicitIcon),
    });
  }

  return [...byLabel.values()];
}

/**
 * 读取柏宝书 (ST-BaiBai-Book) 公开快照
 */
export function readBaiBaiBookMapSnapshot(root = globalThis) {
  try {
    const api = root?.STBaiBaiBook;
    if (!api || typeof api.getSnapshot !== 'function') {
      return null;
    }
    const snap = api.getSnapshot();
    if (!snap || typeof snap !== 'object') return null;
    return {
      time: String(snap.state?.time || '').trim(),
      location: String(snap.state?.location || '').trim(),
      locationPath: Array.isArray(snap.state?.locationPath)
        ? snap.state.locationPath.map(s => String(s || '').trim()).filter(Boolean)
        : [],
      scenes: Array.isArray(snap.scenes) ? snap.scenes : [],
      npcs: Array.isArray(snap.npcs) ? snap.npcs : [],
      items: Array.isArray(snap.items) ? snap.items : [],
    };
  } catch {
    return null;
  }
}

/**
 * 从聊天记录的 `<top_format>` 或 `✧时间|地点|天气✧` 顶栏提取最新位置与路径
 */
export function readInlineMessageLocation(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const raw = String(list[i]?.mes ?? list[i]?.text ?? '');
    if (!raw) continue;
    const match = raw.match(/✧([^✧|\n]+)\|([^✧|\n]+)\|([^✧|\n]+)✧/);
    if (match && match[2]) {
      const locRaw = match[2].trim();
      if (!locRaw || locRaw === '未知' || locRaw === '无') continue;
      const parts = locRaw
        .split(/\s*(?:\/|>|→|·|—|--|-)\s*/)
        .map(s => s.trim())
        .filter(Boolean);
      return {
        location: parts[parts.length - 1] || locRaw,
        locationPath: parts.length ? parts : [locRaw],
        raw: locRaw,
      };
    }
  }
  return null;
}

const INTERIOR_SUFFIX_RE = /(?:卧室|房间|客房|书房|包厢|雅间|走廊|玄关|客厅|浴室|厨房|地下室|阁楼|内室|寝殿|偏殿|办公室|会议室|[一二三四五六七八九十\d]+楼|[一二三四五六七八九十\d]+层)$/;
const AREA_SUFFIX_RE = /(?:市|城|镇|县|区|郡|州|省|国|大陆|岛|域|界|山脉|森林|街区|商圈|园区|校区)$/;

export const INTERIOR_KEYWORD_RE = /(?:卧室|主卧|次卧|房间|客房|书房|包厢|雅间|走廊|玄关|客厅|浴室|厨房|灶台|洗手间|厕所|地下室|阁楼|内室|寝殿|偏殿|办公室|会议室|工位|沙发|阳台|电梯|床头|床上|大床|牢房|车内|[一二三四五六七八九十\d]+楼|[一二三四五六七八九十\d]+层)/;
export const AREA_KEYWORD_RE = /(?:市|城|镇|县|区|郡|州|省|国|大陆|岛|域|界|山脉|森林|街区|商圈|园区|校区|园|坊|街道|板块|领地|海滨|港口)$/;

export function inferPlaceRole(name = '', pathArr = []) {
  const clean = String(name || '').trim();
  if (!clean) return 'site';
  // 1. 优先硬性拦截微观/室内词，绝不让“厨房”、“灶台”等变成大区
  if (INTERIOR_KEYWORD_RE.test(clean)) return 'interior';
  // 2. 宏观大区/分区词
  if (AREA_KEYWORD_RE.test(clean)) return 'area';
  // 3. 根据路径深度推导（若有四级及以上深度，叶子通常为 interior）
  if (pathArr.length >= 4 && pathArr[pathArr.length - 1] === clean) return 'interior';
  if (pathArr.length >= 2 && pathArr[1] === clean) return 'area';
  return 'site';
}

export function inferDirectionalQuadrant(name = '') {
  const clean = String(name || '').trim();
  if (!clean) return '';
  if (/(?:城东|东市|东区|东门|东郊|河东|海东|^东)/.test(clean)) return 'east';
  if (/(?:城西|西市|西区|西门|西郊|河西|海西|^西)/.test(clean)) return 'west';
  if (/(?:城南|南市|南区|南门|南郊|江南|^南)/.test(clean)) return 'south';
  if (/(?:城北|北市|北区|北门|北郊|江北|^北)/.test(clean)) return 'north';
  if (/(?:中心|中央|中区|核心|中腹|^中)/.test(clean)) return 'center';
  if (/(?:内室|内院|内部|后山|深处)/.test(clean)) return 'inner';
  if (/(?:外郊|郊外|荒野|外围)/.test(clean)) return 'outer';
  return '';
}

function normKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * 将柏宝书 scenes、用户/AI 自定义地点、世界书提取地点、当前位置路径合并为统一的地点节点列表
 */
export function mergeMapPlaces({
  stateMap = {},
  baibaiSnapshot = null,
  inlineLocation = null,
  worldbookPlaces = [],
} = {}) {
  const customItems = Array.isArray(stateMap?.items) ? stateMap.items : [];
  const deletedSet = new Set((Array.isArray(stateMap?.deletedIds) ? stateMap.deletedIds : []).map(String));

  const byId = new Map();
  const byPathKey = new Map();
  const byNameKey = new Map();

  function registerPlace(place) {
    byId.set(place.id, place);
    if (place.pathKey) byPathKey.set(place.pathKey, place);
    const nk = normKey(place.name);
    if (nk && !byNameKey.has(nk)) {
      byNameKey.set(nk, place);
    }
    for (const alias of place.aliases || []) {
      const ak = normKey(alias);
      if (ak && !byNameKey.has(ak)) {
        byNameKey.set(ak, place);
      }
    }
  }

  // 1. 先载入用户/AI 自定义保存的地点
  for (const item of customItems) {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || '').trim();
    if (!id || !name || deletedSet.has(id)) continue;
    const rawFacilities = Array.isArray(item.facilities)
      ? item.facilities.map(s => (typeof s === 'string' ? s.trim() : String(s?.label || '').trim())).filter(Boolean)
      : [];
    const place = {
      id,
      name,
      parentId: String(item.parentId || '').trim(),
      role: ['area', 'site', 'interior'].includes(item.role) ? item.role : '',
      mapLevel: ['city', 'country', 'scope'].includes(item.mapLevel) ? item.mapLevel : '',
      mapStyle: validQianchuangMapStyle(item.mapStyle) ? item.mapStyle : '',
      mapLayout: normalizeQianchuangMapLayout(item.mapLayout, item.mapStyle) || '',
      desc: String(item.desc || '').trim(),
      facilities: rawFacilities,
      relations: Array.isArray(item.relations)
        ? item.relations
          .map(r => ({
            targetName: String(r?.targetName || r?.place || '').trim(),
            type: String(r?.type || '邻近').trim(),
            note: String(r?.note || '').trim(),
          }))
          .filter(r => r.targetName)
        : [],
      aliases: Array.isArray(item.aliases) ? item.aliases.map(s => String(s).trim()).filter(Boolean) : [],
      source: item.source || 'custom',
      baibaiId: item.baibaiId ? String(item.baibaiId) : '',
      path: Array.isArray(item.path) ? item.path.map(s => String(s).trim()).filter(Boolean) : [],
      pathKey: '',
    };
    if (place.path.length) {
      place.pathKey = place.path.map(normKey).join('/');
    }
    registerPlace(place);
  }

  // 1.5 自定义/AI 地点按父链推出完整路径，便于与柏宝书同路径地点对齐，避免重复
  for (const place of byId.values()) {
    if (place.path.length) continue;
    const names = [];
    const seen = new Set();
    let cur = place;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    place.path = names;
    place.pathKey = names.map(normKey).join('/');
    byPathKey.set(place.pathKey, place);
  }
  // 2. 合并柏宝书 (STBaiBaiBook) 的 scenes 层级树
  const scenes = Array.isArray(baibaiSnapshot?.scenes) ? baibaiSnapshot.scenes : [];
  const baibaiOverrides = stateMap?.baibaiOverrides || {};
  const baibaiIdToPlaceId = new Map();

  const sortedScenes = [...scenes].sort((a, b) => (a?.path?.length || 0) - (b?.path?.length || 0));
  for (const scene of sortedScenes) {
    const rawId = String(scene?.id || '').trim();
    const name = String(scene?.name || '').trim();
    if (!name) continue;
    const syntheticId = rawId ? `baibai:${rawId}` : `baibai:${(scene.path || [name]).join('/')}`;
    if (deletedSet.has(rawId) || deletedSet.has(syntheticId) || deletedSet.has(`name:${normKey(name)}`)) {
      continue;
    }

    const pathArr = Array.isArray(scene?.path) && scene.path.length
      ? scene.path.map(s => String(s || '').trim()).filter(Boolean)
      : [name];
    const pathKey = pathArr.map(normKey).join('/');

    const override = baibaiOverrides[syntheticId]
      || (rawId ? baibaiOverrides[rawId] : null)
      || (rawId ? baibaiOverrides[`baibai:${rawId}`] : null)
      || baibaiOverrides[normKey(name)];

    let existing = byId.get(syntheticId) || byPathKey.get(pathKey);
    let nameMatched = false;
    if (!existing) {
      // 同名且全局唯一的 AI/自定义地点视为同一个地点（柏宝书层级为准）
      const byName = byNameKey.get(normKey(name));
      if (byName && byName.source !== 'baibai' && !byName.baibaiId) {
        existing = byName;
        nameMatched = true;
      }
    }

    if (existing) {
      if (!existing.desc && scene.desc) existing.desc = String(scene.desc).trim();
      existing.baibaiId = existing.baibaiId || rawId;
      if (override?.role) existing.role = override.role;
      if (override?.quadrant && !existing.quadrant) existing.quadrant = override.quadrant;
      if (Array.isArray(override?.facilities) && override.facilities.length && !existing.facilities?.length) {
        existing.facilities = override.facilities;
      }
      if (Array.isArray(override?.relations) && override.relations.length && !existing.relations?.length) {
        existing.relations = override.relations;
      }
      if (nameMatched) {
        // 按柏宝书的路径重新挂载层级，保证 AI 生成的地点与剧情记录的层级一致
        let parentPlaceId = '';
        if (scene.parentId && baibaiIdToPlaceId.has(String(scene.parentId))) {
          parentPlaceId = baibaiIdToPlaceId.get(String(scene.parentId));
        } else if (pathArr.length > 1) {
          parentPlaceId = (byPathKey.get(pathArr.slice(0, -1).map(normKey).join('/')) || {}).id || '';
        }
        if (parentPlaceId && parentPlaceId !== existing.id && (!existing.parentId || existing.source === 'ai')) {
          existing.parentId = parentPlaceId;
        }
        existing.path = pathArr;
        existing.pathKey = pathKey;
        byPathKey.set(pathKey, existing);
      }
      if (!existing.path.length) existing.path = pathArr;
      if (!existing.pathKey) {
        existing.pathKey = pathKey;
        byPathKey.set(pathKey, existing);
      }
      if (rawId) baibaiIdToPlaceId.set(rawId, existing.id);
      continue;
    }

    let parentPlaceId = '';
    if (scene.parentId && baibaiIdToPlaceId.has(String(scene.parentId))) {
      parentPlaceId = baibaiIdToPlaceId.get(String(scene.parentId));
    } else if (pathArr.length > 1) {
      const parentPathKey = pathArr.slice(0, -1).map(normKey).join('/');
      const parentPlace = byPathKey.get(parentPathKey) || byNameKey.get(normKey(pathArr[pathArr.length - 2]));
      if (parentPlace) parentPlaceId = parentPlace.id;
    }

    const assignedRole = override?.role || inferPlaceRole(name, pathArr);
    const assignedQuadrant = override?.quadrant || inferDirectionalQuadrant(name) || '';

    const place = {
      id: syntheticId,
      name,
      parentId: parentPlaceId,
      role: assignedRole,
      quadrant: assignedQuadrant,
      mapLevel: override?.mapLevel || '',
      mapStyle: override?.mapStyle || '',
      mapLayout: override?.mapLayout || '',
      desc: String(scene?.desc || '').trim(),
      facilities: Array.isArray(override?.facilities) ? override.facilities : [],
      relations: Array.isArray(override?.relations) ? override.relations : [],
      aliases: [],
      source: 'baibai',
      baibaiId: rawId,
      path: pathArr,
      pathKey,
    };
    registerPlace(place);
    if (rawId) baibaiIdToPlaceId.set(rawId, place.id);
  }

  // 2.5 合并世界书提取出的物理地点 (worldbookPlaces)
  for (const wb of Array.isArray(worldbookPlaces) ? worldbookPlaces : []) {
    const name = String(wb?.displayName || wb?.name || '').trim();
    if (!name) continue;
    const wbId = String(wb?.entityId || wb?.id || `wb:${normKey(name)}`);
    if (deletedSet.has(wbId) || deletedSet.has(`name:${normKey(name)}`)) continue;
    const existing = byId.get(wbId) || byNameKey.get(normKey(name));
    const descText = Array.isArray(wb?.features)
      ? wb.features.map(f => String(f?.text || '').trim()).filter(Boolean).join('；')
      : String(wb?.desc || '').trim();
    if (existing) {
      if (!existing.desc && descText) existing.desc = descText;
      continue;
    }
    registerPlace({
      id: wbId,
      name,
      parentId: String(wb?.parentId || '').trim(),
      role: ['area', 'site', 'interior'].includes(wb?.role) ? wb.role : '',
      mapLevel: ['city', 'country', 'scope'].includes(wb?.mapLevel) ? wb.mapLevel : '',
      mapStyle: validQianchuangMapStyle(wb?.mapStyle) ? wb.mapStyle : '',
      mapLayout: normalizeQianchuangMapLayout(wb?.mapLayout, wb?.mapStyle) || '',
      desc: descText,
      facilities: [],
      relations: [],
      aliases: Array.isArray(wb?.aliases) ? wb.aliases.map(s => String(s).trim()).filter(Boolean) : [],
      source: 'worldbook',
      baibaiId: '',
      path: [name],
      pathKey: normKey(name),
    });
  }

  // 3. 若当前位置路径 (柏宝书 state.locationPath 或顶栏 ✧时间|地点|天气✧) 包含尚未建档的节点，自动补齐临时层级节点
  const activePath = (baibaiSnapshot?.locationPath?.length ? baibaiSnapshot.locationPath : inlineLocation?.locationPath) || [];
  if (activePath.length) {
    let parentId = '';
    const accPath = [];
    for (const seg of activePath) {
      const cleanSeg = String(seg || '').trim();
      if (!cleanSeg) continue;
      accPath.push(cleanSeg);
      const pk = accPath.map(normKey).join('/');
      let existing = byPathKey.get(pk) || byNameKey.get(normKey(cleanSeg));
      if (!existing) {
        const autoId = `live:${pk}`;
        if (deletedSet.has(autoId) || deletedSet.has(`name:${normKey(cleanSeg)}`)) {
          continue;
        }
        existing = {
          id: autoId,
          name: cleanSeg,
          parentId,
          role: '',
          mapLevel: '',
          mapStyle: '',
          mapLayout: '',
          desc: '',
          facilities: [],
          relations: [],
          aliases: [],
          source: 'live',
          baibaiId: '',
          path: [...accPath],
          pathKey: pk,
        };
        registerPlace(existing);
      }
      parentId = existing.id;
    }
  }

  // 4. 清理无效 parentId 并防止环路
  const places = [...byId.values()];
  for (const p of places) {
    if (p.parentId && (!byId.has(p.parentId) || p.parentId === p.id)) {
      p.parentId = '';
    }
  }

  // 5. 自动推断缺省的 role ('area' | 'site' | 'interior')、mapLevel 与 177类设施标签
  const childrenMap = new Map();
  for (const p of places) {
    if (!p.parentId) continue;
    const list = childrenMap.get(p.parentId) || [];
    list.push(p);
    childrenMap.set(p.parentId, list);
  }

  function getDepth(place) {
    let d = 0;
    let cur = place;
    const seen = new Set([cur.id]);
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      cur = byId.get(cur.parentId);
      d += 1;
    }
    return d;
  }

  const byDepth = [...places].sort((a, b) => getDepth(a) - getDepth(b));
  for (const p of byDepth) {
    const kids = childrenMap.get(p.id) || [];
    const depth = getDepth(p);
    const parent = p.parentId ? byId.get(p.parentId) : null;

    if (!p.role) {
      if (kids.length > 0) {
        const allKidsLookInterior = depth >= 1 && kids.every(k => INTERIOR_SUFFIX_RE.test(k.name) || k.role === 'interior');
        p.role = allKidsLookInterior && !AREA_SUFFIX_RE.test(p.name) ? 'site' : 'area';
      } else if (parent?.role === 'site' || (depth >= 2 && INTERIOR_SUFFIX_RE.test(p.name))) {
        p.role = 'interior';
      } else if (depth === 0 && AREA_SUFFIX_RE.test(p.name) && places.length <= 3) {
        p.role = 'area';
      } else {
        p.role = 'site';
      }
    }

    if (!p.mapLevel && depth === 0 && kids.length > 0) {
      const hasGrandKids = kids.some(k => (childrenMap.get(k.id) || []).length > 0);
      if (hasGrandKids || AREA_SUFFIX_RE.test(p.name)) {
        p.mapLevel = 'city';
      }
    }

    p.facilityTags = extractPlaceFacilityTags(p);
  }

  return places;
}

function normalizeLabelBox(labelBox) {
  if (!labelBox) return null;
  const x = Number(labelBox.x ?? labelBox.left ?? 0);
  const y = Number(labelBox.y ?? labelBox.top ?? 0);
  const w = Number(labelBox.w ?? labelBox.width ?? 20);
  const h = Number(labelBox.h ?? labelBox.height ?? 6);
  return {
    x,
    y,
    w,
    h,
    left: x,
    top: y,
    width: w,
    height: h,
  };
}

/**
 * 计算底图上的分区轮廓、区域标题框与具体场所(site)锚点坐标
 * 完全驱动自千窗离线预烘焙的 qianchuangMapLayout (24款高精底图+6大主题轮廓/槽位) 与 citySchematicLayout (10座真实城市槽位)
 */
export function computeMapLayout(basemapId = 'modern', groups = []) {
  if (!Array.isArray(groups) || !groups.length) return [];

  // 构造千窗布局引擎输入格式：{ entityId, siteIds }
  const siteIdMap = new Map();
  const qcInputGroups = groups.map((group, gIdx) => {
    const sites = Array.isArray(group.sites) ? group.sites : [];
    const siteIds = sites.map((site, sIdx) => {
      const sid = String(site?.id || `site_${gIdx}_${sIdx}`);
      siteIdMap.set(sid, site);
      return sid;
    });
    return {
      ...group,
      entityId: group.entityId ?? group.area?.id ?? null,
      siteIds,
      quadrant: group.quadrant || group.area?.quadrant || '',
    };
  });

  const isRealCity = Boolean(CITY_MAPS[basemapId]);
  const layoutKey = isRealCity
    ? basemapId
    : (QIANCHUANG_MAP_ASSETS[basemapId]
      ? basemapId
      : (basemapId === 'old-town' ? 'town' : (QIANCHUANG_MAP_REGIONS[basemapId] ? basemapId : 'modern')));

  const rawLayout = isRealCity
    ? citySchematicLayout(layoutKey, qcInputGroups)
    : qianchuangMapLayout(layoutKey, qcInputGroups);

  const layoutResult = rawLayout.map((laidOut, gIdx) => {
    const originalGroup = groups[gIdx] || {};
    const pointById = new Map((laidOut.points || []).filter(Boolean).map(pt => [pt.id, pt]));
    const placedSites = (originalGroup.sites || []).map((site, sIdx) => {
      const sid = String(site?.id || `site_${gIdx}_${sIdx}`);
      const pt = pointById.get(sid);
      return {
        ...site,
        x: pt ? Math.round(Number(pt.x) * 100) / 100 : 50,
        y: pt ? Math.round(Number(pt.y) * 100) / 100 : 50,
      };
    });

    return {
      ...originalGroup,
      contour: laidOut.contour || null,
      contours: Array.isArray(laidOut.contours) ? laidOut.contours : [],
      inset: laidOut.inset || null,
      labelBox: normalizeLabelBox(laidOut.labelBox),
      points: laidOut.points || [],
      sites: placedSites,
    };
  });

  // 标签碰撞避让与朝向计算 (Label Collision Avoidance & Dynamic Alignment)
  const allPlacedSites = layoutResult.flatMap(g => g.sites || []);
  for (const site of allPlacedSites) {
    // 基础朝向规则（契合千窗规范）：边缘处向画布内部收敛，靠底部的标签放上方
    site.labelAlign = site.x < 28 ? 'start' : site.x > 72 ? 'end' : 'center';
    site.labelAbove = site.y > 68;
  }

  // 密集区域碰撞检测：当两个点位相距过近时错开垂直朝向与水平对齐
  for (let i = 0; i < allPlacedSites.length; i++) {
    for (let j = i + 1; j < allPlacedSites.length; j++) {
      const a = allPlacedSites[i];
      const b = allPlacedSites[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);

      if (dx < 18 && dy < 14) {
        if (a.labelAbove === b.labelAbove) {
          if (a.y < b.y) {
            a.labelAbove = true;
            b.labelAbove = false;
          } else {
            a.labelAbove = false;
            b.labelAbove = true;
          }
        }
        if (dx < 12) {
          if (a.x <= b.x) {
            if (a.x > 18) a.labelAlign = 'end';
            if (b.x < 82) b.labelAlign = 'start';
          } else {
            if (b.x > 18) b.labelAlign = 'end';
            if (a.x < 82) a.labelAlign = 'start';
          }
        }
      }
    }
  }

  return layoutResult;
}

function matchPlaceByText(text, places) {
  const clean = normKey(text);
  if (!clean) return null;
  for (const p of places) {
    if (normKey(p.name) === clean) return p;
    if ((p.aliases || []).some(a => normKey(a) === clean)) return p;
  }
  const sorted = [...places].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const nk = normKey(p.name);
    if (nk.length >= 2 && (clean.includes(nk) || nk.includes(clean))) {
      return p;
    }
  }
  return null;
}

/**
 * 构建完整的地图视图投影数据
 */
export function buildMapProjection({
  state = {},
  context = {},
  baibaiSnapshot = null,
  messages = [],
  worldbookPlaces = [],
  activeSheetId = '',
  scopePlaceId = '',
  searchQuery = '',
} = {}) {
  const stateMap = state?.map || {};
  const inlineLocation = readInlineMessageLocation(messages);
  const places = mergeMapPlaces({ stateMap, baibaiSnapshot, inlineLocation, worldbookPlaces });
  const byId = new Map(places.map(p => [p.id, p]));

  const childrenMap = new Map();
  for (const p of places) {
    const key = p.parentId && byId.has(p.parentId) ? p.parentId : '';
    const list = childrenMap.get(key) || [];
    list.push(p);
    childrenMap.set(key, list);
  }

  function getAncestors(placeId) {
    const chain = [];
    let cur = byId.get(placeId);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return chain;
  }

  // 1. 解析主角当前所在位置
  const manualLoc = String(stateMap.currentLocation || '').trim();
  const liveLocName = manualLoc
    || baibaiSnapshot?.location
    || inlineLocation?.location
    || (baibaiSnapshot?.locationPath?.length ? baibaiSnapshot.locationPath[baibaiSnapshot.locationPath.length - 1] : '');

  let currentPlace = null;
  if (manualLoc && byId.has(manualLoc)) {
    currentPlace = byId.get(manualLoc);
  } else if (!manualLoc && baibaiSnapshot?.locationPath?.length) {
    const pk = baibaiSnapshot.locationPath.map(normKey).join('/');
    currentPlace = places.find(p => p.pathKey === pk) || matchPlaceByText(liveLocName, places);
  } else if (liveLocName) {
    currentPlace = matchPlaceByText(liveLocName, places);
  }

  const currentAncestors = currentPlace ? getAncestors(currentPlace.id) : [];
  const currentPinPlace = currentPlace
    ? ([...currentAncestors].reverse().find(p => p.role === 'site') || currentPlace)
    : null;

  const userPosition = {
    label: currentPlace?.name || liveLocName || '未知位置',
    rawLocation: liveLocName || '',
    placeId: currentPlace?.id || '',
    pinPlaceId: currentPinPlace?.id || '',
    breadcrumb: currentAncestors.length
      ? currentAncestors.map(p => ({ id: p.id, name: p.name }))
      : (baibaiSnapshot?.locationPath || inlineLocation?.locationPath || []).map(name => ({ id: '', name })),
    isManual: Boolean(manualLoc),
  };

  // 2. 关联柏宝书 NPC、存放物品与手机待办事项 (Todos)
  const npcsByPlaceId = new Map();
  const itemsByPlaceId = new Map();
  const todosByPlaceId = new Map();

  function pushMapItem(map, key, val) {
    if (!key) return;
    const arr = map.get(key) || [];
    arr.push(val);
    map.set(key, arr);
  }

  const contactsList = Array.isArray(state?.contacts) ? state.contacts : [];
  function resolvePersonAvatar(name, fallbackAvatar = '') {
    if (fallbackAvatar) return fallbackAvatar;
    const clean = normKey(name);
    const matched = contactsList.find(c => normKey(c.name) === clean || normKey(c.nickname) === clean || (clean.length >= 2 && (normKey(c.name).includes(clean) || clean.includes(normKey(c.name)))));
    return matched?.avatar || '';
  }

  for (const npc of baibaiSnapshot?.npcs || []) {
    const name = String(npc?.name || '').trim();
    if (!name) continue;
    let targetPlace = null;
    if (npc.follow && currentPlace) {
      targetPlace = currentPlace;
    } else if (npc.location) {
      targetPlace = matchPlaceByText(npc.location, places);
    }
    if (targetPlace) {
      const npcAvatar = resolvePersonAvatar(name, npc.avatar);
      pushMapItem(npcsByPlaceId, targetPlace.id, {
        id: npc.id || name,
        name,
        avatar: npcAvatar,
        title: String(npc.title || '').trim(),
        relation: String(npc.relation || '').trim(),
        follow: Boolean(npc.follow),
      });
      if (targetPlace.role === 'interior' && targetPlace.parentId) {
        pushMapItem(npcsByPlaceId, targetPlace.parentId, {
          id: npc.id || name,
          name,
          avatar: npcAvatar,
          title: String(npc.title || '').trim(),
          relation: String(npc.relation || '').trim(),
          follow: Boolean(npc.follow),
          subPlaceName: targetPlace.name,
        });
      }
    }
  }

  for (const item of baibaiSnapshot?.items || []) {
    if (item?.carried !== false || !item?.location) continue;
    const targetPlace = matchPlaceByText(item.location, places);
    if (targetPlace) {
      pushMapItem(itemsByPlaceId, targetPlace.id, {
        id: item.id || item.name,
        name: String(item.name || '').trim(),
        desc: String(item.desc || '').trim(),
      });
    }
  }

  const openTodos = (Array.isArray(state?.todos) ? state.todos : []).filter(t => !t.done);
  for (const todo of openTodos) {
    const textToMatch = `${todo.location || ''} ${todo.title || ''}`.trim();
    const targetPlace = matchPlaceByText(textToMatch, places);
    if (targetPlace) {
      pushMapItem(todosByPlaceId, targetPlace.id, {
        id: todo.id,
        title: todo.title,
        due: todo.due || '',
      });
    }
  }

  // 3. 构造千窗原版层级快照，复用原版图幅 / 浏览投影（城市边界 → 图幅，单根自动下钻，区域→场所分组）
  const snapshotPlaces = places.map(p => ({
    entityId: p.id,
    displayName: p.name,
    aliases: p.aliases || [],
    parentEntityId: p.parentId && byId.has(p.parentId) ? p.parentId : null,
    childEntityIds: (childrenMap.get(p.id) || []).map(k => k.id),
    mapRole: p.role || undefined,
    ...(['city', 'country', 'scope'].includes(p.mapLevel) ? { mapLevel: p.mapLevel } : {}),
    mapAssetId: p.mapAssetId || null,
    features: [],
    relations: [],
    facilities: p.facilities || [],
  }));
  const fullSnapshot = {
    places: snapshotPlaces,
    mapRootIds: snapshotPlaces.filter(p => !p.parentEntityId).map(p => p.entityId),
    unassignedPlaceIds: [],
    userPosition: { placeEntityId: currentPlace?.id || null },
  };

  const sheetProj = places.length ? projectQianchuangSheets(fullSnapshot) : { sheets: [], placeSheets: new Map(), countryIds: new Set(), defaultSheetId: null };
  const looseIds = sheetProj.sheets.length && !sheetProj.sheets.some(s => s.id === 'legacy')
    ? snapshotPlaces.filter(p => sheetProj.placeSheets.get(p.entityId) === null && !sheetProj.countryIds.has(p.entityId)).map(p => p.entityId)
    : [];
  const sheetList = [...sheetProj.sheets];
  if (looseIds.length) sheetList.push({ id: '__loose', label: '其他地点', placeIds: looseIds, cityId: null, assetId: null });

  const currentSheetId = currentPlace
    ? (sheetProj.placeSheets.get(currentPlace.id) ?? (looseIds.includes(currentPlace.id) ? '__loose' : null))
    : null;
  const activeSheet = sheetList.find(s => s.id === activeSheetId)
    || sheetList.find(s => s.id === currentSheetId)
    || sheetList.find(s => s.id === sheetProj.defaultSheetId)
    || sheetList[0]
    || null;
  const resolvedSheetId = activeSheet?.id || '';
  userPosition.sheetId = currentSheetId || '';

  let subSnapshot = fullSnapshot;
  if (activeSheet && activeSheet.id !== 'legacy') {
    subSnapshot = snapshotForCitySheet(fullSnapshot, sheetProj, activeSheet.id === '__loose' ? null : activeSheet.id);
    if (activeSheet.id === '__loose') {
      subSnapshot = { ...subSnapshot, mapRootIds: subSnapshot.places.filter(p => !p.parentEntityId).map(p => p.entityId) };
    }
  }
  const browse = projectQianchuangBrowse(subSnapshot, scopePlaceId && byId.has(scopePlaceId) ? scopePlaceId : undefined);
  const validScopeId = browse.scopeId || '';
  const scopeNode = validScopeId ? byId.get(validScopeId) : null;
  const scopeBreadcrumb = (browse.trail || []).map(id => byId.get(id)).filter(Boolean);
  const sheets = sheetList.length > 1
    ? sheetList.map(s => ({ id: s.id, title: s.label, count: s.placeIds.length }))
    : [];

  function enrichPlace(p) {
    const kids = childrenMap.get(p.id) || [];
    const interiors = kids.filter(k => k.role === 'interior').map(enrichPlace);
    const subPlaces = kids.filter(k => k.role !== 'interior').map(enrichPlace);
    const npcs = npcsByPlaceId.get(p.id) || [];
    const items = itemsByPlaceId.get(p.id) || [];
    const todos = todosByPlaceId.get(p.id) || [];
    const isCurrent = userPosition.placeId === p.id || userPosition.pinPlaceId === p.id;
    const charactersHere = [];
    if (isCurrent) {
      charactersHere.push({
        id: 'user',
        name: state?.userProfile?.name || '我',
        avatar: state?.userProfile?.avatar || '',
        role: '主角',
        isUser: true,
      });
      const partner = context?.character || (state?.contacts || []).find(c => c.source === 'card') || state?.contacts?.[0];
      if (partner && !npcs.some(n => n.name === partner.name)) {
        charactersHere.push({
          id: partner.id || 'partner',
          name: partner.name,
          avatar: partner.avatar || '',
          role: '同行',
          isUser: false,
        });
      }
    }
    for (const npc of npcs) {
      charactersHere.push({
        id: npc.id,
        name: npc.name,
        avatar: npc.avatar || resolvePersonAvatar(npc.name, npc.avatar),
        role: npc.follow ? '同行' : (npc.title || '在场'),
        relation: npc.relation || '',
        isUser: false,
      });
    }

    return {
      ...p,
      facilityTags: p.facilityTags || extractPlaceFacilityTags(p),
      interiors,
      subPlaces,
      npcs,
      items,
      todos,
      charactersHere,
      isCurrent,
      hasDrilldown: p.role === 'area' && subPlaces.length > 0,
    };
  }

  const groups = browse.groups.map(g => {
    const areaPlace = g.entityId && byId.has(g.entityId) ? enrichPlace(byId.get(g.entityId)) : null;
    return {
      entityId: g.entityId,
      siteIds: g.siteIds.filter(id => byId.has(id)),
      area: areaPlace,
      sites: g.siteIds.filter(id => byId.has(id)).map(id => enrichPlace(byId.get(id))),
      quadrant: areaPlace?.quadrant || (g.entityId ? (byId.get(g.entityId)?.quadrant || '') : ''),
    };
  }).filter(g => g.area || g.sites.length);
  const topNodes = (browse.treeRootIds || []).map(id => byId.get(id)).filter(Boolean);

  const sheetPlaces = activeSheet && activeSheet.id !== 'legacy'
    ? activeSheet.placeIds.map(id => byId.get(id)).filter(Boolean)
    : places;
  const sheetRoot = activeSheet?.rootPlaceId ? byId.get(activeSheet.rootPlaceId) : null;
  const requestedBasemap = stateMap.basemap;

  // 1. 底图记忆与防重用机制 (Basemap Sticky Binding & usedAssetIds)
  const stickySheetAssets = { ...(stateMap.sheetAssets || {}) };
  const usedAssetIds = [];

  for (const s of sheetList) {
    const sPlaces = s.id !== 'legacy' ? (s.placeIds || []).map(id => byId.get(id)).filter(Boolean) : places;
    const sRoot = s.rootPlaceId ? byId.get(s.rootPlaceId) : null;
    let sBasemapId = resolveBasemapId(requestedBasemap, sPlaces.length ? sPlaces : places, sRoot);
    if ((!requestedBasemap || requestedBasemap === 'auto') && s.assetId && MAP_BASEMAPS[s.assetId] && !sRoot?.mapStyle) {
      sBasemapId = s.assetId;
    }
    const previous = stickySheetAssets[s.id] || null;
    const resolvedAsset = resolveMapAssetId(sBasemapId, sPlaces, sRoot, previous, usedAssetIds);
    s.assetId = resolvedAsset;
    stickySheetAssets[s.id] = resolvedAsset;
    if (resolvedAsset && !usedAssetIds.includes(resolvedAsset)) {
      usedAssetIds.push(resolvedAsset);
    }
  }

  let basemapId = resolveBasemapId(requestedBasemap, sheetPlaces.length ? sheetPlaces : places, sheetRoot);
  if ((!requestedBasemap || requestedBasemap === 'auto') && activeSheet?.cityId && CITY_MAPS[activeSheet?.assetId] && !sheetRoot?.mapStyle) {
    basemapId = activeSheet.assetId;
  }
  const activeAssetId = activeSheet?.assetId || stickySheetAssets[resolvedSheetId] || resolveMapAssetId(basemapId, sheetPlaces, sheetRoot, stickySheetAssets[resolvedSheetId], usedAssetIds);
  const basemap = MAP_BASEMAPS[activeAssetId] || MAP_BASEMAPS[basemapId] || MAP_BASEMAPS.modern;
  const layoutGroups = computeMapLayout(activeAssetId, groups);

  // 3. 空间移动轨迹 (Spatial Movement Trajectory)
  const trailRaw = Array.isArray(stateMap.trail) && stateMap.trail.length
    ? stateMap.trail
    : (baibaiSnapshot?.scenes || []).map(s => {
        if (Array.isArray(s?.path) && s.path.length) return s.path[s.path.length - 1];
        return s?.name || s?.desc || '';
      }).filter(Boolean);

  const siteLookup = new Map();
  for (const g of layoutGroups) {
    for (const s of g.sites || []) {
      siteLookup.set(s.id, s);
      siteLookup.set(normKey(s.name), s);
      for (const a of s.aliases || []) siteLookup.set(normKey(a), s);
    }
  }

  const trajectory = [];
  let stepIndex = 1;
  for (const item of trailRaw) {
    const rawStr = typeof item === 'string' ? item : item?.placeId || item?.name || '';
    const site = siteLookup.get(rawStr) || siteLookup.get(normKey(rawStr));
    if (site && (!trajectory.length || trajectory[trajectory.length - 1].id !== site.id)) {
      trajectory.push({
        id: site.id,
        name: site.name,
        x: site.x,
        y: site.y,
        step: stepIndex++,
      });
    }
  }
  if (currentPlace) {
    const currSite = siteLookup.get(currentPlace.id) || siteLookup.get(normKey(currentPlace.name));
    if (currSite && (!trajectory.length || trajectory[trajectory.length - 1].id !== currSite.id)) {
      trajectory.push({
        id: currSite.id,
        name: currSite.name,
        x: currSite.x,
        y: currSite.y,
        step: stepIndex++,
      });
    }
  }
  // 5. 搜索过滤目录树
  const q = normKey(searchQuery);
  const directoryTree = topNodes
    .map(enrichPlace)
    .filter(node => {
      if (!q) return true;
      const selfMatch = normKey(node.name).includes(q)
        || normKey(node.desc).includes(q)
        || (node.facilities || []).some(f => normKey(f).includes(q))
        || (node.facilityTags || []).some(t => normKey(t.label).includes(q));
      if (selfMatch) return true;
      const childMatch = [...(node.subPlaces || []), ...(node.interiors || [])].some(
        c => normKey(c.name).includes(q)
          || normKey(c.desc).includes(q)
          || (c.facilityTags || []).some(t => normKey(t.label).includes(q)),
      );
      return childMatch;
    });

  return {
    basemapId,
    assetId: activeAssetId,
    sheetAssets: stickySheetAssets,
    basemapSelection: stateMap.basemap || 'auto',
    basemap,
    places,
    userPosition,
    sheets,
    activeSheetId: resolvedSheetId,
    scopePlaceId: validScopeId,
    scopeNode,
    scopeBreadcrumb,
    layoutGroups,
    directoryTree,
    trajectory,
    baibaiConnected: Boolean(baibaiSnapshot),
    stats: {
      totalPlaces: places.length,
      areaCount: places.filter(p => p.role === 'area').length,
      siteCount: places.filter(p => p.role === 'site').length,
      interiorCount: places.filter(p => p.role === 'interior').length,
    },
  };
}

/**
 * 格式化地图与位置上下文提示词，用于注入剧情或手机聊天上下文
 */
export function formatMapContextPrompt(projection) {
  if (!projection) return '';
  const { userPosition, places, layoutGroups } = projection;
  if (!places?.length && (!userPosition?.label || userPosition.label === '未知位置')) {
    return '';
  }

  const lines = [];
  if (userPosition?.label && userPosition.label !== '未知位置') {
    const pathText = userPosition.breadcrumb?.length > 1
      ? userPosition.breadcrumb.map(b => b.name).join(' > ')
      : userPosition.label;
    lines.push(`当前所在地：${pathText}`);
  }

  const currentPlace = places.find(p => p.id === userPosition?.placeId);
  if (currentPlace) {
    if (currentPlace.desc) {
      lines.push(`当前场景环境：${currentPlace.desc}`);
    }
    const facLabels = (currentPlace.facilityTags || []).map(t => t.label);
    const mergedFacs = facLabels.length ? facLabels : (currentPlace.facilities || []);
    if (mergedFacs.length) {
      lines.push(`场所设施：${mergedFacs.join('、')}`);
    }
    if (currentPlace.relations?.length) {
      const relStr = currentPlace.relations
        .map(r => `${r.type || '邻近'}「${r.targetName}」${r.note ? `（${r.note}）` : ''}`)
        .join('；');
      lines.push(`空间方位关系：${relStr}`);
    }
  }

  for (const group of layoutGroups || []) {
    const isCurrentGroup = group.area?.id === currentPlace?.parentId
      || group.area?.id === currentPlace?.id
      || group.sites?.some(s => s.id === userPosition?.pinPlaceId);
    if (isCurrentGroup) {
      const siblingNames = (group.sites || [])
        .filter(s => s.id !== currentPlace?.id)
        .map(s => s.name)
        .slice(0, 8);
      if (group.area && siblingNames.length) {
        lines.push(`所在分区（${group.area.name}）周边场所：${siblingNames.join('、')}`);
      } else if (siblingNames.length) {
        lines.push(`周边已知场所：${siblingNames.join('、')}`);
      }
      break;
    }
  }

  const areas = places.filter(p => p.role === 'area').map(p => p.name).slice(0, 6);
  if (areas.length) {
    lines.push(`已知主要区域：${areas.join('、')}`);
  }

  return lines.join('\n');
}
