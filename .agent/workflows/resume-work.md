---
name: resume-work
description: Resume work on the project by reading context files. 當開啟新對話、輸入 `/resume-work` 或要求「繼續工作」時啟用。
version: 1.1.0
---

# 專案續作流程 (Resume Work)

當使用者輸入 `/resume-work` 或要求「繼續工作」時，請執行以下步驟以確保上下文完全同步。

## 1. 環境定錨 (Context Anchoring)

- [ ] 讀取 `README.md`：確認專案目標、技術棧與核心功能。
- [ ] 讀取 `docs/DEVELOPMENT.md`：確認最後進度、已知 Bug 與接下來的任務。
- [ ] 巡檢 `.agent/rules.md`：確認目前的開發規範與工作流連結。

## 2. 狀態恢復

- [ ] 查看最近的 Git Commit：確認最後變動的實體檔案。
- [ ] 檢查待辦清單：從 `DEVELOPMENT.md` 提取「NEXT」任務。

## 3. 匯報與行動

- 向導演摘要目前的狀態。
- 提出下一個具體的行動計畫。
