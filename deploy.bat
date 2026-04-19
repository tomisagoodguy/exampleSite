@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
cls
echo ==========================================
echo  🚀 網站快速發布系統 (Premium Edition)
echo ==========================================

:: 開始時間計時
set "START_TIME=%TIME%"

set SOURCE_DIR=%~dp0
set SOURCE_DIR=%SOURCE_DIR:~0,-1%
set DEST_DIR=C:\Users\user\Documents\GitHub\tomisagoodguy.github.io

:: --------------------------------------------
:: 步驟 1: 編譯網站
:: --------------------------------------------
echo [1/4] 正在編譯網站 (Hugo)...
cd /d "%SOURCE_DIR%"
.\hugo.exe --gc --minify

if %errorlevel% neq 0 (
    echo.
    echo ❌ [FAIL] 編譯失敗，請檢查文章格式
    pause
    exit /b 1
)

:: --------------------------------------------
:: 步驟 2: 極速結構驗證
:: --------------------------------------------
echo [2/4] 正在執行極速結構驗證...

if not exist "%SOURCE_DIR%\public\index.html" (
    echo   ❌ [FAIL] 首頁 index.html 遺失！部署中止。
    pause & exit /b 1
)

:: 快速抽樣檢查關鍵目錄
if not exist "%SOURCE_DIR%\public\lifestyle\index.html" (
    echo   ⚠️  [WARN] 警告：分類目錄 lifestyle 可能未正確生成。
)

echo   ✅ 驗證成功，準備進行同步...

:: --------------------------------------------
:: 步驟 3: 同步檔案 (移除 /z 以加速本地同步)
:: --------------------------------------------
echo [3/4] 正在並行同步檔案 (核數: 16)...
:: 移除 /z (Restartable Mode)，因為本地同步不需要，且會嚴重影響效能。
robocopy "%SOURCE_DIR%\public" "%DEST_DIR%" /mir /xd .git /nfl /ndl /njh /njs /MT:16 /fft

if %errorlevel% GEQ 8 (
    echo.
    echo ❌ [FAIL] 檔案同步失敗
    pause
    exit /b 1
)

:: --------------------------------------------
:: 步驟 4: Git 發布
:: --------------------------------------------
echo [4/4] 正在發布至 GitHub...
cd /d "%DEST_DIR%"
git config core.safecrlf false

:: 檢查變更數量
git add .
git diff --cached --stat --name-only | find /c /v "" > temp_count.txt
set /p CHANGE_COUNT=<temp_count.txt
del temp_count.txt

if %CHANGE_COUNT% equ 0 (
    echo   ✨ [SKIP] 沒有任何變更，跳過推送。
    goto done
)

echo   📦 發現 %CHANGE_COUNT% 個檔案變更，準備 Commit...
git commit -m "Site Update: %date% %time%"
git push origin HEAD

if %errorlevel% neq 0 (
    echo.
    echo ❌ [FAIL] Git Push 失敗，請檢查網路或權限
    pause
    exit /b 1
)

:done
:: 結束時間計時
set "END_TIME=%TIME%"

echo ==========================================
echo  ✅ 完成！網站已成功更新
echo ==========================================
echo  開始時間: %START_TIME%
echo  結束時間: %END_TIME%
echo ==========================================
pause

