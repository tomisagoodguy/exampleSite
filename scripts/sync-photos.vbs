' 工作排程器用：不跳出視窗執行 sync-photos.ps1
Set fso = CreateObject("Scripting.FileSystemObject")
ps1 = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "sync-photos.ps1")
CreateObject("WScript.Shell").Run """C:\Program Files\PowerShell\7\pwsh.exe"" -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """", 0, True
