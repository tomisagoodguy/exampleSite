import './styles/map.css';
import './styles/list.css';
import { CATEGORY_CONFIG, colorToFade, filterPlaces } from './data';
import {
  updateStatsUI,
  renderFilterBar,
  renderSections,
  openPassphraseModal,
  openProposeModal,
  openMarkDoneModal,
  openIdentityModal,
  openConfirmModal,
  openScheduleModal,
  openCategoryManagerModal,
  openPkModal,
  openSwipeDeckModal,
  openNextTripModal,
  showToast,
} from './ui';
import { PlaceEntry } from '../../shared/types';
import {
  fetchPlaces,
  proposePlace,
  updatePlace,
  deletePlace,
  toggleLike,
  getStoredPassphrase,
  storePassphrase,
  clearStoredPassphrase,
  getStoredIdentity,
  storeIdentity,
  Identity,
  subscribeToPlaces,
  fetchCategories,
  upsertCategory,
  deleteCategory,
  subscribeToCategories,
} from './supabase';

class DatingMapApp {
  private allPlaces: PlaceEntry[] = [];
  private currentCat: string = 'all';
  private identity: Identity | null = null;
  private refreshTimer: number | null = null;
  private readonly builtinCategoryKeys = new Set(Object.keys(CATEGORY_CONFIG));

  constructor() {
    this.init();
  }

  private async init() {
    this.identity = getStoredIdentity();
    this.updateIdentityBadge();

    await this.loadCategories();

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
    this.setupCategoryManager();
    this.setupPk();
    this.setupSwipe();
    this.setupNextTrip();
    this.setupTabBar();
    this.setupRealtime();
  }

  private async loadCategories() {
    try {
      const rows = await fetchCategories();
      const dbKeys = new Set(rows.map((r) => r.key));

      for (const key of Object.keys(CATEGORY_CONFIG)) {
        if (!this.builtinCategoryKeys.has(key) && !dbKeys.has(key)) {
          delete CATEGORY_CONFIG[key];
        }
      }

      for (const row of rows) {
        CATEGORY_CONFIG[row.key] = {
          color: row.color,
          fade: colorToFade(row.color),
          label: row.label,
          placeholder: '/images/placeholders/quest.png',
        };
      }
    } catch (err) {
      console.error('讀取分類失敗', err);
    }
  }

  private setupCategoryManager() {
    document.getElementById('adv-category-manage-btn')?.addEventListener('click', () => {
      openCategoryManagerModal(
        CATEGORY_CONFIG,
        this.builtinCategoryKeys,
        {
          add: (label, color) =>
            this.withPassphrase((pw) => upsertCategory(pw, label, label, color, this.identity || undefined)).then(
              (r) => r !== null
            ),
          updateColor: (key, color) => {
            const cfg = CATEGORY_CONFIG[key];
            return this.withPassphrase((pw) =>
              upsertCategory(pw, key, cfg?.label || key, color, this.identity || undefined)
            ).then((r) => r !== null);
          },
          remove: (key) => {
            if (this.allPlaces.some((p) => p.category === key)) {
              return Promise.resolve('這個分類還有地點在使用，無法刪除');
            }
            return this.withPassphrase((pw) => deleteCategory(pw, key)).then((r) =>
              r === null ? '刪除失敗，請確認密碼' : null
            );
          },
        },
        () => this.renderAll()
      );
    });
  }

  private setupPk() {
    document.getElementById('adv-pk-btn')?.addEventListener('click', () => this.startPk());
  }

  private setupSwipe() {
    document.getElementById('adv-swipe-btn')?.addEventListener('click', () => this.startSwipe());
  }

  private setupNextTrip() {
    document.getElementById('adv-next-trip-btn')?.addEventListener('click', () =>
      openNextTripModal(this.allPlaces)
    );
  }

  /** 手機版底部分頁列：一次只顯示一段清單，感覺像原生 App 而非長長的網頁 */
  private setupTabBar() {
    const tabbar = document.getElementById('adv-tabbar');
    if (!tabbar) return;

    const setActive = (tab: string) => {
      document.querySelectorAll('.adv-section[data-tab]').forEach((el) => {
        el.classList.toggle('adv-section--active', (el as HTMLElement).dataset.tab === tab);
      });
      tabbar.querySelectorAll('.adv-tab').forEach((btn) => {
        btn.classList.toggle('adv-tab--active', (btn as HTMLElement).dataset.tabTarget === tab);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    tabbar.querySelectorAll('.adv-tab').forEach((btn) => {
      btn.addEventListener('click', () => setActive((btn as HTMLElement).dataset.tabTarget || 'proposed'));
    });

    setActive('proposed');
  }

  private startSwipe() {
    const ideas = this.allPlaces.filter((p) => p.status === 'idea');
    if (!ideas.length) {
      showToast('願望清單是空的，先新增幾個地點吧');
      return;
    }
    openSwipeDeckModal(ideas, (place) => this.goIdea(place));
  }

  private async startPk() {
    const candidates = this.allPlaces.filter((p) => p.status === 'proposed');
    if (candidates.length < 2) {
      showToast('至少要有兩個提案才能 PK 喔');
      return;
    }

    const winner = await openPkModal(candidates);
    if (winner) {
      showToast(`🏆 PK 冠軍：${winner.name}！`);
      await this.confirmPlace(winner);
    }
  }

  private setupRealtime() {
    subscribeToPlaces(() => this.scheduleRealtimeRefresh());
    subscribeToCategories(async () => {
      await this.loadCategories();
      this.renderAll();
    });
  }

  private scheduleRealtimeRefresh() {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, 300);
  }

  private updateIdentityBadge() {
    const el = document.getElementById('adv-identity-badge');
    if (el) el.textContent = this.identity ? `你是：${this.identity}` : '設定身份';
  }

  private setupIdentityBadge() {
    document.getElementById('adv-identity-badge')?.addEventListener('click', async () => {
      const identity = await openIdentityModal();
      this.identity = identity;
      storeIdentity(identity);
      this.updateIdentityBadge();
    });
  }

  /** 身分是低調小按鈕，只有真的需要標記「誰按讚/誰提案」時才問一次，不擋住開場畫面 */
  private async ensureIdentity(): Promise<Identity | null> {
    if (this.identity) return this.identity;
    const identity = await openIdentityModal();
    this.identity = identity;
    storeIdentity(identity);
    this.updateIdentityBadge();
    return identity;
  }

  private renderAll() {
    const filtered = filterPlaces(this.allPlaces, this.currentCat, 'all');

    updateStatsUI(this.allPlaces);
    renderFilterBar(this.allPlaces, this.currentCat, (cat) => {
      this.currentCat = cat;
      this.renderAll();
    });
    renderSections(filtered, {
      onGo: (p) => this.goIdea(p),
      onConfirm: (p) => this.confirmPlace(p),
      onUnpropose: (p) => this.changeStatus(p, 'idea'),
      onMarkDone: (p) => this.markDone(p),
      onReopen: (p) => this.changeStatus(p, 'confirmed'),
      onToggleLike: (p) => this.toggleLike(p),
      onEdit: (p) => this.editPlace(p),
      onDelete: (p) => this.deletePlace(p),
      onReschedule: (p) => this.reschedulePlace(p),
      onReorder: (dayKey, orderedIds) => this.reorderDay(dayKey, orderedIds),
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

  private async goIdea(idea: PlaceEntry) {
    const identity = await this.ensureIdentity();
    if (!identity) return;

    const saved = await this.withPassphrase(async (pw) => {
      await toggleLike(pw, idea.id, identity);
      return updatePlace({
        passphrase: pw,
        id: idea.id,
        status: 'proposed',
        proposed_by: idea.proposed_by || identity,
      });
    });

    if (saved) {
      showToast(`${identity} 想去，已加入提案中！`);
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

  private nextSortOrderForDay(date: string): number {
    const sameDay = this.allPlaces.filter(
      (p) => (p.status === 'confirmed' || p.status === 'done') && p.visit_date === date
    );
    return sameDay.length
      ? Math.max(...sameDay.map((p) => p.sort_order ?? 0)) + 1
      : 0;
  }

  private async confirmPlace(place: PlaceEntry) {
    const date = await openScheduleModal('這次約會排哪一天？');
    if (date === null) return;

    const saved = await this.withPassphrase((pw) =>
      updatePlace({
        passphrase: pw,
        id: place.id,
        status: 'confirmed',
        visit_date: date || undefined,
        sort_order: date ? this.nextSortOrderForDay(date) : undefined,
      })
    );
    if (saved) {
      showToast('定案了！期待這次約會 🎉');
      await this.refresh();
    }
  }

  private async reschedulePlace(place: PlaceEntry) {
    const date = await openScheduleModal('改到哪一天？', place.visit_date);
    if (!date) return;

    const saved = await this.withPassphrase((pw) =>
      updatePlace({
        passphrase: pw,
        id: place.id,
        visit_date: date,
        sort_order: this.nextSortOrderForDay(date),
      })
    );
    if (saved) {
      showToast('已更新日期');
      await this.refresh();
    }
  }

  private async reorderDay(dayKey: string, orderedIds: number[]) {
    const changed = orderedIds
      .map((id, index) => ({ id, sort_order: index }))
      .filter(({ id, sort_order }) => {
        const place = this.allPlaces.find((p) => p.id === id);
        return place && place.sort_order !== sort_order;
      });

    if (!changed.length) return;

    // 樂觀更新本地順序，避免拖曳後畫面跳動
    changed.forEach(({ id, sort_order }) => {
      const place = this.allPlaces.find((p) => p.id === id);
      if (place) place.sort_order = sort_order;
    });

    const ok = await this.withPassphrase(async (pw) => {
      for (const { id, sort_order } of changed) {
        await updatePlace({ passphrase: pw, id, sort_order });
      }
      return true;
    });

    if (!ok) await this.refresh();
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
    const identity = await this.ensureIdentity();
    if (!identity) return;
    const saved = await this.withPassphrase((pw) => toggleLike(pw, place.id, identity));
    if (saved) await this.refresh();
  }

  private async editPlace(place: PlaceEntry) {
    const result = await openProposeModal({
      name: place.name,
      category: place.category,
      address: place.address || place.mrt_station,
      note: place.note,
      proposedBy: place.proposed_by,
    }, 'edit');
    if (!result) return;

    const saved = await this.withPassphrase((pw) =>
      updatePlace({
        passphrase: pw,
        id: place.id,
        name: result.name,
        category: result.category,
        address: result.address,
        note: result.note,
      })
    );

    if (saved) {
      showToast('已更新');
      await this.refresh();
    }
  }

  private async deletePlace(place: PlaceEntry) {
    const confirmed = await openConfirmModal(`要刪除「${place.name}」嗎？這個動作無法復原。`);
    if (!confirmed) return;

    const saved = await this.withPassphrase((pw) => deletePlace(pw, place.id));
    if (saved !== null) {
      showToast('已刪除');
      await this.refresh();
    }
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
