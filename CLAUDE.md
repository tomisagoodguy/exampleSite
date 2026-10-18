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
./hugo.exe server -D --port 1314 --baseURL http://localhost:1314/   # 1313 被占用時
```

> 換 port 一定要同時給 `--baseURL`：`list.html` 用 `absURL` 載 bundle，會指向 `localhost:1313`，跨 port 被 CORS 擋下，地圖整頁空白、沒有任何卡片。

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

> 在 **PowerShell** 執行時 `--lib` 要加引號：`--lib "es2020,dom,dom.iterable"`，否則逗號會被拆成陣列，報 TS6046。

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

**地點分類與屬性**（`dating_map_places`，2026-10-18 由 19 類整併）：

| 欄位 | 合法值 | 說明 |
| --- | --- | --- |
| `category` | `food` 吃、`cafe` 咖啡甜點、`shop` 逛街、`walk` 城市散步、`museum` 展覽文化、`diy` 體驗玩樂、`scenery` 自然風景、`stay` 住宿、`quest` 破關任務（目前 0 筆，分類保留） | 只回答「去那裡做什麼」；定義在 `data.ts` 的 `CATEGORY_CONFIG`，宣告順序＝篩選列順序 |
| `region` | `north` 北北基、`tzm` 桃竹苗、`taichung` 台中、`central_south` 中南部、`east` 宜花東、`islands` 離島（澎金馬、小琉球、綠島、蘭嶼） | 無座標時為 `null` |
| `is_indoor` | `true` / `false` | 「☔ 雨天可去」篩選 |

- 夜市→`food`、老店/商圈→`shop`、廟宇→`museum`、公園→`walk`、步道→`scenery`、室內運動→`diy`；距離遠近用 `region` 表示，不另設「一日遊」分類
- 地區篩選按鈕只顯示**有地點**的地區；新增地區（例如 `islands`）要先有地點標上該 `region`，按鈕與介紹卡才會出現
- 選了地區篩選時頂部會出現地區介紹卡（一句話、代表美食、交通、去過幾個），文字寫死在 `data.ts` 的 `REGION_INFO`；新增地區要同時補這裡與 `REGION_LABEL`
- 新增時若沒給 `region` / `is_indoor`，trigger `dating_map_places_fill_attrs` 會依座標（`dating_map_guess_region` 矩形框，邊界附近不準）與分類補預設值；大批匯入應自行用 ArcGIS `reverseGeocode` 反查縣市後寫入
- 前端修改這兩個欄位走獨立 RPC `dating_map_set_attrs`（`setPlaceAttrs`），沒有改 `dating_map_update` 的參數簽章

**行程懶人包**（「📚 懶人包」分頁，別人分享的一日路線）存在兩張表：

| 資料表 | 內容 |
| --- | --- |
| `dating_map_guides` | 一條路線：標題、摘要、地區、來源（`source` / `source_url`）、標籤、`seasons`、`sort_order` |
| `dating_map_guide_stops` | 路線的每一站：`seq` 站序、`place_id` → `dating_map_places`（單一座標）、`time_text`、`transit`（到這站的交通）、`tip`、`must_try`（必點／必做）、`cost`（大約花費，文字） |

- 每一站**只對應一個地點**；「台北花市、建國花市」這種多地點寫法要拆成多筆 `dating_map_places` 再連結
- `place_id` 為 `null` 代表沒有固定地點的步驟（例如「約在捷運站」）
- `seasons text[]` 只接受 `spring` / `summer` / `autumn` / `winter`（CHECK 約束），**空陣列代表全年皆宜**；前端季節篩選列選某季只顯示有標該季的路線，「全年皆宜」另成一顆。只標季節性明顯的路線（芒花、玩水、泡湯），不要每條都標
- 兩張表只開放 `SELECT`（RLS），內容目前由 Supabase SQL 直接寫入，前端沒有編輯介面
- `must_try` / `cost` **只填來源原文有寫的**，不要自己估價；填了就別在 `tip` 重複同一句
- 「🔊 聽導覽」用瀏覽器 Web Speech API（`voice.ts`）逐站朗讀，朗讀稿由 `ui.ts` 的 `guideSpeechSegments` 組出；emoji 會先濾掉、`→` 念成「到」
- 「📅 照這個排行程」會把各站地點依 `seq` 定案到同一天（寫入 `visit_date` + `sort_order`），已在行程中的地點跳過

**旅行成就**（「🏆 成就」分頁，清單改編自 [ivanusto/taiwan-travel-achievement-list](https://github.com/ivanusto/taiwan-travel-achievement-list)，MIT）：

| 資料表 | 內容 |
| --- | --- |
| `dating_map_achievements` | 一項成就：`category`（`nature` 自然／`photo` 攝影／`festival` 祭典／`island` 離島）、`title`、`emoji`、`difficulty` 1–5、`when_text`（何時去）、手動解鎖紀錄 `done_date` / `done_by` / `done_note` |
| `dating_map_achievement_places` | 成就 ↔ 地點多對多連結（`achievement_id`, `place_id`） |

- **解鎖規則（前端 `achievementUnlock` 判斷）**：`done_date` 有值（手動打勾），**或**任一連結地點 `status = 'done'`；所以地點標記「已去過」會自動解鎖成就，祭典這類沒有固定地點的只能手動
- 前端寫入只走 RPC `dating_map_set_achievement`（`p_done=false` 清除手動紀錄）；新增成就、調整連結目前用 SQL 直接寫
- 分類徽章門檻與稱號定義在 `data.ts` 的 `ACHIEVEMENT_CATEGORY` / `ACHIEVEMENT_TITLES`；新增成就分類要同時改這裡與資料表的 CHECK 約束

**自動補座標**：頁面上「新增提案」與「修改地點」（原本無座標或地址有改）送出前，`geocode.ts` 會先用地址、再用店名查 ArcGIS `findAddressCandidates`，**分數 ≥ 90 且落在台灣範圍內**才寫入 `lat` / `lng`（`region` 由 trigger 跟著重算）；查不到照常存檔，toast 會提示「找不到座標」。門牌、公園、商圈命中率高，小店名與「捷運○○站」多半查不到，需事後用下方「補座標」方式處理。

### Vite 打包輸出路徑（`yarn build` 後的結果）

| 入口 | 輸出位置 |
| --- | --- |
| `src/apps/adventure-map/index.html` | `static/js/adventure-map.bundle.js` + `static/css/adventure-map.bundle.css` |
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
│   ├── data.ts             # 分類設定（CATEGORY_CONFIG）、地區名稱與介紹（REGION_LABEL / REGION_INFO）
│   ├── supabase.ts         # Supabase client、CRUD、Realtime 訂閱、懶人包（fetchGuides）與成就（fetchAchievements）讀取
│   ├── geocode.ts          # 提案／編輯時以 ArcGIS 自動補座標
│   ├── voice.ts            # 懶人包語音導覽（Web Speech API，逐段朗讀＋目前站狀態）
│   ├── ui.ts               # 面板 UI 邏輯（面板、懶人包時間軸、成就徽章、Modal、Toast）
│   └── index.ts            # 入口，組合各模組
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
- **大批景點補座標（全台、上百筆）**：Google Maps MCP 連續大量查詢會把配額用盡（回 `API quota exceeded`），後續改 ArcGIS（`countryCode=TWN`、`langCode=zh`，景點／山／瀑布命中率高）→ 查不到再用 Nominatim（`countrycodes=tw`，每秒 1 次）。**要用 Python `urllib` 呼叫**，Git Bash 的 `curl --data-urlencode` 會把中文編碼成 cp950 而查無結果。同名景點很多（火炎山、北回歸線標誌、金剛大道、白沙灣），每筆都要核對縣市／鄉鎮。**ArcGIS 分數 100 也會錯**：曾把傳藝中心定位到高雄、莒光樓到高雄同名地、Xpark 偏 4 公里；`Addr_type=Locality`（只命中鄉鎮）的結果一律改用 Google Places 重查
- **SQL 寫入新資料列不要指定 `id`**：`id` 是 `GENERATED ALWAYS` identity；曾因手動指定 id 匯入導致序列落後 200 號、前端提案撞 PK。若又不同步，用 `select setval(pg_get_serial_sequence('<表>','id'), (select max(id) from <表>))` 校正
- **匯入地點不要用舊分類 key**：`outdoor`、`indoor`、`night_market`、`park`、`temple`、`oldshop`、`shopping`、`hiking`、`daytrip`、`indoor_sport` 已廢除，寫入後篩選列會直接顯示英文 key。匯入後用 `select category, count(*) from dating_map_places group by 1` 確認只剩上表的合法值
- **Google Maps 短網址**：`maps.app.goo.gl` 轉址後的 `q=` 參數帶完整地址（如「永康街6巷5號」），取出地址查門牌比直接解析座標可靠

---

## Active Status

- **最後更新**：2026-10-18
- **已知問題**：無
