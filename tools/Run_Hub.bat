@echo off
setlocal
set "launchNode=%PLAYHUB_NODE_BIN%"
if defined launchNode goto launch
set "launchNode=%~dp0..\artifacts\local-runtime\node24\node.exe"
if exist "%launchNode%" goto launch
where /q node.exe
if errorlevel 1 goto missingNode
set "launchNode=node.exe"

:launch
"%launchNode%" "%~dp0launch.cjs" hub %*
set "launchStatus=%errorlevel%"
goto finish

:missingNode
echo Node.js is required. Put Node on PATH or set PLAYHUB_NODE_BIN to node.exe.
set "launchStatus=1"

:finish
if not "%launchStatus%"=="0" if "%~1"=="" if not "%PLAYHUB_NO_PAUSE%"=="1" pause
exit /b %launchStatus%
