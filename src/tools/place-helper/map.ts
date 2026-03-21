import L from 'leaflet';

let map: L.Map;
let clickMark: L.CircleMarker | null = null;

export function initMap(elementId: string, onClick: (lat: number, lng: number) => void): L.Map {
  map = L.map(elementId, { center: [25.05, 121.55], zoom: 12, zoomControl: true });
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  map.on('click', (e: L.LeafletMouseEvent) => {
    onClick(e.latlng.lat, e.latlng.lng);
  });

  return map;
}

export function setCoord(lat: number, lng: number, flyTo: boolean): void {
  const latVal = +parseFloat(lat.toString()).toFixed(5);
  const lngVal = +parseFloat(lng.toString()).toFixed(5);

  (document.getElementById('f-lat') as HTMLInputElement).value = latVal.toString();
  (document.getElementById('f-lng') as HTMLInputElement).value = lngVal.toString();

  const pill = document.getElementById('coord-pill');
  if (pill) {
    pill.textContent = `${latVal}, ${lngVal}`;
    pill.style.display = 'block';
  }
  document.getElementById('map-tip')?.classList.add('hide');
  setMarker(latVal, lngVal, flyTo);
}

export function setMarker(lat: number, lng: number, flyTo: boolean = false) {
  if (clickMark) map.removeLayer(clickMark);
  
  clickMark = L.circleMarker([lat, lng], {
    radius: 11,
    color: '#C47B5A',
    fillColor: '#C47B5A',
    fillOpacity: 0.75,
    weight: 3
  }).addTo(map);
  
  if (flyTo) {
    map.flyTo([lat, lng], 16, { duration: 1.2 });
  }
}
