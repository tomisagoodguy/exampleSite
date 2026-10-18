import { PlaceEntry, Region } from '../../shared/types';

export interface CategoryConfig {
  color: string;
  fade: string;
  label: string;
  placeholder: string;
}

/** 宣告順序即篩選列 chips 的顯示順序；分類只回答「去那裡做什麼」，室內／地區等屬性不放這裡 */
export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  food:    { color: '#C47B5A', fade: 'rgba(196, 123, 90, 0.3)', label: '吃', placeholder: '/images/placeholders/food.png' },
  cafe:    { color: '#A67B5B', fade: 'rgba(166, 123, 91, 0.3)', label: '咖啡甜點', placeholder: '/images/placeholders/cafe.png' },
  shop:    { color: '#E07A5F', fade: 'rgba(224, 122, 95, 0.3)', label: '逛街', placeholder: '/images/placeholders/shop.png' },
  walk:    { color: '#7B8CDE', fade: 'rgba(123, 140, 222, 0.3)', label: '城市散步', placeholder: '/images/placeholders/walk.png' },
  museum:  { color: '#8E6C88', fade: 'rgba(142, 108, 136, 0.3)', label: '展覽文化', placeholder: '/images/placeholders/oldshop.png' },
  diy:     { color: '#C9A05C', fade: 'rgba(201, 160, 92, 0.3)', label: '體驗玩樂', placeholder: '/images/placeholders/quest.png' },
  scenery: { color: '#81B29A', fade: 'rgba(129, 178, 154, 0.3)', label: '自然風景', placeholder: '/images/placeholders/scenery.png' },
  stay:    { color: '#3D5A80', fade: 'rgba(61, 90, 128, 0.3)', label: '住宿', placeholder: '/images/placeholders/stay.png' },
  quest:   { color: '#9B72AA', fade: 'rgba(155, 114, 170, 0.3)', label: '破關任務', placeholder: '/images/placeholders/quest.png' },
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

export type AchievementCategory = 'nature' | 'photo' | 'festival' | 'island';

export interface AchievementCategoryConfig {
  label: string;
  emoji: string;
  color: string;
  /** 解鎖幾項拿到這類的徽章 */
  badge: { name: string; threshold: number };
}

/** 宣告順序即成就分頁的分類順序；徽章門檻沿用參考專案（ivanusto/taiwan-travel-achievement-list） */
export const ACHIEVEMENT_CATEGORY: Record<AchievementCategory, AchievementCategoryConfig> = {
  nature:   { label: '自然', emoji: '🏔️', color: '#81B29A', badge: { name: '山海自然控', threshold: 6 } },
  photo:    { label: '攝影', emoji: '📷', color: '#7B8CDE', badge: { name: '極景攝影師', threshold: 5 } },
  festival: { label: '祭典', emoji: '🥁', color: '#C47B5A', badge: { name: '民俗祭典通', threshold: 4 } },
  island:   { label: '離島', emoji: '🚢', color: '#3D5A80', badge: { name: '跳島旅行家', threshold: 4 } },
};

/** 依解鎖總數決定稱號，由低到高 */
export const ACHIEVEMENT_TITLES: { min: number; title: string }[] = [
  { min: 0, title: '🌱 台灣新手' },
  { min: 5, title: '🎒 週末旅人' },
  { min: 12, title: '✈️ 台灣探索家' },
  { min: 22, title: '🗺️ 破關老手' },
  { min: 32, title: '🏯 台灣旅行神' },
];

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
