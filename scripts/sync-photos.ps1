# 照片收件匣自動同步：由 Windows 工作排程器每 5 分鐘執行（scripts/sync-photos.vbs 隱藏視窗啟動）
# 收件匣有新照片且 2 分鐘沒變動（避免複製到一半）→ add-photos.py 壓縮歸檔 → 只 commit 照片資料夾 → push
# -DryRun：照樣壓縮歸檔，但不 commit / push（測試用）
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$inbox = Join-Path $root 'photos-inbox'
$photoDir = 'static/adventure-map/photos'
$logDir = Join-Path $root 'logs'
$log = Join-Path $logDir 'photo-sync.log'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Write-Log([string]$msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content -Path $log -Encoding utf8
}

if (-not (Test-Path $inbox)) { exit 0 }
$folders = @(Get-ChildItem $inbox -Directory | Where-Object Name -ne '_done')
if (-not $folders) { exit 0 }

$files = @($folders | Get-ChildItem -File -Recurse | Where-Object Name -ne '處理失敗.txt')
if (-not $files) { exit 0 }
$latest = ($files | Measure-Object LastWriteTime -Maximum).Maximum
if ($latest -gt (Get-Date).AddMinutes(-2)) { exit 0 }

# 上次失敗、資料夾都沒動過的就不用每 5 分鐘重跑
$pending = @($folders | Where-Object {
  $note = Join-Path $_.FullName '處理失敗.txt'
  -not (Test-Path $note) -or (@(Get-ChildItem $_.FullName -File | Where-Object { $_.Name -ne '處理失敗.txt' -and $_.LastWriteTime -gt (Get-Item $note).LastWriteTime }).Count -gt 0)
})
if (-not $pending) { exit 0 }

Set-Location $root
$env:PYTHONIOENCODING = 'utf-8'
# pwsh 預設用 cp950 解讀外部程式輸出，中文 log 會變亂碼
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$output = & "$env:USERPROFILE\.local\bin\uv.exe" run scripts/add-photos.py 2>&1 | Out-String
Write-Log $output.TrimEnd()

$changed = git status --porcelain -- $photoDir
if (-not $changed) { exit 0 }

$names = ($pending | ForEach-Object Name) -join '、'
if ($DryRun) { Write-Log "DryRun：略過 commit / push（$names）"; exit 0 }
# git 是外部程式，失敗不會丟例外，要看 $LASTEXITCODE
$steps = @(
  { git add -- $photoDir },
  { git commit -q -m "docs: 新增回憶照片（$names）" -- $photoDir },
  { git pull --rebase --autostash -q },
  { git push -q }
)
foreach ($step in $steps) {
  $out = & $step 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    Write-Log "git 失敗（$step）：$out"
    exit 1
  }
}
Write-Log "已上傳：$names"
