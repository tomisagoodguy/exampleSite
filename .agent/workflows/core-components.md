---
name: core-components
description: 專案 UI 元件庫使用指南。強制使用內部 Design System 元件，避免使用原生 HTML 標籤。當使用者要求「新增組件」、「調整頁面」或「開發 UI」時參考此規範。
version: 1.1.0
---

# Design System 使用規範

**原則：不要重新發明輪子。**
撰寫 UI 時，優先檢查是否已有現成元件。禁止直接寫死 CSS 或使用原生 HTML 標籤 (div, button, input)，除非元件庫不支援。

## 常用元件清單 (請根據專案更新)

### 佈局 (Layout)

- `<Box>`: 取代 `div`，用於區塊容器。
- `<Stack>`: 用於 Flex 排版。
- `<Grid>`: 用於網格排版。

### 互動 (Interactive)

- `<Button>`: 用於所有按鈕。支援 `variant="primary|secondary"`。
- `<TextInput>`: 取代 `input[type="text"]`。
- `<Modal>`: 彈出視窗標準元件。

### 回饋 (Feedback)

- `<Spinner>`: 載入中動畫。
- `<Toast>`: 浮動提示訊息。
- `<Alert>`: 頁面內警告區塊。

## 樣式覆寫

如果需要微調樣式，請使用元件的 `sx` 或 `style` props，避免寫額外的 CSS Class。
