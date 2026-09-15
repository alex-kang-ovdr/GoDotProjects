@echo off
setlocal
cd /d "%~dp0"
if not defined GODOT_BIN set "GODOT_BIN=D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe"
if not exist "%GODOT_BIN%" (
    echo [FAIL] Godot console executable not found: "%GODOT_BIN%"
    echo Set GODOT_BIN to Godot 4.7+ console executable.
    exit /b 2
)
if not exist Build\PC mkdir Build\PC
"%GODOT_BIN%" --headless --path Godot --export-release "Windows Desktop" "..\Build\PC\CaptainSalvage.exe"
exit /b %errorlevel%
