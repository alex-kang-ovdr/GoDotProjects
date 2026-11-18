@echo off
setlocal
set "launchNode=%PLAYHUB_NODE_BIN%"
if defined launchNode goto launch
set "launchNode=%~dp0..\artifacts\local-runtime\node24\node.exe"
if exist "%launchNode%" goto launch
set "launchNode=node.exe"
:launch
"%launchNode%" "%~dp0local-games\server.cjs"
if errorlevel 1 pause
