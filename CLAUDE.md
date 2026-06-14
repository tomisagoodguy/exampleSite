# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案本質

**定康筆記（Tom's Note）** 是以 Hugo 為核心的個人知識庫，涵蓋法式料理筆記、不動產分析、自動化開發記錄等主題，同時掛載 Leaflet 互動地圖（破關地圖）與純工具頁（房地稅務試算）。

---

## 技術堆疊

| 技術 | 版本 | 用途 |
| --- | --- | --- |
| **Hugo Extended** | `v0.127.0` | 靜態網站產生器（本地執行用 `./hugo.exe`） |
| **Theme: liva-hugo** | — | 基礎佈局主題，覆寫於 `layouts/` |
| **TypeScript** | — | 互動功能腳本，原始碼在 `src/` |
| **Vite** | `^8` | TypeScript 打包，設定於 `vite.config.ts` |
| **Yarn** | — | 套件管理（**禁止使用 npm install**） |
| **Netlify** | Hugo `0.87.0` | 主部署平台 |
| **GitHub Pages** | Hugo `0.127.0` | push 到 main 由 GitHub Actions 自動 build 並部署至 `tomisagoodguy.github.io` |

> ⚠️ **Hugo 版本不一致**：本地與 GitHub Actions 都用 `0.127.0`，只有 **Netlify** 是 `0.87.0`。為保 Netlify 相容，避免使用 0.87.0 之後才加入的 Hugo 功能。

---

## 常用指令

### 本地開發

```bash
./hugo.exe server -D          # 啟動本地預覽（含草稿）
./hugo.exe --minify --gc      # 建置輸出至 public/
```

### TypeScript 建置

```bash
yarn                          # 安裝套件
yarn dev                      # Vite 開發模式
yarn build                    # 打包（輸出至 static/，見下方說明）
yarn build:log                # 打包並存 log → logs/vite-build.log
yarn hugo:log                 # Hugo 建置 log → logs/hugo-build.log
```

> `logs/` 已被 `.gitignore` 排除。遇到 build 錯誤時，先執行對應指令產生 log，再讓 Claude 讀取 `logs/` 下的檔案。

### 發布至 GitHub Pages

push 到 `main` 即由 GitHub Actions（`.github/workflows/deploy.yml`）自動以 Hugo 0.127.0 build 並部署到 `tomisagoodguy.github.io`，**無需手動操作**。

```bat
deploy.bat                    # 便利包裝：git add → commit → push（最後仍由 GHA 自動部署）
```

---

## 架構概覽

### Hugo ↔ TypeScript 的資料橋接（關鍵）

破關地圖（`adventure-map`）的資料流：

1. `data/places.json` — 地點資料，Hugo 在建置時讀入
2. `layouts/adventure-map/list.html` — Hugo 將資料序列化成 `<script type="application/json">`，注入頁面
3. `src/apps/adventure-map/` — TypeScript 讀取 `window.PLACES_DATA`，驅動 Leaflet 地圖

新增地點只需修改 `data/places.json`，不需動 TypeScript。

### Vite 打包輸出路徑（`yarn build` 後的結果）

| 入口 | 輸出位置 |
| --- | --- |
| `src/apps/adventure-map/index.html` | `static/js/adventure-map.bundle.js` + `static/css/adventure-map.bundle.css` |
| `src/tools/place-helper/place-helper.html` | `static/tools/place-helper.html` |
| 共用 JS chunks | `static/assets/` |

Leaflet / MarkerCluster 以 `external` 方式排除，頁面直接從 CDN 載入（見 `layouts/adventure-map/list.html`）。

### layouts/ 覆寫規則

`layouts/` 下的檔案優先於 `themes/liva-hugo/` 中的同名檔案，**永遠不要直接修改 `themes/`**。

| 檔案 | 用途 |
| --- | --- |
| `layouts/partials/head.html` | 全站 `<head>`，注入自訂 CSS/JS |
| `layouts/partials/home-*.html` | 首頁各區塊（hero、slider、categories） |
| `layouts/partials/sidebar.html` | 側欄 |
| `layouts/adventure-map/list.html` | 破關地圖完整頁面模板 |
| `layouts/index.html` | 首頁主模板 |

### data/ 資料檔

| 檔案 | 用途 |
| --- | --- |
| `data/places.json` | 破關地圖地點（由 Hugo 注入頁面） |
| `data/gallery.yml` | 圖庫資料 |
| `data/links.yml` | 相關連結頁資料 |

### src/ 模組說明

```text
src/
├── apps/adventure-map/     # 破關地圖（Leaflet + MarkerCluster）
│   ├── data.ts             # 分類設定（CATEGORY_CONFIG）
│   ├── engine.ts           # MapEngine class（Leaflet 地圖核心）
│   ├── ui.ts               # 面板 UI 邏輯
│   └── index.ts            # 入口，組合各模組
├── tools/place-helper/     # 地點新增輔助工具（獨立 HTML 頁）
│   ├── geocoder.ts         # 地址轉座標
│   ├── persist.ts          # IndexedDB 暫存
│   └── main.ts             # 入口
└── shared/
    └── types.ts            # PlaceEntry 等共用型別
```

---

## 內容撰寫規範

### Lifestyle 文章結構

每篇文章放在 `content/lifestyle/<文章名稱>/`，圖片與 `index.md` 同層：

```yaml
---
title: "文章標題"
date: 2026-03-28T00:00:00+08:00
description: "一句話摘要"
type: "lifestyle"
image: "成品.jpg"       # 封面圖（同資料夾檔名）
categories:
  - "法式料理"
tags:
  - "主菜"
---
```

### 圖片嵌入

```markdown
![圖片說明](檔案名稱.jpg)          # ✅ 正確：相對路徑
{{< figure src="..." >}}           # ❌ 禁止：此主題不支援
```

### Markdown 表格

pipe 左右必須有空格，separator 使用 `---`：

```markdown
| 食材 | 數量 |
| --- | --- |
| 鴨胸 | 3 塊 |
```

---

## 開發限制

| ❌ 禁止 | ✅ 正確 |
| --- | --- |
| 修改 `themes/liva-hugo/` | 在 `layouts/` 建立同名檔案覆寫 |
| `npm install` | `yarn` |
| 把圖片放 `static/` 再用相對路徑引用 | 圖片與 `index.md` 放同一資料夾 |
| 建立備份檔（`_old.md`、`.bak`） | 直接修改原檔，版控用 git |
| 使用 Hugo 0.88+ 新功能 | 確認 Netlify 上 0.87.0 相容 |

---

## Active Status

- **最後更新**：2026-06-14
- **已知問題**：無
