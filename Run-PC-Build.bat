@echo off
setlocal
cd /d "%~dp0"
call "%~dp0Build-PC.bat"
if errorlevel 1 exit /b %errorlevel%
start "Captain Salvage" "Build\PC\CaptainSalvage.exe"
exit /b 0
