@echo off
REM SARVIS Windows Desktop Application - Complete Startup Script (Silent)
REM This script starts both the Brain server and Windows client without showing terminals

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    msg * "ERROR: Node.js is not installed or not in PATH. Please install Node.js 18+ from https://nodejs.org/"
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
        msg * "ERROR: .NET SDK is not installed or not in PATH. Please install .NET SDK from https://dotnet.microsoft.com/"
        exit /b 1
    )
)

REM Check if .env file exists
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
    )
)

REM Build TypeScript
call npm run build >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    msg * "ERROR: TypeScript build failed"
    exit /b 1
)

REM Build Windows client
cd windows\JarvisWindows
call dotnet build >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    cd ..\..
    msg * "ERROR: Windows client build failed"
    exit /b 1
)
cd ..\..

REM Start Brain server in background (hidden window)
start /MIN cmd /c "npm run start:server"

REM Wait for Brain server to initialize
timeout /t 3 /nobreak >nul

REM Start Windows client
cd windows\JarvisWindows
start "" dotnet run
cd ..\..
