## Why

公帳的「自己先墊」目前規定月底由阿康從公帳帳戶轉回給先墊的人，每月要多轉帳一次，而且一筆先墊只能整筆勾「已轉回」。兩人決定改成：先墊的錢直接從下次入金扣掉，扣不完的留到下個月繼續扣。

## What Changes

- 每個人新增一個「先墊待抵」金額＝他先墊的支出（`method = 'own'`、尚未以舊方式勾「已轉回」）合計 − 他「抵先墊」入金合計
- 新增「抵先墊」入金：`kind = 'deposit'`、`method = 'own'` 的一列，代表這部分入金已經直接付給店家，沒有轉進銀行
- 記入金表單選了某人且他有待抵時，顯示「待抵 $X → 這次抵 $Y、實際轉 $Z」；存檔時寫成「抵先墊」與「實際轉帳」（`method = 'account'`）兩列，金額為 0 的那列不寫
- 一次最多抵「這次入金金額」，超過的部分留在待抵，下個月入金時再抵
- 「✅ 核對」的「👛 先墊待還」改成顯示每人待抵金額與計算式，不再逐筆打勾
- **BREAKING（規則）**：移除「月底由公帳轉回先墊」的流程與文案；已用舊方式勾過「已轉回」的先墊照舊排除在待抵之外
- 對銀行餘額：`dating_map_save_balance` 存的 `own_pending` 與前端的「先墊待還」改用待抵公式
- 修改既有的「抵先墊」入金時保留 `method = 'own'`，不被表單改回 `account`

## Non-Goals (optional)

（寫在 design.md）

## Capabilities

### New Capabilities

- `ledger-own-advance-offset`: 公帳先墊以入金抵扣、待抵金額計算、對銀行餘額時的先墊待抵

### Modified Capabilities

（無：目前沒有公帳相關的既有 spec）

## Impact

- 前端：src/apps/adventure-map/ledger.ts（記一筆表單入金模式、核對頁先墊區塊、對銀行餘額的先墊計算、流水列的「抵先墊」標示）、src/apps/adventure-map/index.ts（入金存檔時多寫一列）
- 資料庫：RPC `dating_map_save_balance` 的 own_pending 計算（CREATE OR REPLACE，簽章不變）；`dating_map_save_expense` 已接受入金用 `method = 'own'`，不需修改
- 文件：CLAUDE.md 公帳段落（`method` 欄位說明、核對說明）、記憶 project_couple_ledger_rules
- 資料：目前只有小黃兩筆未勾的先墊（1,782、6,800），沒有需要遷移的舊資料
