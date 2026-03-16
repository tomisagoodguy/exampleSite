import { SearchResult } from '../../shared/types';

export async function searchArcGIS(q: string): Promise<SearchResult[]> {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&SingleLine=${encodeURIComponent(q)}&countryCode=TWN&maxLocations=6&outFields=Match_addr,Addr_type,Place_addr&langCode=zht`;

  const r = await fetch(url);
  const data = await r.json();
  if (!data.candidates || data.candidates.length === 0) return [];
  
  return data.candidates
    .filter((c: any) => c.score >= 60)
    .map((c: any) => {
      const addr = (c.attributes && c.attributes.Match_addr) ? c.attributes.Match_addr : c.address;
      return {
        name: c.address || addr,
        address: addr,
        lat: c.location.y,
        lng: c.location.x,
        score: c.score,
        source: 'arcgis'
      };
    });
}

export async function searchNominatim(q: string): Promise<SearchResult[]> {
  const base = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&accept-language=zh-TW,zh,en';
  const url = `${base}&countrycodes=tw&q=${encodeURIComponent(q)}`;
  
  const r = await fetch(url);
  const data = await r.json();
  if (!data || data.length === 0) return [];
  
  return data.map((item: any) => {
    const name = item.name || (item.display_name ? item.display_name.split(',')[0] : '未知地點');
    return {
      name: name,
      address: item.display_name || '',
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      source: 'nominatim'
    };
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; placeName?: string } | null> {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${lng},${lat}&langCode=zht`;
    
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.address) {
      return {
        address: data.address.Match_addr || data.address.LongLabel || data.address.Address || '',
        placeName: data.address.PlaceName || data.address.Address
      };
    }
  } catch(e) {
    console.error('反向地址查詢失敗', e);
  }
  return null;
}
