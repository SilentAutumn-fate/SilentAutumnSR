@echo off
setlocal
cd /d "%~dp0"
title SilentAutumnSR - run

rem Starts the server and bundled FireFly proxy, then exits.
rem If this is the first run, run install.bat first.

where powershell >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Windows PowerShell was not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run.ps1" %* -Proxy -NoGame
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo Startup failed with exit code %RC%. See the message above.
    pause
    exit /b %RC%
)

echo.
echo The server and proxy run independently of this window.
echo Double-click stop.bat when you are done.
exit /b 0
