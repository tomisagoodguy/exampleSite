---
title: "Excel VBA 學習筆記：環境設定與基礎"
date: 2025-09-21T00:00:00+08:00
description: "本筆記整理了 Excel VBA 的學習資源、環境設定、基礎語法與核心概念，適合作為入門學習參考。"
type: "post"
image: ""
categories:
  - "excel vba"
tags:
  - "VBA"
  - "Excel"
  - "環境設定"
  - "基礎概念"
---
*此為個人學習筆記，內容主要整理自相關課程與網路資源，僅供學習與參考之用。*

## 學習資源

> ### Excel VBA 金融資料抓取 | 打造股票研究系統

* **課程網站**：[Hahow 好學校](https://hahow.in/courses/5d2f3980fe9fef0021fac548)

## VBA 環境設置

在開始撰寫 VBA 程式碼之前，需要先設定好開發環境。

### 1. 開啟開發人員工具

若 Excel 功能區沒有顯示 **[開發人員]** 索引籤，請至 **[檔案]** > **[選項]** > **[自訂功能區]**，在右側將 **[開發人員]** 打勾。

### 2. 開啟 VBA 編輯器 (VBE)

*   **方法一**：點選 **[開發人員]** 索引籤中的 **[Visual Basic]** 按鈕。
*   **方法二**：使用快捷鍵 `Alt + F11`。

### 3. 開啟常用視窗

在 VBA 編輯器中，從 **[檢視]** 選單開啟以下常用視窗，以便於程式碼的撰寫與除錯：

*   **專案總管 (Project Explorer)** `(Ctrl+R)`：管理專案中的所有物件，如模組、工作表等。
*   **屬性視窗 (Properties Window)** `(F4)`：檢視與編輯所選物件的屬性。
*   **及時運算視窗 (Immediate Window)** `(Ctrl+G)`：用於即時測試程式碼或顯示變數值。
*   **區域變數視窗 (Locals Window)**：顯示目前程序中所有區域變數的值，在除錯時非常有用。

### 4. 調整編輯器字形

為了提升程式碼的可讀性，建議調整編輯器的字形設定：

1.  前往 **[工具 (Tools)]** > **[選項 (Options)]**。
2.  選擇 **[撰寫風格 (Editor Format)]** 頁籤。
3.  將 **字形 (Font)** 設定為 **Consolas** 或 **微軟正黑體 (Microsoft JhengHei)**。
4. 將 **大小 (Size)** 設定為 **12** 或 **14**。

### 5. 撰寫風格設定

您可以根據個人喜好調整程式碼編輯器的顏色配置：

![顏色配置](image/index/顏色配置.png)

---

## VBA 基礎概念

### 專案與模組

*   **專案 (Project)**：在 VBA 中，一個 Excel 活頁簿（.xlsx, .xlsm）就是一個專案。
*   **模組 (Module)**：是存放 VBA 程式碼的容器。一個專案可以包含多個模組，用來組織不同功能的程式碼。
    *   **如何新增**：在 **專案總管** 中對您的專案點擊滑鼠右鍵，選擇 **[插入 (Insert)]** > **[模組 (Module)]**。

### 程序 (Sub / Function)

**程序** 是 VBA 執行的基本單位，可以想像成一個個獨立的「功能」或「指令集」。

*   **Sub 程序 (Subroutine)**：執行一系列的動作，但不會回傳值。這是最常見的程序類型。
    ```vba
    Sub SayHello()
        MsgBox "Hello, World!"
    End Sub
    ```

![執行程式](image/index/執行程式.png)

*   **Function 程序 (Function)**：執行計算並 **回傳一個值**。可以在儲存格中像內建函數一樣使用。
    ```vba
    Function AddTwo(num As Integer) As Integer
        AddTwo = num + 2
    End Function
    ```
*   **命名規則**：
    *   必須以字母開頭。
    *   不可以包含空格、`.`、`!` 或 `@`、`&`、`$`、`#` 等符號。
    *   名稱不能與 VBA 的保留關鍵字（如 `Sub`, `Dim`, `For`）重複。

### 變數 (Variables) 與資料型別 (Data Types)

**變數** 就像是儲存資料的暫時容器。在 VBA 中，使用 `Dim` 來宣告變數。

*   **語法**：`Dim [變數名稱] As [資料型別]`
*   **常見資料型別**：
    *   `String`：文字字串 (e.g., "Hello")
    *   `Integer`：整數 (-32,768 to 32,767)
    *   `Long`：長整數 (範圍更大)
    *   `Double`：雙精度浮點數 (包含小數)
    *   `Boolean`：布林值 (`True` 或 `False`)
    *   `Date`：日期/時間
    *   `Object`：泛用物件，可代表工作表、儲存格等。

*   **範例**：
    ```vba
    Sub VariableExample()
        Dim name As String
        Dim age As Integer
        
        name = "Tom"
        age = 30
        
        MsgBox name & " is " & age & " years old."
    End Sub
    ```

### 註解 (Comments)

註解用來解釋程式碼，VBA 會忽略註解的內容。以單引號 `'` 開頭。

```vba
' 這是一行註解
MsgBox "這行程式碼會被執行" ' 這也是註解
```

![註解](image/index/註解.png)

---

## 互動與除錯

### 及時運算視窗 (Immediate Window)

這是一個強大的工具，主要有兩種用途：

1.  **執行簡短程式**：直接輸入程式碼並按 Enter 即可執行（不需加 `?`）。
    ```
    MsgBox "Test"
    ```
2.  **查詢變數或屬性內容**：在程式中斷或執行時，用 `?` 開頭來查詢值。
    ```vba
    Sub PrintToImmediate()
        Dim myVar As String
        myVar = "Hello from Debug.Print"
        ' 將 myVar 的內容輸出到及時運算視窗
        Debug.Print myVar 
    End Sub
    
    ' 在及時運算視窗中輸入以下指令並按 Enter
    ? myVar ' 會顯示 "Hello from Debug.Print"
    ```

---

## 操作 Excel 物件

VBA 的強大之處在於能直接控制 Excel 的各個物件。

### 工作表 (Worksheet)

*   **依名稱指定**：`Sheets("工作表1")` 或 `Worksheets("工作表1")`
*   **依順序指定**：`Sheets(1)` (第一個工作表)
*   **常用屬性與方法**：
    *   `.Name`：讀取或設定工作表名稱。 `Sheets(1).Name = "MySheet"`
    *   `.Activate`：選定並切換至該工作表。 `Sheets("MySheet").Activate`
    *   `.Select`：選取工作表（可多選）。 `Sheets(Array("Sheet1", "Sheet2")).Select`

### 儲存格 (Range / Cells)

儲存格是 Excel 最基本的物件。

*   **Range 屬性**：最直觀的方式，如同在 Excel 中輸入位置。
    *   `Range("A1")`：單一儲存格
    *   `Range("A1:C5")`：一個範圍
    *   `Range("MyNamedRange")`：已命名的儲存格範圍

*   **Cells 屬性**：使用列 (Row) 和欄 (Column) 的數字索引，適合在迴圈中使用。
    *   `Cells(1, 1)`：等於 `Range("A1")`
    *   `Cells(2, 3)`：等於 `Range("C2")`
    *   `Cells(2, "C")`：欄位也可用字母表示

*   **常用屬性與方法**：
    *   `.Value`：儲存格顯示的值。 `Range("A1").Value = "Hello"`
    *   `.Formula`：儲存格中的公式。 `Range("C1").Formula = "=A1+B1"`
    *   `.Select`：選取儲存格。 `Range("A1").Select`
    *   `.ClearContents`：清除儲存格內容。 `Range("A1:C5").ClearContents`

*   **範例**：
    ```vba
    Sub CellManipulation()
        ' 在 Sheet1 的 A1 儲存格寫入文字
        Sheets("Sheet1").Range("A1").Value = "這是 A1"
        
        ' 在目前啟用工作表的 B2 儲存格寫入數字
        Cells(2, "B").Value = 123
        
        ' 讀取 B2 的值並顯示出來
        Dim cellValue As Integer
        cellValue = Cells(2, 2).Value
        MsgBox "B2 的值是: " & cellValue
    End Sub
    ```