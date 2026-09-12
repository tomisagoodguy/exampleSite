import { PlaceEntry } from '../../shared/types';

export interface CategoryConfig {
  color: string;
  fade: string;
  label: string;
  placeholder: string;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  food:         { color: '#C47B5A', fade: 'rgba(196, 123, 90, 0.3)', label: '美食', placeholder: '/images/placeholders/food.png' },
  scenery:      { color: '#81B29A', fade: 'rgba(129, 178, 154, 0.3)', label: '風景', placeholder: '/images/placeholders/scenery.png' },
  oldshop:      { color: '#D4A853', fade: 'rgba(212, 168, 83, 0.3)', label: '老店', placeholder: '/images/placeholders/oldshop.png' },
  walk:         { color: '#7B8CDE', fade: 'rgba(123, 140, 222, 0.3)', label: '散步', placeholder: '/images/placeholders/walk.png' },
  cafe:         { color: '#A67B5B', fade: 'rgba(166, 123, 91, 0.3)', label: '咖啡', placeholder: '/images/placeholders/cafe.png' },
  shop:         { color: '#E07A5F', fade: 'rgba(224, 122, 95, 0.3)', label: '購物', placeholder: '/images/placeholders/shop.png' },
  stay:         { color: '#3D5A80', fade: 'rgba(61, 90, 128, 0.3)', label: '住宿', placeholder: '/images/placeholders/stay.png' },
  quest:        { color: '#9B72AA', fade: 'rgba(155, 114, 170, 0.3)', label: '破關任務', placeholder: '/images/placeholders/quest.png' },
  museum:       { color: '#8E6C88', fade: 'rgba(142, 108, 136, 0.3)', label: '博物館/展覽', placeholder: '/images/placeholders/quest.png' },
  indoor:       { color: '#B08968', fade: 'rgba(176, 137, 104, 0.3)', label: '室內活動', placeholder: '/images/placeholders/quest.png' },
  diy:          { color: '#C9A05C', fade: 'rgba(201, 160, 92, 0.3)', label: '動手做', placeholder: '/images/placeholders/quest.png' },
  indoor_sport: { color: '#5B7F9E', fade: 'rgba(91, 127, 158, 0.3)', label: '室內運動', placeholder: '/images/placeholders/quest.png' },
  shopping:     { color: '#E07A5F', fade: 'rgba(224, 122, 95, 0.3)', label: '逛街', placeholder: '/images/placeholders/shop.png' },
  park:         { color: '#7FA37A', fade: 'rgba(127, 163, 122, 0.3)', label: '公園', placeholder: '/images/placeholders/scenery.png' },
  outdoor:      { color: '#6FA88E', fade: 'rgba(111, 168, 142, 0.3)', label: '戶外景點', placeholder: '/images/placeholders/scenery.png' },
  hiking:       { color: '#5C8A5C', fade: 'rgba(92, 138, 92, 0.3)', label: '爬山步道', placeholder: '/images/placeholders/scenery.png' },
  temple:       { color: '#B5502F', fade: 'rgba(181, 80, 47, 0.3)', label: '廟宇', placeholder: '/images/placeholders/oldshop.png' },
  night_market: { color: '#CC5B45', fade: 'rgba(204, 91, 69, 0.3)', label: '夜市', placeholder: '/images/placeholders/food.png' },
  daytrip:      { color: '#4E7A8C', fade: 'rgba(78, 122, 140, 0.3)', label: '郊區一日遊', placeholder: '/images/placeholders/scenery.png' },
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

export function filterPlaces(
  places: PlaceEntry[],
  category: string,
  season: string,
  search: string = ''
): PlaceEntry[] {
  const q = search.trim().toLowerCase();
  return places.filter(p => {
    const matchCat = category === 'all' || p.category === category;
    const matchSeason = season === 'all' || (p.seasons && p.seasons.includes(season));
    const matchSearch = !q || [p.name, p.address, p.mrt_station, p.note].some(
      v => v && v.toLowerCase().includes(q)
    );
    return matchCat && matchSeason && matchSearch;
  });
}
