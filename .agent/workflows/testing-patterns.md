---
name: testing-patterns
description: 實施標準化的測試策略。當使用者要求「寫測試」、「補測試」或進行 TDD 開發時啟用，引導使用 AAA 模式與 Factory Pattern。
version: 1.1.0
---

# 測試代碼撰寫標準

當使用者要求「寫測試」、「補測試」或進行 TDD 開發時，請遵守以下規範。

## 1. 核心哲學：TDD (測試驅動開發)

如果是新功能開發，請嚴格遵守：

1. **紅 (Red)**：先寫一個會失敗的測試（描述預期行為）。
2. **綠 (Green)**：寫出剛好能通過測試的最少代碼。
3. **重構 (Refactor)**：優化代碼結構，確保測試依然通過。

## 2. 測試結構：AAA 模式

所有測試案例 (Test Case) 必須清晰區分為三個區塊：

- **Arrange (準備)**：設定測試資料、Mock 物件、渲染元件。
- **Act (執行)**：執行要測試的動作（點擊、呼叫函數）。
- **Assert (斷言)**：驗證結果是否符合預期。

## 3. 測試資料工廠 (Factories over Fixtures)

- 避免使用寫死的 JSON Fixtures（難以維護）。
- 優先使用 Factory Pattern 來動態產生測試資料。
- 每個測試只覆寫它關心的欄位，其他欄位使用預設值。

## 4. Mocking 規則

- 外部相依性（API 呼叫、資料庫）**必須**被 Mock。
- 內部邏輯（Utils、Helpers）盡量**不要** Mock，以測試真實整合行為。
- 驗證 Mock 是否被呼叫 (Expected calls)，而不僅僅是回傳值。

## 5. 輸出範例

```typescript
it('should submit form when valid', async () => {
  // Arrange
  const user = userFactory.build();
  render(<LoginForm />);

  // Act
  await userEvent.type(screen.getByLabelText(/email/i), user.email);
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));

  // Assert
  expect(handleSubmit).toHaveBeenCalledWith({ email: user.email });
});
```
