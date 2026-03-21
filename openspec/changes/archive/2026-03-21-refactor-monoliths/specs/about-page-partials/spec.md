## ADDED Requirements

### Requirement: case-master-modal partial
`layouts/partials/case-master-modal.html` SHALL 包含完整的 `#caseMasterModal` Bootstrap modal HTML，從 `about/list.html` 抽取而來，不修改任何 HTML 內容或樣式。

#### Scenario: partial renders modal
- **WHEN** Hugo 渲染 about/list.html
- **THEN** `{{ partial "case-master-modal.html" . }}` 輸出與原 inline modal 完全相同的 HTML

#### Scenario: partial placement
- **WHEN** partial 檔案建立
- **THEN** 路徑為 `layouts/partials/case-master-modal.html`（根層級，非 theme 層）

---

### Requirement: about/list.html modal replaced by partial
`themes/liva-hugo/layouts/about/list.html` 中的 `#caseMasterModal` div 區塊（原 L259–L489）SHALL 被 `{{ partial "case-master-modal.html" . }}` 單行取代。

#### Scenario: about page renders correctly
- **WHEN** `hugo server` 渲染 about 頁面
- **THEN** modal 按鈕可正常開啟，modal 內容顯示無誤，`data-target="#caseMasterModal"` 仍可找到 modal

#### Scenario: about/list.html line count reduced
- **WHEN** 重構完成
- **THEN** `about/list.html` 行數 SHALL 少於 270 行
