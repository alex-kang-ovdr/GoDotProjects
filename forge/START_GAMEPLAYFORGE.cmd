@echo off
setlocal
cd /d "%~dp0"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if not exist "Launch\PlayForge-Web-Official.exe" if not exist "Launch\PlayForge-Web-Official.next.exe" if exist "..\tools\Run_Forge.bat" (
  call "..\tools\Run_Forge.bat"
  if errorlevel 1 exit /b 1
  exit /b 0
)
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
if exist "Launch\PlayForge-Web-Official.next.exe" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$d='%~dp0Launch\PlayForge-Web-Official.exe';$p='%~dp0Launch\PlayForge-Web-Official.next.exe';if(Test-Path -LiteralPath $d){try{$s=[IO.File]::Open($d,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$s.Dispose()}catch [IO.IOException]{exit 2}};try{if(Test-Path -LiteralPath $d){$b=$d+'.'+[guid]::NewGuid().ToString('N')+'.bak';[IO.File]::Replace($p,$d,$b);try{[IO.File]::Delete($b)}catch [IO.IOException]{}}else{[IO.File]::Move($p,$d)};exit 0}catch{exit 1}"
  if errorlevel 2 goto launch_pending
  if errorlevel 1 (
    echo Could not install the pending Official Godot launcher.
    pause
    exit /b 1
  )
  echo Installed the pending Official Godot launcher.
)
if not exist "Launch\PlayForge-Web-Official.exe" (
  echo Official Godot launcher was not found in Launch.
  pause
  exit /b 1
)
start "" "%~dp0Launch\PlayForge-Web-Official.exe"
exit /b 0

:launch_pending
echo The current Official Godot launcher is still running. Starting the pending launcher without stopping it.
start "" "%~dp0Launch\PlayForge-Web-Official.next.exe"
