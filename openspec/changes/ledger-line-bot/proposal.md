## Why

公帳目前只能打開破關地圖網頁記帳，在店裡結完帳當下不方便，事後常要憑記憶補。阿康和小黃每天都在用 LINE，讓兩人在群組傳一句話就能記一筆，可以減少漏記。

## What Changes

- 新增一個專用的 LINE 官方帳號，加入阿康和小黃的群組使用，不共用 Kang-Core／scrivener-flow 的 bot
- 新增 Supabase Edge Function 接收 LINE webhook（網站是靜態頁，收不了 webhook），驗證 LINE 簽章，只處理白名單內的兩人
- 傳「午餐 120」這類訊息時，bot 用 LINE 選單讓人點選分類與付款方式，選完才寫入公帳；分類清單讀網頁同一張分類表
- 記帳者自動帶入為 `paid_by`，改帳紀錄也記到本人；選 `cafe` 時比照網頁標記 🧋 飲料
- 新增文字指令：查本月花費、查公帳餘額、復原自己剛用 LINE 記的那筆
- 新增 LINE 內記帳表單（LIFF）：群組公告或 bot 的按鈕一點就開，日期、分類、付款方式都用點的，不用輸入網頁密碼，送出後摘要發到聊天室
- LINE 內記帳表單可切換「💰 入金」，只記自己的入金，填金額、日期與備註即可，不用另外開網頁；退款與對帳調整仍留在網頁
- 與 bot 的私訊底部放固定的圖文選單：記一筆、這個月、餘額、復原，不用打字
- 新增資料表與 RPC，防止重複點選或 LINE 重送造成同一筆記兩次

## Capabilities

### New Capabilities

- `ledger-line-bot`: 在 LINE 群組用文字、選單或表單記公帳、查本月花費與餘額、復原剛記的一筆

### Modified Capabilities

(none)

## Impact

- 新增程式：supabase/functions/line-webhook/、static/adventure-map/line-ledger/
- 新增資料表 `dating_map_line_saves`、RPC `dating_map_line_save_expense`、`dating_map_line_save_deposit`、`dating_map_line_undo`（Supabase migration，不含 DROP）
- 新增 Edge Function secrets：`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_USER_MAP`、`DATING_MAP_PASSPHRASE`、`LINE_SETUP_MODE`、`LINE_LOGIN_CHANNEL_ID`、`LINE_LIFF_ID`；換網頁密碼時 `DATING_MAP_PASSPHRASE` 要同步更新
- 外部服務：新的 LINE 官方帳號與 LINE Login channel／LIFF app（由使用者建立並設定）
- 文件：CLAUDE.md 公帳段落
- 前端不需修改：現有同步 trigger `dating_map_ledger_touch_sync` 會讓開著的網頁自動更新
