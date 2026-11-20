@echo off
setlocal
set "launchNode=%GAMERQA_NODE_BIN%"
if defined launchNode goto launch
set "launchNode=%PLAYHUB_NODE_BIN%"
if defined launchNode goto launch
set "launchNode=%~dp0..\..\..\artifacts\local-runtime\node24\node.exe"
if exist "%launchNode%" goto launch
set "launchNode=%~dp0..\runtime\node-v24.22.3-win-x64\node.exe"
if exist "%launchNode%" goto launch
where /q node.exe
if errorlevel 1 goto missingNode
set "launchNode=node.exe"

:launch
if "%~1"=="" (
  "%launchNode%" "%~dp0bin\gamerqa.mjs" --help
) else if /i "%~1"=="--check" (
  "%launchNode%" "%~dp0bin\gamerqa.mjs" verify %*
) else (
  "%launchNode%" "%~dp0bin\gamerqa.mjs" %*
)
set "launchStatus=%errorlevel%"
goto finish

:missingNode
echo Node.js 24 or newer is required. Put Node on PATH or set PLAYHUB_NODE_BIN / GAMERQA_NODE_BIN to node.exe.
set "launchStatus=1"

:finish
if not "%launchStatus%"=="0" if "%~1"=="" if not "%PLAYHUB_NO_PAUSE%"=="1" pause
exit /b %launchStatus%
