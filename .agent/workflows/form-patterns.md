---
name: form-patterns
description: 前端表單處理標準。當使用者提到「建立表單」、「處理輸入」或「驗證資料」時啟用。包含 Zod/Yup 驗證、UX 提交狀態與無障礙設計。
version: 1.1.0
---

# 表單開發標準 (Form Handling)

撰寫表單邏輯時，請遵守以下檢查清單。

## 1. Schema Validation (驗證)

- 邏輯與 UI 分離：使用 Zod 或 Yup 定義驗證規則，不要直接寫在 Component 裡。
- 驗證層級：
  - 即時驗證 (Client-side)：提供快速回饋。
  - 伺服器驗證 (Server-side)：作為最後防線。

## 2. 表單狀態 UX

- **IsSubmitting**：提交過程中必須鎖定按鈕 (Disable)，避免重複提交。
- **IsDirty**：偵測表單是否被修改，用於「未儲存離開」的提示。
- **Toast 通知**：成功或失敗都應有明確的 Toast 訊息。

## 3. 無障礙性 (A11y)

- 每個 Input 都要有對應的 Label (`htmlFor` 對應 `id`)。
- 錯誤訊息應使用 `aria-invalid` 和 `aria-describedby` 連結到 Input。

## 4. 範例結構 (React Hook Form + Zod)

```tsx
const schema = z.object({
  email: z.string().email(),
});

const LoginForm = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema)
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("email")} aria-invalid={!!errors.email} />
      {errors.email && <span role="alert">{errors.email.message}</span>}
      <button disabled={isSubmitting}>登入</button>
    </form>
  );
};
```
