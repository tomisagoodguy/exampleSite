import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG } from './data';
import { IDENTITIES, Identity, Trip } from './supabase';
import { navQuery } from './ui';

/**
 * 旅行美食地圖：以這趟懶人包的各站為中心，找出附近存過的地點（Trip.area_prefix 地區內），
 * 標出離哪一站多遠；兩個人可依距離、分類、行政區、誰想去篩選，並直接按「想去」（沿用 dating_map_toggle_like）。
 */

/** 地圖上的分類色：CATEGORY_CONFIG 的吃／咖啡甜點顏色太接近，地圖另用一組分得開的顏色 */
const MARKER_COLOR: Record<string, string> = {
  food: '#d9480f',
  cafe: '#8d5a2b',
  shop: '#d6336c',
  walk: '#0c8599',
  museum: '#7048e8',
  diy: '#1971c2',
  scenery: '#2b8a3e',
  stay: '#495057',
  quest: '#f08c00',
};
const FALLBACK_COLOR = '#868e96';
const STOP_COLOR = '#1c2930';

/** 預設的「吃」＝吃＋咖啡甜點 */
const EAT_CATS = ['food', 'cafe'];
const RADIUS_OPTIONS = [500, 1000, 2000];
const DEFAULT_RADIUS = 1000;

const STATUS_TEXT: Record<PlaceEntry['status'], string> = {
  idea: '',
  proposed: '🗳️ 提案中',
  confirmed: '🧭 已排進行程',
  done: '✅ 去過了',
};

type LikeFilter = 'all' | Identity | 'both' | 'none';

/** 懶人包裡有座標的一站 */
export interface TripStop {
  placeId: number;
  label: string;
  day: number;
  lat: number;
  lng: number;
}

export interface TripMapOptions {
  trip: Trip;
  /** 已依 area_prefix 篩過、有座標的地點 */
  places: PlaceEntry[];
  /** 這趟懶人包排到、有座標的站，依天數與站序排好 */
  stops: TripStop[];
  /** 按「想去」：回傳更新後的地點，失敗或取消回傳 null */
  onToggleLike: (place: PlaceEntry) => Promise<PlaceEntry | null>;
}

interface Nearest {
  stop: TripStop;
  meters: number;
}

function esc(text: string | null | undefined): string {
  return (text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

const district = (p: PlaceEntry) => (p.area || '').slice(3) || '其他';

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

const formatDistance = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} 公尺` : `${(m / 1000).toFixed(1).replace(/\.0$/, '')} 公里`;

export function openTripMap(opts: TripMapOptions): void {
  const places = opts.places.map((p) => ({ ...p, liked_by: p.liked_by || [] }));
  const stopIds = new Set(opts.stops.map((s) => s.placeId));
  const stopPlaces = places.filter((p) => stopIds.has(p.id));
  const others = places.filter((p) => !stopIds.has(p.id));
  const hasStops = opts.stops.length > 0;

  // 每個非行程站的地點離最近的一站多遠；這趟沒有站就不算距離
  const nearest = new Map<number, Nearest>();
  if (hasStops) {
    others.forEach((p) => {
      let best: Nearest | null = null;
      for (const stop of opts.stops) {
        const meters = haversine(p.lat as number, p.lng as number, stop.lat, stop.lng);
        if (!best || meters < best.meters) best = { stop, meters };
      }
      if (best) nearest.set(p.id, best);
    });
  }

  const cats = Object.keys(CATEGORY_CONFIG).filter((k) => others.some((p) => p.category === k));
  const districts = [...new Set(others.map(district))].sort(
    (a, b) => others.filter((p) => district(p) === b).length - others.filter((p) => district(p) === a).length
  );

  let cat = cats.some((k) => EAT_CATS.includes(k)) ? 'eat' : 'all';
  let like: LikeFilter = 'all';
  let area = 'all';
  let radius = hasStops ? DEFAULT_RADIUS : 0;
  let view: 'map' | 'list' = 'map';

  const overlay = document.createElement('div');
  overlay.className = 'adv-tripmap';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${opts.trip.title} 美食地圖`);
  overlay.innerHTML = `
    <header class="adv-tripmap__head">
      <div class="adv-tripmap__title">
        <strong>🗺️ ${esc(opts.trip.title)}</strong>
        <span class="adv-tripmap__count" aria-live="polite"></span>
      </div>
      <div class="adv-tripmap__head-actions">
        <button type="button" class="adv-tripmap__chip" data-view-toggle aria-pressed="false">📋 清單</button>
        <button type="button" class="adv-tripmap__close" aria-label="關閉地圖">✕</button>
      </div>
    </header>
    <div class="adv-tripmap__filters">
      ${hasStops ? `
      <div class="adv-tripmap__row" role="group" aria-label="離行程站多遠">
        <span class="adv-tripmap__label" title="地圖上白底黑框的圓點是行程站">離行程站 ◯</span>
        ${RADIUS_OPTIONS.map((r) => `<button type="button" class="adv-tripmap__chip" data-radius="${r}">${formatDistance(r)}內</button>`).join('')}
        <button type="button" class="adv-tripmap__chip" data-radius="0">不限</button>
      </div>` : ''}
      <div class="adv-tripmap__row" role="group" aria-label="依分類篩選">
        ${cats.some((k) => EAT_CATS.includes(k)) ? `<button type="button" class="adv-tripmap__chip" data-cat="eat">🍜 吃＋咖啡甜點</button>` : ''}
        <button type="button" class="adv-tripmap__chip" data-cat="all">全部分類</button>
        ${cats.map((k) => `<button type="button" class="adv-tripmap__chip" data-cat="${k}" style="--chip:${MARKER_COLOR[k] || FALLBACK_COLOR}"><i></i>${esc(CATEGORY_CONFIG[k].label)}</button>`).join('')}
      </div>
      <div class="adv-tripmap__row" role="group" aria-label="依誰想去篩選">
        <button type="button" class="adv-tripmap__chip" data-like="all">不限</button>
        ${IDENTITIES.map((id) => `<button type="button" class="adv-tripmap__chip" data-like="${id}">❤️ ${id}想去</button>`).join('')}
        <button type="button" class="adv-tripmap__chip" data-like="both">💞 兩個都想去</button>
        <button type="button" class="adv-tripmap__chip" data-like="none">還沒人按</button>
        <select class="adv-tripmap__select" id="adv-tripmap-area" aria-label="依行政區篩選">
          <option value="all">全部行政區</option>
          ${districts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="adv-tripmap__map"></div>
    <div class="adv-tripmap__list" hidden></div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('adv-tripmap-open');

  const mapEl = overlay.querySelector('.adv-tripmap__map') as HTMLElement;
  const listEl = overlay.querySelector('.adv-tripmap__list') as HTMLElement;
  const countEl = overlay.querySelector('.adv-tripmap__count') as HTMLElement;
  const map = L.map(mapEl, { zoomControl: true, maxZoom: 16 }).setView([22.995, 120.2], 13);
  // 淺灰底圖（Esri，不用金鑰，路名已在底圖上）：OSM 預設圖磚滿是廟宇、店家圖示，我們的點會被淹沒；CARTO 已改成要金鑰。
  // 不疊 World_Light_Gray_Reference：大比例尺時區名會被放大成整片模糊字
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const markers = new Map<number, L.CircleMarker>();

  const matches = (p: PlaceEntry) => {
    const likes = p.liked_by || [];
    if (cat === 'eat' && !EAT_CATS.includes(p.category)) return false;
    if (cat !== 'eat' && cat !== 'all' && p.category !== cat) return false;
    if (area !== 'all' && district(p) !== area) return false;
    if (radius && (nearest.get(p.id)?.meters ?? Infinity) > radius) return false;
    if (like === 'both') return IDENTITIES.every((id) => likes.includes(id));
    if (like === 'none') return likes.length === 0;
    if (like !== 'all') return likes.includes(like);
    return true;
  };

  const stopOf = (p: PlaceEntry) => opts.stops.find((s) => s.placeId === p.id);
  const nearText = (p: PlaceEntry) => {
    const stop = stopOf(p);
    if (stop) return `📚 Day ${stop.day} 行程站`;
    const n = nearest.get(p.id);
    return n ? `離 Day ${n.stop.day}「${n.stop.label}」${formatDistance(n.meters)}` : '';
  };
  const likesText = (p: PlaceEntry) => {
    const likes = p.liked_by || [];
    return likes.length ? `❤️ ${likes.map(esc).join('、')}想去` : '還沒有人按想去';
  };

  const popupHTML = (p: PlaceEntry) => {
    const status = STATUS_TEXT[p.status];
    const near = nearText(p);
    return `
      <div class="adv-tripmap__pop">
        <strong>${esc(p.name)}</strong>
        <div class="adv-tripmap__pop-meta">${esc(CATEGORY_CONFIG[p.category]?.label || p.category)} · ${esc(district(p))}${status ? ` · ${status}` : ''}</div>
        ${near ? `<div class="adv-tripmap__pop-near">${esc(near)}</div>` : ''}
        ${p.note ? `<p>${esc(p.note)}</p>` : ''}
        <div class="adv-tripmap__pop-likes">${likesText(p)}</div>
        <div class="adv-tripmap__pop-actions">
          <button type="button" data-like-id="${p.id}">❤️ 想去／取消</button>
          <a href="https://www.google.com/maps?q=${navQuery(p)}" target="_blank" rel="noopener">📍 Google 地圖</a>
        </div>
      </div>
    `;
  };

  const toggleLike = async (p: PlaceEntry, btn: HTMLButtonElement) => {
    btn.disabled = true;
    const saved = await opts.onToggleLike(p);
    if (!saved) {
      btn.disabled = false;
      return;
    }
    p.liked_by = saved.liked_by || [];
    map.closePopup();
    draw(false);
  };

  const addMarker = (p: PlaceEntry, isStop: boolean) => {
    const both = IDENTITIES.every((id) => (p.liked_by || []).includes(id));
    const marker = L.circleMarker([p.lat as number, p.lng as number], isStop
      ? { radius: 6, color: STOP_COLOR, weight: 3, fillColor: '#fff', fillOpacity: 1 }
      : {
          radius: both ? 11 : 8,
          color: both ? '#f59f00' : '#fff',
          weight: both ? 3 : 2,
          fillColor: MARKER_COLOR[p.category] || FALLBACK_COLOR,
          fillOpacity: 0.9,
        })
      .bindPopup(() => popupHTML(p), { maxWidth: 260 })
      .bindTooltip(isStop ? `📚 ${p.name}` : p.name, { direction: 'top', offset: [0, -6] })
      .addTo(layer)
      .on('popupopen', (e) => {
        const btn = e.popup.getElement()?.querySelector<HTMLButtonElement>('[data-like-id]');
        btn?.addEventListener('click', () => toggleLike(p, btn));
      });
    markers.set(p.id, marker);
  };

  const listHTML = (shown: PlaceEntry[]) => {
    if (!shown.length) return `<p class="adv-empty">沒有符合的地點，放寬距離或分類試試</p>`;
    return shown
      .map((p) => `
        <div class="adv-tripmap__item" style="--chip:${MARKER_COLOR[p.category] || FALLBACK_COLOR}">
          <div class="adv-tripmap__item-main">
            <strong><i></i>${esc(p.name)}</strong>
            <span class="adv-tripmap__pop-near">${esc(nearText(p))}</span>
            <span class="adv-tripmap__pop-meta">${esc(CATEGORY_CONFIG[p.category]?.label || p.category)} · ${esc(district(p))} · ${likesText(p)}</span>
            ${p.note ? `<span class="adv-tripmap__item-note">${esc(p.note)}</span>` : ''}
          </div>
          <div class="adv-tripmap__pop-actions">
            <button type="button" data-list-like="${p.id}">❤️ 想去／取消</button>
            <button type="button" data-list-show="${p.id}">🗺️ 地圖上看</button>
          </div>
        </div>
      `)
      .join('');
  };

  /** fit：篩選條件改了才重新縮放；按想去只重畫，不跳動畫面 */
  const draw = (fit = true) => {
    layer.clearLayers();
    markers.clear();
    const shown = others
      .filter(matches)
      .sort((a, b) => (nearest.get(a.id)?.meters ?? 0) - (nearest.get(b.id)?.meters ?? 0));
    stopPlaces.forEach((p) => addMarker(p, true));
    shown.forEach((p) => addMarker(p, false));

    countEl.textContent = `${shown.length} 個點${radius ? `・行程站 ${formatDistance(radius)}內` : ''}`;

    listEl.innerHTML = listHTML(shown);
    listEl.querySelectorAll<HTMLButtonElement>('[data-list-like]').forEach((btn) => {
      const p = shown.find((x) => x.id === Number(btn.dataset.listLike));
      if (p) btn.addEventListener('click', () => toggleLike(p, btn));
    });
    listEl.querySelectorAll<HTMLButtonElement>('[data-list-show]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const marker = markers.get(Number(btn.dataset.listShow));
        if (!marker) return;
        setView('map');
        map.setView(marker.getLatLng(), 16);
        marker.openPopup();
      });
    });

    const bounds = [...shown, ...(area === 'all' ? stopPlaces : [])].map((p) => [p.lat as number, p.lng as number] as [number, number]);
    if (fit && bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 });
  };

  const setView = (next: 'map' | 'list') => {
    view = next;
    mapEl.hidden = view === 'list';
    listEl.hidden = view === 'map';
    const toggle = overlay.querySelector<HTMLElement>('[data-view-toggle]');
    if (toggle) {
      toggle.textContent = view === 'map' ? '📋 清單' : '🗺️ 地圖';
      toggle.setAttribute('aria-pressed', String(view === 'list'));
    }
    if (view === 'map') map.invalidateSize();
  };

  const syncChips = () => {
    overlay.querySelectorAll<HTMLElement>('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
    overlay.querySelectorAll<HTMLElement>('[data-like]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.like === like)));
    overlay.querySelectorAll<HTMLElement>('[data-radius]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.radius) === radius)));
  };

  overlay.querySelectorAll<HTMLElement>('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      cat = b.dataset.cat || 'all';
      syncChips();
      draw();
    })
  );
  overlay.querySelectorAll<HTMLElement>('[data-like]').forEach((b) =>
    b.addEventListener('click', () => {
      like = (b.dataset.like === like ? 'all' : b.dataset.like || 'all') as LikeFilter;
      syncChips();
      draw();
    })
  );
  overlay.querySelectorAll<HTMLElement>('[data-radius]').forEach((b) =>
    b.addEventListener('click', () => {
      radius = Number(b.dataset.radius) || 0;
      syncChips();
      draw();
    })
  );
  overlay.querySelector<HTMLSelectElement>('#adv-tripmap-area')?.addEventListener('change', (e) => {
    area = (e.target as HTMLSelectElement).value;
    draw();
  });
  overlay.querySelector('[data-view-toggle]')?.addEventListener('click', () => setView(view === 'map' ? 'list' : 'map'));

  const close = () => {
    map.remove();
    overlay.remove();
    document.body.classList.remove('adv-tripmap-open');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  overlay.querySelector('.adv-tripmap__close')?.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  syncChips();
  // overlay 剛插入時尺寸還沒算好，等下一幀再畫才不會只出現一角地圖
  requestAnimationFrame(() => {
    map.invalidateSize();
    draw();
  });
}
