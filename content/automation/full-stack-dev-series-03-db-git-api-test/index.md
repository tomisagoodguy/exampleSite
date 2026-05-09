---
title: "全端開發實錄系列 03：資料庫、Git、API 與測試策略"
date: 2026-04-26T13:32:00+08:00
tags: ["Database", "Git", "API", "Testing"]
categories: ["Coding", "Diary"]
draft: false
description: "實作期最核心的四件事：資料設計、版本管理、介面定義、測試思維。"
---
這篇把實作期最容易失控的四個面向放在一起：資料庫、Git、API、測試策略。

---

## 資料庫設計原則

資料表先設計好，後面會少很多補丁。

設計前先問：

* 這筆資料的唯一識別是什麼？
* 有沒有一對多 / 多對多關係？
* 哪些欄位是必填、哪些可空值？
* 讀多寫少還是寫多讀少？索引要放哪裡？

---

## Git 工作流程（避免協作地雷）

推薦至少做到：

* 功能分支開發
* 小步提交（每次 commit 聚焦單一目的）
* PR 前先自測
* 合併前做 code review

版本控制不只是備份，而是讓團隊能安全協作。

---

## API 設計原則

好的 API 要做到三件事：

1. 命名一致（資源導向）
2. 回應格式穩定（成功/失敗結構固定）
3. 錯誤可除錯（有明確狀態碼與訊息）

當 API 可預測，前後端都會輕鬆很多。

---

## 測試策略（不是只有「有沒有壞」）

至少覆蓋三層：

* 單元測試（函式/模組）
* 整合測試（模組間互動）
* 端對端測試（真實流程）

先定義「什麼叫可上線」，測試才有標準。

---

## 一句話總結

資料、版本、介面、測試是實作期的四根樑柱，缺一根都會晃。

---

## 系列導覽

* [01：SDLC 與架構評估](../full-stack-dev-series-01-sdlc-and-architecture/)
* [02：規格驅動與開發環境](../full-stack-dev-series-02-spec-and-env/)
* [04：Claude Code 與開發核心觀念](../full-stack-dev-series-04-claude-code-and-fundamentals/)
* [05：除錯與爬蟲基礎](../full-stack-dev-series-05-debug-and-scraping/)
* [06：pytest 與安全檢查上線流程](../full-stack-dev-series-06-pytest-and-security/)
