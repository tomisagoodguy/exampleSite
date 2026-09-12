import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG, CategoryConfig, calculateStats, colorToFade } from './data';
import { IDENTITIES, Identity } from './supabase';

export function updateStatsUI(allPlaces: PlaceEntry[]) {
  const { total, done, percent } = calculateStats(allPlaces);

  const elTotal = document.getElementById('total-count');
  const elDone = document.getElementById('done-count');
  const elBar = document.getElementById('progress-bar');
  const elLabel = document.getElementById('progress-label');

  if (elTotal) elTotal.textContent = total.toString();
  if (elDone) elDone.textContent = done.toString();
  if (elBar) elBar.style.width = `${percent}%`;
  if (elLabel) elLabel.textContent = `${percent}% 解鎖`;
}

/** 依實際出現在資料中的分類，動態產生篩選 chips */
export function renderFilterBar(
  places: PlaceEntry[],
  currentCat: string,
  onSelect: (cat: string) => void
) {
  const mount = document.getElementById('adv-filter-mount');
  if (!mount) return;

  const usedCats = Array.from(new Set(places.map(p => p.category)));

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
}

function navQuery(place: PlaceEntry): string {
  if (place.lat != null && place.lng != null) return `${place.lat},${place.lng}`;
  return encodeURIComponent(place.address || place.mrt_station || place.name);
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
        <button class="adv-card-btn adv-card-btn--ghost" data-action="edit" data-id="${place.id}">✏️ 修改</button>
        <button class="adv-card-btn adv-card-btn--ghost" data-action="unpropose" data-id="${place.id}">回到願望清單</button>
        <button class="adv-card-btn adv-card-btn--danger" data-action="delete" data-id="${place.id}">🗑 刪除</button>
        <button class="adv-card-btn adv-card-btn--primary" data-action="confirm" data-id="${place.id}">✅ 定案</button>
      </div>
    </div>
  `;
}

function itineraryCard(place: PlaceEntry): string {
  const config = CATEGORY_CONFIG[place.category];
  const isDone = place.status === 'done';

  return `
    <div class="adv-card adv-card--draggable ${isDone ? 'adv-card--done' : ''}"
         style="--cat-color:${config?.color || '#999'}"
         draggable="true"
         data-id="${place.id}">
      <span class="adv-drag-handle" title="拖曳排序">⠿</span>
      <div class="adv-card-tag" style="background:${config?.color || '#999'}">${config?.label || place.category}</div>
      <div class="adv-card-name">${place.name}${isDone ? ' 🏁' : ''}</div>
      ${metaLine(place) ? `<div class="adv-card-meta">${metaLine(place)}</div>` : ''}
      ${place.note ? `<p class="adv-card-note">${place.note.replace(/\n/g, '<br>')}</p>` : ''}
      <div class="adv-card-actions">
        <a class="adv-card-btn" href="https://www.google.com/maps?q=${navQuery(place)}" target="_blank" rel="noopener">🗺️ 導航</a>
        <button class="adv-card-btn adv-card-btn--ghost" data-action="reschedule" data-id="${place.id}">📅 ${place.visit_date || '排日期'}</button>
        <button class="adv-card-btn adv-card-btn--ghost" data-action="edit" data-id="${place.id}">✏️ 修改</button>
        <button class="adv-card-btn adv-card-btn--danger" data-action="delete" data-id="${place.id}">🗑 刪除</button>
        ${isDone
          ? `<button class="adv-card-btn adv-card-btn--ghost" data-action="reopen" data-id="${place.id}">↩ 重新開放</button>`
          : `<button class="adv-card-btn adv-card-btn--primary" data-action="done" data-id="${place.id}">🏁 標記已去過</button>`
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
      else if (action === 'expand') {
        const detail = document.getElementById(`adv-row-detail-${place.id}`);
        if (detail) detail.hidden = !detail.hidden;
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
              ${places.map(itineraryCard).join('')}
            </div>
          </div>
        `)
        .join('');
      bindActions(itineraryMount, itinerary, actions);
      setupDayDragAndDrop(itineraryMount, actions.onReorder);
    } else {
      itineraryMount.innerHTML = `<p class="adv-empty">還沒有定案的行程</p>`;
    }
  }

  document.querySelectorAll('.adv-section-count').forEach(el => {
    const section = (el as HTMLElement).dataset.section;
    const count = section === 'idea' ? ideas.length : section === 'proposed' ? proposed.length : itinerary.length;
    el.textContent = `${count}`;
  });
}

// ───────────────────────── Modals ─────────────────────────

function openModal(innerHTML: string): { root: HTMLElement; close: () => void } {
  const root = document.createElement('div');
  root.className = 'adv-modal-backdrop';
  root.innerHTML = `<div class="adv-modal">${innerHTML}</div>`;
  document.body.appendChild(root);

  const close = () => root.remove();
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
}

export function openProposeModal(
  defaults: Partial<{ name: string; category: string; address: string; note: string; proposedBy: string }>,
  mode: 'create' | 'edit' = 'create'
): Promise<ProposeFormResult | null> {
  return new Promise((resolve) => {
    const categoryOptions = Object.entries(CATEGORY_CONFIG)
      .map(([key, cfg]) => `<option value="${key}" ${defaults.category === key ? 'selected' : ''}>${cfg.label}</option>`)
      .join('');

    const { root, close } = openModal(`
      <h3>${mode === 'edit' ? '修改地點' : '新增約會提案'}</h3>
      <label>地點名稱</label>
      <input type="text" id="adv-pf-name" value="${defaults.name || ''}" />
      <label>分類</label>
      <select id="adv-pf-category">${categoryOptions}</select>
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

      close();
      resolve({ name, category, address, note, proposedBy });
    });
  });
}

export function openMarkDoneModal(): Promise<{ visitDate: string; note: string } | null> {
  return new Promise((resolve) => {
    const today = new Date().toISOString().slice(0, 10);
    const { root, close } = openModal(`
      <h3>標記已去過</h3>
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
