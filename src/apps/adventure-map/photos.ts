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
      <img class="adv-photo-viewer__img" alt="" draggable="false">
      <figcaption class="adv-photo-viewer__caption"></figcaption>
    </figure>
    ${photos.length > 1 ? `
      <button type="button" class="adv-photo-viewer__nav adv-photo-viewer__nav--prev" aria-label="上一張">‹</button>
      <button type="button" class="adv-photo-viewer__nav adv-photo-viewer__nav--next" aria-label="下一張">›</button>` : ''}
  `;
  const img = root.querySelector('img') as HTMLImageElement;
  const caption = root.querySelector('figcaption') as HTMLElement;

  // ─── 縮放：雙指捏合／點兩下（電腦雙擊、滾輪）放大，放大後拖曳看細節 ───
  const MAX_ZOOM = 4;
  const DOUBLE_TAP_ZOOM = 2.5;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    // 不讓圖被拖出畫面：位移上限是放大後多出來的一半
    const maxX = (img.offsetWidth * (scale - 1)) / 2;
    const maxY = (img.offsetHeight * (scale - 1)) / 2;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
    img.style.transform = scale === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${scale})`;
    root.classList.toggle('is-zoomed', scale > 1);
  };
  /** 以畫面座標 (cx, cy) 為中心縮放，該點在縮放前後停在同一處 */
  const zoomTo = (next: number, cx: number, cy: number) => {
    next = Math.max(1, Math.min(MAX_ZOOM, next));
    const r = img.getBoundingClientRect();
    const px = cx - (r.left + r.width / 2) + tx;
    const py = cy - (r.top + r.height / 2) + ty;
    tx = px - (px - tx) * (next / scale);
    ty = py - (py - ty) * (next / scale);
    scale = next;
    if (scale === 1) tx = ty = 0;
    apply();
  };

  const show = () => {
    const p = photos[index];
    scale = 1;
    tx = ty = 0;
    apply();
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

  // 拖曳或滑動結束時瀏覽器仍會送 click，不能被當成「點背景關閉」
  let moved = false;
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.adv-photo-viewer__nav--prev')) step(-1);
    else if (t.closest('.adv-photo-viewer__nav--next')) step(1);
    else if (t.closest('.adv-photo-viewer__close') || (t === root && !moved)) close();
  });

  // 手勢用 pointer events 統一處理觸控與滑鼠：兩指＝捏合；一指在放大時＝拖曳，沒放大時＝左右滑換張
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; scale: number } | null = null;
  let drag: { x: number; y: number; tx: number; ty: number } | null = null;
  let down: { x: number; y: number; time: number } | null = null;
  let multiTouch = false;
  let lastTap = 0;
  const pair = () => [...pointers.values()];

  root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      moved = false;
      multiTouch = false;
      down = { x: e.clientX, y: e.clientY, time: Date.now() };
      drag = scale > 1 ? { x: e.clientX, y: e.clientY, tx, ty } : null;
    } else if (pointers.size === 2) {
      const [a, b] = pair();
      multiTouch = true;
      drag = null;
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  });

  root.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) moved = true;
    if (pinch && pointers.size === 2) {
      const [a, b] = pair();
      zoomTo((pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (drag) {
      tx = drag.tx + e.clientX - drag.x;
      ty = drag.ty + e.clientY - drag.y;
      apply();
    }
  });

  const onPointerUp = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size > 0) {
      // 捏合放開一指：剩下那指接著拖曳
      pinch = null;
      const [p] = pair();
      drag = scale > 1 ? { x: p.x, y: p.y, tx, ty } : null;
      return;
    }
    const wasDragging = drag != null;
    drag = null;
    if (!down || multiTouch) return;
    const dx = e.clientX - down.x;
    const quick = Date.now() - down.time < 300;
    down = null;

    if (!wasDragging && Math.abs(dx) > 50 && photos.length > 1) {
      step(dx > 0 ? -1 : 1);
    } else if (!moved && quick && e.target === img) {
      const now = Date.now();
      if (now - lastTap < 300) {
        zoomTo(scale > 1 ? 1 : DOUBLE_TAP_ZOOM, e.clientX, e.clientY);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }
  };
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);

  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
  }, { passive: false });

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
