@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 exit /b 1
node "%~dp0preflight.cjs" all
exit /b %errorlevel%
