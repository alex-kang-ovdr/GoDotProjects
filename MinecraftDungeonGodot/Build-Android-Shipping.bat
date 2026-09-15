@echo off
setlocal
set "PROJECT_DIR=%~dp0."
set "GODOT_EXE=%PROJECT_DIR%\..\Godot_v4.7.2-stable_win64_console.exe"
if not exist "%GODOT_EXE%" set "GODOT_EXE=%PROJECT_DIR%\..\.tools\godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe"
set "OUTPUT=%PROJECT_DIR%\build\VoxelFrontier-arm64-shipping.apk"

if not exist "%GODOT_EXE%" (
  echo Godot console executable not found: %GODOT_EXE%
  exit /b 2
)
if not exist "%PROJECT_DIR%\export_presets.cfg" (
  echo export_presets.cfg not found: %PROJECT_DIR%
  exit /b 2
)
findstr /C:"keystore/release=\"\"" "%PROJECT_DIR%\export_presets.cfg" >nul
if not errorlevel 1 (
  echo Android ARM64 Shipping has no release keystore configured.
  echo Configure Project ^> Export ^> Android ARM64 Shipping, save, then rerun.
  exit /b 3
)
findstr /C:"keystore/release_user=\"\"" "%PROJECT_DIR%\export_presets.cfg" >nul
if not errorlevel 1 (
  echo Android ARM64 Shipping has no release keystore alias configured.
  exit /b 3
)
findstr /C:"keystore/release_password=\"\"" "%PROJECT_DIR%\export_presets.cfg" >nul
if not errorlevel 1 (
  echo Android ARM64 Shipping has no release keystore password configured.
  exit /b 3
)
if not exist "%PROJECT_DIR%\build" mkdir "%PROJECT_DIR%\build"

echo Building Android ARM64 Shipping APK...
echo The Android ARM64 Shipping preset must contain a release keystore.
echo Configure it in Project ^> Export ^> Android ARM64 Shipping before running this file.
"%GODOT_EXE%" --headless --path "%PROJECT_DIR%" --export-release "Android ARM64 Shipping" "%OUTPUT%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo Shipping APK build failed with exit code %RESULT%.
  echo A missing release keystore is a signing failure, not a usable shipping APK.
  exit /b %RESULT%
)
if not exist "%OUTPUT%" (
  echo Godot reported success but the APK was not created: %OUTPUT%
  exit /b 1
)
for %%A in ("%OUTPUT%") do echo SHIPPING APK: %%~fA ^(%%~zA bytes^)
exit /b 0
