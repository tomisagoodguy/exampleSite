@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
cls

echo ==========================================
echo  Deploy (Local ^> GitHub ^> Auto Build)
echo ==========================================

set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"

cd /d "%ROOT_DIR%"

echo [1/2] Staging and committing...
git add -A
git diff --cached --quiet
if %errorlevel% == 0 (
  echo [INFO] Nothing to commit, pushing anyway...
) else (
  for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd HH:mm')"') do set "NOW=%%i"
  git commit -m "content: !NOW!"
  if errorlevel 1 goto :fail
)

echo [2/2] Pushing to GitHub ^(GHA will auto-build and deploy^)...
git push origin main
if errorlevel 1 goto :fail

echo ==========================================
echo  DONE^^! GitHub Actions is now building.
echo  Check: https://github.com/tomisagoodguy/exampleSite/actions
echo ==========================================
pause
exit /b 0

:fail
echo [FAIL] Git error. Check auth or conflicts.
pause
exit /b 1
