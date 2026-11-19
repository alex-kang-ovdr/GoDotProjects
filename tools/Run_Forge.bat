@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required on PATH. Nothing was started.
  exit /b 1
)
if /i "%~1"=="agent" (
  node "%~dp0launch.cjs" agent
) else (
  node "%~dp0launch.cjs" forge open-editor
)
exit /b %errorlevel%
