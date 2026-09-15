@echo off
setlocal
set "GODOT=%~dp0..\Godot_v4.7.2-stable_win64.exe"
if not exist "%GODOT%" set "GODOT=%~dp0..\.tools\godot-4.7.2\Godot_v4.7.2-stable_win64.exe"
if not exist "%GODOT%" (
  echo Godot executable not found. Set GODOT environment variable or edit this file.
  exit /b 2
)
"%GODOT%" --path "%~dp0" "%~dp0scenes\authored_characters_gallery.tscn"
endlocal
