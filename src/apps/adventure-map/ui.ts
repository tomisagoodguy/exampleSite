import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG, STATUS_LABEL, calculateStats, ideaPlaces } from './data';

export function getStars(rating: number = 0): string {
  const full = Math.floor(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export function updateStatsUI(places: PlaceEntry[], allPlaces: PlaceEntry[]) {
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

/** 依實際出現在資料中的分類，動態產生篩選按鈕 */
export function renderFilterBar(
  places: PlaceEntry[],
  currentCat: string,
  onSelect: (cat: string) => void
) {
  const mount = document.getElementById('adv-filter-mount');
  if (!mount) return;

  const usedCats = Array.from(new Set(places.map(p => p.category)));

  const btnHTML = (cat: string, label: string, color?: string) => `
    <button class="adv-filter-btn ${cat === currentCat ? 'adv-filter-btn--active' : ''}"
            data-cat="${cat}"
            style="${color && cat === currentCat ? `background:${color};border-color:${color};` : ''}">
      ${label}
    </button>
  `;

  mount.innerHTML = [
    btnHTML('all', '全部'),
    ...usedCats.map(cat => {
      const config = CATEGORY_CONFIG[cat];
      return btnHTML(cat, config ? config.label : cat, config?.color);
    }),
  ].join('');

  mount.querySelectorAll('.adv-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect((btn as HTMLElement).dataset.cat || 'all');
    });
  });
}

export function renderSidebarList(
  places: PlaceEntry[],
  onPlaceClick: (id: number) => void
) {
  const detailEl = document.getElementById('sidebar-detail');
  const defaultEl = document.getElementById('sidebar-default');
  if (!detailEl) return;

  const located = places.filter(p => p.lat != null && p.lng != null);

  if (located.length === 0) {
    if (defaultEl) defaultEl.style.display = 'flex';
    detailEl.style.display = 'none';
    return;
  }

  if (defaultEl) defaultEl.style.display = 'none';
  detailEl.style.display = 'block';

  const listHTML = located.map(p => {
    const config = CATEGORY_CONFIG[p.category] || CATEGORY_CONFIG.food;
    const photo = (p.photos && p.photos.length > 0) ? p.photos[0] : config.placeholder;

    return `
      <div class="adv-list-item"
           data-id="${p.id}"
           style="--cat-color: ${config.color}; --cat-color-fade: ${config.fade};">
        <div class="adv-list-img-box">
          <div class="adv-list-img" style="background-image:url('${photo}')"></div>
        </div>
        <div class="adv-list-content">
          <div class="adv-list-tag" style="background:${config.color}">${config.label}</div>
          <div class="adv-list-name">${p.name}</div>
          <div class="adv-list-stars">${getStars(p.rating)}</div>
          <div class="adv-list-meta">
            <span class="adv-list-status ${p.status}">
              ${STATUS_LABEL[p.status] || p.status}
            </span>
            <span style="font-size: 0.6rem; opacity: 0.4;">VIEW DETAILS ›</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  detailEl.innerHTML = `
    <div class="adv-list-container">
      <div class="adv-list-header">
        <span>COLLECTION (${located.length})</span>
      </div>
      <div class="adv-list-body">${listHTML}</div>
    </div>
  `;

  detailEl.querySelectorAll('.adv-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.getAttribute('data-id') || '0');
      onPlaceClick(id);
    });
  });
}

/** 願望清單：還沒有座標的 idea 項目，附「定位提案」按鈕 */
export function renderWishlist(
  allPlaces: PlaceEntry[],
  onPick: (place: PlaceEntry) => void
) {
  const mount = document.getElementById('adv-wishlist-mount');
  if (!mount) return;

  const ideas = ideaPlaces(allPlaces);
  if (ideas.length === 0) {
    mount.innerHTML = '';
    return;
  }

  const itemsHTML = ideas.map(p => {
    const config = CATEGORY_CONFIG[p.category];
    return `
      <div class="adv-wishlist-item" style="--cat-color:${config?.color || '#999'}">
        <div class="adv-wishlist-item-main">
          <span class="adv-wishlist-name">${p.name}</span>
          <span class="adv-wishlist-meta">${config?.label || p.category}${p.mrt_station ? ' · ' + p.mrt_station : ''}</span>
        </div>
        <button class="adv-wishlist-pick-btn" data-id="${p.id}">定位提案</button>
      </div>
    `;
  }).join('');

  mount.innerHTML = `
    <div class="adv-wishlist">
      <div class="adv-wishlist-header">💭 願望清單（${ideas.length}）</div>
      <div class="adv-wishlist-body">${itemsHTML}</div>
    </div>
  `;

  mount.querySelectorAll('.adv-wishlist-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0');
      const place = ideas.find(p => p.id === id);
      if (place) onPick(place);
    });
  });
}

export interface DetailActions {
  onConfirm: (place: PlaceEntry) => void;
  onMarkDone: (place: PlaceEntry) => void;
  onReopen: (place: PlaceEntry) => void;
}

export function showSidebarDetail(
  place: PlaceEntry,
  onBack: () => void,
  actions: DetailActions
) {
  const detailEl = document.getElementById('sidebar-detail');
  if (!detailEl) return;

  const config = CATEGORY_CONFIG[place.category] || CATEGORY_CONFIG.food;
  const photo = (place.photos && place.photos.length > 0) ? place.photos[0] : config.placeholder;

  const statusActionsHTML = (() => {
    if (place.status === 'proposed') {
      return `<button class="sdl-status-btn" id="sdl-confirm-btn">✅ 定案</button>`;
    }
    if (place.status === 'confirmed') {
      return `<button class="sdl-status-btn" id="sdl-done-btn">🏁 標記已去過</button>`;
    }
    if (place.status === 'done') {
      return `<button class="sdl-status-btn" id="sdl-reopen-btn">↩ 重新開放提案</button>`;
    }
    return '';
  })();

  detailEl.innerHTML = `
    <div class="adv-sidebar__detail">
      <div class="sdl-photo-hero" style="background-image: url('${photo}')">
        <div class="sdl-hero-overlay"></div>
        <button class="sdl-close-btn" id="sdl-close-btn">✕</button>
      </div>

      <div class="sdl-header" style="background: linear-gradient(to bottom, ${config.fade}, transparent);">
        <span class="sdl-category-badge" style="background:${config.color}; color:#fff;">${config.label}</span>
        <h3 class="sdl-place-name">${place.name}</h3>
        <div class="sdl-status sdl-status--${place.status === 'done' ? 'done' : 'pending'}">${STATUS_LABEL[place.status] || place.status}</div>
        <div class="sdl-status-actions">${statusActionsHTML}</div>
      </div>

      <div class="sdl-body">
        ${place.note ? `
        <div class="sdl-section">
          <div class="sdl-label">提案備註</div>
          <p class="sdl-description">${place.note}</p>
        </div>
        ` : ''}

        ${place.proposed_by ? `
        <div class="sdl-info-block">
          <div class="sdl-info-label">提案人</div>
          <p class="sdl-info-text">${place.proposed_by}</p>
        </div>
        ` : ''}

        <div class="sdl-info-block">
          <div class="sdl-info-label">地址 / 捷運站</div>
          <p class="sdl-info-text">${place.address || place.mrt_station || '尚未填寫'}</p>
        </div>

        ${place.visit_date ? `
        <div class="sdl-info-block">
          <div class="sdl-info-label">去過的日期</div>
          <p class="sdl-info-text">${place.visit_date}</p>
        </div>
        ` : ''}

        <div class="sdl-footer">
          <button class="sdl-nav-btn" onclick="window.open('https://www.google.com/maps?q=${place.lat},${place.lng}')">
             GOOGLE MAPS 導航
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('sdl-close-btn')?.addEventListener('click', onBack);
  document.getElementById('sdl-confirm-btn')?.addEventListener('click', () => actions.onConfirm(place));
  document.getElementById('sdl-done-btn')?.addEventListener('click', () => actions.onMarkDone(place));
  document.getElementById('sdl-reopen-btn')?.addEventListener('click', () => actions.onReopen(place));
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
  note: string;
  proposedBy: string;
  lat: number | null;
  lng: number | null;
}

export function openProposeModal(
  defaults: Partial<{ name: string; category: string; note: string; proposedBy: string; lat: number; lng: number }>,
  onPickLocation: (onPick: (lat: number, lng: number) => void) => void
): Promise<ProposeFormResult | null> {
  return new Promise((resolve) => {
    const categoryOptions = Object.entries(CATEGORY_CONFIG)
      .map(([key, cfg]) => `<option value="${key}" ${defaults.category === key ? 'selected' : ''}>${cfg.label}</option>`)
      .join('');

    let pickedLat = defaults.lat ?? null;
    let pickedLng = defaults.lng ?? null;

    const { root, close } = openModal(`
      <h3>新增約會提案</h3>
      <label>地點名稱</label>
      <input type="text" id="adv-pf-name" value="${defaults.name || ''}" />
      <label>分類</label>
      <select id="adv-pf-category">${categoryOptions}</select>
      <label>座標</label>
      <button type="button" class="adv-modal-pick-btn ${pickedLat != null ? 'picked' : ''}" id="adv-pf-pick">
        ${pickedLat != null ? `📍 已選 (${pickedLat.toFixed(4)}, ${pickedLng!.toFixed(4)})` : '📍 點地圖選位置'}
      </button>
      <label>備註（為什麼想去 / 想約什麼時候）</label>
      <textarea id="adv-pf-note">${defaults.note || ''}</textarea>
      <label>提案人</label>
      <input type="text" id="adv-pf-who" placeholder="你的名字" value="${defaults.proposedBy || ''}" />
      <div class="adv-modal-error" id="adv-pf-error" style="display:none;"></div>
      <div class="adv-modal-actions">
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-pf-cancel">取消</button>
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-pf-submit">送出提案</button>
      </div>
    `);

    root.querySelector('#adv-pf-pick')?.addEventListener('click', () => {
      const currentDefaults = {
        ...defaults,
        name: (root.querySelector('#adv-pf-name') as HTMLInputElement)?.value,
        category: (root.querySelector('#adv-pf-category') as HTMLSelectElement)?.value,
        note: (root.querySelector('#adv-pf-note') as HTMLTextAreaElement)?.value,
        proposedBy: (root.querySelector('#adv-pf-who') as HTMLInputElement)?.value,
      };
      close();
      onPickLocation((lat, lng) => {
        openProposeModal({ ...currentDefaults, lat, lng }, onPickLocation).then(resolve);
      });
    });

    root.querySelector('#adv-pf-cancel')?.addEventListener('click', () => {
      close();
      resolve(null);
    });

    root.querySelector('#adv-pf-submit')?.addEventListener('click', () => {
      const name = (root.querySelector('#adv-pf-name') as HTMLInputElement)?.value.trim();
      const category = (root.querySelector('#adv-pf-category') as HTMLSelectElement)?.value;
      const note = (root.querySelector('#adv-pf-note') as HTMLTextAreaElement)?.value.trim();
      const proposedBy = (root.querySelector('#adv-pf-who') as HTMLInputElement)?.value.trim();
      const errorEl = root.querySelector('#adv-pf-error') as HTMLElement;

      if (!name) {
        errorEl.style.display = 'block';
        errorEl.textContent = '地點名稱不能空白';
        return;
      }

      close();
      resolve({ name, category, note, proposedBy, lat: pickedLat, lng: pickedLng });
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

export function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--adv-brown); color: #fff; padding: 10px 20px; border-radius: 100px;
    font-size: 0.85rem; font-weight: 600; z-index: 10001; box-shadow: 0 8px 20px rgba(0,0,0,0.25);
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
