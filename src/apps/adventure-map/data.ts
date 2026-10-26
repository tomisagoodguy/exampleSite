import { PlaceEntry, Region } from '../../shared/types';

export interface CategoryConfig {
  color: string;
  fade: string;
  label: string;
  placeholder: string;
}

/**
 * 宣告順序即篩選列 chips 的顯示順序；分類只回答「去那裡做什麼」，室內／地區等屬性不放這裡
 * 色相刻意拉開（紅、棕、黃、藍、紫、粉、綠、深藍、青），篩選列的小色點才分得出來
 */
export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  food:    { color: '#E07A5F', fade: 'rgba(224, 122, 95, 0.3)', label: '吃', placeholder: '/images/placeholders/food.png' },
  cafe:    { color: '#9C7456', fade: 'rgba(156, 116, 86, 0.3)', label: '咖啡甜點', placeholder: '/images/placeholders/cafe.png' },
  shop:    { color: '#D9A62E', fade: 'rgba(217, 166, 46, 0.3)', label: '逛街', placeholder: '/images/placeholders/shop.png' },
  walk:    { color: '#5B8FC9', fade: 'rgba(91, 143, 201, 0.3)', label: '城市散步', placeholder: '/images/placeholders/walk.png' },
  museum:  { color: '#8E6C88', fade: 'rgba(142, 108, 136, 0.3)', label: '展覽文化', placeholder: '/images/placeholders/oldshop.png' },
  diy:     { color: '#E28AAE', fade: 'rgba(226, 138, 174, 0.3)', label: '體驗玩樂', placeholder: '/images/placeholders/quest.png' },
  scenery: { color: '#6FA36B', fade: 'rgba(111, 163, 107, 0.3)', label: '自然風景', placeholder: '/images/placeholders/scenery.png' },
  stay:    { color: '#3D5A80', fade: 'rgba(61, 90, 128, 0.3)', label: '住宿', placeholder: '/images/placeholders/stay.png' },
  quest:   { color: '#3E9C9E', fade: 'rgba(62, 156, 158, 0.3)', label: '破關任務', placeholder: '/images/placeholders/quest.png' },
};

export function colorToFade(color: string, alpha = 0.3): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const STATUS_LABEL: Record<string, string> = {
  idea: '💭 願望清單',
  proposed: '🗳️ 提案中',
  confirmed: '✅ 已定案',
  done: '🏁 已去過',
};

/** 宣告順序即地區篩選列的顯示順序（大致由北往南、再到東部） */
export const REGION_LABEL: Record<Region, string> = {
  north: '北北基',
  tzm: '桃竹苗',
  taichung: '台中',
  central_south: '中南部',
  east: '宜花東',
  islands: '離島',
};

export interface RegionInfo {
  emoji: string;
  tagline: string;
  foods: string[];
  /** 怎麼去、在當地怎麼移動；離島寫船班／航班 */
  transport: string;
}

/** 選了地區篩選時頂部顯示的介紹卡；離島的船班航班隨季節變動，文字只寫大方向 */
export const REGION_INFO: Record<Region, RegionInfo> = {
  north: {
    emoji: '🏙️',
    tagline: '捷運到得了大部分地方，下雨也有地方躲',
    foods: ['牛肉麵', '夜市小吃', '基隆廟口'],
    transport: '捷運＋YouBike 最方便；陽明山、瑞芳、九份搭觀光公車或開車',
  },
  tzm: {
    emoji: '🍊',
    tagline: '老街、客家庄跟山區露營，離台北一小時內',
    foods: ['客家菜', '新竹米粉貢丸', '大溪豆干'],
    transport: '台鐵／高鐵到市區，山區景點開車或騎車比較實際',
  },
  taichung: {
    emoji: '🧋',
    tagline: '天氣穩定少雨，吃喝跟文創園區很集中',
    foods: ['珍珠奶茶', '太陽餅', '第二市場'],
    transport: '捷運綠線＋YouBike／公車；高鐵台中站有捷運接市區',
  },
  central_south: {
    emoji: '🏯',
    tagline: '古蹟、老屋跟小吃，一天吃五餐是基本',
    foods: ['台南小吃', '嘉義雞肉飯', '彰化肉圓'],
    transport: '高鐵到站後租機車或開車；台南、嘉義市區步行也行',
  },
  east: {
    emoji: '🌊',
    tagline: '山跟海貼在一起，行程要排鬆一點',
    foods: ['三星蔥', '花蓮扁食', '池上便當'],
    transport: '台鐵東部幹線車票難買要提早訂；當地租車或機車才好移動',
  },
  islands: {
    emoji: '🚢',
    tagline: '要搭船或飛機，天候不好會停航，留一天彈性',
    foods: ['澎湖海鮮', '金門高粱', '小琉球麻花捲'],
    transport: '小琉球：東港搭船；綠島、蘭嶼：台東富岡搭船或飛機；澎湖、金門、馬祖：主要靠飛機，夏季另有船班。出發前查當天船班航班',
  },
};

export type IdeaTier = 'mrt' | 'weekend' | 'trip' | 'activity';

/** 願望清單依「出門成本」分組（以台北為起點）；宣告順序即分組按鈕順序，也是預設分組的優先順序 */
export const IDEA_TIER: Record<IdeaTier, { label: string; hint: string }> = {
  mrt:      { label: '🚇 下班就能去', hint: '有填捷運站，或在台北市與新北捷運沿線區（步道、山景除外）' },
  weekend:  { label: '🚗 週末一日', hint: '北北基山海景點、捷運到不了的地方、桃竹苗' },
  trip:     { label: '🧳 排趟旅行', hint: '台中、中南部、宜花東、離島' },
  activity: { label: '💡 活動點子', hint: '還沒指定店家的活動，例如捏陶、密室逃脫' },
};

/** 新北捷運沿線、從台北下班過去不用轉車太久的區；台北市整個都算 */
const NEW_TAIPEI_MRT_AREAS = new Set(
  ['板橋區', '永和區', '中和區', '三重區', '新莊區', '蘆洲區', '新店區', '土城區', '淡水區'].map(d => `新北市${d}`)
);

function inMrtArea(area?: string | null): boolean {
  return !!area && (area.startsWith('台北市') || NEW_TAIPEI_MRT_AREAS.has(area));
}

export function ideaTier(p: PlaceEntry): IdeaTier {
  // 沒座標就沒有 region：多半是「保齡球館」「看球賽」這類還沒指定店家的活動，mrt_station 只是隨手備註
  if (p.region == null) return 'activity';
  if (p.region === 'north') {
    // 台中、高雄也有捷運，只看北北基；陽明山、貓空這類步道雖在台北市，仍要半天以上
    if (p.mrt_station?.trim()) return 'mrt';
    return inMrtArea(p.area) && p.category !== 'scenery' ? 'mrt' : 'weekend';
  }
  return p.region === 'tzm' ? 'weekend' : 'trip';
}

export type AchievementCategory =
  | 'nature' | 'photo' | 'festival' | 'island'
  | 'outing' | 'eat' | 'words' | 'music' | 'play' | 'talk' | 'quirky';

/** 成就分頁的兩本冊子：旅行成就／一起做的 100 件事，各自有稱號、進度與成就牆 */
export type AchievementBook = 'travel' | 'together';

export interface AchievementCategoryConfig {
  book: AchievementBook;
  label: string;
  emoji: string;
  color: string;
  /** 解鎖幾項拿到這類的徽章 */
  badge: { name: string; threshold: number };
}

/** 宣告順序即成就分頁的分類順序；旅行成就的徽章門檻沿用參考專案（ivanusto/taiwan-travel-achievement-list） */
export const ACHIEVEMENT_CATEGORY: Record<AchievementCategory, AchievementCategoryConfig> = {
  nature:   { book: 'travel', label: '自然', emoji: '🏔️', color: '#81B29A', badge: { name: '山海自然控', threshold: 6 } },
  photo:    { book: 'travel', label: '攝影', emoji: '📷', color: '#7B8CDE', badge: { name: '極景攝影師', threshold: 5 } },
  festival: { book: 'travel', label: '祭典', emoji: '🥁', color: '#C47B5A', badge: { name: '民俗祭典通', threshold: 4 } },
  island:   { book: 'travel', label: '離島', emoji: '🚢', color: '#3D5A80', badge: { name: '跳島旅行家', threshold: 4 } },
  outing:   { book: 'together', label: '出走', emoji: '🛵', color: '#81B29A', badge: { name: '說走就走', threshold: 8 } },
  eat:      { book: 'together', label: '吃吃喝喝', emoji: '🍝', color: '#E07A5F', badge: { name: '吃貨搭檔', threshold: 8 } },
  words:    { book: 'together', label: '書與文字', emoji: '📚', color: '#C47B5A', badge: { name: '書蟲二人組', threshold: 8 } },
  music:    { book: 'together', label: '音樂', emoji: '🎸', color: '#7B8CDE', badge: { name: '合拍的人', threshold: 8 } },
  play:     { book: 'together', label: '玩樂體驗', emoji: '🎳', color: '#F2CC8F', badge: { name: '玩伴認證', threshold: 8 } },
  talk:     { book: 'together', label: '心裡話', emoji: '💬', color: '#3D5A80', badge: { name: '靈魂知己', threshold: 8 } },
  quirky:   { book: 'together', label: '小怪點子', emoji: '🎁', color: '#B5838D', badge: { name: '古怪同盟', threshold: 5 } },
};

/** 依解鎖總數決定稱號，由低到高 */
export const ACHIEVEMENT_BOOKS: Record<AchievementBook, { label: string; emoji: string; titles: { min: number; title: string }[] }> = {
  travel: {
    label: '旅行成就',
    emoji: '🧭',
    titles: [
      { min: 0, title: '🌱 台灣新手' },
      { min: 5, title: '🎒 週末旅人' },
      { min: 12, title: '✈️ 台灣探索家' },
      { min: 22, title: '🗺️ 破關老手' },
      { min: 32, title: '🏯 台灣旅行神' },
    ],
  },
  together: {
    label: '一起的 100 件事',
    emoji: '💑',
    titles: [
      { min: 0, title: '🌱 剛開始的我們' },
      { min: 10, title: '☕ 有默契了' },
      { min: 30, title: '🫶 最佳拍檔' },
      { min: 60, title: '🏡 生活在一起' },
      { min: 100, title: '💯 百件達成' },
    ],
  },
};

export function filterPlaces(
  places: PlaceEntry[],
  category: string,
  search: string = '',
  region: Region | 'all' = 'all',
  rainOnly: boolean = false
): PlaceEntry[] {
  const q = search.trim().toLowerCase();
  return places.filter(p => {
    const matchCat = category === 'all' || p.category === category;
    const matchRegion = region === 'all' || p.region === region;
    const matchRain = !rainOnly || p.is_indoor === true;
    const matchSearch = !q || [p.name, p.address, p.mrt_station, p.note].some(
      v => v && v.toLowerCase().includes(q)
    );
    return matchCat && matchRegion && matchRain && matchSearch;
  });
}

/**
 * 多日旅行的懶人包是第幾天：標題寫「Day 3」就照寫的，同一天可以有「Day 3 路線 A／B」兩條讓當天挑；
 * 標題沒寫就回 null，呼叫端照 sort_order 第幾條算
 */
export function guideDay(title: string): { day: number; route: string } | null {
  const m = /Day\s*(\d+)(?:\s*路線\s*([A-Z]))?/.exec(title);
  return m ? { day: Number(m[1]), route: m[2] || '' } : null;
}
