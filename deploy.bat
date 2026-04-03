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
:: 步驟 2: 自動化測試
:: --------------------------------------------
echo [2/4] 正在執行自動化測試...
set FAIL=0

:: 測試 1: 首頁
if not exist "%SOURCE_DIR%\public\index.html" (
    echo   [FAIL] 首頁 index.html 不存在
    set FAIL=1
)

:: 測試 2: 搜尋索引
if not exist "%SOURCE_DIR%\public\index.json" (
    echo   [FAIL] 搜尋索引 index.json 不存在
    set FAIL=1
)

:: 測試 3: 核心分類頁面
for %%S in (lifestyle automation real-estate links) do (
    if not exist "%SOURCE_DIR%\public\%%S\" (
        echo   [FAIL] 分類頁面不存在: %%S
        set FAIL=1
    )
)

:: 測試 4: 頁面數量合理 (至少 20 頁)
set HTML_COUNT=0
for /r "%SOURCE_DIR%\public" %%F in (index.html) do (
    set /a HTML_COUNT+=1
)
if !HTML_COUNT! LSS 20 (
    echo   [FAIL] 頁面數量過少: !HTML_COUNT! 頁 - 預期至少 20 頁
    set FAIL=1
) else (
    echo   [PASS] 頁面數量: !HTML_COUNT! 頁
)

echo   [DEBUG] FAIL=!FAIL!
if !FAIL! neq 0 (
    echo.
    echo [FAIL] 測試未通過，部署中止
    pause
    exit /b 1
)
echo   所有測試通過

:: --------------------------------------------
:: 步驟 3: 同步檔案 (只同步差異)
:: --------------------------------------------
echo [3/4] 正在同步檔案...
robocopy "%SOURCE_DIR%\public" "%DEST_DIR%" /mir /xd .git /nfl /ndl /njh /njs

if %errorlevel% GEQ 8 (
    echo.
    echo [FAIL] 檔案同步失敗
    pause
    exit /b 1
)

:: --------------------------------------------
:: 步驟 4: 發布
:: --------------------------------------------
echo [4/4] 正在發布...
cd /d "%DEST_DIR%"
git config core.safecrlf false
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
