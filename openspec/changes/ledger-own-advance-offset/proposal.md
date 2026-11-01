## Why

公帳的「自己先墊」原本規定月底由公帳轉回，之後一度改成「下次入金抵扣、補到每月一萬」。但兩人其實沒有規定每次入金多少，公帳主要是記錄消費習慣，抵扣與每月一萬的假設都沒有依據。改成：自己付的錢就算那個人出的錢，系統只顯示兩人出資差多少，要不要補由兩人自己決定。

## What Changes

- `method = 'own'` 改名「自己付」：照樣算進花費與消費統計，**不扣公帳餘額**（錢沒從公帳帳戶出去），不再有轉回、待抵或抵扣
- 公帳餘額＝入金＋調整−支出（不含未勾的自己付）；對銀行餘額＝銀行−卡費未繳−帳上餘額，`dating_map_save_balance` 跟著改，`own_pending` 存 0
- 核對頁與回顧頁顯示每人累計出資（入金＋自己付）與差額，例如「小黃多出 $8,522，阿康想打平可以存 $8,522 進公帳」；補錢就是記一筆入金
- **BREAKING（取代本變更前兩版）**：移除先墊待抵、抵先墊入金、入金試算與拆列、金額 0 的特例、「本月入金還沒滿」提醒；入金只記實際轉帳一列

## Non-Goals (optional)

（寫在 design.md）

## Capabilities

### New Capabilities

- `ledger-self-paid`: 自己付的支出算付款人出資、公帳餘額不扣、出資差額顯示、入金只記實際轉帳

### Modified Capabilities

（無：目前沒有公帳相關的既有 spec）

## Impact

- 前端：src/apps/adventure-map/ledger.ts（餘額計算、出資計算、核對頁、回顧頁、記一筆表單、提醒）、src/apps/adventure-map/index.ts（入金存檔回到單列）、src/apps/adventure-map/data.ts（付款方式名稱）
- 資料庫：RPC `dating_map_save_balance` 的 `book_balance` / `own_pending`（CREATE OR REPLACE，簽章不變）
- 資料：2026-11-01 查詢沒有任何 `method = 'own'` 的入金列（抵先墊），不需遷移
- 文件：CLAUDE.md 公帳段落、記憶 project_couple_ledger_rules
