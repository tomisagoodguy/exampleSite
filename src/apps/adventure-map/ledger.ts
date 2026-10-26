import { PlaceEntry } from '../../shared/types';
import {
  LEDGER_BIG_EXPENSE,
  LEDGER_CARD_CLOSING_DAY,
  LEDGER_CATEGORY,
  LEDGER_CURRENCY,
  LEDGER_METHOD,
  LEDGER_MONTHLY_DEPOSIT,
  LEDGER_SHOW_SPECIAL,
  LedgerCategory,
  LedgerCategoryConfig,
  ledgerCategory,
  ledgerCategoryForPlace,
} from './data';
import {
  IDENTITIES,
  Identity,
  LedgerBalance,
  LedgerEntry,
  LedgerHistory,
  LedgerInput,
  LedgerKind,
  LedgerMethod,
  Trip,
} from './supabase';
import { esc, openModal, showToast } from './ui';

/** 💰 公帳分頁：📒 流水（本月逐日）、📅 月曆（每天花多少、去了哪）、✅ 核對（對信用卡帳單）、📊 回顧（月報） */
export type LedgerView = 'list' | 'calendar' | 'check' | 'review';

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
  onDeleteMany: (ids: number[]) => void;
  onStateChange: (state: LedgerState) => void;
  onSaveBalance: (input: { checked_on: string; bank: number; card_owed: number; note: string | null }) => void;
  onDeleteBalance: (id: number) => void;
  /** 打開「🕘 改帳紀錄」（全部帳，含刪掉的） */
  onOpenHistory: () => void;
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

/** withYear：不是今年才在前面加年份（跨月搜尋結果用） */
function dayLabel(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number);
  const year = withYear && y !== new Date().getFullYear() ? `${y}/` : '';
  return `${year}${m}/${d}（${WEEKDAY[new Date(y, m - 1, d).getDay()]}）`;
}

/** 某月的結帳日 YYYY-MM-DD；結帳日大於當月天數就算月底。delta 用來往前後推月份 */
function closingIn(month: string, delta = 0): string {
  const ym = shiftMonth(month, delta);
  return `${ym}-${pad(Math.min(LEDGER_CARD_CLOSING_DAY, daysInMonth(ym)))}`;
}

/** 這筆刷卡會出現在哪一期帳單，回傳那期的結帳日 */
function statementClose(date: string): string {
  const close = closingIn(date.slice(0, 7));
  return date <= close ? close : closingIn(date.slice(0, 7), 1);
}

/** 帳單期間「9/16–10/15」：上一期結帳日隔天到這期結帳日 */
function periodLabel(close: string): string {
  const [py, pm, pd] = closingIn(close.slice(0, 7), -1).split('-').map(Number);
  const start = new Date(py, pm - 1, pd + 1);
  const [, m, d] = close.split('-').map(Number);
  return `${start.getMonth() + 1}/${start.getDate()}–${m}/${d}`;
}

const sum = (list: LedgerEntry[]) => list.reduce((s, e) => s + e.amount, 0);

const expensesIn = (entries: LedgerEntry[], month: string) =>
  entries.filter((e) => e.kind === 'expense' && e.spent_on.startsWith(month));

/** 對公帳餘額的影響：入金、調整照正負加；支出扣掉（退款是負數支出，等於加回來） */
const signed = (e: LedgerEntry) => (e.kind === 'expense' ? -e.amount : e.amount);

/** 某天（含）為止帳上的公帳餘額 */
function balanceThrough(entries: LedgerEntry[], date: string): number {
  return entries.filter((e) => e.spent_on <= date).reduce((s, e) => s + signed(e), 0);
}

/** 月底為止的公帳餘額（銀行帳戶＋信用卡未繳合計）；字串比較時 -31 對所有月份都成立 */
function balanceAt(entries: LedgerEntry[], month: string): number {
  return balanceThrough(entries, `${month}-31`);
}

/** 原幣金額：¥3,200、US$12.5 */
function origText(e: Pick<LedgerEntry, 'orig_amount' | 'orig_currency'>): string {
  if (e.orig_amount == null || !e.orig_currency) return '';
  const n = Number(e.orig_amount);
  const sym = LEDGER_CURRENCY[e.orig_currency]?.symbol || `${e.orig_currency} `;
  return `${n < 0 ? '−' : ''}${sym}${Math.abs(n).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
}

// ───────────────────────── 餘額核對點 ─────────────────────────

/**
 * 銀行帳戶實際上應該有的錢 − 帳上算的。
 * 帳上餘額＝銀行＋信用卡未繳（負債）合計，先墊的帳已經扣掉、錢卻還在銀行，所以實際＝銀行 − 卡費未繳 − 先墊待還
 */
function checkpointDiff(b: Pick<LedgerBalance, 'bank' | 'card_owed' | 'own_pending'>, book: number): number {
  return b.bank - b.card_owed - b.own_pending - book;
}

/** 最近一次「現在仍對得上」的核對日；改這天以前的帳會讓那次對好的餘額跑掉 */
function lastMatchedCheckpoint(entries: LedgerEntry[], balances: LedgerBalance[]): string | null {
  const ok = balances.find((b) => checkpointDiff(b, balanceThrough(entries, b.checked_on)) === 0);
  return ok?.checked_on || null;
}

function diffText(diff: number): string {
  if (!diff) return '✅ 對得上';
  return diff > 0 ? `實際多 ${money(diff)}（可能漏記入金或退款）` : `實際少 ${money(-diff)}（可能漏記支出）`;
}

const isBig = (e: LedgerEntry) => e.kind === 'expense' && e.amount >= LEDGER_BIG_EXPENSE;

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** 圖表上的短金額：1.2萬、8,500 */
function moneyShort(n: number): string {
  const a = Math.abs(n);
  const s = a >= 10000 ? `${(a / 10000).toFixed(a >= 100000 ? 0 : 1).replace(/\.0$/, '')}萬` : a.toLocaleString('zh-TW');
  return `${n < 0 ? '−' : ''}${s}`;
}

function categoryOf(e: LedgerEntry) {
  return e.category ? ledgerCategory(e.category) : null;
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
  balances: LedgerBalance[],
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
  // 自己先墊的 checked＝已從公帳轉回給先墊的人，跟刷卡核對共用同一個欄位
  const ownPending = entries.filter((e) => e.kind === 'expense' && e.method === 'own' && !e.checked);
  const isFuture = month > currentMonth();

  const viewChip = (v: LedgerView, label: string, count?: number) =>
    `<button type="button" class="adv-guide-season ${view === v ? 'is-active' : ''}" data-ledger-view="${v}" aria-pressed="${view === v}">${label}${
      count ? `<span class="adv-guide-season-count">${count}</span>` : ''
    }</button>`;

  // 本月有人還沒記入金就提醒，一鍵帶好金額；未來月份不提醒
  const missingDeposit = isFuture
    ? []
    : IDENTITIES.filter((id) => !monthEntries.some((e) => e.kind === 'deposit' && e.paid_by === id));

  // 搜尋時改列所有月份的結果，打字時只重畫 [data-ledger-results]，輸入框不會失去焦點
  const listBody = () => searchQuery.trim()
    ? searchHTML(entries, searchQuery, placeById, tripBySlug)
    : (isFuture ? '' : budgetRemindHTML(entries, month)) + listHTML(monthEntries, placeById, tripBySlug);

  const body = view === 'check'
    ? checkHTML(unchecked, monthEntries.filter((e) => e.kind === 'expense' && e.method === 'card' && e.checked), ownPending)
      + bankHTML(entries, balances)
    : view === 'review'
      ? reviewHTML(entries, month, placeById, tripBySlug)
      : view === 'calendar'
        ? calendarHTML(monthEntries, month, places, placeById, tripBySlug)
        : picking && monthEntries.length
        ? pickHTML(monthEntries)
        : `${searchBoxHTML()}<div data-ledger-results>${listBody()}</div>`;

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
      ${viewChip('calendar', '📅 月曆')}
      ${viewChip('check', '✅ 核對', unchecked.length + ownPending.length)}
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
      picking = false;
      handlers.onStateChange({ view, month: delta ? shiftMonth(month, delta) : currentMonth() });
      return;
    }

    const viewBtn = target.closest<HTMLElement>('[data-ledger-view]');
    if (viewBtn) {
      picking = false;
      handlers.onStateChange({ month, view: viewBtn.dataset.ledgerView as LedgerView });
      return;
    }

    const pickBtn = target.closest<HTMLElement>('[data-ledger-pick]');
    if (pickBtn) {
      picking = pickBtn.dataset.ledgerPick === 'on';
      handlers.onStateChange({ month, view });
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

    const dayBtn = target.closest<HTMLElement>('[data-ledger-day]');
    if (dayBtn) {
      calendarDay = dayBtn.dataset.ledgerDay || null;
      handlers.onStateChange({ month, view });
      return;
    }

    const addDayBtn = target.closest<HTMLElement>('[data-ledger-add-day]');
    if (addDayBtn) {
      handlers.onAdd({ spent_on: addDayBtn.dataset.ledgerAddDay });
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
      if (!ids.length) return;
      if (checkBtn.dataset.ledgerCheck === 'delete') {
        handlers.onDeleteMany(ids);
      } else {
        handlers.onSetChecked(ids, checkBtn.dataset.ledgerCheck === 'on');
      }
      return;
    }

    // 趨勢圖點某個月就跳到那個月的回顧
    const gotoBtn = target.closest<Element>('[data-ledger-goto]');
    if (gotoBtn) {
      const to = gotoBtn.getAttribute('data-ledger-goto');
      if (to && to !== month) handlers.onStateChange({ view, month: to });
      return;
    }

    // 換趨勢圖的分類只重畫那一塊，不動整頁
    const trendBtn = target.closest<HTMLElement>('[data-ledger-trend-cat]');
    if (trendBtn) {
      trendCat = trendBtn.dataset.ledgerTrendCat || '';
      const box = mount.querySelector('[data-ledger-trend]');
      if (box) box.outerHTML = trendBoxHTML(entries, month, forecastMonth(entries, month));
      return;
    }

    const csvBtn = target.closest<HTMLElement>('[data-ledger-csv]');
    if (csvBtn) {
      const all = csvBtn.dataset.ledgerCsv === 'all';
      downloadCSV(all ? entries : monthEntries, all ? `公帳-全部-${localDate().replace(/-/g, '')}.csv` : `公帳-${month}.csv`, placeById, tripBySlug);
      return;
    }

    if (target.closest('[data-ledger-history]')) {
      handlers.onOpenHistory();
      return;
    }

    const bank = readBankForm(mount, entries);
    if (target.closest('[data-bank-save]') && bank) {
      handlers.onSaveBalance({ checked_on: bank.date, bank: bank.bank, card_owed: bank.card, note: null });
      return;
    }
    if (target.closest('[data-bank-adjust]') && bank?.diff) {
      handlers.onAdd({ kind: 'adjust', amount: bank.diff, spent_on: bank.date, note: '對銀行餘額的差額' });
      return;
    }
    const bankDel = target.closest<HTMLElement>('[data-bank-del]');
    if (bankDel) {
      handlers.onDeleteBalance(Number(bankDel.dataset.bankDel));
      return;
    }

    if (target.closest('[data-ledger-copy]')) copyReview(entries, month, placeById, tripBySlug);
  };

  // 對銀行餘額：邊填邊算差額
  mount.oninput = (ev) => {
    const search = (ev.target as HTMLElement).closest<HTMLInputElement>('[data-ledger-search]');
    if (search) {
      searchQuery = search.value;
      const results = mount.querySelector('[data-ledger-results]');
      if (results) results.innerHTML = listBody();
      return;
    }
    if (!(ev.target as HTMLElement).closest('[data-ledger-bank]')) return;
    const bank = readBankForm(mount, entries);
    const result = mount.querySelector<HTMLElement>('[data-bank-result]');
    if (result) result.innerHTML = bank ? bankResultHTML(bank) : '填好銀行餘額就會算差額';
    mount.querySelector<HTMLButtonElement>('[data-bank-save]')?.toggleAttribute('disabled', !bank);
    const adjustBtn = mount.querySelector<HTMLButtonElement>('[data-bank-adjust]');
    if (adjustBtn) adjustBtn.hidden = !bank?.diff;
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
    const status = list.querySelector<HTMLElement>('.adv-ledger-checklist__status');
    if (status) status.textContent = picked.length ? `已選 ${picked.length} 筆，合計 ${money(total)}` : status.dataset.hint || '';
    list.querySelector<HTMLButtonElement>('[data-ledger-check]')?.toggleAttribute('disabled', !picked.length);
  };
}

function metaParts(e: LedgerEntry, placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): string[] {
  const parts: string[] = [];
  if (e.kind === 'expense') {
    if (e.orig_currency) parts.push(`🌏 ${origText(e)}`);
    if (e.note) parts.push(esc(categoryOf(e)?.label));
    if (e.paid_by) parts.push(`${esc(e.paid_by)}${e.method === 'card' ? '刷卡' : e.method === 'own' ? '先墊' : '轉帳'}`);
  }
  const place = e.place_id != null ? placeById.get(e.place_id) : undefined;
  if (place) parts.push(`📍 ${esc(place.name)}`);
  const trip = e.trip_slug ? tripBySlug.get(e.trip_slug) : undefined;
  if (trip) parts.push(`✈️ ${esc(trip.title)}`);
  if (LEDGER_SHOW_SPECIAL && e.is_special) parts.push('✨ 特別的日子');
  if (isBig(e)) parts.push('🔺 大額');
  if (e.kind === 'expense' && e.checked) parts.push(e.method === 'own' ? '✓ 已轉回' : '✓ 已核對');
  return parts;
}

function rowHTML(e: LedgerEntry, placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): string {
  const meta = metaParts(e, placeById, tripBySlug);
  const income = e.kind !== 'expense' ? e.amount > 0 : e.amount < 0;
  return `
    <button type="button" class="adv-ledger-row ${isBig(e) ? 'adv-ledger-row--big' : ''}" data-ledger-id="${e.id}" style="--cat-color:${categoryOf(e)?.color || 'var(--adv-yellow)'}">
      <span class="adv-ledger-row__icon" aria-hidden="true">${entryIcon(e)}</span>
      <span class="adv-ledger-row__main">
        <span class="adv-ledger-row__title">${esc(entryTitle(e))}</span>
        ${meta.length ? `<span class="adv-ledger-row__meta">${meta.join(' · ')}</span>` : ''}
      </span>
      <span class="adv-ledger-row__amt ${income ? 'adv-ledger-row__amt--in' : ''}">${entryAmount(e)}</span>
    </button>
  `;
}

const HISTORY_LINK = '<button type="button" class="adv-ledger-link" data-ledger-history>🕘 改帳紀錄（誰改了什麼、復原刪掉的帳）</button>';

/** 流水的「選幾筆刪除」模式；換月份、換畫面、刪完都會關掉 */
let picking = false;

export function endLedgerPick() {
  picking = false;
}

function pickHTML(monthEntries: LedgerEntry[]): string {
  const sorted = [...monthEntries].sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.id - a.id);
  return `
    <div class="adv-ledger-pickhead">
      <span>勾選要刪除的帳，刪掉的可從改帳紀錄復原</span>
      <button type="button" class="adv-card-btn" data-ledger-pick="off">取消</button>
    </div>
    ${checklistHTML(sorted, 'delete', '🗑️ 刪除', '勾選要刪除的幾筆')}
  `;
}

/** 依日期新到舊分天列出，每天標支出小計 */
function daysHTML(entries: LedgerEntry[], placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>, withYear = false): string {
  const days = new Map<string, LedgerEntry[]>();
  [...entries]
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.id - a.id)
    .forEach((e) => days.set(e.spent_on, [...(days.get(e.spent_on) || []), e]));

  return [...days.entries()].map(([date, list]) => {
    const spent = sum(list.filter((e) => e.kind === 'expense'));
    return `
      <div class="adv-ledger-day">
        <div class="adv-ledger-day__head"><span>${dayLabel(date, withYear)}</span>${spent ? `<span>小計 ${money(spent)}</span>` : ''}</div>
        ${list.map((e) => rowHTML(e, placeById, tripBySlug)).join('')}
      </div>
    `;
  }).join('');
}

function listHTML(monthEntries: LedgerEntry[], placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): string {
  if (!monthEntries.length) return `<p class="adv-empty">這個月還沒有記帳，按「＋ 記一筆」開始</p>${HISTORY_LINK}`;
  return daysHTML(monthEntries, placeById, tripBySlug)
    + '<button type="button" class="adv-ledger-link" data-ledger-pick="on">☑️ 一次選幾筆刪除</button>' + HISTORY_LINK;
}

// ───────────────────────── 月曆 ─────────────────────────

/** 月曆上點開的那天；不在目前月份就改看今天（本月）或不展開 */
let calendarDay: string | null = null;

/** 那天去了哪：行程定在那天的地點，加上那天記帳連到的地點 */
function placesOn(date: string, places: PlaceEntry[], dayEntries: LedgerEntry[], placeById: Map<number, PlaceEntry>): PlaceEntry[] {
  const found = new Map<number, PlaceEntry>();
  places.filter((p) => p.visit_date?.slice(0, 10) === date).forEach((p) => found.set(p.id, p));
  dayEntries.forEach((e) => {
    const p = e.place_id != null ? placeById.get(e.place_id) : undefined;
    if (p) found.set(p.id, p);
  });
  return [...found.values()];
}

function calendarHTML(
  monthEntries: LedgerEntry[],
  month: string,
  places: PlaceEntry[],
  placeById: Map<number, PlaceEntry>,
  tripBySlug: Map<string, Trip>
): string {
  const today = localDate();
  const day = calendarDay?.startsWith(month) ? calendarDay : today.startsWith(month) ? today : null;
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const days = daysInMonth(month);

  const byDay = new Map<string, LedgerEntry[]>();
  monthEntries.forEach((e) => byDay.set(e.spent_on, [...(byDay.get(e.spent_on) || []), e]));
  const spentOn = (date: string) => sum((byDay.get(date) || []).filter((e) => e.kind === 'expense'));
  const dates = Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`);
  const max = Math.max(0, ...dates.map(spentOn));

  const cells = dates.map((date, i) => {
    const list = byDay.get(date) || [];
    const spent = spentOn(date);
    const went = placesOn(date, places, list, placeById).length;
    const trip = list.some((e) => e.trip_slug);
    const cls = ['adv-ledger-cal__cell', date === day ? 'is-active' : '', date === today ? 'is-today' : ''].filter(Boolean).join(' ');
    return `
      <button type="button" class="${cls}" data-ledger-day="${date}" aria-pressed="${date === day}" aria-label="${dayLabel(date)}${spent ? ` 花 ${money(spent)}` : ''}${went ? `，去了 ${went} 個地方` : ''}">
        <span class="adv-ledger-cal__num">${i + 1}</span>
        <span class="adv-ledger-cal__amt">${spent ? moneyShort(spent) : ''}</span>
        <span class="adv-ledger-cal__mark" aria-hidden="true">${trip ? '✈️' : ''}${went ? '📍' : ''}</span>
        ${spent > 0 && max > 0 ? `<span class="adv-ledger-cal__bar" style="--heat:${Math.max(0.15, spent / max).toFixed(2)}" aria-hidden="true"></span>` : ''}
      </button>
    `;
  }).join('');

  const spentDays = dates.filter((d) => spentOn(d) > 0).length;
  const total = sum(monthEntries.filter((e) => e.kind === 'expense'));

  return `
    <div class="adv-ledger-cal">
      <div class="adv-ledger-cal__grid">
        ${[...WEEKDAY].map((w) => `<span class="adv-ledger-cal__wd">${w}</span>`).join('')}
        ${'<span></span>'.repeat(lead)}
        ${cells}
      </div>
      <p class="adv-ledger-cal__legend">
        ${spentDays ? `${spentDays} 天有花錢，平均一天 ${money(Math.round(total / spentDays))}・` : ''}底下色條越長花越多・📍 去了哪・✈️ 旅行中
      </p>
    </div>
    ${day ? calendarDayHTML(day, byDay.get(day) || [], places, placeById, tripBySlug) : ''}
  `;
}

function calendarDayHTML(
  date: string,
  list: LedgerEntry[],
  places: PlaceEntry[],
  placeById: Map<number, PlaceEntry>,
  tripBySlug: Map<string, Trip>
): string {
  const went = placesOn(date, places, list, placeById);
  const spent = sum(list.filter((e) => e.kind === 'expense'));
  return `
    <div class="adv-ledger-day adv-ledger-cal__day">
      <div class="adv-ledger-day__head"><span>${dayLabel(date)}</span>${spent ? `<span>小計 ${money(spent)}</span>` : ''}</div>
      ${went.length ? `<p class="adv-ledger-cal__places">${went.map((p) => `<span>${p.status === 'done' ? '📍' : '🗓️'} ${esc(p.name)}</span>`).join('')}</p>` : ''}
      ${list.length
        ? [...list].sort((a, b) => b.id - a.id).map((e) => rowHTML(e, placeById, tripBySlug)).join('')
        : '<p class="adv-empty">這天沒有記帳</p>'}
      <button type="button" class="adv-card-btn" data-ledger-add-day="${date}">＋ 記這天的帳</button>
    </div>
  `;
}

// ───────────────────────── 搜尋（所有月份） ─────────────────────────

/** 流水搜尋字；重畫時沿用，清空輸入框就回到本月流水 */
let searchQuery = '';

const SEARCH_LIMIT = 200;

function searchBoxHTML(): string {
  return `
    <div class="adv-ledger-search">
      <input type="search" class="adv-search-input" data-ledger-search value="${esc(searchQuery)}"
        placeholder="🔍 搜尋所有月份：備註、金額、地點、分類" aria-label="搜尋公帳" autocomplete="off" enterkeyhint="search" />
    </div>`;
}

/**
 * 空白分開的每個詞都要命中（AND）。數字詞另外比對金額（台幣或原幣），要完全相等：
 * 對帳單找「1,280」那筆時，不會冒出 128、12,800
 */
function matchEntry(e: LedgerEntry, terms: string[], placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): boolean {
  const place = e.place_id != null ? placeById.get(e.place_id) : undefined;
  const trip = e.trip_slug ? tripBySlug.get(e.trip_slug) : undefined;
  const hay = [
    entryTitle(e), e.note, categoryOf(e)?.label, place?.name, trip?.title, e.paid_by,
    KIND_LABEL[e.kind], e.method ? LEDGER_METHOD[e.method] : '', e.orig_currency,
  ].filter(Boolean).join(' ').toLowerCase();

  return terms.every((t) => {
    if (hay.includes(t)) return true;
    const num = t.replace(/[$,，＄]/g, '');
    if (!/^\d+(\.\d+)?$/.test(num)) return false;
    const n = Number(num);
    return Math.abs(e.amount) === n || (e.orig_amount != null && Math.abs(Number(e.orig_amount)) === n);
  });
}

function searchHTML(entries: LedgerEntry[], query: string, placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>): string {
  const terms = query.trim().toLowerCase().split(/\s+/);
  const hits = entries.filter((e) => matchEntry(e, terms, placeById, tripBySlug));
  if (!hits.length) return '<p class="adv-empty">所有月份都找不到符合的帳</p>';

  const shown = [...hits].sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.id - a.id).slice(0, SEARCH_LIMIT);
  const spent = sum(hits.filter((e) => e.kind === 'expense'));
  return `
    <p class="adv-ledger-sub">找到 ${hits.length} 筆${spent ? `・支出合計 <b>${money(spent)}</b>` : ''}${
      hits.length > SEARCH_LIMIT ? `・只列最近 ${SEARCH_LIMIT} 筆，多打幾個字縮小範圍` : ''}</p>
    ${daysHTML(shown, placeById, tripBySlug, true)}`;
}

// ───────────────────────── 預算 ─────────────────────────

interface BudgetRow {
  key: string;
  cfg: LedgerCategoryConfig;
  budget: number;
  spent: number;
}

function budgetRows(entries: LedgerEntry[], month: string): BudgetRow[] {
  const cur = expensesIn(entries, month);
  return Object.entries(LEDGER_CATEGORY)
    .filter(([, cfg]) => cfg.budget)
    .map(([key, cfg]) => ({ key, cfg, budget: cfg.budget as number, spent: sum(cur.filter((e) => e.category === key)) }));
}

/** 流水頂端只提醒用到 90% 以上的分類 */
function budgetRemindHTML(entries: LedgerEntry[], month: string): string {
  const tight = budgetRows(entries, month).filter((r) => r.spent >= r.budget * 0.9);
  if (!tight.length) return '';
  return `
    <div class="adv-ledger-remind adv-ledger-remind--budget">
      ${tight.map((r) => `<span>${esc(r.cfg.emoji)} ${esc(r.cfg.label)} ${r.spent > r.budget ? `超過預算 ${money(r.spent - r.budget)}` : `已用 ${Math.round((r.spent / r.budget) * 100)}%`}</span>`).join('')}
    </div>`;
}

/** 回顧的預算進度；本月多畫一條「照天數該用到哪」的刻度，並算剩下每天能花多少 */
function budgetBoxHTML(entries: LedgerEntry[], month: string): string {
  const rows = budgetRows(entries, month);
  if (!rows.length) {
    return `<section class="adv-ledger-box"><h4 class="adv-ledger-box__title">🎯 預算</h4><p class="adv-ledger-sub">還沒設定。到「⚙️ 分類」幫分類設每月上限，這裡就會出現進度條。</p></section>`;
  }
  const isNow = month === currentMonth();
  const dim = daysInMonth(month);
  const today = new Date().getDate();
  const left = dim - today + 1;
  const pace = isNow ? (today / dim) * 100 : 0;
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  return `
    <section class="adv-ledger-box">
      <h4 class="adv-ledger-box__title">🎯 預算</h4>
      <div class="adv-ledger-bars">${rows.map((r) => {
        const over = r.spent > r.budget;
        const remain = r.budget - r.spent;
        return `
          <div class="adv-ledger-bar ${over ? 'adv-ledger-bar--over' : ''}" style="--cat-color:${r.cfg.color}">
            <span class="adv-ledger-bar__label">${esc(r.cfg.emoji)} ${esc(r.cfg.label)}</span>
            <span class="adv-ledger-bar__track">
              <span class="adv-ledger-bar__fill" style="width:${Math.min(100, Math.max(0, (r.spent / r.budget) * 100))}%"></span>
              ${pace ? `<span class="adv-ledger-bar__pace" style="left:${pace}%" title="照天數到今天該用到這裡"></span>` : ''}
            </span>
            <span class="adv-ledger-bar__amt">${money(r.spent)}<small>／${money(r.budget)}</small></span>
            <span class="adv-ledger-bar__note">${
              over ? `超過 ${money(-remain)}` : isNow ? `還能花 ${money(remain)}，剩 ${left} 天每天約 ${money(Math.floor(remain / left))}` : `剩 ${money(remain)}`}</span>
          </div>`;
      }).join('')}</div>
      <p class="adv-ledger-sub">有設預算的分類合計 ${money(totalSpent)}／${money(totalBudget)}${pace ? '・直線是照天數到今天該用到的位置' : ''}</p>
    </section>`;
}

// ───────────────────────── 對銀行餘額 ─────────────────────────

interface BankForm {
  date: string;
  bank: number;
  card: number;
  ownPending: number;
  book: number;
  diff: number;
}

/** 讀「對銀行餘額」表單；銀行餘額沒填回 null。先墊待還用現在還沒轉回的（核對點通常記今天） */
function readBankForm(mount: HTMLElement, entries: LedgerEntry[]): BankForm | null {
  const form = mount.querySelector('[data-ledger-bank]');
  if (!form) return null;
  const val = (sel: string) => form.querySelector<HTMLInputElement>(sel)?.value.trim() || '';
  const date = val('[data-bank-date]');
  const bankRaw = val('[data-bank-bank]');
  if (!date || !bankRaw) return null;
  const bank = Math.round(parseAmount(bankRaw));
  const card = Math.round(parseAmount(val('[data-bank-card]')));
  const ownPending = sum(entries.filter((e) => e.kind === 'expense' && e.method === 'own' && !e.checked && e.spent_on <= date));
  const book = balanceThrough(entries, date);
  return { date, bank, card, ownPending, book, diff: checkpointDiff({ bank, card_owed: card, own_pending: ownPending }, book) };
}

function bankResultHTML(f: BankForm): string {
  const actual = f.bank - f.card - f.ownPending;
  return `
    銀行 ${money(f.bank)} − 卡費未繳 ${money(f.card)}${f.ownPending ? ` − 先墊待還 ${money(f.ownPending)}` : ''} ＝ <b>${money(actual)}</b>
    <br>帳上算到 ${dayLabel(f.date)} 是 <b>${money(f.book)}</b>・<b class="${f.diff ? 'adv-ledger-warn' : ''}">${diffText(f.diff)}</b>`;
}

function bankHTML(entries: LedgerEntry[], balances: LedgerBalance[]): string {
  const past = balances.slice(0, 6).map((b) => {
    const nowDiff = checkpointDiff(b, balanceThrough(entries, b.checked_on));
    const thenDiff = checkpointDiff(b, b.book_balance);
    return `
      <li>
        <span>${dayLabel(b.checked_on)} 銀行 ${money(b.bank)}${b.created_by ? ` <small>${esc(b.created_by)}</small>` : ''}
          <br><small class="${nowDiff ? 'adv-ledger-warn' : ''}">現在${diffText(nowDiff)}${thenDiff !== nowDiff ? `（記錄時${thenDiff ? `差 ${money(thenDiff)}` : '對得上'}，之後這天以前的帳有變動）` : ''}</small></span>
        <button type="button" class="adv-lcat-btn" data-bank-del="${b.id}" aria-label="刪除這個核對點">✕</button>
      </li>`;
  }).join('');

  return `
    <div class="adv-ledger-gap"></div>
    <div class="adv-ledger-subhead">🏦 對銀行餘額</div>
    <p class="adv-modal-hint adv-ledger-hint">打開網銀看公帳帳戶餘額，再看信用卡 App 還沒繳的金額（含未出帳）。對得上就記一個核對點；之後有人改了那天以前的帳，這裡會提醒。</p>
    <div class="adv-ledger-bank" data-ledger-bank>
      <label>日期<input type="date" data-bank-date value="${localDate()}" max="${localDate()}" /></label>
      <label>銀行帳戶餘額<input type="text" inputmode="numeric" data-bank-bank placeholder="例如 23450" autocomplete="off" /></label>
      <label>信用卡還沒繳<input type="text" inputmode="numeric" data-bank-card placeholder="0" autocomplete="off" /></label>
      <p class="adv-ledger-sub adv-ledger-bank__result" data-bank-result>填好銀行餘額就會算差額</p>
      <div class="adv-ledger-actions">
        <button type="button" class="adv-card-btn adv-card-btn--primary" data-bank-save disabled>📌 記下核對點</button>
        <button type="button" class="adv-card-btn" data-bank-adjust hidden>⚖️ 差額記成調整</button>
      </div>
    </div>
    ${past ? `<div class="adv-ledger-subhead">之前的核對點</div><ul class="adv-ledger-bank__past">${past}</ul>` : ''}
  `;
}

function checklistHTML(
  list: LedgerEntry[],
  action: 'on' | 'off' | 'delete',
  label = action === 'on' ? '✓ 標記已核對' : '取消核對',
  hint = '勾選對得上的那幾筆'
): string {
  return `
    <div class="adv-ledger-checklist">
      <label class="adv-ledger-check adv-ledger-check--all"><input type="checkbox" data-ledger-all /> 全選</label>
      ${list.map((e) => `
        <label class="adv-ledger-check">
          <input type="checkbox" value="${e.id}" />
          <span class="adv-ledger-check__date">${dayLabel(e.spent_on)}</span>
          <span class="adv-ledger-check__title">${entryIcon(e)} ${esc(entryTitle(e))}${e.paid_by ? ` <small>${esc(e.paid_by)}</small>` : ''}${
            e.orig_currency ? ` <small>🌏 ${origText(e)}（台幣是估的，照帳單改）</small>` : ''}</span>
          <span class="adv-ledger-check__amt">${entryAmount(e)}</span>
        </label>`).join('')}
      <div class="adv-ledger-checklist__bar">
        <span class="adv-ledger-checklist__status" data-hint="${hint}">${hint}</span>
        <button type="button" class="adv-card-btn ${action === 'on' ? 'adv-card-btn--primary' : action === 'delete' ? 'adv-card-btn--danger' : ''}" data-ledger-check="${action}" disabled>${label}</button>
      </div>
    </div>
  `;
}

/** 待核對的刷卡依帳單期分組（舊到新）；已結帳的期數應該都在帳單上，還沒結帳的是「未出帳」 */
function statementsHTML(sorted: LedgerEntry[]): string {
  const periods = new Map<string, LedgerEntry[]>();
  sorted.forEach((e) => {
    const close = statementClose(e.spent_on);
    periods.set(close, [...(periods.get(close) || []), e]);
  });
  const today = localDate();
  return [...periods.entries()].map(([close, list]) => {
    const [y, m, d] = close.split('-').map(Number);
    const year = y !== Number(today.slice(0, 4)) ? `${y}/` : '';
    const head = close < today
      ? `📄 ${year}${m}/${d} 結帳的帳單（${periodLabel(close)}）`
      : `🕒 未出帳（${periodLabel(close)}，${m}/${d} 結帳）`;
    return `
      <div class="adv-ledger-sub adv-ledger-period"><span>${head}</span><span>${list.length} 筆・<b>${money(sum(list))}</b></span></div>
      ${checklistHTML(list, 'on')}`;
  }).join('');
}

/** 依日期由舊到新，跟帳單的順序一樣 */
function checkHTML(unchecked: LedgerEntry[], checkedThisMonth: LedgerEntry[], ownPending: LedgerEntry[]): string {
  const byDate = (a: LedgerEntry, b: LedgerEntry) => a.spent_on.localeCompare(b.spent_on) || a.id - b.id;
  // 先墊待還依誰墊的分開，月底回顧時照每個人的合計從公帳轉回
  const ownByWho = IDENTITIES.map((who) => [who, ownPending.filter((e) => e.paid_by === who)] as const).filter(([, list]) => list.length);
  return `
    ${ownByWho.length ? `
      <div class="adv-ledger-subhead">👛 先墊待還（月底回顧時從公帳轉回）</div>
      ${ownByWho.map(([who, list]) => `
        <p class="adv-ledger-sub">${esc(who)} 先墊 ${list.length} 筆・合計 <b>${money(sum(list))}</b></p>
        ${checklistHTML([...list].sort(byDate), 'on', '✓ 已從公帳轉回', '轉帳給對方後勾起來')}`).join('')}
      <div class="adv-ledger-gap"></div>
      <div class="adv-ledger-subhead">💳 對信用卡帳單</div>` : ''}
    <p class="adv-modal-hint adv-ledger-hint">打開信用卡帳單逐筆對：對得上就勾起來。帳單上有、這裡沒有的就是漏記，按「＋ 記一筆」補上；金額不同就點流水那筆改掉。依每月 ${LEDGER_CARD_CLOSING_DAY} 號結帳分期，結帳日前一兩天刷的可能入帳在下一期。</p>
    ${unchecked.length
      ? `<div class="adv-ledger-subhead">待核對 ${unchecked.length} 筆・合計 ${money(sum(unchecked))}</div>${statementsHTML([...unchecked].sort(byDate))}`
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
  /** pending＝還沒從公帳轉回的金額 */
  own: { who: string; amount: number; count: number; pending: number }[];
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

  // 分類清單＋這個月實際出現的（避免已不在清單的分類漏算）
  const categories = [...new Set([...Object.keys(LEDGER_CATEGORY), ...cur.map((e) => e.category).filter((k): k is string => !!k)])]
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
      .map(([who, list]) => ({ who, amount: sum(list), count: list.length, pending: sum(list.filter((e) => !e.checked)) })),
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

interface Forecast {
  /** 預估整月花費（已花的＋剩下天數 × 每天速度） */
  total: number;
  /** 本月已記的大額合計，已含在 total 裡 */
  big: number;
  daily: number;
  remaining: number;
  /** 預估月底公帳餘額，含還沒記的入金 */
  balance: number;
  missingDeposit: number;
  basis: string;
}

/**
 * 只預估本月：已花的照算，剩下的天數乘每天的速度。大額不拿來推速度（月初一筆住宿會把整月估爆）。
 * 每天的速度＝本月平常花費的速度與前 3 個月的平均，依已過天數加權：月初偏向過去、月底偏向本月
 */
function forecastMonth(entries: LedgerEntry[], month: string): Forecast | null {
  if (month !== currentMonth()) return null;
  const today = new Date().getDate();
  const dim = daysInMonth(month);
  const cur = expensesIn(entries, month);
  const curRate = sum(cur.filter((e) => !isBig(e))) / today;
  const history = [1, 2, 3]
    .map((i) => shiftMonth(month, -i))
    .map((m) => ({ m, list: expensesIn(entries, m) }))
    .filter((h) => h.list.length)
    .map((h) => sum(h.list.filter((e) => !isBig(e))) / daysInMonth(h.m));
  const w = today / dim;
  const daily = history.length ? w * curRate + (1 - w) * (history.reduce((s, r) => s + r, 0) / history.length) : curRate;
  const remaining = dim - today;
  const deposited = new Set(entries.filter((e) => e.kind === 'deposit' && e.spent_on.startsWith(month)).map((e) => e.paid_by));
  const missingDeposit = IDENTITIES.filter((id) => !deposited.has(id)).length * LEDGER_MONTHLY_DEPOSIT;
  return {
    total: Math.round(sum(cur) + daily * remaining),
    big: sum(cur.filter(isBig)),
    daily: Math.round(daily),
    remaining,
    balance: Math.round(balanceAt(entries, month) - daily * remaining + missingDeposit),
    missingDeposit,
    basis: history.length ? `本月和前 ${history.length} 個月的平均` : '本月到今天的速度',
  };
}

/** 趨勢圖的月份：選定月份往前最多 12 個月，但不早於第一筆帳 */
function trendMonths(entries: LedgerEntry[], month: string): string[] {
  const first = entries.reduce((min, e) => (e.spent_on < min ? e.spent_on : min), month).slice(0, 7);
  const months: string[] = [];
  for (let m = month; months.length < 12 && m >= first; m = shiftMonth(m, -1)) months.unshift(m);
  return months;
}

/** 趨勢圖目前看的分類，'' 是全部；換月份時保留 */
let trendCat = '';

const CHART_W = 320;
const CHART_H = 150;
const CHART_TOP = 16;
const CHART_BOTTOM = 18;

function trendBoxHTML(entries: LedgerEntry[], month: string, forecast: Forecast | null): string {
  const months = trendMonths(entries, month);
  const inMonths = months.flatMap((m) => expensesIn(entries, m));
  const cats = [...new Set(inMonths.map((e) => e.category).filter((k): k is string => !!k))];
  if (trendCat && !cats.includes(trendCat)) trendCat = '';

  const values = months.map((m) => sum(expensesIn(entries, m).filter((e) => !trendCat || e.category === trendCat)));
  const est = !trendCat && forecast ? forecast.total : 0;
  // 入金參考線只在看全部時有意義
  const target = trendCat ? 0 : IDENTITIES.length * LEDGER_MONTHLY_DEPOSIT;
  const max = Math.max(1, ...values, est, target);
  const plotH = CHART_H - CHART_TOP - CHART_BOTTOM;
  const y = (v: number) => CHART_TOP + (1 - Math.max(0, v) / max) * plotH;
  const base = CHART_TOP + plotH;
  const slot = CHART_W / months.length;
  const barW = Math.min(28, slot * 0.62);
  const color = trendCat ? ledgerCategory(trendCat).color : '';

  const cols = months.map((m, i) => {
    const v = values[i];
    const x = slot * i + (slot - barW) / 2;
    const isEst = est > 0 && i === months.length - 1;
    const top = y(Math.max(v, isEst ? est : 0));
    return `
      <g class="adv-trend__col ${m === month ? 'is-current' : ''}" data-ledger-goto="${m}">
        <title>${monthLabel(m)}：${money(v)}${isEst ? `（預估整月 ${money(est)}）` : ''}</title>
        <rect class="adv-trend__hit" x="${slot * i}" y="0" width="${slot}" height="${CHART_H}" />
        ${isEst ? `<rect class="adv-trend__est" x="${x}" y="${y(est)}" width="${barW}" height="${base - y(est)}" rx="4" />` : ''}
        <rect class="adv-trend__bar" x="${x}" y="${y(v)}" width="${barW}" height="${base - y(v)}" rx="4" ${color ? `style="fill:${color}"` : ''} />
        ${v || isEst ? `<text x="${x + barW / 2}" y="${top - 4}" text-anchor="middle">${moneyShort(isEst ? est : v)}${isEst ? '?' : ''}</text>` : ''}
        <text class="adv-trend__month" x="${x + barW / 2}" y="${CHART_H - 4}" text-anchor="middle">${Number(m.slice(5))}月</text>
      </g>`;
  }).join('');

  // 參考線的說明寫在圖下方，寫在線上會跟長條的金額疊在一起
  const targetLine = target
    ? `<line class="adv-trend__target" x1="0" x2="${CHART_W}" y1="${y(target)}" y2="${y(target)}" />`
    : '';

  // 平均只算已過完的月份，本月還沒結束會把平均拉低
  const done = months.filter((m) => m < currentMonth()).map((m) => values[months.indexOf(m)]);
  const avg = done.length ? Math.round(done.reduce((s, v) => s + v, 0) / done.length) : 0;
  const chip = (key: string, label: string) =>
    `<button type="button" class="adv-guide-season ${trendCat === key ? 'is-active' : ''}" data-ledger-trend-cat="${key}" aria-pressed="${trendCat === key}">${label}</button>`;

  return `
    <section class="adv-ledger-box" data-ledger-trend>
      <h4 class="adv-ledger-box__title">📈 每月花費</h4>
      <div class="adv-ledger-chips adv-trend__cats">
        ${chip('', '全部')}
        ${cats.map((k) => chip(k, `${ledgerCategory(k).emoji} ${esc(ledgerCategory(k).label)}`)).join('')}
      </div>
      <svg class="adv-trend" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="近 ${months.length} 個月${trendCat ? esc(ledgerCategory(trendCat).label) : ''}花費長條圖">
        <line class="adv-trend__axis" x1="0" x2="${CHART_W}" y1="${base}" y2="${base}" />
        ${targetLine}
        ${cols}
      </svg>
      <p class="adv-ledger-sub">${avg ? `已過完的 ${done.length} 個月平均每月 <b>${money(avg)}</b>` : '下個月起就看得到平均'}${target ? `・橫虛線是每月入金 ${money(target)}` : ''}${est ? '・虛線框是本月預估' : ''}・點長條看那個月</p>
    </section>`;
}

function balanceBoxHTML(entries: LedgerEntry[], month: string, forecast: Forecast | null): string {
  const months = trendMonths(entries, month);
  if (months.length < 2) return '';
  const values = months.map((m) => balanceAt(entries, m));
  const all = forecast ? [...values, forecast.balance] : values;
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const plotH = CHART_H - CHART_TOP - CHART_BOTTOM;
  const y = (v: number) => CHART_TOP + ((max - v) / (max - min || 1)) * plotH;
  const slot = CHART_W / months.length;
  const x = (i: number) => slot * i + slot / 2;
  const last = months.length - 1;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return `
    <section class="adv-ledger-box">
      <h4 class="adv-ledger-box__title">🐷 公帳餘額走勢</h4>
      <svg class="adv-trend" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="近 ${months.length} 個月月底公帳餘額折線圖">
        ${min < 0 ? `<line class="adv-trend__target" x1="0" x2="${CHART_W}" y1="${y(0)}" y2="${y(0)}" />` : ''}
        <polyline class="adv-trend__line" points="${points}" />
        ${forecast ? `<line class="adv-trend__line adv-trend__line--est" x1="${x(last)}" y1="${y(values[last])}" x2="${x(last) + slot * 0.42}" y2="${y(forecast.balance)}" />` : ''}
        ${months.map((m, i) => `
          <g class="adv-trend__col ${m === month ? 'is-current' : ''}" data-ledger-goto="${m}">
            <title>${monthLabel(m)}月底：${money(values[i])}</title>
            <rect class="adv-trend__hit" x="${slot * i}" y="0" width="${slot}" height="${CHART_H}" />
            <circle class="adv-trend__dot" cx="${x(i)}" cy="${y(values[i])}" r="${m === month ? 5 : 3.5}" />
            ${i === last || m === month ? `<text x="${x(i) - 7}" y="${y(values[i]) - 7}" text-anchor="end">${moneyShort(values[i])}</text>` : ''}
            <text class="adv-trend__month" x="${x(i)}" y="${CHART_H - 4}" text-anchor="middle">${Number(m.slice(5))}月</text>
          </g>`).join('')}
      </svg>
      <p class="adv-ledger-sub">每個月底的餘額${forecast ? `・虛線是本月底預估 ${money(forecast.balance)}` : ''}</p>
    </section>`;
}

function forecastBoxHTML(f: Forecast, spent: number): string {
  return `
    <section class="adv-ledger-box">
      <h4 class="adv-ledger-box__title">🔮 這個月預估</h4>
      <p class="adv-ledger-big">${money(f.total)}</p>
      <p class="adv-ledger-sub">已花 ${money(spent)}，剩 ${f.remaining} 天，每天約 ${money(f.daily)}（照${f.basis}）</p>
      ${f.big ? `<p class="adv-ledger-sub">已記的大額 ${money(f.big)} 算進去了，但不拿來推每天的速度</p>` : ''}
      <p class="adv-ledger-sub">月底公帳預計還有 <b>${money(f.balance)}</b>${f.missingDeposit ? `（含還沒記的入金 ${money(f.missingDeposit)}）` : ''}</p>
      ${f.balance < 0 ? '<p class="adv-ledger-sub adv-ledger-warn">照這個速度月底會不夠，要補錢或省一點</p>' : ''}
    </section>`;
}

const CSV_KIND: Record<LedgerKind, string> = { expense: '支出', deposit: '入金', adjust: '調整' };
const CSV_METHOD: Record<LedgerMethod, string> = { card: '公帳卡', account: '公帳帳戶', own: '自己先墊' };

/** 文字欄開頭是 = + - @ 時 Excel 會當公式，前面加 ' 擋掉 */
function csvCell(v: string | number | null | undefined, text = false): string {
  let s = v == null ? '' : String(v);
  if (text && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(list: LedgerEntry[], filename: string, placeById: Map<number, PlaceEntry>, tripBySlug: Map<string, Trip>) {
  if (!list.length) {
    showToast('沒有可以下載的帳');
    return;
  }
  const header = ['日期', '類型', '分類', '金額', '公帳增減', '付款方式', '誰付', '備註', '地點', '旅行', '已核對／已轉回', '外幣', '原幣金額'];
  const rows = [...list]
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on) || a.id - b.id)
    .map((e) => [
      csvCell(e.spent_on),
      csvCell(CSV_KIND[e.kind]),
      csvCell(e.category ? ledgerCategory(e.category).label : '', true),
      csvCell(e.amount),
      csvCell(signed(e)),
      csvCell(CSV_METHOD[e.method] || e.method),
      csvCell(e.paid_by, true),
      csvCell(e.note, true),
      csvCell(e.place_id != null ? placeById.get(e.place_id)?.name || '已刪除的地點' : '', true),
      csvCell(e.trip_slug ? tripBySlug.get(e.trip_slug)?.title || e.trip_slug : '', true),
      csvCell(e.kind === 'expense' && e.checked ? '是' : ''),
      csvCell(e.orig_currency),
      csvCell(e.orig_amount),
    ].join(','));
  // 開頭 BOM：Excel 才會用 UTF-8 開，不然中文變亂碼
  const blob = new Blob(['﻿' + [header.join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`已下載 ${list.length} 筆`);
}

function reviewHTML(
  entries: LedgerEntry[],
  month: string,
  placeById: Map<number, PlaceEntry>,
  tripBySlug: Map<string, Trip>
): string {
  const d = reviewData(entries, month, placeById, tripBySlug);
  const forecast = forecastMonth(entries, month);
  const charts = entries.length ? trendBoxHTML(entries, month, forecast) + balanceBoxHTML(entries, month, forecast) : '';
  if (!d.count && !d.deposited) {
    return `<p class="adv-empty">這個月還沒有紀錄，回顧會在記帳後出現</p>${charts ? `<div class="adv-ledger-review">${charts}</div>${actionsHTML(false)}` : ''}`;
  }

  const maxCat = Math.max(1, ...d.categories.map((c) => c.amount));
  const bigs = expensesIn(entries, month).filter(isBig);
  const favorite = [...d.categories].sort((a, b) => b.count - a.count)[0];
  const box = (title: string, inner: string) =>
    `<section class="adv-ledger-box"><h4 class="adv-ledger-box__title">${title}</h4>${inner}</section>`;

  const parts = [
    box('🧾 這個月', `
      <p class="adv-ledger-big">${money(d.total)}</p>
      <p class="adv-ledger-sub">${compareText(d.total, d.lastTotal)}・${d.count} 筆・${d.days} 天有花錢</p>
      ${favorite && favorite.count > 1 ? `<p class="adv-ledger-sub">最常記的是 ${ledgerCategory(favorite.key).emoji} ${ledgerCategory(favorite.key).label} ×${favorite.count}</p>` : ''}
    `),
  ];

  if (forecast && d.count) parts.push(forecastBoxHTML(forecast, d.total));
  parts.push(budgetBoxHTML(entries, month));
  let chartsAt = parts.length;

  if (d.categories.length) {
    // 整條的組成比例（像攤平的圓餅），退款這種負數不畫
    const positive = d.categories.filter((c) => c.amount > 0);
    const posTotal = positive.reduce((s, c) => s + c.amount, 0);
    const stack = posTotal ? `<div class="adv-ledger-stack" role="img" aria-label="各分類佔比">${positive.map((c) => {
      const cfg = ledgerCategory(c.key);
      const share = (c.amount / posTotal) * 100;
      return `<span style="--cat-color:${cfg.color};flex-basis:${share}%" title="${esc(cfg.label)} ${Math.round(share)}%">${share >= 12 ? cfg.emoji : ''}</span>`;
    }).join('')}</div>` : '';
    chartsAt++;
    parts.push(box('🍰 花在哪裡', `${stack}<div class="adv-ledger-bars">${d.categories.map((c) => {
      const cfg = ledgerCategory(c.key);
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
    parts.push(box('🏅 最大的幾筆', `${bigs.length
      ? `<p class="adv-ledger-sub adv-ledger-sub--top">🔺 大額（${money(LEDGER_BIG_EXPENSE)} 以上）${bigs.length} 筆・共 <b>${money(sum(bigs))}</b>，佔本月 ${d.total > 0 ? Math.round((sum(bigs) / d.total) * 100) : 0}%</p>`
      : ''}<ol class="adv-ledger-top">${d.top
      .map((e) => `<li><span>${dayLabel(e.spent_on)} ${entryIcon(e)} ${esc(entryTitle(e))}${isBig(e) ? ' 🔺' : ''}</span><b>${money(e.amount)}</b></li>`)
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
      .map((o) => `<li><span>${esc(o.who)} 先墊 ${o.count} 筆${o.pending ? `，還沒轉回 ${money(o.pending)}` : '，都轉回了'}</span><b>${money(o.amount)}</b></li>`)
      .join('')}</ul>${d.own.some((o) => o.pending) ? '<p class="adv-ledger-sub">轉完到「✅ 核對」勾「已從公帳轉回」</p>' : ''}`));
  }

  parts.push(box('🐷 公帳', `
    <p class="adv-ledger-sub">入金 ${money(d.deposited)} − 花費 ${money(d.total)} ＝ 本月結餘 <b>${money(d.deposited - d.total)}</b></p>
    <p class="adv-ledger-sub">到月底公帳還有 <b>${money(d.balance)}</b></p>
  `));

  // 趨勢圖接在「這個月／預估／花在哪裡」之後
  parts.splice(chartsAt, 0, charts);

  return `
    <div class="adv-ledger-review">${parts.join('')}</div>
    ${actionsHTML(true)}
  `;
}

function actionsHTML(withCopy: boolean): string {
  return `
    <div class="adv-ledger-actions">
      ${withCopy ? '<button type="button" class="adv-card-btn" data-ledger-copy>📋 複製成文字（貼到 LINE）</button>' : ''}
      <button type="button" class="adv-card-btn" data-ledger-csv="month">⬇️ 下載本月 CSV</button>
      <button type="button" class="adv-card-btn" data-ledger-csv="all">⬇️ 下載全部 CSV</button>
      <button type="button" class="adv-card-btn" data-ledger-history>🕘 改帳紀錄</button>
    </div>`;
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
    ...d.categories.map((c) => `${ledgerCategory(c.key).emoji} ${ledgerCategory(c.key).label} ${money(c.amount)}（${d.total ? Math.round((c.amount / d.total) * 100) : 0}%）`),
  ];
  if (d.top.length) lines.push('', '最大的幾筆：', ...d.top.map((e, i) => `${i + 1}. ${entryTitle(e)} ${money(e.amount)}`));
  if (d.places.length) lines.push('', `去了：${d.places.map((p) => p.name).join('、')}`);
  lines.push('', `入金 ${money(d.deposited)} − 花費 ${money(d.total)} ＝ 結餘 ${money(d.deposited - d.total)}`, `公帳還有 ${money(d.balance)}`);
  const f = forecastMonth(entries, month);
  if (f) lines.push('', `🔮 照目前速度，這個月約花 ${money(f.total)}，月底公帳預計 ${money(f.balance)}`);

  navigator.clipboard.writeText(lines.join('\n')).then(
    () => showToast('已複製，可以貼到 LINE 了'),
    () => showToast('複製失敗')
  );
}

// ───────────────────────── 記一筆 ─────────────────────────

/** again：「再記一筆」，呼叫端存完再開一張新表單（對帳單補記時連續輸入用） */
export type ExpenseModalResult = { action: 'save'; input: LedgerInput; again: boolean } | { action: 'delete' } | null;

export interface ExpenseModalOptions {
  existing?: LedgerEntry;
  preset?: Partial<LedgerInput>;
  identity: Identity | null;
  places: PlaceEntry[];
  trips: Trip[];
  /** 用來產生「最近記過」快捷鍵，同一個備註只留最近一次 */
  entries: LedgerEntry[];
  /** 修改時這筆的改帳紀錄（新到舊） */
  history?: LedgerHistory[];
  /** 修改到對好的核對點以前的帳時提醒 */
  balances?: LedgerBalance[];
}

const KIND_LABEL: Record<LedgerKind, string> = { expense: '💸 支出', deposit: '💰 入金', adjust: '⚖️ 調整' };

/** 金額可以寫「60+55」，加總後存；開頭有 - 代表負數。保留小數（外幣），台幣由呼叫端四捨五入 */
function parseAmount(raw: string): number {
  const total = raw.split('+').reduce((s, part) => s + (Number(part.replace(/[^\d.]/g, '')) || 0), 0);
  return raw.trim().startsWith('-') ? -total : total;
}

const FX_CACHE = 'adv-fx-';

/** 外幣對台幣的參考匯率：同一天只查一次（open.er-api.com，免金鑰），查不到就用上次的 */
async function fetchRate(cur: string): Promise<{ rate: number; fresh: boolean } | null> {
  const today = localDate();
  let cached: { rate: number; date: string } | null = null;
  try {
    cached = JSON.parse(localStorage.getItem(FX_CACHE + cur) || 'null');
  } catch {
    cached = null;
  }
  if (cached?.date === today) return { rate: cached.rate, fresh: true };
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${cur}`);
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.TWD;
    if (!rate) throw new Error('沒有 TWD 匯率');
    try {
      localStorage.setItem(FX_CACHE + cur, JSON.stringify({ rate, date: today }));
    } catch {
      // 存不了就每次查
    }
    return { rate, fresh: true };
  } catch (err) {
    console.error('查匯率失敗', err);
    return cached ? { rate: cached.rate, fresh: false } : null;
  }
}

const HISTORY_FIELDS: [keyof LedgerEntry, string][] = [
  ['kind', '種類'],
  ['spent_on', '日期'],
  ['amount', '金額'],
  ['orig_amount', '原幣金額'],
  ['orig_currency', '幣別'],
  ['category', '分類'],
  ['method', '付款方式'],
  ['paid_by', '誰付'],
  ['note', '備註'],
  ['place_id', '地點'],
  ['trip_slug', '旅行'],
  ['is_special', '特別的日子'],
];

interface HistoryContext {
  placeById: Map<number, PlaceEntry>;
  tripBySlug: Map<string, Trip>;
}

function fieldText(key: keyof LedgerEntry, v: unknown, ctx: HistoryContext): string {
  if (v == null || v === '') return '（空白）';
  switch (key) {
    case 'kind': return KIND_LABEL[v as LedgerKind] || String(v);
    case 'spent_on': return dayLabel(String(v));
    case 'amount': return money(Number(v));
    case 'category': return ledgerCategory(String(v)).label;
    case 'method': return LEDGER_METHOD[v as LedgerMethod] || String(v);
    case 'place_id': return ctx.placeById.get(Number(v))?.name || '已刪除的地點';
    case 'trip_slug': return ctx.tripBySlug.get(String(v))?.title || String(v);
    case 'is_special': return v ? '是' : '否';
    default: return String(v);
  }
}

/** 一筆紀錄改了哪些欄位；只勾核對的另外寫 */
function historyChanges(h: LedgerHistory, ctx: HistoryContext): string[] {
  const { old_row: o, new_row: n } = h;
  if (h.op !== 'update' || !o || !n) return [];
  const changes = HISTORY_FIELDS
    .filter(([k]) => String(o[k] ?? '') !== String(n[k] ?? ''))
    .map(([k, label]) => `${label} ${esc(fieldText(k, o[k], ctx))} → ${esc(fieldText(k, n[k], ctx))}`);
  if (o.checked !== n.checked) {
    const own = n.method === 'own';
    changes.push(n.checked ? (own ? '✓ 標記已轉回' : '✓ 標記已核對') : own ? '取消已轉回' : '取消核對');
  }
  return changes;
}

function stampText(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HISTORY_OP: Record<LedgerHistory['op'], string> = { update: '✏️ 改了', delete: '🗑️ 刪除', restore: '↩️ 復原' };

function historyItemHTML(h: LedgerHistory, ctx: HistoryContext, opts: { withTitle: boolean; restorable: boolean }): string {
  const row = h.new_row || h.old_row;
  const changes = historyChanges(h, ctx);
  const title = row && opts.withTitle ? ` ${entryIcon(row)} ${esc(entryTitle(row))} ${entryAmount(row)}` : '';
  return `
    <li class="adv-ledger-hist__item">
      <span class="adv-ledger-hist__when">${stampText(h.changed_at)}${h.changed_by ? `・${esc(h.changed_by)}` : ''}</span>
      <span class="adv-ledger-hist__what">${HISTORY_OP[h.op]}${title}${row && h.op !== 'update' && opts.withTitle ? `<small>（${dayLabel(row.spent_on)}）</small>` : ''}
        ${changes.length ? `<small>${changes.join('、')}</small>` : ''}</span>
      ${opts.restorable ? `<button type="button" class="adv-card-btn" data-restore="${h.id}">↩️ 復原</button>` : ''}
    </li>`;
}

/**
 * 記一筆。必填只有金額、分類、誰付；其他都有預設值或收在「更多」。
 * 鍵盤：Enter 記下來、Shift+Enter 記下來再記一筆、Esc 取消；Tab 在各組間移動，方向鍵在組內選（radiogroup）。
 * 底部按鈕列固定在表單底部，手機不用捲到最下面才按得到
 */
export function openExpenseModal(opts: ExpenseModalOptions): Promise<ExpenseModalResult> {
  return new Promise((resolve) => {
    const base = opts.existing || opts.preset || {};
    let kind: LedgerKind = base.kind || 'expense';
    const placeById = new Map(opts.places.map((p) => [p.id, p]));
    let placeId: number | null = base.place_id ?? null;
    /** 還沒選分類時，依地點分類帶預設（例如從行程地圖的餐廳記帳就是吃飯） */
    const placeCategory = (id: number | null) => {
      const p = id != null ? placeById.get(id) : undefined;
      return p ? ledgerCategoryForPlace(p.category) : null;
    };
    let category: LedgerCategory | null = base.category || (opts.existing ? null : placeCategory(placeId));
    let paidBy: Identity | null = base.paid_by ?? opts.identity;
    let method: LedgerMethod = base.method || 'card';
    let negative = (base.amount ?? 0) < 0;
    // 外幣：主金額欄改填原幣，台幣＝原幣 × 匯率（可以直接改台幣，匯率跟著反算）
    let currency = base.orig_currency || '';
    const baseOrig = base.orig_amount != null ? Math.abs(Number(base.orig_amount)) : null;
    const baseTwd = base.amount ? Math.abs(base.amount) : null;
    const tripBySlug = new Map(opts.trips.map((t) => [t.slug, t]));
    const lockedBefore = opts.existing && opts.balances ? lastMatchedCheckpoint(opts.entries, opts.balances) : null;
    const locked = !!(lockedBefore && opts.existing && opts.existing.spent_on <= lockedBefore);
    const DAY = 86400000;
    const quickDates: [string, string][] = [
      ['今天', localDate()],
      ['昨天', localDate(new Date(Date.now() - DAY))],
      ['前天', localDate(new Date(Date.now() - 2 * DAY))],
    ];
    const startDate = base.spent_on || localDate();

    const recent: LedgerEntry[] = [];
    if (!opts.existing) {
      const seen = new Set<string>();
      for (const e of opts.entries) {
        if (recent.length >= 8) break;
        if (e.kind !== 'expense' || !e.note || e.amount <= 0 || seen.has(e.note)) continue;
        seen.add(e.note);
        recent.push(e);
      }
    }

    // 已經記在隱藏分類的舊帳要能看到原分類，不然修改時會被迫換掉
    const categories = Object.entries(LEDGER_CATEGORY).filter(([key, cfg]) => !cfg.hidden || key === category);
    // 舊帳的分類已不在清單（改名後重讀前、或被刪掉）也要留一顆按鈕，修改時才不會被迫換分類
    if (category && !LEDGER_CATEGORY[category]) categories.push([category, ledgerCategory(category)]);

    /** radiogroup 的一顆：只有選中的那顆在 Tab 順序裡，組內用方向鍵 */
    const radio = (attr: string, value: string, label: string, active: boolean) =>
      `<button type="button" role="radio" class="adv-guide-season ${active ? 'is-active' : ''}" ${attr}="${esc(value)}" aria-checked="${active}">${label}</button>`;
    const hasMore = !!(base.place_id || base.trip_slug || base.is_special);

    const { root, close } = openModal(`
      <div class="adv-lf-head">
        <h3>${opts.existing ? '修改這筆' : '記一筆'}</h3>
        <div class="adv-ledger-chips" id="adv-lf-kinds" role="radiogroup" aria-label="種類">
          ${(Object.keys(KIND_LABEL) as LedgerKind[]).map((k) => radio('data-kind', k, KIND_LABEL[k], k === kind)).join('')}
        </div>
      </div>
      ${locked ? `<p class="adv-modal-hint adv-ledger-warn">⚠️ 這筆在 ${dayLabel(lockedBefore as string)} 對過銀行餘額的範圍內，改金額或日期會讓那次對好的餘額對不上</p>` : ''}
      <label for="adv-lf-amount">金額</label>
      <div class="adv-ledger-amount">
        <span class="adv-ledger-amount__cur" id="adv-lf-cursym" aria-hidden="true">$</span>
        <input type="text" id="adv-lf-amount" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0" value="${currency && baseOrig != null ? baseOrig : baseTwd ?? ''}" />
        <select id="adv-lf-cur" class="adv-lf-cur" data-only="expense" aria-label="幣別" tabindex="-1">
          <option value="">台幣</option>
          ${Object.entries(LEDGER_CURRENCY).map(([code, c]) => `<option value="${code}" ${code === currency ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
        <button type="button" class="adv-guide-season" id="adv-lf-sign" aria-pressed="false" tabindex="-1"></button>
      </div>
      <div class="adv-lf-fx" id="adv-lf-fx" data-only="expense">
        <label>匯率<input type="text" id="adv-lf-rate" inputmode="decimal" autocomplete="off" tabindex="-1" /></label>
        <label>≈ 台幣 $<input type="text" id="adv-lf-twd" inputmode="numeric" autocomplete="off" tabindex="-1" value="${currency && baseTwd ? baseTwd : ''}" /></label>
        <small id="adv-lf-fxnote"></small>
      </div>
      ${recent.length ? `
        <div class="adv-ledger-recent" data-only="expense" aria-label="最近記過，點一下帶入" tabindex="-1">
          ${/* 點選用的捷徑，不放進 Tab 順序：金額之後 Tab 直接到分類。外層可橫捲，Chrome 會把它當成 Tab 停點，所以外層也要 tabindex=-1 */ ''}
          ${recent.map((e) => `<button type="button" class="adv-card-btn" data-recent="${e.id}" tabindex="-1">${entryIcon(e)} ${esc(e.note)} <small>${money(e.amount)}</small></button>`).join('')}
        </div>` : ''}
      <div data-only="expense">
        <label id="adv-lf-cat-label">分類</label>
        <div class="adv-ledger-cats" role="radiogroup" aria-labelledby="adv-lf-cat-label" data-cols="4">
          ${categories.map(([key, cfg]) => `
            <button type="button" role="radio" class="adv-ledger-cat ${key === category ? 'is-active' : ''}" data-cat="${esc(key)}" style="--cat-color:${esc(cfg.color)}" aria-checked="${key === category}">
              <span aria-hidden="true">${esc(cfg.emoji)}</span>${esc(cfg.label)}
            </button>`).join('')}
        </div>
      </div>
      <div class="adv-lf-pair">
        <div>
          <label id="adv-lf-who-label"></label>
          <div class="adv-ledger-chips" id="adv-lf-who" role="radiogroup" aria-labelledby="adv-lf-who-label">
            ${IDENTITIES.map((id) => radio('data-who', id, id, id === paidBy)).join('')}
          </div>
        </div>
        <div data-only="expense">
          <label id="adv-lf-method-label">怎麼付</label>
          <div class="adv-ledger-chips" id="adv-lf-method" role="radiogroup" aria-labelledby="adv-lf-method-label">
            ${(Object.keys(LEDGER_METHOD) as LedgerMethod[]).map((m) => radio('data-method', m, LEDGER_METHOD[m], m === method)).join('')}
          </div>
        </div>
      </div>
      <label id="adv-lf-date-label" for="adv-lf-date">日期</label>
      <div class="adv-lf-dates">
        <div class="adv-ledger-chips" id="adv-lf-quickdate" role="radiogroup" aria-labelledby="adv-lf-date-label">
          ${quickDates.map(([label, d]) => radio('data-date', d, label, d === startDate)).join('')}
        </div>
        <input type="date" id="adv-lf-date" value="${esc(startDate)}" />
      </div>
      <label for="adv-lf-note">備註（選填）</label>
      <input type="text" id="adv-lf-note" enterkeyhint="done" value="${esc(base.note)}" placeholder="例如：鼎泰豐、高鐵台中來回" />
      <details class="adv-ledger-more" data-only="expense" ${hasMore ? 'open' : ''}>
        <summary>更多：地點、旅行<span id="adv-lf-more-sum"></span></summary>
        <label for="adv-lf-place">地點</label>
        <div class="adv-ach-picked" id="adv-lf-picked"></div>
        <input type="text" id="adv-lf-place" placeholder="搜尋破關地圖的地點" autocomplete="off" />
        <div class="adv-ach-results" id="adv-lf-results"></div>
        <label for="adv-lf-trip">哪趟旅行</label>
        <select id="adv-lf-trip">
          <option value="">不是旅行</option>
          ${opts.trips.map((t) => `<option value="${esc(t.slug)}" ${t.slug === base.trip_slug ? 'selected' : ''}>${esc(t.emoji || '✈️')} ${esc(t.title)}</option>`).join('')}
        </select>
        ${LEDGER_SHOW_SPECIAL ? `
          <label class="adv-ledger-special"><input type="checkbox" id="adv-lf-special" ${base.is_special ? 'checked' : ''} /> ✨ 特別的日子（紀念日、生日…）</label>` : ''}
      </details>
      ${opts.existing ? `
        <details class="adv-ledger-more adv-ledger-hist">
          <summary>🕘 改帳紀錄${opts.history?.length ? `（改過 ${opts.history.length} 次）` : ''}</summary>
          <ul>
            ${(opts.history || []).map((h) => historyItemHTML(h, { placeById, tripBySlug }, { withTitle: false, restorable: false })).join('')}
            <li class="adv-ledger-hist__item">
              <span class="adv-ledger-hist__when">${opts.existing.created_at ? stampText(opts.existing.created_at) : ''}${opts.existing.created_by ? `・${esc(opts.existing.created_by)}` : ''}</span>
              <span class="adv-ledger-hist__what">📝 記下這筆</span>
            </li>
          </ul>
        </details>` : ''}
      <div class="adv-lf-foot">
        <div class="adv-modal-error" id="adv-lf-error" role="alert" style="display:none;"></div>
        <div class="adv-modal-actions">
          ${opts.existing ? '<button class="adv-modal-btn adv-modal-btn--ghost adv-lf-small" id="adv-lf-delete">🗑️ 刪除</button>' : ''}
          <button class="adv-modal-btn adv-modal-btn--ghost adv-lf-small" id="adv-lf-cancel">取消</button>
          ${opts.existing ? '' : '<button class="adv-modal-btn adv-modal-btn--ghost" id="adv-lf-again">再記一筆</button>'}
          <button class="adv-modal-btn adv-modal-btn--primary adv-lf-save" id="adv-lf-submit">${opts.existing ? '儲存修改' : '記下來'}</button>
        </div>
        <p class="adv-lf-keys"><kbd>Enter</kbd> 記下來　${opts.existing ? '' : '<kbd>Shift</kbd>+<kbd>Enter</kbd> 記下來再記一筆　'}<kbd>Esc</kbd> 取消　<kbd>←</kbd><kbd>→</kbd> 選分類</p>
      </div>
    `);

    (root.querySelector('.adv-modal') as HTMLElement).classList.add('adv-lf');
    const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const amountEl = $<HTMLInputElement>('#adv-lf-amount');
    const signBtn = $<HTMLButtonElement>('#adv-lf-sign');
    const dateEl = $<HTMLInputElement>('#adv-lf-date');
    const noteEl = $<HTMLInputElement>('#adv-lf-note');
    const tripEl = $<HTMLSelectElement>('#adv-lf-trip');
    const searchEl = $<HTMLInputElement>('#adv-lf-place');
    const pickedEl = $<HTMLElement>('#adv-lf-picked');
    const resultsEl = $<HTMLElement>('#adv-lf-results');
    const errorEl = $<HTMLElement>('#adv-lf-error');
    const curEl = $<HTMLSelectElement>('#adv-lf-cur');
    const curSymEl = $<HTMLElement>('#adv-lf-cursym');
    const fxEl = $<HTMLElement>('#adv-lf-fx');
    const rateEl = $<HTMLInputElement>('#adv-lf-rate');
    const twdEl = $<HTMLInputElement>('#adv-lf-twd');
    const fxNoteEl = $<HTMLElement>('#adv-lf-fxnote');

    const recalcTwd = () => {
      const orig = Math.abs(parseAmount(amountEl.value));
      const rate = parseAmount(rateEl.value);
      if (orig && rate) twdEl.value = String(Math.round(orig * rate));
    };

    /** 幣別與種類決定要不要顯示匯率列；換幣別時查當天匯率 */
    const syncCurrency = () => {
      const isFx = kind === 'expense' && !!currency;
      fxEl.hidden = !isFx;
      curSymEl.textContent = isFx ? LEDGER_CURRENCY[currency]?.symbol || currency : '$';
    };
    const loadRate = () => {
      const cur = currency;
      if (!cur) return;
      fxNoteEl.textContent = '查匯率中…';
      fetchRate(cur).then((r) => {
        if (currency !== cur) return;
        if (!r) {
          fxNoteEl.textContent = '查不到匯率，自己填';
          return;
        }
        rateEl.value = String(Number(r.rate.toFixed(4)));
        fxNoteEl.textContent = r.fresh ? '今天的參考匯率；核對帳單時把台幣改成實際扣款' : '查不到今天的匯率，先用上次的';
        recalcTwd();
      });
    };
    const setCurrency = (cur: string) => {
      currency = cur;
      curEl.value = cur;
      if (!cur) {
        rateEl.value = '';
        twdEl.value = '';
        fxNoteEl.textContent = '';
      }
      syncCurrency();
      loadRate();
    };

    /** 每個 radiogroup 只留一個 Tab 停點：選中的那顆，沒選就第一顆 */
    const syncTabStops = () => {
      root.querySelectorAll<HTMLElement>('[role="radiogroup"]').forEach((g) => {
        const radios = [...g.querySelectorAll<HTMLElement>('[role="radio"]')];
        const current = radios.find((r) => r.classList.contains('is-active')) || radios[0];
        radios.forEach((r) => (r.tabIndex = r === current ? 0 : -1));
      });
    };

    const setActive = (group: string, attr: string, value: string | null) => {
      root.querySelectorAll<HTMLElement>(`${group} [${attr}]`).forEach((b) => {
        const on = b.getAttribute(attr) === value;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      });
      syncTabStops();
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
      syncCurrency();
    };

    /** 「更多」收起來時也看得到選了什麼 */
    const syncMoreSummary = () => {
      const parts = [
        placeId != null ? placeById.get(placeId)?.name : null,
        tripEl.value ? opts.trips.find((t) => t.slug === tripEl.value)?.title : null,
      ].filter(Boolean);
      $('#adv-lf-more-sum').textContent = parts.length ? `：${parts.join('、')}` : '';
    };

    const renderPicked = () => {
      const place = placeId != null ? placeById.get(placeId) : undefined;
      pickedEl.innerHTML = place ? `<button type="button" class="adv-ach-place" data-unpick>${esc(place.name)} ✕</button>` : '';
      searchEl.hidden = !!place;
      syncMoreSummary();
    };
    const placeHits = () => {
      const q = searchEl.value.trim().toLowerCase();
      return q ? opts.places.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
    };
    const renderResults = () => {
      resultsEl.innerHTML = placeHits()
        .map((p) => `<button type="button" class="adv-ach-place" data-pick="${p.id}">＋ ${esc(p.name)}${p.area ? ` <small>${esc(p.area)}</small>` : ''}</button>`)
        .join('');
    };
    const pickPlace = (id: number) => {
      placeId = id;
      searchEl.value = '';
      resultsEl.innerHTML = '';
      renderPicked();
      if (!category && kind === 'expense') {
        category = placeCategory(id);
        setActive('.adv-ledger-cats', 'data-cat', category);
      }
    };

    const clearError = () => {
      errorEl.style.display = 'none';
    };
    /** 錯誤寫在固定的底部列（一定看得到），並把焦點移到要補的那一格 */
    const fail = (msg: string, focusEl?: HTMLElement | null) => {
      errorEl.style.display = 'block';
      errorEl.textContent = msg;
      focusEl?.focus();
      focusEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    /** 選了某一組的某個值；方向鍵與點擊共用 */
    const choose = (btn: HTMLElement) => {
      if (btn.dataset.kind) {
        kind = btn.dataset.kind as LedgerKind;
        setActive('#adv-lf-kinds', 'data-kind', kind);
        syncKind();
      } else if (btn.dataset.cat) {
        category = btn.dataset.cat;
        setActive('.adv-ledger-cats', 'data-cat', category);
      } else if (btn.dataset.who) {
        paidBy = btn.dataset.who as Identity;
        setActive('#adv-lf-who', 'data-who', paidBy);
      } else if (btn.dataset.method) {
        method = btn.dataset.method as LedgerMethod;
        setActive('#adv-lf-method', 'data-method', method);
      } else if (btn.dataset.date) {
        dateEl.value = btn.dataset.date;
        setActive('#adv-lf-quickdate', 'data-date', btn.dataset.date);
      }
      clearError();
    };

    root.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const radioBtn = t.closest<HTMLElement>('[role="radio"]');
      if (radioBtn) {
        // 「調整」不一定屬於誰：再點一次已選的人就取消
        if (kind === 'adjust' && radioBtn.dataset.who && radioBtn.dataset.who === paidBy) {
          paidBy = null;
          setActive('#adv-lf-who', 'data-who', null);
          return;
        }
        choose(radioBtn);
        return;
      }
      const recentBtn = t.closest<HTMLElement>('[data-recent]');
      if (recentBtn) {
        const e = recent.find((r) => r.id === Number(recentBtn.dataset.recent));
        if (!e) return;
        if ((e.orig_currency || '') !== currency) setCurrency(e.orig_currency || '');
        amountEl.value = String(e.orig_currency && e.orig_amount != null ? Number(e.orig_amount) : e.amount);
        recalcTwd();
        noteEl.value = e.note || '';
        category = e.category;
        method = e.method;
        placeId = e.place_id;
        setActive('.adv-ledger-cats', 'data-cat', category);
        setActive('#adv-lf-method', 'data-method', method);
        renderPicked();
        clearError();
        // 帶入後通常只差改金額：選起來，直接打新數字或按 Enter
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
      if (pick) pickPlace(Number(pick.dataset.pick));
    });

    signBtn.addEventListener('click', () => {
      negative = !negative;
      syncKind();
    });
    searchEl.addEventListener('input', renderResults);
    tripEl.addEventListener('change', syncMoreSummary);
    dateEl.addEventListener('change', () => setActive('#adv-lf-quickdate', 'data-date', dateEl.value));
    amountEl.addEventListener('input', () => {
      clearError();
      if (currency) recalcTwd();
    });
    curEl.addEventListener('change', () => setCurrency(curEl.value));
    rateEl.addEventListener('input', recalcTwd);
    // 直接改台幣（例如照帳單的實際扣款）時反算匯率
    twdEl.addEventListener('input', () => {
      const orig = Math.abs(parseAmount(amountEl.value));
      const twd = parseAmount(twdEl.value);
      if (orig && twd) rateEl.value = String(Number((twd / orig).toFixed(4)));
    });

    let done = false;
    const finish = (result: ExpenseModalResult) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      close();
      resolve(result);
    };

    const submit = (again: boolean) => {
      const sign = negative ? -1 : 1;
      const isFx = kind === 'expense' && !!currency;
      const raw = parseAmount(amountEl.value);
      if (!raw) return fail(isFx ? '外幣金額要填一個不是 0 的數字' : '金額要填一個不是 0 的數字', amountEl);
      const amount = (isFx ? Math.round(Math.abs(parseAmount(twdEl.value))) : Math.round(raw)) * sign;
      if (!amount) return fail(isFx ? '台幣金額要填（填了匯率會自動算）' : '金額要填一個不是 0 的數字', isFx ? rateEl : amountEl);
      const origAmount = isFx ? (Math.round(Math.abs(raw) * 100) / 100) * sign : null;
      if (kind === 'expense' && !category) {
        return fail('選一個分類', root.querySelector<HTMLElement>('.adv-ledger-cats [role="radio"]'));
      }
      if (kind !== 'adjust' && !paidBy) {
        return fail(kind === 'deposit' ? '選一下是誰入金' : '選一下是誰付的', root.querySelector<HTMLElement>('#adv-lf-who [role="radio"]'));
      }
      if (!dateEl.value) return fail('日期不能空白', dateEl);

      const expense = kind === 'expense';
      finish({
        action: 'save',
        again: again && !opts.existing,
        input: {
          spent_on: dateEl.value,
          kind,
          amount,
          category: expense ? category : null,
          method: expense ? method : 'account',
          paid_by: paidBy,
          note: noteEl.value.trim() || null,
          place_id: expense ? placeId : null,
          trip_slug: expense ? tripEl.value || null : null,
          // 欄位藏起來時保留原值，之後打開 ✨ 不會把舊資料洗掉
          is_special: !expense ? false : LEDGER_SHOW_SPECIAL ? $<HTMLInputElement>('#adv-lf-special').checked : base.is_special ?? false,
          orig_amount: origAmount,
          orig_currency: isFx ? currency : null,
        },
      });
    };

    /** 方向鍵在 radiogroup 內移動並選取；分類是 4 欄格子，上下一次跳一列 */
    const moveInGroup = (btn: HTMLElement, key: string): boolean => {
      const group = btn.closest<HTMLElement>('[role="radiogroup"]');
      if (!group) return false;
      const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
      const cols = Number(group.dataset.cols) || radios.length;
      const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, Home: -radios.length, End: radios.length };
      if (!(key in steps)) return false;
      const i = radios.indexOf(btn);
      const next = radios[Math.max(0, Math.min(radios.length - 1, i + steps[key]))];
      if (next && next !== btn) {
        choose(next);
        next.focus();
      }
      return true;
    };

    const onKey = (ev: KeyboardEvent) => {
      // 注音／倉頡選字時的 Enter 是確認文字，不是送出
      if (ev.isComposing || ev.keyCode === 229) return;
      const t = ev.target as HTMLElement;

      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (searchEl.value) {
          searchEl.value = '';
          renderResults();
          return;
        }
        finish(null);
        return;
      }

      if (t.getAttribute('role') === 'radio' && moveInGroup(t, ev.key)) {
        ev.preventDefault();
        return;
      }

      if (ev.key !== 'Enter') return;
      // 地點搜尋框：Enter 選第一個結果，不送出
      if (t === searchEl && placeHits().length) {
        ev.preventDefault();
        pickPlace(placeHits()[0].id);
        return;
      }
      // 取消、刪除、帶入、展開「更多」這些按鈕照原本行為（Enter＝按下去）
      if (t.matches('button:not([role="radio"]):not(#adv-lf-submit):not(#adv-lf-again), summary')) return;
      ev.preventDefault();
      submit(ev.shiftKey || t.id === 'adv-lf-again');
    };
    // 掛在 document 的捕獲階段：焦點在表單任何地方（包括剛點完空白處）Enter／Esc 都有效
    document.addEventListener('keydown', onKey, true);

    $('#adv-lf-cancel').addEventListener('click', () => finish(null));
    root.querySelector('#adv-lf-delete')?.addEventListener('click', () => finish({ action: 'delete' }));
    root.querySelector('#adv-lf-again')?.addEventListener('click', () => submit(true));
    $('#adv-lf-submit').addEventListener('click', () => submit(false));
    // 點背景關閉（openModal 已經移除畫面），這裡補上拿掉鍵盤監聽、回傳取消
    root.addEventListener('click', (ev) => {
      if (ev.target === root) finish(null);
    });

    syncKind();
    syncTabStops();
    renderPicked();
    // 修改外幣帳：匯率由存的金額反算，不重查；新的一筆（「再記一筆」沿用幣別）才查今天的匯率
    if (currency && opts.existing && baseOrig && baseTwd) {
      rateEl.value = String(Number((baseTwd / baseOrig).toFixed(4)));
      fxNoteEl.textContent = '核對帳單後，把台幣改成實際扣款';
    } else if (currency) {
      loadRate();
    }
    // 直接聚焦，不要包 setTimeout：iOS 只在使用者點擊的同一輪才肯叫出鍵盤
    if (!opts.existing) amountEl.focus();
  });
}

// ───────────────────────── 改帳紀錄 ─────────────────────────

/**
 * 最近的修改、刪除、復原（新到舊）。刪掉、而且還沒復原的帳有「↩️ 復原」；
 * 只勾核對的紀錄很多，預設藏起來。onRestore 成功回傳 true，視窗就關掉讓呼叫端重讀
 */
export function openLedgerHistoryModal(
  history: LedgerHistory[],
  entries: LedgerEntry[],
  places: PlaceEntry[],
  trips: Trip[],
  onRestore: (historyId: number) => Promise<boolean>
): void {
  const ctx: HistoryContext = {
    placeById: new Map(places.map((p) => [p.id, p])),
    tripBySlug: new Map(trips.map((t) => [t.slug, t])),
  };
  const alive = new Set(entries.map((e) => e.id));
  const onlyChecks = (h: LedgerHistory) =>
    h.op === 'update' && !!h.old_row && !!h.new_row && HISTORY_FIELDS.every(([k]) => String(h.old_row?.[k] ?? '') === String(h.new_row?.[k] ?? ''));
  let showChecks = false;

  const { root, close } = openModal(`
    <h3>🕘 改帳紀錄</h3>
    <p class="adv-modal-hint">最近 ${history.length} 次修改與刪除。刪掉的帳可以復原；改錯的帳點流水那筆照舊值改回來。</p>
    <label class="adv-ledger-special"><input type="checkbox" id="adv-lh-checks" /> 也顯示勾核對／已轉回</label>
    <ul class="adv-ledger-hist" id="adv-lh-list"></ul>
    <div class="adv-modal-error" id="adv-lh-error" style="display:none;"></div>
    <div class="adv-modal-actions">
      <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-lh-close">關閉</button>
    </div>
  `);

  const listEl = root.querySelector('#adv-lh-list') as HTMLElement;
  const render = () => {
    const shown = history.filter((h) => showChecks || !onlyChecks(h));
    listEl.innerHTML = shown.length
      ? shown.map((h) => historyItemHTML(h, ctx, { withTitle: true, restorable: h.op === 'delete' && !alive.has(h.entry_id) })).join('')
      : '<li class="adv-empty">還沒有修改或刪除的紀錄</li>';
  };

  root.querySelector('#adv-lh-checks')?.addEventListener('change', (ev) => {
    showChecks = (ev.target as HTMLInputElement).checked;
    render();
  });
  listEl.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-restore]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    if (await onRestore(Number(btn.dataset.restore))) {
      close();
      return;
    }
    btn.disabled = false;
    const err = root.querySelector('#adv-lh-error') as HTMLElement;
    err.style.display = 'block';
    err.textContent = '復原失敗';
  });
  root.querySelector('#adv-lh-close')?.addEventListener('click', close);
  render();
}

// ───────────────────────── 管理分類 ─────────────────────────

export interface LedgerCategoryHandlers {
  /** 回傳 null 代表成功，否則是要顯示的錯誤訊息；成功時呼叫端要先重讀分類再 resolve */
  save: (key: string | null, input: Required<LedgerCategoryConfig>) => Promise<string | null>;
  remove: (key: string) => Promise<string | null>;
  reorder: (keys: string[]) => Promise<string | null>;
}

/**
 * 新增、改名、換 emoji／顏色、隱藏、排序；代號建立後不變，所以改名後舊帳自動顯示新名稱。
 * 已經有帳的分類不能刪（回顧與上月比較會亂掉），只能隱藏
 */
export function openLedgerCategoryModal(usage: Map<string, number>, handlers: LedgerCategoryHandlers): void {
  const { root, close } = openModal(`
    <h3>管理公帳分類</h3>
    <p class="adv-modal-hint">隱藏的分類記帳時不會出現，以前記的帳照常顯示。用過的分類只能隱藏，不能刪。</p>
    <div class="adv-lcat-list" id="adv-lcat-list"></div>
    <label id="adv-lcat-form-title">新增分類</label>
    <div class="adv-lcat-form">
      <input type="text" id="adv-lcat-emoji" class="adv-lcat-form__emoji" placeholder="🧺" aria-label="emoji" />
      <input type="text" id="adv-lcat-label" placeholder="名稱，例如：寵物" aria-label="名稱" />
      <input type="color" id="adv-lcat-color" class="adv-cat-color" value="#8C6A55" aria-label="顏色" />
    </div>
    <label for="adv-lcat-budget">每月預算（選填，空白＝不設）</label>
    <input type="text" id="adv-lcat-budget" inputmode="numeric" autocomplete="off" placeholder="例如 8000" />
    <div class="adv-modal-error" id="adv-lcat-error" style="display:none;"></div>
    <div class="adv-modal-actions">
      <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-lcat-close">關閉</button>
      <button class="adv-modal-btn adv-modal-btn--ghost" id="adv-lcat-cancel-edit" hidden>取消修改</button>
      <button class="adv-modal-btn adv-modal-btn--primary" id="adv-lcat-submit">新增</button>
    </div>
  `);

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const listEl = $<HTMLElement>('#adv-lcat-list');
  const emojiEl = $<HTMLInputElement>('#adv-lcat-emoji');
  const labelEl = $<HTMLInputElement>('#adv-lcat-label');
  const colorEl = $<HTMLInputElement>('#adv-lcat-color');
  const budgetEl = $<HTMLInputElement>('#adv-lcat-budget');
  const errorEl = $<HTMLElement>('#adv-lcat-error');
  let editing: string | null = null;
  let busy = false;

  const showError = (msg: string | null) => {
    errorEl.style.display = msg ? 'block' : 'none';
    errorEl.textContent = msg || '';
  };

  const setEditing = (key: string | null) => {
    editing = key;
    const cfg = key ? LEDGER_CATEGORY[key] : null;
    emojiEl.value = cfg?.emoji || '';
    labelEl.value = cfg?.label || '';
    colorEl.value = cfg?.color || '#8C6A55';
    budgetEl.value = cfg?.budget ? String(cfg.budget) : '';
    $('#adv-lcat-form-title').textContent = cfg ? `修改「${cfg.label}」` : '新增分類';
    $('#adv-lcat-submit').textContent = cfg ? '儲存修改' : '新增';
    $('#adv-lcat-cancel-edit').hidden = !cfg;
    if (cfg) labelEl.focus();
  };

  const renderList = () => {
    const keys = Object.keys(LEDGER_CATEGORY);
    listEl.innerHTML = keys.map((key, i) => {
      const cfg = LEDGER_CATEGORY[key];
      const used = usage.get(key) || 0;
      return `
        <div class="adv-lcat-row ${cfg.hidden ? 'adv-lcat-row--hidden' : ''}" style="--cat-color:${esc(cfg.color)}">
          <span class="adv-lcat-row__emoji" aria-hidden="true">${esc(cfg.emoji)}</span>
          <span class="adv-lcat-row__label">${esc(cfg.label)}<small>${cfg.hidden ? '隱藏中・' : ''}${used ? `用了 ${used} 筆` : '還沒用過'}${cfg.budget ? `・預算 ${money(cfg.budget)}／月` : ''}</small></span>
          <button type="button" class="adv-lcat-btn" data-move="-1" data-key="${esc(key)}" ${i === 0 ? 'disabled' : ''} aria-label="往前">↑</button>
          <button type="button" class="adv-lcat-btn" data-move="1" data-key="${esc(key)}" ${i === keys.length - 1 ? 'disabled' : ''} aria-label="往後">↓</button>
          <button type="button" class="adv-lcat-btn" data-toggle="${esc(key)}" aria-label="${cfg.hidden ? '顯示' : '隱藏'}">${cfg.hidden ? '顯示' : '隱藏'}</button>
          <button type="button" class="adv-lcat-btn" data-edit="${esc(key)}" aria-label="修改">✏️</button>
          ${used ? '' : `<button type="button" class="adv-lcat-btn" data-del="${esc(key)}" aria-label="刪除">🗑️</button>`}
        </div>`;
    }).join('');
  };

  /** 每次只送一個請求，送完重畫清單 */
  const run = async (task: () => Promise<string | null>) => {
    if (busy) return false;
    busy = true;
    showError(null);
    const err = await task();
    busy = false;
    showError(err);
    renderList();
    return !err;
  };

  listEl.addEventListener('click', async (ev) => {
    const t = ev.target as HTMLElement;
    const btn = t.closest<HTMLButtonElement>('button');
    if (!btn || btn.disabled) return;
    const keys = Object.keys(LEDGER_CATEGORY);

    if (btn.dataset.move) {
      const i = keys.indexOf(btn.dataset.key || '');
      const j = i + Number(btn.dataset.move);
      [keys[i], keys[j]] = [keys[j], keys[i]];
      await run(() => handlers.reorder(keys));
    } else if (btn.dataset.toggle) {
      const key = btn.dataset.toggle;
      const cfg = LEDGER_CATEGORY[key];
      await run(() => handlers.save(key, { emoji: cfg.emoji, label: cfg.label, color: cfg.color, hidden: !cfg.hidden, budget: cfg.budget ?? null }));
    } else if (btn.dataset.edit) {
      setEditing(btn.dataset.edit);
    } else if (btn.dataset.del) {
      const key = btn.dataset.del;
      if (editing === key) setEditing(null);
      await run(() => handlers.remove(key));
    }
  });

  $('#adv-lcat-submit').addEventListener('click', async () => {
    const label = labelEl.value.trim();
    if (!label) return showError('名稱不能空白');
    const duplicate = Object.entries(LEDGER_CATEGORY).some(([k, c]) => c.label === label && k !== editing);
    if (duplicate) return showError('已經有同名的分類');
    const hidden = editing ? !!LEDGER_CATEGORY[editing]?.hidden : false;
    const budget = Math.round(parseAmount(budgetEl.value));
    if (budget < 0) return showError('預算不能是負數');
    const ok = await run(() => handlers.save(editing, { emoji: emojiEl.value.trim() || '🏷️', label, color: colorEl.value, hidden, budget: budget || null }));
    if (ok) setEditing(null);
  });
  $('#adv-lcat-cancel-edit').addEventListener('click', () => setEditing(null));
  $('#adv-lcat-close').addEventListener('click', close);

  renderList();
}
