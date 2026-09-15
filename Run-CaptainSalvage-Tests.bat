@echo off
setlocal

rem Set GAME_TEST_FRAMEWORK_ROOT once, or keep this shared-worktree fallback.
if not defined GAME_TEST_FRAMEWORK_ROOT set "GAME_TEST_FRAMEWORK_ROOT=D:\Github\GoDotProjects-worktrees\game-test-framework"
set "FRAMEWORK_ROOT=%GAME_TEST_FRAMEWORK_ROOT%"
set "CONFIG=%~dp0Tools\Testing\ProjectTests.json"

if not exist "%FRAMEWORK_ROOT%\run-tests.bat" (
    echo [FAIL] Shared test framework was not found: "%FRAMEWORK_ROOT%"
    echo Set GAME_TEST_FRAMEWORK_ROOT or edit this BAT file.
    pause
    exit /b 2
)
if not exist "%CONFIG%" (
    echo [FAIL] Captain Salvage test config was not found: "%CONFIG%"
    pause
    exit /b 2
)

call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" %*
exit /b %ERRORLEVEL%
