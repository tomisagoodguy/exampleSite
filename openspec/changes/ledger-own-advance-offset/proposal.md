## Why

公帳的「自己先墊」目前規定月底由阿康從公帳帳戶轉回給先墊的人，每月要多轉帳一次，而且一筆先墊只能整筆勾「已轉回」。兩人決定改成：先墊的錢直接從下次入金扣掉，扣不完的留到下個月繼續扣。

## What Changes

- 每個人新增一個「先墊待抵」金額＝他先墊的支出（`method = 'own'`、尚未以舊方式勾「已轉回」）合計 − 他「抵先墊」入金合計
- 新增「抵先墊」入金：`kind = 'deposit'`、`method = 'own'` 的一列，代表這部分入金已經直接付給店家，沒有轉進銀行
- 記入金時**填的是實際轉進銀行的錢**；系統依「本月還差多少才滿 10,000」自動算出要抵多少先墊（最多抵到待抵為止），表單顯示「待抵 $X、本月還差 $D → 實際轉 $T，抵先墊 $Y」；存檔寫成「實際轉帳」（`method = 'account'`）與「抵先墊」兩列，抵先墊為 0 就不寫
- 實際轉 0 元（先墊 ≥ 本月還差的錢）時，表單允許金額 0、只寫抵先墊列；超過的部分留在待抵，下個月再抵
- 本月「還沒存」提醒改為入金合計未滿 10,000 就提醒，按鈕顯示「這月實際轉 $N」（或「這月全用先墊抵」）並預填金額，仍要按存檔才記帳
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
