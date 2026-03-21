## Why

`src/tools/place-helper/main.ts`（726 行）與 `themes/liva-hugo/layouts/about/list.html`（489 行）已成為難以維護的巨石代碼。前者混雜五種關注點（狀態、CRUD、相片、持久化、UI），後者將一個 230 行的 Bootstrap modal 內嵌於頁面模板中。這與專案中 adventure-map 的良好模組化形成對比，應統一風格。

## What Changes

- **拆解 `main.ts`**：將 726 行的全能入口拆分為 6 個單一職責模組（state / form / file-store / photo / mgmt / persist），main.ts 精簡為純初始化入口（~60 行）
- **抽取 modal partial**：將 `about/list.html` 中的 `#caseMasterModal`（L259–L489）抽取為獨立 partial `layouts/partials/case-master-modal.html`，並以 `{{ partial }}` 替換

## Capabilities

### New Capabilities

- `place-helper-modules`: place-helper 工具的模組化結構，包含 state、form、file-store、photo、mgmt、persist 六個子模組
- `about-page-partials`: about 頁面的 partial 拆分結構，modal 獨立為可複用 partial

### Modified Capabilities

<!-- 無 spec 層級的行為變更，純結構重構 -->

## Impact

- `src/tools/place-helper/` — 新增 6 個 .ts 模組，main.ts 縮減至 ~60 行
- `themes/liva-hugo/layouts/about/list.html` — 縮減至 ~260 行
- `layouts/partials/case-master-modal.html` — 新增
- vite.config.ts 入口點不變（仍為 main.ts）
- 無 API 變更、無 Hugo 設定變更、無功能行為變更
