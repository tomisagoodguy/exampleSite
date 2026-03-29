# Project Memory (CLAUDE.md)

## 專案本質

**定康筆記（Tom's Note）** 是一個以 Hugo 靜態網站為基礎的個人知識庫，涵蓋法式料理筆記、不動產分析、股票研究、自動化開發記錄等多個主題。內容驅動為核心，技術服務於「快速發布、易於維護」的目標，部署於 Netlify。

---

## 技術堆疊

| 技術 | 版本 | 用途 |
| --- | --- | --- |
| **Hugo Extended** | `v0.127.0` | 靜態網站產生器（本地執行用 `./hugo.exe`） |
| **Theme: liva-hugo** | — | 基礎佈局主題，覆寫於 `layouts/` |
| **TypeScript** | — | 互動功能腳本，原始碼在 `src/` |
| **Vite** | — | TypeScript 打包，設定於 `vite.config.ts` |
| **Yarn** | — | 套件管理（**禁止使用 npm install**） |
| **Netlify** | HUGO `0.87.0` | 部署平台（注意：Netlify 環境 Hugo 版本不同） |

> ⚠️ **本地 Hugo 版本（0.127.0）與 Netlify（0.87.0）不同**，避免使用 0.87.0 之後才加入的 Hugo 功能。

---

## 目錄結構

```text
exampleSite/
├── content/              # 文章內容（Markdown）
│   ├── lifestyle/        # 法式料理筆記（每篇獨立資料夾，含圖片）
│   ├── blog/             # 一般文章
│   ├── automation/       # 自動化與開發記錄
│   └── real-estate/      # 不動產相關
├── layouts/              # Hugo 覆寫模板（優先於 theme）
│   ├── partials/         # 可重用 HTML 片段
│   ├── _default/         # 預設頁面模板
│   └── adventure-map/    # 冒險地圖頁面
├── static/               # 靜態資源（直接輸出，不經 Hugo 處理）
│   ├── uploads/          # 上傳檔案（Excel、PDF 等）
│   └── images/           # 全站圖片
├── src/                  # TypeScript 原始碼
│   ├── apps/             # 頁面級應用
│   ├── shared/           # 共用模組
│   └── tools/            # 工具腳本
├── scripts/              # Python 維護腳本
├── data/                 # Hugo data 檔案（JSON/YAML）
├── themes/liva-hugo/     # 主題（不直接修改，用 layouts/ 覆寫）
├── hugo.exe              # Hugo 執行檔（Windows 本地用）
├── config.toml           # Hugo 主設定
├── vite.config.ts        # Vite 打包設定
└── netlify.toml          # Netlify 部署設定
```

---

## 常用指令

### 本地開發

```bash
# 啟動本地預覽（含草稿）
./hugo.exe server -D

# 建置輸出至 public/
./hugo.exe --minify --gc
```

### TypeScript 建置

```bash
# 安裝套件
yarn

# 開發模式
yarn dev

# 打包輸出
yarn build
```

---

## 內容撰寫規範

### Lifestyle（料理筆記）文章結構

每篇文章放在 `content/lifestyle/<文章名稱>/` 資料夾下，圖片與 `index.md` 同層：

```text
content/lifestyle/嫩煎鴨胸襯白蘿蔔佐紅酒葡萄醬/
├── index.md
├── 成品.jpg
├── 切鴨肉中.jpg
└── ...
```

**Front Matter 必填欄位：**

```yaml
---
title: "文章標題"
date: 2026-03-28T00:00:00+08:00
description: "一句話摘要"
type: "lifestyle"
image: "成品.jpg"       # 封面圖，必須是同資料夾的圖片檔名
categories:
  - "法式料理"
tags:
  - "主菜"
---
```

### 圖片嵌入方式

#### ✅ 正確：使用標準 Markdown 語法（相對路徑，與 index.md 同層）

```markdown
![圖片說明](檔案名稱.jpg)
```

#### ❌ 禁止：使用 Hugo shortcode（此主題不支援 figure shortcode 顯示）

```markdown
{{< figure src="..." caption="..." >}}   ← 不會顯示
```

### 表格格式

pipe 左右必須有空格，separator 使用 `---`：

```markdown
| 食材 | 數量 |
| --- | --- |
| 鴨胸 | 3 塊 |
```

---

## 開發原則

| ❌ 禁止 | ✅ 正確 |
| --- | --- |
| 修改 `themes/liva-hugo/` 內的檔案 | 在 `layouts/` 建立同名檔案覆寫 |
| 使用 `{{< figure >}}` shortcode | 使用 `![alt](filename.jpg)` |
| `npm install` | `yarn` |
| 把圖片放到 `static/` 再引用 | 圖片與 `index.md` 放同一資料夾 |
| 建立備份檔（`_old.md`、`.bak`） | 直接修改原檔，版控用 git |

---

## Active Status

- **最後更新**：2026-03-29
- **已知問題**：無
