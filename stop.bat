@echo off
REM Hayagriva Shutdown Script for Windows
echo [INFO] Stopping Hayagriva background services on Windows...

REM Kill processes holding port 3210 (Backend) and port 8090 (LLM Server)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3210" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8090" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

REM Kill any lingering cli.js or llama-server processes
taskkill /F /IM "llama-server.exe" >nul 2>nul

echo [INFO] Hayagriva background services stopped.
