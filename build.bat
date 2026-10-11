@echo off
REM SARVIS Web App Build Script

echo ====================================
echo SARVIS Web App Build Script
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    exit /b 1
)

REM Install dependencies if needed
if not exist node_modules (
    echo Installing Node.js dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: npm install failed
        exit /b 1
    )
)

REM Build TypeScript + UI assets
echo Building TypeScript and web UI...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    exit /b 1
)

echo.
echo ====================================
echo Build Complete!
echo ====================================
echo.
echo To launch SARVIS web app:
echo   npm start
echo Then open http://localhost:9742 in your browser.
echo.
