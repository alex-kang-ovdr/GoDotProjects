@echo off
setlocal
if /i "%~1"=="web" goto web
if /i "%~1"=="native" goto native
if not "%~1"=="" goto usage
echo PlayForge Agent Replay
echo 1. Web editor - choose a template in the browser
echo 2. Installed Godot - Tappy Chicken
echo 3. Installed Godot - Iron Wood
echo 4. Installed Godot - BrawlLabs
echo 5. Installed Godot - empty map and asset store
choice /c 12345 /n /m "Select [1-5]: "
if errorlevel 255 exit /b 1
if errorlevel 5 goto blank
if errorlevel 4 goto brawl
if errorlevel 3 goto iron
if errorlevel 2 goto tappy
if errorlevel 1 goto web
exit /b 1
:blank
set "template=blank3d"
goto engine
:brawl
set "template=brawllabs"
goto engine
:iron
set "template=iron-wood"
goto engine
:tappy
set "template=tappy-chicken"
goto engine
:native
set "template=%~2"
if not defined template set "template=tappy-chicken"
:engine
if /i "%template%"=="blank3d" (
  call "%~dp0tools\Run_Engine.bat" ready blank3d
) else (
  call "%~dp0tools\Run_Engine.bat" showcase "%template%"
)
goto finish
:web
call "%~dp0tools\Run_Forge.bat"
goto finish
:usage
echo Usage: Run_AgentReplay.cmd web ^| native [tappy-chicken^|iron-wood^|brawllabs^|blank3d]
exit /b 1
:finish
set "result=%errorlevel%"
if not "%result%"=="0" if "%~1"=="" pause
exit /b %result%
