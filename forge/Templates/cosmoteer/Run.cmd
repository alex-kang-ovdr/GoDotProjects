@echo off
setlocal
if defined GODOT_BIN if exist "%GODOT_BIN%" (
    set "LAB_ENGINE=%GODOT_BIN%"
    goto launch
)
for %%P in (
    "%~dp0..\..\..\Godot_v4.7.2-stable_win64.exe"
    "%~dp0..\..\..\..\GoDotProjects\Godot_v4.7.2-stable_win64.exe"
    "%~dp0..\..\..\..\..\GoDotProjects\Godot_v4.7.2-stable_win64.exe"
) do (
    if exist "%%~fP" (
        set "LAB_ENGINE=%%~fP"
        goto launch
    )
)
where godot >nul 2>&1
if not errorlevel 1 (
    set "LAB_ENGINE=godot"
    goto launch
)
echo Godot 4 was not found. Set GODOT_BIN or open project.godot in the Godot project manager.
exit /b 1
:launch
"%LAB_ENGINE%" --path "%~dp0." %*
exit /b %errorlevel%
