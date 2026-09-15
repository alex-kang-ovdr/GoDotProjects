@echo off
setlocal
set "PROJECT_DIR=%~dp0."
set "GODOT_EXE=%PROJECT_DIR%\..\Godot_v4.7.2-stable_win64_console.exe"
if not exist "%GODOT_EXE%" set "GODOT_EXE=%PROJECT_DIR%\..\.tools\godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe"
set "OUTPUT=%PROJECT_DIR%\build\VoxelFrontier-arm64-debug.apk"

if not exist "%GODOT_EXE%" (
  echo Godot console executable not found: %GODOT_EXE%
  exit /b 2
)
if not exist "%PROJECT_DIR%\export_presets.cfg" (
  echo export_presets.cfg not found: %PROJECT_DIR%
  exit /b 2
)
if not exist "%PROJECT_DIR%\build" mkdir "%PROJECT_DIR%\build"

echo Building Android ARM64 Debug APK...
"%GODOT_EXE%" --headless --path "%PROJECT_DIR%" --export-debug "Android ARM64 Debug" "%OUTPUT%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo Debug APK build failed with exit code %RESULT%.
  exit /b %RESULT%
)
if not exist "%OUTPUT%" (
  echo Godot reported success but the APK was not created: %OUTPUT%
  exit /b 1
)
for %%A in ("%OUTPUT%") do echo DEBUG APK: %%~fA ^(%%~zA bytes^)
exit /b 0
