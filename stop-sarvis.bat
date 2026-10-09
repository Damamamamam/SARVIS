@echo off
REM SARVIS Windows Desktop Application - Stop Script (Silent)

REM Stop Windows client
taskkill /F /IM JarvisWindows.exe >nul 2>&1

REM Stop Brain server (Node.js process)
taskkill /F /IM node.exe /FI "WINDOWTITLE eq SARVIS Brain Server*" >nul 2>&1
