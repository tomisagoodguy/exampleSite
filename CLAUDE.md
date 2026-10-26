# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案本質

**定康筆記（Tom's Note）** 是以 Hugo 為核心的個人知識庫，涵蓋法式料理筆記、不動產分析、自動化開發記錄等主題，同時掛載破關地圖（約會／旅遊地點清單看板，Supabase 即時後端）與純工具頁（房地稅務試算）。

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

> `hugo server` 開著時跑 `yarn build`，livereload 會重新整理頁面，Playwright 先前抓到的 DOM 元素全部失效；rebuild 後要重新 navigate 再測。
>
> `hugo server` 是 Fast Render 模式：改了 `layouts/` 或 `yarn build` 換掉 bundle 後，**已開過的頁面不會重新產生**（curl 拿到的還是舊 HTML）。`touch` 該頁的內容檔（破關地圖是 `content/adventure-map/_index.md`）再看，或起 server 時加 `--disableFastRender`。`hugo server` 開著時 `yarn build` 偶爾會因檔案被鎖而失敗，再跑一次即可；但失敗過一次後 `hugo server` 常會卡在 sync，bundle 一直回 500（頁面像舊版或空白），要重開 server。
>
> 換 port 一定要同時給 `--baseURL`：`list.html` 用 `absURL` 載 bundle，會指向 `localhost:1313`，跨 port 被 CORS 擋下，地圖整頁空白、沒有任何卡片。
>
> 1313 已在跑**不代表 baseURL 是 1313**（可能是別的 session 用其他 baseURL 起的，曾指向 1414 導致整頁無樣式）。測試前先 `curl -s http://localhost:1313/adventure-map/ | grep -o 'href="[^"]*css[^"]*"'` 看 bundle 指向哪個 port，不對就自己開另一個 port＋`--baseURL`。

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

**進站要密碼（讀取也鎖）**：`dating_map_*` 六張表的 SELECT policy 都是 `(select dating_map_request_authorized())`，只認 header `x-dating-map-pass`（與寫入 RPC 同一組密碼，`dating_map_check_passphrase` 比對）。前端 `index.ts` `unlock()` 先驗密碼、`setReadPassphrase` 後由 `supabase.ts` 的自訂 `fetch` 每次帶上；沒帶 header 的查詢回 `[]` 而不是錯誤。用 curl／SQL 以外的方式驗資料時記得加這個 header。Realtime 收不到被鎖的表，改訂閱只記表名與時間的 `dating_map_sync`（statement trigger `dating_map_touch_sync` 寫入），收到後再重新讀取；新增要即時同步的表要補 trigger。

新增/修改地點是**資料庫操作**（透過破關地圖頁面上的表單），不是改 JSON 檔。

**地點分類與屬性**（`dating_map_places`，2026-10-18 由 19 類整併）：

| 欄位 | 合法值 | 說明 |
| --- | --- | --- |
| `category` | `food` 吃、`cafe` 咖啡甜點、`shop` 逛街、`walk` 城市散步、`museum` 展覽文化、`diy` 體驗玩樂、`scenery` 自然風景、`stay` 住宿、`quest` 破關任務（目前 0 筆，分類保留） | 只回答「去那裡做什麼」；定義在 `data.ts` 的 `CATEGORY_CONFIG`，宣告順序＝篩選列順序 |
| `region` | `north` 北北基、`tzm` 桃竹苗、`taichung` 台中、`central_south` 中南部、`east` 宜花東、`islands` 離島（澎金馬、小琉球、綠島、蘭嶼） | 無座標時為 `null` |
| `is_indoor` | `true` / `false` | 「☔ 雨天可去」篩選 |
| `area` | 縣市＋鄉鎮區，例如 `新北市瑞芳區`（`臺` 一律寫 `台`） | 願望清單分組用；無座標時為 `null` |

- 夜市→`food`、老店/商圈→`shop`、廟宇→`museum`、公園→`walk`、步道→`scenery`、室內運動→`diy`；距離遠近用 `region` 表示，不另設「一日遊」分類
- 地區篩選按鈕只顯示**有地點**的地區；新增地區（例如 `islands`）要先有地點標上該 `region`，按鈕與介紹卡才會出現
- 選了地區篩選時頂部會出現地區介紹卡（一句話、代表美食、交通、去過幾個），文字寫死在 `data.ts` 的 `REGION_INFO`；新增地區要同時補這裡與 `REGION_LABEL`
- 新增時若沒給 `region` / `is_indoor`，trigger `dating_map_places_fill_attrs` 會依座標（`dating_map_guess_region` 矩形框，邊界附近不準）與分類補預設值；大批匯入應自行用 ArcGIS `reverseGeocode` 反查縣市後寫入
- 前端修改這兩個欄位走獨立 RPC `dating_map_set_attrs`（`setPlaceAttrs`），沒有改 `dating_map_update` 的參數簽章
- `area` 走 RPC `dating_map_set_area`（`setPlaceArea`）。座標一變，trigger `dating_map_places_clear_area` 會把它清空，所以前端在 `updatePlace` **之後**才寫回；`geocode.ts` `lookupArea` 先取地址開頭的「縣市＋鄉鎮區」，沒有再用 ArcGIS `reverseGeocode`（`featureTypes=Postal`，預設的 POI 會回「九份」這種聚落名；Postal 只給到縣時改用 `Locality`）。市中心有些點 ArcGIS 只回縣市，大批補資料時改用 Nominatim reverse（`zoom=14`）
- **🗺️ 地圖選**（願望清單分組列最前面、懶人包篩選列「全部」右邊）：`countymap.ts` `renderCountyMap` 畫台灣縣市 SVG，依數量深淺上色，點縣市（或下方縣市按鈕列）選取、再點取消；縣市取 `area` 前三字。願望清單切到地圖選時取代出門成本分組，組內依鄉鎮區分；懶人包依各站地點的縣市篩，可與季節／場景／天數疊加，多日旅行一天命中就整趟留下。縣市形狀在 `taiwan-shape.ts`（`scripts/build-taiwan-shape.py` 由 taiwan-atlas 產生，勿手改；金門、馬祖平移放大到左上插圖框）
- **願望清單分組**（`data.ts` `IDEA_TIER` / `ideaTier()`，以台北為起點）：🚇 下班就能去＝北北基有填捷運站，或在台北市／新北捷運沿線區且不是 `scenery`；🚗 週末一日＝北北基其他＋桃竹苗；🧳 排趟旅行＝其餘地區；💡 活動點子＝`region` 為 `null`。組內再依 `area` 收合（`ui.ts` `groupIdeas`）：🧳 依縣市分，超過 30 筆的縣市（台中）改依鄉鎮區；💡 依分類分

**行程懶人包**（「📚 懶人包」分頁，別人分享的一日路線）存在兩張表：

| 資料表 | 內容 |
| --- | --- |
| `dating_map_guides` | 一條路線：標題、摘要、地區、來源（`source` / `source_url`）、標籤、`seasons`、`scenes`、`duration`、`trip_key`、`sort_order` |
| `dating_map_guide_stops` | 路線的每一站：`seq` 站序、`place_id` → `dating_map_places`（單一座標）、`time_text`、`transit`（到這站的交通）、`tip`、`must_try`（必點／必做）、`cost`（大約花費，文字） |

- 每一站**只對應一個地點**；「台北花市、建國花市」這種多地點寫法要拆成多筆 `dating_map_places` 再連結
- `place_id` 為 `null` 代表沒有固定地點的步驟（例如「約在捷運站」）
- `seasons text[]` 只接受 `spring` / `summer` / `autumn` / `winter`（CHECK 約束），**空陣列代表全年皆宜**；前端季節篩選列選某季只顯示有標該季的路線，「全年皆宜」另成一顆。只標季節性明顯的路線（芒花、玩水、泡湯），不要每條都標
- **新增懶人包必填 `scenes` 與 `duration`**，否則篩選時永遠不會出現：`scenes text[]` 只接受 `mountain` 山／`sea` 海／`city` 城鎮（可複選，農遊這類都不算就留空）；`duration` 只接受 `half` 半日／`day` 一日／`multi` 多日
- **多日旅行拆成每天一條**，各天填同一個 `trip_key`（例如 `hualien-3d`），`sort_order` 要連號；篩選時同趟只要一天符合就整趟顯示，卡片自動標「第 n／m 天」（依 `sort_order` 排）
- **同一天給兩條路線挑**：拆成兩條懶人包，標題寫「Day 3 路線 A：…」「Day 3 路線 B：…」（`data.ts` `guideDay()` 解析），卡片標「第 3／3 天・路線 A」，行程地圖各畫一條線、按鈕是「Day 3 A／B」；標題沒寫 `Day N` 的照 `sort_order` 第幾條算
- 懶人包篩選列是季節｜場景｜天數放在同一列（`ui.ts` `renderGuideFilterBar`），三組可疊加，再點一次已選的按鈕即取消。手機橫捲；桌面 ≥900px 改換行（`list.css` 與 `#adv-idea-tiers` 同一條 media query），橫捲會把頭尾按鈕截一半、看起來像跑版
- 圖卡上「N 條步道各自獨立」這種清單不是一日路線，依區域拆成幾條、摘要註明「挑 1–2 條走」，避免「照這個排行程」把全部排進同一天
- 兩張表只開放 `SELECT`（RLS），寫入走 RPC：`dating_map_save_guide`（`saveGuide`，`p_id` 為 `null` 時新增，各站以 `p_stops` jsonb 陣列**整組換掉**，陣列順序＝`seq`）、`dating_map_delete_guide`（`deleteGuide`，各站 CASCADE）。入口是懶人包標題列「＋ 提案懶人包」與卡片展開後的「✏️ 修改／🗑️ 刪除」（`ui.ts` `openGuideModal`）；網頁提案會記 `proposed_by`（卡片顯示「🙋 誰 提案」）。表單沒有 `tags` / `trip_key` / `sort_order`，修改時 RPC 保留原值，多日旅行仍要用 SQL 補 `trip_key`
- `must_try` / `cost` **只填來源原文有寫的**，不要自己估價；填了就別在 `tip` 重複同一句
- 「🔊 聽導覽」用瀏覽器 Web Speech API（`voice.ts`）逐站朗讀，朗讀稿由 `ui.ts` 的 `guideSpeechSegments` 組出；emoji 會先濾掉、`→` 念成「到」
- 「🎨 海報」的時程甘特由 `poster.ts` 的 `parseGanttRows` 解析 `time_text`：`10:00–12:30` 直接用、`09:00` 結束取下一站開始、`30–45 分`／`1.5 小時` 接在上一站後；「午餐」這類文字不畫長條。至少兩站解析得出時間才開放甘特，所以新寫入的 `time_text` 盡量用 `HH:MM` 或 `HH:MM–HH:MM`
- 「📅 照這個排行程」會把各站地點依 `seq` 定案到同一天（寫入 `visit_date` + `sort_order`），已在行程中的地點跳過

**旅行成就**（「🏆 成就」分頁，清單改編自 [ivanusto/taiwan-travel-achievement-list](https://github.com/ivanusto/taiwan-travel-achievement-list)，MIT）：

| 資料表 | 內容 |
| --- | --- |
| `dating_map_achievements` | 一項成就：`category`（`nature` 自然／`photo` 攝影／`festival` 祭典／`island` 離島）、`title`、`emoji`、`difficulty` 1–5、`when_text`（何時去）、手動解鎖紀錄 `done_date` / `done_by` / `done_note` |
| `dating_map_achievement_places` | 成就 ↔ 地點多對多連結（`achievement_id`, `place_id`） |

- **解鎖規則（前端 `achievementUnlock` 判斷）**：`done_date` 有值（手動打勾），**或**任一連結地點 `status = 'done'`；所以地點標記「已去過」會自動解鎖成就，祭典這類沒有固定地點的只能手動
- 前端寫入走三支 RPC：`dating_map_set_achievement` 手動解鎖（`p_done=false` 清除手動紀錄）；`dating_map_save_achievement`（`saveAchievement`，`p_id` 為 `null` 時新增）存名稱、分類、emoji、難度、何時去、說明，並把連結地點**整組換成** `p_place_ids`；`dating_map_delete_achievement`（`deleteAchievement`）刪除成就，連結由 `ON DELETE CASCADE` 跟著刪，地點不動
- 入口：「🎯 挑戰中」標題右側「＋ 新增成就」，以及每張成就卡片的「✏️ 修改／🗑️ 刪除」（成就牆也有）；表單是 `ui.ts` `openAchievementModal`，連結地點用名稱搜尋挑選
- 分類徽章門檻定義在 `data.ts` 的 `ACHIEVEMENT_CATEGORY`，稱號在 `ACHIEVEMENT_BOOKS`；新增成就分類要同時改這裡與資料表的 CHECK 約束
- **兩本冊子**（成就分頁頂部切換鈕，上次看的記在 localStorage `adv-ach-book`）：🧭 旅行成就＝`nature` / `photo` / `festival` / `island`；💑 一起的 100 件事＝`outing` 出走、`eat` 吃吃喝喝、`words` 書與文字、`music` 音樂、`play` 玩樂體驗、`talk` 心裡話、`quirky` 小怪點子（2026-10-26 匯入，`sort_order` ＝清單編號 1–100）。同一張表、同一套解鎖／成就牆／照片，分類的 `book` 欄位決定放哪本；稱號、進度、徽章各冊各算，分頁按鈕的數字是兩冊合計。100 件事的待完成清單照 `sort_order` 排，不比難度
- 100 件事只連結能一對一對上的地點（陽明山、擎天崗、九份老街、國家圖書館、美術館、花市、桌遊店、保齡球館…），「淡水看夕陽」這種去了不等於做到的不連結，靠手動打勾

**旅行介紹頁**（「✈️ 旅行」分頁，一趟一張卡片）存在 `dating_map_docs`：

| 欄位 | 內容 |
| --- | --- |
| `slug` | 主鍵，也是網址 `/adventure-map/<slug>/` |
| `title` / `date_text` / `summary` / `emoji` / `tags` / `sort_order` | 卡片顯示用 |
| `area_prefix` | 行程地圖顯示 `dating_map_places.area` 以此開頭的地點（例如 `台南市`）；`null` 就不出現地圖按鈕 |
| `html` | 完整介紹頁 HTML（含自己的 `<style>`／`<script>`），只在 slug 頁讀取，卡片不讀 |

- **讀取要密碼**：RLS 與其他 `dating_map_*` 表相同。`static/adventure-map/<slug>/index.html` 只是載入頁，**本身不含行程資料**；它沿用 localStorage `dating_map_passphrase`，以 `x-dating-map-pass` 讀出 `html` 後用 `document.write` 換掉整頁。**不要把行程 HTML 直接放進 `static/`**：那是公開檔，密碼擋不到，裡面有飯店和日期
- **網頁可新增／修改旅行卡片**（「✈️ 旅行」標題列「＋ 新增旅行」、卡片「✏️ 修改」，`ui.ts` `openTripModal`）：走 RPC `dating_map_save_doc`（`saveTrip`，`p_slug` 為 `null` 時新增，slug 自動產生成 `trip-YYMMDD-xxxx`），只存卡片欄位與 `area_prefix`，`html` 存空字串。`has_html`（generated 欄位）為 false 時卡片顯示「📝 介紹頁還沒寫」、沒有「📖 完整行程」，才有「🗑️ 刪除」（`dating_map_delete_doc` 會拒絕刪已有 `html` 的旅行）
- 補介紹頁：用 SQL 寫入該列的 `html`（沿用網頁產生的 slug），再把 `static/adventure-map/tainan-2026/` 複製成同名 slug 資料夾（載入頁從網址最後一段取 slug，不用改內容）；沒複製資料夾，「📖 完整行程」會 404
- **每趟旅行都有「📄 存 PDF／📝 文字檔」**（方便傳給別人或其他 AI）：`static/adventure-map/trip-export.js`，由載入頁在 `html` 後面引入，所以複製載入頁就自動有，**不用改資料庫的 `html`**。按鈕插在 `.topbar` 的夜間按鈕前（沒有 `.topbar` 就浮在右下角）；PDF 走瀏覽器列印，列印前自動切淺色、示意地圖切「全部」並跳過繪製動畫，每天換頁；文字檔是從 `.wrap` 轉出的 Markdown（含 Google 地圖連結與附近清單）。新旅行的 `html` 沿用 `.topbar` / `.seg button[data-day="0"]` / `#trip-map .route` 這些 class，匯出才會完整
- 行程地圖（卡片「🗺️ 行程地圖」，`tripmap.ts`）以這趟懶人包各站為中心：行程站＝`source_url` 等於 `/adventure-map/<slug>/` 的懶人包（依 `sort_order` 第幾條＝Day 幾），每天一色、依站序編號並畫有箭頭的路線，「▶ 播放路線」逐段畫出並跳出各站資訊卡；點行程站看 500 公尺內的「🍴 吃的／👀 可以逛的」；圖層分 ⭐ 行程站（含住宿）／🍴 food・cafe／👀 museum・walk・shop・diy・scenery；「📍 我在哪」用瀏覽器定位。時段取懶人包 `time_text`，沒寫就沿用前一站。老城區靠太近的編號會在畫面上自動左右攤開（改 marker 的 `margin-left`，不是內層 transform，否則點擊範圍不跟著移）。所以這趟的懶人包要填這個 `source_url`（卡片上會顯示成「🔗 原文」），沒填就只剩全區地點、沒有距離
- 地圖上按「❤️ 想去」走原本的 `dating_map_toggle_like`，跟清單卡片的按讚是同一個欄位 `liked_by`
- **介紹頁每一站的「🍴 附近吃的／👀 附近可以逛的」**：`html` 裡每站 `<h3>` 後面放 `<div class="near" data-near="地點id,…">`（沒有地點的站，例如飯店，用 `data-near-latlng="lat,lng"`），頁尾 `<script src="/adventure-map/trip-near.js" defer>`。`static/adventure-map/trip-near.js` 用同一組密碼即時讀 `dating_map_places`，分兩組列出 500 公尺內的 `food` / `cafe`，以及 `museum` / `walk` / `shop` / `diy` / `scenery`（排除行程站與帶 `data-place-id` 的備案）；吃的沒有就提示最近一家（3 公里內），逛的沒有就不顯示。改 `html` 時別把這些 placeholder 弄掉；用 SQL `replace()` 前先確認目標字串只出現一次
- **備案框**（每站的 `<div class="alt">`）：手寫推薦的店／景點，每個 `<li data-place-id="地點id">`。**只要在當天行程附近就列，不要因營業時間跟行程對不上就移到「下次再去」**，在說明裡標清楚幾點關、晚上是否已關，讓兩人當天自己換
- **台南這趟的版面＝之後每趟旅行的預設風格**（2026-10-24 改成日系繪本風，**只用淺色、沒有夜間按鈕**；Huninn 字型、和紙白 `#FFFCF6`、3px 墨灰 `#3E3A39` 框、大圓角、珊瑚粉／山吹黃／水色／若竹綠四色平塗，插圖是 `html` 內的 SVG，題材換成該目的地的地標、交通、風景）。新增旅行時複製台南的頭尾改內容即可；女友想去的點標 `💕 寶寶要去的`，文字裡也稱「寶寶」，不要寫「女友」：頂端固定 `<header class="topbar">`（匯出按鈕會插進來）→ 首頁插圖＋出發倒數 → `.datetabs` 日期切換 → 「路線示意圖」`<details id="mapbox">` → 三個 `section.day`。這些都在 `<!-- Day 1 -->` 前面的頁首與 `<footer>` 之後的腳本裡，**中間的行程內容沒動**，之後改版也照這樣只換頭尾，用 `replace()` 補細節
  - 日期切換只是對 `section.day` 加 `.is-off`（`display:none`），**不要改用 `hidden` 屬性**：`trip-export.js` 轉 Markdown 會跳過 `hidden` 元素，那幾天就不會出現在文字檔；列印時 CSS 會把三天全部攤開
  - 「必去」徽章由頁尾腳本自動加在 `.stop.key` 的 `<h3>` 前；交通標籤直接寫在 `html`：`<p class="rides"><span class="ride ride--moto">🛵 機車 1.2 公里</span></p>`（`moto`／`walk`／`taxi`／`bike`／`boat`／`train`），移動列寫在 `.stop.move` 的 `<h3>` 裡
  - **預約、訂位、要先問的事寫在對應的站裡**：`<p class="todo"><b>📞 出發前</b>訂位 11/7 17:45　<a class="tel" href="tel:062999199">06-299-9199</a></p>`（放在 `.rides` 後面）；寫在備案 `<li>` 裡的店就直接接在說明後面。「出發前待辦」**只放機車駕照、現金、回程車次**這種整趟共用的事
  - 出發前待辦是 `#check .checks > li > span`，腳本執行時才包成可打勾的 checkbox，勾選狀態存 localStorage `trip-checks-tainan-2026`（只存在各自的裝置上）；`span.tel` 會轉成 `tel:` 連結
  - 示意圖用 `PTS`（等距投影座標）／`ROUTES`（每天的點順序）畫，墨灰粗線上疊當天顏色，用 `getTotalLength()` 設 `--len` 做逐段畫出的動畫；`prefers-reduced-motion` 時所有動畫關掉，路線直接畫完
- **改 `html` 不要用 `regexp_replace` 搭 `.*?`**：Postgres 的正規表示式由第一個量詞決定整條的貪婪性，`'\s*<div class="notice">.*?</div>'` 因為開頭的 `\s*` 變成貪婪，一路刪到最後一個 `</div>`，曾把整頁行程刪光（`dating_map_docs` 沒有歷史版本）。改用完整字串的 `replace()`，改完用 `<li class="stop` 數量等指標核對

**💰 公帳**（「💰 公帳」分頁，`ledger.ts`）：兩人每月各存 `LEDGER_MONTHLY_DEPOSIT`（10,000）的共同帳，日常吃飯、生活用品、交通、約會、旅行都算；**送對方的禮物不記**。資料是一張流水表 `dating_map_ledger`：

| 欄位 | 合法值 | 說明 |
| --- | --- | --- |
| `kind` | `expense` 支出／`deposit` 入金／`adjust` 對帳調整 | 退款＝負數支出；調整可正可負 |
| `category` | 外鍵 → `dating_map_ledger_categories.key`（內建 `food` 吃飯、`cafe` 咖啡甜點、`fun` 玩樂、`transport` 交通、`stay` 住宿、`daily` 生活用品、`gift` 一起送人（預設隱藏）、`other` 其他；網頁新增的代號是 `c` + 8 碼） | 只有支出有 |
| `method` | `card` 公帳卡／`account` 公帳帳戶／`own` 自己先墊 | 入金與調整固定 `account`；先墊的錢**月底回顧時**由阿康從公帳帳戶轉回 |
| `paid_by` | `阿康`／`小黃` | 誰刷卡、誰入金（入金必填） |
| `place_id` / `trip_slug` | → `dating_map_places` / `dating_map_docs` | 可空，刪地點或旅行時 `SET NULL`，帳不會消失 |
| `checked` | boolean | `card`＝已跟信用卡帳單核對；`own`＝已從公帳轉回給先墊的人。RPC 改了日期、金額或付款方式會自動變回 `false` |

- **「旅行」不是分類**：旅行中的吃住交通照樣歸 `food`／`stay`／`transport`，用 `trip_slug` 連到旅行，回顧才能同時回答「這月吃多少」和「這趟花多少」
- **分類在網頁管理**（公帳標題列「⚙️ 分類」，`ledger.ts` `openLedgerCategoryModal`）：新增、改名、換 emoji／顏色、隱藏、排序。代號建立後不變，改名後舊帳自動顯示新名稱；**用過的分類只能隱藏**（`dating_map_delete_ledger_category` 會拒絕）。RPC：`dating_map_save_ledger_category`（`p_key` 為 `null` 時新增）、`dating_map_reorder_ledger_categories`、`dating_map_delete_ledger_category`。`data.ts` 的 `LEDGER_CATEGORY` 只是讀不到分類表時的備援，讀到後由 `applyLedgerCategories` 整組換掉；查分類一律用 `ledgerCategory(key)`（不認得的代號也有預設樣子）
- `is_special` ✨ 特別的日子已建欄位，由 `data.ts` `LEDGER_SHOW_SPECIAL` 控制是否顯示；藏起來時修改舊帳會保留原值
- 「✅ 核對」分兩段：👛 先墊待還（`own` 未勾，依誰墊的分組，轉帳後勾「已從公帳轉回」）→ 💳 對信用卡帳單
- 公帳餘額＝入金＋調整−支出（銀行帳戶＋信用卡未繳合計），所以**繳卡費不記**，那只是帳戶轉到信用卡
- 核對不分月份：列出所有 `method = 'card'` 且未核對的支出，依日期由舊到新，對著帳單勾；勾選時顯示已選合計
- 寫入走 RPC：`dating_map_save_expense`（`saveExpense`，`p_id` 為 `null` 時新增）、`dating_map_delete_expense`、`dating_map_set_expense_checked`（一次多筆）。`fetchLedger` 會分頁讀完，一個月約百筆，幾年就超過 PostgREST 單次 1000 筆上限
- 結餘一律留在公帳累積；不夠時兩人補一樣的錢（阿康自己通知，系統不提醒）
- 清單框（`.adv-ledger-checklist`）**不能加 `overflow: hidden`**：會變成 sticky 的參考框，底部勾選列就浮在清單中間蓋住項目

**回憶照片**（地點卡片＋成就牆的縮圖列，點開是燈箱）：照片**不走 Supabase**，是 repo 裡的公開檔，push 後跟網站一起部署。

1. 原圖放進收件匣 `photos-inbox/<地點名稱>/`（說明寫同資料夾 `說明.txt`，每行「原檔名 說明」），照常 commit：pre-commit hook `.githooks/pre-commit`（需 `git config core.hooksPath .githooks`）會跑 `scripts/add-photos.py`，把壓縮版加進這次 commit、`git reset` 掉收件匣原圖，原圖移到 `photos-inbox/_done/`（gitignore）。收件匣**刻意不 gitignore**：新照片要顯示成變更，只放照片時才 commit 得出去（git 在 hook 之前就判斷有無變更）。名稱查 id 要 `.env` 有 `DATING_MAP_PASSPHRASE`，同名多筆時資料夾改「`361 小油坑`」，失敗原因寫在該資料夾 `處理失敗.txt`。也可直接 `uv run scripts/add-photos.py <地點 id> <照片…> --caption "說明"`。兩種都會縮成長邊 1600px＋400px 縮圖 `NN.thumb.jpg`、**去掉 EXIF（含 GPS）**，放進 `static/adventure-map/photos/<地點 id>/`；支援 HEIC。地點 id 用 SQL 查 `dating_map_places`
2. 說明寫在同資料夾 `captions.txt`，每行「`01.jpg 說明`」，可直接改
3. `layouts/adventure-map/list.html` 建置時用 `readDir` 掃資料夾注入 `window.DATING_MAP_PHOTOS`，`photos.ts` 負責顯示；沒有清單檔要維護，加檔案就會出現

- **不要直接放手機原圖**：檔案 3–5 MB 會撐大 git 歷史（刪了也還在），且 EXIF 有 GPS
- **照片掛在使用者放的那個地點資料夾**，不要依照片內容改掛別處：通常是為了讓連結該地點的成就在成就牆出現照片
- 地點卡片的照片只在「🧭 行程」分頁出現（已去過的地點都在那裡）；成就牆收集該成就所有連結地點的照片，只有已解鎖才顯示

**一鍵退回**：「提案中」與「行程」清單**最下方**的小字連結（2 筆以上才出現），以及行程每天標題的「↩️ 退回」，走 RPC `dating_map_reset_to_idea(p_passphrase, p_ids)`（`resetToIdea`）：把 `proposed` / `confirmed` 改回 `idea` 並清掉 `visit_date`、`sort_order`，**`done` 不動、地點不刪**。按鈕只作用於目前篩選後看得到的地點。

**自動補座標**：頁面上「新增提案」與「修改地點」（原本無座標或地址有改）送出前，`geocode.ts` 會先用地址、再用店名查 ArcGIS `findAddressCandidates`，**分數 ≥ 90 且落在台灣範圍內**才寫入 `lat` / `lng`（`region` 由 trigger 跟著重算）；查不到照常存檔，toast 會提示「找不到座標」。門牌、公園、商圈命中率高，小店名與「捷運○○站」多半查不到，需事後用下方「補座標」方式處理。

### Vite 打包輸出路徑（`yarn build` 後的結果）

| 入口 | 輸出位置 |
| --- | --- |
| `src/apps/adventure-map/index.html` | `static/js/adventure-map.bundle.js` + `static/css/adventure-map.bundle.css` |
| 共用 JS chunks | `static/assets/` |

> 破關地圖主畫面是純清單看板，**唯一的地圖是「✈️ 旅行」卡片的「🗺️ 行程地圖」**（`tripmap.ts`，Leaflet `circleMarker`＋編號 `divIcon`，沒用 MarkerCluster）；`lat` / `lng` 另用於 `region` 判定。底圖用 Esri `World_Light_Gray_Base`（免金鑰；行程地圖浮層 `.adv-tripmap` 固定用白天 token，系統深色時也不切深色底圖）：OSM 預設圖磚滿是廟宇、店家圖示會蓋過標記，CARTO 已改成要 API key（顯示「API KEY REQUIRED」），也不要疊 `World_Light_Gray_Reference`（大比例尺時區名會放大成整片模糊字）。

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
├── apps/adventure-map/     # 破關地圖（清單看板 + Supabase）
│   ├── data.ts             # 分類設定（CATEGORY_CONFIG）、地區名稱與介紹（REGION_LABEL / REGION_INFO）
│   ├── supabase.ts         # Supabase client、CRUD、Realtime 訂閱、懶人包（fetchGuides）與成就（fetchAchievements）讀取
│   ├── geocode.ts          # 提案／編輯時以 ArcGIS 自動補座標
│   ├── voice.ts            # 懶人包語音導覽（Web Speech API，逐段朗讀＋目前站狀態）
│   ├── poster.ts           # 行程海報：Canvas 繪卷海報／時程甘特＋匯出 PNG（不畫地圖圖磚，避免 canvas tainted）
│   ├── tripmap.ts          # 旅行行程地圖：分天編號路線＋箭頭、播放動畫、吃的／逛的圖層、站點附近資訊卡、定位
│   ├── countymap.ts        # 台灣縣市地圖選擇器（願望清單、懶人包的「🗺️ 地圖選」）
│   ├── taiwan-shape.ts     # 縣市 SVG 路徑（scripts/build-taiwan-shape.py 產生）
│   ├── photos.ts           # 回憶照片：讀 window.DATING_MAP_PHOTOS、卡片縮圖列、燈箱
│   ├── ledger.ts           # 💰 公帳分頁：流水、核對信用卡帳單、月度回顧、記一筆表單
│   ├── fly.ts              # 換階段動畫：重畫前 captureCard、refresh 後 flyCard，卡片飛到新位置（看不到就飛進分頁按鈕／流程條），靠卡片上的 data-place 找新卡片
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

- **照片說明一律放在照片外面（下方說明列），不要疊在照片上**，也不要刪掉說明。遊記 `day` / `stop` shortcode 的 `imgs="檔名|說明"` 會輸出成照片下方的 `figcaption`；新增照片版型時，`figcaption` 不用 `position:absolute` 疊在圖上，參考 `layouts/travel/single.html` 的 `.travel-day__gallery figcaption`

### Markdown 表格

pipe 左右必須有空格，separator 使用 `---`：

```markdown
| 食材 | 數量 |
| --- | --- |
| 鴨胸 | 3 塊 |
```

### Obsidian 筆記庫（repo 根目錄＝vault）

- 設定在 `.obsidian/app.json`（進版控）：Markdown 連結（非 `[[wikilink]]`）、相對路徑、附件放同資料夾，對齊 Hugo page bundle；`layouts/`、`src/`、`static/`、`themes/` 等程式目錄已從 Obsidian 排除
- **收件匣 `notes-inbox/`**：剪藏、草稿先放這裡，不在 `content/` 底下所以 Hugo 不發布（repo 公開，GitHub 上看得到）；模板在 `notes-inbox/_templates/`
- 使用者說「消化 notes-inbox」：整理成 `content/<分區>/<文章名稱>/index.md`，前置欄位照上方 Lifestyle 格式並加 `draft: true`，圖片搬進同資料夾，刪掉處理完的原稿；剪藏只留摘要與來源連結，不貼別人全文
- ❌ 不要寫 `[[...]]` 或 `![[...]]`：Hugo 不轉換，會原樣顯示在頁面上

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

### 全站樣式（2026-10-24 統一為日系繪本風，有白天／夜晚兩套）

- 主站覆寫層在 `static/css/custom.css` **最後一段**「日系繪本風（全站）」，token 是 `--pb-*`（色值與破關地圖 `--adv-*` 相同）；靠 cascade 蓋掉上方舊的玻璃／3D／漸層樣式，新元件直接用 `--pb-*`，不要再引用 `--accent-*`
- Huninn 由 `layouts/partials/head.html` 的 Google Fonts 載入，Huninn 只有一種字重，標題不要靠 `font-weight: 700` 做層次
- **夜晚繪本**：預設跟系統深淺色；導覽列日夜開關（主題 header 的 `#checkbox`）選過就寫 `<html data-theme>` 與 localStorage `pb-theme`，`head.html` 開頭先套用避免閃色。夜晚 token 寫兩份：`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` 與 `:root[data-theme="dark"]`（`custom.css`、`map.css`、`travel/single.html` 都是），改色要兩處一起改；元件不另寫深色規則，主題 liva-hugo 的 `--primary-text-color` 等變數也接到 `--pb-*`
  - 平塗底（黃、珊瑚、水色、若竹）上的字用 `--pb-on-flat`（兩種主題都是墨灰），不要用 `--pb-ink`（夜晚是米白）；按鈕改 `--pb-btn-fg`；偏移實色陰影用 `--pb-drop`；標題螢光筆底線用 `--pb-mark*`
  - 新寫的樣式**不要寫死顏色**（`#fff` 底、`#333` 字），一律用 token，否則深色時會變成深字配深底；`custom.css` 上方舊規則的寫死色已換成 token
  - 舊的 `dark-mode` class 已停用：主題 `initTheme()` 會在系統深色時加上它（配的是舊玻璃風深色樣式，半套），`assets/js/index.ts` 覆寫主題同名入口，呼叫前把 `localStorage.theme` 設成 `light`，再把 `#checkbox` 換成複本拿掉主題綁的事件、改綁 `data-theme`。`static/js/theme-switch.js` 沒有任何頁面載入
  - 驗證用 Playwright `color_scheme="dark"` 截圖；**新增 `assets/` 下的檔案要重開 `hugo server`**，否則還是用主題的版本
- 旅遊筆記版型 `layouts/travel/single.html` 的 `<style>` 自帶同一組色（`.tv` 內的變數，含夜晚值與 `--on-flat` / `--drop`），圖表文字與格線在執行時讀 `.tv` 的 token

### 破關地圖樣式（2026-10-24 改為日系繪本風）

- 與台南旅行介紹頁同一套：Huninn 字型（`list.html` 由 Google Fonts 載入）、和紙白 `--adv-paper`、墨灰 `--adv-ink` 2–3px 框、大圓角、珊瑚／山吹黃／水色／若竹綠平塗；token 全在 `map.css` 的 `:root`
- **夜晚繪本**：`map.css` 的 `@media (prefers-color-scheme: dark)` 只換 `--adv-*` token；行程地圖浮層 `.adv-tripmap` 重新宣告白天 token（底圖是淺灰）。海報、旅行介紹頁（`dating_map_docs.html`）仍只有淺色
- 平塗色太淺不能當文字色，小字強調用 `--adv-coral-deep` / `--adv-green` / `--adv-yellow-deep`；**平塗底（黃、珊瑚、水色、若竹）上的文字一律 `--adv-on-flat`**（夜晚 `--adv-ink` 是米白，放在黃底上看不見），不要 `#fff`；偏移實色陰影用 `--adv-drop`
- 卡片的分類色是右下平塗陰影（`color-mix` 把 `--cat-color` 混入 `--adv-cat-lift` 比例的墨色，夜晚提亮深色分類），桌面 `.adv-card-list` 右下留了內距避免被捲動容器裁掉
- `list.html` 的 Hero SVG 插圖用 `style="fill:var(--adv-…)"` 上色（SVG 屬性不吃 `var()`）

### 破關地圖常見錯誤

- **大量匯入資料後要用真實數量看 UI**：願望清單曾因 `.adv-row-list { overflow: hidden }` 蓋掉 `.adv-card-list` 的捲動，300+ 筆時桌面版被裁掉；資料寫入成功 ≠ 畫面可用
- **用 Playwright 測 UI 前先看篩選列**：「☔ 雨天可去」、地區、分類篩選若被開著，行程／清單可能被濾成空的（例如唯一一筆定案地點非室內就消失），別誤判成功能壞掉
- **分頁狀態在 `#adv-app-root[data-active-tab]`**（`index.ts` `setupTabBar`，手機底部 `#adv-tabbar` 與桌面 `#adv-deskbar` 共用）：桌面「規劃看板」＝左邊寬的願望清單＋右欄 `.adv-plan-col`（提案在上、行程在下，sticky、整欄一起捲；願望清單跟整頁捲，**畫面上只留右欄一個內捲**），上方流程條 `#adv-flow`（願望 → 提案 → 行程，點了把那段捲進來；數量只顯示在這裡，桌面版區塊標題的數量藏起來）。桌面 Hero 壓成一列、分頁按鈕與搜尋框同一列（`.adv-topbar`）；提案卡只露出按讚＋定案，其他操作收在右上「⋯」（與行程卡共用 `adv-more-actions-<id>`）；手機分頁列前三個也依這個順序。懶人包、成就、旅行、公帳各自獨立一頁。前三頁只吃搜尋，不吃分類／地區／雨天篩選，CSS 會在這三頁藏起 `#adv-filter-mount` / `#adv-attr-mount` / `#adv-region-mount`；公帳連搜尋框和「新增提案」都藏起來。手機分頁列已有七個，`.adv-tab` 用 `white-space: nowrap` 防止「願望清單」折行，再加分頁要先確認 390px 寬放得下。新增分頁時要決定它屬於哪一組、吃不吃這些篩選，並同步 `map.css`；開場分頁由 `defaultTab()` 選第一個有內容的
- **成就分頁三段**：儀表板（稱號、進度、已完成／今年／最近解鎖、徽章）→ 🏆 成就牆（已解鎖，依解鎖日新到舊，一筆一列橫放：桌面左標題右內容、手機上下排，描述、地點、心得與取消解鎖直接顯示，不用點開）→ 🎯 挑戰中（只列未解鎖）。已解鎖的**不會**出現在挑戰中清單
- **願望清單區域預設收合**（`<details>`，展開後才產生地點列；組內 12 筆以內自動全開）、**挑戰中全部列出**（依連結地點狀態 confirmed > proposed > idea 再依難度排序）；成就分類篩選就是徽章本身（再點一次回全部），沒有另外的 chip 列。用 Playwright 數卡片時要先展開區域
- **驗證正式站要繞過快取**：HTML 本身也快取 10 分鐘；用 `curl` 看 `Age` / `X-Cache` 標頭，瀏覽器測試前先清快取（Ctrl + Shift + R）
- **補座標**：用**店名**查 → Google Maps MCP `maps_search_places`（Places 可用，小店命中率高）；已有**門牌地址** → ArcGIS `findAddressCandidates`（`Addr_type=PointAddress` 很準）。Google Maps MCP 的 Geocoding 未啟用；ArcGIS／Nominatim 拿店名查多半查不到或落點錯，結果都要用台北／台中經緯度框與行政區核對
- **大批景點補座標（全台、上百筆）**：Google Maps MCP 連續大量查詢會把配額用盡（回 `API quota exceeded`），後續改 ArcGIS（`countryCode=TWN`、`langCode=zh`，景點／山／瀑布命中率高）→ 查不到再用 Nominatim（`countrycodes=tw`，每秒 1 次）。**要用 Python `urllib` 呼叫**，Git Bash 的 `curl --data-urlencode` 會把中文編碼成 cp950 而查無結果。同名景點很多（火炎山、北回歸線標誌、金剛大道、白沙灣），每筆都要核對縣市／鄉鎮。**ArcGIS 分數 100 也會錯**：曾把傳藝中心定位到高雄、莒光樓到高雄同名地、Xpark 偏 4 公里；`Addr_type=Locality`（只命中鄉鎮）的結果一律改用 Google Places 重查
- **大批匯入前先跑檢查**：把待匯入地點整理成 JSON 陣列（每筆必填 `source`，說不出來源＝推測），`uv run scripts/check-places.py places.json --reverse --db --out ok.json`。BLOCK（無來源、舊分類、指定 id、座標出界、`Locality`、area 格式／臺字、region 與 area 不符、反查縣市不符）就修正後重跑，只把 `ok.json` 用 SQL 寫入；WARN 是疑似重複或缺 area／region，人看過再決定。腳本只檢查不寫入，欄位格式寫在檔頭 docstring
- **SQL 寫入新資料列不要指定 `id`**：`id` 是 `GENERATED ALWAYS` identity；曾因手動指定 id 匯入導致序列落後 200 號、前端提案撞 PK。若又不同步，用 `select setval(pg_get_serial_sequence('<表>','id'), (select max(id) from <表>))` 校正
- **匯入地點不要用舊分類 key**：`outdoor`、`indoor`、`night_market`、`park`、`temple`、`oldshop`、`shopping`、`hiking`、`daytrip`、`indoor_sport` 已廢除，寫入後篩選列會直接顯示英文 key。匯入後用 `select category, count(*) from dating_map_places group by 1` 確認只剩上表的合法值
- **Google Maps 短網址**：`maps.app.goo.gl` 轉址後的 `q=` 參數帶完整地址（如「永康街6巷5號」），取出地址查門牌比直接解析座標可靠
- **不知道密碼也能測 UI**：Playwright 用 `add_init_script` 預設 localStorage `dating_map_passphrase`（順便設 `dating_map_identity`、`adv-intro-dismissed`），再 `page.route('**/rest/v1/**')` 回假資料（`rpc/dating_map_check_passphrase` 回 `true`，各表回 JSON 陣列），`**/realtime/**` 直接 abort；用 `uv run --with playwright python -I` 跑獨立腳本

---

## Active Status

- **最後更新**：2026-10-26（加入「💰 公帳」分頁）
- **已知問題**：無
