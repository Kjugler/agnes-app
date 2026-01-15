@echo off
setlocal
echo Running fulfillment backfill...
cd /d C:\dev\agnes-app\deepquill
node ..\tools\backfill-purchases-to-fulfillment.js
echo.
echo Done. Press any key to close.
pause
endlocal

