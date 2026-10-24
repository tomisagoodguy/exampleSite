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
> `hugo server` 是 Fast Render 模式：改了 `layouts/` 或 `yarn build` 換掉 bundle 後，**已開過的頁面不會重新產生**（curl 拿到的還是舊 HTML）。`touch` 該頁的內容檔（破關地圖是 `content/adventure-map/_index.md`）再看，或起 server 時加 `--disableFastRender`。`hugo server` 開著時 `yarn build` 偶爾會因檔案被鎖而失敗，再跑一次即可。
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
- 懶人包篩選列是季節｜場景｜天數擠在同一條橫捲列（`ui.ts` `renderGuideFilterBar`），三組可疊加，再點一次已選的按鈕即取消
- 圖卡上「N 條步道各自獨立」這種清單不是一日路線，依區域拆成幾條、摘要註明「挑 1–2 條走」，避免「照這個排行程」把全部排進同一天
- 兩張表只開放 `SELECT`（RLS），內容目前由 Supabase SQL 直接寫入，前端沒有編輯介面
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
- 前端寫入只走 RPC `dating_map_set_achievement`（`p_done=false` 清除手動紀錄）；新增成就、調整連結目前用 SQL 直接寫
- 分類徽章門檻與稱號定義在 `data.ts` 的 `ACHIEVEMENT_CATEGORY` / `ACHIEVEMENT_TITLES`；新增成就分類要同時改這裡與資料表的 CHECK 約束

**旅行介紹頁**（「✈️ 旅行」分頁，一趟一張卡片）存在 `dating_map_docs`：

| 欄位 | 內容 |
| --- | --- |
| `slug` | 主鍵，也是網址 `/adventure-map/<slug>/` |
| `title` / `date_text` / `summary` / `emoji` / `tags` / `sort_order` | 卡片顯示用 |
| `area_prefix` | 行程地圖顯示 `dating_map_places.area` 以此開頭的地點（例如 `台南市`）；`null` 就不出現地圖按鈕 |
| `html` | 完整介紹頁 HTML（含自己的 `<style>`／`<script>`），只在 slug 頁讀取，卡片不讀 |

- **讀取要密碼**：RLS 與其他 `dating_map_*` 表相同。`static/adventure-map/<slug>/index.html` 只是載入頁，**本身不含行程資料**；它沿用 localStorage `dating_map_passphrase`，以 `x-dating-map-pass` 讀出 `html` 後用 `document.write` 換掉整頁。**不要把行程 HTML 直接放進 `static/`**：那是公開檔，密碼擋不到，裡面有飯店和日期
- 新增一趟旅行：SQL 寫入一列（目前前端沒有編輯介面），再把 `static/adventure-map/tainan-2026/` 複製成新的 slug 資料夾（載入頁從網址最後一段取 slug，不用改內容）
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

**一鍵退回**：「提案中」頂部與「行程」頂部／每天標題有退回按鈕（2 筆以上才出現頂部按鈕），走 RPC `dating_map_reset_to_idea(p_passphrase, p_ids)`（`resetToIdea`）：把 `proposed` / `confirmed` 改回 `idea` 並清掉 `visit_date`、`sort_order`，**`done` 不動、地點不刪**。按鈕只作用於目前篩選後看得到的地點。

**自動補座標**：頁面上「新增提案」與「修改地點」（原本無座標或地址有改）送出前，`geocode.ts` 會先用地址、再用店名查 ArcGIS `findAddressCandidates`，**分數 ≥ 90 且落在台灣範圍內**才寫入 `lat` / `lng`（`region` 由 trigger 跟著重算）；查不到照常存檔，toast 會提示「找不到座標」。門牌、公園、商圈命中率高，小店名與「捷運○○站」多半查不到，需事後用下方「補座標」方式處理。

### Vite 打包輸出路徑（`yarn build` 後的結果）

| 入口 | 輸出位置 |
| --- | --- |
| `src/apps/adventure-map/index.html` | `static/js/adventure-map.bundle.js` + `static/css/adventure-map.bundle.css` |
| 共用 JS chunks | `static/assets/` |

> 破關地圖主畫面是純清單看板，**唯一的地圖是「✈️ 旅行」卡片的「🗺️ 行程地圖」**（`tripmap.ts`，Leaflet `circleMarker`＋編號 `divIcon`，沒用 MarkerCluster）；`lat` / `lng` 另用於 `region` 判定。底圖用 Esri `World_Light_Gray_Base`（免金鑰；`body.dark-mode` 時換 `World_Dark_Gray_Base`，路線改用亮一階的每日配色，資訊卡／彈窗用 `.adv-tripmap` 上的 `--tm-*` 變數切深淺）：OSM 預設圖磚滿是廟宇、店家圖示會蓋過標記，CARTO 已改成要 API key（顯示「API KEY REQUIRED」），也不要疊 `World_Light_Gray_Reference`（大比例尺時區名會放大成整片模糊字）。

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
- **用 Playwright 測 UI 前先看篩選列**：「☔ 雨天可去」、地區、分類篩選若被開著，行程／清單可能被濾成空的（例如唯一一筆定案地點非室內就消失），別誤判成功能壞掉
- **分頁狀態在 `#adv-app-root[data-active-tab]`**（`index.ts` `setupTabBar`，手機底部 `#adv-tabbar` 與桌面 `#adv-deskbar` 共用）：桌面「規劃看板」＝提案／行程／願望三欄，懶人包、成就、旅行各自獨立一頁。這三頁只吃搜尋，不吃分類／地區／雨天篩選，CSS 會在這三頁藏起 `#adv-filter-mount` / `#adv-attr-mount` / `#adv-region-mount`。新增分頁時要決定它屬於哪一組、吃不吃這些篩選，並同步 `map.css`；開場分頁由 `defaultTab()` 選第一個有內容的
- **成就分頁三段**：儀表板（稱號、進度、已完成／今年／最近解鎖、徽章）→ 🏆 成就牆（已解鎖，依解鎖日新到舊，一筆一列橫放：桌面左標題右內容、手機上下排，描述、地點、心得與取消解鎖直接顯示，不用點開）→ 🎯 挑戰中（只列未解鎖）。已解鎖的**不會**出現在挑戰中清單
- **願望清單區域預設收合**（`<details>`，展開後才產生地點列；組內 12 筆以內自動全開）、**挑戰中預設只列最接近完成的 9 項**（`ACH_PREVIEW`，依連結地點狀態 confirmed > proposed > idea 再依難度排序）；成就分類篩選就是徽章本身（再點一次回全部），沒有另外的 chip 列。用 Playwright 數卡片時要先展開區域、點「顯示全部」
- **驗證正式站要繞過快取**：HTML 本身也快取 10 分鐘；用 `curl` 看 `Age` / `X-Cache` 標頭，瀏覽器測試前先清快取（Ctrl + Shift + R）
- **補座標**：用**店名**查 → Google Maps MCP `maps_search_places`（Places 可用，小店命中率高）；已有**門牌地址** → ArcGIS `findAddressCandidates`（`Addr_type=PointAddress` 很準）。Google Maps MCP 的 Geocoding 未啟用；ArcGIS／Nominatim 拿店名查多半查不到或落點錯，結果都要用台北／台中經緯度框與行政區核對
- **大批景點補座標（全台、上百筆）**：Google Maps MCP 連續大量查詢會把配額用盡（回 `API quota exceeded`），後續改 ArcGIS（`countryCode=TWN`、`langCode=zh`，景點／山／瀑布命中率高）→ 查不到再用 Nominatim（`countrycodes=tw`，每秒 1 次）。**要用 Python `urllib` 呼叫**，Git Bash 的 `curl --data-urlencode` 會把中文編碼成 cp950 而查無結果。同名景點很多（火炎山、北回歸線標誌、金剛大道、白沙灣），每筆都要核對縣市／鄉鎮。**ArcGIS 分數 100 也會錯**：曾把傳藝中心定位到高雄、莒光樓到高雄同名地、Xpark 偏 4 公里；`Addr_type=Locality`（只命中鄉鎮）的結果一律改用 Google Places 重查
- **SQL 寫入新資料列不要指定 `id`**：`id` 是 `GENERATED ALWAYS` identity；曾因手動指定 id 匯入導致序列落後 200 號、前端提案撞 PK。若又不同步，用 `select setval(pg_get_serial_sequence('<表>','id'), (select max(id) from <表>))` 校正
- **匯入地點不要用舊分類 key**：`outdoor`、`indoor`、`night_market`、`park`、`temple`、`oldshop`、`shopping`、`hiking`、`daytrip`、`indoor_sport` 已廢除，寫入後篩選列會直接顯示英文 key。匯入後用 `select category, count(*) from dating_map_places group by 1` 確認只剩上表的合法值
- **Google Maps 短網址**：`maps.app.goo.gl` 轉址後的 `q=` 參數帶完整地址（如「永康街6巷5號」），取出地址查門牌比直接解析座標可靠

---

## Active Status

- **最後更新**：2026-10-23
- **已知問題**：無
