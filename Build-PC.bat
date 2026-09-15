@echo off
setlocal
cd /d "%~dp0"
node Tools\Build\build-web.js --target pc --out Build\PC\CaptainSalvage
exit /b %errorlevel%
