---
title: "全端開發實錄系列 02：規格驅動與開發環境"
date: 2026-04-26T13:31:00+08:00
tags: ["OpenSpec", "Spec-Driven", "Environment", "Node.js"]
categories: ["Coding", "Diary"]
draft: false
description: "先寫規格再寫程式，並建立穩定可重複的開發環境。"
---
這篇整理兩個會大幅降低重工率的習慣：**規格驅動開發**與**環境先行**。

---

## 先寫規格，再寫程式

如果需求沒被清楚定義，AI 與人都會邊做邊猜，最後很容易返工。

我推薦的做法是：

1. 先確認需求與邊界
2. 用規格文件定義輸入、輸出、限制
3. 才開始實作

在 OpenSpec 流程中，常見起手式：

```bash
npx openspec init
```

重點不是工具本身，而是「讓每一次實作都有可對照的依據」。

---

## 開發環境建置：把不確定性先移除

開始寫功能前，至少先確認：

* Node.js 版本可用（`node -v`）
* 套件管理工具一致
* 專案啟動與建置流程可重現

環境不一致是最常見的「我這邊可以、你那邊不行」來源。

---

## 部署與網域策略（初期版）

初期目標是：**快、穩、可迭代**。  
部署平台不用一步到位上最重的方案，先選能快速交付的組合即可。

---

## 一句話總結

規格讓你知道「要做什麼」，環境讓你穩定地「做得出來」。

---

## 系列導覽

* [01：SDLC 與架構評估](../full-stack-dev-series-01-sdlc-and-architecture/)
* [03：資料庫、Git、API 與測試策略](../full-stack-dev-series-03-db-git-api-test/)
* [04：Claude Code 與開發核心觀念](../full-stack-dev-series-04-claude-code-and-fundamentals/)
* [05：除錯與爬蟲基礎](../full-stack-dev-series-05-debug-and-scraping/)
* [06：pytest 與安全檢查上線流程](../full-stack-dev-series-06-pytest-and-security/)
