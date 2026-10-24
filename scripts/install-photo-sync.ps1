# 註冊 Windows 工作排程「破關地圖照片同步」：每 5 分鐘處理 photos-inbox/ 並 push（只需執行一次）
#   安裝：pwsh -File scripts/install-photo-sync.ps1
#   移除：pwsh -File scripts/install-photo-sync.ps1 -Uninstall
param([switch]$Uninstall)
$name = '破關地圖照片同步'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
  Write-Host "已移除排程「$name」"
  exit 0
}

$vbs = Join-Path $PSScriptRoot 'sync-photos.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Description '每 5 分鐘處理 exampleSite/photos-inbox 的照片並 push' -Force | Out-Null
Write-Host "已註冊排程「$name」，每 5 分鐘檢查一次 photos-inbox/；紀錄在 logs/photo-sync.log"
