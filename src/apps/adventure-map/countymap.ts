import { TAIWAN_COUNTIES, TAIWAN_INSETS, TAIWAN_VIEWBOX } from './taiwan-shape';

/** 數量越多顏色越深；0 筆的縣市不能點 */
function fillLevel(count: number): number {
  if (count === 0) return 0;
  if (count < 5) return 1;
  if (count < 20) return 2;
  return 3;
}

/**
 * 台灣縣市地圖選擇器：點縣市＝選取，再點一次取消。
 * 金門、馬祖在左上角插圖框裡，點框也算；澎湖、新竹市、嘉義市這種小塊另有下方按鈕列可點。
 */
export function renderCountyMap(
  mount: HTMLElement,
  counts: Map<string, number>,
  selected: string | null,
  unit: string,
  onSelect: (county: string | null) => void
) {
  const insets = TAIWAN_INSETS.map((r) => {
    const n = counts.get(r.name) ?? 0;
    const label = r.name === '連江縣' ? '馬祖' : '金門';
    return `<g class="adv-cmap-inset" ${n ? `data-county="${r.name}"` : ''}>
        <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" />
        <text x="${r.x + 6}" y="${r.y + r.h - 6}">${label}</text>
      </g>`;
  }).join('');

  const shapes = TAIWAN_COUNTIES.map((c) => {
    const n = counts.get(c.name) ?? 0;
    const cls = `adv-cmap-county lv${fillLevel(n)}${c.name === selected ? ' is-selected' : ''}`;
    const attrs = n
      ? `data-county="${c.name}" role="button" tabindex="0" aria-pressed="${c.name === selected}" aria-label="${c.name} ${n} ${unit}"`
      : 'aria-hidden="true"';
    return `<path class="${cls}" d="${c.d}" ${attrs}><title>${c.name}${n ? ` ${n} ${unit}` : ''}</title></path>`;
  }).join('');

  // 數字另外疊一層，才不會被後畫的鄰近縣市蓋住
  const badges = TAIWAN_COUNTIES.filter((c) => counts.get(c.name))
    .map((c) => `<text class="adv-cmap-num${c.name === selected ? ' is-selected' : ''}" x="${c.x}" y="${c.y}">${counts.get(c.name)}</text>`)
    .join('');

  const chips = Array.from(counts.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
    .map(([name, n]) => {
      const active = name === selected;
      return `<button type="button" class="adv-guide-season ${active ? 'is-active' : ''}" data-county="${name}" aria-pressed="${active}">${name}<span class="adv-guide-season-count">${n}</span></button>`;
    })
    .join('');

  const hint = selected
    ? `<b>📍 ${selected}</b>　${counts.get(selected) ?? 0} ${unit}　<button type="button" class="adv-cmap-clear" data-county-clear>✕ 換一個</button>`
    : '點地圖上的縣市挑一個，顏色越深越多';

  mount.innerHTML = `
    <div class="adv-cmap">
      <svg class="adv-cmap-svg" viewBox="${TAIWAN_VIEWBOX}" role="group" aria-label="台灣縣市地圖">${insets}${shapes}${badges}</svg>
      <div class="adv-cmap-side">
        <p class="adv-cmap-hint">${hint}</p>
        <div class="adv-guide-seasons adv-cmap-chips" role="group" aria-label="依縣市挑選">${chips}</div>
      </div>
    </div>`;

  const pick = (name: string) => onSelect(name === selected ? null : name);
  mount.querySelectorAll<SVGElement | HTMLElement>('[data-county]').forEach((el) => {
    const name = el.dataset.county as string;
    el.addEventListener('click', () => pick(name));
    el.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key !== 'Enter' && key !== ' ') return;
      e.preventDefault();
      pick(name);
    });
  });
  mount.querySelector('[data-county-clear]')?.addEventListener('click', () => onSelect(null));
}

/** 「台北市大安區」→「台北市」；沒有區域回 null */
export function countyOf(area: string | null | undefined): string | null {
  return area ? area.slice(0, 3) : null;
}
