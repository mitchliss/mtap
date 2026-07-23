@echo off
echo Starting MTap (online mode)...
echo.

:: Kill anything already on port 5210
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5210') do taskkill /PID %%a /F 2>nul

:: Serve the production build (dist/)
echo Starting MTap server...
start "MTap Server" cmd /k "cd /d C:\Users\mliss\Documents\marctap && npm run preview"

:: Wait for the server
timeout /t 4 /nobreak > nul

:: Start ngrok tunnel (same mechanism as Glencoe)
echo Starting ngrok tunnel...
start "MTap ngrok" cmd /k "ngrok http 5210"

:: Wait for ngrok, then show the public URL
timeout /t 4 /nobreak > nul
echo.
echo Public URL (share this with Marc):
powershell -NoProfile -Command "try { $r = Invoke-RestMethod http://localhost:4040/api/tunnels -TimeoutSec 3; $t = $r.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1; if ($t) { Write-Host ('   ' + $t.public_url) -ForegroundColor Green } else { Write-Host '   (check the ngrok window)' } } catch { Write-Host '   (check the ngrok window)' }"

:: Open it locally too
start http://localhost:5210

echo.
echo MTap is live. Keep both windows open while people are playing.
echo Closing the ngrok window takes the game offline.
pause
