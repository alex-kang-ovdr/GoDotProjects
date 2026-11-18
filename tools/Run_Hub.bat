@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required on PATH. Nothing was started.
  exit /b 1
)
node "%~dp0launch.cjs" hub
exit /b %errorlevel%
