import { PlaceEntry, Visit } from '../../shared/types';

export interface PhotoItem {
  handle: unknown;
  file: File;
  previewUrl: string;
  savedName?: string;
}

export function toggleSeason(s: string): void {
  if (s === 'all') {
    const currentlyAll = state.selSeasons.length === 4;
    state.selSeasons = currentlyAll ? [] : ['spring', 'summer', 'autumn', 'winter'];
    document.querySelectorAll('.season-btn[data-v]:not([data-v="all"])')
      .forEach((b) => (b as HTMLElement).classList.toggle('on', !currentlyAll));
    document.querySelector('.season-btn[data-v="all"]')?.classList.toggle('on', !currentlyAll);
    return;
  }
  const idx = state.selSeasons.indexOf(s);
  if (idx > -1) state.selSeasons.splice(idx, 1); else state.selSeasons.push(s);
  document.querySelector(`.season-btn[data-v="${s}"]`)?.classList.toggle('on');
  document.querySelector('.season-btn[data-v="all"]')
    ?.classList.toggle('on', state.selSeasons.length === 4);
}

export const state = {
  selCat: 'food',
  selSt: 'pending' as 'pending' | 'done',
  selRate: 0,
  selSeasons: [] as string[],
  currentVisits: [] as Visit[],
  fileHandle: null as unknown,
  imgDirHandle: null as unknown,
  selectedPhotos: [] as PhotoItem[],
  cachedPlaces: [] as PlaceEntry[],
  editingId: null as number | null,
};
