---
title: "全端代書控案系統 - 開發實錄"
date: 2026-03-21T15:52:21+08:00
tags: ["SDLC", "Database", "Deployment", "Full-stack", "Project Management"]
categories: ["Coding", "Diary"]
draft: false
description: "新增筆記心得幫助我以後做專案可以用"
---
這裡是未來專案開發時可以隨時參考的筆記心得與架構指南。

---

## 一、軟體開發生命周期 (SDLC)

每個專案都應該遵循這個流程，避免走彎路：

1. **計畫**：釐清現況、找出落差並設定期待的目標。
2. **需求分析**：深度分析使用者的需求與痛點。
3. **解法設計**：設計能填補「現況」與「期待」落差的整體架構。
4. **實作**：開始撰寫程式碼並建立系統。
5. **測試**：確保系統功能正常運作，排查邊界案例與錯誤。
6. **部署**：將系統發布到正式環境，並上線提供使用。
7. **維護**：持續監控系統，更新與修復後續的問題。

---

## 二、技術與架構評估（對應 SDLC：計畫 & 需求分析）

在動手前先決定要用什麼工具，避免中途換技術造成浪費。

### 平台定位

* **手機端 (Mobile)**
* **電腦端 (Desktop / Web)**

### 資料儲存

* **Notion** (透過 API 作為簡易後台或資料庫)
* **本機上傳** (檔案儲存處理)

### 資料庫選擇 (DB Options)

依專案複雜度選型，不要過度工程化：

* **輕量級 / No-Code**：Google Sheets, Airtable, Notion
* **關聯式 / 專業資料庫**：MySQL, PostgreSQL（現代化開發推薦使用 Supabase）

### 權限管理與身分驗證 (Auth)

* 首選：**Google OAuth**（快速且免去密碼管理負擔）
* 進階防護：**OTP (One-Time Password)**，手機或信箱驗證

---

## 三、規格驅動開發（對應 SDLC：解法設計）

架構決定後，**先寫規格，再寫程式碼**。這是 AI 協作開發的核心原則。

### 什麼是 OpenSpec？

OpenSpec 是一套**規格驅動開發 (Spec-Driven Development)** 的工具，核心理念是「先定義合約，再開始實作」，確保 AI 與開發者之間有共同依據。

### 初始化：`openspec init`

在新專案根目錄開啟終端機執行：

```bash
npx openspec init
```

執行後會引導你完成設定，並在專案中產生規格文件結構。

---

## 四、開發環境建置（對應 SDLC：實作準備）

規格確認後，建置本機開發環境。

### Node.js 基礎環境

前端或全端開發皆需依賴 Node.js 生態。安裝完成後，確認是否正確掛載到環境變數：

```bash
node -v
```

*(成功安裝時，會回傳版本號，如 `v22.x.x`)*

> ⚠️ **注意**：需先確認 Node.js 環境已安裝，才能使用 `npx openspec init`。

---

## 五、網域與部署策略（對應 SDLC：部署）

### 購買網域平台

* **推薦**：Cloudflare, Gandi
* **不推薦**：GoDaddy（⚠️ 續約費用昂貴且推銷多）

### 部署平台選擇

* **推薦（免費或低成本）**：
  * **Zeabur**（部署簡單快捷，對開發者友善）
  * **Google Apps Script**（適合自動化小工具與排程）
  * **GitHub Pages**（適合純靜態網站）
  * **Cloudflare Pages**（不想公開程式碼的前端或全端部署，效能極佳）
* **較不推薦（下次可換）**：
  * **Vercel / Render**
  * **三大公有雲：GCP, AWS**（設定繁瑣，不適合初期快速疊代）

> 💡 **總結**：雖然這次使用 **Vercel** 部署，下次強烈建議嘗試 Zeabur 或 Cloudflare Pages，配置彈性更好、長遠維護更輕鬆。

---

## 六、資料庫設計原則（對應 SDLC：解法設計 & 實作）

良好的資料庫設計能避免後期大規模重構。

### 設計前要問的問題

* 資料之間的關係是什麼？（一對一、一對多、多對多）
* 哪些欄位會被頻繁查詢？（考慮建立索引）
* 資料量預期多大？（影響技術選型）

### 命名慣例

* 資料表：小寫 + 底線，用**複數**（`case_records`、`users`）
* 欄位：小寫 + 底線（`created_at`、`client_name`）
* 主鍵：統一用 `id`（自動遞增整數或 UUID）
* 外鍵：`{資料表單數}_{id}`，例如 `user_id`

### 常見欄位模板

每張資料表建議都加上這三個欄位，方便追蹤：

```sql
id         SERIAL PRIMARY KEY,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### Supabase 快速上手提醒

* 在 Dashboard 建好資料表後，記得開啟 **Row Level Security (RLS)**。
* 使用 Supabase JS Client 時，查詢語法接近 SQL，很直覺。
* `.env` 中放 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`，不要 commit 進 Git。

---

## 七、版本控制與 Git 工作流程（對應 SDLC：實作）

### 基本分支策略

```text
main        → 正式環境（穩定版本）
dev         → 開發整合分支
feature/xxx → 單一功能開發
fix/xxx     → 臭蟲修復
```

### Commit 訊息格式（Conventional Commits）

```text
feat: 新增案件查詢功能
fix: 修正日期格式解析錯誤
refactor: 重構 API 回傳結構
docs: 更新 README 安裝說明
chore: 升級套件版本
```

> 💡 **好習慣**：每完成一個小功能就 commit，不要等到一大包再提交，出問題時更容易回溯。

### 常用指令速查

```bash
git checkout -b feature/xxx   # 建立新功能分支
git add -p                    # 逐段暫存，避免誤提交
git stash                     # 暫存目前工作，切換分支用
git log --oneline --graph     # 視覺化分支歷史
```

---

## 八、API 設計原則（對應 SDLC：解法設計）

### RESTful 路由慣例

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET | `/api/cases` | 取得所有案件 |
| GET | `/api/cases/:id` | 取得單一案件 |
| POST | `/api/cases` | 新增案件 |
| PUT | `/api/cases/:id` | 完整更新案件 |
| PATCH | `/api/cases/:id` | 部分更新案件 |
| DELETE | `/api/cases/:id` | 刪除案件 |

### 回傳格式統一

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

失敗時：

```json
{
  "success": false,
  "data": null,
  "error": "錯誤描述訊息"
}
```

> 💡 回傳格式統一，前端處理邏輯更簡單，也方便之後接 AI 工具做自動化。

---

## 九、測試策略（對應 SDLC：測試）

不需要測試所有東西，但核心流程一定要涵蓋。

### 優先測試的三種情境

1. **Happy Path**：正常情況下，系統是否如預期運作？
2. **Edge Case**：邊界值（空字串、null、超大數字）會不會炸？
3. **Error Handling**：API 失敗或網路中斷時，系統怎麼反應？

### 測試工具推薦

* **後端 API**：Postman 或 Thunder Client（VS Code 插件）
* **前端元件**：Vitest + Testing Library
* **End-to-End**：Playwright（模擬真實使用者操作）

### AAA 測試結構

每個測試案例都遵循三段式，邏輯清晰：

```text
Arrange  → 準備測試資料與環境
Act      → 執行要測試的動作
Assert   → 驗證結果是否符合預期
```

---

## 十、OpenSpec 工作流程速查（AI 協作開發）

在這個專案中使用 Claude Code + OpenSpec 進行規格驅動開發，以下是常用指令。

### 終端機指令（openspec config）

查看與修改 OpenSpec 全域設定。

```bash
openspec config list          # 查看所有目前設定值
openspec config get <key>     # 取得特定設定值
openspec config set <key> <value>  # 修改設定值
openspec config unset <key>   # 移除設定，恢復預設值
openspec config reset         # 重設所有設定為預設值
openspec config path          # 顯示設定檔位置
openspec config edit          # 用 $EDITOR 直接開啟設定檔編輯
```

> ⚠️ 目前 `--scope` 只支援 `global`，尚無 project-level 設定。

### 強制啟動 OpenSpec（Claude Code 對話框）

在 Claude Code 對話框輸入：

```text
/opsx
```

這會強制進入 OpenSpec 工作流程，即使沒有現有規格也能從頭開始。

### 完整指令速查表

| 指令 | 用途 |
| --- | --- |
| `/opsx:new` | 開始一個新變更，逐步建立規格工件 |
| `/opsx:ff` | 快速產生所有規格工件（Fast Forward） |
| `/opsx:continue` | 繼續進行中的變更，建立下一個工件 |
| `/opsx:apply` | 依規格執行實作任務 |
| `/opsx:verify` | 驗證實作是否符合規格 |
| `/opsx:archive` | 封存已完成的變更 |
| `/opsx:explore` | 探索模式，釐清需求後再開始 |
| `/opsx:sync` | 將 delta spec 同步至主規格 |

### 推薦工作流程順序

```text
探索需求         → /opsx:explore
建立規格         → /opsx:new 或 /opsx:ff
實作功能         → /opsx:apply
驗證成果         → /opsx:verify
封存歸檔         → /opsx:archive
```

> 💡 **原則**：不確定要做什麼時，先用 `/opsx:explore` 思考清楚，再動手。規格先行，程式碼後行。

---

## 十一、維護與上線後監控（對應 SDLC：維護）

### 上線檢查清單

* [ ] 環境變數（`.env`）是否全部在正式環境設定完成？
* [ ] 資料庫 Migration 是否執行？
* [ ] CORS 設定是否只允許必要網域？
* [ ] 錯誤日誌（Error Logging）是否接上（Sentry 或 console）？
* [ ] 有沒有設定自動備份？

### 常見維運工具

* **錯誤追蹤**：Sentry（免費方案夠用）
* **使用者行為分析**：Google Analytics 4 或 Umami（自架、隱私友善）
* **正常時間監控**：UptimeRobot（免費，定時打 API 確認服務存活）

### 後續疊代原則

> 「能上線的系統才是好系統，完美的系統是不存在的。」

每次疊代前先問：

1. 這個改動解決了什麼真實痛點？
2. 最小可行的改法是什麼？
3. 有沒有可能搞壞現有功能？
