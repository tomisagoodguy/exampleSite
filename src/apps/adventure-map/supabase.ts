import { createClient } from '@supabase/supabase-js';
import { PlaceEntry, PlaceStatus } from '../../shared/types';

const url = (window as any).DATING_MAP_SUPABASE_URL as string;
const key = (window as any).DATING_MAP_SUPABASE_KEY as string;

export const supabase = createClient(url, key);

const PASSPHRASE_KEY = 'dating_map_passphrase';

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
  });

  if (error) throw error;
  return data as PlaceEntry;
}
