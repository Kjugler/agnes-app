@echo off
cd /d "%~dp0\.."
echo Running database merge...
echo.
node tools\db-merge-historical-into-deepquill.js
echo.
pause

