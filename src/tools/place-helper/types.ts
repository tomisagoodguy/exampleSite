export interface Visit {
  date: string;
  note: string;
}

export interface PlaceEntry {
  id: number;
  name: string;
  category: string;
  lat: number;
  lng: number;
  description?: string;
  address?: string;
  trivia?: string;
  why?: string;
  best_time?: string;
  status: 'pending' | 'done';
  added?: string;
  rating?: number;
  seasons?: string[];
  visits?: Visit[];
  photos?: string[];
  done_note?: string; // Legacy support
  done_date?: string; // Legacy support
}

export interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  score?: number;
  source: 'arcgis' | 'nominatim';
}
