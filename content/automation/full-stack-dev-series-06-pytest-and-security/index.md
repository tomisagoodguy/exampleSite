---
title: "全端開發實錄系列 06：pytest 與安全檢查上線流程"
cardTitle: "全端開發實錄 06：pytest 與安全"
date: 2026-04-26T13:35:00+08:00
tags: ["pytest", "Security Review", "SAST", "Deployment Checklist"]
categories: ["Coding", "Diary"]
draft: false
description: "從測試案例到安全上線門檻，建立可重複執行的品質流程。"
---
這篇是系列收尾，目標是把「可用」提升到「可放心上線」。

---

## 為什麼選 pytest？

Python 專案中，`pytest` 很適合快速建立測試文化：

* 語法簡潔
* 錯誤訊息清楚
* 生態完整（可擴充）

---

## 測試案例最小集合（建議）

每個功能至少覆蓋：

1. 正常路徑（Happy Path）
2. 邊界值（Boundary）
3. 例外情境（Error Path）

並在測試內寫清楚註解：測什麼、為何測、預期是什麼。

---

## 常用 pytest 指令

* `pytest`：跑全部測試
* `pytest -q`：精簡輸出
* `pytest -k "keyword"`：只跑特定測試
* `pytest -x`：第一個失敗就停

---

## Security Review 的固定流程

每次上線前固定跑：

1. AI 安全審查（人工 + AI 雙檢）
2. Security linter / SAST
3. 套件弱點掃描（依賴風險）
4. 外部視角弱點掃描（暴露面）

關鍵檢查重點：

* 程式碼是否出現 API key / token
* 權限管理是否有 Broken Access Control 風險
* 是否存在注入攻擊入口
* 是否有 Security Misconfiguration

---

## 事故追查需要的最小紀錄

至少要留：

* 登入/權限拒絕紀錄
* 關鍵資料異動紀錄
* 例外與錯誤 log（可對應 request id）

沒有紀錄，就很難事後調查與止血。

---

## 一句話總結

測試保證功能品質，安全檢查保證上線品質，兩者缺一不可。

---

## 系列導覽

* [01：SDLC 與架構評估](../full-stack-dev-series-01-sdlc-and-architecture/)
* [02：規格驅動與開發環境](../full-stack-dev-series-02-spec-and-env/)
* [03：資料庫、Git、API 與測試策略](../full-stack-dev-series-03-db-git-api-test/)
* [04：Claude Code 與開發核心觀念](../full-stack-dev-series-04-claude-code-and-fundamentals/)
* [05：除錯與爬蟲基礎](../full-stack-dev-series-05-debug-and-scraping/)
