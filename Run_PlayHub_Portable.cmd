@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-platform.ps1" %*
exit /b %ERRORLEVEL%
