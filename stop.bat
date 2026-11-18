@echo off
setlocal
cd /d "%~dp0"
title SilentAutumnSR - stop

rem Only terminates the processes listening on 23301 / 21000.
rem It never kills unrelated Node.js applications.

set "NODE=node"
if exist "%~dp0runtime\node\node.exe" set "NODE=%~dp0runtime\node\node.exe"

where "%NODE%" >nul 2>nul
if errorlevel 1 (
    if not exist "%~dp0runtime\node\node.exe" (
        echo [ERROR] Node.js not found. Run install.bat first.
        pause
        exit /b 1
    )
)

"%NODE%" "%~dp0tools\stop.js"

echo.
echo Note: the traffic proxy is a separate program - close its window too if you started it.
pause
endlocal
