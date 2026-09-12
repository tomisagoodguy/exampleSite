import './styles/map.css';
import './styles/list.css';
import { MapEngine } from './engine';
import { filterPlaces } from './data';
import {
  updateStatsUI,
  renderFilterBar,
  renderSidebarList,
  renderWishlist,
  showSidebarDetail,
  openPassphraseModal,
  openProposeModal,
  openMarkDoneModal,
  showToast,
} from './ui';
import { PlaceEntry } from '../../shared/types';
import {
  fetchPlaces,
  proposePlace,
  updatePlace,
  getStoredPassphrase,
  storePassphrase,
  clearStoredPassphrase,
} from './supabase';

class AdventureMapApp {
  private engine: MapEngine;
  private allPlaces: PlaceEntry[] = [];
  private currentCat: string = 'all';
  private currentSeason: string = 'all';
  private lastFilteredPlaces: PlaceEntry[] = [];

  constructor() {
    this.engine = new MapEngine('adventure-map');
    this.init();
  }

  private async init() {
    try {
      this.allPlaces = await fetchPlaces();
    } catch (err) {
      console.error('讀取破關地圖資料失敗', err);
      showToast('資料讀取失敗，稍後再試試');
      this.allPlaces = [];
    }

    this.lastFilteredPlaces = this.allPlaces;
    this.renderAll();
    this.setupSeasonFilters();
    this.setupFab();

    const located = this.allPlaces.filter(p => p.lat != null && p.lng != null);
    if (located.length > 0) {
      this.engine.fitBounds(located);
    }
  }

  private renderAll() {
    const filtered = filterPlaces(this.allPlaces, this.currentCat, this.currentSeason);
    this.lastFilteredPlaces = filtered;

    this.engine.renderMarkers(filtered, (p) => this.focusPlace(p.id));
    updateStatsUI(filtered, this.allPlaces);
    renderFilterBar(this.allPlaces, this.currentCat, (cat) => {
      this.currentCat = cat;
      this.renderAll();
    });
    renderSidebarList(filtered, (id) => this.focusPlace(id));
    renderWishlist(this.allPlaces, (idea) => this.promoteIdea(idea));
  }

  private setupSeasonFilters() {
    document.querySelectorAll('.adv-season-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        document.querySelectorAll('.adv-season-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        this.currentSeason = target.dataset.season || 'all';
        this.renderAll();
      });
    });
  }

  private setupFab() {
    const fab = document.getElementById('adv-fab');
    fab?.addEventListener('click', () => this.createProposal());
  }

  private focusPlace(id: number) {
    const target = this.allPlaces.find(p => p.id === id);
    if (target && target.lat != null && target.lng != null) {
      this.engine.flyTo(target.lat, target.lng);
      showSidebarDetail(
        target,
        () => renderSidebarList(this.lastFilteredPlaces, (id) => this.focusPlace(id)),
        {
          onConfirm: (p) => this.changeStatus(p, 'confirmed'),
          onMarkDone: (p) => this.markDone(p),
          onReopen: (p) => this.changeStatus(p, 'proposed'),
        }
      );
    }
  }

  private async withPassphrase<T>(action: (pw: string) => Promise<T>): Promise<T | null> {
    let pw = getStoredPassphrase();
    let errorMsg: string | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (!pw) {
        pw = await openPassphraseModal(errorMsg);
        if (!pw) return null;
      }

      try {
        const result = await action(pw);
        storePassphrase(pw);
        return result;
      } catch (err: any) {
        const message = err?.message || '';
        if (message.includes('密碼錯誤')) {
          clearStoredPassphrase();
          pw = null;
          errorMsg = '密碼錯誤，請再試一次';
          continue;
        }
        console.error(err);
        showToast('操作失敗，請稍後再試');
        return null;
      }
    }
    return null;
  }

  private async createProposal() {
    const result = await openProposeModal({}, (onPick) => this.engine.pickLocation(onPick));
    if (!result) return;

    const saved = await this.withPassphrase((pw) =>
      proposePlace({
        passphrase: pw,
        name: result.name,
        category: result.category,
        note: result.note,
        proposed_by: result.proposedBy,
        lat: result.lat ?? undefined,
        lng: result.lng ?? undefined,
        status: 'proposed',
      })
    );

    if (saved) {
      showToast('提案送出啦！');
      await this.refresh();
    }
  }

  private async promoteIdea(idea: PlaceEntry) {
    const result = await openProposeModal(
      { name: idea.name, category: idea.category },
      (onPick) => this.engine.pickLocation(onPick)
    );
    if (!result) return;

    if (result.lat == null || result.lng == null) {
      showToast('要先在地圖上點一個位置才能提案喔');
      return;
    }

    const saved = await this.withPassphrase((pw) =>
      updatePlace({
        passphrase: pw,
        id: idea.id,
        status: 'proposed',
        lat: result.lat as number,
        lng: result.lng as number,
        note: result.note || undefined,
      })
    );

    if (saved) {
      showToast('已從願望清單提案！');
      await this.refresh();
    }
  }

  private async changeStatus(place: PlaceEntry, status: 'proposed' | 'confirmed') {
    const saved = await this.withPassphrase((pw) =>
      updatePlace({ passphrase: pw, id: place.id, status })
    );
    if (saved) {
      showToast(status === 'confirmed' ? '定案了！期待這次約會 🎉' : '改回提案中');
      await this.refresh(place.id);
    }
  }

  private async markDone(place: PlaceEntry) {
    const form = await openMarkDoneModal();
    if (!form) return;

    const combinedNote = place.note
      ? `${place.note}\n\n🏁 ${form.visitDate}：${form.note}`
      : form.note;

    const saved = await this.withPassphrase((pw) =>
      updatePlace({
        passphrase: pw,
        id: place.id,
        status: 'done',
        visit_date: form.visitDate,
        note: combinedNote || undefined,
      })
    );
    if (saved) {
      showToast('恭喜破關！🏆');
      await this.refresh(place.id);
    }
  }

  private async refresh(focusId?: number) {
    try {
      this.allPlaces = await fetchPlaces();
    } catch (err) {
      console.error(err);
    }
    this.renderAll();
    if (focusId != null) this.focusPlace(focusId);
  }
}

if (document.getElementById('adventure-map')) {
  new AdventureMapApp();
}
