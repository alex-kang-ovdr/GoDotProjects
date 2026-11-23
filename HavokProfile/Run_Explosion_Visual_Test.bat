@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "PROJ_DIR=%SCRIPT_DIR%godot"
set "PROJ_FILE=%PROJ_DIR%\project.godot"

set "GODOT_CUSTOM=d:\Github\GoDotProjects\godot-engine\bin\godot.windows.template_release.x86_64.console.exe"
set "GODOT_STOCK=D:\Github\GoDot-Engine\Godot_v4.7.2-stable_win64_console.exe"

if exist "%GODOT_CUSTOM%" (
    set "GODOT_EXE=%GODOT_CUSTOM%"
) else if exist "%GODOT_STOCK%" (
    set "GODOT_EXE=%GODOT_STOCK%"
) else (
    echo [ERROR] Godot executable not found:
    echo   - Custom fork: %GODOT_CUSTOM%
    echo   - Stock build: %GODOT_STOCK%
    pause
    exit /b 1
)

echo ====================================================================
echo   PlayForge Large-Scale Explosion Visual Render Test
echo ====================================================================
echo   Engine: %GODOT_EXE%
echo.
echo   [1] Select Physics Engine:
echo     1 - Jolt Physics (Stage 3: AVX2 + Lock-Free + 4B GSK) [default]
echo     2 - Havok Physics 2025.1.1 (GDExtension)
set "ENG_CHOICE=1"
set /p "ENG_CHOICE=Choice [1/2, Enter=1]: "
if "%ENG_CHOICE%"=="2" (
    set "PHYS_ENGINE=HavokPhysics"
) else (
    set "PHYS_ENGINE=Jolt Physics"
)

echo.
echo   [2] Select Block Scale:
echo     1 - 21,319 blocks (size=144, Large Explosion) [default]
echo     2 -  9,428 blocks (size=96)
echo     3 -  2,410 blocks (size=48)
set "SZ_CHOICE=1"
set /p "SZ_CHOICE=Choice [1/2/3, Enter=1]: "
if "%SZ_CHOICE%"=="2" (
    set "TEST_SIZE=96"
) else if "%SZ_CHOICE%"=="3" (
    set "TEST_SIZE=48"
) else (
    set "TEST_SIZE=144"
)

echo.
echo   [3] Select Collision Shape:
echo     1 - Box (default voxel) [default]
echo     2 - 32-vertex ConvexHull
set "SH_CHOICE=1"
set /p "SH_CHOICE=Choice [1/2, Enter=1]: "
if "%SH_CHOICE%"=="2" (
    set "TEST_SHAPE=convex"
) else (
    set "TEST_SHAPE=box"
)

echo.
echo [LAUNCH] engine=%PHYS_ENGINE%  size=%TEST_SIZE%  shape=%TEST_SHAPE%  ticks=420
echo          Close the Godot window to exit and restore project.godot.
echo.

copy /y "%PROJ_FILE%" "%PROJ_FILE%.bak" >nul
powershell -NoProfile -Command "$t = Get-Content -Raw -Path '%PROJ_FILE%'; $t = $t -replace 'physics_engine=\"[^\"]+\"', 'physics_engine=\"%PHYS_ENGINE%\"'; Set-Content -Path '%PROJ_FILE%' -Value $t -NoNewline"

set "OUT_DIR=%TEMP%\playforge_explosion_manual"
"%GODOT_EXE%" --path "%PROJ_DIR%" -- --sizes=%TEST_SIZE% --repeats=1 --ticks=420 --seed=1337 --tag=manual-visual --out="%OUT_DIR%" --batch-sync --shape=%TEST_SHAPE% --jolt-gsk-mode=2 --no-quit

if exist "%PROJ_FILE%.bak" move /y "%PROJ_FILE%.bak" "%PROJ_FILE%" >nul
echo.
echo Visual test finished.
pause
