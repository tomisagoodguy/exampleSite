## Why

寶寶想戒糖，答應一週只喝兩次飲料，要做到一眼看得見次數、有感覺，而不是只有一個數字。現有「飲料甜點」分類混了甜點，也看不出是誰喝的（付款人不等於喝的人），所以無法直接拿分類筆數當次數。

## What Changes

- 公帳每筆支出多一個「🧋 寶寶的飲料」標記，在記一筆／修改表單勾選，任何分類的支出都能勾
- 目前飲料幾乎都是寶寶喝的，所以新增支出選到「飲料甜點」時自動勾好，甜點或阿康喝的再手動取消
- 上線時把現有「飲料甜點」支出回填成已標記
- 流水頂端（看當月時）顯示杯子圖示的本週進度「🧋 本週 N／2」，以及「🌱 已經 N 天沒喝」
- 回顧新增「🧋 寶寶的飲料」卡片：杯子進度、最近 8 週長條圖與上限線、守住幾週、這個月次數與花費
- 週一到週日算一週，一筆算一次；每週上限 2 是前端常數
- 超過上限時多出來的杯子與長條用珊瑚色，看得出來；不跳提醒、不寫責備文字（公帳定位是回顧，不是檢討）
- 改帳紀錄顯示這個欄位的變動；復原刪除的帳時保留標記

## Capabilities

### New Capabilities

- `ledger-drink-tracker`: 在公帳支出上標記寶寶的飲料，並統計每週次數

### Modified Capabilities

（無）

## Impact

- 資料庫：`dating_map_ledger` 新增欄位 `is_drink`；新增 `dating_map_save_expense` 16 參數 overload；`dating_map_restore_expense` 內容更新（同簽章，不含 DROP）
- 前端：src/apps/adventure-map/ledger.ts、src/apps/adventure-map/supabase.ts、src/apps/adventure-map/data.ts，src/apps/adventure-map/styles/list.css
- 文件：CLAUDE.md「💰 公帳」段
