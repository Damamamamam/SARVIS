@echo off
REM SARVIS Windows Desktop Build Script

echo ====================================
echo SARVIS Windows App Build Script
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
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
        exit /b 1
    )
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

REM Build TypeScript
echo Building TypeScript...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: TypeScript build failed
    exit /b 1
)

REM Build Windows Client
echo Building Windows WPF Client...
cd windows\JarvisWindows
call dotnet build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Windows client build failed
    cd ..\..
    exit /b 1
)
cd ..\..

echo.
echo ====================================
echo Build Complete!
echo ====================================
echo.
echo To launch SARVIS:
echo   Step 1: Start brain server - npm run start:server
echo   Step 2: Start Windows client - cd windows\JarvisWindows ^&^& dotnet run
echo.
echo Windows client executable location:
echo   windows\JarvisWindows\bin\Debug\net10.0-windows\JarvisWindows.exe
echo.
