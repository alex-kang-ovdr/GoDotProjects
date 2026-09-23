@echo off
chcp 65001 >nul
setlocal

if not defined GODOT_BIN set "GODOT_BIN=D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe"
if not defined GAME_TEST_FRAMEWORK_ROOT set "GAME_TEST_FRAMEWORK_ROOT=D:\Github\GoDotProjects-worktrees\game-test-framework"
set "FRAMEWORK_ROOT=%GAME_TEST_FRAMEWORK_ROOT%"
set "CONFIG=%~dp0Tools\Testing\ProjectTests.json"
set "CAPTAIN_RC=0"

if not exist "%FRAMEWORK_ROOT%\run-tests.bat" (
    echo [FAIL] Shared test framework was not found: "%FRAMEWORK_ROOT%"
    set "CAPTAIN_RC=2"
    goto captain_done
)
if not exist "%CONFIG%" (
    echo [FAIL] Captain Salvage test config was not found: "%CONFIG%"
    set "CAPTAIN_RC=2"
    goto captain_done
)

if /I "%~1"=="7" goto captain_direct_suite7
if /I "%~1"=="8" goto captain_suite8
if /I "%~1"=="9" goto captain_suite9
if /I "%~1"=="E" goto captain_manual
if not "%~1"=="" goto captain_direct
goto captain_menu

:captain_direct_suite7
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite developer-mode %~2 %~3
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done

:captain_direct
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" %*
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done

:captain_menu
echo.
echo Captain Salvage Test Launcher
echo   [1] runtime             AUTO TEST
echo   [2] physics             AUTO TEST
echo   [3] narrative           AUTO TEST
echo   [4] npc-ai              AUTO TEST
echo   [5] grapple             AUTO TEST
echo   [6] target-navigation   AUTO TEST
echo   [7] developer-mode      AUTO TEST
echo   [8] core-gameplay       AUTO TEST
echo   [9] flight-metrics      AUTO TEST
echo   [E] developer-edit      MANUAL RHI + --edit-mode
echo   [Q] quit
choice /n /c 123456789EQ /m "Select: "
if errorlevel 11 goto captain_done
if errorlevel 10 goto captain_manual
if errorlevel 9 goto captain_suite9
if errorlevel 8 goto captain_suite8
if errorlevel 7 goto captain_suite7
if errorlevel 6 goto captain_suite6
if errorlevel 5 goto captain_suite5
if errorlevel 4 goto captain_suite4
if errorlevel 3 goto captain_suite3
if errorlevel 2 goto captain_suite2
goto captain_suite1

:captain_suite7
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite developer-mode
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite8
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite core-gameplay
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite9
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite flight-metrics
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite6
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite target-navigation
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite5
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite grapple
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite4
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite npc-ai
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite3
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite narrative
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite2
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite physics
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_suite1
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --suite runtime
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done

:captain_manual
echo.
echo Manual RHI: [1] d3d12  [2] vulkan  [3] opengl3
choice /n /c 123 /m "RHI: "
if errorlevel 3 goto captain_rhi_opengl3
if errorlevel 2 goto captain_rhi_vulkan
goto captain_rhi_d3d12
:captain_rhi_opengl3
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --manual-rhi --rhi-mode opengl3
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_rhi_vulkan
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --manual-rhi --rhi-mode vulkan
set "CAPTAIN_RC=%ERRORLEVEL%"
goto captain_done
:captain_rhi_d3d12
call "%FRAMEWORK_ROOT%\run-tests.bat" --config "%CONFIG%" --manual-rhi --rhi-mode d3d12
set "CAPTAIN_RC=%ERRORLEVEL%"

:captain_done
endlocal & exit /b %CAPTAIN_RC%
