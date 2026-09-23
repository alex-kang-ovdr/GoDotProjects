@echo off
setlocal
set "GODOT=%~dp0..\Godot_v4.7.2-stable_win64.exe"
if not exist "%GODOT%" (
  echo Godot executable not found. Edit GODOT in this BAT file.
  exit /b 2
)
rem %~dp0 ends in a backslash; append a dot so the closing quote is not
rem interpreted as an escaped quote by Godot's Windows argument parser.
"%GODOT%" --path "%~dp0." "%~dp0scenes\defense_turret_gallery.tscn"
endlocal
