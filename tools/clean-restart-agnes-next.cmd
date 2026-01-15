@echo off
setlocal
echo ================================================================================
echo CLEAN RESTART: agnes-next
echo ================================================================================
echo.
echo This will:
echo   1. Stop any running agnes-next processes (port 3002)
echo   2. Delete .next folder (clears stale build cache)
echo   3. Restart the dev server
echo.
echo Press Ctrl+C to cancel, or any key to continue...
pause >nul
echo.

echo [1/3] Stopping processes on port 3002...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do (
    echo Killing process %%a...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [2/3] Deleting .next folder...
cd /d C:\dev\agnes-app\agnes-next
if exist .next (
    rmdir /s /q .next
    echo .next folder deleted.
) else (
    echo .next folder not found (already clean).
)

echo [3/3] Starting dev server...
echo.
echo Server will start in a new window. Close this window when done.
start "agnes-next dev server" cmd /k "npm run dev"

echo.
echo ================================================================================
echo Clean restart complete!
echo ================================================================================
echo.
pause
endlocal

