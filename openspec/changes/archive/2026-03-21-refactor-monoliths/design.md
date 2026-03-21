## Context

專案中 `src/apps/adventure-map/` 已有良好的模組化範例（data / engine / ui / index 各司其職）。place-helper 工具的 `main.ts` 在初期快速開發時將所有邏輯堆積於單一文件，導致 726 行的巨石。`about/list.html` 的 modal 則是因為方便而直接內嵌，造成模板難以瀏覽。

**現況問題：**
```
main.ts（726 行）混雜：
├── 8 個全域狀態變數（分散耦合）
├── 事件綁定（UI 層）
├── DOM 讀取 / 表單組裝（資料層）
├── File System API + JSON CRUD（IO 層）
├── 相片選取與預覽（媒體層）
├── 管理介面渲染（UI 層）
└── IndexedDB handles（持久化層）
```

## Goals / Non-Goals

**Goals:**
- `main.ts` 縮減至 ~60 行純初始化入口
- 每個新模組 ≤ 120 行，單一職責
- `about/list.html` modal 抽為獨立 partial
- 零功能行為變更（純結構）
- 遵守 CLAUDE.md：無 `any`（File System API handle 除外，改用 `unknown`）

**Non-Goals:**
- 不改寫任何業務邏輯
- 不修改 SCSS 樣式
- 不升級依賴
- 不拆解 `script.ts`（優先度較低，留待後續）

## Decisions

### D1：模組拆分邊界

參照 adventure-map 模式，按「資料流方向」切割，而非按「功能名稱」：

```
src/tools/place-helper/
├── state.ts      # 全域狀態型別定義 + 初始值 export
├── form.ts       # buildEntry() + 表單欄位讀取輔助函式
├── file-store.ts # pickFile() + generateAndWrite() + deletePlace()
├── photo.ts      # addPhotos() + renderPreviews() + clearPhotoSelection()
├── mgmt.ts       # switchMode() + loadPlacesForMgmt() + renderMgmtList() + loadForEdit()
├── persist.ts    # openDB() + storeHandle() + tryRestoreHandles() + verifyPermission()
├── geocoder.ts   ✓ 已存在
├── map.ts        ✓ 已存在
├── ui.ts         ✓ 已存在
└── main.ts       # 入口：DOMContentLoaded + setupEventListeners() + window 綁定
```

**替代方案考量：** 按「模式」切割（service / controller / view）過度工程化，對此工具規模不適合。按資料流較直觀。

### D2：全域狀態共享策略

選擇 **共享 state module**，而非 class 封裝或 context pattern。

理由：
- 工具是單頁面應用，無 component tree
- class 封裝需要大量 this 傳遞，增加複雜度
- 所有模組 import 相同 state 物件，直接 mutate

```typescript
// state.ts
export const state = {
  selCat: 'food',
  selSt: 'pending' as 'pending' | 'done',
  selRate: 0,
  selSeasons: [] as string[],
  currentVisits: [] as Visit[],
  fileHandle: null as unknown,
  imgDirHandle: null as unknown,
  selectedPhotos: [] as PhotoItem[],
  cachedPlaces: [] as PlaceEntry[],
  editingId: null as number | null,
};
```

**型別處理：** File System API 無原生 TypeScript 型別，使用 `unknown` 並在使用處做 type assertion，比到處用 `any` 更安全。

### D3：window 綁定保留策略

HTML 模板中的 `onclick="loadForEdit(id)"` 等 inline handler 依賴 `window.*` 綁定，**不改動**。

main.ts 仍在 `setupEventListeners()` 中集中做 window 綁定：
```typescript
(window as any).loadForEdit = loadForEdit; // from mgmt.ts
(window as any).deletePlace = deletePlace; // from file-store.ts
```

理由：改動 HTML 模板超出本次重構範圍，且會造成不必要風險。

### D4：Hugo partial 抽取

`layouts/partials/case-master-modal.html` 放在根層級 `layouts/partials/`（非 theme），與現有 `sidebar.html`、`footer.html` 一致，允許 Hugo 優先使用根層覆蓋 theme。

## Risks / Trade-offs

| 風險 | 緩解策略 |
|------|---------|
| 循環 import（mgmt.ts ↔ file-store.ts 共用 fileHandle） | 兩者均從 state.ts import，不互相引用 |
| `unknown` 型別 handle 需要 type assertion | 集中於 persist.ts 和 file-store.ts，加 TODO 註解說明 |
| Hugo partial 路徑優先順序 | 放在根 layouts/partials/ 優先於 theme，符合 Hugo 覆蓋規則 |

## Migration Plan

1. 建立新模組（state → persist → form → photo → file-store → mgmt）
2. main.ts 改為 import 並組裝
3. 驗證 vite build 無錯誤
4. 抽取 modal partial
5. 驗證 `hugo server` 頁面正常顯示

**Rollback：** 所有變更在同一 git branch，直接 `git checkout` 還原。

## Open Questions

- File System API 的 `FileSystemFileHandle` / `FileSystemDirectoryHandle` 是否需要加 `lib.dom.d.ts` 擴充型別？（建議 tasks 中加一個型別檢查步驟）
