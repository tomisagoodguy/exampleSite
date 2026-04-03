@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
cls
echo ==========================================
echo  網站快速發布系統
echo ==========================================

set SOURCE_DIR=C:\Users\user\Documents\GitHub\exampleSite
set DEST_DIR=C:\Users\user\Documents\GitHub\tomisagoodguy.github.io

:: --------------------------------------------
:: 步驟 1: 編譯網站
:: --------------------------------------------
echo [1/4] 正在編譯網站...
cd /d "%SOURCE_DIR%"
call .\hugo.exe --gc --minify

if %errorlevel% neq 0 (
    echo.
    echo [FAIL] 編譯失敗，請檢查文章格式
    pause
    exit /b 1
)

:: --------------------------------------------
:: 步驟 2: 極速結構驗證
:: --------------------------------------------
echo [2/4] 正在執行極速結構驗證...

if not exist "%SOURCE_DIR%\public\index.html" (
    echo   [FAIL] 首頁 index.html 遺失！部署中止。
    pause & exit /b 1
)

:: 快速抽樣檢查關鍵目錄
if not exist "%SOURCE_DIR%\public\lifestyle\index.html" (
    echo   [WARN] 警告：分類目錄 lifestyle 可能未正確生成。
)

:: 確認靜態資源已同步
if not exist "%SOURCE_DIR%\public\images\" (
    echo   [WARN] 警告：靜態資源目錄 images 未發現。
)

echo   驗證成功，準備進行同步...

:: --------------------------------------------
:: 步驟 3: 同步檔案 (多執行緒加速)
:: --------------------------------------------
echo [3/4] 正在並行同步檔案 (核數: 16)...
:: /MT:16 開啟多執行緒同步，處理 6000+ 個檔案時倍速提升
robocopy "%SOURCE_DIR%\public" "%DEST_DIR%" /mir /xd .git /nfl /ndl /njh /njs /MT:16

if %errorlevel% GEQ 8 (
    echo.
    echo [FAIL] 檔案同步失敗
    pause
    exit /b 1
)

:: --------------------------------------------
:: 步驟 4: Git 發布
:: --------------------------------------------
echo [4/4] 正在發布至 GitHub...
cd /d "%DEST_DIR%"
git config core.safecrlf false
:: 使用 git status 檢查差異程度
git add .
git commit -m "Site Update: %date% %time%"
git push origin HEAD

if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Git Push 失敗，請檢查網路或 Token
    pause
    exit /b 1
)

echo ==========================================
echo  完成！網站已更新
echo ==========================================
pause
