@echo off
setlocal
set "PROJECT_DIR=%~dp0."
set "GODOT_EXE=%PROJECT_DIR%\..\Godot_v4.7.2-stable_win64.exe"
if not exist "%GODOT_EXE%" set "GODOT_EXE=%PROJECT_DIR%\..\.tools\godot-4.7.2\Godot_v4.7.2-stable_win64.exe"
if not exist "%GODOT_EXE%" (
  echo Godot executable not found: %GODOT_EXE%
  exit /b 2
)
start "Voxel Frontier" "%GODOT_EXE%" --path "%PROJECT_DIR%" -- %*
