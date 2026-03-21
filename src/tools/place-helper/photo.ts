import { state } from './state';
import { toast } from './ui';

export async function addPhotos(): Promise<void> {
  try {
    // File System Access API — no native TS type, window cast required
    const handles = await (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
      multiple: true,
      types: [{ description: '圖片', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'] } }],
    });
    for (const handle of handles) {
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      state.selectedPhotos.push({ handle, file, previewUrl: url });
    }
    renderPreviews();
  } catch (e: unknown) {
    if ((e as { name?: string }).name !== 'AbortError') toast(`選取失敗：${(e as Error).message}`);
  }
}

export function renderPreviews(): void {
  const c = document.getElementById('photo-preview');
  if (!c) return;
  c.innerHTML = '';
  state.selectedPhotos.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'pthumb';
    div.innerHTML = `<img src="${item.previewUrl}"><button class="pthumb-del" onclick="removePhoto(${i})" title="移除">×</button>`;
    c.appendChild(div);
  });
}

export function clearPhotoSelection(): void {
  state.selectedPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl));
  state.selectedPhotos = [];
  renderPreviews();
}

export function removePhoto(i: number): void {
  URL.revokeObjectURL(state.selectedPhotos[i].previewUrl);
  state.selectedPhotos.splice(i, 1);
  renderPreviews();
}
