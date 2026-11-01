## Context

公帳 `dating_map_ledger` 的支出付款方式 `own` 原本叫「自己先墊」。本變更前兩版（255900b、9fe74a1）做了「先墊待抵＝未勾 own 支出 − own 入金」、入金時自動抵扣並補到 `LEDGER_MONTHLY_DEPOSIT`、本月入金提醒。使用者說明兩人沒有規定每次入金多少，公帳主要記消費習慣，對方要補錢也可以。目前資料：沒有任何 own 入金列（2026-11-01 查詢）。

## Goals / Non-Goals

**Goals:**

- 記帳只有「誰付的」一個選擇，自己付不需要任何後續動作
- 公帳餘額等於公帳帳戶（銀行＋信用卡未繳）實際的錢
- 看得到兩人出資差多少，補錢沿用入金

**Non-Goals:**

- 不強制或提醒補錢，不設每月入金目標的提醒
- 不改資料表欄位、`dating_map_save_expense` 簽章
- 不追蹤補錢對應哪幾筆自己付

## Decisions

### 自己付算付款人出資，不扣公帳餘額

Supersedes「抵先墊記成 method = own 的入金列」「入金表單拆兩列由前端完成」「入金金額是實際轉帳，抵先墊補到本月 10,000」「待抵公式保留「已勾先墊」排除」。自己付的錢沒有從公帳帳戶出去，所以餘額計算排除 `method = 'own' and checked = false` 的支出；`checked = true` 的舊資料代表公帳已轉回過，照樣扣。替代方案「自己付時自動補一筆同額入金」：多一列、流水變亂，且刪支出時要連動刪入金，否決。

### 餘額影響與顯示正負分開

`signed()` 仍負責流水的 +／− 顯示（自己付照樣顯示 −，代表花掉的錢），另立 `potEffect()` 只給餘額計算用。若直接改 `signed()`，自己付會顯示成 $0。

### 出資差額只顯示，補錢就是入金

每人出資＝入金合計＋未勾自己付合計（截至某日）。核對頁顯示到今天、回顧頁顯示到該月底；差額句「{多的人}多出 $X，{少的人}存 $X 進公帳就打平」。補錢不需要新種類。

### 對銀行餘額的 own_pending 改公式

Supersedes 本變更先前同名決策的待抵公式。`dating_map_save_balance` 的 `book_balance` 排除未勾自己付，`own_pending` 存 0；前端 `checkpointDiff` 照舊扣 `own_pending`（新核對點為 0，資料庫目前沒有任何核對點）。

## Implementation Contract

**餘額**：`balanceThrough` / `balanceAt` 與所有用它的地方（統計卡「公帳餘額」、回顧、預測、核對）都改用 `potEffect`。回顧與文字摘要的「本月結餘」＝入金 − 公帳付的花費（不含未勾自己付），並註明自己付金額。

**名稱**：付款方式選項與流水 meta 由「先墊」改「自己付」。

**移除**：`ownAdvance` / `ownPendingTotal` / 試算列 `#adv-lf-offset` / `offsetPlan` / 金額 0 特例 / `ExpenseModalResult.offset` / `addExpense` 拆列 / 本月入金提醒與 `data-ledger-deposit` 按鈕 / 抵先墊列的標題與 meta / 核對頁「👛 先墊待抵」/ 回顧「月底還待抵」文案。

**出資顯示**：核對頁最上方與回顧頁一個框「🤝 誰出了多少」：每人「出了 $T（入金 $D＋自己付 $S）」，下面一句差額或「一樣多」。

**資料庫**：`dating_map_save_balance` CREATE OR REPLACE，簽章不變、無 DROP。

**驗收**：tsc 與 `yarn build` 通過；Playwright 用真實資料（攔截寫入）讀到統計卡公帳餘額 $17,848、核對頁「阿康 出了 $10,060」「小黃 出了 $18,582」「小黃多出 $8,522」；記入金 1418 只送出一筆 account 1418、表單沒有試算列、金額 0 被拒；頁面沒有入金提醒；對銀行餘額填 20000／2152 顯示對得上；退款仍會存。SQL 在交易中呼叫等效查詢驗 `book_balance` = 17848 後 rollback。

**月預估與趨勢圖**（使用者 2026-11-01 確認一併拿掉）：`forecastMonth` 的月底餘額不再加「還沒記的入金」，改只扣公帳付的花費速度（排除自己付）；趨勢圖拿掉每月入金虛線與說明；刪除 `LEDGER_MONTHLY_DEPOSIT`。

## Risks / Trade-offs

- [255900b、9fe74a1 上線期間若有人記了抵先墊列] → 2026-11-01 查詢為 0 列；實作時再查一次，有的話先問使用者再刪
- [舊的已勾自己付會扣餘額，跟新規則不同] → 目前沒有已勾的自己付；保留是為了不讓歷史餘額改變

## Migration Plan

1. 套用 `dating_map_save_balance` migration
2. push 前端
3. 不需資料遷移；回滾：還原前端 commit 並以 9fe74a1 時的函式定義重新 CREATE OR REPLACE

## Open Questions

（無）
