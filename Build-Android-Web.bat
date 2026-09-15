@echo off
setlocal
cd /d "%~dp0"
node Tools\Build\build-web.js --target android-web --out Build\Android\web
exit /b %errorlevel%
