# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案本質

**定康筆記（Tom's Note）** 是以 Hugo 為核心的個人知識庫，涵蓋法式料理筆記、不動產分析、自動化開發記錄等主題，同時掛載 Leaflet 互動地圖（破關地圖）與純工具頁（房地稅務試算）。

---

## 技術堆疊

| 技術 | 版本 | 用途 |
| --- | --- | --- |
| **Hugo Extended** | `v0.127.0` | 靜態網站產生器（本地執行用 `./hugo.exe`） |
| **Theme: liva-hugo** | — | 基礎佈局主題，覆寫於 `layouts/` |
| **TypeScript** | — | 互動功能腳本，原始碼在 `src/` |
| **Vite** | `^8` | TypeScript 打包，設定於 `vite.config.ts` |
| **Yarn** | — | 套件管理（**禁止使用 npm install**） |
| **Supabase** | `@supabase/supabase-js` | 破關地圖的即時資料後端（地點、分類皆存於此，非靜態檔） |
| **Netlify** | Hugo `0.87.0` | 主部署平台 |
| **GitHub Pages** | Hugo `0.127.0` | push 到 main 由 GitHub Actions 自動 build 並部署至 `tomisagoodguy.github.io` |

> ⚠️ **Hugo 版本不一致**：本地與 GitHub Actions 都用 `0.127.0`，只有 **Netlify** 是 `0.87.0`。為保 Netlify 相容，避免使用 0.87.0 之後才加入的 Hugo 功能。

---

## 常用指令

### 本地開發

```bash
./hugo.exe server -D          # 啟動本地預覽（含草稿）
./hugo.exe --minify --gc      # 建置輸出至 public/
```

### TypeScript 建置

```bash
yarn                          # 安裝套件
yarn dev                      # Vite 開發模式
yarn build                    # 打包（輸出至 static/，見下方說明）
yarn build:log                # 打包並存 log → logs/vite-build.log
yarn hugo:log                 # Hugo 建置 log → logs/hugo-build.log
```

> `logs/` 已被 `.gitignore` 排除。遇到 build 錯誤時，先執行對應指令產生 log，再讓 Claude 讀取 `logs/` 下的檔案。

### 型別檢查

專案**沒有 `tsconfig.json`**，`npx tsc --noEmit -p .` 會直接報 TS5057 失敗（不是「沒錯誤」）。要指定入口檔：

```bash
npx tsc --noEmit --strict --target es2020 --module esnext --moduleResolution bundler --lib es2020,dom,dom.iterable --skipLibCheck src/apps/adventure-map/index.ts
```

### 發布至 GitHub Pages

push 到 `main` 即由 GitHub Actions（`.github/workflows/deploy.yml`）自動以 Hugo 0.127.0 build 並部署到 `tomisagoodguy.github.io`，**無需手動操作**。

```bat
deploy.bat                    # 便利包裝：git add → commit → push（最後仍由 GHA 自動部署）
```

---

## 架構概覽

### 破關地圖的資料流（關鍵，已改為 Supabase 即時後端）

地點與分類資料**不再**存於 `data/places.json`（此檔已移除），改由 Supabase 提供：

1. `layouts/adventure-map/list.html` — 在 `<head>` 注入 `window.DATING_MAP_SUPABASE_URL` / `window.DATING_MAP_SUPABASE_KEY`（anon/publishable key，設計上可公開，非機密）
2. `src/apps/adventure-map/supabase.ts` — 建立 Supabase client，提供 `fetchPlaces` / `proposePlace` / `updatePlace` / `deletePlace` / `toggleLike` / `fetchCategories` / `upsertCategory` / `deleteCategory`，並用 `subscribeToPlaces` / `subscribeToCategories` 做即時同步（Realtime）
3. `src/apps/adventure-map/index.ts` — 組合資料存取與 `ui.ts` 的面板渲染

新增/修改地點是**資料庫操作**（透過破關地圖頁面上的表單），不是改 JSON 檔。

**行程懶人包**（「📚 懶人包」分頁，別人分享的一日路線）存在兩張表：

| 資料表 | 內容 |
| --- | --- |
| `dating_map_guides` | 一條路線：標題、摘要、地區、來源（`source` / `source_url`）、標籤、`sort_order` |
| `dating_map_guide_stops` | 路線的每一站：`seq` 站序、`place_id` → `dating_map_places`（單一座標）、`time_text`、`transit`（到這站的交通）、`tip` |

- 每一站**只對應一個地點**；「台北花市、建國花市」這種多地點寫法要拆成多筆 `dating_map_places` 再連結
- `place_id` 為 `null` 代表沒有固定地點的步驟（例如「約在捷運站」）
- 兩張表只開放 `SELECT`（RLS），內容目前由 Supabase SQL 直接寫入，前端沒有編輯介面
- 「📅 照這個排行程」會把各站地點依 `seq` 定案到同一天（寫入 `visit_date` + `sort_order`），已在行程中的地點跳過

`place-helper` 工具頁（`src/tools/place-helper/`）是獨立的地點資料產生輔助工具，透過 File System Access API 直接讀寫本機檔案，**不連接 Supabase**。

### Vite 打包輸出路徑（`yarn build` 後的結果）

| 入口 | 輸出位置 |
| --- | --- |
| `src/apps/adventure-map/index.html` | `static/js/adventure-map.bundle.js` + `static/css/adventure-map.bundle.css` |
| `src/tools/place-helper/place-helper.html` | `static/tools/place-helper.html` |
| 共用 JS chunks | `static/assets/` |

Leaflet / MarkerCluster 以 `external` 方式排除，頁面直接從 CDN 載入（見 `layouts/adventure-map/list.html`）。

### layouts/ 覆寫規則

`layouts/` 下的檔案優先於 `themes/liva-hugo/` 中的同名檔案，**永遠不要直接修改 `themes/`**。

| 檔案 | 用途 |
| --- | --- |
| `layouts/partials/head.html` | 全站 `<head>`，注入自訂 CSS/JS |
| `layouts/partials/home-*.html` | 首頁各區塊（hero、slider、categories） |
| `layouts/partials/sidebar.html` | 側欄 |
| `layouts/adventure-map/list.html` | 破關地圖完整頁面模板 |
| `layouts/index.html` | 首頁主模板 |

### data/ 資料檔

| 檔案 | 用途 |
| --- | --- |
| `data/gallery.yml` | 圖庫資料 |
| `data/links.yml` | 相關連結頁資料 |

> 破關地圖地點**不在**這裡，已改存 Supabase（見上方資料流說明）。

### src/ 模組說明

```text
src/
├── apps/adventure-map/     # 破關地圖（Leaflet + MarkerCluster + Supabase）
│   ├── data.ts             # 分類設定（CATEGORY_CONFIG）
│   ├── supabase.ts         # Supabase client、CRUD、Realtime 訂閱、懶人包讀取（fetchGuides）
│   ├── ui.ts               # 面板 UI 邏輯（面板、懶人包時間軸、Modal、Toast）
│   └── index.ts            # 入口，組合各模組
├── tools/place-helper/     # 地點資料產生輔助工具（獨立 HTML 頁，不連 Supabase）
│   ├── geocoder.ts         # 地址轉座標
│   ├── persist.ts / file-store.ts  # File System Access API 本機讀寫
│   ├── mgmt.ts             # 地點管理（編輯/刪除既有紀錄）
│   └── main.ts             # 入口
└── shared/
    └── types.ts            # PlaceEntry 等共用型別
```

---

## 內容撰寫規範

### Lifestyle 文章結構

每篇文章放在 `content/lifestyle/<文章名稱>/`，圖片與 `index.md` 同層：

```yaml
---
title: "文章標題"
date: 2026-03-28T00:00:00+08:00
description: "一句話摘要"
type: "lifestyle"
image: "成品.jpg"       # 封面圖（同資料夾檔名）
categories:
  - "法式料理"
tags:
  - "主菜"
---
```

### 圖片嵌入

```markdown
![圖片說明](檔案名稱.jpg)          # ✅ 正確：相對路徑
{{< figure src="..." >}}           # ❌ 禁止：此主題不支援
```

### Markdown 表格

pipe 左右必須有空格，separator 使用 `---`：

```markdown
| 食材 | 數量 |
| --- | --- |
| 鴨胸 | 3 塊 |
```

---

## 開發限制

| ❌ 禁止 | ✅ 正確 |
| --- | --- |
| 修改 `themes/liva-hugo/` | 在 `layouts/` 建立同名檔案覆寫 |
| `npm install` | `yarn` |
| 把圖片放 `static/` 再用相對路徑引用 | 圖片與 `index.md` 放同一資料夾 |
| 建立備份檔（`_old.md`、`.bak`） | 直接修改原檔，版控用 git |
| 使用 Hugo 0.88+ 新功能 | 確認 Netlify 上 0.87.0 相容 |
| 移除 `list.html` 裡 bundle 網址的 `?v={{ $assetVersion }}` | 保留：GitHub Pages 對 CSS/JS 設 `max-age=600` 且 bundle 檔名固定，拿掉後部署完瀏覽器會吃舊版 |

### 破關地圖常見錯誤

- **大量匯入資料後要用真實數量看 UI**：願望清單曾因 `.adv-row-list { overflow: hidden }` 蓋掉 `.adv-card-list` 的捲動，300+ 筆時桌面版被裁掉；資料寫入成功 ≠ 畫面可用
- **驗證正式站要繞過快取**：HTML 本身也快取 10 分鐘；用 `curl` 看 `Age` / `X-Cache` 標頭，瀏覽器測試前先清快取（Ctrl + Shift + R）
- **補座標**：用**店名**查 → Google Maps MCP `maps_search_places`（Places 可用，小店命中率高）；已有**門牌地址** → ArcGIS `findAddressCandidates`（`Addr_type=PointAddress` 很準）。Google Maps MCP 的 Geocoding 未啟用；ArcGIS／Nominatim 拿店名查多半查不到或落點錯，結果都要用台北／台中經緯度框與行政區核對
- **SQL 寫入新資料列不要指定 `id`**：`id` 是 `GENERATED ALWAYS` identity；曾因手動指定 id 匯入導致序列落後 200 號、前端提案撞 PK。若又不同步，用 `select setval(pg_get_serial_sequence('<表>','id'), (select max(id) from <表>))` 校正
- **Google Maps 短網址**：`maps.app.goo.gl` 轉址後的 `q=` 參數帶完整地址（如「永康街6巷5號」），取出地址查門牌比直接解析座標可靠

---

## Active Status

- **最後更新**：2026-10-18
- **已知問題**：無
