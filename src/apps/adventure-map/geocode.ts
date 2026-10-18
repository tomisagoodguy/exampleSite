/**
 * 提案／編輯地點時自動補座標（ArcGIS findAddressCandidates，免 key、允許 CORS）。
 * 查不到或分數太低就回傳 null，呼叫端照常存檔，不擋住提案。
 */

const ARCGIS_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

/** 店名查詢容易落到同名的別處，只收高分結果 */
const MIN_SCORE = 90;
const TIMEOUT_MS = 5000;

export interface GeocodeHit {
  lat: number;
  lng: number;
  matched: string;
}

interface ArcGISCandidate {
  address: string;
  location: { x: number; y: number };
  score: number;
}

function inTaiwan(lat: number, lng: number): boolean {
  return lat >= 21.8 && lat <= 25.4 && lng >= 119.9 && lng <= 122.1;
}

async function findBest(query: string): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    f: 'json',
    SingleLine: query,
    countryCode: 'TWN',
    maxLocations: '1',
    langCode: 'zht',
  });
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ARCGIS_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data: { candidates?: ArcGISCandidate[] } = await res.json();
    const best = data.candidates?.[0];
    if (!best || best.score < MIN_SCORE) return null;
    const { y: lat, x: lng } = best.location;
    return inTaiwan(lat, lng) ? { lat, lng, matched: best.address } : null;
  } finally {
    window.clearTimeout(timer);
  }
}

const REVERSE_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode';
const AREA_PREFIX = /^(.{2}[市縣].{1,3}?[區鄉鎮市])/;

/**
 * Postal 回傳的 City 才是鄉鎮區（預設的 POI 會回「九份」這種聚落名）；
 * 澎湖等地 Postal 只給到縣，改用 Locality。回傳 [縣市, 鄉鎮區]，查不到給空字串
 */
async function reverseArea(lat: number, lng: number, featureTypes: string): Promise<[string, string]> {
  const params = new URLSearchParams({ f: 'json', location: `${lng},${lat}`, langCode: 'zht', featureTypes });
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${REVERSE_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) return ['', ''];
    const data: { address?: { Region?: string; City?: string } } = await res.json();
    const county = (data.address?.Region ?? '').replace(/臺/g, '台');
    const town = (data.address?.City ?? '').replace(/臺/g, '台');
    return [county, town && town !== county && /[區鄉鎮市]$/.test(town) ? town : ''];
  } finally {
    window.clearTimeout(timer);
  }
}

/** 縣市＋鄉鎮區（「新北市瑞芳區」）：地址開頭寫得完整就直接用，否則依座標反查；只查得到縣市時回傳縣市 */
export async function lookupArea(lat: number, lng: number, address?: string): Promise<string | null> {
  const fromAddress = address?.trim().replace(/臺/g, '台').match(AREA_PREFIX)?.[1];
  if (fromAddress) return fromAddress;
  let county = '';
  for (const ft of ['Postal', 'Locality']) {
    try {
      const [c, town] = await reverseArea(lat, lng, ft);
      county ||= c;
      if (town && c) return c + town;
    } catch (err) {
      console.warn('反查鄉鎮區失敗', ft, err);
    }
  }
  return /^.{2}[市縣]$/.test(county) ? county : null;
}

/** 先用地址（門牌最準），查不到再用店名 */
export async function geocodePlace(name: string, address?: string): Promise<GeocodeHit | null> {
  const queries = [address?.trim(), name.trim()].filter((q): q is string => !!q);
  for (const q of new Set(queries)) {
    try {
      const hit = await findBest(q);
      if (hit) return hit;
    } catch (err) {
      console.warn('自動定位失敗', q, err);
    }
  }
  return null;
}
