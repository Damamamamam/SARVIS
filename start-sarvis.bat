@echo off
REM SARVIS Web App - Startup Script
REM Builds the brain, starts the web server, and opens the browser.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    msg * "ERROR: Node.js is not installed or not in PATH. Please install Node.js 18+ from https://nodejs.org/"
    exit /b 1
)

if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
    )
)

call npm run build >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    msg * "ERROR: TypeScript build failed"
    exit /b 1
)

REM Start web server in background (minimized window)
start /MIN cmd /c "npm start"

REM Wait for server to initialize
timeout /t 4 /nobreak >nul

REM Open the web app in the default browser
start "" "http://localhost:9742"
