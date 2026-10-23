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
  IDEA_TIER,
  IdeaTier,
  ideaTier,
} from './data';
import { IDENTITIES, Identity, Guide, GuideStop, Season, Scene, GuideDuration, Achievement, Trip } from './supabase';
import { speechSupported, speak, stopSpeech, currentSpeech, setSpeechListener, SpeechState } from './voice';
import { PosterData, PosterStop, drawPoster, drawGantt, ganttAvailable, ensurePosterFonts, exportPng } from './poster';

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
  /** 一次退回願望清單；scope 是給確認視窗看的說明，例如「提案中」「10/25 的行程」 */
  onBulkReset: (places: PlaceEntry[], scope: string) => void;
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

/** 只有 2 筆以上才出現；1 筆時卡片上的單筆按鈕就夠了 */
function bulkResetBar(section: 'proposed' | 'itinerary', count: number, label: string): string {
  if (count < 2) return '';
  return `<div class="adv-bulk-bar"><button type="button" class="adv-day-poster" data-bulk-reset="${section}">🧹 ${label}（${count}）</button></div>`;
}

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

let ideaTierSel: IdeaTier = 'mrt';
/** 記住展開的區域；Realtime 更新重繪時才不會整個收起來 */
const openIdeaGroups = new Set<string>();
/** 分組內地點不超過這個數（例如搜尋後）就全部展開，不必一個個點 */
const IDEA_OPEN_ALL = 12;

interface IdeaGroup {
  key: string;
  label: string;
  places: PlaceEntry[];
}

/** 旅行分組裡單一縣市超過這個數（例如台中）就改依鄉鎮區拆開 */
const TRIP_SPLIT_COUNTY = 30;

/**
 * 近的（捷運、週末）依鄉鎮區分組，一組約等於一次約會能逛完的範圍；
 * 旅行依縣市分組（排旅行是先決定去哪個縣）；活動點子沒有地點，改依分類
 */
function groupIdeas(tier: IdeaTier, ideas: PlaceEntry[]): IdeaGroup[] {
  const countyCount = new Map<string, number>();
  ideas.forEach(p => p.area && countyCount.set(p.area.slice(0, 3), (countyCount.get(p.area.slice(0, 3)) ?? 0) + 1));
  const groups = new Map<string, IdeaGroup>();
  for (const p of ideas) {
    let key: string;
    let label: string;
    if (tier === 'activity') {
      key = p.category;
      label = CATEGORY_CONFIG[p.category]?.label ?? p.category;
    } else if (!p.area) {
      key = '';
      label = '還沒有區域';
    } else if (tier === 'trip' && (countyCount.get(p.area.slice(0, 3)) ?? 0) <= TRIP_SPLIT_COUNTY) {
      key = p.area.slice(0, 3);
      label = key;
    } else {
      key = p.area;
      // 「台北市大安區」→「台北 大安區」
      label = p.area.length > 3 ? `${p.area.slice(0, 2)} ${p.area.slice(3)}` : p.area;
    }
    const group = groups.get(key) ?? { key, label, places: [] };
    group.places.push(p);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort(
    (a, b) =>
      Number(a.key === '') - Number(b.key === '') ||
      b.places.length - a.places.length ||
      a.label.localeCompare(b.label, 'zh-Hant')
  );
}

/** 收合的區域不產生地點列，展開時才補上並綁定按鈕；幾百筆不會一次塞進 DOM */
function renderIdeaGroups(mount: HTMLElement, ideas: PlaceEntry[], actions: CardActions) {
  const groups = groupIdeas(ideaTierSel, ideas);
  const openAll = ideas.length <= IDEA_OPEN_ALL;
  mount.innerHTML = groups
    .map(g => {
      const id = `${ideaTierSel}:${g.key}`;
      return `
        <details class="adv-idea-group" data-group="${id}" ${openAll || openIdeaGroups.has(id) ? 'open' : ''}>
          <summary class="adv-idea-group-head">
            <span class="adv-idea-group-name">${g.label}</span>
            <span class="adv-idea-group-count">${g.places.length}</span>
          </summary>
          <div class="adv-idea-group-body"></div>
        </details>`;
    })
    .join('');

  mount.querySelectorAll<HTMLDetailsElement>('details[data-group]').forEach((el, i) => {
    const group = groups[i];
    const body = el.querySelector<HTMLElement>('.adv-idea-group-body');
    const fill = () => {
      if (!body || body.childElementCount) return;
      body.innerHTML = group.places.map(ideaRow).join('');
      bindActions(body, group.places, actions);
    };
    if (el.open) fill();
    el.addEventListener('toggle', () => {
      const id = el.dataset.group || '';
      if (el.open) {
        openIdeaGroups.add(id);
        fill();
      } else {
        openIdeaGroups.delete(id);
      }
    });
  });
}

/** 願望清單分組按鈕；目前分組被篩選成空的時，自動跳到第一個有地點的分組 */
function renderIdeaTiers(ideas: PlaceEntry[], rerender: () => void): PlaceEntry[] {
  const tiers = Object.keys(IDEA_TIER) as IdeaTier[];
  const counts = Object.fromEntries(tiers.map(t => [t, 0])) as Record<IdeaTier, number>;
  ideas.forEach(p => counts[ideaTier(p)]++);
  if (counts[ideaTierSel] === 0) ideaTierSel = tiers.find(t => counts[t] > 0) ?? ideaTierSel;

  const mount = document.getElementById('adv-idea-tiers');
  if (mount) {
    bindHorizontalWheel(mount);
    mount.innerHTML = tiers
      .filter(t => counts[t] > 0)
      .map(t => {
        const active = t === ideaTierSel;
        return `<button class="adv-guide-season ${active ? 'is-active' : ''}" data-idea-tier="${t}" aria-pressed="${active}" title="${IDEA_TIER[t].hint}">${IDEA_TIER[t].label}<span class="adv-guide-season-count">${counts[t]}</span></button>`;
      })
      .join('');
    mount.querySelectorAll<HTMLElement>('[data-idea-tier]').forEach(el => {
      el.addEventListener('click', () => {
        ideaTierSel = el.dataset.ideaTier as IdeaTier;
        rerender();
      });
    });
  }
  return ideas.filter(p => ideaTier(p) === ideaTierSel);
}

export function renderSections(allPlaces: PlaceEntry[], actions: CardActions) {
  const allIdeas = allPlaces.filter(p => p.status === 'idea');
  const ideas = renderIdeaTiers(allIdeas, () => renderSections(allPlaces, actions));
  const proposed = allPlaces.filter(p => p.status === 'proposed');
  const itinerary = allPlaces.filter(p => p.status === 'confirmed' || p.status === 'done');

  const ideaMount = document.getElementById('adv-section-idea');
  const proposedMount = document.getElementById('adv-section-proposed');
  const itineraryMount = document.getElementById('adv-section-itinerary');

  if (ideaMount) {
    if (ideas.length) renderIdeaGroups(ideaMount, ideas, actions);
    else ideaMount.innerHTML = `<p class="adv-empty">目前沒有這個分類的願望清單項目</p>`;
  }

  if (proposedMount) {
    proposedMount.innerHTML = proposed.length
      ? bulkResetBar('proposed', proposed.length, '全部退回願望清單') + proposed.map(proposedCard).join('')
      : `<div class="adv-empty">還沒有人提案，按「＋ 新增提案」或從願望清單挑一個<br>
          <button type="button" class="adv-empty__action" data-goto-tab="idea">💭 去願望清單挑一個 →</button></div>`;
    bindActions(proposedMount, proposed, actions);
    proposedMount.querySelector('[data-bulk-reset="proposed"]')?.addEventListener('click', () => {
      actions.onBulkReset(proposed, '提案中');
    });
  }

  if (itineraryMount) {
    if (itinerary.length) {
      const groups = groupItineraryByDay(itinerary);
      // 已去過（done）是紀錄，不在退回範圍
      const pending = (places: PlaceEntry[]) => places.filter((p) => p.status === 'confirmed');
      itineraryMount.innerHTML = bulkResetBar('itinerary', pending(itinerary).length, '清空還沒去的行程') + groups
        .map(([dayKey, places]) => `
          <div class="adv-day-group">
            <div class="adv-day-header">
              <span>${dayLabel(dayKey)}</span>
              <span class="adv-day-tools">
                ${pending(places).length ? `<button class="adv-day-poster" data-day-reset="${dayKey}" title="這天還沒去的地點全部退回願望清單">↩️ 退回</button>` : ''}
                <button class="adv-day-poster" data-day-poster="${dayKey}" title="把這天的行程做成海報">🎨 海報</button>
              </span>
            </div>
            <div class="adv-day-cards" data-day="${dayKey}">
              ${places.map((p, i) => itineraryCard(p, i + 1, places.length)).join('')}
            </div>
          </div>
        `)
        .join('');
      bindActions(itineraryMount, itinerary, actions);
      itineraryMount.querySelectorAll<HTMLElement>('[data-day-poster]').forEach((btn) => {
        const group = groups.find(([key]) => key === btn.dataset.dayPoster);
        if (group) btn.addEventListener('click', () => openPosterModal(dayPosterData(group[0], group[1])));
      });
      itineraryMount.querySelectorAll<HTMLElement>('[data-day-reset]').forEach((btn) => {
        const group = groups.find(([key]) => key === btn.dataset.dayReset);
        if (group) btn.addEventListener('click', () => actions.onBulkReset(pending(group[1]), dayLabel(group[0])));
      });
      itineraryMount.querySelector('[data-bulk-reset="itinerary"]')?.addEventListener('click', () => {
        actions.onBulkReset(pending(itinerary), '行程中還沒去的地點');
      });
      setupDayDragAndDrop(itineraryMount, actions.onReorder);
    } else {
      itineraryMount.innerHTML = `<p class="adv-empty">還沒有定案的行程，去「提案中」按 ✅ 定案吧！</p>`;
    }
  }

  const counts: Record<string, number> = {
    idea: allIdeas.length,
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

function guideCardHTML(guide: Guide, placeById: Map<number, PlaceEntry>, tripDay: string): string {
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
          ${tripDay ? `<span class="adv-guide-tag adv-guide-tag--season">${tripDay}</span>` : ''}
          ${guide.region ? `<span class="adv-guide-tag">📍 ${esc(guide.region)}</span>` : ''}
          ${guide.scenes.length ? `<span class="adv-guide-tag">${guide.scenes.map((s) => SCENE_LABEL[s]).join(' ')}</span>` : ''}
          ${guide.duration && !tripDay ? `<span class="adv-guide-tag">${DURATION_LABEL[guide.duration]}</span>` : ''}
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
          <button class="adv-card-btn" data-guide-action="poster" data-guide-id="${guide.id}">🎨 海報</button>
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

const SCENE_LABEL: Record<Scene, string> = {
  mountain: '⛰️ 山',
  sea: '🌊 海',
  city: '🏙️ 城鎮',
};

const DURATION_LABEL: Record<GuideDuration, string> = {
  half: '⏱️ 半日',
  day: '☀️ 一日',
  multi: '🧳 多日',
};

/** 三組條件各自 'all' = 不篩選；季節的 'anytime' = 只看全年皆宜（seasons 為空） */
export interface GuideFilter {
  season: 'all' | 'anytime' | Season;
  scene: 'all' | Scene;
  duration: 'all' | GuideDuration;
}

export const GUIDE_FILTER_ALL: GuideFilter = { season: 'all', scene: 'all', duration: 'all' };

function matchOwn(guide: Guide, f: GuideFilter): boolean {
  if (f.season === 'anytime' && guide.seasons.length) return false;
  if (f.season !== 'all' && f.season !== 'anytime' && !guide.seasons.includes(f.season)) return false;
  if (f.scene !== 'all' && !guide.scenes.includes(f.scene)) return false;
  if (f.duration !== 'all' && guide.duration !== f.duration) return false;
  return true;
}

/** 多日旅行（同 trip_key）只要其中一天符合，整趟都留下，避免篩「海」只剩 Day 1 */
function filterGuideList(guides: Guide[], f: GuideFilter): Guide[] {
  const tripHit = new Set(guides.filter((g) => g.trip_key && matchOwn(g, f)).map((g) => g.trip_key));
  return guides.filter((g) => (g.trip_key ? tripHit.has(g.trip_key) : matchOwn(g, f)));
}

/** 同一趟旅行的第幾天，例如「第 2／3 天」 */
function tripDayLabel(guide: Guide, all: Guide[]): string {
  if (!guide.trip_key) return '';
  const days = all.filter((g) => g.trip_key === guide.trip_key);
  return `🧳 第 ${days.indexOf(guide) + 1}／${days.length} 天`;
}

/** 季節｜場景｜天數 擠在同一條橫捲列，手機首屏不多佔兩排；再點一次已選的按鈕即取消 */
function renderGuideFilterBar(guides: Guide[], current: GuideFilter, onChange: (next: GuideFilter) => void) {
  const bar = document.getElementById('adv-guide-seasons');
  if (!bar) return;
  bindHorizontalWheel(bar);

  type Key = keyof GuideFilter;
  const chip = (key: Key, value: string, label: string) => {
    const active = current[key] === value;
    const count = filterGuideList(guides, { ...current, [key]: value } as GuideFilter).length;
    return `<button class="adv-guide-season ${active ? 'is-active' : ''}" data-gf-key="${key}" data-gf-value="${value}" aria-pressed="${active}">${label}<span class="adv-guide-season-count">${count}</span></button>`;
  };
  const sep = '<span class="adv-guide-filter-sep" aria-hidden="true"></span>';
  const noneActive = current.season === 'all' && current.scene === 'all' && current.duration === 'all';

  bar.innerHTML = [
    `<button class="adv-guide-season ${noneActive ? 'is-active' : ''}" data-gf-reset aria-pressed="${noneActive}">全部<span class="adv-guide-season-count">${guides.length}</span></button>`,
    sep,
    ...(Object.entries(SEASON_LABEL) as [Season, string][]).map(([v, l]) => chip('season', v, l)),
    chip('season', 'anytime', '全年皆宜'),
    sep,
    ...(Object.entries(SCENE_LABEL) as [Scene, string][]).map(([v, l]) => chip('scene', v, l)),
    sep,
    ...(Object.entries(DURATION_LABEL) as [GuideDuration, string][]).map(([v, l]) => chip('duration', v, l)),
  ].join('');

  bar.querySelector('[data-gf-reset]')?.addEventListener('click', () => onChange(GUIDE_FILTER_ALL));
  bar.querySelectorAll<HTMLElement>('[data-gf-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.gfKey as Key;
      const value = btn.dataset.gfValue as string;
      onChange({ ...current, [key]: current[key] === value ? 'all' : value } as GuideFilter);
    });
  });
}

/** 懶人包：別人怎麼排一日行程，每一站都對應到單一座標的地點 */
export function renderGuides(
  searchedGuides: Guide[],
  allPlaces: PlaceEntry[],
  filter: GuideFilter,
  onFilterChange: (next: GuideFilter) => void,
  onApply: (guide: Guide) => void
) {
  const mount = document.getElementById('adv-section-guides');
  if (!mount) return;

  renderGuideFilterBar(searchedGuides, filter, onFilterChange);
  const guides = filterGuideList(searchedGuides, filter);

  const placeById = new Map(allPlaces.map((p) => [p.id, p]));
  const openIds = new Set(
    Array.from(mount.querySelectorAll('.adv-guide-detail:not([hidden])')).map((el) => el.id)
  );

  mount.innerHTML = guides.length
    ? guides.map((g) => guideCardHTML(g, placeById, tripDayLabel(g, searchedGuides))).join('')
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
      if (btn.dataset.guideAction === 'poster') {
        openPosterModal(guidePosterData(guide, placeById));
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

// ───────────────────────── 行程海報 ─────────────────────────

function posterStop(seq: number, label: string, timeText: string | null, place: PlaceEntry | undefined, extra: string | null): PosterStop {
  const config = place ? CATEGORY_CONFIG[place.category] : undefined;
  return { seq, label, timeText, color: config?.color || '#8C6A55', categoryLabel: config?.label || null, extra };
}

function safeFilename(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '行程';
}

function guidePosterData(guide: Guide, placeById: Map<number, PlaceEntry>): PosterData {
  const stops = guide.stops.map((s) => {
    const place = s.place_id != null ? placeById.get(s.place_id) : undefined;
    const extra = [s.must_try ? `⭐ ${s.must_try}` : '', s.cost ? `💰 ${s.cost}` : ''].filter(Boolean).join('   ') || s.tip;
    return posterStop(s.seq, s.label, s.time_text, place, extra || null);
  });
  const subtitle = [
    guide.region ? `📍 ${guide.region}` : '',
    guide.seasons.map((s) => SEASON_LABEL[s]).join(' '),
    `${guide.stops.length} 站`,
  ].filter(Boolean).join('  ·  ');
  return {
    title: guide.title,
    subtitle,
    summary: guide.summary,
    stops,
    footnote: guide.source ? `來源：${guide.source}` : null,
    filename: `${safeFilename(guide.title)}.png`,
  };
}

/** 某一天已定案的行程：地點沒有時段資料，所以只有繪卷海報 */
function dayPosterData(dayKey: string, places: PlaceEntry[]): PosterData {
  const label = dayLabel(dayKey).replace(/^📅 |^📌 /, '');
  const regions = Array.from(new Set(places.map((p) => (p.region ? REGION_LABEL[p.region] : '')).filter(Boolean)));
  return {
    title: dayKey === UNSCHEDULED_KEY ? '還沒排日期的行程' : `${label}的約會`,
    subtitle: [regions.length ? `📍 ${regions.join('、')}` : '', `${places.length} 站`].filter(Boolean).join('  ·  '),
    summary: null,
    stops: places.map((p, i) => posterStop(i + 1, p.name, null, p, metaLine(p) || p.note || null)),
    footnote: null,
    filename: `${safeFilename(dayKey === UNSCHEDULED_KEY ? '未排日期行程' : dayKey)}.png`,
  };
}

type PosterMode = 'poster' | 'gantt';

export function openPosterModal(data: PosterData) {
  const canGantt = ganttAvailable(data.stops);
  const { root, close } = openModal(`
    <h3>🎨 行程海報</h3>
    <div class="adv-poster-tabs" role="tablist">
      <button class="adv-poster-tab is-active" data-poster-mode="poster" role="tab" aria-selected="true">繪卷海報</button>
      <button class="adv-poster-tab" data-poster-mode="gantt" role="tab" aria-selected="false" ${canGantt ? '' : 'disabled title="至少要兩站寫了時間（例如 10:00）才畫得出甘特圖"'}>時程甘特</button>
    </div>
    ${canGantt ? '' : '<div class="adv-poster-hint">這條行程沒寫時間，只能做繪卷海報</div>'}
    <div class="adv-poster-preview"><canvas id="adv-poster-canvas"></canvas></div>
    <div class="adv-modal-actions">
      <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-poster-close">關閉</button>
      <button class="adv-modal-btn adv-modal-btn--primary" id="adv-poster-save">下載 PNG</button>
    </div>
  `);
  root.querySelector('.adv-modal')?.classList.add('adv-modal--poster');

  const canvas = root.querySelector('#adv-poster-canvas') as HTMLCanvasElement;
  const saveBtn = root.querySelector('#adv-poster-save') as HTMLButtonElement;
  let mode: PosterMode = 'poster';

  const render = async () => {
    try {
      await ensurePosterFonts();
    } catch (err) {
      console.warn('海報字型載入失敗，改用系統字型', err);
    }
    if (mode === 'gantt') drawGantt(canvas, data);
    else drawPoster(canvas, data);
  };

  root.querySelectorAll<HTMLButtonElement>('[data-poster-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.posterMode as PosterMode;
      root.querySelectorAll<HTMLButtonElement>('[data-poster-mode]').forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', `${active}`);
      });
      render();
    });
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const filename = mode === 'gantt' ? data.filename.replace(/\.png$/, '-時程.png') : data.filename;
      const result = await exportPng(canvas, filename);
      if (result === 'downloaded') showToast('📥 已下載海報');
    } catch (err) {
      console.error('海報匯出失敗', err);
      showToast('海報匯出失敗，請再試一次');
    } finally {
      saveBtn.disabled = false;
    }
  });
  root.querySelector('#adv-poster-close')?.addEventListener('click', close);

  render();
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

const PLACE_NEARNESS: Record<string, number> = { confirmed: 3, proposed: 2, idea: 1 };
const ACH_PREVIEW = 9;
let achExpanded = false;

/** 成就分頁：稱號 + 徽章進度（兼分類篩選）+ 成就卡片 */
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
  if (!mount || !summary) return;

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
    <div class="adv-ach-badges" role="group" aria-label="依分類篩選成就（再點一次看全部）">
      ${cats.map(([key, cfg]) => {
        const got = all.filter((a) => a.category === key && isUnlocked(a)).length;
        const earned = got >= cfg.badge.threshold;
        const active = filter === key;
        return `<button type="button" class="adv-ach-badge ${earned ? 'is-earned' : ''} ${active ? 'is-active' : ''}" data-ach-filter="${key}" aria-pressed="${active}" style="--cat-color:${cfg.color}" title="${cfg.label}：解鎖 ${cfg.badge.threshold} 項得徽章，點一下只看這類">
          <span class="adv-ach-badge-icon">${cfg.emoji}</span>
          <span class="adv-ach-badge-name">${cfg.badge.name}</span>
          <span class="adv-ach-badge-count">${Math.min(got, cfg.badge.threshold)}/${cfg.badge.threshold}</span>
        </button>`;
      }).join('')}
    </div>
  `;
  summary.querySelectorAll<HTMLElement>('[data-ach-filter]').forEach((btn) => {
    const key = btn.dataset.achFilter as AchievementFilter;
    btn.addEventListener('click', () => onFilterChange(filter === key ? 'all' : key));
  });

  // 進度優先：未解鎖的依「離完成多近」排序（連結地點已排進行程 > 提案中 > 在願望清單 > 沒有地點），再依難度由易到難
  const nearness = (a: Achievement) =>
    Math.max(0, ...a.place_ids.map((id) => PLACE_NEARNESS[placeById.get(id)?.status || ''] || 0));
  const order = cats.map(([k]) => k);
  const shown = searched
    .filter((a) => filter === 'all' || a.category === filter)
    .sort((x, y) =>
      Number(isUnlocked(x)) - Number(isUnlocked(y)) ||
      nearness(y) - nearness(x) ||
      x.difficulty - y.difficulty ||
      order.indexOf(x.category) - order.indexOf(y.category) ||
      x.sort_order - y.sort_order
    );

  // 「全部」且沒在搜尋時只先列最接近完成的幾項，其餘收合
  const collapsible = filter === 'all' && searched.length === all.length && !achExpanded;
  const visible = collapsible ? shown.slice(0, ACH_PREVIEW) : shown;
  const hiddenCount = shown.length - visible.length;

  mount.innerHTML = visible.length
    ? visible.map((a) => achievementCardHTML(a, placeById)).join('') +
      (hiddenCount > 0 ? `<button type="button" class="adv-more-btn" data-ach-more>顯示全部 ${shown.length} 項成就</button>` : '')
    : `<p class="adv-empty">沒有符合的成就</p>`;
  mount.querySelector('[data-ach-more]')?.addEventListener('click', () => {
    achExpanded = true;
    onFilterChange(filter);
  });

  mount.querySelectorAll<HTMLElement>('[data-ach-action]').forEach((btn) => {
    const a = shown.find((x) => x.id === parseInt(btn.dataset.achId || '0'));
    if (!a) return;
    btn.addEventListener('click', () => (btn.dataset.achAction === 'unlock' ? onUnlock(a) : onUndo(a)));
  });

  document.querySelectorAll('.adv-section-count[data-section="achievements"]').forEach((el) => {
    el.textContent = `${total}`;
  });
}

function tripCardHTML(trip: Trip, placeCount: number): string {
  return `
    <div class="adv-card adv-trip-card">
      <span class="adv-trip-emoji" aria-hidden="true">${esc(trip.emoji) || '✈️'}</span>
      <div class="adv-trip-body">
        <div class="adv-guide-title">${esc(trip.title)}</div>
        ${trip.date_text ? `<div class="adv-trip-date">${esc(trip.date_text)}</div>` : ''}
        ${trip.summary ? `<div class="adv-guide-summary">${esc(trip.summary)}</div>` : ''}
        ${trip.tags.length ? `<div class="adv-guide-meta">${trip.tags.map((t) => `<span class="adv-guide-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="adv-card-actions">
          <a class="adv-card-btn adv-card-btn--primary" href="/adventure-map/${encodeURIComponent(trip.slug)}/">📖 完整行程</a>
          ${placeCount ? `<button type="button" class="adv-card-btn" data-trip-map="${esc(trip.slug)}">🗺️ 行程地圖</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

/** 旅行分頁：每趟旅行一張卡片，可開完整介紹頁，或開該地區存過的地點地圖 */
export function renderTrips(
  all: Trip[],
  searched: Trip[],
  placeCount: (trip: Trip) => number,
  onOpenMap: (trip: Trip) => void
) {
  const mount = document.getElementById('adv-section-trips');
  if (!mount) return;

  mount.innerHTML = searched.length
    ? searched.map((t) => tripCardHTML(t, placeCount(t))).join('')
    : `<p class="adv-empty">${all.length ? '沒有符合的旅行' : '還沒有旅行介紹頁'}</p>`;
  mount.querySelectorAll<HTMLElement>('[data-trip-map]').forEach((btn) => {
    const trip = searched.find((t) => t.slug === btn.dataset.tripMap);
    if (trip) btn.addEventListener('click', () => onOpenMap(trip));
  });

  document.querySelectorAll('.adv-section-count[data-section="trips"]').forEach((el) => {
    el.textContent = `${all.length}`;
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
