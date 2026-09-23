@echo off
setlocal
cd /d "%~dp0"
call "%~dp0Build-PC.bat"
if errorlevel 1 goto captain_failed
if not exist "%CAPTAIN_PC_EXE%" (
    echo [FAIL] Built executable is missing: "%CAPTAIN_PC_EXE%"
    exit /b 4
)
start "Captain Salvage" "%CAPTAIN_PC_EXE%" %*
exit /b %errorlevel%

:captain_failed
set "CAPTAIN_RC=%ERRORLEVEL%"
echo [FAIL] PC build failed. Exit code: %CAPTAIN_RC%
if not defined CI pause
exit /b %CAPTAIN_RC%
