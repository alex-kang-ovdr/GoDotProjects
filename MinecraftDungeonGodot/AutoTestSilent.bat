@echo off
setlocal
set "PROJECT_DIR=%~dp0."
set "GODOT_EXE=D:\Github\GoDot-Engine\Godot_v4.7.2-stable_win64_console.exe"
if not exist "%GODOT_EXE%" (
  echo Godot console executable not found: "%GODOT_EXE%"
  exit /b 2
)
"%GODOT_EXE%" --headless --path "%PROJECT_DIR%" --script res://tests/test_runner.gd >nul 2>&1
exit /b %ERRORLEVEL%
