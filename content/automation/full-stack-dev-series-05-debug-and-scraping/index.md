---
title: "全端開發實錄系列 05：除錯與爬蟲基礎"
date: 2026-04-26T13:34:00+08:00
tags: ["Debug", "Web Scraping", "Playwright", "Troubleshooting"]
categories: ["Coding", "Diary"]
draft: false
description: "從『沒錯誤訊息』到『判斷靜態/動態網站』，建立可落地的問題排查流程。"
---
這篇整理你原文後段最實戰的兩塊：除錯方法與爬蟲判斷流程。

---

## 沒有錯誤訊息時，先做什麼？

原則：**先確認有沒有執行，再確認執行內容對不對。**

建議排查順序：

1. 加 `console.log` 確認函式是否真的被呼叫
2. 確認非同步流程是否漏 `await`
3. 檢查 `try/catch` 是否吞錯誤
4. 確認寫入目標（ID、sheet name、range）是否正確

除錯本質是縮小範圍，不是猜答案。

---

## 網路爬蟲第一步：分辨靜態 / 動態

### 靜態網站

在頁面原始碼看得到資料：  
可用 `requests + BeautifulSoup`（Python）直接抓。

### 動態網站

原始碼看不到資料：  
先到瀏覽器 Network 分頁找 Fetch/XHR，定位 API 端點。

如果 Network 也抓不出關鍵資料，再使用無頭瀏覽器（例如 Playwright）模擬操作。

---

## 實務速查流程

1. 先看原始碼有沒有資料
2. 沒資料就看 Network
3. 找到 API 就直接打 API
4. 找不到才上 Playwright

---

## 一句話總結

先判斷、再下手，會比直接寫程式快很多。

---

## 系列導覽

* [01：SDLC 與架構評估](../full-stack-dev-series-01-sdlc-and-architecture/)
* [02：規格驅動與開發環境](../full-stack-dev-series-02-spec-and-env/)
* [03：資料庫、Git、API 與測試策略](../full-stack-dev-series-03-db-git-api-test/)
* [04：Claude Code 與開發核心觀念](../full-stack-dev-series-04-claude-code-and-fundamentals/)
* [06：pytest 與安全檢查上線流程](../full-stack-dev-series-06-pytest-and-security/)
