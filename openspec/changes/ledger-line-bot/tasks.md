## 1. 資料庫

- [x] 1.1 依「以原訊息 id 防止重複記帳」用 migration 新增 `dating_map_line_saves`（開 RLS、不建 policy）與 `dating_map_line_save_expense`，滿足 Requirement: One text produces at most one expense 的資料層：同一 `p_message_id` 呼叫兩次只產生一筆帳，第二次回 `created = false`；`is_drink` 只在 `cafe` 為 true。驗證：SQL 在交易內呼叫兩次後查筆數再 rollback，並用 `get_advisors` 確認沒有新的 security 警告
- [x] 1.2 依「復原只動 LINE 記的帳」用 migration 新增 `dating_map_line_undo`，滿足 Requirement: Member can undo their latest LINE expense 的資料層：回傳 `deleted`／`checked`／`none`，只動該操作者 LINE 記的帳，復原後同一訊息 id 再存不會新增。驗證：SQL 在交易內測三種狀態與他人帳不受影響，再 rollback [after: 1.1]

## 2. 文字解析

- [x] 2.1 新增 `supabase/functions/line-webhook/parse.ts`，依「分類選單用 Quick Reply，不接 Gemini」用固定規則實作 Requirement: Expense text is parsed by fixed rules：無副作用，輸入文字與台北今天的日期，輸出草稿或 null，也辨認 `復原`、`這個月`、`餘額` 指令。驗證：用 scratchpad 暫時腳本跑 spec 四個情境，加上 `1,280`、`12/31`（今天 11/4 時解析成去年）、超過 60 字的備註，再以 CLAUDE.md 的 tsc 指令帶入此檔檢查型別

## 3. Webhook

- [x] 3.1 新增 `supabase/functions/line-webhook/index.ts`，依「用 Supabase Edge Function 接 webhook」實作 Requirement: Webhook accepts only signed LINE requests，先回 200 再用 `EdgeRuntime.waitUntil` 處理事件。驗證：部署後以 curl 送錯誤簽章得 403、以測試 secret 算出正確簽章送 `{"events":[]}` 得 200 [after: 2.1]
- [x] 3.2 依「用群組與 LINE userId 白名單辨識兩人」實作 Requirement: Only whitelisted members are served 與 Requirement: Setup mode reveals the sender's own user id：不在 `LINE_USER_MAP` 的人不回應、不查資料庫，`LINE_SETUP_MODE=1` 時 `我的ID` 只回本人 id。驗證：簽章 curl 模擬白名單外 userId，函式 log 無 LINE 回覆呼叫，資料表筆數不變 [after: 3.1]
- [x] 3.3 依「草稿放在 postback，不存資料庫」實作 Requirement: Category and payment are chosen from LINE menus 與 Requirement: Saved expense behaves like a website expense：分類按鈕讀資料表、隱藏的不列，選完才呼叫 `dating_map_line_save_expense`，帶 `x-dating-map-pass`、`x-dating-map-who`，非本人的點選被忽略。驗證：用 60 字備註量測 postback JSON 長度不超過 300；簽章 curl 模擬文字與兩次 postback 後 SQL 確認欄位值，再用 `dating_map_delete_expense` 刪掉測試帳並清掉對應的 `dating_map_ledger_history` 與 `dating_map_line_saves` 列 [after: 1.1, 3.2]
- [x] 3.4 實作 `復原` 文字與按鈕、Requirement: Member can undo their latest LINE expense 的回覆文字。驗證：簽章 curl 模擬後 SQL 確認帳已刪、改帳紀錄的 `changed_by` 是本人 [after: 1.2, 3.3]
- [x] 3.5 依「查詢在 Edge Function 內依網頁規則計算」實作 Requirement: Member can query month spending and balance，分頁讀完全部流水。驗證：對照同一天 SQL 依 `potEffect` 規則算出的餘額與本月總額，兩者相等 [after: 3.2]
- [x] 3.6 實作 Requirement: Failures are reported to the member：RPC 或查詢失敗時回失敗訊息，log 不含密碼與 token。驗證：暫時把 `DATING_MAP_PASSPHRASE` 設成錯值，模擬存檔後資料表沒新增、函式嘗試回覆失敗訊息，再改回 [after: 3.3, 3.4, 3.5]

## 4. 上線

- [ ] 4.1 使用者建立 LINE 官方帳號（開啟 Messaging API 與加入群組、關閉自動回應），把 Channel Secret、Access Token、密碼設成 Supabase secret，`LINE_SETUP_MODE=1`，webhook 指向函式網址；兩人在群組傳 `我的ID` 取得 id、設定 `LINE_USER_MAP`，再移除 `LINE_SETUP_MODE`。驗證：LINE 後台 Verify 成功，傳 `我的ID` 不再回應 [after: 3.6]
- [ ] 4.2 兩人在真實群組跑一次：`午餐 120` 全流程、`咖啡 85 自己付`、另一人誤按、連點、`復原`、`餘額` 與網頁比對、開著網頁看到自動更新；同時確認 Quick Reply 在群組的顯示方式，不行就依 design 改 Flex Message。驗證：SQL 核對各筆欄位，測試帳用 `復原` 清掉 [after: 4.1]

## 6. LINE 內記帳表單

- [x] 6.1 依「群組入口用公告與回覆按鈕，不用圖文選單」實作 Requirement: Expense form opens from LINE without typing：`記帳` 回表單按鈕，一般回覆附 📝 記一筆，選單回覆不超過 13 顆；同時讓 `parse.ts` 接受 `午餐120`，並移除除錯用的 `console.log`。驗證：擴充 scratchpad 的 deno 測試腳本，檢查 `午餐120`、`餘額` 與 `記帳` 的回覆按鈕，`LINE_LIFF_ID` 未設定時不出現按鈕，deno check 通過
- [x] 6.2 依「記帳表單用 LIFF 靜態頁，身分由 Edge Function 驗證」在 `line-webhook` 新增 `/liff` 路由，實作 Requirement: Form identifies the member by LINE login 與 Requirement: Form records an expense by tapping 的後端：驗 ID token、限 origin、回分類與姓名、檢查欄位後寫入、回摘要。驗證：deno 測試腳本攔截 LINE verify，測白名單外 403、錯誤 origin 被拒、不合法金額與隱藏分類 400、同一 `liff:` id 只寫一筆，測試資料用 `復原` 刪除 [after: 6.1]
- [x] 6.3 依「金額欄用數字鍵盤加＋按鈕」與「送出結果用 liff.sendMessages 發到聊天室」新增 `static/adventure-map/line-ledger/index.html`，實作 Requirement: Form records an expense by tapping 的畫面與 Requirement: Form result is visible in the chat：頁面不含機密，顏色用白天與夜晚 token。驗證：Playwright 假 `liff` 物件與 `/liff` 回應，測 390px 與桌面 ≥900px、白天與夜晚截圖，送出按鈕的停用條件、`60+55`、失敗時保留輸入、`sendMessages` 失敗時顯示成功 [after: 6.2]
- [x] 6.4 使用者在 provider「破關地圖」建立 LINE Login channel 與 LIFF app（Size Full、Scope `openid` 與 `chat_message.write`、Endpoint 指向表單網址），設定 `LINE_LOGIN_CHANNEL_ID`、`LINE_LIFF_ID`；部署函式並 push 表單頁。驗證：手機 LINE 開 `https://liff.line.me/<LIFF ID>`，表單顯示姓名與分類 [after: 6.3]
- [ ] 6.5 在真實群組測試：群組公告連結開表單、點選記一筆、摘要發到群組且 bot 不回應、`復原` 刪掉測試帳、小黃加入白名單後也能開表單。驗證：SQL 核對 `paid_by`、`category`、`method`，測試帳清掉 [after: 6.4]
- [ ] 6.6 依「固定入口用私訊的圖文選單」實作 Requirement: Rich menu gives a permanent entry：使用者在 LINE Official Account Manager 上傳選單圖片並設定四個區塊。驗證：手機開與 bot 的私訊，看得到選單，點記一筆開表單，點餘額有回覆 [after: 6.4]
- [x] 6.7 依「表單的飲料勾選比照網頁」實作 Requirement: Form marks drinks like the website：新增 9 參數 RPC，表單加勾選，`/liff` 檢查並傳遞。驗證：SQL 在交易內測 `cafe` 配 false 與 `food` 配 true 後回滾；deno 腳本攔截 RPC 確認 `p_is_drink` 與非布林回 400；Playwright 測勾選連動與手動後不再跟分類 [after: 6.3]
- [x] 6.8 依「帳本直接用完整網頁，LINE 身分換取網頁密碼」實作 Requirement: Ledger book opens from LINE without the passphrase：`/liff` 新增 `session`，表單頁處理 `view=book`，網頁支援 `?tab=ledger`，選單圖片改成帳本。驗證：deno 腳本測白名單外 403 且不含密碼；Playwright 用假 `liff` 測跳轉與 localStorage，hugo 本機測 `?tab=ledger` 開公帳、沒帶參數維持原分頁，390px 與桌面 [after: 6.7]
- [x] 6.9 擴充 Requirement: Member can query month spending and balance：`餘額` 同時回本月總額與分類小計，`這個月` 維持原樣。驗證：deno 腳本攔截 LINE 回覆、讀真實資料，核對餘額與各分類金額跟 SQL 相同 [after: 6.8]

## 7. 表單入金

- [x] 7.1 依「表單入金只記自己的」用 migration 新增 `dating_map_line_save_deposit`，滿足 Requirement: Form records the member's own deposit 的資料層：同一 `p_message_id` 呼叫兩次只產生一筆，列的 `kind`、`method`、`category`、`paid_by` 符合規格，再用 `dating_map_line_undo` 能刪除。驗證：以 `.env` 的密碼呼叫真實 RPC 跑上述步驟，再用 SQL 清掉測試留下的改帳紀錄與 `dating_map_line_saves` 列，並用 `get_advisors` 確認只有與 `dating_map_line_save_expense` 相同的 anon 可執行警告
- [x] 7.2 依「表單入金只記自己的」在 `/liff` 新增 `deposit` 動作，實作 Requirement: Form records the member's own deposit 的後端：驗身分、檢查金額、日期、備註與 `liff:` id，寫入後回摘要。驗證：deno 測試腳本攔截 LINE verify 與 RPC，測白名單外 403、不合法金額與日期 400、`p_actor` 是驗證後的姓名而不是請求內容，並確認摘要送回 `parseText` 得到 null；deno check 通過 [after: 7.1]
- [x] 7.3 依「表單入金只記自己的」在 `static/adventure-map/line-ledger/index.html` 加入 💸 支出／💰 入金切換，實作 Requirement: Form records the member's own deposit 的畫面：入金藏起分類、飲料與付款方式，送出條件只看金額與日期，支出與入金各用一個 `liff:` id。驗證：Playwright 假 `liff` 物件與 `/liff` 回應，測 390px 與桌面 ≥900px、白天與夜晚截圖，以及送出內容、兩種類 id 不同、失敗重送沿用同一 id、支出流程不受影響 [after: 7.2]
- [ ] 7.4 部署函式、push 表單頁後，在手機 LINE 記一筆測試入金，再傳 `餘額` 與 `復原`。驗證：SQL 核對 `kind`、`method`、`paid_by` 與餘額變化，測試帳由 `復原` 清掉 [after: 7.3]

## 5. 文件

- [ ] 5.1 更新 CLAUDE.md 公帳段落：LINE 記帳指令、表單入金、函式位置、secrets、換密碼要同步、餘額規則有兩份要一起改。驗證：內容審閱，並確認 repo 內沒有任何 token（Grep `LINE_CHANNEL` 只出現變數名稱） [after: 4.2, 6.5, 6.6, 6.7, 6.8, 6.9, 7.4]
