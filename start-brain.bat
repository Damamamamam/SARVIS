@echo off
REM SARVIS Web App Startup Script

echo ====================================
echo Starting SARVIS Web App
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo WARNING: .env file not found
    echo Creating .env from .env.example...
    if exist .env.example (
        copy .env.example .env >nul
        echo .env file created.
    )
)

echo Launching SARVIS web app...
call npm run dev
