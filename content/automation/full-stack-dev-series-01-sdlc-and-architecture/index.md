---
title: "全端開發實錄系列 01：SDLC 與架構評估"
cardTitle: "全端開發實錄 01：SDLC 與架構"
date: 2026-04-26T13:30:00+08:00
tags: ["SDLC", "Architecture", "Planning", "Full-stack"]
categories: ["Coding", "Diary"]
draft: false
description: "從 SDLC 到技術選型：建立不走彎路的專案起手式。"
---
這篇是《全端開發實錄》系列的第 1 篇，聚焦在專案開始前最重要的兩件事：**流程框架**與**技術選型**。

---

## 為什麼先講 SDLC？

很多專案卡住，不是因為不會寫程式，而是順序錯了。  
SDLC（Software Development Life Cycle）就是幫你把順序排好：

1. 計畫
2. 需求分析
3. 解法設計
4. 實作
5. 測試
6. 部署
7. 維護

如果你在需求還不清楚時就直接實作，後面幾乎一定重工。

---

## 技術評估要先回答的問題

### 1) 平台定位

你是要做：

* 手機端（Mobile）
* 電腦端（Web/Desktop）
* 還是兩者都要？

平台不同，資料輸入方式、登入流程、甚至部署策略都會不同。

### 2) 資料儲存

早期不一定要上完整資料庫，可先用：

* Google Sheets / Airtable / Notion（低成本快速驗證）
* MySQL / PostgreSQL（正式產品更穩定）

重點不是「用最強」，而是「用最適合目前階段」。

### 3) 身分驗證與權限

初期最常見且好維護的作法：

* Google OAuth（省去自建密碼系統）
* OTP（手機或信箱二次驗證）

---

## 一句話總結

先把流程與選型做對，後面每一行程式碼都會比較省。

---

## 系列導覽

* [02：規格驅動與開發環境](../full-stack-dev-series-02-spec-and-env/)
* [03：資料庫、Git、API 與測試策略](../full-stack-dev-series-03-db-git-api-test/)
* [04：Claude Code 與開發核心觀念](../full-stack-dev-series-04-claude-code-and-fundamentals/)
* [05：除錯與爬蟲基礎](../full-stack-dev-series-05-debug-and-scraping/)
* [06：pytest 與安全檢查上線流程](../full-stack-dev-series-06-pytest-and-security/)
