import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG } from './data';
import { IDENTITIES, Identity, Trip } from './supabase';
import { navQuery } from './ui';

/**
 * 旅行地圖：把某趟旅行地區（Trip.area_prefix）裡存過的地點畫在 Leaflet 上，
 * 兩個人可以依分類、行政區、誰想去篩選，並直接在點上按「想去」（沿用 dating_map_toggle_like）。
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

const STATUS_TEXT: Record<PlaceEntry['status'], string> = {
  idea: '',
  proposed: '🗳️ 提案中',
  confirmed: '🧭 已排進行程',
  done: '✅ 去過了',
};

type LikeFilter = 'all' | Identity | 'both' | 'none';

export interface TripMapOptions {
  trip: Trip;
  /** 已依 area_prefix 篩過、有座標的地點 */
  places: PlaceEntry[];
  /** 這趟懶人包排到的地點 */
  routeIds: Set<number>;
  /** 按「想去」：回傳更新後的地點，失敗或取消回傳 null */
  onToggleLike: (place: PlaceEntry) => Promise<PlaceEntry | null>;
}

function esc(text: string | null | undefined): string {
  return (text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

const district = (p: PlaceEntry) => (p.area || '').slice(3) || '其他';

export function openTripMap(opts: TripMapOptions): void {
  const places = opts.places.map((p) => ({ ...p, liked_by: p.liked_by || [] }));
  const cats = Object.keys(CATEGORY_CONFIG).filter((k) => places.some((p) => p.category === k));
  const districts = [...new Set(places.map(district))].sort(
    (a, b) => places.filter((p) => district(p) === b).length - places.filter((p) => district(p) === a).length
  );

  let cat = 'all';
  let like: LikeFilter = 'all';
  let area = 'all';
  let routeOnly = false;

  const overlay = document.createElement('div');
  overlay.className = 'adv-tripmap';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${opts.trip.title} 地圖`);
  overlay.innerHTML = `
    <header class="adv-tripmap__head">
      <div class="adv-tripmap__title">
        <strong>🗺️ ${esc(opts.trip.title)}</strong>
        <span class="adv-tripmap__count" aria-live="polite"></span>
      </div>
      <button type="button" class="adv-tripmap__close" aria-label="關閉地圖">✕</button>
    </header>
    <div class="adv-tripmap__filters">
      <div class="adv-tripmap__row" role="group" aria-label="依分類篩選">
        <button type="button" class="adv-tripmap__chip" data-cat="all">全部</button>
        ${cats.map((k) => `<button type="button" class="adv-tripmap__chip" data-cat="${k}" style="--chip:${MARKER_COLOR[k] || FALLBACK_COLOR}"><i></i>${esc(CATEGORY_CONFIG[k].label)}</button>`).join('')}
      </div>
      <div class="adv-tripmap__row" role="group" aria-label="依誰想去篩選">
        <button type="button" class="adv-tripmap__chip" data-like="all">不限</button>
        ${IDENTITIES.map((id) => `<button type="button" class="adv-tripmap__chip" data-like="${id}">❤️ ${id}想去</button>`).join('')}
        <button type="button" class="adv-tripmap__chip" data-like="both">💞 兩個都想去</button>
        <button type="button" class="adv-tripmap__chip" data-like="none">還沒人按</button>
      </div>
      <div class="adv-tripmap__row">
        <select class="adv-tripmap__select" id="adv-tripmap-area" aria-label="依行政區篩選">
          <option value="all">全部行政區（${places.length}）</option>
          ${districts.map((d) => `<option value="${esc(d)}">${esc(d)}（${places.filter((p) => district(p) === d).length}）</option>`).join('')}
        </select>
        ${opts.routeIds.size ? `<label class="adv-tripmap__check"><input type="checkbox" id="adv-tripmap-route"> 只看這趟行程排到的點</label>` : ''}
      </div>
    </div>
    <div class="adv-tripmap__map"></div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('adv-tripmap-open');

  const mapEl = overlay.querySelector('.adv-tripmap__map') as HTMLElement;
  const countEl = overlay.querySelector('.adv-tripmap__count') as HTMLElement;
  const map = L.map(mapEl, { zoomControl: true, maxZoom: 16 }).setView([22.995, 120.2], 13);
  // 淺灰底圖（Esri，不用金鑰，路名已在底圖上）：OSM 預設圖磚滿是廟宇、店家圖示，我們的點會被淹沒；CARTO 已改成要金鑰。
  // 不疊 World_Light_Gray_Reference：大比例尺時區名會被放大成整片模糊字
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);

  const matches = (p: PlaceEntry) => {
    const likes = p.liked_by || [];
    if (cat !== 'all' && p.category !== cat) return false;
    if (area !== 'all' && district(p) !== area) return false;
    if (routeOnly && !opts.routeIds.has(p.id)) return false;
    if (like === 'both') return IDENTITIES.every((id) => likes.includes(id));
    if (like === 'none') return likes.length === 0;
    if (like !== 'all') return likes.includes(like);
    return true;
  };

  const popupHTML = (p: PlaceEntry) => {
    const likes = p.liked_by || [];
    const status = STATUS_TEXT[p.status];
    return `
      <div class="adv-tripmap__pop">
        <strong>${esc(p.name)}</strong>
        <div class="adv-tripmap__pop-meta">${esc(CATEGORY_CONFIG[p.category]?.label || p.category)} · ${esc(district(p))}${status ? ` · ${status}` : ''}${opts.routeIds.has(p.id) ? ' · 📚 在這趟行程裡' : ''}</div>
        ${p.note ? `<p>${esc(p.note)}</p>` : ''}
        <div class="adv-tripmap__pop-likes">${likes.length ? `❤️ ${likes.map(esc).join('、')}想去` : '還沒有人按想去'}</div>
        <div class="adv-tripmap__pop-actions">
          <button type="button" data-like-id="${p.id}">❤️ 想去／取消</button>
          <a href="https://www.google.com/maps?q=${navQuery(p)}" target="_blank" rel="noopener">📍 Google 地圖</a>
        </div>
      </div>
    `;
  };

  let firstDraw = true;
  const draw = () => {
    layer.clearLayers();
    const shown = places.filter(matches);
    shown.forEach((p) => {
      const both = IDENTITIES.every((id) => (p.liked_by || []).includes(id));
      L.circleMarker([p.lat as number, p.lng as number], {
        radius: both ? 11 : 8,
        color: both ? '#f59f00' : '#fff',
        weight: both ? 3 : 2,
        fillColor: MARKER_COLOR[p.category] || FALLBACK_COLOR,
        fillOpacity: 0.9,
      })
        .bindPopup(() => popupHTML(p), { maxWidth: 260 })
        .bindTooltip(p.name, { direction: 'top', offset: [0, -6] })
        .addTo(layer)
        .on('popupopen', (e) => bindPopup(e.popup, p));
    });
    countEl.textContent = `${shown.length} / ${places.length} 個地點`;
    if (shown.length && (firstDraw || area !== 'all' || routeOnly)) {
      map.fitBounds(L.latLngBounds(shown.map((p) => [p.lat as number, p.lng as number])), { padding: [30, 30], maxZoom: 16 });
    }
    firstDraw = false;
  };

  const bindPopup = (popup: L.Popup, p: PlaceEntry) => {
    const btn = popup.getElement()?.querySelector<HTMLButtonElement>('[data-like-id]');
    btn?.addEventListener('click', async () => {
      btn.disabled = true;
      const saved = await opts.onToggleLike(p);
      if (saved) {
        p.liked_by = saved.liked_by || [];
        map.closePopup();
        draw();
      } else {
        btn.disabled = false;
      }
    });
  };

  const syncChips = () => {
    overlay.querySelectorAll<HTMLElement>('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
    overlay.querySelectorAll<HTMLElement>('[data-like]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.like === like)));
  };

  overlay.querySelectorAll<HTMLElement>('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      cat = b.dataset.cat === cat ? 'all' : b.dataset.cat || 'all';
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
  overlay.querySelector<HTMLSelectElement>('#adv-tripmap-area')?.addEventListener('change', (e) => {
    area = (e.target as HTMLSelectElement).value;
    draw();
  });
  overlay.querySelector<HTMLInputElement>('#adv-tripmap-route')?.addEventListener('change', (e) => {
    routeOnly = (e.target as HTMLInputElement).checked;
    draw();
  });

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
