export interface Visit {
  date: string;
  note: string;
}

export type PlaceStatus = 'idea' | 'proposed' | 'confirmed' | 'done';

/** 破關地圖地區：north 北北基 / tzm 桃竹苗 / taichung 台中 / central_south 中南部 / east 宜花東 / islands 離島 */
export type Region = 'north' | 'tzm' | 'taichung' | 'central_south' | 'east' | 'islands';

export interface PlaceEntry {
  id: number;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
  description?: string;
  address?: string;
  trivia?: string;
  why?: string;
  best_time?: string;
  status: PlaceStatus;
  proposed_by?: string;
  note?: string;
  mrt_station?: string;
  visit_date?: string;
  sort_order?: number;
  liked_by?: string[];
  added?: string;
  rating?: number;
  seasons?: string[];
  region?: Region | null;
  is_indoor?: boolean | null;
  visits?: Visit[];
  photos?: string[];
  done_note?: string; // Legacy support
  done_date?: string; // Legacy support
}
