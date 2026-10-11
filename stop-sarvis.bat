@echo off
REM SARVIS Web App - Stop Script

REM Stop the SARVIS web server (Node.js process running webapp.js)
for /f "tokens=2" %%p in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST ^| find "PID:"') do (
    taskkill /F /PID %%p >nul 2>&1
)
