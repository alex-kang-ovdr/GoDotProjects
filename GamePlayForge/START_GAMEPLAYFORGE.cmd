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
if not exist "node_modules\ws\package.json" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node -e "require('./Tools/native-runtime.cjs').findGodot(process.cwd())"
if errorlevel 1 (pause & exit /b 1)
echo Open http://127.0.0.1:4173/Studio/ in your browser after the server starts.
echo Play opens a native Godot game window. Edit trusted GDScript in Studio.
echo Close this window or press Ctrl+C to stop.
node server.cjs
if errorlevel 1 pause
