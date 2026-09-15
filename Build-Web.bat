@echo off
setlocal
cd /d "%~dp0"
node Tools\Build\build-web.js --target web --out Build\Web\CaptainSalvage
exit /b %errorlevel%
