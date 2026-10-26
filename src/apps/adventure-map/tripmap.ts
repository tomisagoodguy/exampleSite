import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG } from './data';
import { IDENTITIES, Identity, Trip } from './supabase';
import { navQuery } from './ui';

/**
 * 旅行導覽地圖：依懶人包把這趟的行程站編號，每天畫成一條有箭頭的路線（可播放），
 * 並以行程站為中心列出附近存過的「吃的」和「可以逛的」（Trip.area_prefix 地區內）。
 * 點行程站會跳出附近資訊卡；📍 顯示自己的位置，當天邊走邊換地點用。按「想去」沿用 dating_map_toggle_like。
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

/** 每天的路線色；前三天和旅行介紹頁的三天配色一致。破關地圖只用淺色，不跟站台夜間模式切換 */
const DAY_COLORS = ['#11717c', '#a8620f', '#3a7536', '#7048e8', '#c2255c'];
const dayColor = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length];

/** 圖層：行程站（含住宿等其他）、吃的、可以逛的 */
type LayerKey = 'stops' | 'eat' | 'see';
const LAYER_LABEL: Record<LayerKey, string> = { stops: '⭐ 行程站', eat: '🍴 吃的', see: '👀 可以逛的' };
const EAT_CATS = ['food', 'cafe'];
const SEE_CATS = ['museum', 'walk', 'shop', 'diy', 'scenery'];
const layerOf = (p: PlaceEntry): LayerKey =>
  EAT_CATS.includes(p.category) ? 'eat' : SEE_CATS.includes(p.category) ? 'see' : 'stops';

const RADIUS_OPTIONS = [500, 1000, 2000];
const DEFAULT_RADIUS = 500;
/** 播放：每段路線畫多久、到站後停多久 */
const SEGMENT_MS = 900;
const PAUSE_MS = 1600;
/** 太短的一段（同一棟的兩家店）不畫箭頭 */
const MIN_ARROW_METERS = 150;
/** 行程站編號在畫面上靠得比這近（px）就攤開 */
const SPREAD_PX = 26;
const STOP_ICON = 28;

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
  /** 第幾條路線（懶人包順序），分線、編號、配色用 */
  day: number;
  /** 畫面上顯示的天數，例如「Day 2」；同一天兩條路線時是「Day 3 A」 */
  dayLabel: string;
  /** 時段（早上、下午…），沒寫就沿用前一站 */
  period: string | null;
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
  /** 在這個地點記一筆公帳（帶入這趟與地點）；表單蓋在地圖上，記完回到地圖 */
  onAddExpense: (place: PlaceEntry) => void;
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
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} 公尺` : `${(m / 1000).toFixed(1).replace(/\.0$/, '')} 公里`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function openTripMap(opts: TripMapOptions): void {
  const places = opts.places.map((p) => ({ ...p, liked_by: p.liked_by || [] }));
  const byId = new Map(places.map((p) => [p.id, p]));
  const stops = opts.stops;
  const days = [...new Set(stops.map((s) => s.day))].sort((a, b) => a - b);
  const dayLabelOf = (d: number) => stops.find((s) => s.day === d)?.dayLabel ?? `Day ${d}`;
  const stopIds = new Set(stops.map((s) => s.placeId));
  const others = places.filter((p) => !stopIds.has(p.id));
  const hasStops = stops.length > 0;
  /** 同一天第幾站（1 起算） */
  const stopNo = (s: TripStop) => stops.filter((x) => x.day === s.day).indexOf(s) + 1;

  const districts = [...new Set(others.map(district))].sort(
    (a, b) => others.filter((p) => district(p) === b).length - others.filter((p) => district(p) === a).length
  );

  let day = 0; // 0＝全部天數
  const layers: Record<LayerKey, boolean> = { stops: true, eat: true, see: true };
  let like: LikeFilter = 'all';
  let area = 'all';
  let radius = hasStops ? DEFAULT_RADIUS : 0;
  let view: 'map' | 'list' = 'map';
  let playToken = 0; // 每次播放／停止加一，舊的播放迴圈看到不同就收手
  let watchId: number | null = null;
  let me: L.LatLng | null = null;

  const activeStops = () => (day ? stops.filter((s) => s.day === day) : stops);

  const overlay = document.createElement('div');
  overlay.className = 'adv-tripmap';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${opts.trip.title} 行程地圖`);
  overlay.innerHTML = `
    <header class="adv-tripmap__head">
      <div class="adv-tripmap__title">
        <strong>🗺️ ${esc(opts.trip.title)}</strong>
        <span class="adv-tripmap__count" aria-live="polite"></span>
      </div>
      <div class="adv-tripmap__head-actions">
        <button type="button" class="adv-tripmap__chip" data-locate aria-pressed="false" title="顯示我現在的位置">📍 我在哪</button>
        <button type="button" class="adv-tripmap__chip" data-view-toggle aria-pressed="false">📋 清單</button>
        <button type="button" class="adv-tripmap__close" aria-label="關閉地圖">✕</button>
      </div>
    </header>
    <div class="adv-tripmap__filters">
      ${hasStops ? `
      <div class="adv-tripmap__row" role="group" aria-label="看哪一天">
        <button type="button" class="adv-tripmap__chip" data-day="0">全部天數</button>
        ${days.map((d) => `<button type="button" class="adv-tripmap__chip" data-day="${d}" style="--chip:${dayColor(d)}"><i></i>${esc(dayLabelOf(d))}</button>`).join('')}
        <button type="button" class="adv-tripmap__chip adv-tripmap__play" data-play>▶ 播放路線</button>
      </div>` : ''}
      <div class="adv-tripmap__row" role="group" aria-label="地圖上顯示什麼">
        ${(Object.keys(LAYER_LABEL) as LayerKey[]).filter((k) => k !== 'stops' || hasStops).map((k) => `<button type="button" class="adv-tripmap__chip" data-layer="${k}">${LAYER_LABEL[k]}</button>`).join('')}
        ${hasStops ? `
        <span class="adv-tripmap__label" title="只顯示離行程站多近的地點">離行程站</span>
        ${RADIUS_OPTIONS.map((r) => `<button type="button" class="adv-tripmap__chip" data-radius="${r}">${formatDistance(r)}內</button>`).join('')}
        <button type="button" class="adv-tripmap__chip" data-radius="0">不限</button>` : ''}
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
    <div class="adv-tripmap__stage">
      <div class="adv-tripmap__map"></div>
      <section class="adv-tripmap__card" aria-live="polite" hidden></section>
    </div>
    <div class="adv-tripmap__list" hidden></div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('adv-tripmap-open');

  const stageEl = overlay.querySelector('.adv-tripmap__stage') as HTMLElement;
  const mapEl = overlay.querySelector('.adv-tripmap__map') as HTMLElement;
  const cardEl = overlay.querySelector('.adv-tripmap__card') as HTMLElement;
  const listEl = overlay.querySelector('.adv-tripmap__list') as HTMLElement;
  const countEl = overlay.querySelector('.adv-tripmap__count') as HTMLElement;
  const playBtn = overlay.querySelector<HTMLButtonElement>('[data-play]');
  const locateBtn = overlay.querySelector('[data-locate]') as HTMLButtonElement;
  const map = L.map(mapEl, { zoomControl: true, maxZoom: 17 }).setView([22.995, 120.2], 13);
  // 淺灰底圖（Esri，不用金鑰，路名已在底圖上）：OSM 預設圖磚滿是廟宇、店家圖示，我們的點會被淹沒；CARTO 已改成要金鑰。
  // 不疊 World_Light_Gray_Reference：大比例尺時區名會被放大成整片模糊字
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 17,
    maxNativeZoom: 16,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
  }).addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const placeLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const meLayer = L.layerGroup().addTo(map);
  const placeMarkers = new Map<number, L.CircleMarker>();
  const stopMarkers = new Map<TripStop, L.Marker>();

  /** 地點離「目前看的那幾天」最近的一站 */
  const nearestOf = (p: PlaceEntry): Nearest | null => {
    let best: Nearest | null = null;
    for (const stop of activeStops()) {
      const meters = haversine(p.lat as number, p.lng as number, stop.lat, stop.lng);
      if (!best || meters < best.meters) best = { stop, meters };
    }
    return best;
  };

  const matches = (p: PlaceEntry, nearest: Nearest | null) => {
    const likes = p.liked_by || [];
    if (!layers[layerOf(p)]) return false;
    if (area !== 'all' && district(p) !== area) return false;
    if (radius && (nearest?.meters ?? Infinity) > radius) return false;
    if (like === 'both') return IDENTITIES.every((id) => likes.includes(id));
    if (like === 'none') return likes.length === 0;
    if (like !== 'all') return likes.includes(like);
    return true;
  };

  const stopTitle = (s: TripStop) => `${s.dayLabel} 第 ${stopNo(s)} 站${s.period ? `・${s.period}` : ''}`;
  const nearText = (p: PlaceEntry) => {
    const stop = stops.find((s) => s.placeId === p.id);
    if (stop) return `⭐ ${stopTitle(stop)}`;
    const n = nearestOf(p);
    return n ? `離 ${n.stop.dayLabel}「${n.stop.label}」${formatDistance(n.meters)}` : '';
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
          <button type="button" data-spend-id="${p.id}">💰 記一筆</button>
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

  // 所有彈窗（地圖點、資訊卡點開的）共用：按「想去」
  map.on('popupopen', (e) => {
    const btn = e.popup.getElement()?.querySelector<HTMLButtonElement>('[data-like-id]');
    const p = btn ? byId.get(Number(btn.dataset.likeId)) : undefined;
    if (btn && p) btn.addEventListener('click', () => toggleLike(p, btn));
    const spendBtn = e.popup.getElement()?.querySelector<HTMLButtonElement>('[data-spend-id]');
    const sp = spendBtn ? byId.get(Number(spendBtn.dataset.spendId)) : undefined;
    if (spendBtn && sp) spendBtn.addEventListener('click', () => opts.onAddExpense(sp));
  });

  const showPlace = (p: PlaceEntry) => {
    setView('map');
    map.setView([p.lat as number, p.lng as number], Math.max(map.getZoom(), 16));
    const marker = placeMarkers.get(p.id);
    if (marker) marker.openPopup();
    else L.popup({ maxWidth: 260 }).setLatLng([p.lat as number, p.lng as number]).setContent(popupHTML(p)).openOn(map);
  };

  const addPlaceMarker = (p: PlaceEntry) => {
    const both = IDENTITIES.every((id) => (p.liked_by || []).includes(id));
    const marker = L.circleMarker([p.lat as number, p.lng as number], {
      radius: both ? 10 : 7,
      color: both ? '#f59f00' : '#fff',
      weight: both ? 3 : 2,
      fillColor: MARKER_COLOR[p.category] || FALLBACK_COLOR,
      fillOpacity: 0.9,
    })
      .bindPopup(() => popupHTML(p), { maxWidth: 260 })
      .bindTooltip(`${layerOf(p) === 'eat' ? '🍴' : layerOf(p) === 'see' ? '👀' : ''} ${p.name}`, { direction: 'top', offset: [0, -6] })
      .addTo(placeLayer);
    placeMarkers.set(p.id, marker);
  };

  const addStopMarker = (s: TripStop) => {
    const marker = L.marker([s.lat, s.lng], {
      icon: L.divIcon({
        className: 'adv-tripmap__num',
        html: `<span style="--day:${dayColor(s.day)}">${stopNo(s)}</span>`,
        iconSize: [STOP_ICON, STOP_ICON],
        iconAnchor: [STOP_ICON / 2, STOP_ICON / 2],
      }),
      zIndexOffset: 1000,
      keyboard: true,
      title: `${stopTitle(s)}：${s.label}`,
    })
      .on('click', () => showCard(s))
      .addTo(stopLayer);
    stopMarkers.set(s, marker);
  };

  /** 一段路線中間的箭頭；用投影後的座標算角度，縮放時方向不變 */
  const addArrow = (a: TripStop, b: TripStop) => {
    if (haversine(a.lat, a.lng, b.lat, b.lng) < MIN_ARROW_METERS) return;
    const p1 = map.project([a.lat, a.lng], 15);
    const p2 = map.project([b.lat, b.lng], 15);
    const deg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
      icon: L.divIcon({
        className: 'adv-tripmap__arrow',
        html: `<span style="--day:${dayColor(a.day)};transform:rotate(${deg}deg)">➤</span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(routeLayer);
  };

  const routeLine = (d: number) =>
    L.polyline([], { color: dayColor(d), weight: 4, opacity: 0.85, lineJoin: 'round', interactive: false }).addTo(routeLayer);

  const drawRoutes = () => {
    routeLayer.clearLayers();
    if (!layers.stops) return;
    (day ? [day] : days).forEach((d) => {
      const list = stops.filter((s) => s.day === d);
      routeLine(d).setLatLngs(list.map((s) => [s.lat, s.lng] as [number, number]));
      list.slice(1).forEach((s, i) => addArrow(list[i], s));
    });
  };

  /** 老城區幾站只差幾十公尺，編號會疊成一團點不到：畫面上靠太近的就往左右攤開（路線端點不動） */
  const spreadStops = () => {
    const items = [...stopMarkers.values()].map((m) => ({ m, pt: map.latLngToContainerPoint(m.getLatLng()) }));
    const seen = new Set<L.Marker>();
    items.forEach((a) => {
      if (seen.has(a.m)) return;
      const group = items.filter((b) => !seen.has(b.m) && a.pt.distanceTo(b.pt) < SPREAD_PX);
      group.forEach((b, i) => {
        seen.add(b.m);
        // 改外層的 margin（Leaflet 用它對齊 iconAnchor），點擊範圍才會跟著移
        const el = b.m.getElement();
        if (el) el.style.marginLeft = `${-STOP_ICON / 2 + (group.length > 1 ? (i - (group.length - 1) / 2) * SPREAD_PX : 0)}px`;
      });
    });
  };
  map.on('zoomend', spreadStops);

  const setCurrent = (s: TripStop | null) => {
    stopMarkers.forEach((m, key) => m.getElement()?.classList.toggle('is-current', key === s));
  };

  /** 行程站附近的地點，依目前圖層、誰想去篩選；沒選距離時用預設 500 公尺 */
  const nearbyOf = (s: TripStop, key: 'eat' | 'see') => {
    const r = radius || DEFAULT_RADIUS;
    return others
      .filter((p) => layerOf(p) === key)
      .map((p) => ({ p, m: haversine(s.lat, s.lng, p.lat as number, p.lng as number) }))
      .filter((x) => x.m <= r)
      .sort((a, b) => a.m - b.m);
  };

  const showCard = (s: TripStop) => {
    setCurrent(s);
    const r = radius || DEFAULT_RADIUS;
    const sect = (key: 'eat' | 'see', unit: string) => {
      const list = nearbyOf(s, key);
      return `
        <div class="adv-tripmap__card-sect">
          <strong>${LAYER_LABEL[key]}<small>${list.length ? `${formatDistance(r)}內 ${list.length} ${unit}` : `${formatDistance(r)}內沒有存過的`}</small></strong>
          ${list.length ? `<div class="adv-tripmap__near-list">${list.map(({ p, m }) => `
            <button type="button" class="adv-tripmap__near-chip" data-focus="${p.id}" style="--chip:${MARKER_COLOR[p.category] || FALLBACK_COLOR}"${p.note ? ` title="${esc(p.note)}"` : ''}>
              <i></i>${esc(p.name)} <small>${formatDistance(m)}${(p.liked_by || []).length ? ' ❤️' : ''}</small>
            </button>`).join('')}</div>` : ''}
        </div>`;
    };
    const place = byId.get(s.placeId);
    cardEl.innerHTML = `
      <div class="adv-tripmap__card-head">
        <span class="adv-tripmap__card-num" style="--day:${dayColor(s.day)}">${stopNo(s)}</span>
        <div class="adv-tripmap__card-title">
          <strong>${esc(s.label)}</strong>
          <small>${esc(stopTitle(s))}</small>
        </div>
        ${place ? '<button type="button" class="adv-tripmap__chip" data-card-spend>💰 記一筆</button>' : ''}
        <button type="button" class="adv-tripmap__card-close" aria-label="關閉資訊卡">✕</button>
      </div>
      ${place?.note ? `<p class="adv-tripmap__card-note">${esc(place.note)}</p>` : ''}
      ${sect('eat', '家')}
      ${sect('see', '個')}
    `;
    cardEl.hidden = false;
    cardEl.querySelector('.adv-tripmap__card-close')?.addEventListener('click', hideCard);
    if (place) cardEl.querySelector('[data-card-spend]')?.addEventListener('click', () => opts.onAddExpense(place));
    cardEl.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const p = byId.get(Number(btn.dataset.focus));
        if (p) showPlace(p);
      })
    );
  };

  const hideCard = () => {
    cardEl.hidden = true;
    setCurrent(null);
  };

  const listHTML = (shown: PlaceEntry[]) => {
    if (!shown.length) return `<p class="adv-empty">沒有符合的地點，放寬距離或打開其他圖層試試</p>`;
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

  const updateCount = (eat: number, see: number) => {
    const parts = [
      day ? dayLabelOf(day) : '',
      layers.stops && hasStops ? `⭐ ${activeStops().length} 站` : '',
      layers.eat ? `🍴 ${eat}` : '',
      layers.see ? `👀 ${see}` : '',
    ].filter(Boolean);
    let meText = '';
    if (me && hasStops) {
      const here = me;
      const closest = activeStops()
        .map((s) => ({ s, m: haversine(here.lat, here.lng, s.lat, s.lng) }))
        .sort((a, b) => a.m - b.m)[0];
      if (closest) meText = `・📍 離「${closest.s.label}」${formatDistance(closest.m)}`;
    }
    countEl.textContent = parts.join('・') + meText;
  };

  /** fit：篩選條件改了才重新縮放；按想去只重畫，不跳動畫面 */
  const draw = (fit = true) => {
    placeLayer.clearLayers();
    stopLayer.clearLayers();
    placeMarkers.clear();
    stopMarkers.clear();
    const nearest = new Map(others.map((p) => [p.id, nearestOf(p)]));
    const shown = others
      .filter((p) => matches(p, nearest.get(p.id) ?? null))
      .sort((a, b) => (nearest.get(a.id)?.meters ?? 0) - (nearest.get(b.id)?.meters ?? 0));
    shown.forEach(addPlaceMarker);
    if (layers.stops) activeStops().forEach(addStopMarker);
    if (!playBtn?.classList.contains('is-playing')) drawRoutes();

    updateCount(shown.filter((p) => layerOf(p) === 'eat').length, shown.filter((p) => layerOf(p) === 'see').length);

    listEl.innerHTML = listHTML(shown);
    listEl.querySelectorAll<HTMLButtonElement>('[data-list-like]').forEach((btn) => {
      const p = byId.get(Number(btn.dataset.listLike));
      if (p) btn.addEventListener('click', () => toggleLike(p, btn));
    });
    listEl.querySelectorAll<HTMLButtonElement>('[data-list-show]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = byId.get(Number(btn.dataset.listShow));
        if (p) showPlace(p);
      });
    });

    const bounds = [
      ...(layers.stops ? activeStops().map((s) => [s.lat, s.lng] as [number, number]) : []),
      ...shown.map((p) => [p.lat as number, p.lng as number] as [number, number]),
    ];
    if (fit && bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 });
    // 縮放沒變時 zoomend 不會觸發，這裡自己攤一次
    spreadStops();
  };

  /** 播放：路線一段一段畫出來，到站時跳出那站的附近資訊卡 */
  const play = async () => {
    const token = ++playToken;
    playBtn?.classList.add('is-playing');
    if (playBtn) playBtn.textContent = '⏹ 停止';
    if (!layers.stops) {
      layers.stops = true;
      syncChips();
      draw();
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = day ? [day] : days;
    routeLayer.clearLayers();
    map.fitBounds(L.latLngBounds(activeStops().map((s) => [s.lat, s.lng] as [number, number])), { padding: [40, 40], maxZoom: 16 });
    for (const d of target) {
      const list = stops.filter((s) => s.day === d);
      if (!list.length) continue;
      const line = routeLine(d);
      const path: L.LatLngExpression[] = [[list[0].lat, list[0].lng]];
      line.setLatLngs(path);
      showCard(list[0]);
      await sleep(PAUSE_MS);
      for (let i = 1; i < list.length; i++) {
        if (token !== playToken) return;
        const a = list[i - 1];
        const b = list[i];
        if (!map.getBounds().contains([b.lat, b.lng])) map.panTo([b.lat, b.lng]);
        if (!reduce) {
          const start = performance.now();
          await new Promise<void>((resolve) => {
            const step = (now: number) => {
              if (token !== playToken) return resolve();
              const t = Math.min(1, (now - start) / SEGMENT_MS);
              const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
              line.setLatLngs([...path, [a.lat + (b.lat - a.lat) * k, a.lng + (b.lng - a.lng) * k]]);
              if (t < 1) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          });
          if (token !== playToken) return;
        }
        path.push([b.lat, b.lng]);
        line.setLatLngs(path);
        addArrow(a, b);
        showCard(b);
        await sleep(PAUSE_MS);
      }
    }
    if (token === playToken) stopPlay();
  };

  const stopPlay = () => {
    playToken++;
    playBtn?.classList.remove('is-playing');
    if (playBtn) playBtn.textContent = '▶ 播放路線';
    drawRoutes();
  };

  const locate = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      me = null;
      meLayer.clearLayers();
      locateBtn.setAttribute('aria-pressed', 'false');
      draw(false);
      return;
    }
    if (!('geolocation' in navigator)) {
      countEl.textContent = '這個瀏覽器不能定位';
      return;
    }
    locateBtn.setAttribute('aria-pressed', 'true');
    let first = true;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        me = L.latLng(pos.coords.latitude, pos.coords.longitude);
        meLayer.clearLayers();
        L.circle(me, { radius: pos.coords.accuracy, color: '#1c7ed6', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(meLayer);
        L.circleMarker(me, { radius: 7, color: '#fff', weight: 3, fillColor: '#1c7ed6', fillOpacity: 1 })
          .bindTooltip('📍 你在這裡', { direction: 'top', offset: [0, -6] })
          .addTo(meLayer);
        if (first) map.setView(me, 16);
        first = false;
        draw(false);
      },
      (err) => {
        countEl.textContent = err.code === err.PERMISSION_DENIED ? '定位被拒絕：到瀏覽器設定允許位置存取' : '暫時抓不到位置，等一下再按一次';
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        locateBtn.setAttribute('aria-pressed', 'false');
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  };

  const setView = (next: 'map' | 'list') => {
    view = next;
    stageEl.hidden = view === 'list';
    listEl.hidden = view === 'map';
    const toggle = overlay.querySelector<HTMLElement>('[data-view-toggle]');
    if (toggle) {
      toggle.textContent = view === 'map' ? '📋 清單' : '🗺️ 地圖';
      toggle.setAttribute('aria-pressed', String(view === 'list'));
    }
    if (view === 'map') map.invalidateSize();
  };

  const syncChips = () => {
    overlay.querySelectorAll<HTMLElement>('[data-day]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.day) === day)));
    overlay.querySelectorAll<HTMLElement>('[data-layer]').forEach((b) => b.setAttribute('aria-pressed', String(layers[b.dataset.layer as LayerKey])));
    overlay.querySelectorAll<HTMLElement>('[data-like]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.like === like)));
    overlay.querySelectorAll<HTMLElement>('[data-radius]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.radius) === radius)));
  };

  overlay.querySelectorAll<HTMLElement>('[data-day]').forEach((b) =>
    b.addEventListener('click', () => {
      stopPlay();
      hideCard();
      day = Number(b.dataset.day) || 0;
      syncChips();
      draw();
    })
  );
  overlay.querySelectorAll<HTMLElement>('[data-layer]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.layer as LayerKey;
      layers[key] = !layers[key];
      if (key === 'stops' && !layers.stops) {
        stopPlay();
        hideCard();
      }
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
  playBtn?.addEventListener('click', () => (playBtn.classList.contains('is-playing') ? stopPlay() : play()));
  locateBtn.addEventListener('click', locate);
  overlay.querySelector('[data-view-toggle]')?.addEventListener('click', () => setView(view === 'map' ? 'list' : 'map'));

  const close = () => {
    playToken++;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    map.remove();
    overlay.remove();
    document.body.classList.remove('adv-tripmap-open');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!cardEl.hidden) hideCard();
    else close();
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
