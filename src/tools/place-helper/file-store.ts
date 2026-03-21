import { PlaceEntry } from '../../shared/types';
import { state } from './state';
import { storeHandle } from './persist';
import { clearPhotoSelection } from './photo';
import { buildEntry } from './form';
import { toast } from './ui';
import { renderMgmtList, switchMode } from './mgmt';

// File System Access API — no native TS type, window cast required
type FSApi = {
  showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker: (opts: unknown) => Promise<FileSystemDirectoryHandle>;
};

function fsApi(): FSApi {
  return window as unknown as FSApi;
}

export async function pickFile(): Promise<void> {
  if (!(window as Record<string, unknown>)['showOpenFilePicker']) {
    toast('你的瀏覽器不支援此功能，請改用 Chrome 或 Edge');
    return;
  }
  try {
    const [handle] = await fsApi().showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    state.fileHandle = handle;
    await storeHandle('last_places_json', state.fileHandle);
    const f = await handle.getFile();
    const zone = document.getElementById('file-zone');
    zone?.classList.add('connected');
    const st = document.getElementById('file-status');
    if (st) {
      st.textContent = `✓ 已連接：${f.name}（${(f.size / 1024).toFixed(1)} KB）`;
      st.className = 'file-status ok';
    }
    (document.getElementById('btn-write') as HTMLButtonElement).disabled = false;
  } catch (e: unknown) {
    if ((e as { name?: string }).name !== 'AbortError') toast(`開啟失敗：${(e as Error).message}`);
  }
}

export async function pickImgDir(): Promise<void> {
  if (!(window as Record<string, unknown>)['showDirectoryPicker']) {
    toast('瀏覽器不支援此功能，請用 Chrome/Edge');
    return;
  }
  try {
    state.imgDirHandle = await fsApi().showDirectoryPicker({ mode: 'readwrite' });
    await storeHandle('last_img_dir', state.imgDirHandle);
    const st = document.getElementById('dir-status');
    if (st) {
      st.textContent = `✓ 已連結錄入目錄：${(state.imgDirHandle as FileSystemDirectoryHandle).name}`;
      st.className = 'file-status ok';
    }
    toast('已啟用照片自動複製功能');
  } catch (e: unknown) {
    if ((e as { name?: string }).name !== 'AbortError') toast(`無法開啟資料夾：${(e as Error).message}`);
  }
}

export async function generateAndWrite(): Promise<void> {
  const entry = buildEntry();
  if (!entry) return;
  if (!state.fileHandle) {
    toast('尚未連接檔案，請先點擊「選擇 places.json 檔案」');
    await pickFile();
    return;
  }

  const btn = document.getElementById('btn-write') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '寫入中…';

  try {
    if (state.selectedPhotos.length > 0) {
      const photoPaths: string[] = [];
      if (!state.imgDirHandle) {
        toast('警告：未連結照片資料夾，請手動將照片放入 static/images/places');
        photoPaths.push(...state.selectedPhotos.map(p => `/images/places/${p.file.name}`));
      } else {
        const dirHandle = state.imgDirHandle as FileSystemDirectoryHandle;
        for (const item of state.selectedPhotos) {
          const ext = item.file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
          const fname = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
          const fh = await dirHandle.getFileHandle(fname, { create: true });
          const wr = await fh.createWritable();
          await wr.write(await item.file.arrayBuffer());
          await wr.close();
          photoPaths.push(`/images/places/${fname}`);
        }
      }
      if (photoPaths.length > 0) entry.photos = photoPaths;
    }

    const fileHandle = state.fileHandle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const text = await file.text();
    let arr: PlaceEntry[] = [];
    try {
      arr = text.trim() ? JSON.parse(text) : [];
      if (!Array.isArray(arr)) arr = [];
    } catch {
      throw new Error('places.json 格式錯誤（非標準 JSON 陣列）');
    }

    if (state.editingId !== null) {
      entry.id = state.editingId;
      const idx = arr.findIndex(p => p.id === state.editingId);
      if (idx === -1) throw new Error(`找不到 ID=${state.editingId} 的地點`);
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

    if (state.editingId !== null) {
      state.editingId = null;
      state.cachedPlaces = arr;
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
  } catch (e: unknown) {
    toast(`寫入失敗：${(e as Error).message}`);
    btn.disabled = false;
    btn.textContent = '生成並寫入 places.json';
  }
}

export async function deletePlace(id: number): Promise<void> {
  const p = state.cachedPlaces.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`確定要刪除「${p.name}」？此操作不可復原。`)) return;
  if (!state.fileHandle) { toast('請先讀取 places.json'); return; }

  try {
    const fileHandle = state.fileHandle as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const text = await file.text();
    let arr: PlaceEntry[] = JSON.parse(text);
    arr = arr.filter(x => x.id !== id);

    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(arr, null, 2));
    await writable.close();

    state.cachedPlaces = arr;
    renderMgmtList();
    toast(`✓ 已刪除「${p.name}」`);
  } catch (e: unknown) {
    toast(`刪除失敗：${(e as Error).message}`);
  }
}
