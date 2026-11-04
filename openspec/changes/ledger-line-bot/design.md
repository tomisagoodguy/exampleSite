## Context

公帳流水表 `dating_map_ledger` 由 RPC `dating_map_save_expense` 寫入，RPC 用密碼驗證，有 15 與 16 參數兩個 overload，前端只呼叫 16 參數版。`dating_map_ledger_log` 在 UPDATE／DELETE 時記改帳紀錄，操作者由 `dating_map_request_actor()` 從 header `x-dating-map-who`（UTF-8 的 base64）取得。`dating_map_ledger_touch_sync` 已掛在流水表上（2026-11-04 查 pg_trigger），開著的網頁會收到更新。讀取需要 header `x-dating-map-pass`。

網站是靜態頁，收不了 webhook。Supabase 專案 `zvomerdcsxvuymnpuvxk` 目前沒有 Edge Function（2026-11-04 查詢）。分類表 `dating_map_ledger_categories` 目前有 9 列，8 列可見（2026-11-04 查詢）。

## Goals / Non-Goals

**Goals:**

- 阿康、小黃在 LINE 群組傳文字並點選單，就能記一筆公帳支出
- 記下來的帳與網頁記的相同：同一張表、同一份改帳紀錄、開著的網頁自動更新
- 在 LINE 查本月花費與公帳餘額，並復原自己剛記的一筆

**Non-Goals:**

- 不接 Gemini 或其他 AI 解析；之後要接時只換文字解析這一層
- 不支援入金、調整、退款、外幣、連結地點或旅行、核對信用卡帳單，這些留在網頁
- 不做圖文選單，也不改網頁主站的記帳表單
- 不做替對方記帳：`paid_by` 一律是傳訊者，要改就到網頁
- 不用主動推播，只用 reply，避免消耗訊息額度
- 不改前端與現有 RPC

## Decisions

### 用 Supabase Edge Function 接 webhook

webhook 放在 `supabase/functions/line-webhook/`，部署時關閉 `verify_jwt`，因為 LINE 不會帶 JWT；改由函式自己驗 `x-line-signature`。資料已在 Supabase，不用多維護一個 Vercel 專案。替代方案是掛到 Kang-Core 的 Vercel，但公帳會綁上無關的個人助理專案。

函式用 anon key 加 `x-dating-map-pass` 呼叫 RPC 與讀表，跟前端權限相同，不使用 service role key。收到事件後先回 200，用 `EdgeRuntime.waitUntil` 處理，寫法比照 Kang-Core 的 `waitUntil`。

### 用群組與 LINE userId 白名單辨識兩人

`LINE_USER_MAP` secret 存 `{"<LINE userId>":"阿康","<LINE userId>":"小黃"}`。userId 依 LINE provider 而不同，新官方帳號要重新取得，所以設 `LINE_SETUP_MODE=1` 時開放 `我的ID` 指令，只回傳訊者本人的 id；設定完成後移除此 secret。不限定 groupId，兩人私訊 bot 也可記帳，白名單已足以擋掉其他人。

### 分類選單用 Quick Reply，不接 Gemini

分類與付款方式用 Quick Reply 加 postback，分類每次讀資料表，網頁新增或隱藏分類後 LINE 跟著變。Quick Reply 上限 13 顆（LINE 文件所載，實作時確認），保留 1 顆給取消，所以最多列 12 個分類；目前 8 個。按鈕文字為 emoji＋分類名稱，超過 20 字元時截斷。

文字解析是固定規則，放在無副作用的 `parse.ts`，之後接 Gemini 時只換這層。

### 草稿放在 postback，不存資料庫

金額、備註、日期等放在 postback `data` 的 JSON，點按鈕時原樣傳回，不需要草稿表，也沒有過期清理。沒點完的草稿不會產生任何資料。LINE 的 `data` 上限 300 字元（LINE 文件所載，備註上限 60 字元時的最長 JSON 要在實作時量測）。

postback 也帶原傳訊者姓名，點的人不是本人就忽略，避免對方誤按改到這筆的 `paid_by`。

### 以原訊息 id 防止重複記帳

新表 `dating_map_line_saves` 以 LINE 原訊息 id 為主鍵。新 RPC `dating_map_line_save_expense` 在同一交易內先 `insert ... on conflict do nothing`，搶到才呼叫 16 參數的 `dating_map_save_expense`，所以重複點按與 LINE 重送都只會有一筆。只在存檔時防重，重送的文字訊息最多多出一次選單，不會寫入。

替代方案是用 `webhookEventId` 去重，但連點產生的是兩個不同事件，擋不住。

### 復原只動 LINE 記的帳

新 RPC `dating_map_line_undo` 從 `dating_map_line_saves` 找該操作者最新且 `entry_id` 仍存在的列，所以網頁記的帳不會被刪。`entry_id` 外鍵用 `ON DELETE SET NULL`：帳刪除後防重的列仍在，舊按鈕不會把已復原的帳再記回來。已核對（`checked = true`）的帳拒絕刪除。刪除呼叫既有的 `dating_map_delete_expense`，改帳紀錄會保留，可在網頁復原。

文字 `復原` 刪最新一筆；復原按鈕帶訊息 id，走 3 參數 overload，只刪它顯示的那筆。按鈕若也刪最新一筆，連點兩下會多刪前一筆。

### 查詢在 Edge Function 內依網頁規則計算

`這個月` 與 `餘額` 分頁讀 `dating_map_ledger` 後在函式內計算，規則對應 `ledger.ts` 的 `potEffect` 與 `balanceThrough`。`ledger.ts` 依賴 DOM，函式無法匯入，所以這段邏輯會有兩份；改餘額規則時要兩邊一起改，寫進 CLAUDE.md。

### 群組入口用公告與回覆按鈕，不用圖文選單

兩人不想在群組打字。圖文選單只在與 bot 的一對一聊天顯示（LINE 文件所載，實作時確認），所以群組用三個入口：群組公告釘 LIFF 連結（使用者手動設定）、bot 每次回覆附「📝 記一筆」、傳 `記帳` 回按鈕。按鈕是 Quick Reply 的 URI action，只在最新一則訊息後出現，所以公告才是常駐入口。

### 記帳表單用 LIFF 靜態頁，身分由 Edge Function 驗證

表單是 `static/adventure-map/line-ledger/index.html`，隨 GitHub Pages 部署，頁面只有公開的 LIFF ID。LIFF 掛在同 provider「破關地圖」的 LINE Login channel，userId 才會與 Messaging API 相同。

頁面把 ID token 送到 `line-webhook/liff`，函式呼叫 LINE verify 後對照 `LINE_USER_MAP`，讀分類與寫入都由函式代做。這樣使用者不用輸入網頁密碼，密碼也不會進到頁面。替代方案是在 LINE 內開現有網頁，但要輸入密碼，且 LINE 內建瀏覽器的 localStorage 不一定保留。

寫入沿用 `dating_map_line_save_expense`，`p_message_id` 用頁面產生的 `liff:` uuid，防重與復原都不用新增資料庫物件。

### 送出結果用 liff.sendMessages 發到聊天室

摘要以本人名義發到開啟表單的聊天室，兩人都看得到，也不用 push。這需要 `chat_message.write` scope；失敗不影響已寫入的帳，只改在表單顯示成功。摘要最後一段是 `吃飯・公帳卡・阿康・11/4`，不是金額，所以 bot 不會當成新的草稿。

### 金額欄用數字鍵盤加＋按鈕

手機數字鍵盤打不出 `+`，所以表單另放＋按鈕，並即時顯示合計。送出的是算好的整數，函式再檢查一次範圍。

## Implementation Contract

**行為：**

| 訊息／操作 | 結果 |
| --- | --- |
| `午餐 120` | 分類選單 → 付款選單 → 寫入，回覆內容與 復原 按鈕 |
| `昨天 全聯 60+55 自己付` | 分類選單 → 寫入 |
| `復原` | 刪掉傳訊者最新一筆 LINE 記的帳 |
| `這個月` | 本月總額與分類小計 |
| `餘額` | 到今天為止的公帳餘額 |
| `記帳` | 回「📝 記一筆」按鈕 |
| 其他文字 | 不回應 |

**資料：**

```sql
dating_map_line_saves (
  message_id text primary key,
  entry_id bigint references dating_map_ledger(id) on delete set null,
  actor text not null,
  created_at timestamptz not null default now()
)
-- 開啟 RLS 且不建 policy，只有 SECURITY DEFINER RPC 能存取

dating_map_line_save_expense(p_passphrase text, p_message_id text, p_spent_on date,
  p_amount integer, p_category text, p_method text, p_actor text, p_note text)
  returns table(entry_id bigint, created boolean)
  -- paid_by、created_by = p_actor；is_drink = (p_category = 'cafe')

dating_map_line_undo(p_passphrase text, p_actor text)
  returns table(status text, note text, amount integer)
dating_map_line_undo(p_passphrase text, p_actor text, p_message_id text)  -- 同上，只看指定訊息
  -- status: 'deleted' | 'checked' | 'none'
```

postback `data`：`{"s":"cat"|"pay"|"no"|"undo","m":"<訊息 id>","w":"<姓名>","a":120,"n":"午餐","d":"2026-11-04","c":"food","p":"card"}`，其中 `c`、`p` 在選定前省略，`no` 只需要 `s`、`w`，`undo` 只需要 `s`、`m`、`w`。

環境變數：`LINE_LOGIN_CHANNEL_ID`、`LINE_LIFF_ID`、`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_USER_MAP`、`DATING_MAP_PASSPHRASE`、`LINE_SETUP_MODE`，以及 Supabase 自動提供的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`。

表單路由（`line-webhook/liff`，只收 `https://tomisagoodguy.github.io`）：

```json
POST {"action":"init","idToken":"..."}
→ {"name":"阿康","categories":[{"key":"food","label":"吃飯","emoji":"🍜"}]}
POST {"action":"save","idToken":"...","requestId":"liff:<uuid>","date":"2026-11-04","amount":120,"category":"food","method":"card","note":""}
→ {"created":true,"summary":"✅ 吃飯 $120
🍜 吃飯・公帳卡・阿康・11/4"}
```

**失敗處理：**

- 簽章錯誤回 403，未設定 `LINE_CHANNEL_SECRET` 回 503
- `LINE_USER_MAP` 不是合法 JSON 時視為空白名單並寫 error log
- RPC 或查詢失敗回「沒有記到，請再試一次或到網頁記」這類訊息；不靜默失敗，log 不含密碼與 token
- reply 失敗（token 過期）只寫 log，不重試

**驗收：** 見 tasks.md 各項，最後由兩人在真實群組跑一次完整流程。

**範圍：** 本次新增 Edge Function、一張表、RPC、表單靜態頁 `static/adventure-map/line-ledger/` 與文件，不動 `src/`、`layouts/`。

## Risks / Trade-offs

- **換密碼後 bot 失效** → 寫入會回失敗訊息，CLAUDE.md 註明要同步更新 secret
- **餘額規則有兩份** → CLAUDE.md 註明，並在驗收時比對網頁數字
- **一般聊天剛好符合格式（例如「等等 5」）會跳出選單** → 不點就不會寫入，接受此干擾
- **群組裡 Quick Reply 的顯示方式未實測**：另一人可能也看得到按鈕 → 已用本人檢查擋下誤按；若群組內無法顯示，改用 Flex Message 按鈕，postback 格式不變
- **Edge Function 冷啟動使回覆變慢** → 已先回 200，LINE 不會判定逾時，影響僅在回覆稍慢
