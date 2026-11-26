@echo off
setlocal
set "LAB_ENGINE=%~dp0..\Godot_v4.7.2-stable_win64.exe"
if exist "%LAB_ENGINE%" goto launch
where godot >nul 2>&1
if not errorlevel 1 (
    set "LAB_ENGINE=godot"
    goto launch
)
echo Godot 4 was not found. Open project.godot in the Godot project manager.
exit /b 1
:launch
"%LAB_ENGINE%" --path "%~dp0." %*
exit /b %errorlevel%
