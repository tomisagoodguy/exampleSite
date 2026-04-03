import { state } from './state';

export async function storeHandle(key: string, handle: unknown): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    return new Promise((resolve, reject) => {
      const req = store.put(handle, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('無法儲存 Handle', e);
  }
}

async function getFromDB<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction('handles', 'readonly');
  const store = tx.objectStore('handles');
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function tryRestoreHandles(): Promise<void> {
  try {
    const jsonHandle = await getFromDB<FileSystemFileHandle>('last_places_json');
    const imgHandle = await getFromDB<FileSystemDirectoryHandle>('last_img_dir');

    if (jsonHandle) {
      if (await verifyPermission(jsonHandle)) {
        state.fileHandle = jsonHandle;
        const f = await jsonHandle.getFile();
        const st = document.getElementById('file-status');
        if (st) {
          st.innerHTML = `<span class="ok">✓ 已自動恢復連接：${f.name}</span>`;
        }
        document.getElementById('file-zone')?.classList.add('connected');
        const btnWrite = document.getElementById('btn-write') as HTMLButtonElement;
        if (btnWrite) btnWrite.disabled = false;
      } else {
        const st = document.getElementById('file-status');
        if (st) {
          st.innerHTML = '<span class="tip">發現先來的連接，<a href="#" onclick="pickFile(); return false;" style="color:var(--terra);text-decoration:underline;">點此</a> 授權開啟。</span>';
        }
      }
    }
    if (imgHandle) {
      if (await verifyPermission(imgHandle)) {
        state.imgDirHandle = imgHandle;
        const dst = document.getElementById('dir-status');
        if (dst) dst.innerHTML = '<span class="ok">✓ 照片目錄已連接</span>';
      }
    }
  } catch (e) {
    console.warn('恢復 Handle 失敗', e);
  }
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PlaceHelperDB', 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

/**
 * 驗證檔案系統 Handle 權限
 * @param handle FileSystemHandle
 */
export async function verifyPermission(handle: unknown): Promise<boolean> {
  // File System Access API handle — cast as any since it might not be in the default DOM types
  const fsHandle = handle as any;
  if (!fsHandle || typeof fsHandle.queryPermission !== 'function') return false;

  const options = { mode: 'readwrite' };
  if ((await fsHandle.queryPermission(options)) === 'granted') return true;
  return false;
}
