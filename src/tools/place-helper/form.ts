import { PlaceEntry } from '../../shared/types';
import { state } from './state';
import { toast } from './ui';

export function buildEntry(): PlaceEntry | null {
  const name = (document.getElementById('f-name') as HTMLInputElement).value.trim();
  const lat = parseFloat((document.getElementById('f-lat') as HTMLInputElement).value);
  const lng = parseFloat((document.getElementById('f-lng') as HTMLInputElement).value);
  const desc = (document.getElementById('f-desc') as HTMLTextAreaElement).value.trim();
  const why = (document.getElementById('f-why') as HTMLTextAreaElement).value.trim();
  const time = (document.getElementById('f-time') as HTMLInputElement).value.trim();
  const added = (document.getElementById('f-added') as HTMLInputElement).value.trim();
  const addr = (document.getElementById('f-addr') as HTMLInputElement).value.trim();
  const trivia = (document.getElementById('f-trivia') as HTMLTextAreaElement).value.trim();

  if (!name) { toast('請填寫地點名稱'); return null; }
  if (isNaN(lat) || isNaN(lng)) { toast('請先搜尋地址，或點擊地圖選取位置'); return null; }

  const obj: PlaceEntry = {
    id: Date.now(),
    name,
    category: state.selCat,
    lat,
    lng,
    status: state.selSt,
  };

  if (desc) obj.description = desc;
  if (addr) obj.address = addr;
  if (trivia) obj.trivia = trivia;
  if (why) obj.why = why;
  if (time) obj.best_time = time;
  if (added) obj.added = added;
  if (state.selRate > 0) obj.rating = state.selRate;
  if (state.selSeasons.length > 0) obj.seasons = state.selSeasons;

  if (state.selSt === 'done' && state.currentVisits.length > 0) {
    obj.visits = state.currentVisits;
    const last = state.currentVisits[state.currentVisits.length - 1];
    obj.done_note = last.note;
    obj.done_date = last.date;
  }

  if (state.selectedPhotos.length > 0) {
    obj.photos = state.selectedPhotos.map(p => `/images/places/${p.savedName || 'temp-' + p.file.name}`);
  }

  return obj;
}
