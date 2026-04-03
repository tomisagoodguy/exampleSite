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

> [!IMPORTANT]
> **🌟 特別標註：核心 Git 指令操作**
>
> | 指令 | 說明 |
> | --- | --- |
> | `git status` | 看狀態，找路徑複製 |
> | `git add` | 暫存變更 |
> | `git commit -m '<訊息>'` | 寫訊息 + 提交 |
> | `git log` | 看目前有的提交（長版） |
> | `git log --oneline` | 看目前有的提交（短版） |
> | `git restore <檔案路徑>` | 捨棄變更，回到上個提交 |
> | `git restore --source <提交識別碼> <檔案路徑>` | 捨棄變更，回到特定提交 |
> | `git push` | 推送到雲端 |

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

---

## 十二、Claude Code 使用手冊（AI 協作開發核心技能）

> 這部分記錄在 Claude Code（Claude CLI + Agentic 介面）中實際操作時最常用到的功能，包含快速鍵、外掛機制、自動化 Hooks、MCP 整合、多重代理與時光倒流功能。

---

### 12.1 常用快速鍵（Keyboard Shortcuts）

在 Claude Code 的互動介面中，以下快速鍵能大幅提升操作效率：

| 快速鍵 | 功能說明 |
| --- | --- |
| `Ctrl + C` | 中斷目前正在執行的代理任務 |
| `Ctrl + L` | 清除對話畫面（不影響上下文記憶） |
| `↑ / ↓` | 瀏覽歷史指令 |
| `Esc` | 取消目前輸入，回到前一狀態 |
| `Enter` | 送出訊息 |
| `Shift + Enter` | 在訊息中換行（不送出） |
| `Tab` | 斜線指令自動補全（`/` 後按 Tab） |

> 💡 **補充**：在 VS Code 或 Cursor 的捷徑鍵環境下，`Ctrl+Shift+P` 開啟指令面板後輸入 `Claude` 可以直接呼叫插件功能。

---

### 12.2 實用資源連結

| 工具 / 資源 | 說明 | 連結 |
| --- | --- | --- |
| **Claude Marketplaces** | Claude Code Plugin 社群市集，2900+ 插件一鍵安裝 | [claudemarketplaces.com](https://claudemarketplaces.com/) |
| **Context7** | 即時抓取最新套件文件注入 LLM | [context7.com](https://context7.com/) |
| **Claude Code 官方文件** | Anthropic 官方 Claude Code 完整說明 | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |

---

### 12.3 斜線指令速查（Slash Commands）

在對話框中輸入 `/` 開頭的指令可觸發內建功能或自訂 Workflow：

#### 內建系統指令

| 指令 | 功能說明 |
| --- | --- |
| `/init` | 初始化專案：Claude 會自動掃描整個 Codebase，生成 `CLAUDE.md` 作為專案記憶檔 |
| `/plugins` | 列出所有目前已載入的插件（MCP Servers）清單，確認連線狀態 |
| `/memory` | 查看與管理 Claude 的專案記憶內容（來自 `CLAUDE.md`） |
| `/cost` | 顯示目前對話累計消耗的 Token 與費用 |
| `/model` | 切換使用的 AI 模型（如 Sonnet / Opus） |
| `/help` | 顯示所有可用指令的說明 |
| `/clear` | 清除對話歷史，開啟全新上下文 |

#### `/init` 詳細說明

```bash
# 在專案根目錄執行，讓 Claude 認識你的 Codebase
> /init
```

**執行後 Claude 會：**

1. 掃描目錄結構、主要檔案與 `package.json` / `pyproject.toml`
2. 識別技術堆疊（Next.js、FastAPI、Supabase 等）
3. 自動生成或更新 `CLAUDE.md`，記錄專案架構摘要
4. 後續對話中 Claude 可直接引用這份記憶，無需每次重新說明背景

> ⚠️ **注意**：每當專案結構有重大改變（新增模組、更換框架）時，重新執行 `/init` 讓記憶保持最新。

#### `/plugins` 詳細說明

```bash
# 確認目前載入哪些 MCP 插件
> /plugins
```

**輸出範例：**

```text
✅ filesystem  - 本機檔案讀寫
✅ github      - GitHub 倉庫操作
✅ supabase    - 資料庫直連
✅ puppeteer   - 無頭瀏覽器自動化
❌ slack       - 未連線（缺少 Token）
```

---

### 12.3 Hooks（自動化觸發機制）

Hooks 是 Claude Code 的**事件驅動自動化**功能，讓你可以在特定時間點自動執行腳本，無需手動介入。

#### 核心概念

```text
事件發生 → Hook 被觸發 → 自動執行腳本 → 結果回饋給 Claude
```

#### 支援的 Hook 事件類型

| Hook 類型 | 觸發時機 | 常見用途 |
| --- | --- | --- |
| `PreToolCall` | Claude 準備呼叫工具**前** | 安全審查、記錄請求 |
| `PostToolCall` | 工具執行**完畢後** | 自動格式化、送出通知 |
| `PreCompact` | 對話即將壓縮**前** | 備份關鍵上下文 |
| `Stop` | Claude 完成回覆**後** | 自動執行測試、送 Slack 通知 |

#### 設定方式（`settings.json`）

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "yarn test --passWithNoTests"
          }
        ]
      }
    ],
    "PostToolCall": [
      {
        "matcher": "Write|Edit|Create",
        "hooks": [
          {
            "type": "command",
            "command": "yarn lint --fix"
          }
        ]
      }
    ]
  }
}
```

> 💡 **實戰建議**：
>
> * 用 `Stop` Hook 在每次 Claude 完成任務後**自動跑測試**，確保沒有破壞現有功能。
> * 用 `PostToolCall` 配合 `matcher: "Write|Edit"` **自動 Lint**，省去手動格式化步驟。

---

### 12.4 MCP（Model Context Protocol）

MCP 是 Claude 與外部工具、服務之間的**標準化通訊協議**，讓 AI 能直接操作真實世界的系統。

#### 一句話理解MCP

> MCP = **AI 的 USB 插槽**。你插入什麼工具（MCP Server），AI 就能操作什麼系統。

#### MCP 的組成

```text
┌─────────────┐         MCP 協議          ┌──────────────────┐
│  Claude     │ ←─────────────────────→  │  MCP Server      │
│  (Host)     │   標準化的 Tools / Prompts │  (外部服務介面)    │
└─────────────┘                          └──────────────────┘
                                                  │
                              ┌───────────────────┼──────────────────┐
                              ▼                   ▼                  ▼
                         GitHub API         Supabase DB         本機檔案系統
```

#### 常用 MCP Server 一覽

| MCP Server | 功能 | 設定關鍵字 |
| --- | --- | --- |
| `filesystem` | 讀寫本機檔案 | `allowedDirectories` |
| `github` | Repo、PR、Issue 管理 | `GITHUB_TOKEN` |
| `supabase` | 直接下 SQL、管理 RLS | `SUPABASE_URL` + `SERVICE_KEY` |
| `puppeteer` | 無頭瀏覽器操作 | 無需額外設定 |
| `postgres` | 直連 PostgreSQL 查詢 | `DATABASE_URL` |
| `slack` | 發送訊息到 Slack 頻道 | `SLACK_BOT_TOKEN` |
| `memory` | 跨對話的持久記憶圖譜 | 自動管理 |

#### 加入 MCP Server（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxx"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname/Projects"]
    }
  }
}
```

> ⚠️ **安全提醒**：`env` 中的 Token 不要 commit 進 Git，應從 `.env` 或系統環境變數讀取。

---

### 12.5 Agents 與 Subagents（多重代理架構）

Claude Code 支援**主代理 (Agent)** 呼叫**子代理 (Subagent)** 的多層架構，讓複雜任務可以拆分並行執行。

#### 概念圖

```text
主代理 (Orchestrator)
  ├── 子代理 A：分析現有程式碼
  ├── 子代理 B：研究外部文件
  └── 子代理 C：執行測試驗證
          ↓
    彙整結果 → 主代理輸出最終答案
```

#### Agent vs Subagent 差異

| 特性 | Agent（主代理） | Subagent（子代理） |
| --- | --- | --- |
| **角色** | 任務規劃、協調決策 | 執行具體的單一任務 |
| **上下文** | 持有完整對話歷史 | 有獨立的隔離上下文 |
| **工具使用** | 可呼叫所有工具與 Subagents | 受限於指派的工具範圍 |
| **典型任務** | 「幫我開發一個新功能」 | 「讀取這個檔案並分析依賴」 |

#### 實際應用場景

##### 場景一：並行分析多個檔案

```text
主代理：「幫我 Review 這個 PR 的所有變更檔案」
  ├── Subagent 1：分析 api/users.ts
  ├── Subagent 2：分析 components/UserCard.tsx
  └── Subagent 3：分析 tests/users.test.ts
→ 主代理彙整三者的 Review 意見
```

##### 場景二：研究 + 實作分工

```text
主代理：「整合第三方支付 API」
  ├── Subagent 1：爬取 API 官方文件，整理欄位規格
  └── Subagent 2：分析現有程式碼，找出整合切入點
→ 主代理擁有完整資訊後開始實作
```

#### 在 Claude Code 中觸發多代理

複雜任務下，Claude Code 會**自動**決定是否啟用子代理。你也可以在 Prompt 中明示：

```text
請用並行方式分析 src/api/ 目錄下的所有路由檔案，
各自獨立評估後，彙整安全性建議。
```

> 💡 **最佳實踐**：涉及多個獨立模組、多來源資料整合、或獨立的驗證步驟時，主動提示「並行」讓 Claude 分工處理，速度可大幅提升。

---

### 12.6 Rewind（時光回溯）

Rewind 是 Claude Code 的**對話狀態回滾**功能，讓你可以「倒帶」到某個特定對話節點，從那個時間點重新出發，不用整個對話重來。

#### 什麼時候用 Rewind？

| 情境 | 說明 |
| --- | --- |
| Claude 走偏方向 | 連續幾輪後發現思路不對，想回到分叉點重試 |
| 測試不同方案 | 想從同一起點嘗試 A 方案和 B 方案，比較結果 |
| 誤操作補救 | Claude 意外刪改了不該動的檔案，回到操作前的狀態 |
| 功能範疇擴大 | 原本只改一個 Bug，現在想從頭重新規劃整個修法 |

#### 使用方式

在 Claude Code 介面中，每一輪對話的**左側**會有一個「時鐘圖示」，點擊即可進入 Rewind 模式：

1. **選擇要回滾的節點**：點選對話歷史中任意一輪訊息旁的 Rewind 按鈕
2. **確認回滾**：Claude Code 會提示你即將捨棄回滾點之後的所有對話
3. **重新出發**：從選定節點繼續，輸入新的指令嘗試不同方向

> ⚠️ **注意**：Rewind 只回滾**對話上下文**，不會自動撤銷已執行的檔案修改或終端機指令。如果需要同時回復檔案，要搭配 `git stash` 或 `git checkout` 使用。

#### 搭配 Git 使用（推薦工作流）

```bash
# 在啟動複雜任務前，先建立 Git 快照
git stash  # 或
git commit -m "chore: snapshot before AI session"

# 若 Claude 走偏，先 Rewind 對話，再回滾程式碼
git checkout HEAD  # 回到最後一個 commit
# 或
git stash pop      # 還原 stash 的工作狀態
```

> 💡 **黃金組合**：**Rewind（對話回滾）** + **`git stash`（程式碼快照）** = 完整的 AI 開發保險機制，讓你可以大膽嘗試，出錯也能完整復原。

---

### 12.7 快速鍵完整速查（更新版）

除了 12.1 的基礎快速鍵，以下是 Claude Code 互動介面的完整操作快速鍵：

| 快速鍵 | 說明 | 使用場景 |
| --- | --- | --- |
| `!` | 進入 Bash 模式，直接輸入 shell 指令 | 臨時跑指令、不想切換終端機時 |
| `@` | 提及特定檔案或資料夾 | 要 Claude 讀取某個檔案時，直接選取比打路徑快 |
| `\` | 換行，輸入多行訊息（不送出） | 撰寫包含程式碼區塊的複雜 Prompt |
| `Esc` | 中斷目前操作 | Claude 走偏時立即停止 |
| `Esc x2` | 開啟 Rewind 選單，回溯對話狀態 | 方向不對時快速倒帶 |
| `Ctrl+R` | 顯示完整輸出 context | 確認 Claude 看到哪些資訊、除錯時用 |
| `Ctrl+V` | 貼上圖片 | 直接把截圖或 UI 稿貼給 Claude 分析 |
| `Ctrl+T` | 查看目前 Tasks / Todos | 確認 Claude 目前的工作進度清單 |
| `Ctrl+B` | 把目前任務移到背景執行 | 長時間任務（跑測試、建置）丟背景，繼續問其他問題 |
| `Shift+Tab` | Auto-accept，自動核准工具呼叫 | 信任 Claude、要快速連續執行工具時開啟 |

---

### 12.8 Slash 指令完整速查（補充）

補充 12.3 中未收錄的指令分類：

#### Context 管理

| 指令 | 功能 | 使用場景 |
| --- | --- | --- |
| `/compact` | 壓縮 context，釋放 token | 對話很長、context 快滿時，保留重要資訊繼續工作 |
| `/context` | 視覺化 context 使用量 | 評估還剩多少空間，決定是否壓縮 |
| `/resume` | 恢復上一次對話 | 隔天重開 Claude Code，接回昨天的工作 |
| `/branch` | 從目前對話建立分支 | 同一問題想試兩種方向，各自實驗 |
| `/rewind` | 回溯到之前的對話狀態 | 某次修改搞壞了，回到之前的乾淨狀態 |

#### 模型與效能控制

| 指令 | 功能 | 使用場景 |
| --- | --- | --- |
| `/fast` | 快速模式（同模型、更快輸出） | 輸出速度慢時切換，**不換模型** |
| `/effort` | 調整推理強度 | 簡單任務降低強度省 token，複雜架構決策提高強度 |

#### 開發輔助

| 指令 | 功能 | 使用場景 |
| --- | --- | --- |
| `/diff` | 查看未 commit 的變更 | commit 前確認自己改了哪些東西 |
| `/pr-comments` | 讀取 GitHub PR 評論 | 收到 code review，讓 Claude 直接讀評論並修改 |
| `/btw` | 附帶問題，不消耗主要 context | 順便問個小問題，不想浪費對話空間 |
| `/loop` | 排程重複執行任務 | 定期跑某指令，例如每 5 分鐘監控 build 狀態 |
| `/voice` | 語音模式（支援 20 種語言） | 雙手忙碌、口述需求時使用 |

#### 環境管理

| 指令 | 功能 | 使用場景 |
| --- | --- | --- |
| `/add-dir` | 新增工作目錄 | 同時管理多個 Repo 或 Monorepo 子模組 |
| `/sandbox` | 沙箱環境 | 測試危險指令前先在隔離環境執行 |
| `/vim` | Vim 模式 | 習慣 Vim 鍵盤操作的使用者 |

---

### 12.9 Headless 模式（CI/CD 自動化）

Headless 模式讓 Claude 在**無互動介面**的環境下執行，適合 CI/CD Pipeline 或批次自動化任務。

```bash
# 基本用法：單次執行，印出結果
claude --print "修復所有 lint 錯誤"

# 輸出為 JSON 格式（方便 pipeline 解析）
claude -p "分析程式碼品質" --output-format json

# 限制最多幾輪對話（避免無限迴圈）
claude -p "重構這個模組" --max-turns 5

# 從 stdin 讀取輸入（管線串接）
echo "解釋這段 code" | claude -p
```

#### 使用場景

| 場景 | 指令範例 |
| --- | --- |
| CI 自動修 lint | `claude -p "修復所有 ESLint 錯誤" --max-turns 3` |
| 自動生成 PR 說明 | `git diff main \| claude -p "為這個 diff 寫 PR description"` |
| 批次程式碼分析 | `claude -p "分析 src/ 所有 .ts 檔的安全問題" --output-format json` |
| 自動更新文件 | `claude -p "根據最新程式碼更新 README"` |

---

### 12.10 Git Worktrees（平行開發環境）

Git Worktrees 讓你在**同一個 Repo** 下同時維護多個工作目錄，不同分支可以同時開啟，Claude Agents 可以在不同 Worktree 中平行工作。

```bash
# 建立新的 worktree（同時建立新分支）
git worktree add ../feature-payment feature/payment

# 列出所有 worktree
git worktree list

# 移除已完成的 worktree
git worktree remove ../feature-payment
```

#### 適用情境

| 情境 | 做法 |
| --- | --- |
| 主線修 Bug + 同時開發新功能 | 建兩個 worktree，各自獨立，不互相污染 |
| 並行比較兩種實作方案 | A 方案一個 worktree，B 方案另一個，同時跑測試比較 |
| 多個 Claude Agent 平行重構 | 每個 Agent 指派到不同 worktree，工作完畢再合併 |

> 💡 **使用 `/batch` 指令**可讓 Claude 自動跨多個 worktrees 執行平行重構任務。

---

### 12.11 Hooks 完整事件清單（更新版）

補充 12.3 中的 Hooks 支援事件清單：

| Hook 事件 | 觸發時機 | 典型用途 |
| --- | --- | --- |
| `PreToolUse` | 工具呼叫**前** | 阻擋危險指令（如 `rm -rf`），執行前先確認 |
| `PostToolUse` | 工具執行**完畢後** | 每次存檔後自動跑 lint 或格式化 |
| `UserPromptSubmit` | 使用者**送出提示後** | 自動補充 context（如當前分支名稱、時間戳） |
| `Notification` | 通知觸發時 | 轉發通知到 Slack 或系統桌面提示 |
| `Stop` | Claude 完成回覆**後** | 自動執行測試、自動 commit 或推送 |
| `SubagentStop` | 子代理完成**後** | 彙整子代理結果、記錄執行日誌 |
| `PreCompact` | Context 壓縮**前** | 備份關鍵上下文到外部檔案 |
| `SessionStart` | Session **開始時** | 自動載入環境變數、印出當日待辦事項 |
| `SessionEnd` | Session **結束時** | 自動 commit 工作進度、產生工作日誌 |

---

### 12.12 權限管理（Permissions）

Claude Code 提供三種權限模式，對應不同的工作場景：

| 模式 | 說明 | 適用情境 |
| --- | --- | --- |
| **Basic** | 常用開發指令允許，敏感檔案自動阻擋 | 日常開發，平衡便利與安全 |
| **Strict** | 最大限制，幾乎所有工具呼叫都需確認 | 操作生產資料庫或部署前的最後審查階段 |
| **Enterprise** | 透過 MCP 統一管控，企業級管理 | 團隊共用環境，確保所有人行為一致 |

#### 權限類型

```text
allow  → 直接執行，不詢問
ask    → 每次執行前彈出確認視窗
deny   → 直接拒絕，不執行
```

支援 **bash command pattern matching**，可針對特定指令設定細粒度規則：

```json
{
  "permissions": {
    "allow": ["git commit*", "yarn test*", "yarn lint*"],
    "ask": ["git push*", "rm *"],
    "deny": ["rm -rf *", "DROP TABLE*"]
  }
}
```

---

### 12.13 Checkpoint 與設定優先順序

#### Checkpoint（自動回溯點）

Claude Code 會**自動**在每次變更時建立 Checkpoint，讓你可以隨時回溯：

* 觸發方式：`Esc x2` 或輸入 `/rewind` 開啟回溯選單
* ⚠️ **限制**：透過 Bash 指令或**外部編輯器**（如 VS Code）的修改**不會**被 Checkpoint 捕捉，需搭配 `git stash` 手動快照

#### 設定檔載入優先順序（高 → 低）

當多個設定檔衝突時，以優先順序高的為準：

| 優先順序 | 設定檔路徑 | 說明 |
| --- | --- | --- |
| 1（最高） | `/etc/claude-code/managed-settings.json` | 企業 IT 管理員統一部署 |
| 2 | `.claude/settings.local.json` | 專案本地個人設定（不進 Git） |
| 3 | `.claude/settings.json` | 專案共用設定（進 Git，團隊共享） |
| 4（最低） | `~/.claude/settings.json` | 使用者全域預設值 |

#### 實際應用

```text
團隊共用規範  → .claude/settings.json（commit 進 Repo）
個人偏好覆蓋  → .claude/settings.local.json（加入 .gitignore）
企業強制政策  → /etc/claude-code/managed-settings.json（IT 部署）
```

---

## 十三、程式設計基礎：函數 (Function)

> 函數是程式設計中最重要的積木單元。理解函數，就掌握了「讓程式可以重複使用、易於維護」的核心能力。

---

### 13.1 什麼是函數？

**函數（Function）** 是一段有名字的程式碼區塊，專門負責完成某一件事。你只要呼叫它的名字，它就會執行那段程式碼，並且可以重複呼叫。

**生活類比**：想像函數是一台咖啡機。

* 你按下按鈕（呼叫函數）
* 機器磨豆、加水、加熱（執行內部邏輯）
* 吐出一杯咖啡（回傳結果）

你不需要知道機器內部怎麼運作，只需要知道「按按鈕、拿咖啡」。

---

### 13.2 函數的四個核心元素

| 元素 | 說明 | 範例 |
| --- | --- | --- |
| **函數名稱** | 函數的識別標籤，描述它做什麼 | `calculateTax` |
| **參數 (Parameters)** | 函數運作時需要的輸入資料 | `(price, taxRate)` |
| **函數本體** | 實際執行的邏輯程式碼 | `{ return price * taxRate }` |
| **回傳值 (Return Value)** | 函數執行完後吐回來的結果 | `return result` |

---

### 13.3 JavaScript / TypeScript 函數寫法

#### 基本函數

```typescript
// 定義函數
function greet(name: string): string {
  return `你好，${name}！`
}

// 呼叫函數
const message = greet("Tom")
console.log(message) // 輸出：你好，Tom！
```

#### 箭頭函數（Arrow Function）—— 現代 JS 常用寫法

```typescript
// 箭頭函數語法更簡潔
const add = (a: number, b: number): number => {
  return a + b
}

// 單行可省略 return 和大括號
const multiply = (a: number, b: number): number => a * b

console.log(add(3, 5))      // 8
console.log(multiply(4, 6)) // 24
```

#### 沒有回傳值的函數（void）

```typescript
// 只執行動作，不回傳資料
function logError(message: string): void {
  console.error(`[ERROR] ${message}`)
}

logError("資料庫連線失敗")
```

---

### 13.4 為什麼要用函數？

#### ❌ 沒有函數：重複程式碼，難以維護

```typescript
// 計算台北的稅金
const taipeiPrice = 1000
const taipeiTax = taipeiPrice * 0.05
console.log(`台北稅金：${taipeiTax}`)

// 計算新竹的稅金（完全相同的邏輯，複製貼上）
const hsinChuPrice = 2000
const hsinChuTax = hsinChuPrice * 0.05
console.log(`新竹稅金：${hsinChuTax}`)
```

#### ✅ 有函數：邏輯集中，一改全改

```typescript
// 把重複邏輯包成函數
function calculateTax(price: number, taxRate: number = 0.05): number {
  return price * taxRate
}

console.log(`台北稅金：${calculateTax(1000)}`)
console.log(`新竹稅金：${calculateTax(2000)}`)
// 若稅率調整，只需改函數內部一個地方
```

---

### 13.5 函數的三種常見用途

#### 1. 資料處理（轉換 / 計算）

```typescript
function formatCurrency(amount: number): string {
  return `NT$ ${amount.toLocaleString()}`
}

console.log(formatCurrency(50000)) // NT$ 50,000
```

#### 2. 條件判斷（封裝複雜邏輯）

```typescript
function isEligibleForDiscount(age: number, isMember: boolean): boolean {
  return age >= 65 || isMember
}

if (isEligibleForDiscount(70, false)) {
  console.log("享有折扣")
}
```

#### 3. 非同步操作（API 呼叫）

```typescript
// async/await 函數：處理需要等待的操作（如網路請求）
async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`)
  const data = await response.json()
  return data
}

// 呼叫非同步函數
const user = await fetchUserData("user-123")
```

---

### 13.6 函數設計原則

| 原則 | 說明 |
| --- | --- |
| **單一職責** | 一個函數只做一件事，不要塞太多邏輯 |
| **長度控制在 100 行以內** | 超過 100 行通常代表函數做了太多事，應拆分成更小的函數 |
| **命名清楚** | 函數名稱應描述它「做什麼」，如 `getUserById`、`sendEmail` |
| **參數不超過 3 個** | 超過時考慮改傳物件 `{ id, name, role }` |
| **純函數優先** | 相同輸入永遠得到相同輸出，沒有副作用，最易測試 |

#### 函數命名慣例

```typescript
// ✅ 動詞開頭，描述行為
function getUser() {}
function createCase() {}
function validateEmail() {}
function isLoggedIn() {}   // 回傳 boolean 用 is/has/can 開頭

// ❌ 名詞開頭或意義不明
function user() {}
function data() {}
function doStuff() {}
```

---

### 13.7 拆函數：何時該把一個函數切開？

當函數出現以下訊號，就是該拆的時候：

* **超過 100 行**：難以一眼看完整個邏輯
* **函數名稱需要「和」字**：如 `fetchDataAndRenderTable`，代表在做兩件事
* **巢狀縮排超過 3 層**：`if` 裡面包 `for` 再包 `if`，可讀性急速下降
* **同一段邏輯出現超過兩次**：重複就是拆函數的訊號

#### 拆函數前後對比

```typescript
// ❌ 拆之前：一個函數做太多事
async function handleOrder(orderId: string) {
  // 第一段：驗證訂單
  const order = await db.orders.findById(orderId)
  if (!order) throw new Error("訂單不存在")
  if (order.status !== "pending") throw new Error("訂單狀態錯誤")

  // 第二段：計算金額
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
  const tax = subtotal * 0.05
  const total = subtotal + tax

  // 第三段：發送通知
  await fetch("/api/notify", {
    method: "POST",
    body: JSON.stringify({ userId: order.userId, message: `訂單金額：${total}` })
  })
}

// ✅ 拆之後：每個函數只做一件事
async function validateOrder(orderId: string) {
  const order = await db.orders.findById(orderId)
  if (!order) throw new Error("訂單不存在")
  if (order.status !== "pending") throw new Error("訂單狀態錯誤")
  return order
}

function calculateTotal(items: OrderItem[]): number {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
  return subtotal * 1.05
}

async function notifyUser(userId: string, total: number) {
  await fetch("/api/notify", {
    method: "POST",
    body: JSON.stringify({ userId, message: `訂單金額：${total}` })
  })
}

// 主函數變得像一份清單，一眼看懂流程
async function handleOrder(orderId: string) {
  const order = await validateOrder(orderId)
  const total = calculateTotal(order.items)
  await notifyUser(order.userId, total)
}
```

---

### 13.8 拆檔案：何時該把一個檔案切開？

函數是最小單位，**檔案**是組織函數的容器。當一個檔案太龐大，就要按「職責」把函數搬到不同檔案。

#### 拆檔案的訊號

* **檔案超過 300～500 行**：難以導航與維護
* **檔案混雜了多種職責**：API 呼叫、資料轉換、UI 渲染全擠在一起
* **多個地方都需要引用同一個函數**：該函數應移至共用模組

#### 常見的檔案職責分層

```text
src/
├── api/          # 所有對外 API 呼叫（fetch、axios）
├── utils/        # 純函數工具（格式化、計算、驗證）
├── hooks/        # React 自訂 Hook（狀態邏輯）
├── components/   # UI 元件（只管畫面）
├── services/     # 業務邏輯（組合 api + utils）
└── types/        # TypeScript 型別定義
```

#### 拆檔案前後對比

```typescript
// ❌ 拆之前：所有東西擠在 orderPage.tsx（500+ 行）
// - fetch 邏輯
// - 金額計算
// - 日期格式化
// - JSX 渲染

// ✅ 拆之後：各司其職
// api/orderApi.ts      → 負責 fetch
// utils/formatDate.ts  → 負責格式化
// utils/calcOrder.ts   → 負責計算
// components/OrderCard.tsx → 負責渲染
// orderPage.tsx        → 只負責組裝以上模組（50 行以內）
```

> 💡 **判斷原則**：如果你需要滾動很多才能找到想改的地方，或者改一個功能要動好幾個地方——就是該拆檔案的時機。

---

---

### 13.9 主函數與子函數

拆函數之後，函數之間會自然形成「主從關係」：

* **主函數（Main Function）**：描述整體流程的高層函數，負責「指揮」，不處理細節
* **子函數（Helper / Sub Function）**：被主函數呼叫，專注處理單一細節的低層函數

#### 關係示意

```text
主函數
├── 子函數 A（處理步驟一）
├── 子函數 B（處理步驟二）
│   ├── 子子函數 B1
│   └── 子子函數 B2
└── 子函數 C（處理步驟三）
```

主函數讀起來像「目錄」，子函數才是真正執行的「內文」。

#### 實際範例：結帳流程

```typescript
// ── 子函數：各自負責一個細節 ──────────────────────

function getCartItems(userId: string): CartItem[] {
  // 從資料庫取得購物車內容
  return db.cart.findByUserId(userId)
}

function applyDiscount(subtotal: number, coupon: string): number {
  const discountMap: Record<string, number> = { SAVE10: 0.9, SAVE20: 0.8 }
  return subtotal * (discountMap[coupon] ?? 1)
}

function calcTax(amount: number): number {
  return amount * 0.05
}

async function chargePayment(userId: string, total: number): Promise<boolean> {
  const result = await paymentGateway.charge({ userId, amount: total })
  return result.success
}

async function sendReceipt(userId: string, total: number): Promise<void> {
  await emailService.send({ to: userId, subject: "訂單確認", body: `總金額：${total}` })
}

// ── 主函數：只描述流程，細節交給子函數 ───────────────

async function checkout(userId: string, coupon: string) {
  const items     = getCartItems(userId)
  const subtotal  = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const discounted = applyDiscount(subtotal, coupon)
  const total     = discounted + calcTax(discounted)
  const paid      = await chargePayment(userId, total)
  if (paid) await sendReceipt(userId, total)
}
```

光看 `checkout` 就能理解整個結帳流程，不需要看細節。

#### 主函數 vs 子函數 比較

| | 主函數 | 子函數 |
| --- | --- | --- |
| **職責** | 描述流程、協調步驟 | 執行單一具體任務 |
| **長度** | 通常 10～30 行 | 通常 5～20 行 |
| **可讀性** | 像流程圖，一眼看懂 | 像說明書，解釋細節 |
| **被呼叫** | 由外部（路由、事件）呼叫 | 由主函數呼叫 |
| **可重用性** | 低（針對特定情境） | 高（可跨場景共用） |

> 💡 **設計心法**：先寫主函數的「骨架」（只有呼叫子函數的那幾行），確認流程對了，再逐一實作每個子函數。這樣思路不會被細節淹沒。

---

> 💡 **記住這個心法**：每當你發現自己「複製貼上同樣的程式碼超過兩次」，就是該把它包成函數的時機。函數是對抗重複的最佳武器。
> 💡 **最佳實踐**：團隊在 `.claude/settings.json` 定義統一的 Lint 指令和權限規則，個人用 `.claude/settings.local.json` 覆蓋自己的模型偏好，兩者各司其職不互相干擾。

---

## 十四、標籤 (Tag)

「Tag」在開發中至少出現在兩個完全不同的場景：**HTML 標籤** 與 **Git 標籤**。兩者概念相似但用途不同。

---

### 14.1 HTML 標籤

HTML 標籤是網頁的骨架，告訴瀏覽器「這段內容是什麼」。

#### 基本語法

```html
<標籤名稱 屬性="值">內容</標籤名稱>
```

大多數標籤有**開始標籤**與**結束標籤**，結束標籤多一個 `/`：

```html
<p>這是一段文字</p>
<h1>這是標題</h1>
<a href="https://example.com">點我連結</a>
```

少數標籤是**自閉合標籤**，沒有內容也沒有結束標籤：

```html
<img src="photo.jpg" alt="照片說明" />
<input type="text" placeholder="請輸入文字" />
<br />
```

#### 常用標籤速查

| 標籤 | 用途 |
| --- | --- |
| `<h1>` ～ `<h6>` | 標題（數字越大字越小） |
| `<p>` | 段落文字 |
| `<a href="">` | 超連結 |
| `<img src="" alt="">` | 圖片 |
| `<div>` | 區塊容器（無語意） |
| `<span>` | 行內容器（無語意） |
| `<ul>` / `<ol>` / `<li>` | 無序清單 / 有序清單 / 清單項目 |
| `<table>` / `<tr>` / `<td>` | 表格 / 列 / 儲存格 |
| `<form>` / `<input>` / `<button>` | 表單 / 輸入框 / 按鈕 |
| `<nav>` / `<header>` / `<footer>` | 導覽列 / 頁首 / 頁尾（語意標籤） |
| `<main>` / `<section>` / `<article>` | 主內容 / 區塊 / 獨立文章（語意標籤） |

#### 標籤的屬性 (Attribute)

標籤可以附加屬性來提供額外資訊：

```html
<!-- class：套用 CSS 樣式 -->
<div class="card highlight">內容</div>

<!-- id：唯一識別，用於 JS 選取或錨點連結 -->
<section id="about">關於我們</section>

<!-- data-*：自訂資料屬性，傳給 JavaScript 使用 -->
<button data-user-id="123" data-action="delete">刪除</button>
```

#### 語意標籤 vs 無語意標籤

```html
<!-- ❌ 全用 div，搜尋引擎看不懂結構 -->
<div class="header">...</div>
<div class="nav">...</div>
<div class="content">...</div>

<!-- ✅ 語意標籤，對 SEO 和無障礙設計友善 -->
<header>...</header>
<nav>...</nav>
<main>...</main>
```

---

### 14.2 Git 標籤（Git Tag）

Git Tag 是版本控制中的「里程碑標記」，用來標記某個重要的 commit（通常是發布版本）。

**類比**：Git commit 是書中每一頁的頁碼，Git Tag 則是「第一章開始」、「第二章開始」這樣的章節標籤貼紙。

#### 兩種 Tag 類型

| 類型 | 說明 | 何時用 |
| --- | --- | --- |
| **Lightweight Tag** | 只是一個指向 commit 的指標，沒有額外資訊 | 臨時標記、個人使用 |
| **Annotated Tag** | 包含標記者、日期、描述訊息，有完整記錄 | 正式發布版本（推薦） |

#### 常用指令

```bash
# 建立 Annotated Tag（推薦）
git tag -a v1.0.0 -m "第一個正式發布版本"

# 建立 Lightweight Tag
git tag v1.0.0-beta

# 查看所有 Tag
git tag

# 查看特定 Tag 的詳細資訊
git show v1.0.0

# 推送單一 Tag 到遠端
git push origin v1.0.0

# 推送所有本地 Tag 到遠端
git push origin --tags

# 刪除本地 Tag
git tag -d v1.0.0

# 刪除遠端 Tag
git push origin --delete v1.0.0
```

#### 版本號命名規則（語意化版本 Semantic Versioning）

```text
v主版本.次版本.修補版本
  MAJOR . MINOR . PATCH

v1.0.0   → 首次正式發布
v1.1.0   → 新增功能（向下相容）
v1.1.1   → 修復 Bug（不影響功能）
v2.0.0   → 不向下相容的重大改版
```

#### 實際工作流程

```bash
# 開發完成，準備發布 v1.2.0
git checkout main
git pull --rebase

# 建立標籤並寫說明
git tag -a v1.2.0 -m "新增優惠券折扣功能，修復結帳金額計算錯誤"

# 推送程式碼與標籤
git push origin main
git push origin v1.2.0
```

> 💡 **HTML Tag vs Git Tag**：HTML Tag 標記「內容的性質」，Git Tag 標記「程式碼的版本位置」。兩者都是用「標籤」這個概念幫事物貼上有意義的名稱。

---

## 十五、沒有錯誤訊息時怎麼辦？

程式設計中最難除錯的情況不是「有錯誤訊息」，而是**程式毫無反應、也什麼都沒報錯**。這種狀況讓人完全不知從何下手。

---

### 15.1 為什麼沒有錯誤訊息？

常見原因：

* **錯誤被靜默吞掉**：`try/catch` 裡面什麼都沒寫，錯誤發生了但沒人知道
* **程式根本沒執行到那段**：觸發條件不符，函數從未被呼叫
* **非同步問題**：`await` 漏寫，函數跑完了但資料還沒回來
* **寫入位置錯誤**：程式執行成功，但結果寫到你沒在看的地方

---

### 15.2 萬用除錯句型（給 AI 或自己釐清問題）

遇到「毫無反應也無報錯」的情況，用這個格式描述問題，能快速釐清方向：

```text
# 現況
執行之後，程式毫無反應，也找不到任何錯誤訊息。

# 期待
執行之後，Google 試算表中「測試」工作表的 A 欄應該出現 XXX 資料。
```

**為什麼這個格式有效？**

* **現況**：逼自己說清楚「現在發生什麼」，排除主觀猜測
* **期待**：說清楚「正確結果長什麼樣」，給 AI 或同事一個具體的驗證目標

沒有這兩個資訊，任何人（包含 AI）都只能亂猜。

---

### 15.3 自己動手排查的步驟

#### 第一步：確認程式有沒有執行到

在懷疑的地方加上 `console.log`，確認程式流程有沒有跑到那裡：

```typescript
async function writeToSheet() {
  console.log("▶ writeToSheet 開始執行")   // ← 加這行

  const data = await fetchData()
  console.log("▶ fetchData 完成，data =", data)  // ← 加這行

  await sheet.write(data)
  console.log("▶ sheet.write 完成")  // ← 加這行
}
```

哪一行沒印出來，問題就在那之前。

#### 第二步：確認非同步沒有漏 `await`

```typescript
// ❌ 常見錯誤：忘記 await，函數直接結束，資料根本還沒寫入
function saveData() {
  fetchAndWrite()  // 沒有 await！
  console.log("完成")  // 這行會在 fetchAndWrite 結束前就印出來
}

// ✅ 正確寫法
async function saveData() {
  await fetchAndWrite()
  console.log("完成")
}
```

#### 第三步：確認 `try/catch` 沒有吞掉錯誤

```typescript
// ❌ 靜默吞錯：發生錯誤也不會有任何提示
try {
  await writeToSheet()
} catch (e) {
  // 什麼都沒寫
}

// ✅ 至少要印出來
try {
  await writeToSheet()
} catch (e) {
  console.error("writeToSheet 失敗：", e)
}
```

#### 第四步：確認寫入了「正確的地方」

```typescript
// 明確印出你以為在操作的目標
console.log("試算表 ID：", spreadsheetId)
console.log("工作表名稱：", sheetName)
console.log("寫入範圍：", range)
```

有時候程式完全正確，只是寫到另一個試算表、另一個工作表去了。

---

### 15.4 除錯心法

| 情況 | 第一個動作 |
| --- | --- |
| 程式毫無反應 | 加 `console.log` 確認函數有沒有被呼叫 |
| 有執行但結果不對 | 印出中間值，找出哪一步資料變錯了 |
| 偶爾正常偶爾不正常 | 懷疑非同步時序問題或外部 API 不穩定 |
| 本機正常但部署後不正常 | 比對環境變數、Node.js 版本、套件版本 |

> 💡 **核心原則**：除錯的本質是「縮小懷疑範圍」。從最外層開始確認，一層一層往內，直到找到第一個「不符合預期的地方」，那就是問題根源。
