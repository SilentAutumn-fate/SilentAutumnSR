@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   SilentAutumnSR - Installing dependencies
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo         Please install Node.js first: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js detected:
call node -v
echo.

echo Running "npm install" ...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    echo         Please check your network connection or npm configuration.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Done. Dependencies installed.
echo   Next: double-click run.bat to start
echo         the server and the proxy.
echo ============================================
pause
endlocal
