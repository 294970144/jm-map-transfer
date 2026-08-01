@echo off
chcp 65001 >nul 2>&1
title JourneyMap Map Transfer Tool
echo ========================================
echo   JourneyMap Map Transfer Tool
echo ========================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

echo [INFO] Starting server on http://localhost:8090
echo [INFO] Press Ctrl+C to stop
echo.
node src/server.js
pause
