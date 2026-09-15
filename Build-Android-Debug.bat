@echo off
setlocal
cd /d "%~dp0"
if not defined GODOT_BIN set "GODOT_BIN=D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe"
if not exist "%GODOT_BIN%" (
    echo [FAIL] Godot console executable not found: "%GODOT_BIN%"
    exit /b 2
)
if not exist Build\Android mkdir Build\Android
"%GODOT_BIN%" --headless --path Godot --export-debug "Android" "..\Build\Android\CaptainSalvage-debug.apk"
exit /b %errorlevel%
