import { PlaceEntry } from '../../shared/types';
import {
  LEDGER_CATEGORY,
  LEDGER_METHOD,
  LEDGER_MONTHLY_DEPOSIT,
  LEDGER_SHOW_SPECIAL,
  LedgerCategory,
} from './data';
import { IDENTITIES, Identity, LedgerEntry, LedgerInput, LedgerKind, LedgerMethod, Trip } from './supabase';
import { esc, openModal, showToast } from './ui';

/** 💰 公帳分頁：📒 流水（本月逐日）、✅ 核對（對信用卡帳單）、📊 回顧（月報） */
export type LedgerView = 'list' | 'check' | 'review';

export interface LedgerState {
  /** YYYY-MM */
  month: string;
  view: LedgerView;
}

export interface LedgerHandlers {
  /** preset 用於「記入金」這類預先帶好欄位的入口 */
  onAdd: (preset?: Partial<LedgerInput>) => void;
  onEdit: (entry: LedgerEntry) => void;
  onSetChecked: (ids: number[], checked: boolean) => void;
  onStateChange: (state: LedgerState) => void;
}

const WEEKDAY = '日一二三四五六';
const pad = (n: number) => String(n).padStart(2, '0');

function money(n: number): string {
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('zh-TW')}`;
}

/** 本機日期 YYYY-MM-DD；toISOString 是 UTC，台灣早上 8 點前會變成昨天 */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentMonth(): string {
  return localDate().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}/${d}（${WEEKDAY[new Date(y, m - 1, d).getDay()]}）`;
}

const sum = (list: LedgerEntry[]) => list.reduce((s, e) => s + e.amount, 0);

const expensesIn = (entries: LedgerEntry[], month: string) =>
  entries.filter((e) => e.kind === 'expense' && e.spent_on.startsWith(month));

/** 對公帳餘額的影響：入金、調整照正負加；支出扣掉（退款是負數支出，等於加回來） */
const signed = (e: LedgerEntry) => (e.kind === 'expense' ? -e.amount : e.amount);

/** 月底為止的公帳餘額（銀行帳戶＋信用卡未繳合計）；字串比較時 -31 對所有月份都成立 */
function balanceAt(entries: LedgerEntry[], month: string): number {
  const end = `${month}-31`;
  return entries.filter((e) => e.spent_on <= end).reduce((s, e) => s + signed(e), 0);
}

function categoryOf(e: LedgerEntry) {
  return e.category ? LEDGER_CATEGORY[e.category] : null;
}

function entryIcon(e: LedgerEntry): string {
  if (e.kind === 'deposit') return '💰';
  if (e.kind === 'adjust') return '⚖️';
  return categoryOf(e)?.emoji || '📦';
}

function entryTitle(e: LedgerEntry): string {
  if (e.note) return e.note;
  if (e.kind === 'deposit') return `${e.paid_by || ''} 入金`;
  if (e.kind === 'adjust') return '對帳調整';
  return categoryOf(e)?.label || '支出';
}

/** 流水與回顧顯示的金額：支出照實寫，入金與調整標出正負 */
function entryAmount(e: LedgerEntry): string {
  if (e.kind === 'expense') return money(e.amount);
  return `${e.amount > 0 ? '+' : ''}${money(e.amount)}`;
}

// ───────────────────────── 分頁本體 ─────────────────────────

export function renderLedger(
  entries: LedgerEntry[],
  places: PlaceEntry[],
  trips: Trip[],
  state: LedgerState,
  handlers: LedgerHandlers
) {
  const mount = document.getElementById('adv-section-ledger');
  if (!mount) return;

  const { month, view } = state;
  const placeById = new Map(places.map((p) => [p.id, p]));
  const tripBySlug = new Map(trips.map((t) => [t.slug, t]));
  const monthEntries = entries.filter((e) => e.spent_on.startsWith(month));
  const unchecked = entries.filter((e) => e.kind === 'expense' && e.method === 'card' && !e.checked);
  const isFuture = month > currentMonth();

  const viewChip = (v: LedgerView, label: string, count?: number) =>
    `<button type="button" class="adv-guide-season ${view === v ? 'is-active' : ''}" data-ledger-view="${v}" aria-pressed="${view === v}">${label}${
      count ? `<span class="adv-guide-season-count">${count}</span>` : ''
    }</button>`;

  // 本月有人還沒記入金就提醒，一鍵帶好金額；未來月份不提醒
  const missingDeposit = isFuture
    ? []
    : IDENTITIES.filter((id) => !monthEntries.some((e) => e.kind === 'deposit' && e.paid_by === id));

  const body = view === 'check'
    ? checkHTML(unchecked, monthEntries.filter((e) => e.kind === 'expense' && e.method === 'card' && e.checked))
    : view === 'review'
      ? reviewHTML(entries, month, placeById, tripBySlug)
      : listHTML(monthEntries, placeById, tripBySlug);

  mount.innerHTML = `
    <div class="adv-ledger-month">
      <button type="button" class="adv-ledger-month__nav" data-ledger-month="-1" aria-label="上個月">‹</button>
      <span class="adv-ledger-month__label">${monthLabel(month)}</span>
      <button type="button" class="adv-ledger-month__nav" data-ledger-month="1" aria-label="下個月">›</button>
      ${month !== currentMonth() ? '<button type="button" class="adv-card-btn adv-ledger-month__today" data-ledger-month="0">回本月</button>' : ''}
    </div>
    <div class="adv-ach-stats adv-ledger-stats">
      <div class="adv-ach-stat"><b>${money(sum(expensesIn(entries, month)))}</b><span>本月花費</span></div>
      <div class="adv-ach-stat"><b>${money(sum(monthEntries.filter((e) => e.kind === 'deposit')))}</b><span>本月入金</span></div>
      <div class="adv-ach-stat"><b>${money(balanceAt(entries, month))}</b><span>公帳餘額</span></div>
    </div>
    ${missingDeposit.length ? `
      <div class="adv-ledger-remind">
        <span>🪙 本月還沒記入金：</span>
        ${missingDeposit.map((id) => `<button type="button" class="adv-card-btn" data-ledger-deposit="${id}">${id} 存 ${money(LEDGER_MONTHLY_DEPOSIT)}</button>`).join('')}
      </div>` : ''}
    <div class="adv-guide-seasons" role="group" aria-label="切換公帳畫面">
      ${viewChip('list', '📒 流水')}
      ${viewChip('check', '✅ 核對', unchecked.length)}
      ${viewChip('review', '📊 回顧')}
    </div>
    ${body}
  `;

  const byId = new Map(entries.map((e) => [e.id, e]));

  mount.onclick = (ev) => {
    const target = ev.target as HTMLElement;

    const monthBtn = target.closest<HTMLElement>('[data-ledger-month]');
    if (monthBtn) {
      const delta = Number(monthBtn.dataset.ledgerMonth);
      handlers.onStateChange({ view, month: delta ? shiftMonth(month, delta) : currentMonth() });
      return;
    }

    const viewBtn = target.closest<HTMLElement>('[data-ledger-view]');
    if (viewBtn) {
      handlers.onStateChange({ month, view: viewBtn.dataset.ledgerView as LedgerView });
      return;
    }

    const depositBtn = target.closest<HTMLElement>('[data-ledger-deposit]');
    if (depositBtn) {
      // 入金日期記在這個月：本月就記今天，補記過去月份就記那個月 1 號
      handlers.onAdd({
        kind: 'deposit',
        paid_by: depositBtn.dataset.ledgerDeposit as Identity,
        amount: LEDGER_MONTHLY_DEPOSIT,
        spent_on: month === currentMonth() ? localDate() : `${month}-01`,
      });
      return;
    }

    const row = target.closest<HTMLElement>('[data-ledger-id]');
    if (row) {
      const entry = byId.get(Number(row.dataset.ledgerId));
      if (entry) handlers.onEdit(entry);
      return;
    }

    const checkBtn = target.closest<HTMLElement>('[data-ledger-check]');
    if (checkBtn) {
      const list = checkBtn.closest('.adv-ledger-checklist');
      const ids = [...(list?.querySelectorAll<HTMLInputElement>('input[value]:checked') || [])].map((i) => Number(i.value));
      if (ids.length) handlers.onSetChecked(ids, checkBtn.dataset.ledgerCheck === 'on');
      return;
    }

    if (target.closest('[data-ledger-copy]')) copyReview(entries, month, placeById, tripBySlug);
  };

  // 核對清單：勾選時更新「已選 N 筆、合計」，方便跟帳單上的金額比
  mount.onchange = (ev) => {
    const box = ev.target as HTMLInputElement;
    const list = box.closest('.adv-ledger-checklist');
    if (!list) return;
    if (box.dataset.ledgerAll !== undefined) {
      list.querySelectorAll<HTMLInputElement>('input[value]').forEach((i) => (i.checked = box.checked));
    }
    const picked = [...list.querySelectorAll<HTMLInputElement>('input[value]:checked')].map((i) => byId.get(Number(i.value)));
    const total = picked.reduce((s, e) => s + (e?.amount || 0), 0);
    const status = list.querySelector('.adv-ledger-checklist__status');
    if (status) status.textContent = picked.length ? `已選 ${picked.length} 筆，合計 ${money(total)}` : '勾選對得上的那幾筆';
    list.querySelector<HTMLButtonElement>('[data-ledger-check]')?.toggleAttribute('disabled', !picked.length);
  };
}

function metaParts(e: LedgerEntry, placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): string[] {
  const parts: string[] = [];
  if (e.kind === 'expense') {
    if (e.note) parts.push(esc(categoryOf(e)?.label));
    if (e.paid_by) parts.push(`${esc(e.paid_by)}${e.method === 'card' ? '刷卡' : e.method === 'own' ? '先墊' : '轉帳'}`);
  }
  const place = e.place_id != null ? placeById.get(e.place_id) : undefined;
  if (place) parts.push(`📍 ${esc(place.name)}`);
  const trip = e.trip_slug ? tripBySlug.get(e.trip_slug) : undefined;
  if (trip) parts.push(`✈️ ${esc(trip.title)}`);
  if (LEDGER_SHOW_SPECIAL && e.is_special) parts.push('✨ 特別的日子');
  if (e.kind === 'expense' && e.method === 'card' && e.checked) parts.push('✓ 已核對');
  return parts;
}

function rowHTML(e: LedgerEntry, placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): string {
  const meta = metaParts(e, placeById, tripBySlug);
  const income = e.kind !== 'expense' ? e.amount > 0 : e.amount < 0;
  return `
    <button type="button" class="adv-ledger-row" data-ledger-id="${e.id}" style="--cat-color:${categoryOf(e)?.color || 'var(--adv-yellow)'}">
      <span class="adv-ledger-row__icon" aria-hidden="true">${entryIcon(e)}</span>
      <span class="adv-ledger-row__main">
        <span class="adv-ledger-row__title">${esc(entryTitle(e))}</span>
        ${meta.length ? `<span class="adv-ledger-row__meta">${meta.join(' · ')}</span>` : ''}
      </span>
      <span class="adv-ledger-row__amt ${income ? 'adv-ledger-row__amt--in' : ''}">${entryAmount(e)}</span>
    </button>
  `;
}

function listHTML(monthEntries: LedgerEntry[], placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): string {
  if (!monthEntries.length) return '<p class="adv-empty">這個月還沒有記帳，按「＋ 記一筆」開始</p>';

  const days = new Map<string, LedgerEntry[]>();
  [...monthEntries]
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.id - a.id)
    .forEach((e) => days.set(e.spent_on, [...(days.get(e.spent_on) || []), e]));

  return [...days.entries()].map(([date, list]) => {
    const spent = sum(list.filter((e) => e.kind === 'expense'));
    return `
      <div class="adv-ledger-day">
        <div class="adv-ledger-day__head"><span>${dayLabel(date)}</span>${spent ? `<span>小計 ${money(spent)}</span>` : ''}</div>
        ${list.map((e) => rowHTML(e, placeById, tripBySlug)).join('')}
      </div>
    `;
  }).join('');
}

function checklistHTML(list: LedgerEntry[], action: 'on' | 'off'): string {
  return `
    <div class="adv-ledger-checklist">
      <label class="adv-ledger-check adv-ledger-check--all"><input type="checkbox" data-ledger-all /> 全選</label>
      ${list.map((e) => `
        <label class="adv-ledger-check">
          <input type="checkbox" value="${e.id}" />
          <span class="adv-ledger-check__date">${dayLabel(e.spent_on)}</span>
          <span class="adv-ledger-check__title">${entryIcon(e)} ${esc(entryTitle(e))}${e.paid_by ? ` <small>${esc(e.paid_by)}</small>` : ''}</span>
          <span class="adv-ledger-check__amt">${money(e.amount)}</span>
        </label>`).join('')}
      <div class="adv-ledger-checklist__bar">
        <span class="adv-ledger-checklist__status">勾選對得上的那幾筆</span>
        <button type="button" class="adv-card-btn ${action === 'on' ? 'adv-card-btn--primary' : ''}" data-ledger-check="${action}" disabled>${action === 'on' ? '✓ 標記已核對' : '取消核對'}</button>
      </div>
    </div>
  `;
}

/** 依日期由舊到新，跟帳單的順序一樣 */
function checkHTML(unchecked: LedgerEntry[], checkedThisMonth: LedgerEntry[]): string {
  const byDate = (a: LedgerEntry, b: LedgerEntry) => a.spent_on.localeCompare(b.spent_on) || a.id - b.id;
  return `
    <p class="adv-modal-hint adv-ledger-hint">打開信用卡帳單逐筆對：對得上就勾起來。帳單上有、這裡沒有的就是漏記，按「＋ 記一筆」補上；金額不同就點流水那筆改掉。</p>
    ${unchecked.length
      ? `<div class="adv-ledger-subhead">待核對 ${unchecked.length} 筆・合計 ${money(sum(unchecked))}</div>${checklistHTML([...unchecked].sort(byDate), 'on')}`
      : '<p class="adv-empty">🎉 刷卡紀錄都核對過了</p>'}
    ${checkedThisMonth.length ? `
      <details class="adv-ledger-done">
        <summary>本月已核對 ${checkedThisMonth.length} 筆</summary>
        ${checklistHTML([...checkedThisMonth].sort(byDate), 'off')}
      </details>` : ''}
  `;
}

// ───────────────────────── 回顧（月報） ─────────────────────────

interface ReviewData {
  total: number;
  lastTotal: number;
  count: number;
  days: number;
  categories: { key: LedgerCategory; amount: number; count: number; lastAmount: number }[];
  top: LedgerEntry[];
  places: { name: string; amount: number; count: number }[];
  trips: { title: string; amount: number }[];
  own: { who: string; amount: number; count: number }[];
  special: number;
  deposited: number;
  balance: number;
}

function reviewData(
  entries: LedgerEntry[],
  month: string,
  placeById: Map<number, PlaceEntry>,
  tripBySlug: Map<string, Trip>
): ReviewData {
  const cur = expensesIn(entries, month);
  const last = expensesIn(entries, shiftMonth(month, -1));

  const categories = (Object.keys(LEDGER_CATEGORY) as LedgerCategory[])
    .map((key) => {
      const mine = cur.filter((e) => e.category === key);
      return { key, amount: sum(mine), count: mine.length, lastAmount: sum(last.filter((e) => e.category === key)) };
    })
    .filter((c) => c.amount !== 0 || c.count > 0)
    .sort((a, b) => b.amount - a.amount);

  const group = <K>(list: LedgerEntry[], keyOf: (e: LedgerEntry) => K | null) => {
    const map = new Map<K, LedgerEntry[]>();
    list.forEach((e) => {
      const k = keyOf(e);
      if (k != null) map.set(k, [...(map.get(k) || []), e]);
    });
    return [...map.entries()];
  };

  return {
    total: sum(cur),
    lastTotal: sum(last),
    count: cur.length,
    days: new Set(cur.map((e) => e.spent_on)).size,
    categories,
    top: [...cur].sort((a, b) => b.amount - a.amount).slice(0, 5),
    places: group(cur, (e) => e.place_id)
      .map(([id, list]) => ({ name: placeById.get(id)?.name || '已刪除的地點', amount: sum(list), count: list.length }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8),
    trips: group(cur, (e) => e.trip_slug)
      .map(([slug, list]) => ({ title: tripBySlug.get(slug)?.title || slug, amount: sum(list) }))
      .sort((a, b) => b.amount - a.amount),
    own: group(cur.filter((e) => e.method === 'own'), (e) => e.paid_by || '沒填')
      .map(([who, list]) => ({ who, amount: sum(list), count: list.length })),
    special: sum(cur.filter((e) => e.is_special)),
    deposited: sum(entries.filter((e) => e.kind === 'deposit' && e.spent_on.startsWith(month))),
    balance: balanceAt(entries, month),
  };
}

function compareText(now: number, before: number): string {
  if (!before) return '上個月沒有紀錄';
  const diff = now - before;
  if (!diff) return '跟上個月一樣';
  const pct = Math.round((Math.abs(diff) / before) * 100);
  return `比上個月${diff > 0 ? '多' : '少'} ${money(Math.abs(diff))}（${pct}%）`;
}

function reviewHTML(
  entries: LedgerEntry[],
  month: string,
  placeById: Map<number, PlaceEntry>,
  tripBySlug: Map<string, Trip>
): string {
  const d = reviewData(entries, month, placeById, tripBySlug);
  if (!d.count && !d.deposited) return '<p class="adv-empty">這個月還沒有紀錄，回顧會在記帳後出現</p>';

  const maxCat = Math.max(1, ...d.categories.map((c) => c.amount));
  const favorite = [...d.categories].sort((a, b) => b.count - a.count)[0];
  const box = (title: string, inner: string) =>
    `<section class="adv-ledger-box"><h4 class="adv-ledger-box__title">${title}</h4>${inner}</section>`;

  const parts = [
    box('🧾 這個月', `
      <p class="adv-ledger-big">${money(d.total)}</p>
      <p class="adv-ledger-sub">${compareText(d.total, d.lastTotal)}・${d.count} 筆・${d.days} 天有花錢</p>
      ${favorite && favorite.count > 1 ? `<p class="adv-ledger-sub">最常記的是 ${LEDGER_CATEGORY[favorite.key].emoji} ${LEDGER_CATEGORY[favorite.key].label} ×${favorite.count}</p>` : ''}
    `),
  ];

  if (d.categories.length) {
    parts.push(box('🍰 花在哪裡', `<div class="adv-ledger-bars">${d.categories.map((c) => {
      const cfg = LEDGER_CATEGORY[c.key];
      const share = d.total ? Math.round((c.amount / d.total) * 100) : 0;
      const diff = c.amount - c.lastAmount;
      return `
        <div class="adv-ledger-bar" style="--cat-color:${cfg.color}">
          <span class="adv-ledger-bar__label">${cfg.emoji} ${cfg.label}</span>
          <span class="adv-ledger-bar__track"><span class="adv-ledger-bar__fill" style="width:${Math.max(0, (c.amount / maxCat) * 100)}%"></span></span>
          <span class="adv-ledger-bar__amt">${money(c.amount)}<small>${share > 0 ? `${share}%` : '退款'}${c.lastAmount && diff ? `・${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}` : ''}</small></span>
        </div>`;
    }).join('')}</div>`));
  }

  if (d.top.length) {
    parts.push(box('🏅 最大的幾筆', `<ol class="adv-ledger-top">${d.top
      .map((e) => `<li><span>${dayLabel(e.spent_on)} ${entryIcon(e)} ${esc(entryTitle(e))}</span><b>${money(e.amount)}</b></li>`)
      .join('')}</ol>`));
  }

  if (d.places.length) {
    parts.push(box('📍 去了哪些地方', `<ul class="adv-ledger-top">${d.places
      .map((p) => `<li><span>${esc(p.name)}${p.count > 1 ? ` ×${p.count}` : ''}</span><b>${money(p.amount)}</b></li>`)
      .join('')}</ul>`));
  }

  if (d.trips.length) {
    parts.push(box('✈️ 旅行', `<ul class="adv-ledger-top">${d.trips
      .map((t) => `<li><span>${esc(t.title)}</span><b>${money(t.amount)}</b></li>`)
      .join('')}</ul>`));
  }

  if (LEDGER_SHOW_SPECIAL && d.special) {
    parts.push(box('✨ 特別的日子', `<p class="adv-ledger-sub">特別的日子 ${money(d.special)}・平常約會 ${money(d.total - d.special)}</p>`));
  }

  if (d.own.length) {
    parts.push(box('👛 自己先墊的', `<ul class="adv-ledger-top">${d.own
      .map((o) => `<li><span>${esc(o.who)} 先墊 ${o.count} 筆</span><b>${money(o.amount)}</b></li>`)
      .join('')}</ul><p class="adv-ledger-sub">記得從公帳轉回給先墊的人</p>`));
  }

  parts.push(box('🐷 公帳', `
    <p class="adv-ledger-sub">入金 ${money(d.deposited)} − 花費 ${money(d.total)} ＝ 本月結餘 <b>${money(d.deposited - d.total)}</b></p>
    <p class="adv-ledger-sub">到月底公帳還有 <b>${money(d.balance)}</b></p>
  `));

  return `
    <div class="adv-ledger-review">${parts.join('')}</div>
    <button type="button" class="adv-card-btn adv-ledger-copy" data-ledger-copy>📋 複製成文字（貼到 LINE）</button>
  `;
}

function copyReview(
  entries: LedgerEntry[],
  month: string,
  placeById: Map<number, PlaceEntry>,
  tripBySlug: Map<string, Trip>
) {
  const d = reviewData(entries, month, placeById, tripBySlug);
  const lines = [
    `💰 公帳回顧｜${monthLabel(month)}`,
    `花了 ${money(d.total)}，${compareText(d.total, d.lastTotal)}`,
    '',
    ...d.categories.map((c) => `${LEDGER_CATEGORY[c.key].emoji} ${LEDGER_CATEGORY[c.key].label} ${money(c.amount)}（${d.total ? Math.round((c.amount / d.total) * 100) : 0}%）`),
  ];
  if (d.top.length) lines.push('', '最大的幾筆：', ...d.top.map((e, i) => `${i + 1}. ${entryTitle(e)} ${money(e.amount)}`));
  if (d.places.length) lines.push('', `去了：${d.places.map((p) => p.name).join('、')}`);
  lines.push('', `入金 ${money(d.deposited)} − 花費 ${money(d.total)} ＝ 結餘 ${money(d.deposited - d.total)}`, `公帳還有 ${money(d.balance)}`);

  navigator.clipboard.writeText(lines.join('\n')).then(
    () => showToast('已複製，可以貼到 LINE 了'),
    () => showToast('複製失敗')
  );
}

// ───────────────────────── 記一筆 ─────────────────────────

export type ExpenseModalResult = { action: 'save'; input: LedgerInput } | { action: 'delete' } | null;

export interface ExpenseModalOptions {
  existing?: LedgerEntry;
  preset?: Partial<LedgerInput>;
  identity: Identity | null;
  places: PlaceEntry[];
  trips: Trip[];
  /** 用來產生「最近記過」快捷鍵，同一個備註只留最近一次 */
  entries: LedgerEntry[];
}

const KIND_LABEL: Record<LedgerKind, string> = { expense: '💸 支出', deposit: '💰 入金', adjust: '⚖️ 調整' };

/** 必填只有金額、分類、誰付；其他都有預設值或可留空 */
export function openExpenseModal(opts: ExpenseModalOptions): Promise<ExpenseModalResult> {
  return new Promise((resolve) => {
    const base = opts.existing || opts.preset || {};
    let kind: LedgerKind = base.kind || 'expense';
    let category: LedgerCategory | null = base.category || null;
    let paidBy: Identity | null = base.paid_by ?? opts.identity;
    let method: LedgerMethod = base.method || 'card';
    let placeId: number | null = base.place_id ?? null;
    let negative = (base.amount ?? 0) < 0;
    const placeById = new Map(opts.places.map((p) => [p.id, p]));

    const recent: LedgerEntry[] = [];
    if (!opts.existing) {
      const seen = new Set<string>();
      for (const e of opts.entries) {
        if (recent.length >= 6) break;
        if (e.kind !== 'expense' || !e.note || e.amount <= 0 || seen.has(e.note)) continue;
        seen.add(e.note);
        recent.push(e);
      }
    }

    // 已經記在隱藏分類的舊帳要能看到原分類，不然修改時會被迫換掉
    const categories = (Object.entries(LEDGER_CATEGORY) as [LedgerCategory, (typeof LEDGER_CATEGORY)[LedgerCategory]][])
      .filter(([key, cfg]) => !cfg.hidden || key === category);
    const chip = (attr: string, value: string, label: string, active: boolean) =>
      `<button type="button" class="adv-guide-season ${active ? 'is-active' : ''}" ${attr}="${value}" aria-pressed="${active}">${label}</button>`;

    const { root, close } = openModal(`
      <h3>${opts.existing ? '修改這筆' : '記一筆'}</h3>
      <div class="adv-ledger-chips" id="adv-lf-kinds">
        ${(Object.keys(KIND_LABEL) as LedgerKind[]).map((k) => chip('data-kind', k, KIND_LABEL[k], k === kind)).join('')}
      </div>
      ${recent.length ? `
        <div class="adv-ledger-recent" data-only="expense">
          ${recent.map((e) => `<button type="button" class="adv-card-btn" data-recent="${e.id}">${entryIcon(e)} ${esc(e.note)} ${money(e.amount)}</button>`).join('')}
        </div>` : ''}
      <label for="adv-lf-amount">金額</label>
      <div class="adv-ledger-amount">
        <input type="text" id="adv-lf-amount" inputmode="numeric" autocomplete="off" placeholder="320" value="${base.amount ? Math.abs(base.amount) : ''}" />
        <button type="button" class="adv-guide-season" id="adv-lf-sign" aria-pressed="false"></button>
      </div>
      <div data-only="expense">
        <label>分類</label>
        <div class="adv-ledger-cats">
          ${categories.map(([key, cfg]) => `
            <button type="button" class="adv-ledger-cat ${key === category ? 'is-active' : ''}" data-cat="${key}" style="--cat-color:${cfg.color}" aria-pressed="${key === category}">
              <span aria-hidden="true">${cfg.emoji}</span>${cfg.label}
            </button>`).join('')}
        </div>
      </div>
      <label id="adv-lf-who-label"></label>
      <div class="adv-ledger-chips" id="adv-lf-who">
        ${IDENTITIES.map((id) => chip('data-who', id, id, id === paidBy)).join('')}
      </div>
      <div data-only="expense">
        <label>怎麼付</label>
        <div class="adv-ledger-chips" id="adv-lf-method">
          ${(Object.keys(LEDGER_METHOD) as LedgerMethod[]).map((m) => chip('data-method', m, LEDGER_METHOD[m], m === method)).join('')}
        </div>
      </div>
      <label for="adv-lf-date">日期</label>
      <input type="date" id="adv-lf-date" value="${esc(base.spent_on || localDate())}" />
      <label for="adv-lf-note">備註（選填）</label>
      <input type="text" id="adv-lf-note" value="${esc(base.note)}" placeholder="例如：鼎泰豐、高鐵台中來回" />
      <div data-only="expense">
        <label>地點（選填）</label>
        <div class="adv-ach-picked" id="adv-lf-picked"></div>
        <input type="text" id="adv-lf-place" placeholder="搜尋破關地圖的地點" autocomplete="off" />
        <div class="adv-ach-results" id="adv-lf-results"></div>
        <label for="adv-lf-trip">哪趟旅行（選填）</label>
        <select id="adv-lf-trip">
          <option value="">不是旅行</option>
          ${opts.trips.map((t) => `<option value="${esc(t.slug)}" ${t.slug === base.trip_slug ? 'selected' : ''}>${esc(t.emoji || '✈️')} ${esc(t.title)}</option>`).join('')}
        </select>
        ${LEDGER_SHOW_SPECIAL ? `
          <label class="adv-ledger-special"><input type="checkbox" id="adv-lf-special" ${base.is_special ? 'checked' : ''} /> ✨ 特別的日子（紀念日、生日…）</label>` : ''}
      </div>
      <div class="adv-modal-error" id="adv-lf-error" style="display:none;"></div>
      <div class="adv-modal-actions">
        ${opts.existing ? '<button class="adv-modal-btn adv-modal-btn--ghost" id="adv-lf-delete">🗑️ 刪除</button>' : ''}
        <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-lf-cancel">取消</button>
        <button class="adv-modal-btn adv-modal-btn--primary" id="adv-lf-submit">${opts.existing ? '儲存修改' : '記下來'}</button>
      </div>
    `);

    const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const amountEl = $<HTMLInputElement>('#adv-lf-amount');
    const signBtn = $<HTMLButtonElement>('#adv-lf-sign');
    const searchEl = $<HTMLInputElement>('#adv-lf-place');
    const pickedEl = $<HTMLElement>('#adv-lf-picked');
    const resultsEl = $<HTMLElement>('#adv-lf-results');

    const setActive = (group: string, attr: string, value: string | null) => {
      root.querySelectorAll<HTMLElement>(`${group} [${attr}]`).forEach((b) => {
        const on = b.getAttribute(attr) === value;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };

    /** 依種類切換欄位：入金不需要分類與付款方式；負數只有支出（退款）和調整用得到 */
    const syncKind = () => {
      root.querySelectorAll<HTMLElement>('[data-only="expense"]').forEach((el) => (el.hidden = kind !== 'expense'));
      $('#adv-lf-who-label').textContent = kind === 'deposit' ? '誰入金' : kind === 'adjust' ? '跟誰有關（選填）' : '誰付的';
      signBtn.hidden = kind === 'deposit';
      if (kind === 'deposit') negative = false;
      signBtn.textContent = kind === 'adjust' ? (negative ? '➖ 減少' : '➕ 增加') : '↩️ 退款';
      signBtn.classList.toggle('is-active', negative);
      signBtn.setAttribute('aria-pressed', String(negative));
    };

    const renderPicked = () => {
      const place = placeId != null ? placeById.get(placeId) : undefined;
      pickedEl.innerHTML = place ? `<button type="button" class="adv-ach-place" data-unpick>${esc(place.name)} ✕</button>` : '';
      searchEl.hidden = !!place;
    };
    const renderResults = () => {
      const q = searchEl.value.trim().toLowerCase();
      const hits = q ? opts.places.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
      resultsEl.innerHTML = hits
        .map((p) => `<button type="button" class="adv-ach-place" data-pick="${p.id}">＋ ${esc(p.name)}${p.area ? ` <small>${esc(p.area)}</small>` : ''}</button>`)
        .join('');
    };

    root.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const kindBtn = t.closest<HTMLElement>('[data-kind]');
      if (kindBtn) {
        kind = kindBtn.dataset.kind as LedgerKind;
        setActive('#adv-lf-kinds', 'data-kind', kind);
        syncKind();
        return;
      }
      const catBtn = t.closest<HTMLElement>('[data-cat]');
      if (catBtn) {
        category = catBtn.dataset.cat as LedgerCategory;
        setActive('.adv-ledger-cats', 'data-cat', category);
        return;
      }
      const whoBtn = t.closest<HTMLElement>('[data-who]');
      if (whoBtn) {
        // 再點一次取消，給「調整」這種不屬於誰的用
        paidBy = paidBy === whoBtn.dataset.who ? null : (whoBtn.dataset.who as Identity);
        setActive('#adv-lf-who', 'data-who', paidBy);
        return;
      }
      const methodBtn = t.closest<HTMLElement>('[data-method]');
      if (methodBtn) {
        method = methodBtn.dataset.method as LedgerMethod;
        setActive('#adv-lf-method', 'data-method', method);
        return;
      }
      const recentBtn = t.closest<HTMLElement>('[data-recent]');
      if (recentBtn) {
        const e = recent.find((r) => r.id === Number(recentBtn.dataset.recent));
        if (!e) return;
        amountEl.value = String(e.amount);
        $<HTMLInputElement>('#adv-lf-note').value = e.note || '';
        category = e.category;
        method = e.method;
        placeId = e.place_id;
        setActive('.adv-ledger-cats', 'data-cat', category);
        setActive('#adv-lf-method', 'data-method', method);
        renderPicked();
        amountEl.focus();
        amountEl.select();
        return;
      }
      if (t.closest('[data-unpick]')) {
        placeId = null;
        renderPicked();
        searchEl.focus();
        return;
      }
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (pick) {
        placeId = Number(pick.dataset.pick);
        searchEl.value = '';
        resultsEl.innerHTML = '';
        renderPicked();
      }
    });

    signBtn.addEventListener('click', () => {
      negative = !negative;
      syncKind();
    });
    searchEl.addEventListener('input', renderResults);

    const fail = (msg: string) => {
      const el = $<HTMLElement>('#adv-lf-error');
      el.style.display = 'block';
      el.textContent = msg;
    };

    $('#adv-lf-cancel').addEventListener('click', () => {
      close();
      resolve(null);
    });
    root.querySelector('#adv-lf-delete')?.addEventListener('click', () => {
      close();
      resolve({ action: 'delete' });
    });
    $('#adv-lf-submit').addEventListener('click', () => {
      const digits = amountEl.value.replace(/[^\d]/g, '');
      const amount = Number(digits) * (negative || amountEl.value.trim().startsWith('-') ? -1 : 1);
      if (!digits || !amount) return fail('金額要填一個不是 0 的數字');
      if (kind === 'expense' && !category) return fail('選一個分類');
      if (kind !== 'adjust' && !paidBy) return fail(kind === 'deposit' ? '選一下是誰入金' : '選一下是誰付的');
      const date = $<HTMLInputElement>('#adv-lf-date').value;
      if (!date) return fail('日期不能空白');

      const expense = kind === 'expense';
      close();
      resolve({
        action: 'save',
        input: {
          spent_on: date,
          kind,
          amount,
          category: expense ? category : null,
          method: expense ? method : 'account',
          paid_by: paidBy,
          note: $<HTMLInputElement>('#adv-lf-note').value.trim() || null,
          place_id: expense ? placeId : null,
          trip_slug: expense ? $<HTMLSelectElement>('#adv-lf-trip').value || null : null,
          // 欄位藏起來時保留原值，之後打開 ✨ 不會把舊資料洗掉
          is_special: !expense ? false : LEDGER_SHOW_SPECIAL ? $<HTMLInputElement>('#adv-lf-special').checked : base.is_special ?? false,
        },
      });
    });

    syncKind();
    renderPicked();
    // 直接聚焦，不要包 setTimeout：iOS 只在使用者點擊的同一輪才肯叫出鍵盤
    if (!opts.existing) amountEl.focus();
  });
}
