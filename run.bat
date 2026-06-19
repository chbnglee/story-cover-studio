@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

echo.
echo Starting Story Cover Studio...
echo If port 5173 is busy, the app will automatically try the next port.
echo A browser window will open when the server is ready.
echo.
set OPEN_BROWSER=1
node server.js
pause
