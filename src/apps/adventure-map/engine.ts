import type * as Leaflet from 'leaflet';
import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG } from './data';

// Leaflet + leaflet.markercluster 由 CDN <script> 載入，掛在 window.L
declare const L: typeof Leaflet & { markerClusterGroup: (...args: any[]) => any };

export class MapEngine {
  private map: L.Map;
  private clusterGroup: L.MarkerClusterGroup;

  constructor(elementId: string) {
    this.map = L.map(elementId, {
      center: [25.05, 121.55],
      zoom: 12,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO'
    }).addTo(this.map);

    L.control.zoom({ position: 'topleft' }).addTo(this.map);
    
    this.clusterGroup = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      iconCreateFunction: (cluster: any) => {
        return L.divIcon({ 
          html: `<div class="adv-cluster"><span>${cluster.getChildCount()}</span></div>`, 
          className: '', 
          iconSize: [40, 40] 
        });
      }
    });
    this.map.addLayer(this.clusterGroup);
  }

  renderMarkers(places: PlaceEntry[], onMarkerClick: (place: PlaceEntry) => void) {
    this.clusterGroup.clearLayers();
    places.forEach(p => {
      if (p.lat == null || p.lng == null) return;
      const marker = L.marker([p.lat, p.lng], { icon: this.createIcon(p) });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onMarkerClick(p);
      });
      this.clusterGroup.addLayer(marker);
    });
  }

  private createIcon(p: PlaceEntry) {
    const config = CATEGORY_CONFIG[p.category] || CATEGORY_CONFIG.food;
    const dashed = p.status === 'proposed' ? 'adv-marker--proposed' : '';
    const badge = p.status === 'done' ? '<span class="adv-marker-badge">✓</span>' : '';
    return L.divIcon({
      html: `<div class="adv-marker ${dashed}" style="background:${config.color}; box-shadow: 0 0 15px ${config.fade};">${badge}</div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }

  flyTo(lat: number, lng: number, zoom: number = 16) {
    this.map.flyTo([lat, lng], zoom, { duration: 1.5 });
  }

  fitBounds(places: PlaceEntry[]) {
    const located = places.filter(p => p.lat != null && p.lng != null);
    if (located.length === 0) return;
    const latlngs = located.map(p => [p.lat as number, p.lng as number] as L.LatLngTuple);
    this.map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 13 });
  }

  /** 進入「點地圖選座標」模式，下一次點擊地圖時回傳座標並自動離開此模式 */
  pickLocation(onPick: (lat: number, lng: number) => void) {
    const container = this.map.getContainer();
    container.classList.add('adv-map--picking');
    const handler = (e: L.LeafletMouseEvent) => {
      container.classList.remove('adv-map--picking');
      this.map.off('click', handler);
      onPick(e.latlng.lat, e.latlng.lng);
    };
    this.map.on('click', handler);
  }
}
