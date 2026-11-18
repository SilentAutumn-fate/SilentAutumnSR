@echo off
setlocal
cd /d "%~dp0"
title SilentAutumnSR - install

rem One-click installer. Needs nothing preinstalled but Windows and PowerShell:
rem if Node.js is missing it is downloaded (checksum-verified) into runtime\node,
rem so nothing is added to PATH and no administrator rights are required.

where powershell >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Windows PowerShell was not found.
    echo         This installer needs it to download Node.js.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install.ps1" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo Install failed with exit code %RC%.
    pause
    exit /b %RC%
)

echo.
echo You can close this window. Next step: double-click run.bat
pause
endlocal
