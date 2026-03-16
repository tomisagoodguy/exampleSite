import { PlaceEntry, Visit, SearchResult } from './types';
import { initMap, setMarker } from './map';
import { searchArcGIS, searchNominatim, reverseGeocode } from './geocoder';
import { toast, esc, updateRateUI, setStatus } from './ui';

// 全域狀態
let selCat = 'food';
let selSt = 'pending';
let selRate = 0;
let selSeasons: string[] = [];
let currentVisits: Visit[] = [];
let fileHandle: any = null;
let imgDirHandle: any = null;
let selectedPhotos: any[] = [];
let cachedPlaces: PlaceEntry[] = [];
let editingId: number | null = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initMap('picker-map', (lat, lng) => {
    setCoord(lat, lng, false);
  });

  setupEventListeners();
  tryRestoreHandles();
  
  // 預設日期
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const addedInput = document.getElementById('f-added') as HTMLInputElement;
  if (addedInput) addedInput.value = `${d.getFullYear()}-${m}`;
});

function setupEventListeners() {
  // 評分
  document.querySelectorAll('.rate-btn').forEach((btn) => {
    (btn as HTMLElement).addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      selRate = parseInt(el.getAttribute('data-v') || '0');
      updateRateUI(selRate);
    });
  });

  // 季節
  document.querySelectorAll('.season-btn').forEach((btn) => {
    (btn as HTMLElement).addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      const s = el.getAttribute('data-v');
      if (!s) return;
      if (s === 'all') {
        const others = document.querySelectorAll('.season-btn[data-v]:not([data-v="all"])');
        const currentlyAll = selSeasons.length === 4;
        selSeasons = currentlyAll ? [] : ['spring', 'summer', 'autumn', 'winter'];
        others.forEach((b) => (b as HTMLElement).classList.toggle('on', !currentlyAll));
        el.classList.toggle('on', !currentlyAll);
        return;
      }
      const idx = selSeasons.indexOf(s);
      if (idx > -1) selSeasons.splice(idx, 1);
      else selSeasons.push(s);
      el.classList.toggle('on');
      
      const allBtn = document.querySelector('.season-btn[data-v="all"]');
      if (allBtn) allBtn.classList.toggle('on', selSeasons.length === 4);
    });
  });

  // 類別
  document.querySelectorAll('.cat-btn').forEach((b) => {
    (b as HTMLElement).addEventListener('click', (e) => {
      document.querySelectorAll('.cat-btn').forEach((x) => (x as HTMLElement).classList.remove('on'));
      const el = e.currentTarget as HTMLElement;
      el.classList.add('on');
      selCat = el.getAttribute('data-c') || 'food';
    });
  });

  // 狀態
  document.querySelectorAll('.st-btn').forEach((b) => {
    (b as HTMLElement).addEventListener('click', (e) => {
      document.querySelectorAll('.st-btn').forEach((x) => (x as HTMLElement).classList.remove('on'));
      const el = e.currentTarget as HTMLElement;
      el.classList.add('on');
      selSt = (el.getAttribute('data-s') as 'pending' | 'done') || 'pending';
      const extra = document.getElementById('done-extra');
      if (extra) extra.classList.toggle('show', selSt === 'done');
    });
  });

  // 搜尋 Enter
  document.getElementById('s-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  // 綁定按鈕
  (window as any).locateMe = locateMe;
  (window as any).doSearch = doSearch;
  (window as any).pickFile = pickFile;
  (window as any).pickImgDir = pickImgDir;
  (window as any).addPhotos = addPhotos;
  (window as any).generateAndWrite = generateAndWrite;
  (window as any).switchMode = switchMode;
  (window as any).loadPlacesForMgmt = loadPlacesForMgmt;
  (window as any).renderMgmtList = renderMgmtList;
  (window as any).loadForEdit = loadForEdit;
  (window as any).deletePlace = deletePlace;
  (window as any).addVisitToCurrent = addVisitToCurrent;
  (window as any).delVisit = delVisit;
}

function setCoord(lat: number, lng: number, flyTo: boolean) {
  const latVal = +parseFloat(lat.toString()).toFixed(5);
  const lngVal = +parseFloat(lng.toString()).toFixed(5);
  
  (document.getElementById('f-lat') as HTMLInputElement).value = latVal.toString();
  (document.getElementById('f-lng') as HTMLInputElement).value = lngVal.toString();
  
  const pill = document.getElementById('coord-pill');
  if (pill) {
    pill.textContent = `${latVal}, ${lngVal}`;
    pill.style.display = 'block';
  }
  document.getElementById('map-tip')?.classList.add('hide');
  setMarker(latVal, lngVal, flyTo);
}

async function doSearch() {
  const input = document.getElementById('s-input') as HTMLInputElement;
  const btn = document.getElementById('s-btn') as HTMLButtonElement;
  const resultsEl = document.getElementById('s-results');
  
  const q = input.value.trim();
  if (!q) { setStatus('請輸入地址或地名', 'error'); return; }
  
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '搜尋中…';
  setStatus('搜尋中，請稍候…', 'loading');
  if (resultsEl) {
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('show');
  }

  try {
    let items = await searchArcGIS(q);
    if (!items || items.length === 0) {
      setStatus('ArcGIS 無結果，嘗試備援搜尋…', 'loading');
      items = await searchNominatim(q);
    }
    
    btn.disabled = false;
    btn.textContent = oldText;
    
    if (!items || items.length === 0) {
      setStatus('找不到結果。提示：只輸入「縣市+區+路名」搜尋效果更好', 'error');
      return;
    }
    
    setStatus(`找到 ${items.length} 個結果，點選一個`, 'ok');
    renderResults(items);
  } catch (err: any) {
    btn.disabled = false;
    btn.textContent = oldText;
    setStatus(`搜尋失敗：${err.message}`, 'error');
  }
}

function renderResults(items: SearchResult[]) {
  const resultsEl = document.getElementById('s-results');
  if (!resultsEl) return;
  
  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `<strong>${esc(item.name)}</strong><span>${esc(item.address)}</span>`;
    div.addEventListener('click', () => {
      setCoord(item.lat, item.lng, true);
      (document.getElementById('f-addr') as HTMLInputElement).value = item.address || '';
      const nameInput = document.getElementById('f-name') as HTMLInputElement;
      if (!nameInput.value || nameInput.value.length < 2) {
        nameInput.value = item.name;
      }
      setStatus(`已選取：${item.name.substring(0, 12)}`, 'ok');
      resultsEl.classList.remove('show');
      (document.getElementById('s-input') as HTMLInputElement).value = item.name;
      toast('地點資料已帶入');
    });
    frag.appendChild(div);
  });
  resultsEl.innerHTML = '';
  resultsEl.appendChild(frag);
  resultsEl.classList.add('show');
}

async function locateMe() {
  if (!navigator.geolocation) {
    setStatus('瀏覽器不支援定位功能', 'error');
    return;
  }
  setStatus('正在獲取 GPS 座標...', 'loading');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    setCoord(lat, lng, true);
    setStatus('GPS 定位成功！正在抓取地址...', 'ok');
    
    const res = await reverseGeocode(lat, lng);
    if (res) {
      (document.getElementById('f-addr') as HTMLInputElement).value = res.address;
      const nameInput = document.getElementById('f-name') as HTMLInputElement;
      if (!nameInput.value) {
        nameInput.value = res.placeName || '未命名地點';
      }
      setStatus('已成功反查地址', 'ok');
    }
  }, (err) => {
    let msg = `定位失敗：${err.message}`;
    if (err.code === 1) msg = '請允許瀏覽器定位權限';
    setStatus(msg, 'error');
  }, { enableHighAccuracy: true, timeout: 5000 });
}

// File System Helpers
async function pickFile() {
  if (!(window as any).showOpenFilePicker) {
    toast('你的瀏覽器不支援此功能，請改用 Chrome 或 Edge');
    return;
  }
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    fileHandle = handle;
    storeHandle('last_places_json', fileHandle);
    const f = await fileHandle.getFile();
    const zone = document.getElementById('file-zone');
    zone?.classList.add('connected');
    const st = document.getElementById('file-status');
    if (st) {
      st.textContent = `✓ 已連接：${f.name}（${(f.size / 1024).toFixed(1)} KB）`;
      st.className = 'file-status ok';
    }
    (document.getElementById('btn-write') as HTMLButtonElement).disabled = false;
  } catch (e: any) {
    if (e.name !== 'AbortError') toast(`開啟失敗：${e.message}`);
  }
}

async function pickImgDir() {
  if (!(window as any).showDirectoryPicker) {
    toast('瀏覽器不支援此功能，請用 Chrome/Edge');
    return;
  }
  try {
    imgDirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    storeHandle('last_img_dir', imgDirHandle);
    const st = document.getElementById('dir-status');
    if (st) {
      st.textContent = `✓ 已連結錄入目錄：${imgDirHandle.name}`;
      st.className = 'file-status ok';
    }
    toast('已啟用照片自動複製功能');
  } catch (e: any) {
    if (e.name !== 'AbortError') toast(`無法開啟資料夾：${e.message}`);
  }
}

function buildEntry(): PlaceEntry | null {
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
    category: selCat,
    lat,
    lng,
    status: selSt as 'pending' | 'done'
  };

  if (desc) obj.description = desc;
  if (addr) obj.address = addr;
  if (trivia) obj.trivia = trivia;
  if (why) obj.why = why;
  if (time) obj.best_time = time;
  if (added) obj.added = added;
  if (selRate > 0) obj.rating = selRate;
  if (selSeasons.length > 0) obj.seasons = selSeasons;

  if (selSt === 'done' && currentVisits.length > 0) {
    obj.visits = currentVisits;
    const last = currentVisits[currentVisits.length - 1];
    obj.done_note = last.note;
    obj.done_date = last.date;
  }
  
  if (selectedPhotos.length > 0) {
    obj.photos = selectedPhotos.map(p => `/images/places/${p.savedName || 'temp-' + p.file.name}`);
  }

  return obj;
}

async function generateAndWrite() {
  const entry = buildEntry();
  if (!entry) return;
  if (!fileHandle) {
    toast('尚未連接檔案，請先點擊「選擇 places.json 檔案」');
    pickFile();
    return;
  }

  const btn = document.getElementById('btn-write') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '寫入中…';

  try {
    if (selectedPhotos.length > 0) {
      const photoPaths = [];
      if (!imgDirHandle) {
        toast('警告：未連結照片資料夾，請手動將照片放入 static/images/places');
        photoPaths.push(...selectedPhotos.map(p => `/images/places/${p.file.name}`));
      } else {
        for (const item of selectedPhotos) {
          const ext = item.file.name.split('.').pop().toLowerCase();
          const fname = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`;
          const fh = await imgDirHandle.getFileHandle(fname, { create: true });
          const wr = await fh.createWritable();
          await wr.write(await item.file.arrayBuffer());
          await wr.close();
          photoPaths.push(`/images/places/${fname}`);
        }
      }
      if (photoPaths.length > 0) entry.photos = photoPaths;
    }

    const file = await fileHandle.getFile();
    const text = await file.text();
    let arr: PlaceEntry[] = [];
    try {
      arr = text.trim() ? JSON.parse(text) : [];
      if (!Array.isArray(arr)) arr = [];
    } catch (err) {
      throw new Error('places.json 格式錯誤（非標準 JSON 陣列）');
    }

    if (editingId !== null) {
      entry.id = editingId;
      const idx = arr.findIndex(p => p.id === editingId);
      if (idx === -1) throw new Error(`找不到 ID=${editingId} 的地點`);
      if (!entry.photos && arr[idx].photos) entry.photos = arr[idx].photos;
      arr[idx] = entry;
      toast(`✓ 已更新！（${entry.name}）`);
    } else {
      arr.push(entry);
      const photoMsg = entry.photos ? `，已複製 ${entry.photos.length} 張照片` : '';
      toast(`✓ 已成功寫入！共 ${arr.length} 個地點${photoMsg}`);
    }

    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(arr, null, 2));
    await writable.close();

    btn.innerHTML = '✓ 寫入成功';
    clearPhotoSelection();

    if (editingId !== null) {
      editingId = null;
      cachedPlaces = arr;
      setTimeout(() => {
        renderMgmtList();
        switchMode('mgmt');
      }, 1200);
    } else {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 生成並寫入 places.json';
      }, 2500);
    }
  } catch (e: any) {
    toast(`寫入失敗：${e.message}`);
    btn.disabled = false;
    btn.textContent = '生成並寫入 places.json';
  }
}

// Photo Management
function clearPhotoSelection() {
  selectedPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl));
  selectedPhotos = [];
  renderPreviews();
}

async function addPhotos() {
  try {
    const handles = await (window as any).showOpenFilePicker({
      multiple: true,
      types: [{ description: '圖片', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'] } }]
    });
    for (const handle of handles) {
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      selectedPhotos.push({ handle, file, previewUrl: url });
    }
    renderPreviews();
  } catch (e: any) {
    if (e.name !== 'AbortError') toast(`選取失敗：${e.message}`);
  }
}

function renderPreviews() {
  const c = document.getElementById('photo-preview');
  if (!c) return;
  c.innerHTML = '';
  selectedPhotos.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'pthumb';
    div.innerHTML = `<img src="${item.previewUrl}"><button class="pthumb-del" onclick="removePhoto(${i})" title="移除">×</button>`;
    c.appendChild(div);
  });
}

(window as any).removePhoto = function(i: number) {
  URL.revokeObjectURL(selectedPhotos[i].previewUrl);
  selectedPhotos.splice(i, 1);
  renderPreviews();
};

// Mgmt Mode
function switchMode(mode: 'add' | 'mgmt') {
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
    if (editingId !== null) {
      editingId = null;
      document.getElementById('btn-write')!.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 生成並寫入 places.json';
    }
  } else {
    addPanel.style.display = 'none';
    mgmtPanel.classList.add('active');
    tabAdd.classList.remove('active');
    tabMgmt.classList.add('active');
  }
}

async function loadPlacesForMgmt() {
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    fileHandle = handle;
    const f = await fileHandle.getFile();
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

    cachedPlaces = data;
    storeHandle('last_places_json', fileHandle);

    const st = document.getElementById('mgmt-status');
    if (st) {
      st.textContent = `✓ 已讀取：${cachedPlaces.length} 個地點`;
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
  } catch (e: any) {
    if (e.name !== 'AbortError') toast(`開啟失敗：${e.message}`);
  }
}

const CAT_COLORS: Record<string, string> = { food: '#C47B5A', scenery: '#81B29A', oldshop: '#D4A853', walk: '#7B8CDE', cafe: '#A67B5B', shop: '#E07A5F', stay: '#3D5A80', quest: '#9B72AA' };
const CAT_LABELS: Record<string, string> = { food: '美食', scenery: '風景', oldshop: '老店', walk: '散步', cafe: '咖啡廳', shop: '購物', stay: '住宿', quest: '破關任務' };

function renderMgmtList() {
  const kw = ((document.getElementById('mgmt-filter') as HTMLInputElement).value || '').toLowerCase();
  const ul = document.getElementById('place-list');
  if (!ul) return;
  
  const filtered = cachedPlaces.filter(p => p.name.toLowerCase().includes(kw));
  if (!filtered.length) {
    ul.innerHTML = `<li class="mgmt-empty">${cachedPlaces.length ? '無符合的地點' : '尚未讀取資料，請先開啟檔案'}</li>`;
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

function loadForEdit(id: number) {
  const p = cachedPlaces.find(x => x.id === id);
  if (!p) { toast('找不到該地點'); return; }
  editingId = id;

  (document.getElementById('f-name') as HTMLInputElement).value = p.name || '';
  (document.getElementById('f-lat') as HTMLInputElement).value = p.lat.toString();
  (document.getElementById('f-lng') as HTMLInputElement).value = p.lng.toString();
  (document.getElementById('f-desc') as HTMLTextAreaElement).value = p.description || '';
  (document.getElementById('f-why') as HTMLTextAreaElement).value = p.why || '';
  (document.getElementById('f-time') as HTMLInputElement).value = p.best_time || '';
  (document.getElementById('f-added') as HTMLInputElement).value = p.added || '';
  (document.getElementById('f-addr') as HTMLInputElement).value = p.address || '';
  (document.getElementById('f-trivia') as HTMLTextAreaElement).value = p.trivia || '';

  selCat = p.category;
  document.querySelectorAll('.cat-btn').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-c') === selCat);
  });
  
  selRate = p.rating || 0;
  updateRateUI(selRate);
  
  selSeasons = p.seasons || [];
  document.querySelectorAll('.season-btn').forEach((b) => {
    const v = b.getAttribute('data-v');
    if (v === 'all') {
      b.classList.toggle('on', selSeasons.length === 4);
    } else {
      b.classList.toggle('on', selSeasons.includes(v!));
    }
  });
  
  selSt = p.status || 'pending';
  document.querySelectorAll('.st-btn').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-s') === selSt);
  });
  document.getElementById('done-extra')?.classList.toggle('show', selSt === 'done');

  currentVisits = p.visits || [];
  if (currentVisits.length === 0 && p.done_date && p.done_note) {
    currentVisits = [{ date: p.done_date, note: p.done_note }];
  }
  renderVisitList();

  if (p.lat && p.lng) {
    setCoord(p.lat, p.lng, true);
  }

  const btn = document.getElementById('btn-write') as HTMLButtonElement;
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 更新地點：${p.name}`;

  switchMode('add');
  toast(`已載入「${p.name}」，修改後按更新`);
}

async function deletePlace(id: number) {
  const p = cachedPlaces.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`確定要刪除「${p.name}」？此操作不可復原。`)) return;
  if (!fileHandle) { toast('請先讀取 places.json'); return; }

  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    let arr: PlaceEntry[] = JSON.parse(text);
    arr = arr.filter(x => x.id !== id);

    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(arr, null, 2));
    await writable.close();

    cachedPlaces = arr;
    renderMgmtList();
    toast(`✓ 已刪除「${p.name}」`);
  } catch (e: any) {
    toast(`刪除失敗：${e.message}`);
  }
}

function addVisitToCurrent() {
  const dInput = document.getElementById('v-date') as HTMLInputElement;
  const nInput = document.getElementById('v-note') as HTMLTextAreaElement;
  const d = dInput.value.trim();
  const n = nInput.value.trim();
  if (!d || !n) { toast('日期與紀錄不可為空'); return; }
  currentVisits.push({ date: d, note: n });
  dInput.value = '';
  nInput.value = '';
  renderVisitList();
}

function renderVisitList() {
  const container = document.getElementById('visit-list');
  if (!container) return;
  if (!currentVisits.length) {
    container.innerHTML = '<p style="font-size:.7rem; color:var(--brown-lt);">尚無紀錄</p>';
    return;
  }
  container.innerHTML = currentVisits.map((v, i) => `
    <div class="visit-item">
      <div class="v-date">${v.date}</div>
      <div class="v-note">${v.note}</div>
      <div class="v-del" onclick="delVisit(${i})">✕</div>
    </div>
  `).reverse().join('');
}

function delVisit(i: number) {
  currentVisits.splice(i, 1);
  renderVisitList();
}

// Persistent Storage
async function storeHandle(key: string, handle: any) {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    await store.put(handle, key);
  } catch (e) { console.warn('無法儲存 Handle', e); }
}

async function tryRestoreHandles() {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const jsonHandle = await store.get('last_places_json');
    const imgHandle = await store.get('last_img_dir');

    if (jsonHandle) {
      if (await verifyPermission(jsonHandle)) {
        fileHandle = jsonHandle;
        const f = await fileHandle.getFile();
        const st = document.getElementById('file-status');
        if (st) {
          st.innerHTML = `<span class="ok">✓ 已自動恢復連接：${f.name}</span>`;
        }
        document.getElementById('file-zone')?.classList.add('connected');
        (document.getElementById('btn-write') as HTMLButtonElement).disabled = false;
      } else {
        const st = document.getElementById('file-status');
        if (st) {
          st.innerHTML = '<span class="tip">發現先前的連接，<a href="#" onclick="pickFile(); return false;" style="color:var(--terra);text-decoration:underline;">點此</a> 授權開啟。</span>';
        }
      }
    }
    if (imgHandle) {
      if (await verifyPermission(imgHandle)) {
        imgDirHandle = imgHandle;
        const dst = document.getElementById('dir-status');
        if (dst) dst.innerHTML = '<span class="ok">✓ 照片目錄已連接</span>';
      }
    }
  } catch (e) { console.warn('恢復 Handle 失敗', e); }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PlaceHelperDB', 1);
  request.onupgradeneeded = e => {
    const db = (e.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains('handles')) {
      db.createObjectStore('handles');
    }
  };
    request.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = e => reject((e.target as IDBOpenDBRequest).error);
  });
}

async function verifyPermission(handle: any) {
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return false;
}
