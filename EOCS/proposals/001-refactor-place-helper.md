---
title: OpenSpec - 001: Refactor Place Helper Tool
author: Antigravity
status: Proposal
date: 2026-03-16
---

# 📝 OpenSpec - 001: Refactor Place Helper Tool

## 1. 背景 (Background)
目前的 `static/tools/place-helper.html` 是一個超過 1300 行的巨石代碼 (Monolithic Code)，包含了 HTML、CSS 與 JavaScript 邏輯。這導致維護困難，且缺乏類型檢查與模組化。

## 2. 目標 (Goals)
- **關注點分離 (SoC)**：將 HTML、CSS 與 JS 分離到獨立檔案。
- **TypeScript 遷移**：使用 TypeScript 改寫 JS 邏輯，提升型別安全性與開發體驗。
- **現代化構建**：引入 Vite 作為小型工具的開發與構建工具。
- **改進可維護性**：透過拆分模組（如：API 處理、地圖邏輯、UI 更新）來優化架構。

## 3. 提案內容 (Proposal)

### 3.1 目錄結構 (Directory Structure)
```text
/
├── src/
│   └── tools/
│       └── place-helper/
│           ├── main.ts         # 進入點
│           ├── types.ts        # 型別定義
│           ├── styles.css      # 樣式
│           ├── geocoder.ts     # ArcGIS & Nominatim 邏輯
│           ├── map.ts          # Leaflet 地圖邏輯
│           └── ui.ts           # DOM 操作與 UI 更新
├── static/
│   └── tools/
│       └── place-helper.html   # 簡化後的 HTML
└── package.json                # 專案依賴與腳本
```

### 3.2 技術細節 (Technical Details)
- **前端框架**：不使用大型框架，保持原生速度，但使用 TypeScript。
- **構建工具**：使用 `vite` 進行開發 (HMR) 且構建出 `static/tools/dist/` 目錄，或直接編譯到 `static/tools/js/`。
- **類型定義**：
  - 定義 `PlaceEntry` 介面。
  - 定義 ArcGIS / Nominatim API 的 Response 型別。

### 3.3 執行步驟 (Implementation Plan)
1. **初始化腳本環境**：
   - 建立 `package.json`。
   - 安裝 `typescript`, `vite`, `leaflet`, `@types/leaflet`。
2. **樣式提取**：將 CSS 移至 `src/tools/place-helper/styles.css`。
3. **邏輯拆分與重構**：
   - 建立 `types.ts` 定義 `Place` 介面與 `Visit` 介面。
   - 建立 `geocoder.ts` 封裝 API 請求。
   - 建立 `map.ts` 初始化與管理地圖。
   - 建立 `main.ts` 作為調度中心。
4. **HTML 更新**：修改 `static/tools/place-helper.html` 以引用構建後的資源。
5. **驗證**：確保檔案讀取 (FileSystem API)、搜尋與地圖功能正常。

## 4. 風險評估 (Risk Assessment)
- **FileSystem API 相容性**：需確保在本地開發環境與正式環境的運作一致。
- **依賴管理**：引入 Node.js 環境後，需確保 Hugo Deployment 流程不會受影響（構建後的產物應被視為靜態資源）。

## 5. 結論 (Conclusion)
透過此重構，我們將原本難以維護的巨石代碼轉變為現代化的前端專案結構，大幅提升代碼質量與未來擴展性。
