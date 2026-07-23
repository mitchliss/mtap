# Creates/updates the MTap shortcut on the user's Desktop (removes the old MarcTap one).
# ASCII-only file (PS 5.1 safe).
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell

$old = Join-Path $desktop "MarcTap.lnk"
if (Test-Path $old) { Remove-Item $old -Force -Confirm:$false }

$lnkPath = Join-Path $desktop "MTap.lnk"
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $env:windir "System32\wscript.exe"
$lnk.Arguments = '"' + (Join-Path $root "scripts\launch-marctap.vbs") + '"'
$lnk.WorkingDirectory = $root
$lnk.IconLocation = (Join-Path $root "assets\marctap.ico") + ",0"
$lnk.Description = "MTap - daily globe geography game"
$lnk.Save()

Write-Output ("shortcut written: " + $lnkPath)
