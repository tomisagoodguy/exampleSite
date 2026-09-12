import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG, calculateStats } from './data';
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
  onPromote: (place: PlaceEntry) => void;
  onConfirm: (place: PlaceEntry) => void;
  onUnpropose: (place: PlaceEntry) => void;
  onMarkDone: (place: PlaceEntry) => void;
  onReopen: (place: PlaceEntry) => void;
  onToggleLike: (place: PlaceEntry) => void;
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

function ideaCard(place: PlaceEntry): string {
  const config = CATEGORY_CONFIG[place.category];
  return `
    <div class="adv-card" style="--cat-color:${config?.color || '#999'}">
      <div class="adv-card-tag" style="background:${config?.color || '#999'}">${config?.label || place.category}</div>
      <div class="adv-card-name">${place.name}</div>
      ${metaLine(place) ? `<div class="adv-card-meta">${metaLine(place)}</div>` : ''}
      <div class="adv-card-actions">
        <button class="adv-card-btn adv-card-btn--primary" data-action="promote" data-id="${place.id}">📍 我要提案</button>
      </div>
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
        <button class="adv-card-btn adv-card-btn--ghost" data-action="unpropose" data-id="${place.id}">回到願望清單</button>
        <button class="adv-card-btn adv-card-btn--primary" data-action="confirm" data-id="${place.id}">✅ 定案</button>
      </div>
    </div>
  `;
}

function itineraryCard(place: PlaceEntry): string {
  const config = CATEGORY_CONFIG[place.category];
  const isDone = place.status === 'done';

  return `
    <div class="adv-card ${isDone ? 'adv-card--done' : ''}" style="--cat-color:${config?.color || '#999'}">
      <div class="adv-card-tag" style="background:${config?.color || '#999'}">${config?.label || place.category}</div>
      <div class="adv-card-name">${place.name}${isDone ? ' 🏁' : ''}</div>
      ${metaLine(place) ? `<div class="adv-card-meta">${metaLine(place)}</div>` : ''}
      ${place.visit_date ? `<div class="adv-card-meta">📅 ${place.visit_date}</div>` : ''}
      ${place.note ? `<p class="adv-card-note">${place.note.replace(/\n/g, '<br>')}</p>` : ''}
      <div class="adv-card-actions">
        <a class="adv-card-btn" href="https://www.google.com/maps?q=${navQuery(place)}" target="_blank" rel="noopener">🗺️ 導航</a>
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
      if (action === 'promote') actions.onPromote(place);
      else if (action === 'confirm') actions.onConfirm(place);
      else if (action === 'unpropose') actions.onUnpropose(place);
      else if (action === 'done') actions.onMarkDone(place);
      else if (action === 'reopen') actions.onReopen(place);
      else if (action === 'like') actions.onToggleLike(place);
    });
  });
}

export function renderSections(allPlaces: PlaceEntry[], actions: CardActions) {
  const ideas = allPlaces.filter(p => p.status === 'idea');
  const proposed = allPlaces.filter(p => p.status === 'proposed');
  const itinerary = allPlaces
    .filter(p => p.status === 'confirmed' || p.status === 'done')
    .sort((a, b) => (a.visit_date || '9999').localeCompare(b.visit_date || '9999'));

  const ideaMount = document.getElementById('adv-section-idea');
  const proposedMount = document.getElementById('adv-section-proposed');
  const itineraryMount = document.getElementById('adv-section-itinerary');

  if (ideaMount) {
    ideaMount.innerHTML = ideas.length
      ? ideas.map(ideaCard).join('')
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
    itineraryMount.innerHTML = itinerary.length
      ? itinerary.map(itineraryCard).join('')
      : `<p class="adv-empty">還沒有定案的行程</p>`;
    bindActions(itineraryMount, itinerary, actions);
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
  defaults: Partial<{ name: string; category: string; address: string; note: string; proposedBy: string }>
): Promise<ProposeFormResult | null> {
  return new Promise((resolve) => {
    const categoryOptions = Object.entries(CATEGORY_CONFIG)
      .map(([key, cfg]) => `<option value="${key}" ${defaults.category === key ? 'selected' : ''}>${cfg.label}</option>`)
      .join('');

    const { root, close } = openModal(`
      <h3>新增約會提案</h3>
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
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-pf-submit">送出提案</button>
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
