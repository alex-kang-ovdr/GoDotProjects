@echo off
setlocal
cd /d "%~dp0"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
if not exist "node_modules\yjs\package.json" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist "Launch\PlayForge-Web-Official.exe" (
  echo Official Godot launcher was not found in Launch.
  pause
  exit /b 1
)
start "" "%~dp0Launch\PlayForge-Web-Official.exe"
