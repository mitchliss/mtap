# Opens MarcTap in the default browser, starting the local server first if needed.
# ASCII-only file (PS 5.1 safe).
$url = "http://localhost:5210"
$root = Split-Path -Parent $PSScriptRoot

$up = $false
try { $null = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2; $up = $true } catch { }

if (-not $up) {
    # Serve the production build (dist/) quietly in the background.
    Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$root`" && npm run preview"
    $deadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $deadline) {
        try { $null = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2; $up = $true; break }
        catch { Start-Sleep -Milliseconds 500 }
    }
}

Start-Process $url
