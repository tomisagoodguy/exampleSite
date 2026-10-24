/**
 * 回憶照片：檔案放在 repo 的 static/adventure-map/photos/<地點 id>/，
 * Hugo 建置時（list.html）掃資料夾注入 window.DATING_MAP_PHOTOS，這裡只負責顯示。
 * 照片是公開檔案，不經 Supabase、不需要密碼。
 */

interface PhotoFolder {
  files: string[];
  /** captions.txt 原文：每行「檔名 說明」 */
  captions: string;
}

export interface Photo {
  src: string;
  thumb: string;
  caption: string;
}

declare global {
  interface Window {
    DATING_MAP_PHOTOS?: Record<string, PhotoFolder>;
    DATING_MAP_PHOTO_BASE?: string;
  }
}

/** 一個縮圖列最多顯示幾張，其餘在燈箱裡左右切換 */
const STRIP_MAX = 4;

function parseCaptions(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+)\s+(.+)$/);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

const cache = new Map<number, Photo[]>();

export function placePhotos(placeId: number): Photo[] {
  const hit = cache.get(placeId);
  if (hit) return hit;
  const folder = window.DATING_MAP_PHOTOS?.[String(placeId)];
  const base = `${window.DATING_MAP_PHOTO_BASE || '/adventure-map/photos/'}${placeId}/`;
  const captions = parseCaptions(folder?.captions || '');
  const photos = (folder?.files || [])
    .slice()
    .sort()
    .map((file) => ({
      src: base + file,
      thumb: base + file.replace(/\.jpe?g$/i, '.thumb.jpg'),
      caption: captions.get(file) || '',
    }));
  cache.set(placeId, photos);
  return photos;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 依序收集多個地點的照片當一組（成就牆一項成就可能連到好幾個地點） */
function collectPhotos(placeIds: number[]): Photo[] {
  return placeIds.flatMap(placePhotos);
}

/** 卡片上的縮圖列；沒有照片回傳空字串 */
export function photoStripHTML(placeIds: number[]): string {
  const photos = collectPhotos(placeIds);
  if (!photos.length) return '';
  const more = photos.length - STRIP_MAX;
  const ids = placeIds.join(',');
  return `
    <div class="adv-photo-strip">
      ${photos.slice(0, STRIP_MAX).map((p, i) => `
        <button type="button" class="adv-photo-thumb" data-photo-ids="${ids}" data-photo-index="${i}" title="${esc(p.caption || '看照片')}">
          <img src="${esc(p.thumb)}" alt="${esc(p.caption)}" loading="lazy" decoding="async">
          ${i === STRIP_MAX - 1 && more > 0 ? `<span class="adv-photo-more">+${more}</span>` : ''}
        </button>`).join('')}
    </div>
  `;
}

function openViewer(photos: Photo[], start: number) {
  let index = start;
  const root = document.createElement('div');
  root.className = 'adv-photo-viewer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <button type="button" class="adv-photo-viewer__close" aria-label="關閉">✕</button>
    <figure class="adv-photo-viewer__figure">
      <img class="adv-photo-viewer__img" alt="">
      <figcaption class="adv-photo-viewer__caption"></figcaption>
    </figure>
    ${photos.length > 1 ? `
      <button type="button" class="adv-photo-viewer__nav adv-photo-viewer__nav--prev" aria-label="上一張">‹</button>
      <button type="button" class="adv-photo-viewer__nav adv-photo-viewer__nav--next" aria-label="下一張">›</button>` : ''}
  `;
  const img = root.querySelector('img') as HTMLImageElement;
  const caption = root.querySelector('figcaption') as HTMLElement;

  const show = () => {
    const p = photos[index];
    img.src = p.src;
    img.alt = p.caption;
    caption.textContent = `${p.caption}${photos.length > 1 ? `　${index + 1} / ${photos.length}` : ''}`;
    caption.hidden = !caption.textContent.trim();
  };
  const step = (d: number) => {
    index = (index + d + photos.length) % photos.length;
    show();
  };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  };

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.adv-photo-viewer__nav--prev')) step(-1);
    else if (t.closest('.adv-photo-viewer__nav--next')) step(1);
    else if (t === root || t.closest('.adv-photo-viewer__close')) close();
  });

  // 手機左右滑換張
  let touchX: number | null = null;
  root.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50 && photos.length > 1) step(dx > 0 ? -1 : 1);
  });

  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  show();
}

/** 卡片每次重繪都會換掉 DOM，所以縮圖點擊用 document 層級委派，只綁一次 */
export function setupPhotoViewer() {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-photo-ids]');
    if (!btn) return;
    const ids = (btn.dataset.photoIds || '').split(',').map(Number).filter(Boolean);
    const photos = collectPhotos(ids);
    if (photos.length) openViewer(photos, Number(btn.dataset.photoIndex) || 0);
  });
}
