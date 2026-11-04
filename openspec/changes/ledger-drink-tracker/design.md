## Context

公帳流水表 `dating_map_ledger` 由 RPC `dating_map_save_expense` 寫入。資料庫目前只有 15 參數版（2026-11-04 查 pg_proc；CLAUDE.md 寫的 13 參數版已不存在）。row trigger `dating_map_ledger_log` 用 `to_jsonb` 記整列，新欄位會自動進改帳紀錄。`dating_map_restore_expense` 以 `jsonb_populate_record` 還原舊列。`fetchLedger` 用 `select('*')`，`scripts/backup-ledger.py` 也是 `select=*`，新欄位不用改這兩處。

現有資料（2026-11-04 查詢）：支出 7 筆，其中「飲料甜點」2 筆，都是阿康付款。使用者說明飲料幾乎都是寶寶喝的，阿康很少喝，所以付款人是阿康不代表是阿康喝的。

## Goals / Non-Goals

**Goals:**

- 記帳時一個勾選就完成統計，不用另外操作
- 一眼看得到本週次數與最近幾週的走勢，讓想戒糖的寶寶有感覺

**Non-Goals:**

- 不做提醒、推播、彈窗，也不寫責備文字
- 不估算含糖量：資料裡沒有糖度，不自己推算
- 不統計阿康的飲料，也不記杯數（一筆算一次）
- CSV 匯出不加欄位
- 不在介面上設定每週上限

## Decisions

### 用布林欄位 is_drink 標記，不靠分類或備註

新增 `is_drink boolean not null default false`。分類混了甜點和阿康喝的，備註關鍵字抓不到店名（例如「發發」）。替代方案獨立打卡表已由使用者否決。

### 新增 16 參數 overload，不用獨立 RPC

`dating_map_save_expense` 加一個 16 參數版，多 `p_is_drink boolean`，前端改呼叫它；15 參數版不動，也不需要含 DROP 的 SQL。15 參數版的 UPDATE 不碰 `is_drink`，所以快取舊 bundle 的頁面修改帳時不會洗掉標記。替代方案是比照 `dating_map_set_attrs` 開獨立 RPC，但新增一筆要寫兩次、不是原子操作，還會在改帳紀錄多一筆 update。

### 復原時補上缺少的 is_drink

欄位上線前的刪除紀錄 `old_row` 沒有 `is_drink`，`jsonb_populate_record` 會產生 null，違反 not null 讓復原失敗。`dating_map_restore_expense` 在 insert 前做 `v_row := '{"is_drink": false}'::jsonb || v_row`，有值的舊列不受影響。同簽章用 `CREATE OR REPLACE`。

### 飲料甜點預設勾選，舊帳一次回填

Supersedes 原 Non-Goal「不回填既有資料」。飲料幾乎都是寶寶喝的，預設勾選能減少漏記；分類仍混了甜點，所以只當預設值，不直接用分類計次。新增支出時，選到 `cafe` 就勾選、換成其他分類就取消，使用者手動動過勾選後，分類變動不再影響它。修改既有帳時不自動變動。migration 以 `update` 把 `kind = 'expense' and category = 'cafe'` 的列設為 true，共 2 筆（2026-11-04 查詢），trigger 會各記一筆改帳紀錄。

### 週次與次數由前端從流水計算

在 `ledger.ts` 新增純函式：`weekStart(day)` 回傳該日所在週的週一（`YYYY-MM-DD`），`drinkWeeks(entries, today, weeks)` 回傳最近幾週的 `{ start, count }`。全部用本地日期字串運算，不用 `toISOString`（UTC 會差一天）。統計跨全部 entries，不受目前檢視月份限制，所以跨月的週不會被切斷。退款（負數支出）不計入。

### 用杯子與長條圖呈現，超過用珊瑚色

Supersedes 原決策「超過上限只顯示數字、樣式不變」：使用者要求視覺化、讓寶寶有感覺。杯子是內嵌 SVG（Emoji 無法吃 token 上色），用 `--adv-*` 填色；上限內實心、未用的是虛線空杯，超過的杯子與長條用 `--adv-coral`。文字只陳述事實，正向鼓勵放在「🌱 已經 N 天沒喝」與「守住幾週」。長條圖沿用 `adv-trend` 的手刻 SVG 寫法，不加圖表套件。

### 回顧卡片放進趨勢圖區

`reviewHTML` 在當月無紀錄時會提早 return，只留 `charts`。卡片併入 `charts` 字串，兩條路徑都看得到；有任何流水就顯示，包含本週 0 次。

## Implementation Contract

**資料：** `dating_map_ledger.is_drink boolean not null default false`。`dating_map_save_expense` 16 參數版與 15 參數版行為相同，另外寫入 `is_drink`；`p_kind` 不是 `expense` 時一律存 false。

**前端型別：** `LedgerEntry.is_drink: boolean`，`LedgerInput` 繼承；`saveExpense` 傳 `p_is_drink`。`data.ts` 匯出 `LEDGER_DRINK_WEEKLY_LIMIT = 2`。

**計次規則：** `kind = 'expense'`、`is_drink = true`、`amount >= 0` 的一筆算一次，歸入 `spent_on` 所在的週一到週日。

**介面：**

- 表單：支出才顯示勾選「🧋 寶寶的飲料」，放在表單主區、不收在「更多」裡，修改時帶入原值；切到入金或調整時隱藏且存 false；新增時依「飲料甜點預設勾選，舊帳一次回填」跟著分類預設
- 流水列的 meta 顯示「🧋 寶寶的飲料」
- 流水頂端：檢視月份為當月時顯示杯子進度條，含「🧋 本週 N／2」與「🌱 已經 N 天沒喝」；杯數＝max(上限, N)
- 回顧卡片「🧋 寶寶的飲料」：同一條杯子進度、最近 8 週長條圖（虛線畫上限 2，超過的長條用珊瑚色）、「8 週守住 X 週」、檢視月份的次數與花費。日期只算 `spent_on` 不晚於今天的；從未標記過時不顯示「幾天沒喝」；今天喝過顯示「今天喝過」
- 改帳紀錄欄位標籤「寶寶的飲料」，值顯示是／否

**驗收：** `yarn build` 與 CLAUDE.md 的 tsc 指令通過；Playwright 以假資料驗證週界（11/1 週日與 11/2 週一分屬兩週）、跨月、超過上限、退款與手機 390px 版面；SQL 驗證 16 參數寫入、舊版更新保留標記、舊刪除紀錄可復原。

**範圍外：** Non-Goals 所列項目。

## Risks / Trade-offs

- [只統計有記帳的飲料] → 寶寶自己買沒記的不會算到；表單文案與說明不宣稱是完整紀錄，需要時用「自己付」補記
- [預設勾選把甜點算成飲料] → 勾選在表單上看得到，甜點手動取消；回填的 11/3「發發」不確定是不是飲料，修改那筆即可取消
- [多一個 overload 增加維護成本] → 沿用既有做法，前端只呼叫最新版；之後要清舊版時由使用者到 SQL Editor 手動 DROP
- [次數被當成監督工具] → 只用顏色呈現超過，不跳提醒、不寫責備文字，並放「幾天沒喝」與「守住幾週」的正向數字
