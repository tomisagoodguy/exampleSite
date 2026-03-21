import { PlaceEntry } from '../../shared/types';
import { state } from './state';
import { storeHandle } from './persist';
import { toast, updateRateUI } from './ui';
import { setMarker } from './map';

export const CAT_COLORS: Record<string, string> = {
  food: '#C47B5A', scenery: '#81B29A', oldshop: '#D4A853',
  walk: '#7B8CDE', cafe: '#A67B5B', shop: '#E07A5F',
  stay: '#3D5A80', quest: '#9B72AA',
};

export const CAT_LABELS: Record<string, string> = {
  food: '美食', scenery: '風景', oldshop: '老店',
  walk: '散步', cafe: '咖啡廳', shop: '購物',
  stay: '住宿', quest: '破關任務',
};

export function switchMode(mode: 'add' | 'mgmt'): void {
  const addPanel = document.getElementById('add-panel');
  const mgmtPanel = document.getElementById('mgmt-panel');
  const tabAdd = document.getElementById('tab-add');
  const tabMgmt = document.getElementById('tab-mgmt');

  if (!addPanel || !mgmtPanel || !tabAdd || !tabMgmt) return;

  if (mode === 'add') {
    addPanel.style.display = '';
    mgmtPanel.classList.remove('active');
    tabAdd.classList.add('active');
    tabMgmt.classList.remove('active');
    if (state.editingId !== null) {
      state.editingId = null;
      document.getElementById('btn-write')!.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 生成並寫入 places.json';
    }
  } else {
    addPanel.style.display = 'none';
    mgmtPanel.classList.add('active');
    tabAdd.classList.remove('active');
    tabMgmt.classList.add('active');
  }
}

export async function loadPlacesForMgmt(): Promise<void> {
  // File System Access API — no native TS type, window cast required
  const showOpenFilePicker = (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
  try {
    const [handle] = await showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    state.fileHandle = handle;
    const f = await handle.getFile();
    const text = await f.text();
    const data: PlaceEntry[] = JSON.parse(text);

    // Auto fix paths
    data.forEach(p => {
      if (p.photos && Array.isArray(p.photos)) {
        p.photos = p.photos.map(src => {
          if (typeof src === 'string' && src.startsWith('images/') && !src.startsWith('/')) {
            return '/' + src;
          }
          return src;
        });
      }
    });

    state.cachedPlaces = data;
    await storeHandle('last_places_json', state.fileHandle);

    const st = document.getElementById('mgmt-status');
    if (st) {
      st.textContent = `✓ 已讀取：${state.cachedPlaces.length} 個地點`;
      st.className = 'file-status ok';
    }
    document.getElementById('mgmt-file-zone')?.classList.add('connected');

    // Sync Add Panel
    const addSt = document.getElementById('file-status');
    if (addSt) {
      addSt.textContent = `✓ 已連接：${f.name}`;
      addSt.className = 'file-status ok';
    }
    document.getElementById('file-zone')?.classList.add('connected');
    (document.getElementById('btn-write') as HTMLButtonElement).disabled = false;

    renderMgmtList();
  } catch (e: unknown) {
    if ((e as { name?: string }).name !== 'AbortError') toast(`開啟失敗：${(e as Error).message}`);
  }
}

export function renderMgmtList(): void {
  const kw = ((document.getElementById('mgmt-filter') as HTMLInputElement).value || '').toLowerCase();
  const ul = document.getElementById('place-list');
  if (!ul) return;

  const filtered = state.cachedPlaces.filter(p => p.name.toLowerCase().includes(kw));
  if (!filtered.length) {
    ul.innerHTML = `<li class="mgmt-empty">${state.cachedPlaces.length ? '無符合的地點' : '尚未讀取資料，請先開啟檔案'}</li>`;
    return;
  }

  ul.innerHTML = filtered.map(p => {
    const color = CAT_COLORS[p.category] || '#8C6A55';
    const label = CAT_LABELS[p.category] || p.category;
    const done = p.status === 'done' ? ' ✓' : '';
    return `<li class="place-list-item">
      <span class="pli-dot" style="background:${color}"></span>
      <div class="pli-info">
        <div class="pli-name">${p.name}${done}</div>
        <div class="pli-meta">${label}${p.added ? ' · ' + p.added : ''}</div>
      </div>
      <div class="pli-actions">
        <button class="btn-edit-pl" onclick="loadForEdit(${p.id})">編輯</button>
        <button class="btn-del-pl" onclick="deletePlace(${p.id})">刪除</button>
      </div></li>`;
  }).join('');
}

export function loadForEdit(id: number): void {
  const p = state.cachedPlaces.find(x => x.id === id);
  if (!p) { toast('找不到該地點'); return; }
  state.editingId = id;

  (document.getElementById('f-name') as HTMLInputElement).value = p.name || '';
  (document.getElementById('f-lat') as HTMLInputElement).value = p.lat.toString();
  (document.getElementById('f-lng') as HTMLInputElement).value = p.lng.toString();
  (document.getElementById('f-desc') as HTMLTextAreaElement).value = p.description || '';
  (document.getElementById('f-why') as HTMLTextAreaElement).value = p.why || '';
  (document.getElementById('f-time') as HTMLInputElement).value = p.best_time || '';
  (document.getElementById('f-added') as HTMLInputElement).value = p.added || '';
  (document.getElementById('f-addr') as HTMLInputElement).value = p.address || '';
  (document.getElementById('f-trivia') as HTMLTextAreaElement).value = p.trivia || '';

  state.selCat = p.category;
  document.querySelectorAll('.cat-btn').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-c') === state.selCat);
  });

  state.selRate = p.rating || 0;
  updateRateUI(state.selRate);

  state.selSeasons = p.seasons || [];
  document.querySelectorAll('.season-btn').forEach((b) => {
    const v = b.getAttribute('data-v');
    if (v === 'all') {
      b.classList.toggle('on', state.selSeasons.length === 4);
    } else {
      b.classList.toggle('on', state.selSeasons.includes(v!));
    }
  });

  state.selSt = p.status || 'pending';
  document.querySelectorAll('.st-btn').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-s') === state.selSt);
  });
  document.getElementById('done-extra')?.classList.toggle('show', state.selSt === 'done');

  state.currentVisits = p.visits || [];
  if (state.currentVisits.length === 0 && p.done_date && p.done_note) {
    state.currentVisits = [{ date: p.done_date, note: p.done_note }];
  }
  renderVisitList();

  if (p.lat && p.lng) {
    const coordPill = document.getElementById('coord-pill');
    if (coordPill) {
      coordPill.textContent = `${p.lat}, ${p.lng}`;
      coordPill.style.display = 'block';
    }
    document.getElementById('map-tip')?.classList.add('hide');
    setMarker(p.lat, p.lng, true);
    (document.getElementById('f-lat') as HTMLInputElement).value = p.lat.toString();
    (document.getElementById('f-lng') as HTMLInputElement).value = p.lng.toString();
  }

  const btn = document.getElementById('btn-write') as HTMLButtonElement;
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 更新地點：${p.name}`;

  switchMode('add');
  toast(`已載入「${p.name}」，修改後按更新`);
}

export function addVisitToCurrent(): void {
  const dInput = document.getElementById('v-date') as HTMLInputElement;
  const nInput = document.getElementById('v-note') as HTMLTextAreaElement;
  const d = dInput.value.trim();
  const n = nInput.value.trim();
  if (!d || !n) { toast('日期與紀錄不可為空'); return; }
  state.currentVisits.push({ date: d, note: n });
  dInput.value = '';
  nInput.value = '';
  renderVisitList();
}

export function delVisit(i: number): void {
  state.currentVisits.splice(i, 1);
  renderVisitList();
}

export function renderVisitList(): void {
  const container = document.getElementById('visit-list');
  if (!container) return;
  if (!state.currentVisits.length) {
    container.innerHTML = '<p style="font-size:.7rem; color:var(--brown-lt);">尚無紀錄</p>';
    return;
  }
  container.innerHTML = state.currentVisits.map((v, i) => `
    <div class="visit-item">
      <div class="v-date">${v.date}</div>
      <div class="v-note">${v.note}</div>
      <div class="v-del" onclick="delVisit(${i})">✕</div>
    </div>
  `).reverse().join('');
}
