@echo off
REM JARVIS Windows Desktop Build Script

echo ====================================
echo JARVIS Windows App Build Script
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

REM Build TypeScript & Package UI
echo Building TypeScript and UI assets...
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
echo To launch the JARVIS Windows App:
echo   npm run dev   (or start-brain.bat)
echo.
echo To package as a standalone Windows .exe installer:
echo   npm run package:win
echo.