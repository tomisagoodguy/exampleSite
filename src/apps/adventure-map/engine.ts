import L from 'leaflet';
import 'leaflet.markercluster';
import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG } from './data';

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
    return L.divIcon({
      html: `<div class="adv-marker" style="background:${config.color}; box-shadow: 0 0 15px ${config.fade};"></div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }

  flyTo(lat: number, lng: number, zoom: number = 16) {
    this.map.flyTo([lat, lng], zoom, { duration: 1.5 });
  }

  fitBounds(places: PlaceEntry[]) {
    if (places.length === 0) return;
    const latlngs = places.map(p => [p.lat, p.lng] as L.LatLngExpression);
    this.map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 13 });
  }
}
