@echo off
setlocal
cd /d "%~dp0"

call "%~dp0Build-PC.bat" >nul 2>&1
if errorlevel 1 exit /b %errorlevel%

start "" /b "%~dp0Build\PC\CaptainSalvage.exe" >nul 2>&1
exit /b 0
