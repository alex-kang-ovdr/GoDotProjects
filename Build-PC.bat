@echo off
setlocal
cd /d "%~dp0"
set "CAPTAIN_PC_EXE="
if not defined GODOT_BIN set "GODOT_BIN=D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe"
if not exist "%GODOT_BIN%" (
    echo [FAIL] Godot console executable not found: "%GODOT_BIN%"
    echo Set GODOT_BIN to Godot 4.7+ console executable.
    exit /b 2
)
if not exist Build\PC mkdir Build\PC
copy /y "Godot\data\part_tuning.csv" "Godot\data\part_tuning_runtime.txt" >nul
if errorlevel 1 (
    echo [FAIL] Part tuning CSV runtime copy failed.
    exit /b 3
)
rem Export to a fresh file: Godot cannot embed the PCK into a running EXE.
:captain_choose_candidate
set "CAPTAIN_CANDIDATE=%~dp0Build\PC\CaptainSalvage-build-%RANDOM%-%RANDOM%.exe"
if exist "%CAPTAIN_CANDIDATE%" goto captain_choose_candidate
"%GODOT_BIN%" --headless --path Godot --export-release "Windows Desktop" "%CAPTAIN_CANDIDATE%"
if errorlevel 1 exit /b %errorlevel%
if not exist "%CAPTAIN_CANDIDATE%" (
    echo [FAIL] Export reported success but the executable is missing.
    exit /b 4
)
rem Same-volume rename preserves the old EXE when Windows has it locked.
move /y "%CAPTAIN_CANDIDATE%" "%~dp0Build\PC\CaptainSalvage.exe" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Default EXE is in use or cannot be replaced. Using the new build.
) else (
    set "CAPTAIN_CANDIDATE=%~dp0Build\PC\CaptainSalvage.exe"
)
echo [BUILD] "%CAPTAIN_CANDIDATE%"
endlocal & set "CAPTAIN_PC_EXE=%CAPTAIN_CANDIDATE%" & exit /b 0
