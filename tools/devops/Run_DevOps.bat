@echo off
setlocal
set "ROOT=%~dp0..\.."
set "NODE_BIN=%PLAYHUB_NODE_BIN%"
if "%NODE_BIN%"=="" if exist "%ROOT%\artifacts\local-runtime\node24\node.exe" set "NODE_BIN=%ROOT%\artifacts\local-runtime\node24\node.exe"
if "%NODE_BIN%"=="" if exist "%ROOT%\..\PlayHub-Platform\artifacts\local-runtime\node24\node.exe" set "NODE_BIN=%ROOT%\..\PlayHub-Platform\artifacts\local-runtime\node24\node.exe"
if "%NODE_BIN%"=="" set "NODE_BIN=node"

if "%~1"=="" goto :help
if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="--check" (
  "%NODE_BIN%" --version
  "%NODE_BIN%" --test "%~dp0tests\devops.test.mjs"
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="briefing" (
  shift
  "%NODE_BIN%" "%~dp0briefing.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="deterministic" (
  shift
  "%NODE_BIN%" "%~dp0run-deterministic-ci.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="nightly" (
  shift
  "%NODE_BIN%" "%~dp0run-local-nightly.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="archive" (
  shift
  "%NODE_BIN%" "%~dp0archive-gdrive.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="prune" (
  shift
  "%NODE_BIN%" "%~dp0prune-daily-builds.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="manual-plan" (
  shift
  "%NODE_BIN%" "%~dp0manual-build-test.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="preview" (
  shift
  "%NODE_BIN%" "%~dp0local-preview.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)
if /I "%~1"=="report-server" (
  shift
  "%NODE_BIN%" "%~dp0serve-report.mjs" %1 %2 %3 %4 %5 %6 %7 %8 %9
  exit /b %ERRORLEVEL%
)

:help
echo PlayHub-DevOps CLI Wrapper
echo Usage:
echo   Run_DevOps.bat --check
echo   Run_DevOps.bat briefing [--manifest PATH^|URL] [--json]
echo   Run_DevOps.bat deterministic [--mode cloud^|local] [--dry-run]
echo   Run_DevOps.bat nightly [--cloud-manifest PATH^|URL] [--fallback-local-deterministic]
echo   Run_DevOps.bat archive --build-dir DIR [--dest GDRIVE_DIR]
echo   Run_DevOps.bat prune [--dry-run]
echo   Run_DevOps.bat manual-plan --ref ^<branch^|sha^> [--build local^|cloudbuild] [--test local-preview^|dev-tag^|dev-promote]
echo   Run_DevOps.bat preview ^<start^|status^|stop^|cleanup^> [options]
echo   Run_DevOps.bat report-server [--port 18350]
exit /b 0
