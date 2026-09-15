@echo off
setlocal
cd /d "%~dp0"
call "%~dp0Build-PC.bat"
if errorlevel 1 exit /b %errorlevel%
node Tools\Build\serve-pc.js --root Build\PC\CaptainSalvage --open
exit /b %errorlevel%
