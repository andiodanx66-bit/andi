@echo off
title E-Football Database Server
color 0A
cls

echo.
echo  ======================================================
echo  ^|                                                    ^|
echo  ^|        ⚽ E-FOOTBALL LEAGUE MANAGEMENT ⚽          ^|
echo  ^|              Database Server (Port 8000)           ^|
echo  ^|                                                    ^|
echo  ======================================================
echo.

REM Check if Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Node.js not found!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo After installation, restart this script.
    pause
    exit /b 1
)

echo ✅ Node.js detected - Checking dependencies...

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ ERROR: Failed to install dependencies!
        echo Please check your internet connection and try again.
        pause
        exit /b 1
    )
) else (
    echo ✅ Dependencies found
)

echo.
echo 🚀 Starting E-Football Database Server on port 8000...
echo.
echo 📱 Access your application at:
echo   • Local:    http://localhost:8000
echo   • Local:    http://127.0.0.1:8000

REM Get network IP for sharing
echo.
echo 🌐 Share with others on your network:
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%j in ("%%i") do (
        set "ip=%%j"
        setlocal enabledelayedexpansion
        echo   • Network:  http://!ip!:8000
        endlocal
    )
)

echo.
echo 📋 Instructions for sharing:
echo   1. Make sure your firewall allows connections on port 8000
echo   2. Share the Network URL with others on the same WiFi
echo   3. Press Ctrl+C to stop the server
echo.
echo 📊 API endpoints available:
echo   • Teams:     /api/teams
echo   • Matches:   /api/matches
echo   • Results:   /api/pending-results
echo   • Users:     /api/users
echo   • Settings:  /api/settings
echo   • Health:    /api/health
echo.
echo ⏳ Starting server... (Press Ctrl+C to stop)
echo ========================================================
echo.

REM Start the server and open browser
start "" "http://localhost:8000"
node server.js

:end
echo.
echo 👋 Database server stopped. Thank you for using E-Football League Management!
pause