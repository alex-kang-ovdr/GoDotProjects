@echo off
setlocal

if not defined GAME_TEST_FRAMEWORK_ROOT set "GAME_TEST_FRAMEWORK_ROOT=D:\Github\GoDotProjects-worktrees\game-test-framework"
set "FRAMEWORK_ROOT=%GAME_TEST_FRAMEWORK_ROOT%"
set "CONFIG=%~dp0ProjectTests.json"

if not exist "%FRAMEWORK_ROOT%\run-tests.bat" (
    echo [FAIL] Shared test framework was not found: "%FRAMEWORK_ROOT%"
    if not defined CI pause
    exit /b 2
)
if not exist "%CONFIG%" (
    echo [FAIL] Project test configuration was not found: "%CONFIG%"
    if not defined CI pause
    exit /b 2
)

call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" %*
exit /b %ERRORLEVEL%
