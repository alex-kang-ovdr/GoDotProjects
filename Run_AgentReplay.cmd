@echo off
setlocal
if /i "%~1"=="web" goto web
if /i "%~1"=="native" goto native
if /i "%~1"=="ai-hub" goto assistant_hub
if /i "%~1"=="agent" goto agent
if not "%~1"=="" goto usage
echo PlayForge Agent Replay
echo 1. Web editor + AI Assistant Hub + standalone AI Agent
echo 2. Installed Godot - Tappy Chicken
echo 3. Installed Godot - Iron Wood
echo 4. Installed Godot - BrawlLabs
echo 5. Installed Godot - empty map and asset store
echo 6. Compare - Godot AI and PlayForge
echo 7. Compare - GDMCP and PlayForge
echo 8. AI Assistant Hub - local Ollama
echo 9. PlayForge AI Agent - standalone chat
choice /c 123456789 /n /m "Select [1-9]: "
if errorlevel 255 exit /b 1
if errorlevel 9 goto agent
if errorlevel 8 goto assistant_hub
if errorlevel 7 goto gdmcp
if errorlevel 6 goto godotai
if errorlevel 5 goto blank
if errorlevel 4 goto brawl
if errorlevel 3 goto iron
if errorlevel 2 goto tappy
if errorlevel 1 goto web
exit /b 1
:assistant_hub
call "%~dp0tools\Run_Engine.bat" compare assistant-hub
goto finish
:gdmcp
call "%~dp0tools\Run_Engine.bat" compare gdmcp
goto finish
:godotai
call "%~dp0tools\Run_Engine.bat" compare godot-ai
goto finish
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
:agent
call "%~dp0tools\Run_Forge.bat" agent
goto finish
:usage
echo Usage: Run_AgentReplay.cmd web ^| native [tappy-chicken^|iron-wood^|brawllabs^|blank3d] ^| ai-hub ^| agent
exit /b 1
:finish
set "result=%errorlevel%"
if not "%result%"=="0" if "%~1"=="" pause
exit /b %result%
