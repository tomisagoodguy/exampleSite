import './styles/map.css';
import './styles/list.css';
import { CATEGORY_CONFIG, colorToFade, filterPlaces, guideDay } from './data';
import {
  renderFilterBar,
  renderAttrBar,
  renderRegionCard,
  AttrFilter,
  renderSections,
  renderGuides,
  GuideFilter,
  GUIDE_FILTER_ALL,
  renderAchievements,
  achievementUnlock,
  AchievementFilter,
  renderTrips,
  openPassphraseModal,
  openProposeModal,
  openMarkDoneModal,
  openAchievementModal,
  openGuideModal,
  openIdentityModal,
  openConfirmModal,
  openScheduleModal,
  openCategoryManagerModal,
  openPkModal,
  openSwipeDeckModal,
  openNextTripModal,
  showToast,
  navQuery,
  vibrate,
} from './ui';
import { PlaceEntry } from '../../shared/types';
import { geocodePlace, lookupArea } from './geocode';
import { openTripMap, TripStop } from './tripmap';
import { setupPhotoViewer } from './photos';
import {
  fetchPlaces,
  fetchGuides,
  Guide,
  fetchAchievements,
  setAchievement,
  saveAchievement,
  deleteAchievement,
  saveGuide,
  deleteGuide,
  Achievement,
  fetchTrips,
  Trip,
  proposePlace,
  updatePlace,
  setPlaceAttrs,
  setPlaceArea,
  deletePlace,
  resetToIdea,
  toggleLike,
  getStoredPassphrase,
  storePassphrase,
  clearStoredPassphrase,
  getStoredIdentity,
  storeIdentity,
  Identity,
  fetchCategories,
  upsertCategory,
  deleteCategory,
  subscribeToChanges,
  setReadPassphrase,
  verifyPassphrase,
} from './supabase';

class DatingMapApp {
  private allPlaces: PlaceEntry[] = [];
  private guides: Guide[] = [];
  private currentGuideFilter: GuideFilter = GUIDE_FILTER_ALL;
  private achievements: Achievement[] = [];
  private currentAchFilter: AchievementFilter = 'all';
  private trips: Trip[] = [];
  private currentCat: string = 'all';
  private currentAttr: AttrFilter = { region: 'all', rainOnly: false };
  private currentSearch: string = '';
  private identity: Identity | null = null;
  private refreshTimer: number | null = null;
  private readonly builtinCategoryKeys = new Set(Object.keys(CATEGORY_CONFIG));

  constructor() {
    this.init();
  }

  private async init() {
    this.identity = getStoredIdentity();
    this.updateIdentityBadge();

    await this.unlock();
    await this.loadCategories();

    try {
      this.allPlaces = await fetchPlaces();
    } catch (err) {
      console.error('讀取破關地圖資料失敗', err);
      showToast('資料讀取失敗，稍後再試試');
      this.allPlaces = [];
    }
    await Promise.all([this.loadGuides(), this.loadAchievements(), this.loadTrips()]);

    this.renderAll();
    this.setupFab();
    this.setupIdentityBadge();
    this.setupCategoryManager();
    this.setupPk();
    this.setupSwipe();
    this.setupNextTrip();
    this.setupTabBar();
    this.setupRealtime();
    this.setupSearch();
    this.setupBackToTop();
    this.setupPullToRefresh();
    this.setupIntro();
    setupPhotoViewer();
  }

  /** 進站先驗密碼（記在 localStorage，驗過一次之後自動帶入）；沒通過就停在鎖定畫面，不讀任何資料 */
  private async unlock(): Promise<void> {
    let pw = getStoredPassphrase();
    let errorMsg: string | undefined;

    for (;;) {
      if (!pw) {
        pw = await openPassphraseModal(errorMsg);
        if (!pw) {
          await this.waitForUnlockClick();
          errorMsg = undefined;
          continue;
        }
      }

      try {
        if (await verifyPassphrase(pw)) {
          storePassphrase(pw);
          setReadPassphrase(pw);
          return;
        }
        clearStoredPassphrase();
        errorMsg = '密碼錯誤，請再試一次';
      } catch (err) {
        console.error('驗證密碼失敗', err);
        errorMsg = '連線失敗，請稍後再試';
      }
      pw = null;
    }
  }

  /** 取消輸入密碼後顯示的鎖定提示，按下按鈕才重新跳出密碼框 */
  private waitForUnlockClick(): Promise<void> {
    return new Promise((resolve) => {
      const lock = document.createElement('div');
      lock.className = 'adv-locked';
      lock.innerHTML = `
        <div class="adv-locked-icon" aria-hidden="true">🔒</div>
        <p>破關地圖需要密碼才能查看</p>
        <button type="button" class="adv-modal-btn adv-modal-btn--primary">輸入密碼</button>
      `;
      document.body.appendChild(lock);
      lock.querySelector('button')?.addEventListener('click', () => {
        lock.remove();
        resolve();
      });
    });
  }

  /** 首次造訪說明流程用的三段式看板，看過一次後用 localStorage 記住不再顯示 */
  private setupIntro() {
    const INTRO_KEY = 'adv-intro-dismissed';
    const intro = document.getElementById('adv-intro');
    if (!intro) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(INTRO_KEY) === '1';
    } catch {
      dismissed = false;
    }
    if (dismissed) return;

    intro.hidden = false;
    document.getElementById('adv-intro-close')?.addEventListener('click', () => {
      intro.hidden = true;
      try {
        localStorage.setItem(INTRO_KEY, '1');
      } catch {
        // 私密瀏覽模式等情境下寫入會失敗，忽略即可，下次造訪再顯示一次
      }
    });
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

  /**
   * 分頁狀態（手機底部分頁列＋桌面主題切換共用）：寫在 #adv-app-root[data-active-tab]。
   * 手機一次顯示一段清單；桌面的「規劃看板」是提案／行程／願望三欄併排，懶人包、成就、旅行各自獨立一頁。
   */
  private setupTabBar() {
    const tabbar = document.getElementById('adv-tabbar');
    if (!tabbar) return;

    const root = document.getElementById('adv-app-root');
    const board = document.getElementById('adv-board');
    const deskbar = document.getElementById('adv-deskbar');
    const PLAN_TABS = ['proposed', 'itinerary', 'idea'];
    let lastPlanTab = 'proposed';

    const setActive = (tab: string) => {
      if (PLAN_TABS.includes(tab)) lastPlanTab = tab;
      const deskTab = PLAN_TABS.includes(tab) ? 'plan' : tab;
      document.querySelectorAll('.adv-section[data-tab]').forEach((el) => {
        el.classList.toggle('adv-section--active', (el as HTMLElement).dataset.tab === tab);
      });
      tabbar.querySelectorAll('.adv-tab').forEach((btn) => {
        btn.classList.toggle('adv-tab--active', (btn as HTMLElement).dataset.tabTarget === tab);
      });
      deskbar?.querySelectorAll<HTMLElement>('.adv-deskbar__btn').forEach((btn) => {
        const active = btn.dataset.deskTarget === deskTab;
        btn.classList.toggle('adv-deskbar__btn--active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      if (root) root.dataset.activeTab = tab;
      // 已經捲過看板頂端才拉回看板開頭；還在上方就不動，避免每次換頁都重看一次 Hero
      if (board) {
        const boardTop = board.getBoundingClientRect().top + window.scrollY;
        if (window.scrollY > boardTop) window.scrollTo({ top: boardTop, behavior: 'smooth' });
      }
    };

    tabbar.querySelectorAll('.adv-tab').forEach((btn) => {
      btn.addEventListener('click', () => setActive((btn as HTMLElement).dataset.tabTarget || 'proposed'));
    });

    deskbar?.querySelectorAll<HTMLElement>('.adv-deskbar__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.deskTarget || 'plan';
        setActive(target === 'plan' ? lastPlanTab : target);
      });
    });

    // 空狀態裡的「去某分頁」按鈕
    root?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-goto-tab]');
      if (target?.dataset.gotoTab) setActive(target.dataset.gotoTab);
    });

    setActive(this.defaultTab());
  }

  /** 開場停在第一個有內容的分頁，不要讓第一眼看到空白的「提案中」 */
  private defaultTab(): string {
    const count = (status: PlaceEntry['status'][]) => this.allPlaces.filter((p) => status.includes(p.status)).length;
    if (count(['proposed'])) return 'proposed';
    if (count(['confirmed', 'done'])) return 'itinerary';
    if (count(['idea'])) return 'idea';
    return this.guides.length ? 'guides' : 'proposed';
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
    subscribeToChanges(async (table) => {
      if (table === 'dating_map_categories') {
        await this.loadCategories();
        this.renderAll();
        return;
      }
      this.scheduleRealtimeRefresh();
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
    const { region, rainOnly } = this.currentAttr;
    const filtered = filterPlaces(this.allPlaces, this.currentCat, this.currentSearch, region, rainOnly);

    renderFilterBar(this.allPlaces, this.currentCat, (cat) => {
      this.currentCat = cat;
      this.renderAll();
    });
    renderAttrBar(
      filterPlaces(this.allPlaces, this.currentCat, this.currentSearch),
      this.currentAttr,
      (next) => {
        this.currentAttr = next;
        this.renderAll();
      }
    );
    renderRegionCard(this.allPlaces, region);
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
      onShare: (p) => this.sharePlace(p),
      onBulkReset: (places, scope) => this.bulkReset(places, scope),
    });
    renderGuides(
      this.filterGuides(),
      this.allPlaces,
      this.currentGuideFilter,
      (filter) => {
        this.currentGuideFilter = filter;
        this.renderAll();
      },
      {
        onApply: (g) => this.applyGuide(g),
        onEdit: (g) => this.editGuide(g),
        onDelete: (g) => this.deleteGuide(g),
      }
    );
    renderAchievements(
      this.achievements,
      this.filterAchievements(),
      this.allPlaces,
      this.currentAchFilter,
      (filter) => {
        this.currentAchFilter = filter;
        this.renderAll();
      },
      {
        onUnlock: (a) => this.unlockAchievement(a),
        onUndo: (a) => this.undoAchievement(a),
        onEdit: (a) => this.editAchievement(a),
        onDelete: (a) => this.deleteAchievement(a),
        onCreate: () => this.editAchievement(),
      }
    );
    renderTrips(
      this.trips,
      this.filterTrips(),
      (t) => this.tripPlaces(t).length,
      (t) => this.openTripMap(t)
    );
  }

  /** 這趟旅行地區裡存過、有座標的地點（依 Trip.area_prefix 比對 area） */
  private tripPlaces(trip: Trip): PlaceEntry[] {
    const prefix = trip.area_prefix;
    if (!prefix) return [];
    return this.allPlaces.filter((p) => p.area?.startsWith(prefix) && p.lat != null && p.lng != null);
  }

  private openTripMap(trip: Trip) {
    // 懶人包的「🔗 原文」指到這趟的介紹頁，就是這趟的各天；懶人包已依 sort_order 排好，
    // 每條各自一條路線（day），顯示的天數取標題的「Day 3 路線 A」，沒寫就是第幾條
    const url = `/adventure-map/${trip.slug}/`;
    const placeById = new Map(this.allPlaces.map((p) => [p.id, p]));
    const stops: TripStop[] = this.guides
      .filter((g) => g.source_url === url)
      .flatMap((g, i) => {
        const parsed = guideDay(g.title);
        const dayLabel = parsed ? `Day ${parsed.day}${parsed.route ? ` ${parsed.route}` : ''}` : `Day ${i + 1}`;
        // 時段只寫在換時段的那站，後面的站沿用
        let period: string | null = null;
        return g.stops.flatMap((s) => {
          period = s.time_text || period;
          const p = s.place_id != null ? placeById.get(s.place_id) : undefined;
          return p && p.lat != null && p.lng != null
            ? [{ placeId: p.id, label: s.label, day: i + 1, dayLabel, period, lat: p.lat, lng: p.lng }]
            : [];
        });
      });
    openTripMap({
      trip,
      places: this.tripPlaces(trip),
      stops,
      onToggleLike: async (place) => {
        const identity = await this.ensureIdentity();
        if (!identity) return null;
        const saved = await this.withPassphrase((pw) => toggleLike(pw, place.id, identity));
        if (!saved) return null;
        this.allPlaces = this.allPlaces.map((p) => (p.id === saved.id ? { ...p, liked_by: saved.liked_by } : p));
        this.renderAll();
        return saved;
      },
    });
  }

  private async loadTrips() {
    try {
      this.trips = await fetchTrips();
    } catch (err) {
      console.error('讀取旅行介紹頁失敗', err);
      this.trips = [];
    }
  }

  /** 旅行分頁跟懶人包一樣只吃搜尋：比對標題、日期、摘要與標籤 */
  private filterTrips(): Trip[] {
    const q = this.currentSearch.trim().toLowerCase();
    if (!q) return this.trips;
    return this.trips.filter((t) =>
      [t.title, t.date_text, t.summary, ...t.tags].some((s) => (s || '').toLowerCase().includes(q))
    );
  }

  private async loadAchievements() {
    try {
      this.achievements = await fetchAchievements();
    } catch (err) {
      console.error('讀取成就失敗', err);
      this.achievements = [];
    }
  }

  private filterAchievements(): Achievement[] {
    const q = this.currentSearch.trim().toLowerCase();
    if (!q) return this.achievements;
    return this.achievements.filter((a) =>
      [a.title, a.description, a.when_text].some((v) => v && v.toLowerCase().includes(q))
    );
  }

  private async unlockAchievement(a: Achievement) {
    const form = await openMarkDoneModal(`解鎖「${a.title}」`);
    if (!form) return;

    const saved = await this.withPassphrase((pw) =>
      setAchievement(pw, a.id, { date: form.visitDate, by: this.identity || undefined, note: form.note })
    );
    if (saved) {
      vibrate([10, 40, 10, 40, 20]);
      showToast(`🏆 成就解鎖：${a.title}`);
      await this.refresh();
    }
  }

  private async undoAchievement(a: Achievement) {
    const confirmed = await openConfirmModal(`要取消「${a.title}」的解鎖紀錄嗎？`);
    if (!confirmed) return;

    const saved = await this.withPassphrase((pw) => setAchievement(pw, a.id, null));
    if (saved) {
      const placeById = new Map(this.allPlaces.map((p) => [p.id, p]));
      const stillByPlace = achievementUnlock({ ...a, done_date: null }, placeById) !== null;
      showToast(stillByPlace ? '已取消手動紀錄（連結的地點去過了，仍算解鎖）' : '已取消解鎖');
      await this.refresh();
    }
  }

  /** 沒給 a 就是新增 */
  private async editAchievement(a?: Achievement) {
    const input = await openAchievementModal(this.allPlaces, a);
    if (!input) return;

    const saved = await this.withPassphrase((pw) => saveAchievement(pw, a?.id ?? null, input));
    if (saved !== null) {
      showToast(a ? '已儲存修改' : `🎯 新增成就：${input.title}`);
      await this.refresh();
    }
  }

  private async deleteAchievement(a: Achievement) {
    const confirmed = await openConfirmModal(`要刪除成就「${a.title}」嗎？解鎖紀錄會一起刪掉，連結的地點不受影響。`);
    if (!confirmed) return;

    const saved = await this.withPassphrase((pw) => deleteAchievement(pw, a.id));
    if (saved !== null) {
      showToast('已刪除');
      await this.refresh();
    }
  }

  private async loadGuides() {
    try {
      this.guides = await fetchGuides();
    } catch (err) {
      console.error('讀取懶人包失敗', err);
      this.guides = [];
    }
  }

  /** 沒給 g 就是提案新的懶人包 */
  private async editGuide(g?: Guide) {
    const input = await openGuideModal(this.allPlaces, this.guides, g);
    if (!input) return;

    const identity = g ? null : await this.ensureIdentity();
    const saved = await this.withPassphrase((pw) => saveGuide(pw, g?.id ?? null, input, identity).then(() => true));
    if (saved) {
      showToast(g ? '已儲存修改' : `📚 提案懶人包：${input.title}`);
      await this.refresh();
    }
  }

  private async deleteGuide(g: Guide) {
    const confirmed = await openConfirmModal(`要刪除懶人包「${g.title}」嗎？各站一起刪掉，清單裡的地點不受影響。`);
    if (!confirmed) return;

    const saved = await this.withPassphrase((pw) => deleteGuide(pw, g.id).then(() => true));
    if (saved) {
      showToast('已刪除');
      await this.refresh();
    }
  }

  /** 搜尋框也套用到懶人包：比對標題、摘要、標籤與每一站名稱 */
  private filterGuides(): Guide[] {
    const q = this.currentSearch.trim().toLowerCase();
    if (!q) return this.guides;
    return this.guides.filter((g) =>
      [g.title, g.summary, ...g.tags, ...g.stops.map((s) => s.label)].some(
        (v) => v && v.toLowerCase().includes(q)
      )
    );
  }

  /** 照懶人包排行程：把每一站對應的地點依原本順序定案到同一天 */
  private async applyGuide(guide: Guide) {
    const stopPlaces = guide.stops
      .map((s) => this.allPlaces.find((p) => p.id === s.place_id))
      .filter((p, i, arr): p is PlaceEntry => p != null && arr.indexOf(p) === i);
    const todo = stopPlaces.filter((p) => p.status === 'idea' || p.status === 'proposed');
    const skipped = stopPlaces.length - todo.length;

    if (!todo.length) {
      showToast('這個懶人包的地點都已經在行程裡了');
      return;
    }

    const date = await openScheduleModal(`「${guide.title}」排哪一天？`);
    if (date === null) return;
    if (!date) {
      showToast('要選日期才能照順序排進行程喔');
      return;
    }

    const start = this.nextSortOrderForDay(date);
    const ok = await this.withPassphrase(async (pw) => {
      for (const [i, place] of todo.entries()) {
        await updatePlace({
          passphrase: pw,
          id: place.id,
          status: 'confirmed',
          visit_date: date,
          sort_order: start + i,
        });
      }
      return true;
    });

    if (ok) {
      showToast(`已排進 ${date}：${todo.length} 站${skipped ? `（${skipped} 站原本就在行程中）` : ''}`);
      await this.refresh();
    }
  }

  /** 地點搜尋框：debounce 後依名稱/地址/捷運站/備註做本地篩選 */
  private setupSearch() {
    const input = document.getElementById('adv-search-input') as HTMLInputElement | null;
    if (!input) return;

    let timer: number | null = null;
    input.addEventListener('input', () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        this.currentSearch = input.value;
        this.renderAll();
      }, 150);
    });
  }

  /** 手機捲動夠遠時顯示「回到頂部」按鈕 */
  private setupBackToTop() {
    const btn = document.getElementById('adv-back-top');
    if (!btn) return;

    const onScroll = () => {
      btn.classList.toggle('adv-back-top--visible', window.scrollY > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /** 頁面頂端下拉刷新，模擬原生 App 手感 */
  private setupPullToRefresh() {
    const indicator = document.getElementById('adv-pull-refresh');
    if (!indicator) return;

    const threshold = 70;
    let startY = 0;
    let pulling = false;
    let refreshing = false;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      startY = e.touches[0].clientY;
      pulling = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) return;
      const dist = Math.min(dy, threshold * 1.6);
      indicator.style.top = `${dist - 40}px`;
      indicator.style.opacity = `${Math.min(dist / threshold, 1)}`;
      indicator.classList.toggle('adv-pull-refresh--ready', dist >= threshold);
    };

    const onTouchEnd = async (e: TouchEvent) => {
      if (!pulling) return;
      pulling = false;
      const endY = e.changedTouches[0]?.clientY ?? startY;
      const dy = endY - startY;
      indicator.classList.remove('adv-pull-refresh--ready');

      if (dy >= threshold && !refreshing) {
        refreshing = true;
        indicator.style.top = '16px';
        indicator.style.opacity = '1';
        indicator.classList.add('adv-pull-refresh--spinning');
        vibrate(10);
        await this.refresh();
        indicator.classList.remove('adv-pull-refresh--spinning');
        indicator.style.top = '';
        indicator.style.opacity = '';
        refreshing = false;
      } else {
        indicator.style.top = '';
        indicator.style.opacity = '';
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
  }

  /** 分享單一地點：支援時用系統分享面板，否則複製連結到剪貼簿 */
  private async sharePlace(place: PlaceEntry) {
    const url = `https://www.google.com/maps?q=${navQuery(place)}`;
    const text = `${place.name}${place.address ? ' - ' + place.address : ''}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: place.name, text, url });
      } catch {
        // 使用者取消分享面板，不需處理
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      vibrate(8);
      showToast('已複製地點連結');
    } catch {
      showToast('複製失敗');
    }
  }

  private setupFab() {
    const fab = document.getElementById('adv-fab');
    fab?.addEventListener('click', () => this.createProposal());
    document.getElementById('adv-guide-new')?.addEventListener('click', () => this.editGuide());
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

    // 在問密碼前查好，密碼輸錯重試時不必重查
    const hit = await geocodePlace(result.name, result.address);
    const area = hit ? await lookupArea(hit.lat, hit.lng, result.address) : null;

    const saved = await this.withPassphrase(async (pw) => {
      const created = await proposePlace({
        passphrase: pw,
        name: result.name,
        category: result.category,
        note: result.note,
        proposed_by: result.proposedBy,
        address: result.address,
        lat: hit?.lat,
        lng: hit?.lng,
        status: 'proposed',
      });
      return area ? setPlaceArea(pw, created.id, area) : created;
    });

    if (saved) {
      showToast(hit ? `提案送出啦！已定位到：${hit.matched}` : '提案送出啦！（找不到座標，地圖上暫時不會顯示）');
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

  /** 討論到一半放棄重來：地點不刪，只退回願望清單並清掉日期 */
  private async bulkReset(places: PlaceEntry[], scope: string) {
    if (!places.length) return;
    const confirmed = await openConfirmModal(
      `把${scope}的 ${places.length} 個地點全部退回願望清單？日期與排序會清掉，地點本身不會刪除。`
    );
    if (!confirmed) return;

    const count = await this.withPassphrase((pw) => resetToIdea(pw, places.map((p) => p.id)));
    if (count !== null) {
      showToast(`已退回 ${count} 個地點到願望清單`);
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
      vibrate([10, 40, 10, 40, 20]);
      // 在 refresh 前判斷：這個地點連結的成就裡，哪些是這次才解鎖的
      const placeById = new Map(this.allPlaces.map((p) => [p.id, p]));
      const unlocked = this.achievements.filter(
        (a) => a.place_ids.includes(place.id) && achievementUnlock(a, placeById) === null
      );
      showToast(unlocked.length ? `恭喜破關！🏆 成就解鎖：${unlocked.map((a) => a.title).join('、')}` : '恭喜破關！🏆');
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
      region: place.region,
      isIndoor: place.is_indoor,
    }, 'edit');
    if (!result) return;

    const attrsChanged =
      (result.region !== undefined && result.region !== place.region) ||
      (result.isIndoor !== undefined && result.isIndoor !== place.is_indoor);

    // 原本沒座標，或地址改了，才重新定位；座標變動時 trigger 會一併重算地區
    const addressChanged = !!result.address && result.address !== (place.address || place.mrt_station);
    const hit = place.lat == null || addressChanged ? await geocodePlace(result.name, result.address) : null;
    // 座標一變 trigger 就清空 area，要在 updatePlace 之後寫回
    const area = hit ? await lookupArea(hit.lat, hit.lng, result.address) : null;

    const saved = await this.withPassphrase(async (pw) => {
      let updated = await updatePlace({
        passphrase: pw,
        id: place.id,
        name: result.name,
        category: result.category,
        address: result.address,
        note: result.note,
        lat: hit?.lat,
        lng: hit?.lng,
      });
      if (area) updated = await setPlaceArea(pw, place.id, area);
      if (!attrsChanged) return updated;
      return setPlaceAttrs(pw, place.id, { region: result.region, is_indoor: result.isIndoor });
    });

    if (saved) {
      showToast(hit ? `已更新，並定位到：${hit.matched}` : '已更新');
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
    await Promise.all([this.loadGuides(), this.loadAchievements(), this.loadTrips()]);
    this.renderAll();
  }
}

if (document.getElementById('adv-app-root')) {
  new DatingMapApp();
}
