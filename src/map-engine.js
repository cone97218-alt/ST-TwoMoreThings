// 地图（千窗）核心引擎：无坐标层级场景 -> 主题底图区域与锚点投影 + 柏宝书(STBaiBaiBook)与聊天顶栏联动

export const MAP_FACILITY_TAGS = [
  { id: '餐饮', label: '餐饮', icon: 'utensils' },
  { id: '住宿', label: '住宿', icon: 'bed' },
  { id: '购物', label: '购物', icon: 'bag' },
  { id: '交通', label: '交通', icon: 'transit' },
  { id: '医疗', label: '医疗', icon: 'medical' },
  { id: '娱乐', label: '娱乐', icon: 'sparkle' },
  { id: '办公', label: '办公', icon: 'briefcase' },
  { id: '住宅', label: '住宅', icon: 'home' },
  { id: '景观', label: '景观', icon: 'tree' },
  { id: '学府', label: '学府', icon: 'book' },
  { id: '秘境', label: '秘境', icon: 'compass' },
  { id: '防务', label: '防务', icon: 'shield' },
];

const DEFAULT_REGIONS = {
  layouts: {
    1: [
      {
        contours: [[[8, 8], [92, 8], [92, 92], [8, 92]]],
        inset: { left: 12, top: 12, width: 76, height: 76 },
      },
    ],
    2: [
      {
        contours: [[[8, 8], [48, 8], [48, 92], [8, 92]]],
        inset: { left: 10, top: 12, width: 36, height: 76 },
      },
      {
        contours: [[[52, 8], [92, 8], [92, 92], [52, 92]]],
        inset: { left: 54, top: 12, width: 36, height: 76 },
      },
    ],
    3: [
      {
        contours: [[[8, 8], [58, 8], [58, 52], [8, 52]]],
        inset: { left: 10, top: 10, width: 46, height: 40 },
      },
      {
        contours: [[[62, 8], [92, 8], [92, 92], [62, 92]]],
        inset: { left: 64, top: 12, width: 26, height: 76 },
      },
      {
        contours: [[[8, 56], [58, 56], [58, 92], [8, 92]]],
        inset: { left: 10, top: 58, width: 46, height: 32 },
      },
    ],
    4: [
      {
        contours: [[[8, 8], [48, 8], [48, 48], [8, 48]]],
        inset: { left: 10, top: 10, width: 36, height: 36 },
      },
      {
        contours: [[[52, 8], [92, 8], [92, 48], [52, 48]]],
        inset: { left: 54, top: 10, width: 36, height: 36 },
      },
      {
        contours: [[[8, 52], [48, 52], [48, 92], [8, 92]]],
        inset: { left: 10, top: 54, width: 36, height: 36 },
      },
      {
        contours: [[[52, 52], [92, 52], [92, 92], [52, 92]]],
        inset: { left: 54, top: 54, width: 36, height: 36 },
      },
    ],
    5: [
      {
        contours: [[[8, 8], [46, 8], [46, 44], [8, 44]]],
        inset: { left: 10, top: 10, width: 34, height: 32 },
      },
      {
        contours: [[[54, 8], [92, 8], [92, 44], [54, 44]]],
        inset: { left: 56, top: 10, width: 34, height: 32 },
      },
      {
        contours: [[[32, 34], [68, 34], [68, 66], [32, 66]]],
        inset: { left: 34, top: 36, width: 32, height: 28 },
      },
      {
        contours: [[[8, 56], [46, 56], [46, 92], [8, 92]]],
        inset: { left: 10, top: 58, width: 34, height: 32 },
      },
      {
        contours: [[[54, 56], [92, 56], [92, 92], [54, 92]]],
        inset: { left: 56, top: 58, width: 34, height: 32 },
      },
    ],
  },
};

const DEFAULT_ANCHORS = {
  layouts: {
    1: [
      [[28, 30], [52, 26], [72, 34], [24, 56], [50, 52], [74, 58], [32, 76], [56, 78], [72, 76]],
    ],
    2: [
      [[22, 28], [36, 40], [24, 58], [38, 72], [22, 80]],
      [[64, 28], [78, 40], [66, 58], [80, 72], [66, 80]],
    ],
    3: [
      [[22, 26], [42, 28], [28, 42], [46, 42]],
      [[72, 26], [82, 42], [74, 60], [80, 78]],
      [[22, 70], [38, 74], [50, 72], [30, 84]],
    ],
    4: [
      [[20, 24], [36, 26], [24, 38], [38, 40]],
      [[64, 24], [80, 26], [66, 38], [80, 40]],
      [[20, 68], [36, 70], [24, 82], [38, 84]],
      [[64, 68], [80, 70], [66, 82], [80, 84]],
    ],
    5: [
      [[20, 22], [36, 26], [26, 36]],
      [[66, 22], [82, 26], [74, 36]],
      [[44, 48], [56, 48], [50, 58]],
      [[20, 70], [36, 74], [26, 84]],
      [[66, 70], [82, 74], [74, 84]],
    ],
  },
  neutral: [[50, 22], [26, 50], [74, 50], [50, 78], [36, 36], [64, 36], [36, 64], [64, 64]],
  all: [[28, 26], [50, 24], [72, 28], [24, 50], [50, 50], [76, 50], [28, 74], [52, 76], [74, 72]],
};

export const MAP_BASEMAPS = {
  modern: {
    id: 'modern',
    label: '现代都市',
    desc: '高架路网、跨江大桥与核心商圈街区',
    keywords: ['市', '区', '大厦', '写字楼', '地铁', '大道', '广场', '公寓', '医院', '大学', 'CBD', '商圈', '百货'],
    regions: DEFAULT_REGIONS,
    anchors: DEFAULT_ANCHORS,
    svg: `
      <rect width="1000" height="1000" class="qc-bg"/>
      <!-- 城市绿地与公园 -->
      <path d="M120 110 H430 V390 H120 Z" class="qc-park"/>
      <path d="M580 580 H880 V870 H580 Z" class="qc-park"/>
      <!-- 跨城江河 -->
      <path d="M-20 470 C240 430, 440 550, 680 480 C820 440, 920 460, 1020 440 L1020 535 C900 555, 810 530, 670 570 C430 640, 230 520, -20 560 Z" class="qc-water"/>
      <!-- 城市街区肌理 -->
      <g class="qc-blocks">
        <rect x="140" y="130" width="120" height="95" rx="10"/>
        <rect x="280" y="130" width="130" height="95" rx="10"/>
        <rect x="140" y="245" width="270" height="120" rx="12"/>
        <rect x="560" y="120" width="145" height="130" rx="10"/>
        <rect x="725" y="120" width="140" height="270" rx="12"/>
        <rect x="560" y="270" width="145" height="120" rx="10"/>
        <rect x="130" y="610" width="150" height="110" rx="10"/>
        <rect x="300" y="610" width="140" height="250" rx="12"/>
        <rect x="130" y="740" width="150" height="120" rx="10"/>
        <rect x="600" y="605" width="125" height="115" rx="10"/>
        <rect x="745" y="605" width="115" height="115" rx="10"/>
        <rect x="600" y="740" width="260" height="110" rx="12"/>
      </g>
      <!-- 主干道与环线 -->
      <g class="qc-roads">
        <rect x="95" y="95" width="810" height="810" rx="36" class="qc-road-ring"/>
        <line x1="500" y1="30" x2="500" y2="970" class="qc-road-major"/>
        <line x1="30" y1="395" x2="970" y2="395" class="qc-road-minor"/>
        <line x1="30" y1="590" x2="970" y2="590" class="qc-road-minor"/>
        <line x1="285" y1="95" x2="285" y2="905" class="qc-road-minor"/>
        <line x1="715" y1="95" x2="715" y2="905" class="qc-road-minor"/>
      </g>
    `,
  },
  'modern-town': {
    id: 'modern-town',
    label: '现代小城',
    desc: '河谷沿岸、车站老街与宁静住宅社区',
    keywords: ['镇', '县', '车站', '小巷', '商店街', '河畔', '中学', '便利店', '诊所', '社区'],
    regions: DEFAULT_REGIONS,
    anchors: DEFAULT_ANCHORS,
    svg: `
      <rect width="1000" height="1000" class="qc-bg"/>
      <!-- 郊野林地 -->
      <path d="M40 40 Q320 140 500 60 L960 40 L960 280 Q680 220 40 310 Z" class="qc-park"/>
      <path d="M40 760 Q450 690 960 790 L960 960 L40 960 Z" class="qc-park"/>
      <!-- 蜿蜒溪流 -->
      <path d="M180 -20 C240 240, 440 340, 490 520 C540 700, 720 820, 820 1020 L900 1020 C800 790, 610 670, 560 490 C510 310, 310 210, 250 -20 Z" class="qc-water"/>
      <!-- 城镇街坊 -->
      <g class="qc-blocks">
        <rect x="120" y="340" width="240" height="140" rx="14"/>
        <rect x="120" y="510" width="280" height="190" rx="14"/>
        <rect x="590" y="250" width="260" height="160" rx="14"/>
        <rect x="620" y="440" width="240" height="210" rx="14"/>
      </g>
      <!-- 铁路与公路 -->
      <g class="qc-roads">
        <path d="M40 495 Q500 475 960 515" class="qc-road-major"/>
        <path d="M365 80 Q395 500 355 920" class="qc-road-minor"/>
        <path d="M715 120 Q695 500 735 920" class="qc-road-minor"/>
        <path d="M40 190 L960 210" class="qc-rail"/>
      </g>
    `,
  },
  'old-town': {
    id: 'old-town',
    label: '古风城镇',
    desc: '护城河池、四方城垣、朱雀长街与坊市',
    keywords: ['城', '坊', '客栈', '酒楼', '镖局', '衙门', '书院', '茶楼', '寺', '庙', '巷', '府', '阁'],
    regions: DEFAULT_REGIONS,
    anchors: DEFAULT_ANCHORS,
    svg: `
      <rect width="1000" height="1000" class="qc-bg"/>
      <!-- 护城河 -->
      <rect x="65" y="65" width="870" height="870" rx="44" class="qc-water"/>
      <rect x="105" y="105" width="790" height="790" rx="28" class="qc-bg"/>
      <!-- 曲水穿坊 -->
      <path d="M105 640 Q380 570 500 650 T895 610 L895 665 Q620 715 500 695 T105 690 Z" class="qc-water"/>
      <!-- 城内园林 -->
      <circle cx="270" cy="260" r="95" class="qc-park"/>
      <circle cx="740" cy="760" r="85" class="qc-park"/>
      <!-- 坊市院落 -->
      <g class="qc-blocks">
        <rect x="145" y="145" width="310" height="310" rx="8"/>
        <rect x="545" y="145" width="310" height="310" rx="8"/>
        <rect x="145" y="545" width="310" height="310" rx="8"/>
        <rect x="545" y="545" width="310" height="310" rx="8"/>
      </g>
      <!-- 十字御街与城墙 -->
      <g class="qc-roads">
        <rect x="112" y="112" width="776" height="776" rx="20" class="qc-wall"/>
        <line x1="500" y1="65" x2="500" y2="935" class="qc-road-major"/>
        <line x1="65" y1="500" x2="935" y2="500" class="qc-road-major"/>
        <line x1="300" y1="112" x2="300" y2="888" class="qc-road-minor"/>
        <line x1="700" y1="112" x2="700" y2="888" class="qc-road-minor"/>
        <line x1="112" y1="300" x2="888" y2="300" class="qc-road-minor"/>
      </g>
    `,
  },
  palace: {
    id: 'palace',
    label: '宫苑庭院',
    desc: '中轴重门、前后殿宇、曲池假山与东西跨院',
    keywords: ['宫', '殿', '苑', '轩', '斋', '亭', '院', '庄', '宗', '门派', '长老', '后山', '御花园'],
    regions: DEFAULT_REGIONS,
    anchors: DEFAULT_ANCHORS,
    svg: `
      <rect width="1000" height="1000" class="qc-bg"/>
      <!-- 后苑湖山 -->
      <path d="M140 120 H860 V340 H140 Z" class="qc-park"/>
      <ellipse cx="380" cy="230" rx="150" ry="70" class="qc-water"/>
      <!-- 宫殿台基与东西六宫 -->
      <g class="qc-blocks">
        <rect x="350" y="380" width="300" height="180" rx="6"/>
        <rect x="370" y="600" width="260" height="150" rx="6"/>
        <rect x="145" y="380" width="165" height="220" rx="6"/>
        <rect x="145" y="630" width="165" height="220" rx="6"/>
        <rect x="690" y="380" width="165" height="220" rx="6"/>
        <rect x="690" y="630" width="165" height="220" rx="6"/>
      </g>
      <!-- 宫墙与甬道 -->
      <g class="qc-roads">
        <rect x="115" y="95" width="770" height="810" rx="12" class="qc-wall"/>
        <line x1="500" y1="95" x2="500" y2="905" class="qc-road-major"/>
        <line x1="115" y1="350" x2="885" y2="350" class="qc-road-minor"/>
        <line x1="115" y1="585" x2="885" y2="585" class="qc-road-minor"/>
        <line x1="330" y1="350" x2="330" y2="905" class="qc-road-minor"/>
        <line x1="670" y1="350" x2="670" y2="905" class="qc-road-minor"/>
      </g>
    `,
  },
  terrain: {
    id: 'terrain',
    label: '自然山野',
    desc: '连绵山脉、林海河谷、荒原古道与秘境',
    keywords: ['山', '谷', '林', '森林', '海', '岛', '湖', '洞', '崖', '原', '村', '营地', '遗迹', '秘境'],
    regions: DEFAULT_REGIONS,
    anchors: DEFAULT_ANCHORS,
    svg: `
      <rect width="1000" height="1000" class="qc-bg"/>
      <!-- 森林与山麓等高线 -->
      <ellipse cx="260" cy="250" rx="210" ry="150" class="qc-park"/>
      <ellipse cx="760" cy="300" rx="190" ry="160" class="qc-park"/>
      <ellipse cx="300" cy="760" rx="220" ry="150" class="qc-park"/>
      <!-- 大河与湖泊 -->
      <path d="M80 -20 C160 220, 380 340, 480 500 C580 660, 780 740, 960 1020 L1020 1020 C860 700, 650 610, 550 450 C450 290, 230 180, 150 -20 Z" class="qc-water"/>
      <ellipse cx="520" cy="490" rx="115" ry="75" class="qc-water"/>
      <!-- 山脊线与古道 -->
      <g class="qc-roads">
        <path d="M120 220 L210 130 L300 220 L380 150 L450 230" class="qc-wall" fill="none"/>
        <path d="M640 260 L730 160 L820 260 L890 190" class="qc-wall" fill="none"/>
        <path d="M60 620 Q480 490 940 380" class="qc-road-major" fill="none"/>
        <path d="M360 80 Q500 500 660 920" class="qc-road-minor" fill="none"/>
      </g>
    `,
  },
  'sci-fi': {
    id: 'sci-fi',
    label: '科幻设施',
    desc: '环形轨道舱、中央反应核心與扇区矩阵',
    keywords: ['舱', '舰', '基地', '实验室', '核心', '甲板', '太空', '星', '轨道', '赛博', '港区', '扇区'],
    regions: DEFAULT_REGIONS,
    anchors: DEFAULT_ANCHORS,
    svg: `
      <rect width="1000" height="1000" class="qc-bg"/>
      <!-- 能量环与核心池 -->
      <circle cx="500" cy="500" r="140" class="qc-water"/>
      <circle cx="500" cy="500" r="85" class="qc-park"/>
      <!-- 扇区舱体 -->
      <g class="qc-blocks">
        <polygon points="220,160 440,160 440,360 160,360"/>
        <polygon points="560,160 780,160 840,360 560,360"/>
        <polygon points="160,640 440,640 440,840 220,840"/>
        <polygon points="560,640 840,640 780,840 560,840"/>
      </g>
      <!-- 环轨与通道 -->
      <g class="qc-roads">
        <circle cx="500" cy="500" r="390" class="qc-road-ring"/>
        <circle cx="500" cy="500" r="245" class="qc-road-minor"/>
        <line x1="500" y1="60" x2="500" y2="940" class="qc-road-major"/>
        <line x1="60" y1="500" x2="940" y2="500" class="qc-road-major"/>
        <line x1="190" y1="190" x2="810" y2="810" class="qc-road-minor"/>
        <line x1="810" y1="190" x2="190" y2="810" class="qc-road-minor"/>
      </g>
    `,
  },
};

export function listBasemapOptions() {
  return [
    { id: 'auto', label: '自动匹配底图', desc: '根据当前场景名称与描述自动选择最契合的底图风格' },
    ...Object.values(MAP_BASEMAPS).map(b => ({ id: b.id, label: b.label, desc: b.desc })),
  ];
}

export function resolveBasemapId(requestedId, places = []) {
  if (requestedId && requestedId !== 'auto' && MAP_BASEMAPS[requestedId]) {
    return requestedId;
  }
  const corpus = (places || [])
    .map(p => `${p.name || ''} ${p.desc || ''} ${(p.facilities || []).join(' ')}`)
    .join(' ');
  if (!corpus.trim()) return 'modern';

  let bestId = 'modern';
  let bestScore = 0;
  for (const basemap of Object.values(MAP_BASEMAPS)) {
    let score = 0;
    for (const kw of basemap.keywords || []) {
      if (corpus.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = basemap.id;
    }
  }
  return bestId;
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

function normKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * 将柏宝书 scenes、用户/AI 自定义地点、当前位置路径合并为统一的地点节点列表
 */
export function mergeMapPlaces({ stateMap = {}, baibaiSnapshot = null, inlineLocation = null } = {}) {
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
  }

  // 1. 先载入用户/AI 自定义保存的地点
  for (const item of customItems) {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || '').trim();
    if (!id || !name || deletedSet.has(id)) continue;
    const place = {
      id,
      name,
      parentId: String(item.parentId || '').trim(),
      role: ['area', 'site', 'interior'].includes(item.role) ? item.role : '',
      mapLevel: ['city', 'country', 'scope'].includes(item.mapLevel) ? item.mapLevel : '',
      desc: String(item.desc || '').trim(),
      facilities: Array.isArray(item.facilities) ? item.facilities.map(s => String(s).trim()).filter(Boolean) : [],
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

  // 2. 合并柏宝书 (STBaiBaiBook) 的 scenes 层级树
  const scenes = Array.isArray(baibaiSnapshot?.scenes) ? baibaiSnapshot.scenes : [];
  const baibaiIdToPlaceId = new Map();

  // 按路径长度排序，确保父节点先处理
  const sortedScenes = [...scenes].sort((a, b) => (a?.path?.length || 0) - (b?.path?.length || 0));
  for (const scene of sortedScenes) {
    const rawId = String(scene?.id || '').trim();
    const name = String(scene?.name || '').trim();
    if (!name) continue;
    const syntheticId = rawId ? `baibai:${rawId}` : `baibai:${ (scene.path || [name]).join('/') }`;
    if (deletedSet.has(rawId) || deletedSet.has(syntheticId) || deletedSet.has(`name:${normKey(name)}`)) {
      continue;
    }

    const pathArr = Array.isArray(scene?.path) && scene.path.length
      ? scene.path.map(s => String(s || '').trim()).filter(Boolean)
      : [name];
    const pathKey = pathArr.map(normKey).join('/');

    // 查找是否已有同名或同路径的自定义地点
    let existing = byId.get(syntheticId) || byPathKey.get(pathKey);
    if (!existing && pathArr.length === 1) {
      existing = byNameKey.get(normKey(name));
    }

    if (existing) {
      if (!existing.desc && scene.desc) existing.desc = String(scene.desc).trim();
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

    const place = {
      id: syntheticId,
      name,
      parentId: parentPlaceId,
      role: '',
      mapLevel: '',
      desc: String(scene?.desc || '').trim(),
      facilities: [],
      relations: [],
      aliases: [],
      source: 'baibai',
      baibaiId: rawId,
      path: pathArr,
      pathKey,
    };
    registerPlace(place);
    if (rawId) baibaiIdToPlaceId.set(rawId, place.id);
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

  // 5. 自动推断缺省的 role ('area' | 'site' | 'interior') 与 mapLevel
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

  // 先自顶向下按深度排序推断
  const byDepth = [...places].sort((a, b) => getDepth(a) - getDepth(b));
  for (const p of byDepth) {
    const kids = childrenMap.get(p.id) || [];
    const depth = getDepth(p);
    const parent = p.parentId ? byId.get(p.parentId) : null;

    if (!p.role) {
      if (kids.length > 0) {
        // 如果它是二级以上有子节点的场所，但子节点全是房间类，且自身不像大区域，则它可以是带内部房间的 site
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
  }

  return places;
}

/**
 * 几何辅助：多边形面积与内接矩形及散布计算
 */
function polygonArea(points = []) {
  if (points.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    total += x1 * y2 - x2 * y1;
  }
  return Math.abs(total) / 2;
}

function regionScore(region) {
  const contours = Array.isArray(region?.contours) ? region.contours : [];
  return contours.reduce((sum, pts) => sum + polygonArea(pts), 0);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function labelBoxFromInset(inset) {
  const width = clamp(Math.max(inset.width * 0.62, 16), 16, Math.min(34, inset.width));
  const height = clamp(Math.min(Math.max(inset.height * 0.24, 9), 15), 8, inset.height);
  const left = inset.left + (inset.width - width) / 2;
  const top = inset.top + Math.max(1.5, Math.min(4, inset.height * 0.06));
  return { left, top, width, height };
}

function siteBoxFromInset(inset, reservedLabelBox) {
  if (!reservedLabelBox) return inset;
  const top = Math.min(inset.top + inset.height - 6, reservedLabelBox.top + reservedLabelBox.height + 2);
  const height = Math.max(8, inset.top + inset.height - top);
  return { left: inset.left, top, width: inset.width, height };
}

function spreadSitesInBox(sites = [], box) {
  if (!sites.length) return [];
  const count = sites.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt((count * box.width) / Math.max(box.height, 1))));
  const rows = Math.max(1, Math.ceil(count / cols));
  return sites.map((site, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const itemsInRow = row === rows - 1 ? count - row * cols : cols;
    const x = box.left + ((col + 0.5) / Math.max(itemsInRow, 1)) * box.width;
    const y = box.top + ((row + 0.5) / Math.max(rows, 1)) * box.height;
    return {
      ...site,
      x: Math.round(clamp(x, 6, 94) * 10) / 10,
      y: Math.round(clamp(y, 8, 92) * 10) / 10,
    };
  });
}

function placeSitesBySlots(sites = [], slots = [], fallbackBox) {
  if (!sites.length) return [];
  if (slots.length >= sites.length) {
    return sites.map((site, idx) => ({
      ...site,
      x: slots[idx][0],
      y: slots[idx][1],
    }));
  }
  return spreadSitesInBox(sites, fallbackBox);
}

/**
 * 计算底图上的分区轮廓、区域标题框与具体场所(site)锚点坐标
 */
export function computeMapLayout(basemapId = 'modern', groups = []) {
  const basemap = MAP_BASEMAPS[basemapId] || MAP_BASEMAPS.modern;
  const namedGroups = groups.filter(g => g.area);
  const directGroups = groups.filter(g => !g.area);
  const layoutKey = Math.min(Math.max(namedGroups.length, 1), 5);
  const rawRegions = basemap.regions?.layouts?.[layoutKey] || DEFAULT_REGIONS.layouts[1];
  const rawAnchorGroups = basemap.anchors?.layouts?.[layoutKey] || DEFAULT_ANCHORS.layouts[1];

  // 按区域面积从大到小分配给场所较多的分区
  const rankedRegions = rawRegions
    .map((region, index) => ({
      region,
      slots: rawAnchorGroups[index] || [],
      score: regionScore(region),
    }))
    .sort((a, b) => b.score - a.score);

  const rankedGroups = namedGroups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => b.group.sites.length - a.group.sites.length || a.index - b.index);

  const assignedByIndex = new Map();
  rankedGroups.forEach((entry, rank) => {
    const target = rankedRegions[rank % rankedRegions.length];
    assignedByIndex.set(entry.index, target);
  });

  const laidOutNamed = namedGroups.map((group, idx) => {
    const target = assignedByIndex.get(idx) || { region: rawRegions[0], slots: [] };
    const inset = target.region.inset || { left: 12, top: 12, width: 76, height: 76 };
    const labelBox = labelBoxFromInset(inset);
    const siteBox = siteBoxFromInset(inset, labelBox);
    return {
      ...group,
      contours: target.region.contours || [],
      labelBox,
      sites: placeSitesBySlots(group.sites, target.slots, siteBox),
    };
  });

  const directFallbackBox = { left: 14, top: 16, width: 72, height: 68 };
  const directSlots = namedGroups.length
    ? (basemap.anchors?.neutral || DEFAULT_ANCHORS.neutral)
    : (basemap.anchors?.all || DEFAULT_ANCHORS.all);

  const laidOutDirect = directGroups.map(group => ({
    ...group,
    contours: [],
    labelBox: null,
    sites: placeSitesBySlots(group.sites, directSlots, directFallbackBox),
  }));

  return [...laidOutNamed, ...laidOutDirect];
}

function matchPlaceByText(text, places) {
  const clean = normKey(text);
  if (!clean) return null;
  for (const p of places) {
    if (normKey(p.name) === clean) return p;
    if ((p.aliases || []).some(a => normKey(a) === clean)) return p;
  }
  // 退化为包含匹配（优先匹配名字更长、更具体的地点）
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
  baibaiSnapshot = null,
   messages = [],
  activeSheetId = '',
  scopePlaceId = '',
  searchQuery = '',
} = {}) {
  const stateMap = state?.map || {};
  const inlineLocation = readInlineMessageLocation(messages);
  const places = mergeMapPlaces({ stateMap, baibaiSnapshot, inlineLocation });
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
  // 如果当前在 interior（室内），在地图上高亮其所属的 site（建筑/场所）
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
      pushMapItem(npcsByPlaceId, targetPlace.id, {
        id: npc.id || name,
        name,
        title: String(npc.title || '').trim(),
        relation: String(npc.relation || '').trim(),
        follow: Boolean(npc.follow),
      });
      if (targetPlace.role === 'interior' && targetPlace.parentId) {
        pushMapItem(npcsByPlaceId, targetPlace.parentId, {
          id: npc.id || name,
          name,
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

  // 3. 识别多图幅（顶层城市/大区域根节点）
  const rootNodes = childrenMap.get('') || [];
  const cityRoots = rootNodes.filter(r => r.role === 'area' && (childrenMap.get(r.id) || []).length > 0);
  const sheets = cityRoots.length > 1
    ? cityRoots.map(r => ({
      id: r.id,
      title: r.name,
      count: (childrenMap.get(r.id) || []).length,
    }))
    : [];

  const resolvedSheetId = sheets.length
    ? (sheets.some(s => s.id === activeSheetId)
      ? activeSheetId
      : (currentAncestors[0] && sheets.some(s => s.id === currentAncestors[0].id)
        ? currentAncestors[0].id
        : sheets[0].id))
    : '';

  // 4. 确定当前浏览根节点（支持点击分区下钻查看，或按当前 sheet 过滤）
  const validScopeId = scopePlaceId && byId.has(scopePlaceId) ? scopePlaceId : (resolvedSheetId || '');
  const scopeNode = validScopeId ? byId.get(validScopeId) : null;
  const scopeBreadcrumb = scopeNode ? getAncestors(scopeNode.id) : [];

  // 收集当前视野下的直接子节点
  const topNodes = validScopeId
    ? (childrenMap.get(validScopeId) || [])
    : rootNodes;

  // 将视野内的节点组织成 { area, sites } 分组以供底图布局
  const groups = [];
  const directSites = [];

  function enrichPlace(p) {
    const kids = childrenMap.get(p.id) || [];
    const interiors = kids.filter(k => k.role === 'interior').map(enrichPlace);
    const subPlaces = kids.filter(k => k.role !== 'interior').map(enrichPlace);
    const npcs = npcsByPlaceId.get(p.id) || [];
    const items = itemsByPlaceId.get(p.id) || [];
    const todos = todosByPlaceId.get(p.id) || [];
    const isCurrent = userPosition.placeId === p.id || userPosition.pinPlaceId === p.id;
    return {
      ...p,
      interiors,
      subPlaces,
      npcs,
      items,
      todos,
      isCurrent,
      hasDrilldown: p.role === 'area' && subPlaces.length > 0,
    };
  }

  for (const node of topNodes) {
    const kids = childrenMap.get(node.id) || [];
    if (node.role === 'area') {
      // 收集该区域下的所有 site（含二级子区域下的 site，确保地图上有锚点）
      const areaSites = [];
      for (const child of kids) {
        if (child.role === 'site') {
          areaSites.push(enrichPlace(child));
        } else if (child.role === 'area') {
          const grandKids = (childrenMap.get(child.id) || []).filter(g => g.role === 'site');
          if (grandKids.length) {
            areaSites.push(...grandKids.map(enrichPlace));
          } else {
            areaSites.push(enrichPlace(child));
          }
        }
      }
      groups.push({
        area: enrichPlace(node),
        sites: areaSites,
      });
    } else if (node.role === 'site') {
      directSites.push(enrichPlace(node));
    }
  }

  // 如果当前作用域是一个没有子分区但自身是 area 的节点，或者全是顶层 area 没有下属 site，把顶层节点当作可点击点位展示
  if (groups.length > 0 && groups.every(g => g.sites.length === 0) && directSites.length === 0) {
    // 保持区域轮廓与标题可点击
  }
  if (directSites.length > 0) {
    groups.push({
      area: null,
      sites: directSites,
    });
  }

  const basemapId = resolveBasemapId(stateMap.basemap, places);
  const basemap = MAP_BASEMAPS[basemapId] || MAP_BASEMAPS.modern;
  const layoutGroups = computeMapLayout(basemapId, groups);

  // 5. 搜索过滤目录树
  const q = normKey(searchQuery);
  const directoryTree = topNodes
    .map(enrichPlace)
    .filter(node => {
      if (!q) return true;
      const selfMatch = normKey(node.name).includes(q)
        || normKey(node.desc).includes(q)
        || (node.facilities || []).some(f => normKey(f).includes(q));
      if (selfMatch) return true;
      const childMatch = [...(node.subPlaces || []), ...(node.interiors || [])].some(
        c => normKey(c.name).includes(q) || normKey(c.desc).includes(q),
      );
      return childMatch;
    });

  return {
    basemapId,
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

  // 当前所在地点详情与在场人物/物品/待办
  const currentPlace = places.find(p => p.id === userPosition?.placeId);
  if (currentPlace) {
    if (currentPlace.desc) {
      lines.push(`当前场景环境：${currentPlace.desc}`);
    }
    if (currentPlace.facilities?.length) {
      lines.push(`场所设施：${currentPlace.facilities.join('、')}`);
    }
    if (currentPlace.relations?.length) {
      const relStr = currentPlace.relations
        .map(r => `${r.type || '邻近'}「${r.targetName}」${r.note ? `（${r.note}）` : ''}`)
        .join('；');
      lines.push(`空间方位关系：${relStr}`);
    }
  }

  // 收集同区域的邻近地点
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

  // 概览主要区域与关键地点（最多列出前 8 个）
  const areas = places.filter(p => p.role === 'area').map(p => p.name).slice(0, 6);
  if (areas.length) {
    lines.push(`已知主要区域：${areas.join('、')}`);
  }

  return lines.join('\n');
}
