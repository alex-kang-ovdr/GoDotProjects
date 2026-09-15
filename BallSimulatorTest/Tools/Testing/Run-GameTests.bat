@echo off
setlocal

if not defined GAME_TEST_FRAMEWORK_ROOT set "GAME_TEST_FRAMEWORK_ROOT=D:\Github\GoDotProjects-worktrees\game-test-framework"
set "CONFIG=%~dp0ProjectTests.json"

call "%GAME_TEST_FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" %*
exit /b %ERRORLEVEL%
