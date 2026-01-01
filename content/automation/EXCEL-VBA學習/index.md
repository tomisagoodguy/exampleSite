---
title: "Excel VBA 學習筆記：從入門到網路爬蟲"
date: 2025-11-08T00:00:00+08:00
featured: true
description: "本筆記整理了 Excel VBA 的學習資源、環境設定、基礎語法、物件操作與網路爬蟲實作，適合作為入門到進階的學習參考。"
type: "post"
image: ""
categories:
  - "【程式與生產力】"
tags:
  - "VBA"
  - "Excel"
  - "網路爬蟲"
  - "Web Scraping"
  - "基礎概念"
---
*此為個人學習筆記，內容主要整理自相關課程與網路資源，僅供學習與參考之用。*

12/25上到4-2

## 學習資源

> ### Excel VBA 金融資料抓取 | 打造股票研究系統
>
> * **課程網站**：[Hahow 好學校](https://hahow.in/courses/5d2f3980fe9fef0021fac548)

---

## VBA 環境設置

在開始撰寫 VBA 程式碼之前，需要先設定好開發環境。

### 1. 開啟開發人員工具

若 Excel 功能區沒有顯示 **[開發人員]** 索引籤，請至 **[檔案]** > **[選項]** > **[自訂功能區]**，在右側將 **[開發人員]** 打勾。

### 2. 開啟 VBA 編輯器 (VBE)

* **方法一**：點選 **[開發人員]** 索引籤中的 **[Visual Basic]** 按鈕。
* **方法二**：使用快捷鍵 `Alt + F11`。

### 3. 開啟常用視窗

在 VBA 編輯器中，從 **[檢視]** 選單開啟以下常用視窗，以便於程式碼的撰寫與除錯：

* **專案總管 (Project Explorer)** `(Ctrl+R)`：管理專案中的所有物件，如模組、工作表等。
* **屬性視窗 (Properties Window)** `(F4)`：檢視與編輯所選物件的屬性。
* **及時運算視窗 (Immediate Window)** `(Ctrl+G)`：用於即時測試程式碼或顯示變數值。
* **區域變數視窗 (Locals Window)**：顯示目前程序中所有區域變數的值，在除錯時非常有用。

### 4. 調整編輯器字形與風格

為了提升程式碼的可讀性，建議調整編輯器的設定：

1. 前往 **[工具 (Tools)]** > **[選項 (Options)]**。
2. 選擇 **[撰寫風格 (Editor Format)]** 頁籤。
3. 將 **字形 (Font)** 設定為 **Consolas** 或 **微軟正黑體**，**大小 (Size)** 設定為 **12** 或 **14**。
4. 您可以根據個人喜好調整程式碼的顏色配置。

![顏色配置](image/顏色配置.png)

---

## VBA 基礎概念

### 專案與模組

* **專案 (Project)**：在 VBA 中，一個 Excel 活頁簿（.xlsx, .xlsm）就是一個專案。
* **模組 (Module)**：是存放 VBA 程式碼的容器。一個專案可以包含多個模組，用來組織不同功能的程式碼。
  * **如何新增**：在 **專案總管** 中對您的專案點擊滑鼠右鍵，選擇 **[插入 (Insert)]** > **[模組 (Module)]**。

### 程序 (Sub / Function)

**程序** 是 VBA 執行的基本單位，可以想像成一個個獨立的「功能」或「指令集」。

* **Sub 程序 (Subroutine)**：執行一系列的動作，但不會回傳值。

  ```vba
  Sub SayHello()
      MsgBox "Hello, World!"
  End Sub
  ```

  ![執行程式](image/index/執行程式.png)
* **Function 程序 (Function)**：執行計算並 **回傳一個值**。

  ```vba
  Function AddTwo(num As Integer) As Integer
      AddTwo = num + 2
  End Function
  ```
* **命名規則**：必須以字母開頭，且不能包含空格或特殊符號 (`.`、`!`、`@`、`&`、`$`、`#`)，亦不可使用 VBA 的保留關鍵字。

### 模組化程式設計 (Call)

當程式越來越龐大時，我們會將功能拆分成多個 Sub，並透過 `Call` 來互相呼叫與傳遞變數。

* **語法**：`Call Sub名稱(參數1, 參數2...)`
* **範例**：

  ```vba
  Sub Main()
      Dim myName As String
      myName = "Tom"
      ' 呼叫另一個 Sub，並將變數傳遞過去
      Call GreetUser(myName)
  End Sub

  Sub GreetUser(name As String)
      MsgBox "Hello, " & name
  End Sub
  ```

  > **輸出結果**：執行後會跳出視窗顯示 `Hello, Tom`。
  >

### 變數 (Variables) 與資料型別

**變數** 是儲存資料的暫時容器。在 VBA 中，使用 `Dim` 來宣告變數。

* **語法**：`Dim [變數名稱] As [資料型別]`
* **常見資料型別**：`String` (文字)、`Integer` (整數)、`Long` (長整數)、`Double` (浮點數)、`Boolean` (布林)、`Date` (日期)、`Object` (物件)、`Variant` (萬用)。
  ![常用變數類型](image/index/常用變數類型.png)
* **使用注意事項**：
  * **型態不符**：確認賦予的值與宣告的變數類型相符。
  * **溢位**：當數值超出範圍時，需轉換為更大範圍的類型 (如 `Integer` -> `Long`)。
  * **物件變數**：指派物件時必須使用 `Set` 關鍵字 (e.g., `Set mySheet = Sheets(1)`)。
* **範例**：
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

註解用來解釋程式碼，以單引號 `'` 開頭，VBA 會忽略其內容。

```vba
' 這是一行註解
MsgBox "這行程式碼會被執行" ' 這也是註解
```

![註解](image/index/註解.png)

---

## 操作 Excel 物件與互動

VBA 的強大之處在於能直接控制 Excel 的各個物件。

### 核心物件：工作表 (Worksheet) 與儲存格 (Range / Cells)

* **工作表 (Worksheet)**

  * **依名稱指定**：`Sheets("工作表1")`
  * **依順序指定**：`Sheets(1)` (第一個工作表)
  * **常用操作**：`.Name` (名稱), `.Activate` (啟用), `.Select` (選取)。
* **儲存格 (Range / Cells)**

  * **Range 屬性**：`Range("A1")` 或 `Range("A1:C5")`。
  * **Cells 屬性**：使用列欄索引 `Cells(1, 1)`，適合在迴圈中使用。
  * **常用操作**：`.Value` (值), `.Formula` (公式), `.Select` (選取), `.ClearContents` (清除內容)。
* **範例**：

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

### 互動與除錯：及時運算視窗 (Immediate Window)

這是一個強大的工具 (`Ctrl+G`)，主要有兩種用途：

1. **執行簡短程式**：直接輸入程式碼並按 Enter 即可執行。
   ```
   MsgBox "Test"
   ```
2. **查詢變數或屬性內容**：在程式中斷或執行時，用 `?` 開頭來查詢值，或使用 `Debug.Print` 將訊息輸出至此視窗。
   ```vba
   Sub PrintToImmediate()
       Dim myVar As String
       myVar = "Hello from Debug.Print"
       ' 將 myVar 的內容輸出到及時運算視窗
       Debug.Print myVar 
   End Sub
   ```

---

## 條件判斷 (Conditional Logic)

### If ... Then ... Else

這是寫程式最基本的邏輯判斷，讓程式能夠根據不同情況執行不同的動作。

* **語法**：

  ```vba
  If 條件 Then
      ' 條件成立時執行
  ElseIf 其他條件 Then
      ' 其他條件成立時執行
  Else
      ' 以上皆不成立時執行
  End If
  ```
* **範例**：檢查儲存格 A1 的內容是否符合以下條件：

  1. 必為 4 個字元 (`Len`)
  2. 必為數字 (`IsNumeric`)
  3. 開頭第一個字不可為 0 (`Left`)

  ```vba
  Sub CheckInput()
      Dim content As String
      content = Range("A1").Value

      ' 使用 And 來連接多個條件 (全部都要符合)
      If Len(content) = 4 And IsNumeric(content) And Left(content, 1) <> "0" Then
          MsgBox "格式正確"
      Else
          MsgBox "格式錯誤"
      End If
  End Sub
  ```

  > **輸出結果**：
  >
  > * 輸入 `1234` -> 跳出「格式正確」
  > * 輸入 `0123` -> 跳出「格式錯誤」 (開頭是 0)
  > * 輸入 `ABCD` -> 跳出「格式錯誤」 (非數字)
  > * 輸入 `123` -> 跳出「格式錯誤」 (長度不足)
  >
  > ![IF判斷式](image/index/IF判斷式.png)
  >

---

## 迴圈控制 (Loops)

### For Each ... Next 迴圈

此迴圈適用於遍歷「集合」或「陣列」中的每一個元素。在 Excel VBA 中，最常用來遍歷 **Range (儲存格範圍)**。

* **語法**：

  ```vba
  For Each 變數名稱 In Cells
      ' 對 變數名稱 執行動作
  Next [變數名稱]
  ```

  > [!WARNING] **致命陷阱**
  > 雖然語法可以使用 `For Each ... In Cells`，但 **Cells** 代表整張工作表的所有儲存格 (1,048,576 列 x 16,384 欄)，直接執行會導致 Excel **當機**。
  > **請務必指定明確的範圍**，例如 `Selection` (目前選取範圍) 或 `Range("A1:C10")`。
  >
* **範例**：將選取範圍內數值大於 60 的儲存格標示為紅色字。

  ```vba
  Sub HighlightScores()
      Dim cell As Range

      ' 建議：明確指定範圍 (例如 Selection 或 Range("A1:A10"))
      For Each cell In Selection
          If cell.Value < 60 Then
              cell.Font.Color = vbRed ' 不及格標紅字
          End If
      Next cell
  End Sub
  ```

  > **輸出結果**：執行程式後，您選取範圍內數值小於 60 的儲存格，文字顏色將會變成**紅色**。
  >

  ![1766820757724](image/index/FOR_EACH.png)

---

## Excel VBA 網路爬蟲

本章節整理使用 VBA 進行網路資料抓取的概念與實作流程。

![1766832946907](image/index/Request.png)

### 1. 網路爬蟲核心概念

* **網路溝通原理**：網路溝通基於「Request (請求)」與「Response (回應)」。瀏覽器向伺服器發送請求，伺服器回傳資料。
* **爬蟲定義**：網路爬虫的本質，就是**找出發送哪一個 Request 可以拿到想要的資料**，並用程式模仿這個過程。

### 2. 分析網頁資料來源 (Chrome 開發人員工具)

在 Chrome 中按下 `F12` 開啟開發人員工具，是分析網頁結構與背景資料請求的利器。

* **操作步驟**：

  1. 切換到 **Network** 頁籤。
  2. 確認紅燈亮起 (表示正在錄製網路活動)。
  3. 在網頁上執行操作 (如點擊、捲動)，並觀察左側出現的請求列表。
* **如何尋找資料**：

  * **DOC (文件)**：資料直接呈現在網頁的 HTML 內容中，適合抓取靜態表格資料。
  * **XHR (XMLHttpRequest)**：資料是透過背景的 API 請求（非同步）載入的，通常為 JSON 格式，是抓取動態網頁資料的關鍵。
  * **JS (JavaScript)**：資料可能被寫在 JavaScript 程式碼中。

  ![認識Chrome開發人員工具資料藏在哪裡](image/index/認識Chrome開發人員.png)
* **Request 觀察重點**：找出正確 Request 後，需在右側觀察以下重點以便後續模仿：

  * **URL** (網址)
  * **Method** (請求方法)：`GET` 或 `POST`。
  * **Header** (標頭資訊)：有時需要模擬 `User-agent`、`Referer` 等資訊。
  * **Form Data / Payload**：若為 `POST` 請求，需觀察其傳遞的參數。

### 3. VBA 實作網頁資料抓取

使用 VBA 的 `XMLHTTP` 或 `WinHttp` 物件 ("小幫手") 來模擬瀏覽器發送 Request。

* **發送流程**：

  1. **`open`**：設定請求方法 (`GET`/`POST`) 與網址 (URL)。
  2. **`setRequestHeader`**：(非必要) 設定標頭資訊。
  3. **`send`**：發送請求。若是 `POST` 方法，需在此步驟傳入參數。
* **接收回應**：

  * **`status`**：檢查 HTTP 狀態碼，`200` 代表成功。
  * **`responseText`**：取得文字形式的回應資料 (如 HTML, JSON)。
  * **`responseBody`**：取得原始二進位資料。
* **範例：抓取 Yahoo 股市網頁**
  以下程式碼示範如何使用 `MSXML2.XMLHTTP` 物件抓取指定網頁的 HTML 原始碼。

  ```vba
  Sub YahooBrokerTrading()
      ' 聲明變數
      Dim objHTTP As Object       ' 宣告 HTTP 請求物件
      Dim strURL As String        ' 儲存目標網址
      Dim strResponse As String   ' 儲存伺服器回傳的內容
      Dim lngStatus As Long       ' 儲存 HTTP 狀態碼

      ' 設定目標網址 (以台積電主力進出表為例)
      strURL = "https://tw.stock.yahoo.com/quote/2330.TW/broker-trading"

      ' 1. 建立 HTTP 請求物件
      Set objHTTP = CreateObject("MSXML2.XMLHTTP")

      ' 2. 設定並發送請求 (使用同步 GET 請求)
      objHTTP.Open "GET", strURL, False
      objHTTP.send

      ' 3. 接收並檢查回應
      lngStatus = objHTTP.Status ' 取得回傳的 HTTP 狀態碼

      If lngStatus = 200 Then ' 狀態碼 200 表示成功
          strResponse = objHTTP.responseText
          ' 此處 strResponse 即為網頁的完整 HTML 內容
          ' 可將其寫入儲存格或進行下一步解析
          Debug.Print "成功取得資料，內容長度: " & Len(strResponse)
      Else
          MsgBox "網路請求失敗。HTTP 狀態碼: " & lngStatus, vbCritical
      End If

      ' 4. 釋放物件
      Set objHTTP = Nothing
  End Sub
  ```

### 4. 解析不同格式的資料

取得回應資料後，需根據其格式進行整理與解析。

![1766927445060](image/index/1766927445060.png)

![1766927500681](image/index/1766927500681.png)

![1766927820414](image/index/1766927820414.png)

#### A. HTML 格式

* **核心物件**：邀請 `HTMLFile` 小幫手。
* **操作方式**：將下載的 HTML 文字交給它，再透過 DOM (文件物件模型) 方法取得網頁元素。
* **取得元素的方法**：
  * `getElementById(id)`: 透過 ID 取得單一元素 (不常用)。
  * `getElementsByTagName(tag)`: 透過標籤名稱 (如 `tr`, `td`, `a`) 取得元素集合 (常用)。-->記得要加s
  * `getElementsByClassName(class)`: 透過 Class 名稱取得元素集合 (常用)。
* **印出內容**：使用 `.innerText` (純文字) 或 `.innerHTML` (含 HTML 標籤)。

#### B. JSON 格式

* **前置作業**：
  1. 需匯入 `JsonConverter.bas` 模組。
  2. 在 VBA 編輯器中，勾選 **工具 > 設定引用項目 > Microsoft Scripting Runtime**。
* **解析語法**：使用 `JsonConverter.ParseJson(資料)` 將 JSON 字串轉換為 VBA 物件 (字典或集合)。
* **資料存取技巧**：
  * **陣列 (`[]`)**：若資料以 `[` 開頭，需使用索引值 (如 `data(1)`) 來存取。
  * **物件 (`{}`)**：若資料以 `{` 開頭，需使用 Key 名稱 (如 `data("key")`) 來取值。

#### C. CSV 格式/逗號分隔值

![1766667758141](image/index/csv重要切字.png)

* 可使用 `Split` 函數搭配換行符號 (`vbLf` 或 `Chr(10)`) 將資料切成多列。
* 再對每一列使用 `Split` 函數搭配逗號 `,` 將其切成多個欄位。

#### D. 暴力解決法

當標準解析方法不適用時，可直接使用 `Split` 函數，以特定字串為切割點，強行擷取所需資料片段。

#### E. 字串處理：Split 函數

當資料混在一段長字串中，且有固定的分隔符號（如逗號、空白、斜線）時，`Split` 是最用的工具。

![Split語法說明](image/index/split語法.png)

* **語法**：`Split(原始字串, "分隔符號")` -> 回傳一個陣列
* **範例**：

  ```vba
  Sub SplitExample()
      Dim rawText As String
      Dim dataArray() As String

      rawText = "Apple,Banana,Orange"

      ' 使用逗號切割字串
      dataArray = Split(rawText, ",")

      ' 取出陣列中的資料 (索引從 0 開始)
      MsgBox "第二個水果是: " & dataArray(1) 
  End Sub
  ```

  > **輸出結果**：執行後會跳出視窗顯示 `第二個水果是: Banana`。
  >

#### F. 字串處理：Replace 函數

用來將字串中的某些文字**取代**成新的文字。常用於清理資料（如去除空白、替換符號）。

* **語法**：`Replace(原始字串, "想被換掉的舊字", "想換成的新字")`
* **範例**：

  ```vba
  Sub ReplaceExample()
      Dim money As String
      Dim cleanMoney As String

      money = "NT$ 1,200"

      ' 1. 去除 "NT$ " (換成空字串)
      cleanMoney = Replace(money, "NT$ ", "")

      ' 2. 去除 "," (換成空字串)
      cleanMoney = Replace(cleanMoney, ",", "")

      MsgBox "清理後的數字: " & cleanMoney
  End Sub
  ```

  > **輸出結果**：執行後會跳出視窗顯示 `清理後的數字: 1200`。
  >

#### G. 進階字串處理：Chr(34) 與雙引號的處理

在 VBA (或大多數程式語言) 中，雙引號 `"` 是用來包住字串的符號。這導致一個常見問題：**如果我的字串內容本身就包含雙引號，該怎麼辦？**

例如，我想用程式寫出 HTML：`<div class="box">`。

* **災難寫法 (Escaping)**：
  若直接寫 `s = "<div class="box">"`，程式會報錯，因為它以為 `"box"` 是程式碼。
  VBA 規定：要顯示一個雙引號，必須連續打兩個雙引號 `""`。

  ```vba
  s = "<div class=""box"">" ' 超級容易看錯
  ```
* **救星寫法：Chr(34)**：
  `Chr(34)` 是 ASCII code 中的第 34 號字元，也就是雙引號 `"`。使用變數連接的方式，程式碼會清晰非常多。

  ```vba
  s = "<div class=" & Chr(34) & "box" & Chr(34) & ">"
  ```
* **與 Replace 搭配使用**：
  當我們要清理資料中的雙引號時 (例如 CSV 內容常見 `Result="Pass"` 這種格式)，`Chr(34)` 特別好用。

  ```vba
  Sub CleanQuotes()
      Dim rawData As String
      Dim cleanData As String

      rawData = "Name=""Tom""" ' 模擬資料：Name="Tom"

      ' 方法1：看得眼花撩亂
      cleanData = Replace(rawData, """", "")

      ' 方法2：清楚易讀 (推薦)
      cleanData = Replace(rawData, Chr(34), "")

      MsgBox cleanData ' 輸出: Name=Tom
  End Sub
  ```

---

## 附錄：資源連結

* **製作流程說明文件**：[Dropbox Paper](https://www.dropbox.com/scl/fi/v7vwjdo7jeekkt1zm865j/_.paper?rlkey=kk8yifxbabsrt8sohdpch49sr&dl=0)
* **JSON 簡介**：[不可不知的 JSON 基本介紹](https://blog.wu-boy.com/2011/04/%E4%BD%A0%E4%B8%8D%E5%8F%AF%E4%B8%8D%E7%9F%A5%E7%9A%84-json-%E5%9F%BA%E6%9C%AC%E4%BB%8B%E7%B4%B9/)
* **財經參考**：[看懂長短期的債券利差透露的訊息](https://www.macromicro.me/spotlights/43/guan-jian-tu-biao-kan-dong-zhang-duan-qi-de-zhai-quan-li-cha-tou-lu-de-xun-xi)

---

## 範例檔案下載

以下是本筆記中提及的相關 Excel 範例檔案，您可以點擊下載：

* [爬蟲程式產生器V4.xlsm](爬蟲程式產生器V4.xlsm)
* [Yahoo主力進出表.xlsm](Yahoo主力進出表.xlsm)

---

## 常見問題 (FAQ)

### Q1: 字串與變數如何連接？

VBA 使用 `&` 符號來連接字串與變數。這在動態組建網址時非常常用。

```vba
Dim stock As String
stock = "2330"

' 將變數插入網址字串中
Dim url As String
url = "https://tw.stock.yahoo.com/quote/" & stock & ".TW"
MsgBox url ' 輸出: https://tw.stock.yahoo.com/quote/2330.TW
```

### Q2: 爬蟲請求方法 GET 與 POST 有何差異？

* **GET**：
  * **特徵**：參數直接附加在網址後面（例如 `?id=123`），所有人都看得到。
  * **用途**：通常用於**取得**資料（瀏覽網頁、搜尋）。
  * **限制**：網址長度有限制，不適合傳輸大量資料。
* **POST**：
  * **特徵**：參數隱藏在請求主體（Form Data / Payload）中，網址上看不到。
  * **用途**：通常用於**提交**資料（登入帳號、填寫表單、上傳檔案）。
  * **優點**：較適合傳遞敏感或大量資料。

### 5. 進階技巧：HTTP Headers 設定 (Request Headers)

在模仿瀏覽器發送請求時，「標頭 (Headers)」是用來告訴伺服器「我是誰」、「我想要什麼格式的資料」或「我從哪裡來」的重要名片。

* **設定方法**：
  使用 `objHTTP.setRequestHeader "Header名稱", "值"` 來設定。
  **注意**：`setRequestHeader` 必須在 `Open` 之後，`Send` 之前執行。
* **常見且重要的 Headers**：

  1. **Content-Type** (內容類型)：

     * **用途**：告訴伺服器我們傳送過去的資料 (Payload) 是什麼格式。
     * **常見值**：
       * `application/x-www-form-urlencoded`：一般的表單提交 (Form Data)。
       * `application/json`：傳送 JSON 格式資料。
     * **時機**：通常在 `POST` 請求時必須設定。
  2. **User-Agent** (使用者代理)：

     ![User-Agent設定說明](image/index/user-agent.png)

     * **用途**：告訴伺服器我使用的瀏覽器與作業系統資訊。
     * **重要性**：許多網站會封鎖沒有此標頭的請求（視為機器人）。
     * **範例**：`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...`
  3. **Referer** (來源頁面)：

     * **用途**：告訴伺服器我是從哪個頁面連結過來的。
     * **重要性**：有些網站會檢查此標頭以防止盜連。

       ![1766667355238](image/index/referer.png)
  4. **Cookie**：

     * **用途**：包含使用者身分驗證或追蹤資訊。
     * **時機**：抓取需登入的網站時必備。
* **程式碼範例**：

  ```vba
  Sub SendPostRequestWithHeaders()
      Dim objHTTP As Object
      Dim strURL As String
      Dim strBody As String

      strURL = "https://example.com/api/login"
      strBody = "username=tom&password=123" ' 模擬表單資料

      Set objHTTP = CreateObject("MSXML2.XMLHTTP")

      objHTTP.Open "POST", strURL, False

      ' --- 設定 Headers (重點) ---
      ' 1. 偽裝成 Chrome 瀏覽器
      objHTTP.setRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      ' 2. 宣告傳送的資料是表單格式
      objHTTP.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
      ' 3. 宣告來源 (如果需要)
      objHTTP.setRequestHeader "Referer", "https://example.com/login"
      ' ---------------------------

      objHTTP.send strBody ' POST 請求需傳入 Body

      Debug.Print objHTTP.responseText
      Set objHTTP = Nothing
  End Sub
  ```

  > **輸出結果**：程式執行完畢後，**及時運算視窗** (Immediate Window) 會顯示伺服器回傳的 HTML 或 JSON 內容。
  >

---

## 實用工具連結

進行網路爬蟲時，常會用到以下工具來處理編碼或偽裝瀏覽器身分：

* **URL 編碼/解碼工具**：
  當網址包含中文字或特殊符號時，伺服器可能無法辨識，需轉換為 URL 編碼（Percent-encoding，如 `%E5%8F%B0%E7%81%A3`）。

  * [URL Encode/Decode (ConvertString)](https://www.convertstring.com/zh_TW/EncodeDecode/UrlEncode) - 線上快速轉換工具。
  * [URL 編碼原理與實作 (GTWang)](https://blog.gtwang.org/programming/url-percent-encoding-and-decoding-using-java/) - 深入了解編碼原理。
* **User Agent 大全**：
  有些網站會擋掉沒有 User-Agent 的請求（視為機器人）。我們可以設定 User-Agent Header 來偽裝成 Chrome 或 Edge 瀏覽器。

  * [常用 User Agent String 列表](https://tools.jb51.net/table/useragent)

---

## 結語

Excel VBA 結合網路爬蟲功能，能將繁瑣的「複製貼上」工作自動化，大幅提升資料收集與整理的效率。

**學習建議路徑**：

1. **熟悉 VBA 基礎**：變數、迴圈、邏輯判斷。
2. **掌握 HTTP 請求**：了解 GET/POST 與觀察 Network 面板。
3. **練習靜態爬蟲**：從簡單的 HTML 表格抓取開始。
4. **挑戰動態爬蟲**：學習解析 JSON 資料，這是現代網站的主流。

希望這份筆記能幫助您在自動化的路上更進一步！
