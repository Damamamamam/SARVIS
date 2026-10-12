@echo off
REM SARVIS Desktop App - build and launch the Electron client.
cd /d "%~dp0"
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    msg * "ERROR: Node.js is not installed or not in PATH."
    exit /b 1
)
call npm run start:app
