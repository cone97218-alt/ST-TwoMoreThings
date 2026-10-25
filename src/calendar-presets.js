// 全球现代国家日历与节假日数据库 (基于 Nager.Date 开源 API 及内置离线预设)

export const POPULAR_COUNTRIES = [
  { code: 'CN', name: '中国', en: 'China', era: '', weekdays: ['一', '二', '三', '四', '五', '六', '日'] },
  { code: 'JP', name: '日本', en: 'Japan', era: '令和', weekdays: ['月', '火', '水', '木', '金', '土', '日'] },
  { code: 'US', name: '美国', en: 'United States', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { code: 'GB', name: '英国', en: 'United Kingdom', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { code: 'KR', name: '韩国', en: 'South Korea', era: '', weekdays: ['월', '화', '수', '목', '금', '토', '일'] },
  { code: 'FR', name: '法国', en: 'France', era: '', weekdays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] },
  { code: 'DE', name: '德国', en: 'Germany', era: '', weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] },
  { code: 'RU', name: '俄罗斯', en: 'Russia', era: '', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] },
  { code: 'IT', name: '意大利', en: 'Italy', era: '', weekdays: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] },
  { code: 'CA', name: '加拿大', en: 'Canada', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { code: 'AU', name: '澳大利亚', en: 'Australia', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { code: 'ES', name: '西班牙', en: 'Spain', era: '', weekdays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] },
  { code: 'BR', name: '巴西', en: 'Brazil', era: '', weekdays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] },
  { code: 'NL', name: '荷兰', en: 'Netherlands', era: '', weekdays: ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'] },
  { code: 'CH', name: '瑞士', en: 'Switzerland', era: '', weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] },
  { code: 'SE', name: '瑞典', en: 'Sweden', era: '', weekdays: ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'] },
  { code: 'SG', name: '新加坡', en: 'Singapore', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { code: 'HK', name: '中国香港', en: 'Hong Kong', era: '', weekdays: ['一', '二', '三', '四', '五', '六', '日'] },
  { code: 'TW', name: '中国台湾', en: 'Taiwan', era: '', weekdays: ['一', '二', '三', '四', '五', '六', '日'] },
  { code: 'TH', name: '泰国', en: 'Thailand', era: '佛历', weekdays: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'] },
  { code: 'VN', name: '越南', en: 'Vietnam', era: '', weekdays: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] },
  { code: 'EG', name: '埃及', en: 'Egypt', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { code: 'GR', name: '希腊', en: 'Greece', era: '', weekdays: ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'] },
  { code: 'IE', name: '爱尔兰', en: 'Ireland', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  { code: 'NZ', name: '新西兰', en: 'New Zealand', era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
];

export const ALL_NAGER_COUNTRIES = [
  ...POPULAR_COUNTRIES,
  { code: 'AD', name: '安道尔', en: 'Andorra' },
  { code: 'AG', name: '安提瓜和巴布达', en: 'Antigua and Barbuda' },
  { code: 'AI', name: '安圭拉', en: 'Anguilla' },
  { code: 'AL', name: '阿尔巴尼亚', en: 'Albania' },
  { code: 'AM', name: '亚美尼亚', en: 'Armenia' },
  { code: 'AO', name: '安哥拉', en: 'Angola' },
  { code: 'AR', name: '阿根廷', en: 'Argentina' },
  { code: 'AT', name: '奥地利', en: 'Austria' },
  { code: 'AW', name: '阿鲁巴', en: 'Aruba' },
  { code: 'AX', name: '奥兰群岛', en: 'Åland Islands' },
  { code: 'BA', name: '波黑', en: 'Bosnia and Herzegovina' },
  { code: 'BB', name: '巴巴多斯', en: 'Barbados' },
  { code: 'BD', name: '孟加拉国', en: 'Bangladesh' },
  { code: 'BE', name: '比利时', en: 'Belgium' },
  { code: 'BF', name: '布基纳法索', en: 'Burkina Faso' },
  { code: 'BG', name: '保加利亚', en: 'Bulgaria' },
  { code: 'BH', name: '巴林', en: 'Bahrain' },
  { code: 'BI', name: '布隆迪', en: 'Burundi' },
  { code: 'BJ', name: '贝宁', en: 'Benin' },
  { code: 'BL', name: '圣巴泰勒米', en: 'Saint Barthélemy' },
  { code: 'BM', name: '百慕大', en: 'Bermuda' },
  { code: 'BO', name: '玻利维亚', en: 'Bolivia' },
  { code: 'BQ', name: '荷兰加勒比区', en: 'Caribbean Netherlands' },
  { code: 'BS', name: '巴哈马', en: 'Bahamas' },
  { code: 'BW', name: '博茨瓦纳', en: 'Botswana' },
  { code: 'BY', name: '白俄罗斯', en: 'Belarus' },
  { code: 'BZ', name: '伯利兹', en: 'Belize' },
  { code: 'CD', name: '刚果（金）', en: 'DR Congo' },
  { code: 'CF', name: '中非', en: 'Central African Republic' },
  { code: 'CG', name: '刚果（布）', en: 'Congo' },
  { code: 'CL', name: '智利', en: 'Chile' },
  { code: 'CM', name: '喀麦隆', en: 'Cameroon' },
  { code: 'CO', name: '哥伦比亚', en: 'Colombia' },
  { code: 'CR', name: '哥斯达黎加', en: 'Costa Rica' },
  { code: 'CU', name: '古巴', en: 'Cuba' },
  { code: 'CV', name: '佛得角', en: 'Cape Verde' },
  { code: 'CW', name: '库拉索', en: 'Curaçao' },
  { code: 'CY', name: '塞浦路斯', en: 'Cyprus' },
  { code: 'CZ', name: '捷克', en: 'Czechia' },
  { code: 'DK', name: '丹麦', en: 'Denmark' },
  { code: 'DO', name: '多米尼加', en: 'Dominican Republic' },
  { code: 'DZ', name: '阿尔及利亚', en: 'Algeria' },
  { code: 'EC', name: '厄瓜多尔', en: 'Ecuador' },
  { code: 'EE', name: '爱沙尼亚', en: 'Estonia' },
  { code: 'FI', name: '芬兰', en: 'Finland' },
  { code: 'GL', name: '格陵兰', en: 'Greenland' },
  { code: 'HR', name: '克罗地亚', en: 'Croatia' },
  { code: 'HU', name: '匈牙利', en: 'Hungary' },
  { code: 'ID', name: '印度尼西亚', en: 'Indonesia' },
  { code: 'IS', name: '冰岛', en: 'Iceland' },
  { code: 'JM', name: '牙买加', en: 'Jamaica' },
  { code: 'LU', name: '卢森堡', en: 'Luxembourg' },
  { code: 'MC', name: '摩纳哥', en: 'Monaco' },
  { code: 'MX', name: '墨西哥', en: 'Mexico' },
  { code: 'MY', name: '马来西亚', en: 'Malaysia' },
  { code: 'NO', name: '挪威', en: 'Norway' },
  { code: 'PE', name: '秘鲁', en: 'Peru' },
  { code: 'PH', name: '菲律宾', en: 'Philippines' },
  { code: 'PL', name: '波兰', en: 'Poland' },
  { code: 'PT', name: '葡萄牙', en: 'Portugal' },
  { code: 'RO', name: '罗马尼亚', en: 'Romania' },
  { code: 'RS', name: '塞尔维亚', en: 'Serbia' },
  { code: 'TR', name: '土耳其', en: 'Türkiye' },
  { code: 'UA', name: '乌克兰', en: 'Ukraine' },
  { code: 'ZA', name: '南非', en: 'South Africa' },
];

export const BUILTIN_COUNTRY_HOLIDAYS = {
  CN: [
    { id: 'cn-new-year', name: '元旦', type: 'festival', month: 1, day: 1, days: 1, note: '新年第一天' },
    { id: 'cn-spring-festival', name: '春节', type: 'festival', month: 2, day: 10, days: 3, note: '农历新年' },
    { id: 'cn-lantern', name: '元宵节', type: 'festival', month: 2, day: 24, days: 1, note: '上元赏灯' },
    { id: 'cn-valentine', name: '情人节', type: 'festival', month: 2, day: 14, days: 1, note: '' },
    { id: 'cn-womens-day', name: '妇女节', type: 'festival', month: 3, day: 8, days: 1, note: '' },
    { id: 'cn-qingming', name: '清明节', type: 'festival', month: 4, day: 4, days: 1, note: '春祭踏青' },
    { id: 'cn-labor-day', name: '劳动节', type: 'festival', month: 5, day: 1, days: 3, note: '' },
    { id: 'cn-youth-day', name: '青年节', type: 'festival', month: 5, day: 4, days: 1, note: '' },
    { id: 'cn-childrens-day', name: '儿童节', type: 'festival', month: 6, day: 1, days: 1, note: '' },
    { id: 'cn-dragon-boat', name: '端午节', type: 'festival', month: 6, day: 10, days: 1, note: '龙舟与角黍' },
    { id: 'cn-qixi', name: '七夕节', type: 'festival', month: 8, day: 10, days: 1, note: '乞巧祈愿' },
    { id: 'cn-mid-autumn', name: '中秋节', type: 'festival', month: 9, day: 17, days: 1, note: '团圆望月' },
    { id: 'cn-teachers-day', name: '教师节', type: 'festival', month: 9, day: 10, days: 1, note: '' },
    { id: 'cn-national-day', name: '国庆节', type: 'festival', month: 10, day: 1, days: 3, note: '' },
    { id: 'cn-chongyang', name: '重阳节', type: 'festival', month: 10, day: 11, days: 1, note: '登高祈寿' },
    { id: 'cn-nye', name: '跨年夜', type: 'festival', month: 12, day: 31, days: 1, note: '' },
  ],
  JP: [
    { id: 'jp-new-year', name: '元日', type: 'festival', month: 1, day: 1, days: 1, note: '新年初詣' },
    { id: 'jp-coming-of-age', name: '成人の日', type: 'festival', month: 1, day: 12, days: 1, note: '成年礼' },
    { id: 'jp-setsubun', name: '節分', type: 'festival', month: 2, day: 3, days: 1, note: '撒豆驱邪' },
    { id: 'jp-national-founding', name: '建国記念の日', type: 'festival', month: 2, day: 11, days: 1, note: '' },
    { id: 'jp-emperors-birthday', name: '天皇誕生日', type: 'festival', month: 2, day: 23, days: 1, note: '' },
    { id: 'jp-hinamatsuri', name: 'ひな祭り', type: 'festival', month: 3, day: 3, days: 1, note: '桃花雏祭' },
    { id: 'jp-spring-equinox', name: '春分の日', type: 'festival', month: 3, day: 20, days: 1, note: '' },
    { id: 'jp-hanami', name: '花見', type: 'festival', month: 4, day: 1, days: 7, note: '春季赏樱' },
    { id: 'jp-showa', name: '昭和の日', type: 'festival', month: 4, day: 29, days: 1, note: '黄金周起' },
    { id: 'jp-constitution', name: '憲法記念日', type: 'festival', month: 5, day: 3, days: 1, note: '黄金周连假' },
    { id: 'jp-greenery', name: 'みどりの日', type: 'festival', month: 5, day: 4, days: 1, note: '黄金周连假' },
    { id: 'jp-children', name: 'こどもの日', type: 'festival', month: 5, day: 5, days: 1, note: '鲤鱼旗与菖蒲' },
    { id: 'jp-tanabata', name: '七夕祭', type: 'festival', month: 7, day: 7, days: 1, note: '短册祈愿' },
    { id: 'jp-marine-day', name: '海の日', type: 'festival', month: 7, day: 20, days: 1, note: '' },
    { id: 'jp-hanabi', name: '花火大会', type: 'festival', month: 8, day: 8, days: 1, note: '夏夜花火' },
    { id: 'jp-mountain-day', name: '山の日', type: 'festival', month: 8, day: 11, days: 1, note: '' },
    { id: 'jp-obon', name: 'お盆', type: 'festival', month: 8, day: 13, days: 4, note: '盂兰盆连假' },
    { id: 'jp-respect-aged', name: '敬老の日', type: 'festival', month: 9, day: 21, days: 1, note: '' },
    { id: 'jp-autumn-equinox', name: '秋分の日', type: 'festival', month: 9, day: 23, days: 1, note: '' },
    { id: 'jp-sports-day', name: 'スポーツの日', type: 'festival', month: 10, day: 12, days: 1, note: '' },
    { id: 'jp-halloween', name: 'ハロウィン', type: 'festival', month: 10, day: 31, days: 1, note: '万圣夜' },
    { id: 'jp-culture-day', name: '文化の日', type: 'festival', month: 11, day: 3, days: 1, note: '学园祭与文化日' },
    { id: 'jp-shichigosan', name: '七五三', type: 'festival', month: 11, day: 15, days: 1, note: '少儿祈福' },
    { id: 'jp-labor-thanks', name: '勤労感謝の日', type: 'festival', month: 11, day: 23, days: 1, note: '' },
    { id: 'jp-christmas', name: 'クリスマス', type: 'festival', month: 12, day: 25, days: 1, note: '圣诞夜' },
    { id: 'jp-omisoka', name: '大晦日', type: 'festival', month: 12, day: 31, days: 1, note: '除夜之钟' },
  ],
  US: [
    { id: 'us-new-year', name: "New Year's Day", type: 'festival', month: 1, day: 1, days: 1, note: '' },
    { id: 'us-mlk', name: 'MLK Jr. Day', type: 'festival', month: 1, day: 19, days: 1, note: '' },
    { id: 'us-valentine', name: "Valentine's Day", type: 'festival', month: 2, day: 14, days: 1, note: '' },
    { id: 'us-presidents', name: "Presidents' Day", type: 'festival', month: 2, day: 16, days: 1, note: '' },
    { id: 'us-st-patrick', name: "St. Patrick's Day", type: 'festival', month: 3, day: 17, days: 1, note: '' },
    { id: 'us-easter', name: 'Easter', type: 'festival', month: 4, day: 5, days: 1, note: '' },
    { id: 'us-memorial', name: 'Memorial Day', type: 'festival', month: 5, day: 25, days: 1, note: '' },
    { id: 'us-juneteenth', name: 'Juneteenth', type: 'festival', month: 6, day: 19, days: 1, note: '' },
    { id: 'us-independence', name: 'Independence Day', type: 'festival', month: 7, day: 4, days: 1, note: '4th of July' },
    { id: 'us-labor', name: 'Labor Day', type: 'festival', month: 9, day: 7, days: 1, note: '' },
    { id: 'us-columbus', name: 'Columbus Day', type: 'festival', month: 10, day: 12, days: 1, note: '' },
    { id: 'us-halloween', name: 'Halloween', type: 'festival', month: 10, day: 31, days: 1, note: '' },
    { id: 'us-veterans', name: 'Veterans Day', type: 'festival', month: 11, day: 11, days: 1, note: '' },
    { id: 'us-thanksgiving', name: 'Thanksgiving', type: 'festival', month: 11, day: 26, days: 2, note: '' },
    { id: 'us-christmas-eve', name: 'Christmas Eve', type: 'festival', month: 12, day: 24, days: 1, note: '' },
    { id: 'us-christmas', name: 'Christmas', type: 'festival', month: 12, day: 25, days: 1, note: '' },
    { id: 'us-nye', name: "New Year's Eve", type: 'festival', month: 12, day: 31, days: 1, note: '' },
  ],
};

export function findCountryInfo(countryCode) {
  const code = String(countryCode || 'CN').toUpperCase();
  const alias = {
    JAPAN: 'JP',
    CHINA: 'CN',
    'UNITED-STATES': 'US',
    'UNITED-KINGDOM': 'GB',
    'SOUTH-KOREA': 'KR',
    GERMANY: 'DE',
    FRANCE: 'FR',
  }[code] || code;
  return ALL_NAGER_COUNTRIES.find(c => c.code === alias) || { code: alias, name: alias, en: alias, era: '', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };
}

export function getCountryPreset(countryCode) {
  const info = findCountryInfo(countryCode);
  return {
    ...info,
    items: BUILTIN_COUNTRY_HOLIDAYS[info.code] || BUILTIN_COUNTRY_HOLIDAYS.CN || [],
  };
}

export async function fetchNagerHolidays(countryCode, year = new Date().getFullYear()) {
  const code = String(countryCode || 'CN').toUpperCase();
  if (code.startsWith('CUSTOM_')) {
    return BUILTIN_COUNTRY_HOLIDAYS[code] || [];
  }
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      return data.map((item, idx) => {
        const parts = String(item.date || '').split('-');
        const month = Number(parts[1]) || 1;
        const day = Number(parts[2]) || 1;
        const name = String(item.localName || item.name || '').trim();
        const note = item.name && item.name !== item.localName ? String(item.name).trim() : '';
        return {
          id: `nager:${code.toLowerCase()}-${month}-${day}-${idx}`,
          name,
          type: 'festival',
          month,
          day,
          days: 1,
          note,
        };
      });
    }
  } catch (error) {
    // 降级回退到内置预设
  }
  return BUILTIN_COUNTRY_HOLIDAYS[code] || BUILTIN_COUNTRY_HOLIDAYS.CN || [];
}
