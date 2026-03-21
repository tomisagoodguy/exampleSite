import './styles/map.css';
import './styles/list.css';
import { MapEngine } from './engine';
import {
  getPlacesData,
  filterPlaces,
} from './data';
import { 
  updateStatsUI, 
  renderSidebarList, 
  showSidebarDetail 
} from './ui';
import { PlaceEntry } from '../../shared/types';

class AdventureMapApp {
  private engine: MapEngine;
  private allPlaces: PlaceEntry[] = [];
  private currentCat: string = 'all';
  private currentSeason: string = 'all';
  private lastFilteredPlaces: PlaceEntry[] = [];

  constructor() {
    this.allPlaces = getPlacesData();
    this.engine = new MapEngine('adventure-map');
    this.lastFilteredPlaces = this.allPlaces;

    this.init();
  }

  private init() {
    this.engine.renderMarkers(this.allPlaces, (p) => this.focusPlace(p.id));
    updateStatsUI(this.allPlaces, this.allPlaces);
    renderSidebarList(this.allPlaces, (id) => this.focusPlace(id));
    this.setupFilters();

    if (this.allPlaces.length > 0) {
      this.engine.fitBounds(this.allPlaces);
    }
  }

  private setupFilters() {
    // Category Filters
    document.querySelectorAll('.adv-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        document.querySelectorAll('.adv-filter-btn').forEach(b => b.classList.remove('adv-filter-btn--active'));
        target.classList.add('adv-filter-btn--active');
        this.currentCat = target.dataset.cat || 'all';
        this.applyFilters();
      });
    });

    // Season Filters
    document.querySelectorAll('.adv-season-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        document.querySelectorAll('.adv-season-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        this.currentSeason = target.dataset.season || 'all';
        this.applyFilters();
      });
    });
  }

  private applyFilters() {
    const filtered = filterPlaces(this.allPlaces, this.currentCat, this.currentSeason);
    this.lastFilteredPlaces = filtered;
    this.engine.renderMarkers(filtered, (p) => this.focusPlace(p.id));
    renderSidebarList(filtered, (id) => this.focusPlace(id));
  }

  private focusPlace(id: number) {
    const target = this.allPlaces.find(p => p.id === id);
    if (target) {
      this.engine.flyTo(target.lat, target.lng);
      showSidebarDetail(target, () => renderSidebarList(this.lastFilteredPlaces, (id) => this.focusPlace(id)));
    }
  }
}

// Start the app (module scripts are already deferred, DOM is ready)
if (document.getElementById('adventure-map')) {
  new AdventureMapApp();
}
