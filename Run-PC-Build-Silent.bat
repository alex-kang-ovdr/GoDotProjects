@echo off
setlocal
cd /d "%~dp0"

call "%~dp0Build-PC.bat" >nul 2>&1
if errorlevel 1 exit /b %errorlevel%

if not exist "%CAPTAIN_PC_EXE%" exit /b 4
start "" /b "%CAPTAIN_PC_EXE%" %* >nul 2>&1
exit /b %errorlevel%
