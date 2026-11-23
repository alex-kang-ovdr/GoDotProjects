@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

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
    echo [ERROR] Godot 실행 파일을 찾을 수 없습니다.
    echo   - 커스텀 포크: %GODOT_CUSTOM%
    echo   - 공식 바이너리: %GODOT_STOCK%
    pause
    exit /b 1
)

echo ====================================================================
echo   PlayForge 대규모 물리 폭파 렌더링 수동 확인 테스트
echo ====================================================================
echo   엔진: %GODOT_EXE%
echo.
echo   [물리 엔진 선택]
echo     1) Jolt Physics (커스텀 3단계: AVX2 + 락프리 + 4B GSK) [기본]
echo     2) Havok Physics 2025.1.1 (GDExtension)
set "ENG_CHOICE=1"
set /p "ENG_CHOICE=선택 [1/2, Enter=1]: "
if "%ENG_CHOICE%"=="2" (
    set "PHYS_ENGINE=HavokPhysics"
) else (
    set "PHYS_ENGINE=Jolt Physics"
)

echo.
echo   [블록 규모 선택]
echo     1) 21,319 블록 (size=144, 대규모 폭파) [기본]
echo     2)  9,428 블록 (size=96)
echo     3)  2,410 블록 (size=48)
set "SZ_CHOICE=1"
set /p "SZ_CHOICE=선택 [1/2/3, Enter=1]: "
if "%SZ_CHOICE%"=="2" (
    set "TEST_SIZE=96"
) else if "%SZ_CHOICE%"=="3" (
    set "TEST_SIZE=48"
) else (
    set "TEST_SIZE=144"
)

echo.
echo   [충돌 형상 선택]
echo     1) Box (기본 복셀) [기본]
echo     2) 32정점 ConvexHull
set "SH_CHOICE=1"
set /p "SH_CHOICE=선택 [1/2, Enter=1]: "
if "%SH_CHOICE%"=="2" (
    set "TEST_SHAPE=convex"
) else (
    set "TEST_SHAPE=box"
)

echo.
echo [실행] 엔진=%PHYS_ENGINE% / size=%TEST_SIZE% / shape=%TEST_SHAPE% / ticks=420 (창을 닫으면 종료됩니다)
echo.

copy /y "%PROJ_FILE%" "%PROJ_FILE%.bak" >nul
powershell -NoProfile -Command "$t = Get-Content -Raw -Path '%PROJ_FILE%'; $t = $t -replace 'physics_engine=\"[^\"]+\"', 'physics_engine=\"%PHYS_ENGINE%\"'; Set-Content -Path '%PROJ_FILE%' -Value $t -NoNewline"

set "OUT_DIR=%TEMP%\playforge_explosion_manual"
"%GODOT_EXE%" --path "%PROJ_DIR%" -- --sizes=%TEST_SIZE% --repeats=1 --ticks=420 --seed=1337 --tag=manual-visual --out="%OUT_DIR%" --batch-sync --shape=%TEST_SHAPE% --jolt-gsk-mode=2 --no-quit

move /y "%PROJ_FILE%.bak" "%PROJ_FILE%" >nul
echo.
echo 테스트가 종료되었습니다.
pause
