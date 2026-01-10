---
name: onboarding
description: 啟動新任務或任務重啟時的上下文初始化。建立任務追蹤文件以確保持續性。當使用者提到「開始新任務」、「開發新功能」或輸入 `/onboarding` 時啟用。
version: 1.1.0
---

# 任務初始化與追蹤 (Task Onboarding)

當開始一個「新功能開發」或「複雜重構」時，請執行此 SOP。

## 1. 建立任務文件

在 `.agent/tasks/[YYYY-MM-DD]-[TASK-NAME].md` 建立追蹤檔案。

## 2. 寫入初始化資訊

- **目標 (Goal)**：一句話描述要達成的成果。
- **技術決策 (Decisions)**：預計採用的方案與原因。
- **檔案衝擊 (Impact)**：預計會影響的檔案清單。
- **驗證方式 (Verification)**：如何證明任務已完成？

## 3. 持續性恢復 (On-going Context)

如果任務橫跨多次對話，每次開始前請先讀取該任務文件。
