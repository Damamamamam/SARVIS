@echo off
REM SARVIS Windows Desktop Application - Stop Script
REM This script stops both the Brain server and Windows client

echo ====================================
echo Stopping SARVIS Components
echo ====================================
echo.

REM Stop Windows client
echo Stopping Windows client...
taskkill /F /IM JarvisWindows.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Windows client stopped.
) else (
    echo Windows client was not running.
)

REM Stop Brain server (Node.js process)
echo Stopping Brain server...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq SARVIS Brain Server*" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Brain server stopped.
) else (
    echo Brain server was not running or already stopped.
)

echo.
echo ====================================
echo SARVIS components stopped
echo ====================================
echo.
pause
