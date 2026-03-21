## 1. 建立 place-helper 共享狀態模組

- [x] 1.1 建立 `src/tools/place-helper/state.ts`，定義並 export `PhotoItem` 型別與 `state` 物件（將 main.ts 的 8 個全域變數遷移，fileHandle/imgDirHandle 型別改為 `unknown`）

## 2. 建立 persist 模組（無外部依賴，先建）

- [x] 2.1 建立 `src/tools/place-helper/persist.ts`，遷移 `openDB()`、`storeHandle()`、`tryRestoreHandles()`、`verifyPermission()` 四個函式
- [x] 2.2 確認 `tryRestoreHandles()` 從 `state` import 並正確更新 state.fileHandle / state.imgDirHandle

## 3. 建立 form 模組

- [x] 3.1 建立 `src/tools/place-helper/form.ts`，遷移 `buildEntry()` 函式
- [x] 3.2 確認 `buildEntry()` 從 `state` import selCat、selSt、selRate、selSeasons、currentVisits、selectedPhotos、editingId

## 4. 建立 photo 模組

- [x] 4.1 建立 `src/tools/place-helper/photo.ts`，遷移 `addPhotos()`、`renderPreviews()`、`clearPhotoSelection()`
- [x] 4.2 在 photo.ts 中 export `removePhoto(i: number)` 供 window 綁定使用

## 5. 建立 file-store 模組

- [x] 5.1 建立 `src/tools/place-helper/file-store.ts`，遷移 `pickFile()`、`pickImgDir()`、`generateAndWrite()`、`deletePlace()`
- [x] 5.2 確認 file-store.ts 從 state import fileHandle/imgDirHandle，從 persist import storeHandle，從 photo import clearPhotoSelection，從 form import buildEntry

## 6. 建立 mgmt 模組

- [x] 6.1 建立 `src/tools/place-helper/mgmt.ts`，遷移 `switchMode()`、`loadPlacesForMgmt()`、`renderMgmtList()`、`loadForEdit()`
- [x] 6.2 在 mgmt.ts 中定義並 export `CAT_COLORS` 與 `CAT_LABELS` 常數
- [x] 6.3 確認 `loadForEdit()` 從 persist import storeHandle，從 state import 所有狀態，並呼叫 `renderVisitList()`（在 main.ts 或獨立函式中）

## 7. 精簡 main.ts

- [x] 7.1 清空 main.ts 業務邏輯，改為 import 所有模組並組裝
- [x] 7.2 `setupEventListeners()` 只做事件綁定（不含業務邏輯），從各模組 import 對應函式
- [x] 7.3 集中完成所有 `(window as any).xxx = xxx` 綁定
- [x] 7.4 確認 main.ts 行數 ≤ 80 行

## 8. TypeScript 編譯驗證

- [x] 8.1 執行 `npx tsc --noEmit`（或 vite build），確認無型別錯誤
- [x] 8.2 確認無 `any` 型別（File System API 的 `window as any` 例外，需加 comment 說明）

## 9. 建立 about 頁面 partial

- [x] 9.1 建立 `layouts/partials/case-master-modal.html`，內容為 `themes/liva-hugo/layouts/about/list.html` 中 L259–L489 的完整 modal HTML
- [x] 9.2 在 `themes/liva-hugo/layouts/about/list.html` 中，將 modal HTML 區塊（L259–L489）替換為 `{{ partial "case-master-modal.html" . }}`
- [x] 9.3 確認 `about/list.html` 行數少於 270 行

## 10. 功能驗收

- [x] 10.1 執行 `hugo server`，確認 about 頁面可正常顯示，modal 按鈕可開啟，modal 內容完整
- [x] 10.2 開啟 place-helper 工具頁面，確認搜尋、定位、新增地點、相片選取、管理清單功能均正常運作
- [x] 10.3 執行 `vite build`，確認 adventure-map 與 place-helper bundle 均無錯誤
