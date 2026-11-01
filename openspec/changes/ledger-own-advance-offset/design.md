## Context

公帳（`dating_map_ledger`）的支出有三種付款方式，其中 `own`＝自己先墊。現行做法：先墊的支出 `checked = false` 代表「還沒從公帳轉回」，月底阿康從公帳帳戶轉回後勾成 `checked = true`。前端 `ledger.ts` 的核對頁「👛 先墊待還」逐筆打勾；對銀行餘額時「先墊待還」＝未勾的先墊支出合計，前端預覽與 RPC `dating_map_save_balance`（存 `own_pending`）各算一次。

兩人改為「先墊從下次入金扣，扣不完留到下個月」。限制：

- 一筆先墊可能大於一次入金（旅行住宿），整筆打勾無法表達「抵了一部分」
- `dating_map_save_expense` 對入金不限制 `method`，資料表 CHECK 允許 `own`，現有入金都是 `account`
- 不想動資料表欄位與 `dating_map_save_expense` 簽章

## Goals / Non-Goals

**Goals:**

- 每人的「先墊待抵」金額可以從流水直接算出，抵不完自動延到下個月
- 記入金時自動算出這次抵多少、實際轉多少，一次存好
- 對銀行餘額在抵扣後仍然對得上

**Non-Goals:**

- 不提供「由公帳轉回差額」的選項（兩人決定一律留到下個月）
- 不改資料表欄位、不新增 RPC、不改 `dating_map_save_expense`
- 不追蹤「哪一筆先墊被哪一次入金抵掉」，只算總額
- 編輯既有入金時不重新拆成兩列

## Decisions

### 抵先墊記成 method = own 的入金列

抵扣以一列 `kind = 'deposit'`、`method = 'own'` 記錄，金額＝這次抵掉的錢。待抵＝未勾先墊支出 − 抵先墊入金，純由流水計算。

替代方案：(a) 在入金列新增 `offset_amount` 欄位：要改資料表、RPC 簽章與型別，成本高；(b) 把先墊支出拆成已抵／未抵兩列：會改動使用者原本記的帳，分類、地點都要複製。選 own 入金是因為現有欄位與 CHECK 已允許、帳面語意正確（這部分入金確實沒進銀行、但算是貢獻），且 balance＝入金 − 支出的公式不用改。

### 待抵公式保留「已勾先墊」排除

已用舊規則勾 `checked = true` 的先墊代表公帳已經轉回過，若算進待抵會重複退。公式固定為 `Σ own 支出(checked = false) − Σ own 入金`。目前沒有已勾的先墊，此條只為相容。

### 入金表單拆兩列由前端完成

`openExpenseModal` 在新增入金、`paid_by` 有正待抵時顯示試算列，回傳結果多帶 `offset` 金額；`index.ts` 的 `addExpense` 先存抵先墊列、再存實際轉帳列（金額 0 的跳過），各自走 `saveExpense`，所以改帳紀錄、復原都逐列運作。替代方案是新增批次 RPC，為兩列不值得。

### 對銀行餘額的 own_pending 改公式

前端 `bankHTML` 的預覽與 `dating_map_save_balance` 都改為 `Σ own 支出(未勾) − Σ own 入金`（`spent_on ≤ 核對日`）。RPC 用 CREATE OR REPLACE，簽章不變，無 DROP。

## Implementation Contract

**待抵計算**：`ledger.ts` 匯出一個以 identity 與截止日（選填）計算待抵的函式，供核對頁、對銀行餘額預覽、記入金表單共用；結果可為 0 或負數（多抵時），顯示與抵扣只在大於 0 時發生。

**記入金表單**（新增模式、`kind = 'deposit'`）：選了 `paid_by` 且待抵 > 0 時，金額欄下方顯示「{誰}先墊待抵 $X → 這次抵 $Y，實際轉 $Z」，金額或人改變時即時更新；換成支出、調整或待抵為 0 時隱藏。`ExpenseModalResult` 的 save 結果增加 `offset: number`（非入金或編輯時為 0）。

**存檔**：`addExpense` 收到 `offset > 0` 時寫入抵先墊列（`method = 'own'`、備註「抵先墊」、與入金同日同人），再寫 `amount − offset`（> 0 時）的 `account` 入金列；toast 顯示「💰 {誰} 入金 $A（抵先墊 $Y，實際轉 $Z）」。任一列失敗照現有 `withPassphrase` 錯誤處理，已寫入的列保留在流水上可手動刪。

**流水標示**：own 入金列的 meta 顯示「抵先墊」而非「轉帳」，標題顯示「{誰} 抵先墊」。

**編輯**：既有入金送出時 `method` 保留原值（own 或 account），不拆列、不顯示試算。

**核對頁**：「👛 先墊待抵（下次入金時扣掉）」區塊列出待抵 ≠ 0 的人：「先墊 $A − 已抵 $B ＝ 待抵 $C」，下方以唯讀列出該人未勾先墊支出；移除逐筆「✓ 已從公帳轉回」勾選。核對分頁徽章＝未核對刷卡筆數 + 待抵 > 0 的人數。

**對銀行餘額**：預覽文案「先墊待抵」，`own_pending` 由 RPC 以新公式存。

**驗收**：`npx tsc`（CLAUDE.md 指令）與 `yarn build` 通過；Playwright 攔截 `rpc/dating_map_save_expense` 驗證 10000 對待抵 8582 送出 own 8582＋account 1418、對待抵 15000 只送 own 10000；SQL 呼叫 `dating_map_save_balance` 後讀回的 `own_pending` 符合新公式（在交易中測試後 rollback）。

**範圍外**：預測（`forecastMonth`）、回顧統計、CSV 不改程式，own 入金自動以入金計入。

## Risks / Trade-offs

- [兩列寫入不是原子操作，第二列失敗會只剩抵先墊列] → toast 顯示錯誤，流水可見並可手動補記或刪除；兩人帳量小，可接受
- [使用者手動記 own 入金或改 method 造成待抵為負] → 負數不觸發抵扣，核對頁照實顯示負值提示「多抵了」
- [舊的核對點 `own_pending` 是舊公式存的] → 2026-11-01 以 SQL 查詢 `dating_map_ledger_balances` 為 0 筆（實測），無舊值受影響；實作前再查一次

## Migration Plan

1. 套用 `dating_map_save_balance` 的 CREATE OR REPLACE migration
2. 部署前端（push 到 main，GitHub Actions 部署）
3. 不需資料遷移：現有兩筆小黃先墊（1,782、6,800）為未勾，自然成為待抵 8,582
4. 回滾：還原前端 commit，並以原 SQL 重新 CREATE OR REPLACE `dating_map_save_balance`

## Open Questions

（無）
