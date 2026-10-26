import { createClient } from '@supabase/supabase-js';
import { PlaceEntry, PlaceStatus, Region } from '../../shared/types';
import type { AchievementCategory, LedgerCategory } from './data';

const url = (window as any).DATING_MAP_SUPABASE_URL as string;
const key = (window as any).DATING_MAP_SUPABASE_KEY as string;

/** 讀取也要密碼：RLS 依 x-dating-map-pass header 判斷，登入前查詢一律拿到空結果 */
let readPassphrase: string | null = null;

export function setReadPassphrase(value: string | null) {
  readPassphrase = value;
}

/** header 只能放 ASCII，中文名字轉成 UTF-8 的 base64 */
function base64Utf8(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

export const supabase = createClient(url, key, {
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (readPassphrase) headers.set('x-dating-map-pass', readPassphrase);
      // 公帳改帳紀錄由 trigger 從這個 header 記下是誰改的，不用每支 RPC 多帶參數
      const who = getStoredIdentity();
      if (who) headers.set('x-dating-map-who', base64Utf8(who));
      return fetch(input, { ...init, headers });
    },
  },
});

export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('dating_map_check_passphrase', { p_passphrase: passphrase });
  if (error) throw error;
  return data === true;
}

export const IDENTITIES = ['小黃', '阿康'] as const;
export type Identity = (typeof IDENTITIES)[number];

const PASSPHRASE_KEY = 'dating_map_passphrase';
const IDENTITY_KEY = 'dating_map_identity';

export function getStoredIdentity(): Identity | null {
  try {
    const v = localStorage.getItem(IDENTITY_KEY);
    return (IDENTITIES as readonly string[]).includes(v || '') ? (v as Identity) : null;
  } catch {
    return null;
  }
}

export function storeIdentity(value: Identity) {
  try {
    localStorage.setItem(IDENTITY_KEY, value);
  } catch {
    // ignore
  }
}

export function getStoredPassphrase(): string | null {
  try {
    return localStorage.getItem(PASSPHRASE_KEY);
  } catch {
    return null;
  }
}

export function storePassphrase(value: string) {
  try {
    localStorage.setItem(PASSPHRASE_KEY, value);
  } catch {
    // ignore
  }
}

export function clearStoredPassphrase() {
  try {
    localStorage.removeItem(PASSPHRASE_KEY);
  } catch {
    // ignore
  }
}

export async function fetchPlaces(): Promise<PlaceEntry[]> {
  const { data, error } = await supabase
    .from('dating_map_places')
    .select('*')
    .order('id', { ascending: true });

  if (error) throw error;
  return (data || []) as PlaceEntry[];
}

/** 懶人包的一站；place_id 指向單一座標的地點，null 代表「約在捷運站」這類沒有固定地點的步驟 */
export interface GuideStop {
  id: number;
  seq: number;
  place_id: number | null;
  label: string;
  time_text: string | null;
  transit: string | null;
  tip: string | null;
  /** 這站必點／必做，只填來源有寫的 */
  must_try: string | null;
  /** 大約花費，文字（例如「湯屋約 400 元」） */
  cost: string | null;
}

/** 別人排好的行程懶人包（例如 Threads 上分享的約會路線） */
export interface Guide {
  id: number;
  title: string;
  summary: string | null;
  region: string | null;
  source: string | null;
  source_url: string | null;
  tags: string[];
  /** 適合的季節，空陣列代表全年皆宜 */
  seasons: Season[];
  /** 場景，可複選；空陣列代表都不算（例如農遊） */
  scenes: Scene[];
  duration: GuideDuration | null;
  /** 同一趟多日旅行的各天共用同一個 key，篩選時整趟一起出現 */
  trip_key: string | null;
  /** 從網頁提案的人；SQL 匯入的為 null */
  proposed_by: string | null;
  stops: GuideStop[];
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Scene = 'mountain' | 'sea' | 'city';
export type GuideDuration = 'half' | 'day' | 'multi';

export async function fetchGuides(): Promise<Guide[]> {
  const { data, error } = await supabase
    .from('dating_map_guides')
    .select('*, stops:dating_map_guide_stops(*)')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data || []) as Guide[]).map((g) => ({
    ...g,
    seasons: g.seasons || [],
    scenes: g.scenes || [],
    stops: [...(g.stops || [])].sort((a, b) => a.seq - b.seq),
  }));
}

export type GuideStopInput = Omit<GuideStop, 'id' | 'seq'>;

export interface GuideInput {
  title: string;
  summary: string;
  region: string;
  source: string;
  source_url: string;
  seasons: Season[];
  scenes: Scene[];
  duration: GuideDuration;
  /** 依陣列順序存成 seq 1, 2, 3… */
  stops: GuideStopInput[];
}

/** 新增（id 為 null）或修改懶人包；各站整組換掉 */
export async function saveGuide(passphrase: string, id: number | null, input: GuideInput, proposedBy: string | null): Promise<void> {
  const { error } = await supabase.rpc('dating_map_save_guide', {
    p_passphrase: passphrase,
    p_id: id,
    p_title: input.title,
    p_summary: input.summary,
    p_region: input.region,
    p_source: input.source,
    p_source_url: input.source_url,
    p_seasons: input.seasons,
    p_scenes: input.scenes,
    p_duration: input.duration,
    p_proposed_by: proposedBy,
    p_stops: input.stops,
  });

  if (error) throw error;
}

/** 刪除懶人包；各站跟著刪，地點本身不動 */
export async function deleteGuide(passphrase: string, id: number): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete_guide', {
    p_passphrase: passphrase,
    p_id: id,
  });

  if (error) throw error;
}

/** 旅行成就；done_date 是手動解鎖，連結地點有任一 status='done' 也算解鎖（前端判斷） */
export interface Achievement {
  id: number;
  category: AchievementCategory;
  title: string;
  emoji: string | null;
  description: string | null;
  difficulty: number;
  when_text: string | null;
  sort_order: number;
  done_date: string | null;
  done_by: string | null;
  done_note: string | null;
  place_ids: number[];
}

export async function fetchAchievements(): Promise<Achievement[]> {
  const { data, error } = await supabase
    .from('dating_map_achievements')
    .select('*, links:dating_map_achievement_places(place_id)')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data || []) as (Omit<Achievement, 'place_ids'> & { links: { place_id: number }[] | null })[]).map(
    ({ links, ...a }) => ({ ...a, place_ids: (links || []).map((l) => l.place_id) })
  );
}

/** 「✈️ 旅行」分頁的旅行介紹頁；卡片只讀摘要欄位，完整 HTML 由 /adventure-map/<slug>/ 的載入頁另外讀 */
export interface Trip {
  slug: string;
  title: string;
  summary: string | null;
  date_text: string | null;
  emoji: string | null;
  tags: string[];
  /** 旅行地圖顯示 area 以此開頭的地點（例如「台南市」）；null 就不顯示地圖按鈕 */
  area_prefix: string | null;
  /** 介紹頁 html 寫好了沒；網頁新增的旅行只有卡片，介紹頁之後用 SQL 補 */
  has_html: boolean;
  /** 從網頁新增的人；SQL 匯入的為 null */
  proposed_by: string | null;
}

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('dating_map_docs')
    .select('slug, title, summary, date_text, emoji, tags, area_prefix, has_html, proposed_by')
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return ((data || []) as Trip[]).map((t) => ({ ...t, tags: t.tags || [] }));
}

export interface TripInput {
  title: string;
  date_text: string;
  summary: string;
  emoji: string;
  tags: string[];
  area_prefix: string;
}

/** 新增（slug 為 null，由資料庫產生）或修改旅行卡片；介紹頁 html 不經過這裡 */
export async function saveTrip(passphrase: string, slug: string | null, input: TripInput, proposedBy: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('dating_map_save_doc', {
    p_passphrase: passphrase,
    p_slug: slug,
    p_title: input.title,
    p_summary: input.summary,
    p_date_text: input.date_text,
    p_emoji: input.emoji,
    p_tags: input.tags,
    p_area_prefix: input.area_prefix,
    p_proposed_by: proposedBy,
  });

  if (error) throw error;
  return data as string;
}

/** 刪除旅行；已寫好介紹頁的資料庫會拒絕（html 沒有歷史版本） */
export async function deleteTrip(passphrase: string, slug: string): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete_doc', {
    p_passphrase: passphrase,
    p_slug: slug,
  });

  if (error) throw error;
}

export async function setAchievement(
  passphrase: string,
  id: number,
  done: { date: string; by?: string; note?: string } | null
): Promise<Achievement> {
  const { data, error } = await supabase.rpc('dating_map_set_achievement', {
    p_passphrase: passphrase,
    p_id: id,
    p_done: done !== null,
    p_done_date: done?.date ?? null,
    p_done_by: done?.by ?? null,
    p_note: done?.note ?? null,
  });

  if (error) throw error;
  return data as Achievement;
}

export interface AchievementInput {
  category: AchievementCategory;
  title: string;
  emoji: string;
  description: string;
  difficulty: number;
  when_text: string;
  place_ids: number[];
}

/** 新增（id 為 null）或修改成就；連結地點整組換成 place_ids */
export async function saveAchievement(passphrase: string, id: number | null, input: AchievementInput): Promise<void> {
  const { error } = await supabase.rpc('dating_map_save_achievement', {
    p_passphrase: passphrase,
    p_id: id,
    p_category: input.category,
    p_title: input.title,
    p_emoji: input.emoji,
    p_description: input.description,
    p_difficulty: input.difficulty,
    p_when_text: input.when_text,
    p_place_ids: input.place_ids,
  });

  if (error) throw error;
}

/** 刪除成就；連結會跟著刪，地點本身不動 */
export async function deleteAchievement(passphrase: string, id: number): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete_achievement', {
    p_passphrase: passphrase,
    p_id: id,
  });

  if (error) throw error;
}

export interface ProposePayload {
  passphrase: string;
  name: string;
  category: string;
  note?: string;
  proposed_by?: string;
  lat?: number;
  lng?: number;
  address?: string;
  mrt_station?: string;
  status?: PlaceStatus;
}

export async function proposePlace(payload: ProposePayload): Promise<PlaceEntry> {
  const { data, error } = await supabase.rpc('dating_map_propose', {
    p_passphrase: payload.passphrase,
    p_name: payload.name,
    p_category: payload.category,
    p_note: payload.note ?? null,
    p_proposed_by: payload.proposed_by ?? null,
    p_lat: payload.lat ?? null,
    p_lng: payload.lng ?? null,
    p_address: payload.address ?? null,
    p_mrt_station: payload.mrt_station ?? null,
    p_status: payload.status ?? 'proposed',
  });

  if (error) throw error;
  return data as PlaceEntry;
}

export async function toggleLike(passphrase: string, id: number, identity: Identity): Promise<PlaceEntry> {
  const { data, error } = await supabase.rpc('dating_map_toggle_like', {
    p_passphrase: passphrase,
    p_id: id,
    p_identity: identity,
  });

  if (error) throw error;
  return data as PlaceEntry;
}

export interface UpdatePayload {
  passphrase: string;
  id: number;
  status?: PlaceStatus;
  lat?: number;
  lng?: number;
  address?: string;
  mrt_station?: string;
  note?: string;
  visit_date?: string;
  name?: string;
  category?: string;
  sort_order?: number;
  proposed_by?: string;
}

export async function updatePlace(payload: UpdatePayload): Promise<PlaceEntry> {
  const { data, error } = await supabase.rpc('dating_map_update', {
    p_passphrase: payload.passphrase,
    p_id: payload.id,
    p_status: payload.status ?? null,
    p_lat: payload.lat ?? null,
    p_lng: payload.lng ?? null,
    p_address: payload.address ?? null,
    p_mrt_station: payload.mrt_station ?? null,
    p_note: payload.note ?? null,
    p_visit_date: payload.visit_date ?? null,
    p_name: payload.name ?? null,
    p_category: payload.category ?? null,
    p_sort_order: payload.sort_order ?? null,
    p_proposed_by: payload.proposed_by ?? null,
  });

  if (error) throw error;
  return data as PlaceEntry;
}

/** 一次把多筆提案／定案退回願望清單（清掉日期與排序），已去過的不動；回傳實際退回筆數 */
export async function resetToIdea(passphrase: string, ids: number[]): Promise<number> {
  const { data, error } = await supabase.rpc('dating_map_reset_to_idea', {
    p_passphrase: passphrase,
    p_ids: ids,
  });

  if (error) throw error;
  return data as number;
}

/** 地區／雨天可去另走一支 RPC，避免改 dating_map_update 的參數簽章 */
export async function setPlaceAttrs(
  passphrase: string,
  id: number,
  attrs: { region?: Region; is_indoor?: boolean }
): Promise<PlaceEntry> {
  const { data, error } = await supabase.rpc('dating_map_set_attrs', {
    p_passphrase: passphrase,
    p_id: id,
    p_region: attrs.region ?? null,
    p_is_indoor: attrs.is_indoor ?? null,
  });

  if (error) throw error;
  return data as PlaceEntry;
}

/** 縣市＋鄉鎮區；座標變動時 trigger 會先清空，再由前端反查後寫回 */
export async function setPlaceArea(passphrase: string, id: number, area: string): Promise<PlaceEntry> {
  const { data, error } = await supabase.rpc('dating_map_set_area', {
    p_passphrase: passphrase,
    p_id: id,
    p_area: area,
  });

  if (error) throw error;
  return data as PlaceEntry;
}

export async function deletePlace(passphrase: string, id: number): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete', {
    p_passphrase: passphrase,
    p_id: id,
  });

  if (error) throw error;
}

export type LedgerKind = 'expense' | 'deposit' | 'adjust';
export type LedgerMethod = 'card' | 'account' | 'own';

/** 公帳流水一筆：支出（退款記負數）、入金、對帳調整（可正可負） */
export interface LedgerEntry {
  id: number;
  spent_on: string;
  kind: LedgerKind;
  amount: number;
  /** 只有支出有分類 */
  category: LedgerCategory | null;
  method: LedgerMethod;
  paid_by: Identity | null;
  note: string | null;
  place_id: number | null;
  trip_slug: string | null;
  is_special: boolean;
  /** 已跟信用卡帳單核對；改了日期、金額或付款方式會自動變回 false */
  checked: boolean;
  created_by: string | null;
  created_at: string;
  /** 外幣支出的原幣金額；amount 一律是台幣（先用匯率估，核對帳單時改成實際扣款） */
  orig_amount: number | null;
  /** ISO 4217 代碼，例如 JPY；與 orig_amount 同時有值或同時 null */
  orig_currency: string | null;
}

export type LedgerInput = Omit<LedgerEntry, 'id' | 'checked' | 'created_by' | 'created_at'>;

/** 一個月約百筆，幾年就會超過 PostgREST 單次上限 1000 筆，所以分頁讀完 */
export async function fetchLedger(): Promise<LedgerEntry[]> {
  const PAGE = 1000;
  const rows: LedgerEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('dating_map_ledger')
      .select('*')
      .order('spent_on', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw error;
    rows.push(...((data || []) as LedgerEntry[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** 新增（id 為 null）或修改一筆 */
export async function saveExpense(
  passphrase: string,
  id: number | null,
  input: LedgerInput,
  createdBy: string | null
): Promise<number> {
  const { data, error } = await supabase.rpc('dating_map_save_expense', {
    p_passphrase: passphrase,
    p_id: id,
    p_spent_on: input.spent_on,
    p_kind: input.kind,
    p_amount: input.amount,
    p_category: input.category,
    p_method: input.method,
    p_paid_by: input.paid_by,
    p_note: input.note,
    p_place_id: input.place_id,
    p_trip_slug: input.trip_slug,
    p_is_special: input.is_special,
    p_created_by: createdBy,
    p_orig_amount: input.orig_amount,
    p_orig_currency: input.orig_currency,
  });

  if (error) throw error;
  return data as number;
}

/** 改帳紀錄一筆：trigger 在每次修改、刪除時寫入；restore 是從刪除紀錄復原 */
export interface LedgerHistory {
  id: number;
  entry_id: number;
  op: 'update' | 'delete' | 'restore';
  old_row: LedgerEntry | null;
  new_row: LedgerEntry | null;
  changed_by: string | null;
  changed_at: string;
}

/** entryId 有值只讀那一筆的紀錄，否則讀最近 limit 筆（全部帳） */
export async function fetchLedgerHistory(entryId: number | null, limit = 100): Promise<LedgerHistory[]> {
  let query = supabase.from('dating_map_ledger_history').select('*');
  if (entryId != null) query = query.eq('entry_id', entryId);
  const { data, error } = await query.order('changed_at', { ascending: false }).limit(limit);

  if (error) throw error;
  return (data || []) as LedgerHistory[];
}

/** 從刪除紀錄復原，沿用原本的 id */
export async function restoreExpense(passphrase: string, historyId: number): Promise<number> {
  const { data, error } = await supabase.rpc('dating_map_restore_expense', {
    p_passphrase: passphrase,
    p_history_id: historyId,
  });

  if (error) throw error;
  return data as number;
}

/**
 * 餘額核對點：某天銀行帳戶的實際餘額。book_balance（到那天為止帳上的公帳餘額）與
 * own_pending（當時還沒轉回的先墊）由資料庫在存的當下算好，之後有人改了更早的帳就看得出來
 */
export interface LedgerBalance {
  id: number;
  checked_on: string;
  bank: number;
  /** 信用卡還沒繳的錢（含未出帳） */
  card_owed: number;
  own_pending: number;
  book_balance: number;
  note: string | null;
  created_by: string | null;
}

export async function fetchLedgerBalances(): Promise<LedgerBalance[]> {
  const { data, error } = await supabase
    .from('dating_map_ledger_balances')
    .select('id, checked_on, bank, card_owed, own_pending, book_balance, note, created_by')
    .order('checked_on', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return (data || []) as LedgerBalance[];
}

export async function saveLedgerBalance(
  passphrase: string,
  input: { checked_on: string; bank: number; card_owed: number; note: string | null },
  createdBy: string | null
): Promise<number> {
  const { data, error } = await supabase.rpc('dating_map_save_balance', {
    p_passphrase: passphrase,
    p_checked_on: input.checked_on,
    p_bank: input.bank,
    p_card_owed: input.card_owed,
    p_note: input.note,
    p_created_by: createdBy,
  });

  if (error) throw error;
  return data as number;
}

export async function deleteLedgerBalance(passphrase: string, id: number): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete_balance', {
    p_passphrase: passphrase,
    p_id: id,
  });

  if (error) throw error;
}

export async function deleteExpense(passphrase: string, id: number): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete_expense', {
    p_passphrase: passphrase,
    p_id: id,
  });

  if (error) throw error;
}

export interface LedgerCategoryRow {
  key: string;
  label: string;
  emoji: string;
  color: string;
  hidden: boolean;
  /** 每月預算，null＝不設 */
  monthly_budget: number | null;
}

/** 依 sort_order 排好；表還沒建（migration 未執行）時回空陣列，前端沿用 data.ts 的備援分類 */
export async function fetchLedgerCategories(): Promise<LedgerCategoryRow[]> {
  const { data, error } = await supabase
    .from('dating_map_ledger_categories')
    .select('key, label, emoji, color, hidden, monthly_budget')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as LedgerCategoryRow[];
}

/** 新增（key 為 null，代號由資料庫產生）或修改；回傳代號 */
export async function saveLedgerCategory(
  passphrase: string,
  key: string | null,
  input: Omit<LedgerCategoryRow, 'key' | 'monthly_budget'>
): Promise<string> {
  const { data, error } = await supabase.rpc('dating_map_save_ledger_category', {
    p_passphrase: passphrase,
    p_key: key,
    p_label: input.label,
    p_emoji: input.emoji,
    p_color: input.color,
    p_hidden: input.hidden,
  });

  if (error) throw error;
  return data as string;
}

/** 分類每月預算；null 或 0 是取消 */
export async function setLedgerBudget(passphrase: string, key: string, budget: number | null): Promise<void> {
  const { error } = await supabase.rpc('dating_map_set_ledger_budget', {
    p_passphrase: passphrase,
    p_key: key,
    p_budget: budget,
  });

  if (error) throw error;
}

/** 依陣列順序重排記帳按鈕 */
export async function reorderLedgerCategories(passphrase: string, keys: string[]): Promise<void> {
  const { error } = await supabase.rpc('dating_map_reorder_ledger_categories', {
    p_passphrase: passphrase,
    p_keys: keys,
  });

  if (error) throw error;
}

/** 已經有帳的分類資料庫會拒絕（訊息「只能隱藏」） */
export async function deleteLedgerCategory(passphrase: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete_ledger_category', {
    p_passphrase: passphrase,
    p_key: key,
  });

  if (error) throw error;
}

/** 對帳單時一次勾選（或取消）多筆 */
export async function setExpenseChecked(passphrase: string, ids: number[], checked: boolean): Promise<void> {
  const { error } = await supabase.rpc('dating_map_set_expense_checked', {
    p_passphrase: passphrase,
    p_ids: ids,
    p_checked: checked,
  });

  if (error) throw error;
}

export interface CategoryRow {
  key: string;
  label: string;
  color: string;
  created_by?: string;
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('dating_map_categories')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as CategoryRow[];
}

export async function upsertCategory(
  passphrase: string,
  key: string,
  label: string,
  color: string,
  createdBy?: string
): Promise<CategoryRow> {
  const { data, error } = await supabase.rpc('dating_map_upsert_category', {
    p_passphrase: passphrase,
    p_key: key,
    p_label: label,
    p_color: color,
    p_created_by: createdBy ?? null,
  });

  if (error) throw error;
  return data as CategoryRow;
}

export async function deleteCategory(passphrase: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('dating_map_delete_category', {
    p_passphrase: passphrase,
    p_key: key,
  });

  if (error) throw error;
}

/**
 * 資料表本身鎖了密碼，Realtime 收不到它們的變動；改訂閱只記「哪張表剛變過」的 dating_map_sync，
 * 收到後再帶密碼重新讀取。table 是被改的資料表名稱。
 */
export function subscribeToChanges(onChange: (table: string) => void): () => void {
  const channel = supabase
    .channel('dating_map_sync_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dating_map_sync' },
      (payload) => onChange(String((payload.new as { tbl?: string })?.tbl ?? ''))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
