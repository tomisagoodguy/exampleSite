import { createClient } from '@supabase/supabase-js';
import { PlaceEntry, PlaceStatus, Region } from '../../shared/types';
import type { AchievementCategory } from './data';

const url = (window as any).DATING_MAP_SUPABASE_URL as string;
const key = (window as any).DATING_MAP_SUPABASE_KEY as string;

/** 讀取也要密碼：RLS 依 x-dating-map-pass header 判斷，登入前查詢一律拿到空結果 */
let readPassphrase: string | null = null;

export function setReadPassphrase(value: string | null) {
  readPassphrase = value;
}

export const supabase = createClient(url, key, {
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (readPassphrase) headers.set('x-dating-map-pass', readPassphrase);
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
