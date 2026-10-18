import { PlaceEntry, Region } from '../../shared/types';
import {
  CATEGORY_CONFIG,
  CategoryConfig,
  colorToFade,
  REGION_LABEL,
  STATUS_LABEL,
  ACHIEVEMENT_CATEGORY,
  AchievementCategory,
  AchievementCategoryConfig,
  ACHIEVEMENT_TITLES,
  REGION_INFO,
} from './data';
import { IDENTITIES, Identity, Guide, GuideStop, Season, Achievement } from './supabase';
import { speechSupported, speak, stopSpeech, currentSpeech, setSpeechListener, SpeechState } from './voice';

/** 依實際出現在資料中的分類，動態產生篩選 chips */
export function renderFilterBar(
  places: PlaceEntry[],
  currentCat: string,
  onSelect: (cat: string) => void
) {
  const mount = document.getElementById('adv-filter-mount');
  if (!mount) return;

  const used = new Set(places.map(p => p.category));
  const builtinOrder = Object.keys(CATEGORY_CONFIG);
  const usedCats = [
    ...builtinOrder.filter(cat => used.has(cat)),
    ...Array.from(used).filter(cat => !builtinOrder.includes(cat)),
  ];

  const chipHTML = (cat: string, label: string, color?: string) => `
    <button class="adv-chip ${cat === currentCat ? 'adv-chip--active' : ''}"
            data-cat="${cat}"
            style="${color && cat === currentCat ? `background:${color};border-color:${color};` : ''}">
      ${label}
    </button>
  `;

  mount.innerHTML = [
    chipHTML('all', '全部'),
    ...usedCats.map(cat => {
      const config = CATEGORY_CONFIG[cat];
      return chipHTML(cat, config ? config.label : cat, config?.color);
    }),
  ].join('');

  mount.querySelectorAll('.adv-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect((btn as HTMLElement).dataset.cat || 'all');
    });
  });

  bindHorizontalWheel(mount);
}

/** 橫向篩選列：桌面滑鼠滾輪只有垂直方向，轉成橫向捲動；容器不會被重建，只綁一次 */
function bindHorizontalWheel(el: HTMLElement) {
  if (el.dataset.wheelBound) return;
  el.dataset.wheelBound = '1';
  el.addEventListener('wheel', (e: WheelEvent) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
}

export interface AttrFilter {
  region: Region | 'all';
  rainOnly: boolean;
}

/** 地區 + 雨天可去：屬性篩選，可與分類 chips 疊加；計數以「已套用另一個屬性」後的地點計算 */
export function renderAttrBar(
  places: PlaceEntry[],
  current: AttrFilter,
  onChange: (next: AttrFilter) => void
) {
  const bar = document.getElementById('adv-attr-mount');
  if (!bar) return;
  bindHorizontalWheel(bar);

  const forRegion = current.rainOnly ? places.filter(p => p.is_indoor === true) : places;
  const forRain = current.region === 'all' ? places : places.filter(p => p.region === current.region);
  const regions = (Object.entries(REGION_LABEL) as [Region, string][])
    .map(([key, label]) => ({ key, label, count: forRegion.filter(p => p.region === key).length }))
    .filter(r => r.count > 0);

  const btn = (attrs: string, active: boolean, label: string, count: number) =>
    `<button class="adv-guide-season ${active ? 'is-active' : ''}" ${attrs} aria-pressed="${active}">${label}<span class="adv-guide-season-count">${count}</span></button>`;

  // 雨天切換放最前面：手機上地區按鈕會超出畫面，最常用的不能被擠到看不到的地方
  bar.innerHTML = [
    btn('data-rain', current.rainOnly, '☔ 雨天可去', forRain.filter(p => p.is_indoor === true).length),
    btn('data-region="all"', current.region === 'all', '全部地區', forRegion.length),
    ...regions.map(r => btn(`data-region="${r.key}"`, current.region === r.key, r.label, r.count)),
  ].join('');

  bar.querySelectorAll<HTMLElement>('[data-region]').forEach(el => {
    el.addEventListener('click', () => onChange({ ...current, region: el.dataset.region as Region | 'all' }));
  });
  bar.querySelector('[data-rain]')?.addEventListener('click', () => {
    onChange({ ...current, rainOnly: !current.rainOnly });
  });
}

/** 選了某個地區時，在篩選列下方介紹這區：一句話、代表美食、交通，加上你們在這區的進度 */
export function renderRegionCard(allPlaces: PlaceEntry[], region: Region | 'all') {
  const mount = document.getElementById('adv-region-mount');
  if (!mount) return;
  if (region === 'all') {
    mount.hidden = true;
    mount.innerHTML = '';
    return;
  }

  const info = REGION_INFO[region];
  const inRegion = allPlaces.filter(p => p.region === region);
  const done = inRegion.filter(p => p.status === 'done').length;

  mount.hidden = false;
  mount.innerHTML = `
    <div class="adv-region-head">
      <span class="adv-region-title">${info.emoji} ${REGION_LABEL[region]}</span>
      <span class="adv-region-progress">去過 ${done} / ${inRegion.length} 個</span>
    </div>
    <div class="adv-region-tagline">${info.tagline}</div>
    <div class="adv-region-row">🍜 ${info.foods.join('、')}</div>
    <div class="adv-region-row">🚆 ${info.transport}</div>
  `;
}

export interface CardActions {
  onGo: (place: PlaceEntry) => void;
  onConfirm: (place: PlaceEntry) => void;
  onUnpropose: (place: PlaceEntry) => void;
  onMarkDone: (place: PlaceEntry) => void;
  onReopen: (place: PlaceEntry) => void;
  onToggleLike: (place: PlaceEntry) => void;
  onEdit: (place: PlaceEntry) => void;
  onDelete: (place: PlaceEntry) => void;
  onReschedule: (place: PlaceEntry) => void;
  onReorder: (dayKey: string, orderedIds: number[]) => void;
  onShare: (place: PlaceEntry) => void;
}

export function navQuery(place: PlaceEntry): string {
  if (place.lat != null && place.lng != null) return `${place.lat},${place.lng}`;
  return encodeURIComponent(place.address || place.mrt_station || place.name);
}

/** 手機震動回饋，桌面瀏覽器沒有 vibrate API 時安靜跳過 */
export function vibrate(pattern: number | number[] = 12): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

function metaLine(place: PlaceEntry): string {
  const parts = [place.address, place.mrt_station].filter(
    (v, i, arr) => Boolean(v) && arr.indexOf(v) === i
  );
  return parts.join(' · ');
}

function ideaRow(place: PlaceEntry): string {
  const config = CATEGORY_CONFIG[place.category];
  const hasNote = Boolean(place.note);
  return `
    <div class="adv-row-wrap">
      <div class="adv-row" style="--cat-color:${config?.color || '#999'}">
        <span class="adv-row-dot" title="${config?.label || place.category}"></span>
        <div class="adv-row-main" ${hasNote ? `data-action="expand" data-id="${place.id}"` : ''}>
          <span class="adv-row-name">${place.name}</span>
          ${metaLine(place) ? `<span class="adv-row-meta">${metaLine(place)}</span>` : ''}
        </div>
        <button class="adv-row-btn" data-action="go" data-id="${place.id}">🙋 想去</button>
        <button class="adv-row-delete" data-action="delete" data-id="${place.id}" title="刪除">🗑</button>
      </div>
      ${hasNote ? `<div class="adv-row-detail" id="adv-row-detail-${place.id}" hidden>${place.note}</div>` : ''}
    </div>
  `;
}

function proposedCard(place: PlaceEntry): string {
  const config = CATEGORY_CONFIG[place.category];
  const likedBy = place.liked_by || [];

  const likeButtons = IDENTITIES.map(name => `
    <button class="adv-like-btn ${likedBy.includes(name) ? 'adv-like-btn--active' : ''}" data-action="like" data-identity="${name}" data-id="${place.id}">
      👍 ${name}
    </button>
  `).join('');

  return `
    <div class="adv-card" style="--cat-color:${config?.color || '#999'}">
      <div class="adv-card-tag" style="background:${config?.color || '#999'}">${config?.label || place.category}</div>
      <div class="adv-card-name">${place.name}</div>
      ${metaLine(place) ? `<div class="adv-card-meta">${metaLine(place)}</div>` : ''}
      ${place.note ? `<p class="adv-card-note">${place.note}</p>` : ''}
      ${place.proposed_by ? `<div class="adv-card-by">${place.proposed_by} 提案</div>` : ''}
      <div class="adv-like-row">${likeButtons}</div>
      <div class="adv-card-actions">
        <a class="adv-card-btn" href="https://www.google.com/maps?q=${navQuery(place)}" target="_blank" rel="noopener">🗺️ 導航</a>
        <button class="adv-card-btn adv-card-btn--ghost" data-action="share" data-id="${place.id}">🔗 分享</button>
        <button class="adv-card-btn adv-card-btn--ghost" data-action="edit" data-id="${place.id}">✏️ 修改</button>
        <button class="adv-card-btn adv-card-btn--ghost" data-action="unpropose" data-id="${place.id}">回到願望清單</button>
        <button class="adv-card-btn adv-card-btn--danger" data-action="delete" data-id="${place.id}">🗑 刪除</button>
        <button class="adv-card-btn adv-card-btn--primary" data-action="confirm" data-id="${place.id}">✅ 定案</button>
      </div>
    </div>
  `;
}

function itineraryCard(place: PlaceEntry, position: number, dayTotal: number): string {
  const config = CATEGORY_CONFIG[place.category];
  const isDone = place.status === 'done';

  return `
    <div class="adv-card adv-card--draggable ${isDone ? 'adv-card--done' : ''}"
         style="--cat-color:${config?.color || '#999'}"
         draggable="true"
         data-id="${place.id}">
      <span class="adv-drag-handle" title="拖曳排序">⠿</span>
      <button class="adv-card-more" data-action="toggle-actions" data-id="${place.id}" title="更多操作">⋯</button>
      <div class="adv-card-top-row">
        ${dayTotal > 1 ? `<span class="adv-stop-badge" title="第 ${position} 站">${position}</span>` : ''}
        <div class="adv-card-tag" style="background:${config?.color || '#999'}">${config?.label || place.category}</div>
      </div>
      <div class="adv-card-name">${place.name}${isDone ? ' 🏁' : ''}</div>
      ${metaLine(place) ? `<div class="adv-card-meta">${metaLine(place)}</div>` : ''}
      ${place.note ? `<p class="adv-card-note">${place.note.replace(/\n/g, '<br>')}</p>` : ''}
      <div class="adv-card-actions adv-card-actions--collapsible" id="adv-itin-actions-${place.id}">
        ${place.lat != null && place.lng != null
          ? `<a class="adv-card-btn adv-card-btn--icon" href="https://www.google.com/maps?q=${navQuery(place)}" target="_blank" rel="noopener" title="導航">🗺️</a>`
          : ''
        }
        <button class="adv-card-btn adv-card-btn--icon adv-card-btn--ghost" data-action="reschedule" data-id="${place.id}" title="改日期">📅</button>
        <button class="adv-card-btn adv-card-btn--icon adv-card-btn--ghost" data-action="edit" data-id="${place.id}" title="修改">✏️</button>
        <button class="adv-card-btn adv-card-btn--icon adv-card-btn--danger" data-action="delete" data-id="${place.id}" title="刪除">🗑</button>
        ${isDone
          ? `<button class="adv-card-btn adv-card-btn--icon adv-card-btn--ghost" data-action="reopen" data-id="${place.id}" title="重新開放">↩</button>`
          : `<button class="adv-card-btn adv-card-btn--icon adv-card-btn--primary" data-action="done" data-id="${place.id}" title="標記已去過">🏁</button>`
        }
      </div>
    </div>
  `;
}

function bindActions(mount: HTMLElement, places: PlaceEntry[], actions: CardActions) {
  mount.querySelectorAll('[data-action]').forEach(el => {
    const id = parseInt((el as HTMLElement).dataset.id || '0');
    const place = places.find(p => p.id === id);
    if (!place) return;

    const action = (el as HTMLElement).dataset.action;
    el.addEventListener('click', () => {
      if (action === 'go') actions.onGo(place);
      else if (action === 'confirm') actions.onConfirm(place);
      else if (action === 'unpropose') actions.onUnpropose(place);
      else if (action === 'done') actions.onMarkDone(place);
      else if (action === 'reopen') actions.onReopen(place);
      else if (action === 'like') actions.onToggleLike(place);
      else if (action === 'edit') actions.onEdit(place);
      else if (action === 'delete') actions.onDelete(place);
      else if (action === 'reschedule') actions.onReschedule(place);
      else if (action === 'share') actions.onShare(place);
      else if (action === 'expand') {
        const detail = document.getElementById(`adv-row-detail-${place.id}`);
        if (detail) detail.hidden = !detail.hidden;
      }
      else if (action === 'toggle-actions') {
        const row = document.getElementById(`adv-itin-actions-${place.id}`);
        if (row) row.classList.toggle('adv-card-actions--open');
      }
    });
  });
}

const UNSCHEDULED_KEY = '__unscheduled__';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function dayLabel(dayKey: string): string {
  if (dayKey === UNSCHEDULED_KEY) return '📌 未排日期';
  const d = new Date(`${dayKey}T00:00:00`);
  if (isNaN(d.getTime())) return `📅 ${dayKey}`;
  return `📅 ${dayKey}（週${WEEKDAYS[d.getDay()]}）`;
}

function groupItineraryByDay(itinerary: PlaceEntry[]): [string, PlaceEntry[]][] {
  const groups = new Map<string, PlaceEntry[]>();
  for (const place of itinerary) {
    const key = place.visit_date || UNSCHEDULED_KEY;
    if (!groups.has(key)) groups.set(key, []);
    (groups.get(key) as PlaceEntry[]).push(place);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => {
      const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.id - b.id;
    });
  }

  return Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === UNSCHEDULED_KEY) return 1;
    if (b === UNSCHEDULED_KEY) return -1;
    return a.localeCompare(b);
  });
}

function getDragAfterElement(container: HTMLElement, y: number): Element | null {
  const draggableEls = Array.from(container.querySelectorAll('.adv-card--draggable:not(.adv-card--dragging)'));
  return draggableEls.reduce<{ offset: number; element: Element | null }>(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function setupDayDragAndDrop(mount: HTMLElement, onReorder: (dayKey: string, orderedIds: number[]) => void) {
  mount.querySelectorAll('.adv-card--draggable').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('adv-card--dragging');
      (e as DragEvent).dataTransfer?.setData('text/plain', (card as HTMLElement).dataset.id || '');
    });
    card.addEventListener('dragend', () => card.classList.remove('adv-card--dragging'));
  });

  mount.querySelectorAll('.adv-day-cards').forEach(group => {
    const groupEl = group as HTMLElement;

    groupEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = mount.querySelector('.adv-card--dragging');
      if (!dragging) return;
      const afterEl = getDragAfterElement(groupEl, (e as DragEvent).clientY);
      if (afterEl == null) groupEl.appendChild(dragging);
      else groupEl.insertBefore(dragging, afterEl);
    });

    groupEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const dayKey = groupEl.dataset.day || UNSCHEDULED_KEY;
      const orderedIds = Array.from(groupEl.querySelectorAll('.adv-card--draggable')).map(
        el => parseInt((el as HTMLElement).dataset.id || '0')
      );
      onReorder(dayKey, orderedIds);
    });
  });
}

export function renderSections(allPlaces: PlaceEntry[], actions: CardActions) {
  const ideas = allPlaces.filter(p => p.status === 'idea');
  const proposed = allPlaces.filter(p => p.status === 'proposed');
  const itinerary = allPlaces.filter(p => p.status === 'confirmed' || p.status === 'done');

  const ideaMount = document.getElementById('adv-section-idea');
  const proposedMount = document.getElementById('adv-section-proposed');
  const itineraryMount = document.getElementById('adv-section-itinerary');

  if (ideaMount) {
    ideaMount.innerHTML = ideas.length
      ? ideas.map(ideaRow).join('')
      : `<p class="adv-empty">目前沒有這個分類的願望清單項目</p>`;
    bindActions(ideaMount, ideas, actions);
  }

  if (proposedMount) {
    proposedMount.innerHTML = proposed.length
      ? proposed.map(proposedCard).join('')
      : `<p class="adv-empty">還沒有人提案，點下面「＋ 新增提案」試試</p>`;
    bindActions(proposedMount, proposed, actions);
  }

  if (itineraryMount) {
    if (itinerary.length) {
      const groups = groupItineraryByDay(itinerary);
      itineraryMount.innerHTML = groups
        .map(([dayKey, places]) => `
          <div class="adv-day-group">
            <div class="adv-day-header">${dayLabel(dayKey)}</div>
            <div class="adv-day-cards" data-day="${dayKey}">
              ${places.map((p, i) => itineraryCard(p, i + 1, places.length)).join('')}
            </div>
          </div>
        `)
        .join('');
      bindActions(itineraryMount, itinerary, actions);
      setupDayDragAndDrop(itineraryMount, actions.onReorder);
    } else {
      itineraryMount.innerHTML = `<p class="adv-empty">還沒有定案的行程，去「提案中」按 ✅ 定案吧！</p>`;
    }
  }

  const counts: Record<string, number> = {
    idea: ideas.length,
    proposed: proposed.length,
    itinerary: itinerary.length,
  };
  document.querySelectorAll('.adv-section-count').forEach(el => {
    const section = (el as HTMLElement).dataset.section || '';
    if (section in counts) el.textContent = `${counts[section]}`;
  });
}

// ───────────────────────── 行程懶人包 ─────────────────────────

const STATUS_BADGE: Record<string, string> = {
  idea: '💭',
  proposed: '🗳️',
  confirmed: '✅',
  done: '🏁',
};

function esc(text: string | null | undefined): string {
  return (text || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function hasCoords(place: PlaceEntry | undefined): place is PlaceEntry & { lat: number; lng: number } {
  return place != null && place.lat != null && place.lng != null;
}

/** 有座標的站依序串成 Google Maps 多點路線（起點 + 最多 9 個中繼點 + 終點） */
function guideRouteUrl(guide: Guide, placeById: Map<number, PlaceEntry>): string | null {
  const points = guide.stops
    .map((s) => (s.place_id != null ? placeById.get(s.place_id) : undefined))
    .filter(hasCoords)
    .map((p) => `${p.lat},${p.lng}`)
    .filter((pt, i, arr) => arr.indexOf(pt) === i);
  if (points.length < 2) return null;

  const [origin, ...rest] = points.slice(0, 11);
  const destination = rest.pop() as string;
  const params = new URLSearchParams({ api: '1', origin, destination });
  if (rest.length) params.set('waypoints', rest.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function guideStopHTML(stop: GuideStop, place: PlaceEntry | undefined, index: number): string {
  const config = place ? CATEGORY_CONFIG[place.category] : undefined;
  const color = config?.color || 'var(--adv-brown-light)';
  const meta = place ? metaLine(place) : '';

  return `
    ${stop.transit && index > 0 ? `<div class="adv-guide-transit">${esc(stop.transit)}</div>` : ''}
    <div class="adv-guide-stop" style="--cat-color:${color}" data-stop-index="${index}">
      <span class="adv-guide-stop-num ${place ? '' : 'adv-guide-stop-num--free'}">${stop.seq}</span>
      <div class="adv-guide-stop-body">
        ${stop.time_text ? `<div class="adv-guide-stop-time">${esc(stop.time_text)}</div>` : ''}
        <div class="adv-guide-stop-name">
          ${esc(stop.label)}
          ${place ? `<span class="adv-guide-stop-status" title="目前在你們的清單狀態">${STATUS_BADGE[place.status] || ''}</span>` : ''}
        </div>
        ${index === 0 && stop.transit ? `<div class="adv-card-meta">${esc(stop.transit)}</div>` : ''}
        ${meta ? `<div class="adv-card-meta">${esc(meta)}</div>` : ''}
        ${stop.must_try || stop.cost ? `<div class="adv-guide-stop-extra">
          ${stop.must_try ? `<span class="adv-guide-chip">⭐ 必點 ${esc(stop.must_try)}</span>` : ''}
          ${stop.cost ? `<span class="adv-guide-chip">💰 ${esc(stop.cost)}</span>` : ''}
        </div>` : ''}
        ${stop.tip ? `<div class="adv-guide-stop-tip">💡 ${esc(stop.tip)}</div>` : ''}
      </div>
      ${hasCoords(place)
        ? `<a class="adv-card-btn adv-card-btn--icon adv-guide-stop-nav" href="https://www.google.com/maps?q=${place.lat},${place.lng}" target="_blank" rel="noopener" title="導航到這一站">🗺️</a>`
        : ''}
    </div>
  `;
}

function guideCardHTML(guide: Guide, placeById: Map<number, PlaceEntry>): string {
  const located = guide.stops.filter((s) => s.place_id != null && hasCoords(placeById.get(s.place_id))).length;
  const chain = guide.stops.map((s) => esc(s.label)).join('<span class="adv-guide-chain-arrow">→</span>');
  const routeUrl = guideRouteUrl(guide, placeById);

  return `
    <div class="adv-card adv-guide-card" data-guide-id="${guide.id}">
      <button class="adv-guide-head" data-guide-action="toggle" data-guide-id="${guide.id}" aria-expanded="false">
        <div class="adv-guide-title">${esc(guide.title)}</div>
        ${guide.summary ? `<div class="adv-guide-summary">${esc(guide.summary)}</div>` : ''}
        <div class="adv-guide-chain">${chain}</div>
        <div class="adv-guide-meta">
          ${guide.region ? `<span class="adv-guide-tag">📍 ${esc(guide.region)}</span>` : ''}
          ${guide.seasons.length ? `<span class="adv-guide-tag adv-guide-tag--season">${guide.seasons.map((s) => SEASON_LABEL[s]).join(' ')}</span>` : ''}
          ${guide.tags.map((t) => `<span class="adv-guide-tag">#${esc(t)}</span>`).join('')}
          <span class="adv-guide-count">${guide.stops.length} 站 · ${located} 站有座標</span>
        </div>
      </button>
      <div class="adv-guide-detail" id="adv-guide-detail-${guide.id}" hidden>
        <div class="adv-guide-timeline">
          ${guide.stops.map((s, i) => guideStopHTML(s, s.place_id != null ? placeById.get(s.place_id) : undefined, i)).join('')}
        </div>
        <div class="adv-card-actions">
          ${speechSupported ? `<button class="adv-card-btn" data-guide-action="speak" data-guide-id="${guide.id}">🔊 聽導覽</button>` : ''}
          ${routeUrl ? `<a class="adv-card-btn" href="${routeUrl}" target="_blank" rel="noopener">🗺️ 整條路線</a>` : ''}
          ${guide.source_url ? `<a class="adv-card-btn adv-card-btn--ghost" href="${esc(guide.source_url)}" target="_blank" rel="noopener">🔗 原文</a>` : ''}
          <button class="adv-card-btn adv-card-btn--primary" data-guide-action="apply" data-guide-id="${guide.id}">📅 照這個排行程</button>
        </div>
        ${guide.source ? `<div class="adv-guide-source">來源：${esc(guide.source)}</div>` : ''}
      </div>
    </div>
  `;
}

/** 朗讀稿：第 0 段是開場，第 1..n 段對應各站（段號 - 1 = 站的 index），最後一段收尾 */
function guideSpeechSegments(guide: Guide): string[] {
  const sentence = (text: string) => (/[。！？!?]$/.test(text) ? text : `${text}。`);
  const intro = [sentence(guide.title), guide.summary ? sentence(guide.summary) : '', `總共 ${guide.stops.length} 站。`].join('');
  const stops = guide.stops.map((s) => [
    `第 ${s.seq} 站，${s.label}。`,
    s.time_text ? `時間：${s.time_text}。` : '',
    s.transit ? `怎麼去：${s.transit}。` : '',
    s.must_try ? `必點：${s.must_try}。` : '',
    s.cost ? `花費：${s.cost}。` : '',
    s.tip ? `${s.tip}。` : '',
  ].join(''));
  return [intro, ...stops, '以上就是這條路線，玩得開心！'];
}

/** 依目前朗讀狀態更新按鈕文字與「念到這站」的高亮；重新渲染後也要呼叫一次 */
function syncSpeechUI(state: SpeechState | null) {
  document.querySelectorAll<HTMLElement>('[data-guide-action="speak"]').forEach((btn) => {
    const playing = state?.guideId === parseInt(btn.dataset.guideId || '0');
    btn.textContent = playing ? '⏹ 停止朗讀' : '🔊 聽導覽';
    btn.classList.toggle('adv-card-btn--primary', playing);
  });
  document.querySelectorAll('.adv-guide-stop.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
  if (!state || state.segment < 1) return;
  const stopEl = document.querySelector<HTMLElement>(
    `[data-guide-id="${state.guideId}"] .adv-guide-stop[data-stop-index="${state.segment - 1}"]`
  );
  if (!stopEl) return;
  stopEl.classList.add('is-speaking');
  stopEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

setSpeechListener(syncSpeechUI);

const SEASON_LABEL: Record<Season, string> = {
  spring: '🌸 春',
  summer: '☀️ 夏',
  autumn: '🍂 秋',
  winter: '❄️ 冬',
};

/** 'all' = 不篩選；'anytime' = 只看全年皆宜（seasons 為空）的懶人包 */
export type GuideSeasonFilter = 'all' | 'anytime' | Season;

function matchSeason(guide: Guide, filter: GuideSeasonFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'anytime') return guide.seasons.length === 0;
  return guide.seasons.includes(filter);
}

function renderSeasonBar(
  guides: Guide[],
  current: GuideSeasonFilter,
  onChange: (filter: GuideSeasonFilter) => void
) {
  const bar = document.getElementById('adv-guide-seasons');
  if (!bar) return;
  bindHorizontalWheel(bar);

  const options: [GuideSeasonFilter, string][] = [
    ['all', '全部'],
    ...(Object.entries(SEASON_LABEL) as [Season, string][]),
    ['anytime', '全年皆宜'],
  ];

  bar.innerHTML = options
    .map(([value, label]) => {
      const count = guides.filter((g) => matchSeason(g, value)).length;
      return `<button class="adv-guide-season ${value === current ? 'is-active' : ''}" data-season="${value}" aria-pressed="${value === current}">${label}<span class="adv-guide-season-count">${count}</span></button>`;
    })
    .join('');

  bar.querySelectorAll<HTMLElement>('[data-season]').forEach((btn) => {
    btn.addEventListener('click', () => onChange(btn.dataset.season as GuideSeasonFilter));
  });
}

/** 懶人包：別人怎麼排一日行程，每一站都對應到單一座標的地點 */
export function renderGuides(
  searchedGuides: Guide[],
  allPlaces: PlaceEntry[],
  season: GuideSeasonFilter,
  onSeasonChange: (filter: GuideSeasonFilter) => void,
  onApply: (guide: Guide) => void
) {
  const mount = document.getElementById('adv-section-guides');
  if (!mount) return;

  renderSeasonBar(searchedGuides, season, onSeasonChange);
  const guides = searchedGuides.filter((g) => matchSeason(g, season));

  const placeById = new Map(allPlaces.map((p) => [p.id, p]));
  const openIds = new Set(
    Array.from(mount.querySelectorAll('.adv-guide-detail:not([hidden])')).map((el) => el.id)
  );

  mount.innerHTML = guides.length
    ? guides.map((g) => guideCardHTML(g, placeById)).join('')
    : `<p class="adv-empty">沒有符合的懶人包</p>`;

  // 重新渲染（例如即時同步）時保留使用者已展開的卡片
  openIds.forEach((id) => {
    const detail = document.getElementById(id);
    if (detail) detail.hidden = false;
  });

  mount.querySelectorAll('[data-guide-action]').forEach((el) => {
    const btn = el as HTMLElement;
    const guide = guides.find((g) => g.id === parseInt(btn.dataset.guideId || '0'));
    if (!guide) return;

    btn.addEventListener('click', () => {
      if (btn.dataset.guideAction === 'apply') {
        onApply(guide);
        return;
      }
      if (btn.dataset.guideAction === 'speak') {
        if (currentSpeech()?.guideId === guide.id) stopSpeech();
        else speak(guide.id, guideSpeechSegments(guide));
        return;
      }
      const detail = document.getElementById(`adv-guide-detail-${guide.id}`);
      if (!detail) return;
      detail.hidden = !detail.hidden;
      btn.setAttribute('aria-expanded', `${!detail.hidden}`);
    });
  });

  document.querySelectorAll('.adv-section-count[data-section="guides"]').forEach((el) => {
    el.textContent = `${guides.length}`;
  });
  syncSpeechUI(currentSpeech());
}

// ───────────────────────── 旅行成就 ─────────────────────────

export interface AchievementUnlock {
  date: string | null;
  /** manual = 手動打勾；place = 連結的地點已標記去過 */
  via: 'manual' | 'place';
  place?: PlaceEntry;
}

/** 手動解鎖優先；否則取連結地點中最早去過的那一個 */
export function achievementUnlock(a: Achievement, placeById: Map<number, PlaceEntry>): AchievementUnlock | null {
  if (a.done_date) return { date: a.done_date, via: 'manual' };
  const done = a.place_ids
    .map((id) => placeById.get(id))
    .filter((p): p is PlaceEntry => p?.status === 'done')
    .sort((x, y) => (x.visit_date || '9999').localeCompare(y.visit_date || '9999'));
  return done.length ? { date: done[0].visit_date || null, via: 'place', place: done[0] } : null;
}

export type AchievementFilter = 'all' | AchievementCategory;

function achievementCardHTML(a: Achievement, placeById: Map<number, PlaceEntry>): string {
  const cfg = ACHIEVEMENT_CATEGORY[a.category];
  const unlock = achievementUnlock(a, placeById);
  const places = a.place_ids.map((id) => placeById.get(id)).filter((p): p is PlaceEntry => p != null);

  const unlockLine = !unlock
    ? ''
    : unlock.via === 'manual'
      ? `✅ ${esc(unlock.date)}${a.done_by ? ` · ${esc(a.done_by)}` : ''}`
      : `🏁 去過「${esc(unlock.place?.name)}」${unlock.date ? ` · ${esc(unlock.date)}` : ''}`;

  const action = !unlock
    ? `<button class="adv-card-btn adv-card-btn--primary" data-ach-action="unlock" data-ach-id="${a.id}">🏆 我們完成了</button>`
    : unlock.via === 'manual'
      ? `<button class="adv-card-btn adv-card-btn--ghost" data-ach-action="undo" data-ach-id="${a.id}">取消解鎖</button>`
      : '';

  return `
    <div class="adv-card adv-ach-card ${unlock ? 'is-unlocked' : ''}" style="--cat-color:${cfg.color}">
      <div class="adv-ach-head">
        <span class="adv-ach-emoji" aria-hidden="true">${unlock ? esc(a.emoji) || cfg.emoji : '🔒'}</span>
        <div class="adv-ach-main">
          <div class="adv-ach-title">${esc(a.title)}</div>
          <div class="adv-ach-stars" title="難度 ${a.difficulty}/5">${'★'.repeat(a.difficulty)}${'☆'.repeat(5 - a.difficulty)}</div>
        </div>
      </div>
      ${a.description ? `<div class="adv-ach-desc">${esc(a.description)}</div>` : ''}
      ${a.when_text ? `<div class="adv-guide-meta"><span class="adv-guide-tag adv-guide-tag--season">🗓️ ${esc(a.when_text)}</span></div>` : ''}
      ${places.length ? `<div class="adv-ach-places">${places.map((p) => `
        <a class="adv-ach-place" href="https://www.google.com/maps?q=${navQuery(p)}" target="_blank" rel="noopener" title="${esc(STATUS_LABEL[p.status])}">
          ${STATUS_BADGE[p.status] || ''} ${esc(p.name)}
        </a>`).join('')}</div>` : ''}
      ${unlockLine ? `<div class="adv-ach-unlocked">${unlockLine}</div>` : ''}
      ${a.done_note ? `<div class="adv-guide-stop-tip">📝 ${esc(a.done_note)}</div>` : ''}
      ${action ? `<div class="adv-card-actions">${action}</div>` : ''}
    </div>
  `;
}

/** 成就分頁：稱號 + 徽章進度 + 分類篩選 + 成就卡片 */
export function renderAchievements(
  all: Achievement[],
  searched: Achievement[],
  allPlaces: PlaceEntry[],
  filter: AchievementFilter,
  onFilterChange: (filter: AchievementFilter) => void,
  onUnlock: (a: Achievement) => void,
  onUndo: (a: Achievement) => void
) {
  const mount = document.getElementById('adv-section-achievements');
  const summary = document.getElementById('adv-ach-summary');
  const bar = document.getElementById('adv-ach-filter');
  if (!mount || !summary || !bar) return;
  bindHorizontalWheel(bar);

  const placeById = new Map(allPlaces.map((p) => [p.id, p]));
  const isUnlocked = (a: Achievement) => achievementUnlock(a, placeById) !== null;
  const cats = Object.entries(ACHIEVEMENT_CATEGORY) as [AchievementCategory, AchievementCategoryConfig][];

  // 稱號與徽章看全部成就，不受搜尋影響
  const total = all.filter(isUnlocked).length;
  const title = [...ACHIEVEMENT_TITLES].reverse().find((t) => total >= t.min)?.title || '';

  summary.innerHTML = `
    <div class="adv-ach-rank">
      <span class="adv-ach-rank-title">${title}</span>
      <span class="adv-ach-rank-count">${total} / ${all.length}</span>
    </div>
    <div class="adv-ach-progress"><span style="width:${all.length ? (total / all.length) * 100 : 0}%"></span></div>
    <div class="adv-ach-badges">
      ${cats.map(([key, cfg]) => {
        const got = all.filter((a) => a.category === key && isUnlocked(a)).length;
        const earned = got >= cfg.badge.threshold;
        return `<div class="adv-ach-badge ${earned ? 'is-earned' : ''}" style="--cat-color:${cfg.color}" title="解鎖 ${cfg.badge.threshold} 項${cfg.label}成就">
          <span class="adv-ach-badge-icon">${cfg.emoji}</span>
          <span class="adv-ach-badge-name">${cfg.badge.name}</span>
          <span class="adv-ach-badge-count">${Math.min(got, cfg.badge.threshold)}/${cfg.badge.threshold}</span>
        </div>`;
      }).join('')}
    </div>
  `;

  const options: [AchievementFilter, string][] = [['all', '全部'], ...cats.map(([k, c]) => [k, `${c.emoji} ${c.label}`] as [AchievementFilter, string])];
  bar.innerHTML = options.map(([value, label]) => {
    const inCat = searched.filter((a) => value === 'all' || a.category === value);
    return `<button class="adv-guide-season ${value === filter ? 'is-active' : ''}" data-ach-filter="${value}" aria-pressed="${value === filter}">${label}<span class="adv-guide-season-count">${inCat.filter(isUnlocked).length}/${inCat.length}</span></button>`;
  }).join('');
  bar.querySelectorAll<HTMLElement>('[data-ach-filter]').forEach((btn) => {
    btn.addEventListener('click', () => onFilterChange(btn.dataset.achFilter as AchievementFilter));
  });

  // 未解鎖排前面，同一分類內維持原本順序
  const order = cats.map(([k]) => k);
  const shown = searched
    .filter((a) => filter === 'all' || a.category === filter)
    .sort((x, y) =>
      Number(isUnlocked(x)) - Number(isUnlocked(y)) ||
      order.indexOf(x.category) - order.indexOf(y.category) ||
      x.sort_order - y.sort_order
    );

  mount.innerHTML = shown.length
    ? shown.map((a) => achievementCardHTML(a, placeById)).join('')
    : `<p class="adv-empty">沒有符合的成就</p>`;

  mount.querySelectorAll<HTMLElement>('[data-ach-action]').forEach((btn) => {
    const a = shown.find((x) => x.id === parseInt(btn.dataset.achId || '0'));
    if (!a) return;
    btn.addEventListener('click', () => (btn.dataset.achAction === 'unlock' ? onUnlock(a) : onUndo(a)));
  });

  document.querySelectorAll('.adv-section-count[data-section="achievements"]').forEach((el) => {
    el.textContent = `${total}`;
  });
}

/** 「最近行程」快速預覽：不用滑過三欄看板，一鍵看下一次要去哪 */
export function openNextTripModal(allPlaces: PlaceEntry[]): void {
  const confirmed = allPlaces.filter(p => p.status === 'confirmed');

  const { root, close } = openModal(`<div id="adv-next-trip-body"></div>`);
  const body = root.querySelector('#adv-next-trip-body') as HTMLElement;

  if (!confirmed.length) {
    body.innerHTML = `
      <h3>📅 最近行程</h3>
      <p style="font-size:0.9rem;color:var(--adv-brown-light);margin:0 0 4px;">還沒有定案的行程，去「提案中」按 ✅ 定案吧！</p>
      <div class="adv-modal-actions">
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-next-trip-close">好</button>
      </div>
    `;
    body.querySelector('#adv-next-trip-close')?.addEventListener('click', close);
    return;
  }

  const sorted = [...confirmed].sort((a, b) =>
    (a.visit_date || '9999-99-99').localeCompare(b.visit_date || '9999-99-99')
  );
  const [next, ...rest] = sorted;
  const config = CATEGORY_CONFIG[next.category];

  body.innerHTML = `
    <h3>📅 最近行程</h3>
    <div class="adv-next-trip-hero">
      <div class="adv-card-tag" style="background:${config?.color || '#999'}">${config?.label || next.category}</div>
      <div class="adv-next-trip-name">${next.name}</div>
      <div class="adv-next-trip-date">${next.visit_date ? dayLabel(next.visit_date) : '📌 還沒排日期'}</div>
      ${metaLine(next) ? `<div class="adv-card-meta">${metaLine(next)}</div>` : ''}
      ${next.note ? `<p class="adv-card-note">${next.note.replace(/\n/g, '<br>')}</p>` : ''}
      <a class="adv-card-btn adv-card-btn--primary" href="https://www.google.com/maps?q=${navQuery(next)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;">🗺️ 導航</a>
    </div>
    ${rest.length ? `
      <p style="font-size:0.8rem;color:var(--adv-brown-light);margin:14px 0 6px;">之後還有 ${rest.length} 個定案行程</p>
      <div class="adv-next-trip-list">
        ${rest.map(p => `<div class="adv-next-trip-row">${p.visit_date ? dayLabel(p.visit_date) : '📌 未排日期'} · ${p.name}</div>`).join('')}
      </div>
    ` : ''}
    <div class="adv-modal-actions">
      <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-next-trip-close">關閉</button>
    </div>
  `;
  body.querySelector('#adv-next-trip-close')?.addEventListener('click', close);
}

// ───────────────────────── Modals ─────────────────────────

function openModal(innerHTML: string): { root: HTMLElement; close: () => void } {
  const root = document.createElement('div');
  root.className = 'adv-modal-backdrop';
  root.innerHTML = `<div class="adv-modal">${innerHTML}</div>`;
  document.body.appendChild(root);

  const modalEl = root.querySelector('.adv-modal') as HTMLElement;
  const vv = window.visualViewport;

  // 手機鍵盤彈出時視窗變矮，縮小 modal 高度避免內容被鍵盤蓋住；
  // 平常（鍵盤沒開）就把 inline maxHeight 清掉，讓手機版全螢幕的 CSS 自己決定高度
  const onViewportResize = () => {
    if (!vv) return;
    const keyboardOpen = vv.height < window.innerHeight * 0.85;
    modalEl.style.maxHeight = keyboardOpen ? `${Math.round(vv.height * 0.95)}px` : '';
  };
  vv?.addEventListener('resize', onViewportResize);
  onViewportResize();

  // 聚焦的輸入框自動滾到可視範圍中間，避免被鍵盤擋住
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    if (target.matches('input, textarea, select')) {
      window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    }
  };
  root.addEventListener('focusin', onFocusIn);

  const close = () => {
    vv?.removeEventListener('resize', onViewportResize);
    root.remove();
  };
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  return { root, close };
}

export function openIdentityModal(): Promise<Identity> {
  return new Promise((resolve) => {
    const buttonsHTML = IDENTITIES.map(name => `
      <button class="adv-modal-btn adv-modal-btn--primary" data-name="${name}" style="flex:1;">${name}</button>
    `).join('');

    const { root, close } = openModal(`
      <h3>你是誰？</h3>
      <p style="font-size:0.85rem;color:var(--adv-brown-light);margin:0 0 4px;">選一下，「我也想去」才知道要標記誰</p>
      <div class="adv-modal-actions">${buttonsHTML}</div>
    `);

    root.querySelectorAll('[data-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = (btn as HTMLElement).dataset.name as Identity;
        close();
        resolve(name);
      });
    });
  });
}

export function openConfirmModal(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const { root, close } = openModal(`
      <h3>確定嗎？</h3>
      <p style="font-size:0.9rem;color:var(--adv-brown);margin:0 0 4px;">${message}</p>
      <div class="adv-modal-actions">
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-confirm-cancel">取消</button>
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-confirm-ok" style="background:#C0392B;">確定刪除</button>
      </div>
    `);

    root.querySelector('#adv-confirm-cancel')?.addEventListener('click', () => {
      close();
      resolve(false);
    });
    root.querySelector('#adv-confirm-ok')?.addEventListener('click', () => {
      close();
      resolve(true);
    });
  });
}

export interface CategoryManagerHandlers {
  add: (label: string, color: string) => Promise<boolean>;
  updateColor: (key: string, color: string) => Promise<boolean>;
  /** 回傳 null 代表刪除成功，否則回傳要顯示的錯誤訊息 */
  remove: (key: string) => Promise<string | null>;
}

export function openCategoryManagerModal(
  categoryConfig: Record<string, CategoryConfig>,
  builtinKeys: Set<string>,
  handlers: CategoryManagerHandlers,
  onChanged: () => void
): void {
  const { root, close } = openModal(`
    <h3>管理分類</h3>
    <div id="adv-cat-list" class="adv-cat-list"></div>
    <label>新增分類名稱</label>
    <input type="text" id="adv-cat-new-label" placeholder="例如：野餐" />
    <label>顏色</label>
    <input type="color" id="adv-cat-new-color" class="adv-cat-color" value="#8C6A55" />
    <div class="adv-modal-error" id="adv-cat-error" style="display:none;"></div>
    <div class="adv-modal-actions">
      <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-cat-close">關閉</button>
      <button class="adv-modal-btn adv-modal-btn--primary" id="adv-cat-add">新增分類</button>
    </div>
  `);

  const errorEl = root.querySelector('#adv-cat-error') as HTMLElement;
  const showError = (msg: string) => {
    errorEl.style.display = 'block';
    errorEl.textContent = msg;
  };
  const clearError = () => {
    errorEl.style.display = 'none';
  };

  function renderList() {
    const listEl = root.querySelector('#adv-cat-list') as HTMLElement;
    listEl.innerHTML = Object.entries(categoryConfig)
      .map(
        ([key, cfg]) => `
      <div class="adv-cat-row">
        <input type="color" class="adv-cat-color" data-key="${key}" value="${cfg.color}" />
        <span class="adv-cat-label">${cfg.label}</span>
        ${builtinKeys.has(key) ? '' : `<button class="adv-cat-del" data-key="${key}">刪除</button>`}
      </div>
    `
      )
      .join('');

    listEl.querySelectorAll('.adv-cat-color').forEach((input) => {
      input.addEventListener('change', async () => {
        const key = (input as HTMLElement).dataset.key as string;
        const color = (input as HTMLInputElement).value;
        clearError();
        const ok = await handlers.updateColor(key, color);
        if (!ok) {
          showError('更新失敗，請確認密碼');
          return;
        }
        categoryConfig[key].color = color;
        categoryConfig[key].fade = colorToFade(color);
        onChanged();
      });
    });

    listEl.querySelectorAll('.adv-cat-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = (btn as HTMLElement).dataset.key as string;
        const confirmed = await openConfirmModal(`要刪除「${categoryConfig[key]?.label}」這個分類嗎？`);
        if (!confirmed) return;
        clearError();
        const errorMsg = await handlers.remove(key);
        if (errorMsg) {
          showError(errorMsg);
          return;
        }
        delete categoryConfig[key];
        renderList();
        onChanged();
      });
    });
  }

  renderList();

  root.querySelector('#adv-cat-close')?.addEventListener('click', () => close());

  root.querySelector('#adv-cat-add')?.addEventListener('click', async () => {
    const labelInput = root.querySelector('#adv-cat-new-label') as HTMLInputElement;
    const colorInput = root.querySelector('#adv-cat-new-color') as HTMLInputElement;
    const label = labelInput.value.trim();
    const color = colorInput.value;
    clearError();

    if (!label) {
      showError('請輸入分類名稱');
      return;
    }
    if (categoryConfig[label]) {
      showError('這個分類已經存在');
      return;
    }

    const ok = await handlers.add(label, color);
    if (!ok) {
      showError('新增失敗，請確認密碼');
      return;
    }

    categoryConfig[label] = { color, fade: colorToFade(color), label, placeholder: '/images/placeholders/quest.png' };
    labelInput.value = '';
    renderList();
    onChanged();
  });
}

export function openPassphraseModal(errorMsg?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const { root, close } = openModal(`
      <h3>輸入共用密碼</h3>
      <p style="font-size:0.85rem;color:var(--adv-brown-light);margin:0 0 4px;">只有你們兩人知道的那組密碼</p>
      <label>密碼</label>
      <input type="password" id="adv-pw-input" autocomplete="off" />
      ${errorMsg ? `<div class="adv-modal-error">${errorMsg}</div>` : ''}
      <div class="adv-modal-actions">
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-pw-cancel">取消</button>
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-pw-submit">確認</button>
      </div>
    `);

    const input = root.querySelector('#adv-pw-input') as HTMLInputElement;
    input?.focus();

    root.querySelector('#adv-pw-cancel')?.addEventListener('click', () => {
      close();
      resolve(null);
    });
    root.querySelector('#adv-pw-submit')?.addEventListener('click', () => {
      const val = input?.value || '';
      close();
      resolve(val || null);
    });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (root.querySelector('#adv-pw-submit') as HTMLElement)?.click();
    });
  });
}

export interface ProposeFormResult {
  name: string;
  category: string;
  address: string;
  note: string;
  proposedBy: string;
  /** 只有編輯模式會帶；新增時由資料庫 trigger 依座標與分類給預設值 */
  region?: Region;
  isIndoor?: boolean;
}

export function openProposeModal(
  defaults: Partial<{
    name: string; category: string; address: string; note: string; proposedBy: string;
    region: Region | null; isIndoor: boolean | null;
  }>,
  mode: 'create' | 'edit' = 'create'
): Promise<ProposeFormResult | null> {
  return new Promise((resolve) => {
    const categoryOptions = Object.entries(CATEGORY_CONFIG)
      .map(([key, cfg]) => `<option value="${key}" ${defaults.category === key ? 'selected' : ''}>${cfg.label}</option>`)
      .join('');
    const regionOptions = [
      defaults.region ? '' : '<option value="" selected>未設定</option>',
      ...(Object.entries(REGION_LABEL) as [Region, string][]).map(
        ([key, label]) => `<option value="${key}" ${defaults.region === key ? 'selected' : ''}>${label}</option>`
      ),
    ].join('');
    const attrFields = mode === 'edit' ? `
      <label>地區</label>
      <select id="adv-pf-region">${regionOptions}</select>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="adv-pf-indoor" style="width:auto;" ${defaults.isIndoor ? 'checked' : ''} />
        ☔ 雨天可去（室內）
      </label>` : '';

    const { root, close } = openModal(`
      <h3>${mode === 'edit' ? '修改地點' : '新增約會提案'}</h3>
      <label>地點名稱</label>
      <input type="text" id="adv-pf-name" value="${defaults.name || ''}" />
      <label>分類</label>
      <select id="adv-pf-category">${categoryOptions}</select>${attrFields}
      <label>地址 / 捷運站</label>
      <input type="text" id="adv-pf-address" value="${defaults.address || ''}" placeholder="方便導航跟約時間" />
      <label>備註（為什麼想去 / 想約什麼時候）</label>
      <textarea id="adv-pf-note">${defaults.note || ''}</textarea>
      <label>提案人</label>
      <input type="text" id="adv-pf-who" placeholder="你的名字" value="${defaults.proposedBy || ''}" />
      <div class="adv-modal-error" id="adv-pf-error" style="display:none;"></div>
      <div class="adv-modal-actions">
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-pf-cancel">取消</button>
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-pf-submit">${mode === 'edit' ? '儲存修改' : '送出提案'}</button>
      </div>
    `);

    root.querySelector('#adv-pf-cancel')?.addEventListener('click', () => {
      close();
      resolve(null);
    });

    root.querySelector('#adv-pf-submit')?.addEventListener('click', () => {
      const name = (root.querySelector('#adv-pf-name') as HTMLInputElement)?.value.trim();
      const category = (root.querySelector('#adv-pf-category') as HTMLSelectElement)?.value;
      const address = (root.querySelector('#adv-pf-address') as HTMLInputElement)?.value.trim();
      const note = (root.querySelector('#adv-pf-note') as HTMLTextAreaElement)?.value.trim();
      const proposedBy = (root.querySelector('#adv-pf-who') as HTMLInputElement)?.value.trim();
      const errorEl = root.querySelector('#adv-pf-error') as HTMLElement;

      if (!name) {
        errorEl.style.display = 'block';
        errorEl.textContent = '地點名稱不能空白';
        return;
      }

      const regionEl = root.querySelector('#adv-pf-region') as HTMLSelectElement | null;
      const indoorEl = root.querySelector('#adv-pf-indoor') as HTMLInputElement | null;

      close();
      resolve({
        name, category, address, note, proposedBy,
        region: (regionEl?.value || undefined) as Region | undefined,
        isIndoor: indoorEl ? indoorEl.checked : undefined,
      });
    });
  });
}

export function openMarkDoneModal(title = '標記已去過'): Promise<{ visitDate: string; note: string } | null> {
  return new Promise((resolve) => {
    const today = new Date().toISOString().slice(0, 10);
    const { root, close } = openModal(`
      <h3>${esc(title)}</h3>
      <label>去的日期</label>
      <input type="date" id="adv-done-date" value="${today}" />
      <label>當天筆記</label>
      <textarea id="adv-done-note" placeholder="留下這次約會的回憶"></textarea>
      <div class="adv-modal-actions">
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-done-cancel">取消</button>
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-done-submit">儲存</button>
      </div>
    `);

    root.querySelector('#adv-done-cancel')?.addEventListener('click', () => {
      close();
      resolve(null);
    });
    root.querySelector('#adv-done-submit')?.addEventListener('click', () => {
      const visitDate = (root.querySelector('#adv-done-date') as HTMLInputElement)?.value;
      const note = (root.querySelector('#adv-done-note') as HTMLTextAreaElement)?.value.trim();
      close();
      resolve({ visitDate, note });
    });
  });
}

export function openScheduleModal(title: string, defaultDate?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const { root, close } = openModal(`
      <h3>${title}</h3>
      <p style="font-size:0.85rem;color:var(--adv-brown-light);margin:0 0 4px;">選哪一天去，之後可以在行程卡片上再拖曳排順序</p>
      <label>日期</label>
      <input type="date" id="adv-sch-date" value="${defaultDate || ''}" />
      <div class="adv-modal-actions">
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-sch-cancel">取消</button>
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-sch-skip">先不排日期</button>
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-sch-submit">儲存</button>
      </div>
    `);

    root.querySelector('#adv-sch-cancel')?.addEventListener('click', () => {
      close();
      resolve(null);
    });
    root.querySelector('#adv-sch-skip')?.addEventListener('click', () => {
      close();
      resolve('');
    });
    root.querySelector('#adv-sch-submit')?.addEventListener('click', () => {
      const date = (root.querySelector('#adv-sch-date') as HTMLInputElement)?.value || '';
      close();
      resolve(date);
    });
  });
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pkCardHTML(place: PlaceEntry, idx: number): string {
  const config = CATEGORY_CONFIG[place.category];
  return `
    <button class="adv-pk-card" style="--cat-color:${config?.color || '#999'}" data-idx="${idx}">
      <div class="adv-card-tag" style="background:${config?.color || '#999'}">${config?.label || place.category}</div>
      <div class="adv-pk-card-name">${place.name}</div>
      ${metaLine(place) ? `<div class="adv-card-meta">${metaLine(place)}</div>` : ''}
      ${place.note ? `<p class="adv-card-note">${place.note}</p>` : ''}
    </button>
  `;
}

/** 淘汰賽：兩兩比拼直到剩一個，取消回傳 null */
export function openPkModal(candidates: PlaceEntry[]): Promise<PlaceEntry | null> {
  return new Promise((resolve) => {
    let queue = shuffle(candidates);
    let round = 1;
    let cancelled = false;

    const { root, close } = openModal(`<div id="adv-pk-body"></div>`);

    function renderMatch(a: PlaceEntry, b: PlaceEntry, matchesLeftAfter: number) {
      const body = root.querySelector('#adv-pk-body') as HTMLElement;
      body.innerHTML = `
        <h3>🥊 PK 淘汰賽</h3>
        <p class="adv-pk-progress">第 ${round} 輪 · 選完這場還剩 ${matchesLeftAfter} 場</p>
        <div class="adv-pk-pair">
          ${pkCardHTML(a, 0)}
          <div class="adv-pk-vs">VS</div>
          ${pkCardHTML(b, 1)}
        </div>
        <div class="adv-modal-actions">
          <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-pk-cancel">取消 PK</button>
        </div>
      `;
      body.querySelector('#adv-pk-cancel')?.addEventListener('click', () => {
        cancelled = true;
        close();
        resolve(null);
      });
    }

    function pickWinner(a: PlaceEntry, b: PlaceEntry, matchesLeftAfter: number): Promise<PlaceEntry> {
      renderMatch(a, b, matchesLeftAfter);
      return new Promise((res) => {
        const body = root.querySelector('#adv-pk-body') as HTMLElement;
        body.querySelectorAll('.adv-pk-card').forEach((btn) => {
          btn.addEventListener(
            'click',
            () => {
              vibrate(10);
              const idx = parseInt((btn as HTMLElement).dataset.idx || '0');
              res(idx === 0 ? a : b);
            },
            { once: true }
          );
        });
      });
    }

    (async () => {
      while (queue.length > 1 && !cancelled) {
        const nextRound: PlaceEntry[] = [];
        let matchesLeft = Math.floor(queue.length / 2);
        while (queue.length > 1 && !cancelled) {
          const a = queue.shift() as PlaceEntry;
          const b = queue.shift() as PlaceEntry;
          matchesLeft -= 1;
          const winner = await pickWinner(a, b, matchesLeft);
          nextRound.push(winner);
        }
        if (cancelled) return;
        if (queue.length === 1) nextRound.push(queue.shift() as PlaceEntry);
        queue = nextRound;
        round += 1;
      }
      if (!cancelled) {
        close();
        resolve(queue[0] || null);
      }
    })();
  });
}

// ───────────────────────── 滑卡模式（Tinder 風） ─────────────────────────

function swipeCardHTML(place: PlaceEntry): string {
  const config = CATEGORY_CONFIG[place.category];
  return `
    <div class="adv-swipe-card" style="--cat-color:${config?.color || '#999'}">
      <div class="adv-swipe-stamp adv-swipe-stamp--like">想去</div>
      <div class="adv-swipe-stamp adv-swipe-stamp--nope">先跳過</div>
      <div class="adv-swipe-card-tag">${config?.label || place.category}</div>
      <div class="adv-swipe-card-body">
        <div class="adv-swipe-card-name">${place.name}</div>
        ${metaLine(place) ? `<div class="adv-swipe-card-meta">📍 ${metaLine(place)}</div>` : ''}
        ${place.note ? `<p class="adv-swipe-card-note">${place.note}</p>` : ''}
      </div>
    </div>
  `;
}

/** 滑卡模式：把願望清單變成 Tinder 式左右滑決策，回傳「想去」的地點清單 */
export function openSwipeDeckModal(
  ideas: PlaceEntry[],
  onGo: (place: PlaceEntry) => void
): void {
  const deck = shuffle(ideas);
  let index = 0;

  const root = document.createElement('div');
  root.className = 'adv-swipe-overlay';
  root.innerHTML = `
    <div class="adv-swipe-header">
      <span id="adv-swipe-progress"></span>
      <button class="adv-swipe-close" id="adv-swipe-close">✕</button>
    </div>
    <div class="adv-swipe-stack" id="adv-swipe-stack"></div>
    <div class="adv-swipe-actions">
      <button class="adv-swipe-btn adv-swipe-btn--nope" id="adv-swipe-nope" title="先跳過">✕</button>
      <button class="adv-swipe-btn adv-swipe-btn--like" id="adv-swipe-like" title="想去">🙋</button>
    </div>
  `;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  const close = () => {
    document.body.style.overflow = '';
    root.remove();
  };

  root.querySelector('#adv-swipe-close')?.addEventListener('click', close);

  const stackEl = root.querySelector('#adv-swipe-stack') as HTMLElement;
  const progressEl = root.querySelector('#adv-swipe-progress') as HTMLElement;

  function render() {
    progressEl.textContent = `${Math.min(index + 1, deck.length)} / ${deck.length}`;

    if (index >= deck.length) {
      stackEl.innerHTML = `
        <div class="adv-swipe-empty">
          <div class="adv-swipe-empty-emoji">🎉</div>
          <p>願望清單都看過一輪囉！</p>
          <button class="adv-modal-btn adv-modal-btn--primary" id="adv-swipe-restart">再滑一輪</button>
        </div>
      `;
      stackEl.querySelector('#adv-swipe-restart')?.addEventListener('click', () => {
        index = 0;
        render();
      });
      return;
    }

    const next = deck[index + 1];
    stackEl.innerHTML = [
      next ? `<div class="adv-swipe-card-wrap adv-swipe-card-wrap--behind">${swipeCardHTML(next)}</div>` : '',
      `<div class="adv-swipe-card-wrap adv-swipe-card-wrap--top" id="adv-swipe-top">${swipeCardHTML(deck[index])}</div>`,
    ].join('');

    bindDrag();
  }

  function commit(direction: 'like' | 'nope') {
    const place = deck[index];
    if (direction === 'like') onGo(place);
    index += 1;
    render();
  }

  function flyOut(direction: 'like' | 'nope') {
    const topWrap = root.querySelector('#adv-swipe-top') as HTMLElement | null;
    if (!topWrap) return;
    vibrate(direction === 'like' ? [10, 30, 10] : 10);
    const sign = direction === 'like' ? 1 : -1;
    topWrap.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
    topWrap.style.transform = `translate(${sign * 600}px, -40px) rotate(${sign * 30}deg)`;
    topWrap.style.opacity = '0';
    window.setTimeout(() => commit(direction), 220);
  }

  function bindDrag() {
    const wrap = root.querySelector('#adv-swipe-top') as HTMLElement | null;
    if (!wrap) return;
    const card = wrap.querySelector('.adv-swipe-card') as HTMLElement;
    const likeStamp = wrap.querySelector('.adv-swipe-stamp--like') as HTMLElement;
    const nopeStamp = wrap.querySelector('.adv-swipe-stamp--nope') as HTMLElement;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      startX = e.clientX - dx;
      startY = e.clientY - dy;
      card.setPointerCapture(e.pointerId);
      card.style.transition = 'none';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      dy = (e.clientY - startY) * 0.3;
      const rotate = dx / 18;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;
      const ratio = Math.min(Math.abs(dx) / 100, 1);
      likeStamp.style.opacity = dx > 0 ? `${ratio}` : '0';
      nopeStamp.style.opacity = dx < 0 ? `${ratio}` : '0';
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      const threshold = 100;
      if (dx > threshold) {
        flyOut('like');
      } else if (dx < -threshold) {
        flyOut('nope');
      } else {
        card.style.transition = 'transform 0.3s ease';
        card.style.transform = 'translate(0, 0) rotate(0)';
        likeStamp.style.opacity = '0';
        nopeStamp.style.opacity = '0';
        dx = 0;
        dy = 0;
      }
    };

    card.addEventListener('pointerdown', onPointerDown);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerUp);
    card.addEventListener('pointercancel', onPointerUp);
  }

  root.querySelector('#adv-swipe-nope')?.addEventListener('click', () => flyOut('nope'));
  root.querySelector('#adv-swipe-like')?.addEventListener('click', () => flyOut('like'));

  render();
}

export function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--adv-brown); color: #fff; padding: 10px 20px; border-radius: 100px;
    font-size: 0.85rem; font-weight: 600; z-index: 10001; box-shadow: 0 8px 20px rgba(0,0,0,0.25);
    max-width: 90vw; text-align: center;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
