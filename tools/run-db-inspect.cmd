@echo off
cd /d "%~dp0\.."
echo Running database inspection...
echo.
node tools\db-inspect.js
echo.
pause

