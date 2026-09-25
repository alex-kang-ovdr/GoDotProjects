@echo off
setlocal
call "%~dp0AutoTestSilent.bat" %*
exit /b %ERRORLEVEL%
