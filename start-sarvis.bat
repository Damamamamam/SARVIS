@echo off
REM SARVIS Windows Desktop Application - Complete Startup Script
REM This script starts both the Brain server and Windows client

echo ====================================
echo SARVIS Windows Desktop Assistant
echo Complete Startup Script
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if .NET is installed
where dotnet >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    if exist "%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe" (
        set "PATH=%LOCALAPPDATA%\Microsoft\dotnet;%PATH%"
    ) else if exist "%USERPROFILE%\AppData\Local\Microsoft\dotnet\dotnet.exe" (
        set "PATH=%USERPROFILE%\AppData\Local\Microsoft\dotnet;%PATH%"
    ) else (
        echo ERROR: .NET SDK is not installed or not in PATH
        echo Please install .NET SDK from https://dotnet.microsoft.com/
        pause
        exit /b 1
    )
)

REM Check if .env file exists
if not exist .env (
    echo WARNING: .env file not found
    echo Creating .env from .env.example...
    if exist .env.example (
        copy .env.example .env >nul
        echo .env file created. Please configure your API keys.
    )
)

REM Install dependencies if needed
if not exist node_modules (
    echo Installing Node.js dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
)

REM Build TypeScript if needed
if not exist dist (
    echo Building TypeScript...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: TypeScript build failed
        pause
        exit /b 1
    )
)

REM Build Windows client if needed
if not exist windows\JarvisWindows\bin\Debug\net10.-windows\JarvisWindows.exe (
    echo Building Windows client...
    cd windows\JarvisWindows
    call dotnet build
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Windows client build failed
        cd ..\..
        pause
        exit /b 1
    )
    cd ..\..
)

echo.
echo ====================================
echo Starting SARVIS Components
echo ====================================
echo.

REM Start Brain server in background
echo [1/2] Starting Brain server on localhost:9741...
start "SARVIS Brain Server" cmd /c "npm run start:server && pause"

REM Wait for Brain server to initialize
echo Waiting for Brain server to initialize...
timeout /t 3 /nobreak >nul

REM Start Windows client
echo [2/2] Starting Windows client...
cd windows\JarvisWindows
start "" dotnet run
cd ..\..

echo.
echo ====================================
echo SARVIS is now running!
echo ====================================
echo.
echo - Brain server: Running in background window
echo - Windows client: Should open in a new window
echo.
echo To stop SARVIS:
echo   1. Close the Windows client window
echo   2. Close the Brain server window
echo.
pause
