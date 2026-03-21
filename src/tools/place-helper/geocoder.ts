import { SearchResult } from '../../shared/types';
import { toast, esc, setStatus } from './ui';
import { setCoord } from './map';

interface ArcGISCandidate {
  address: string;
  location: { x: number; y: number };
  score: number;
  attributes?: { Match_addr?: string };
}

interface NominatimItem {
  name?: string;
  display_name?: string;
  lat: string;
  lon: string;
}

export async function searchArcGIS(q: string): Promise<SearchResult[]> {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&SingleLine=${encodeURIComponent(q)}&countryCode=TWN&maxLocations=6&outFields=Match_addr,Addr_type,Place_addr&langCode=zht`;

  const r = await fetch(url);
  const data = await r.json();
  if (!data.candidates || data.candidates.length === 0) return [];
  
  return data.candidates
    .filter((c: ArcGISCandidate) => c.score >= 60)
    .map((c: ArcGISCandidate) => {
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
  
  return data.map((item: NominatimItem) => {
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

export async function doSearch(): Promise<void> {
  const input = document.getElementById('s-input') as HTMLInputElement;
  const btn = document.getElementById('s-btn') as HTMLButtonElement;
  const resultsEl = document.getElementById('s-results');

  const q = input.value.trim();
  if (!q) { setStatus('請輸入地址或地名', 'error'); return; }

  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '搜尋中…';
  setStatus('搜尋中，請稍候…', 'loading');
  if (resultsEl) { resultsEl.innerHTML = ''; resultsEl.classList.remove('show'); }

  try {
    let items = await searchArcGIS(q);
    if (!items || items.length === 0) {
      setStatus('ArcGIS 無結果，嘗試備援搜尋…', 'loading');
      items = await searchNominatim(q);
    }
    btn.disabled = false;
    btn.textContent = oldText;
    if (!items || items.length === 0) {
      setStatus('找不到結果。提示：只輸入「縣市+區+路名」搜尋效果更好', 'error');
      return;
    }
    setStatus(`找到 ${items.length} 個結果，點選一個`, 'ok');
    if (resultsEl) {
      const frag = document.createDocumentFragment();
      items.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `<strong>${esc(item.name)}</strong><span>${esc(item.address)}</span>`;
        div.addEventListener('click', () => {
          setCoord(item.lat, item.lng, true);
          (document.getElementById('f-addr') as HTMLInputElement).value = item.address || '';
          const nameInput = document.getElementById('f-name') as HTMLInputElement;
          if (!nameInput.value || nameInput.value.length < 2) nameInput.value = item.name;
          setStatus(`已選取：${item.name.substring(0, 12)}`, 'ok');
          resultsEl.classList.remove('show');
          (document.getElementById('s-input') as HTMLInputElement).value = item.name;
          toast('地點資料已帶入');
        });
        frag.appendChild(div);
      });
      resultsEl.innerHTML = '';
      resultsEl.appendChild(frag);
      resultsEl.classList.add('show');
    }
  } catch (err: unknown) {
    btn.disabled = false;
    btn.textContent = oldText;
    setStatus(`搜尋失敗：${(err as Error).message}`, 'error');
  }
}

export async function locateMe(): Promise<void> {
  if (!navigator.geolocation) { setStatus('瀏覽器不支援定位功能', 'error'); return; }
  setStatus('正在獲取 GPS 座標...', 'loading');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    setCoord(lat, lng, true);
    setStatus('GPS 定位成功！正在抓取地址...', 'ok');
    const res = await reverseGeocode(lat, lng);
    if (res) {
      (document.getElementById('f-addr') as HTMLInputElement).value = res.address;
      const nameInput = document.getElementById('f-name') as HTMLInputElement;
      if (!nameInput.value) nameInput.value = res.placeName || '未命名地點';
      setStatus('已成功反查地址', 'ok');
    }
  }, (err) => {
    let msg = `定位失敗：${err.message}`;
    if (err.code === 1) msg = '請允許瀏覽器定位權限';
    setStatus(msg, 'error');
  }, { enableHighAccuracy: true, timeout: 5000 });
}
