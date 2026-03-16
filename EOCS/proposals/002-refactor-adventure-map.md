# Proposal: 冒險地圖核心邏輯重構 (TypeScript & 模組化)

## 背景 (Background)
目前的「冒險地圖」核心邏輯存放於 `static/js/adventure-map.js`。隨著功能的增加（例如：分頁、過濾、Visit 紀錄、分享連結功能），該檔案已逐漸演變成「巨石代碼 (Monolith)」，缺乏型別安全且邏輯高度耦合，難以進行單元測試與長期維護。

## 目標 (Goals)
1.  **型別安全**: 將 JavaScript 遷移至 TypeScript，確保 `places.json` 資料結構的一致性。
2.  **模組化**: 拆分地圖引擎、UI 渲染、資料處理與搜尋邏輯。
3.  **效能優化**: 利用 Vite 進行建置，移除全域變數汙染，並過時的程式碼片段。
4.  **共用資產**: 與 `place-helper` 共用 `types.ts` 等定義，確保管理端與展示端同步。

## 提議架構 (Proposed Architecture)

### 目錄結構
```text
src/
└── apps/
    └── adventure-map/
        ├── index.ts        # 進入點 (Entry Point)
        ├── engine.ts       # Leaflet 地圖底層邏輯
        ├── ui.ts           # 側邊欄、卡片渲染、微互動
        ├── data.ts         # JSON 獲取、篩選、搜尋邏輯
        ├── state.ts        # 全域狀態管理 (如果需要)
        └── styles/
            └── map.css     # 地圖專屬樣式 (從 static/css 遷移)
```

### 技術細節
- **建置工具**: 使用現有的 Vite 環境。
- **型別定義**: 引用 `src/tools/place-helper/types.ts`。
- **介接方式**: 維持 Hugo 的靜態整合，Vite 編譯後輸出至 `static/js/adventure-map.bundle.js`。

## 實施計畫 (Implementation Plan)

1.  **初始化**:
    - 在 `src/apps/adventure-map/` 建立目錄結構。
    - 在 `vite.config.ts` 中新增多入口配置。

2.  **邏輯拆解**:
    - **Step 1: Data & Types**: 抽離 JSON 獲取與 `places` 資料的過濾邏輯。
    - **Step 2: Map Engine**: 抽離 Leaflet 初始化、Marker 群組、座標飛入等邏輯。
    - **Step 3: UI Layer**: 抽離側邊欄模板、Carousel (Slick/Swiper) 整合、與 DOM 事件掛載。

3.  **整合與測試**:
    - 在開發環境 (`yarn dev`) 下驗證功能。
    - 執行 `yarn build` 並確認 `static/` 下的檔案正確更新。

4.  **清理**:
    - 刪除舊的 `static/js/adventure-map.js` (備份後刪除)。
    - 更新 `layouts/adventure-map/list.html` 或相關專頁以引用新的 Bundle。

## 風險評估 (Risk Assessment)
- **依賴破壞**: Slick Slider 等外部 jQuery 套件的整合需要小心處理。
- **路徑問題**: 圖片與靜態資源的相對路徑在 Bundle 後可能失效，需統一使用絕對路徑。

---
**核准後，我將開始執行第一階段：建立目錄與多入口配置。**
