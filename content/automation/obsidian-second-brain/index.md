---
title: "把 Hugo 網站變成 Obsidian 第二大腦"
date: 2026-10-24T00:00:00+08:00
description: "不用 Google Drive、不用 MCP，直接拿網站 repo 當 Obsidian 筆記庫：收件匣隨手記，再由 Claude Code 整理成文章。"
type: "post"
image: ""
draft: true
categories:
  - "【程式與生產力】"
tags:
  - "Obsidian"
  - "Claude Code"
  - "Hugo"
  - "第二大腦"
---

## 起因

看到 [Claude Code 懶人包](https://github.com/mathruffian-dot/claude-code-lazy-packs)（MIT 授權）裡的「Obsidian 第二大腦」兩集：把 vault 放在 Google Drive 同步，再裝 mcpvault MCP 讓 Claude 讀寫筆記，並用 Karpathy 式三層結構整理知識。

## 我的做法：不照裝，只借概念

| 懶人包 | 我的網站 |
| --- | --- |
| Google Drive 同步 | 已經用 git，不需要 |
| mcpvault MCP | Claude Code 直接讀寫 repo 檔案 |
| Clippings（輸入） | `notes-inbox/`，不在 `content/` 底下，不會發布 |
| 知識庫＋創作庫（消化、輸出） | `content/` 裡的文章 |

## 要注意的設定

- 關掉 Obsidian 的 `[[wikilink]]`，改用一般 Markdown 連結，Hugo 才看得懂
- 附件存在同一個資料夾，對應 Hugo 一篇文章一個資料夾的寫法

## 流程

1. Obsidian 按 Ctrl + N，在收件匣隨手記
2. 跟 Claude Code 說「消化 notes-inbox」，整理成文章草稿（`draft: true`）
3. 在 Obsidian 潤稿，改成 `draft: false`
4. Git push，網站自動更新

## 之後想做

- 用 `/schedule` 每週自動整理收件匣
