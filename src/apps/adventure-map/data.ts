import { PlaceEntry } from '../../shared/types';

export interface CategoryConfig {
  color: string;
  fade: string;
  label: string;
  placeholder: string;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  food:    { color: '#C47B5A', fade: 'rgba(196, 123, 90, 0.3)', label: '美食', placeholder: '/images/placeholders/food.png' },
  scenery: { color: '#81B29A', fade: 'rgba(129, 178, 154, 0.3)', label: '風景', placeholder: '/images/placeholders/scenery.png' },
  oldshop: { color: '#D4A853', fade: 'rgba(212, 168, 83, 0.3)', label: '老店', placeholder: '/images/placeholders/oldshop.png' },
  walk:    { color: '#7B8CDE', fade: 'rgba(123, 140, 222, 0.3)', label: '散步', placeholder: '/images/placeholders/walk.png' },
  cafe:    { color: '#A67B5B', fade: 'rgba(166, 123, 91, 0.3)', label: '咖啡', placeholder: '/images/placeholders/cafe.png' },
  shop:    { color: '#E07A5F', fade: 'rgba(224, 122, 95, 0.3)', label: '購物', placeholder: '/images/placeholders/shop.png' },
  stay:    { color: '#3D5A80', fade: 'rgba(61, 90, 128, 0.3)', label: '住宿', placeholder: '/images/placeholders/stay.png' },
  quest:   { color: '#9B72AA', fade: 'rgba(155, 114, 170, 0.3)', label: '破關任務', placeholder: '/images/placeholders/quest.png' },
};

export function getPlacesData(): PlaceEntry[] {
  return (window as any).PLACES_DATA || [];
}

export function filterPlaces(
  places: PlaceEntry[],
  category: string,
  season: string
): PlaceEntry[] {
  return places.filter(p => {
    const matchCat = category === 'all' || p.category === category;
    const matchSeason = season === 'all' || (p.seasons && p.seasons.includes(season));
    return matchCat && matchSeason;
  });
}

export function calculateStats(places: PlaceEntry[]) {
  const total = places.length;
  const done = places.filter(p => p.status === 'done').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}
