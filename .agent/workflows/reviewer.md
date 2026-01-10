---
name: code-reviewer
description: 擔任資深程式碼審查員。檢查 TypeScript 嚴格模式、React 狀態模式、錯誤處理及安全性。當使用者要求「Review 程式碼」、「檢查這段扣」、「代碼審查」或提交 Pull Request 時使用此技能。
version: 1.1.0
---

# 專業 Code Review 標準 (TypeScript/React)

當使用者要求 Review 程式碼或提交 PR 審查時，請依照以下清單進行嚴格檢查。

## 審查檢查清單 (Review Checklist)

### 1. 邏輯與流程 (Logic & Flow)

- [ ] 邏輯一致性與控制流是否正確？
- [ ] 有沒有 Dead Code 或無效的邏輯分支？
- [ ] 非同步操作 (Async) 是否有 Race Condition 風險？

### 2. TypeScript 與代碼風格

- [ ] **嚴禁 `any`**：使用 `unknown` 或具體型別。
- [ ] 優先使用 `interface` 而非 `type`（除非是 Union/Intersection）。
- [ ] 變數命名：Component 使用 PascalCase，函數使用 camelCase。
- [ ] 避免使用 `as Type` 強制轉型，除非有充分理由。

### 3. 不可變性 (Immutability) & 純函數

- [ ] 禁止直接 Mutation（如 `items.push`），應使用 Spread operator (`[...items, newItem]`)。
- [ ] 避免深層巢狀 `if/else`，優先使用 Early Return。

### 4. UI 狀態處理 (Loading & Empty States) - **關鍵項目**

- [ ] **Loading 狀態**：只有在「沒有資料」時才顯示 Loading 畫面。
  - *Bad:* `if (loading) return <Spinner />` (會導致 Refetch 時畫面閃爍)
  - *Good:* `if (loading && !data) return <Skeleton />`
- [ ] **Empty 狀態**：列表 (List) 必須處理空資料的情況。
- [ ] **Error 狀態**：總是優先檢查錯誤。
- [ ] **正確順序**：Error → Loading (no data) → Empty → Success。

### 5. 錯誤處理 (Error Handling)

- [ ] **絕不可以靜默失敗 (Silent Errors)**。
- [ ] Mutation 操作必須有 `onError` 處理（Toast 通知 + Log）。

## 輸出格式

請將審查結果分為以下等級：

- 🔴 **Critical (必須修復)**：安全性問題、邏輯錯誤、破壞性更動。
- 🟡 **Warning (應該修復)**：效能問題、違反慣例、重複代碼。
- 🔵 **Suggestion (建議)**：命名優化、註解、可讀性提升。

請針對每一個問題提供：

1. 檔案位置與行號。
2. 問題描述。
3. **修正後的程式碼範例**。

## 範例 (Examples)

### 🔴 Critical: Mutation Problem

**問題**: 直接修改 state 陣列。

```tsx
// Bad
const addItem = (item) => {
  items.push(item);
  setItems(items);
};

// Good
const addItem = (item) => {
  setItems(prev => [...prev, item]);
};
```

### 🟡 Warning: UI State Order

**問題**: Loading 檢查放在 Error 之後，但沒有處理資料不存在的情況。

```tsx
// Bad
if (loading) return <Spinner />;
if (error) return <Error />;

// Good
if (error) return <ErrorMessage error={error} />;
if (loading && !data) return <Skeleton />;
```
