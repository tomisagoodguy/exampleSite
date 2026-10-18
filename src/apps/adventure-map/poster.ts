/**
 * 行程海報：把一條懶人包或某一天的行程畫成 Canvas 圖卡（繪卷海報／時程甘特），並匯出 PNG。
 * 不畫 Leaflet 圖磚：外部圖磚沒開 CORS 會讓 canvas 被標記為 tainted，toBlob 直接失敗。
 */

export interface PosterStop {
  seq: number;
  label: string;
  timeText: string | null;
  color: string;
  categoryLabel: string | null;
  /** 卡片第三行（必點、花費、地址等），沒有就留空 */
  extra: string | null;
}

export interface PosterData {
  title: string;
  /** 標題下方一行，例如「📍 北北基 · 🍂 秋 · 6 站」 */
  subtitle: string;
  summary: string | null;
  stops: PosterStop[];
  footnote: string | null;
  filename: string;
}

const W = 1080;
const POSTER_H = 1350;
const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const C = {
  paper: '#FAF7F2',
  paperDark: '#F0EBE1',
  ink: '#5C3D2E',
  inkLight: '#8C6A55',
  accent: '#C47B5A',
  gold: '#D4A853',
  muted: '#B9A797',
};
const BRAND = '定康筆記 · 破關地圖';

// ───────────────────────── 時間解析 ─────────────────────────

/** 甘特圖一列；start/end 以「當天第幾分鐘」表示，null 代表時間沒寫明（例如「午餐」） */
export interface GanttRow {
  stop: PosterStop;
  start: number | null;
  end: number | null;
  /** true = 結束時間是推算的（取下一站開始、依停留時間接續、或預設 60 分），畫成淡色 */
  estimated: boolean;
}

const CLOCK_RE = /(\d{1,2}):(\d{2})(?:\s*[–—\-~～]\s*(\d{1,2}):(\d{2}))?/;
const DURATION_RE = /(\d+(?:\.\d+)?)(?:\s*[–—\-~～]\s*(\d+(?:\.\d+)?))?\s*(分|小時)/;
const DEFAULT_LAST_MINUTES = 60;

/**
 * 解析 time_text：「10:00–12:30」直接用；「09:00」結束取下一站開始；
 * 「30–45 分」「1.5 小時」只有停留時間，接在上一站結束後（取區間中位數）；其餘文字不畫長條。
 */
export function parseGanttRows(stops: PosterStop[]): GanttRow[] {
  const parsed = stops.map((stop) => {
    const text = stop.timeText || '';
    const clock = CLOCK_RE.exec(text);
    if (clock) {
      const start = Number(clock[1]) * 60 + Number(clock[2]);
      const end = clock[3] ? Number(clock[3]) * 60 + Number(clock[4]) : null;
      return { stop, start, end: end != null && end > start ? end : null, duration: null as number | null };
    }
    const dur = DURATION_RE.exec(text);
    if (dur) {
      const lo = Number(dur[1]);
      const hi = dur[2] ? Number(dur[2]) : lo;
      const minutes = ((lo + hi) / 2) * (dur[3] === '小時' ? 60 : 1);
      return { stop, start: null as number | null, end: null as number | null, duration: minutes > 0 ? minutes : null };
    }
    return { stop, start: null as number | null, end: null as number | null, duration: null as number | null };
  });

  const rows: GanttRow[] = [];
  parsed.forEach((p, i) => {
    let { start, end } = p;
    let estimated = false;

    if (start == null && p.duration != null) {
      const prevEnd = rows[i - 1]?.end ?? null;
      if (prevEnd != null) {
        start = prevEnd;
        end = prevEnd + p.duration;
        estimated = true;
      }
    } else if (start != null && end == null) {
      const nextStart = parsed.slice(i + 1).find((n) => n.start != null)?.start ?? null;
      end = nextStart != null && nextStart > start ? nextStart : start + (p.duration ?? DEFAULT_LAST_MINUTES);
      estimated = true;
    }
    rows.push({ stop: p.stop, start, end, estimated });
  });
  return rows;
}

/** 至少兩站畫得出長條才值得出甘特圖 */
export function ganttAvailable(stops: PosterStop[]): boolean {
  return parseGanttRows(stops).filter((r) => r.start != null).length >= 2;
}

// ───────────────────────── 共用繪圖工具 ─────────────────────────

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

/** 依寬度斷行（中文逐字、英文也逐字，夠用），超過 maxLines 以「…」收尾 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (lines.length === maxLines && line) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  return wrapText(ctx, text, maxWidth, 1)[0] || '';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(140, 106, 85, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 紙張底色＋雙線外框，兩種圖卡共用 */
function drawPaper(ctx: CanvasRenderingContext2D, h: number) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, h);
  ctx.strokeStyle = hexToRgba(C.accent, 0.5);
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, W - 56, h - 56);
  ctx.strokeStyle = hexToRgba(C.accent, 0.25);
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, W - 80, h - 80);
}

/** 標題區，回傳下方內容可用的起始 y */
function drawHeader(ctx: CanvasRenderingContext2D, data: PosterData, top: number): number {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.ink;
  ctx.font = font(900, 56);
  let y = top;
  for (const line of wrapText(ctx, data.title, W - 200, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 70;
  }
  ctx.fillStyle = C.accent;
  ctx.font = font(700, 28);
  ctx.fillText(fitText(ctx, data.subtitle, W - 200), W / 2, y + 4);
  y += 48;
  if (data.summary) {
    ctx.fillStyle = C.inkLight;
    ctx.font = font(500, 26);
    for (const line of wrapText(ctx, data.summary, W - 220, 2)) {
      ctx.fillText(line, W / 2, y + 6);
      y += 36;
    }
  }
  ctx.strokeStyle = hexToRgba(C.gold, 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 80, y + 26);
  ctx.lineTo(W / 2 + 80, y + 26);
  ctx.stroke();
  return y + 56;
}

function drawFooter(ctx: CanvasRenderingContext2D, data: PosterData, h: number) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(500, 22);
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  if (data.footnote) ctx.fillText(fitText(ctx, data.footnote, W - 480), 72, h - 70);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.inkLight;
  ctx.font = font(800, 22);
  ctx.fillText(BRAND, W - 72, h - 70);
}

// ───────────────────────── 繪卷海報 ─────────────────────────

/** 1080×1350（IG 直式）：左側一條蜿蜒的路串起編號站點，右側每站一張卡片 */
export function drawPoster(canvas: HTMLCanvasElement, data: PosterData) {
  canvas.width = W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 Canvas 2D');

  drawPaper(ctx, POSTER_H);
  const top = drawHeader(ctx, data, 92);
  const bottom = POSTER_H - 120;
  const stops = data.stops;
  if (!stops.length) return;

  const rowH = Math.min(150, (bottom - top) / stops.length);
  const scale = Math.max(0.6, Math.min(1, rowH / 130));
  const roadBase = 150;
  const roadX = (i: number) => roadBase + Math.sin(i * 1.3) * 34;
  // 站數少時整串垂直置中，不要擠在上半部
  const offset = (bottom - top - rowH * stops.length) / 2;
  const nodeY = (i: number) => top + offset + rowH * i + rowH / 2;

  // 路：通過各站節點的平滑曲線
  ctx.strokeStyle = hexToRgba(C.accent, 0.35);
  ctx.lineWidth = 14 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(roadX(0), nodeY(0));
  for (let i = 1; i < stops.length; i++) {
    const midY = (nodeY(i - 1) + nodeY(i)) / 2;
    ctx.bezierCurveTo(roadX(i - 1), midY, roadX(i), midY, roadX(i), nodeY(i));
  }
  ctx.stroke();
  ctx.setLineDash([10, 12]);
  ctx.strokeStyle = C.paper;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);

  stops.forEach((stop, i) => {
    const x = roadX(i);
    const y = nodeY(i);
    const r = 24 * scale;

    ctx.fillStyle = stop.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = font(900, 24 * scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${stop.seq}`, x, y + 1);

    const cardX = 250;
    const cardW = W - cardX - 80;
    const cardH = rowH - 18 * scale;
    const cardY = y - cardH / 2;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(92, 61, 46, 0.10)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, cardX, cardY, cardW, cardH, 18 * scale);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = stop.color;
    roundRect(ctx, cardX, cardY, 8, cardH, 4);
    ctx.fill();

    const pad = 28;
    const lines: { text: string; f: string; color: string }[] = [];
    const meta = [stop.timeText, stop.categoryLabel].filter(Boolean).join('  ·  ');
    if (meta) lines.push({ text: meta, f: font(700, 22 * scale), color: stop.color });
    lines.push({ text: stop.label, f: font(800, 32 * scale), color: C.ink });
    if (stop.extra && cardH > 90 * scale) lines.push({ text: stop.extra, f: font(500, 21 * scale), color: C.inkLight });

    const lineH = (l: { f: string }) => parseFloat(l.f.split(' ')[1]) * 1.35;
    const total = lines.reduce((s, l) => s + lineH(l), 0);
    let ly = y - total / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const l of lines) {
      ctx.font = l.f;
      ctx.fillStyle = l.color;
      ctx.fillText(fitText(ctx, l.text, cardW - pad * 2), cardX + pad, ly);
      ly += lineH(l);
    }
  });

  drawFooter(ctx, data, POSTER_H);
}

// ───────────────────────── 時程甘特 ─────────────────────────

/** 寬 1080、高度依站數；X 軸為整點，時間沒寫明的站列在下方不畫長條 */
export function drawGantt(canvas: HTMLCanvasElement, data: PosterData) {
  const rows = parseGanttRows(data.stops);
  const timed = rows.filter((r): r is GanttRow & { start: number; end: number } => r.start != null && r.end != null);
  const rowH = 78;
  const headerH = 300 + (data.summary ? 72 : 0);
  const h = Math.max(900, headerH + rows.length * rowH + 260);
  canvas.width = W;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 Canvas 2D');

  drawPaper(ctx, h);
  const top = drawHeader(ctx, data, 92);
  if (!timed.length) return;

  const startHour = Math.floor(Math.min(...timed.map((r) => r.start)) / 60);
  const endHour = Math.max(startHour + 1, Math.ceil(Math.max(...timed.map((r) => r.end)) / 60));
  const left = 330;
  const right = W - 80;
  const xAt = (minute: number) => left + ((minute - startHour * 60) / ((endHour - startHour) * 60)) * (right - left);
  const axisY = top + 20;
  const bodyTop = axisY + 44;
  const bodyBottom = bodyTop + rows.length * rowH;

  // 整點刻度；超過 12 小時改每 2 小時一格，避免字擠在一起
  const step = endHour - startHour > 12 ? 2 : 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let hr = startHour; hr <= endHour; hr += step) {
    const x = xAt(hr * 60);
    ctx.fillStyle = C.inkLight;
    ctx.font = font(700, 20);
    ctx.fillText(`${String(hr % 24).padStart(2, '0')}:00`, x, axisY + 24);
    ctx.strokeStyle = hexToRgba(C.ink, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, bodyTop - 6);
    ctx.lineTo(x, bodyBottom);
    ctx.stroke();
  }

  rows.forEach((row, i) => {
    const y = bodyTop + i * rowH;
    if (i % 2 === 0) {
      ctx.fillStyle = hexToRgba(C.paperDark, 0.6);
      ctx.fillRect(64, y, W - 128, rowH);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 24);
    ctx.fillText(fitText(ctx, `${row.stop.seq}. ${row.stop.label}`, left - 100), left - 20, y + rowH / 2 - 11);
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 18);
    ctx.fillText(fitText(ctx, row.stop.categoryLabel || '', left - 100), left - 20, y + rowH / 2 + 16);

    if (row.start == null || row.end == null) {
      ctx.textAlign = 'left';
      ctx.fillStyle = C.muted;
      ctx.font = font(500, 20);
      ctx.fillText(fitText(ctx, `⏳ 時間未寫明${row.stop.timeText ? `：${row.stop.timeText}` : ''}`, right - left - 10), left + 10, y + rowH / 2);
      return;
    }

    const x1 = xAt(row.start);
    const barW = Math.max(14, xAt(row.end) - x1);
    const barY = y + 14;
    const barH = rowH - 28;
    ctx.fillStyle = row.estimated ? hexToRgba(row.stop.color, 0.45) : row.stop.color;
    roundRect(ctx, x1, barY, barW, barH, 10);
    ctx.fill();
    if (row.estimated) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = row.stop.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 時段文字放得下就寫在條內，否則寫在條的右邊
    const label = row.stop.timeText || '';
    ctx.font = font(700, 19);
    const fitsInside = ctx.measureText(label).width + 20 < barW;
    ctx.textAlign = 'left';
    ctx.fillStyle = fitsInside && !row.estimated ? '#fff' : C.ink;
    const textX = fitsInside ? x1 + 10 : Math.min(x1 + barW + 10, right - ctx.measureText(label).width);
    ctx.fillText(label, textX, y + rowH / 2);
  });

  // 圖例
  const legendY = bodyBottom + 56;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(600, 20);
  ctx.fillStyle = C.accent;
  roundRect(ctx, 72, legendY - 10, 36, 20, 6);
  ctx.fill();
  ctx.fillStyle = C.inkLight;
  ctx.fillText('原文寫明的時段', 118, legendY);
  ctx.fillStyle = hexToRgba(C.accent, 0.45);
  roundRect(ctx, 330, legendY - 10, 36, 20, 6);
  ctx.fill();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.inkLight;
  ctx.fillText('推算（到下一站為止／依停留時間）', 376, legendY);

  drawFooter(ctx, data, h);
}

// ───────────────────────── 匯出 ─────────────────────────

/** 中文字型若尚未載入，第一次畫會退回系統預設字型；畫之前先等一下 */
export async function ensurePosterFonts(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all([font(900, 56), font(500, 22)].map((f) => document.fonts.load(f, '定康')));
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('圖片產生失敗'))), 'image/png');
  });
}

/**
 * 手機（觸控）優先走系統分享，可以直接丟 LINE／IG；iOS Safari 對 <a download> 支援不穩。
 * 桌面或不支援分享檔案時改用下載連結。回傳 'cancelled' 代表使用者自己關掉分享面板。
 */
export async function exportPng(canvas: HTMLCanvasElement, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], filename, { type: 'image/png' });
  const touch = window.matchMedia('(pointer: coarse)').matches;

  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename.replace(/\.png$/, '') });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      console.warn('分享失敗，改用下載', err);
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
