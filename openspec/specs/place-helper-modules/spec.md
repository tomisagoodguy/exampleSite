## ADDED Requirements

### Requirement: state module
`src/tools/place-helper/state.ts` SHALL export a single mutable `state` object，包含所有原 main.ts 全域變數，並提供對應的 TypeScript 型別。

#### Scenario: state object is importable
- **WHEN** 任意模組 import `{ state }` from `./state`
- **THEN** 可直接讀寫 state.selCat、state.fileHandle 等屬性，無需傳遞參數

#### Scenario: File System handles typed as unknown
- **WHEN** state.fileHandle 或 state.imgDirHandle 被存取
- **THEN** 型別為 `unknown`，不得為 `any`

---

### Requirement: form module
`src/tools/place-helper/form.ts` SHALL export `buildEntry()` 函式，從 DOM 讀取表單欄位並組裝 `PlaceEntry` 物件。

#### Scenario: valid form returns PlaceEntry
- **WHEN** 表單所有必填欄位（name、lat、lng）皆有值
- **THEN** `buildEntry()` 回傳完整的 `PlaceEntry` 物件

#### Scenario: missing name returns null
- **WHEN** f-name 欄位為空
- **THEN** `buildEntry()` 呼叫 `toast('請填寫地點名稱')` 並回傳 `null`

#### Scenario: missing coordinates returns null
- **WHEN** f-lat 或 f-lng 為 NaN
- **THEN** `buildEntry()` 呼叫 `toast(...)` 並回傳 `null`

---

### Requirement: file-store module
`src/tools/place-helper/file-store.ts` SHALL export `pickFile()`、`generateAndWrite()`、`deletePlace()` 三個函式，負責 File System API 操作與 places.json CRUD。

#### Scenario: pickFile opens file picker
- **WHEN** 呼叫 `pickFile()`
- **THEN** 開啟 JSON 檔案選擇器，成功後更新 state.fileHandle 並更新 UI 狀態顯示

#### Scenario: generateAndWrite appends new entry
- **WHEN** `editingId` 為 null 且 `buildEntry()` 回傳有效物件
- **THEN** 新條目追加至 places.json 陣列並寫入磁碟

#### Scenario: generateAndWrite updates existing entry
- **WHEN** `state.editingId` 不為 null
- **THEN** 以相同 id 覆蓋 places.json 中的對應條目

#### Scenario: deletePlace removes entry
- **WHEN** 使用者確認刪除指定 id 的地點
- **THEN** 該條目從 places.json 中移除並重新寫入磁碟

---

### Requirement: photo module
`src/tools/place-helper/photo.ts` SHALL export `addPhotos()`、`renderPreviews()`、`clearPhotoSelection()` 三個函式，管理相片選取與預覽。

#### Scenario: addPhotos appends to selectedPhotos
- **WHEN** 使用者透過檔案選擇器選取一或多張圖片
- **THEN** 每張圖片以 `{ handle, file, previewUrl }` 結構推入 `state.selectedPhotos`，並呼叫 `renderPreviews()`

#### Scenario: clearPhotoSelection frees object URLs
- **WHEN** 呼叫 `clearPhotoSelection()`
- **THEN** 所有 `previewUrl` 透過 `URL.revokeObjectURL()` 釋放，`state.selectedPhotos` 清空

---

### Requirement: mgmt module
`src/tools/place-helper/mgmt.ts` SHALL export `switchMode()`、`loadPlacesForMgmt()`、`renderMgmtList()`、`loadForEdit()` 四個函式，管理管理介面的 UI 狀態與清單渲染。

#### Scenario: switchMode toggles panels
- **WHEN** 呼叫 `switchMode('mgmt')`
- **THEN** add-panel 隱藏，mgmt-panel 顯示，tab 狀態對應更新

#### Scenario: renderMgmtList filters by keyword
- **WHEN** mgmt-filter 欄位有輸入值
- **THEN** 清單只顯示名稱包含該關鍵字的地點

#### Scenario: loadForEdit populates form
- **WHEN** 呼叫 `loadForEdit(id)` 且 id 存在於 cachedPlaces
- **THEN** 表單所有欄位填入對應地點資料，並切換至 add 模式

---

### Requirement: persist module
`src/tools/place-helper/persist.ts` SHALL export `openDB()`、`storeHandle()`、`tryRestoreHandles()`、`verifyPermission()` 四個函式，管理 IndexedDB handle 持久化。

#### Scenario: storeHandle saves to IndexedDB
- **WHEN** 呼叫 `storeHandle(key, handle)`
- **THEN** handle 儲存至 PlaceHelperDB 的 handles store

#### Scenario: tryRestoreHandles restores on load
- **WHEN** 頁面載入且 IndexedDB 中存有先前的 fileHandle
- **THEN** 若 permission 已授權，自動還原 state.fileHandle 並更新 UI

#### Scenario: verifyPermission returns false without prompt
- **WHEN** 呼叫 `verifyPermission(handle)` 且 queryPermission 非 'granted'
- **THEN** 回傳 `false`，不主動請求授權

---

### Requirement: main.ts as entry point
重構後的 `src/tools/place-helper/main.ts` SHALL 僅作為初始化入口，不含業務邏輯。

#### Scenario: main.ts imports and delegates
- **WHEN** 頁面 DOMContentLoaded 事件觸發
- **THEN** main.ts 呼叫各模組的初始化函式並完成 window 綁定，自身不包含任何業務邏輯函式

#### Scenario: main.ts line count
- **WHEN** 重構完成
- **THEN** main.ts 行數 SHALL 不超過 80 行
