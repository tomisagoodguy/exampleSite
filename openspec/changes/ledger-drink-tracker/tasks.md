## 1. 資料庫

- [x] 1.1 依「用布林欄位 is_drink 標記，不靠分類或備註」與「新增 16 參數 overload，不用獨立 RPC」，用 migration 新增 `dating_map_ledger.is_drink` 與 `dating_map_save_expense` 16 參數版，滿足 Requirement: Expense can be marked as a drink 的資料層。驗證：SQL 以 16 參數寫入 `is_drink = true`、`kind = 'deposit'` 時存 false、15 參數修改已標記的列後仍為 true，測完刪掉測試列
- [x] 1.2 [after: 1.1] 依「復原時補上缺少的 is_drink」更新 `dating_map_restore_expense`，滿足 Requirement: Drink mark survives history and restore 的復原行為。驗證：SQL 分別復原有標記的刪除紀錄，以及 `old_row` 沒有 `is_drink` 的紀錄，兩者都成功且值正確，測完清掉測試列與紀錄
- [x] 1.3 [after: 1.1] 依「飲料甜點預設勾選，舊帳一次回填」回填現有 `cafe` 支出，滿足 Requirement: Existing cafe expenses are backfilled。驗證：SQL 查 `is_drink = true` 只有 2026-11-01 與 2026-11-03 兩筆，其他支出為 false

## 2. 前端

- [x] 2.1 [after: 1.1] 讓 `LedgerEntry`、`saveExpense` 帶 `is_drink`，`openExpenseModal` 支出顯示 🧋 寶寶的飲料勾選、入金與調整隱藏且存 false，流水列 meta 顯示標記；新增時選 `cafe` 自動勾選、換分類取消，手動動過後不再跟分類，修改既有帳不自動變動，完成 Requirement: Expense can be marked as a drink 的介面。驗證：Playwright 假資料攔截 RPC，確認新增、修改、切入金、自動勾選後手動取消時送出的 `p_is_drink`
- [x] 2.2 依「週次與次數由前端從流水計算」新增 `LEDGER_DRINK_WEEKLY_LIMIT`、`weekStart`、`drinkWeeks`，滿足 Requirement: Weekly drink count。驗證：Playwright 假資料確認週日／週一分屬兩週、跨月的週合計 2、負數退款不計
- [x] 2.3 [after: 2.1, 2.2] 依「用杯子與長條圖呈現，超過用珊瑚色」與「回顧卡片放進趨勢圖區」加流水頂端杯子進度與回顧卡片（8 週長條圖、上限線、守住幾週、月次數與花費、幾天沒喝），滿足 Requirement: Drink count display。驗證：Playwright 確認當月顯示、其他月份不顯示、3／2 第三杯珊瑚色且無彈窗、今天喝過、當月無紀錄時卡片仍在；白天／夜晚與 390px 截圖檢查
- [x] 2.4 [after: 2.1] 在改帳紀錄加「寶寶的飲料」欄位與是／否文字，完成 Requirement: Drink mark survives history and restore 的顯示。驗證：Playwright 假資料的 history 列顯示「寶寶的飲料」由是改否

## 3. 收尾

- [x] 3.1 [after: 1.2, 1.3, 2.3, 2.4] 更新 CLAUDE.md「💰 公帳」段，記錄 `is_drink`、16 參數 overload、飲料甜點預設勾選與計次規則，並把舊的「13／15 參數兩個 overload」改成實際的 15／16 參數。驗證：`yarn build` 與 CLAUDE.md 的 tsc 指令通過，`grep adventure-map.bundle static/assets/*.js` 無命中
