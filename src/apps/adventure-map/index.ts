import './styles/map.css';
import './styles/list.css';
import { filterPlaces } from './data';
import {
  updateStatsUI,
  renderFilterBar,
  renderSections,
  openPassphraseModal,
  openProposeModal,
  openMarkDoneModal,
  openIdentityModal,
  showToast,
} from './ui';
import { PlaceEntry } from '../../shared/types';
import {
  fetchPlaces,
  proposePlace,
  updatePlace,
  toggleLike,
  getStoredPassphrase,
  storePassphrase,
  clearStoredPassphrase,
  getStoredIdentity,
  storeIdentity,
  Identity,
} from './supabase';

class DatingMapApp {
  private allPlaces: PlaceEntry[] = [];
  private currentCat: string = 'all';
  private identity: Identity | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    this.identity = getStoredIdentity();
    if (!this.identity) {
      this.identity = await openIdentityModal();
      storeIdentity(this.identity);
    }
    this.updateIdentityBadge();

    try {
      this.allPlaces = await fetchPlaces();
    } catch (err) {
      console.error('讀取破關地圖資料失敗', err);
      showToast('資料讀取失敗，稍後再試試');
      this.allPlaces = [];
    }

    this.renderAll();
    this.setupFab();
    this.setupIdentityBadge();
  }

  private updateIdentityBadge() {
    const el = document.getElementById('adv-identity-badge');
    if (el) el.textContent = `你是：${this.identity}`;
  }

  private setupIdentityBadge() {
    document.getElementById('adv-identity-badge')?.addEventListener('click', async () => {
      const identity = await openIdentityModal();
      this.identity = identity;
      storeIdentity(identity);
      this.updateIdentityBadge();
    });
  }

  private renderAll() {
    const filtered = filterPlaces(this.allPlaces, this.currentCat, 'all');

    updateStatsUI(this.allPlaces);
    renderFilterBar(this.allPlaces, this.currentCat, (cat) => {
      this.currentCat = cat;
      this.renderAll();
    });
    renderSections(filtered, {
      onPromote: (p) => this.promoteIdea(p),
      onConfirm: (p) => this.changeStatus(p, 'confirmed'),
      onUnpropose: (p) => this.changeStatus(p, 'idea'),
      onMarkDone: (p) => this.markDone(p),
      onReopen: (p) => this.changeStatus(p, 'confirmed'),
      onToggleLike: (p) => this.toggleLike(p),
    });
  }

  private setupFab() {
    const fab = document.getElementById('adv-fab');
    fab?.addEventListener('click', () => this.createProposal());
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
    const result = await openProposeModal({});
    if (!result) return;

    const saved = await this.withPassphrase((pw) =>
      proposePlace({
        passphrase: pw,
        name: result.name,
        category: result.category,
        note: result.note,
        proposed_by: result.proposedBy,
        address: result.address,
        status: 'proposed',
      })
    );

    if (saved) {
      showToast('提案送出啦！');
      await this.refresh();
    }
  }

  private async promoteIdea(idea: PlaceEntry) {
    const result = await openProposeModal({
      name: idea.name,
      category: idea.category,
      address: idea.mrt_station,
    });
    if (!result) return;

    const saved = await this.withPassphrase((pw) =>
      updatePlace({
        passphrase: pw,
        id: idea.id,
        status: 'proposed',
        address: result.address || undefined,
        note: result.note || undefined,
      })
    );

    if (saved) {
      showToast('已從願望清單提案！');
      await this.refresh();
    }
  }

  private async changeStatus(place: PlaceEntry, status: 'idea' | 'confirmed') {
    const saved = await this.withPassphrase((pw) =>
      updatePlace({ passphrase: pw, id: place.id, status })
    );
    if (saved) {
      showToast(status === 'confirmed' ? '定案了！期待這次約會 🎉' : '已回到願望清單');
      await this.refresh();
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
      await this.refresh();
    }
  }

  private async toggleLike(place: PlaceEntry) {
    if (!this.identity) return;
    const saved = await this.withPassphrase((pw) => toggleLike(pw, place.id, this.identity as Identity));
    if (saved) await this.refresh();
  }

  private async refresh() {
    try {
      this.allPlaces = await fetchPlaces();
    } catch (err) {
      console.error(err);
    }
    this.renderAll();
  }
}

if (document.getElementById('adv-app-root')) {
  new DatingMapApp();
}
