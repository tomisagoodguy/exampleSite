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
