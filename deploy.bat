@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
cls

echo ==========================================
echo  Deploy Script
echo ==========================================

set "START_TIME=%TIME%"
call :time_to_seconds "%START_TIME%" TOTAL_START_SECONDS

set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "DEST_DIR=C:\Users\user\Documents\GitHub\tomisagoodguy.github.io"
set "LOG_DIR=%ROOT_DIR%\logs"
for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd-HHmmssfff')"') do set "RUN_STAMP=%%i"
set "LOG_FILE=%LOG_DIR%\deploy-%RUN_STAMP%.log"
set "LATEST_LOG_FILE=%LOG_DIR%\deploy.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
(
  echo ==========================================
  echo Deploy started at %date% %time%
  echo ==========================================
) > "%LOG_FILE%"

call :step_start "1/4" "Building site (Hugo)"
cd /d "%ROOT_DIR%"
.\hugo.exe --gc --minify >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :build_fail
call :step_done "1/4"

call :step_start "2/4" "Running quick structure checks"
if not exist "%ROOT_DIR%\public\index.html" goto :validate_fail
if not exist "%ROOT_DIR%\public\lifestyle\index.html" (
  echo [WARN] public\lifestyle\index.html not found.
  echo [WARN] public\lifestyle\index.html not found at %date% %time% >> "%LOG_FILE%"
)
echo [OK] Validation passed.
echo [OK] Validation passed at %date% %time% >> "%LOG_FILE%"
call :step_done "2/4"

call :step_start "3/4" "Syncing files with robocopy"
robocopy "%ROOT_DIR%\public" "%DEST_DIR%" /MIR /XD .git /MT:16 /FFT /ETA >> "%LOG_FILE%" 2>&1
set "ROBOCODE=%ERRORLEVEL%"
if !ROBOCODE! geq 8 goto :sync_fail
echo [OK] Sync done. (robocopy code !ROBOCODE!)
echo [OK] Sync done. (robocopy code !ROBOCODE!) at %date% %time% >> "%LOG_FILE%"
call :step_done "3/4"

call :step_start "4/4" "Publishing to GitHub"
cd /d "%DEST_DIR%"
git checkout --orphan _deploy_tmp >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :git_fail
git add -A >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :git_fail
git commit -m "Site Update: %date% %time%" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :git_fail
git branch -M _deploy_tmp main >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :git_fail
git push origin main --force >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :git_fail
call :step_done "4/4"

set "END_TIME=%TIME%"
call :time_to_seconds "%END_TIME%" TOTAL_END_SECONDS
set /a TOTAL_ELAPSED_SECONDS=TOTAL_END_SECONDS-TOTAL_START_SECONDS
if !TOTAL_ELAPSED_SECONDS! lss 0 set /a TOTAL_ELAPSED_SECONDS+=86400

echo ==========================================
echo  SUCCESS! Site updated.
echo ==========================================
echo  Start: %START_TIME%
echo  End  : %END_TIME%
echo  Total: !TOTAL_ELAPSED_SECONDS! seconds
echo  Log  : %LOG_FILE%
echo ==========================================
echo [SUCCESS] Deploy completed at %date% %time% ^(elapsed: !TOTAL_ELAPSED_SECONDS!s^) >> "%LOG_FILE%"
copy /y "%LOG_FILE%" "%LATEST_LOG_FILE%" > nul 2>&1
pause
exit /b 0

:build_fail
echo [FAIL] Build failed. Check content format.
echo [FAIL] Hugo build failed at %date% %time% >> "%LOG_FILE%"
copy /y "%LOG_FILE%" "%LATEST_LOG_FILE%" > nul 2>&1
echo Log: %LOG_FILE%
pause
exit /b 1

:validate_fail
echo [FAIL] Missing public\index.html, deploy stopped.
echo [FAIL] Missing public\index.html at %date% %time% >> "%LOG_FILE%"
copy /y "%LOG_FILE%" "%LATEST_LOG_FILE%" > nul 2>&1
echo Log: %LOG_FILE%
pause
exit /b 1

:sync_fail
echo [FAIL] File sync failed (robocopy code !ROBOCODE!).
echo [FAIL] Robocopy failed with code !ROBOCODE! at %date% %time% >> "%LOG_FILE%"
copy /y "%LOG_FILE%" "%LATEST_LOG_FILE%" > nul 2>&1
echo Log: %LOG_FILE%
pause
exit /b 1

:git_fail
echo [FAIL] Git publish failed. Check auth/network or log.
echo [FAIL] Git publish failed at %date% %time% >> "%LOG_FILE%"
copy /y "%LOG_FILE%" "%LATEST_LOG_FILE%" > nul 2>&1
echo Log: %LOG_FILE%
pause
exit /b 1

:step_start
set "STEP_START_TIME=%TIME%"
call :time_to_seconds "%STEP_START_TIME%" STEP_START_SECONDS
echo [%~1] %~2...
echo [%date% %time%] [START] %~1 %~2 >> "%LOG_FILE%"
goto :eof

:step_done
set "STEP_END_TIME=%TIME%"
call :time_to_seconds "%STEP_END_TIME%" STEP_END_SECONDS
set /a STEP_ELAPSED_SECONDS=STEP_END_SECONDS-STEP_START_SECONDS
if !STEP_ELAPSED_SECONDS! lss 0 set /a STEP_ELAPSED_SECONDS+=86400
echo [%~1] Done in !STEP_ELAPSED_SECONDS!s.
echo [%date% %time%] [DONE] %~1 ^(elapsed: !STEP_ELAPSED_SECONDS!s^) >> "%LOG_FILE%"
goto :eof

:time_to_seconds
set "RAW_TIME=%~1"
set "RAW_TIME=%RAW_TIME: =0%"
for /f "tokens=1-3 delims=:." %%a in ("%RAW_TIME%") do (
    set /a _h=1%%a-100
    set /a _m=1%%b-100
    set /a _s=1%%c-100
)
set /a _total=_h*3600+_m*60+_s
set "%~2=%_total%"
goto :eof
