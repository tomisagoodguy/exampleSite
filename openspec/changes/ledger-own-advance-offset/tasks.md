## 1. 待抵計算

- [x] 1.1 在 src/apps/adventure-map/ledger.ts 新增匯出函式計算每人待抵（Requirement: Pending advance per person；依 design「待抵公式保留「已勾先墊」排除」與「抵先墊記成 method = own 的入金列」）：`Σ own 支出(checked = false) − Σ own 入金`，可帶截止日只算 `spent_on ≤ 截止日`。驗證：tsc 通過，並在瀏覽器 console 以 spec 範例表四組資料呼叫，得到 8582／0／5000／1782

## 2. 記入金抵先墊

- [x] 2.1 記一筆表單新增入金時顯示試算列並回傳 offset（Requirement: Deposit offsets pending advance；design「入金表單拆兩列由前端完成」）：`openExpenseModal` 在 `kind = 'deposit'`、新增模式、`paid_by` 待抵 > 0 時顯示「{誰}先墊待抵 $X → 這次抵 $Y，實際轉 $Z」，改金額或人即時更新，其他情況隱藏；`ExpenseModalResult` 增加 `offset`。驗證：Playwright 在本機以真實待抵 8582 打開入金表單，讀到「這次抵 $8,582，實際轉 $1,418」，換成阿康後試算列消失 [after: 1.1]
- [x] 2.2 入金存檔拆成抵先墊列與實際轉帳列（Requirement: Deposit offsets pending advance）：`index.ts` `addExpense` 在 `offset > 0` 時先存 `method = 'own'`、備註「抵先墊」的入金，再存 `amount − offset > 0` 的 `account` 入金，toast 顯示兩個金額。驗證：Playwright 攔截 `rpc/dating_map_save_expense`，10000 對待抵 8582 送出 own 8582＋account 1418；對待抵 15000（攔截讀取改成假資料）只送 own 10000；對阿康只送 account 10000 [after: 2.1]
- [x] 2.3 抵先墊入金的顯示與編輯（Requirement: Offset deposit is labelled and preserved on edit）：own 入金列標題顯示「{誰} 抵先墊」、meta 不寫「轉帳」；編輯既有入金送出時保留原 `method`，不顯示試算、不拆列。驗證：Playwright 以假資料打開一筆 own 入金改金額存檔，攔截到的 `p_method` 為 `own` 且只有一次呼叫；流水列文字含「抵先墊」 [after: 2.1]
- [x] 2.4 確認抵先墊算入入金（Requirement: Offset deposit counts as contribution）：本月只有 own 入金 10000 的人不出現在「還沒存」提醒，「本月入金」與回顧入金包含它。驗證：Playwright 以假資料（小黃只有 own 入金 10000）讀提醒列不含小黃、「本月入金」顯示 $20,000（另有阿康 account 10000） [after: 2.2]

## 3. 核對頁與對銀行餘額

- [x] 3.1 核對頁改顯示每人待抵（Requirement: Check view shows pending advance per person）：`checkHTML` 的先墊區塊改為「👛 先墊待抵（下次入金時扣掉）」，每人「先墊 $A − 已抵 $B ＝ 待抵 $C」與唯讀先墊清單，移除「✓ 已從公帳轉回」勾選；核對分頁徽章改算待抵 > 0 的人數。驗證：Playwright 在本機核對頁讀到「小黃 … 待抵 $8,582」，頁面沒有「已從公帳轉回」字樣 [after: 1.1]
- [x] 3.2 對銀行餘額的前端預覽改用待抵（Requirement: Bank reconciliation uses pending advance；design「對銀行餘額的 own_pending 改公式」）：`bankHTML` 預覽以截止日待抵合計扣除，文案改「先墊待抵」。驗證：Playwright 以 spec「11月 settled by offset」假資料填銀行 11418、卡費 2152，預覽差額為 0 [after: 1.1]
- [x] 3.3 `dating_map_save_balance` 的 `own_pending` 改用新公式（Requirement: Bank reconciliation uses pending advance）：以 CREATE OR REPLACE（簽章不變、無 DROP）套用 migration，`own_pending = Σ own 支出(未勾) − Σ own 入金`（`spent_on ≤ p_checked_on`）。驗證：先查 `dating_map_ledger_balances` 筆數；在 `begin … rollback` 交易中插入一筆 own 入金 8582 後呼叫 RPC，讀回 `own_pending = 0`

## 4. 文件

- [x] 4.1 更新 CLAUDE.md 公帳段落與記憶 project_couple_ledger_rules：`method = own` 改為「下次入金時抵扣，扣不完留到下個月」、說明 own 入金＝抵先墊、核對頁先墊區塊與待抵公式，移除「月底由阿康轉回」。驗證：Grep CLAUDE.md 不再含「月底回顧時**由阿康從公帳帳戶轉回」，含「抵先墊」 [after: 3.3]

## 5. 改為「填實際轉帳」（補正 2.1、2.2、2.4）

> 變更說明：2.1、2.2 已完成並上線（255900b），當時是「填的金額＝本月入金總額」；使用者實際是填實際轉進銀行的錢，依 design「入金金額是實際轉帳，抵先墊補到本月 10,000」改算法。2.4 的提醒條件只看有沒有入金列，入金 1,418 會被當成存過，由 5.2 補正。

- [x] 5.1 記入金表單改用實際轉帳算抵先墊（Requirement: Deposit offsets pending advance；design「入金金額是實際轉帳，抵先墊補到本月 10,000」）：`openExpenseModal` 依入金日期所屬月份算本月還差 D，抵先墊 `min(待抵, max(0, D − 填的金額))`，試算列顯示待抵、本月還差、實際轉、抵先墊，改日期也更新；金額 0 只在抵先墊 > 0 時可送出；`index.ts` `addExpense` 寫 account（填的金額，> 0 時）與 own（抵先墊，> 0 時）。驗證：Playwright 攔截 `rpc/dating_map_save_expense`，以假資料跑 spec「offset boundaries」六列，送出的 own／account 金額與表一致（最後一列顯示錯誤訊息、沒有送出）
- [x] 5.2 本月入金提醒預填實際轉帳（Requirement: Monthly deposit reminder prefills the transfer、Requirement: Offset deposit counts as contribution）：提醒條件改為本月入金合計 < `LEDGER_MONTHLY_DEPOSIT`；按鈕文案「{誰} 這月實際轉 $N」或「{誰} 這月全用先墊抵」，點了開入金表單預填 N，不直接寫入。驗證：Playwright 以假資料（小黃待抵 8582、阿康待抵 15000、皆未入金）讀到「小黃 這月實際轉 $1,418」「阿康 這月全用先墊抵」，點小黃按鈕後表單金額為 1418、沒有任何 save 請求；小黃只有 own 入金 10000 時不出現提醒 [after: 5.1]
- [x] 5.3 更新 CLAUDE.md 公帳段落：入金填實際轉帳、抵先墊補到本月 10,000、金額 0 的條件、提醒按鈕預填。驗證：Grep CLAUDE.md 含「實際轉帳」與「本月還差」 [after: 5.2]
