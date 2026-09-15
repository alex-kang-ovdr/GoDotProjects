@echo off
setlocal
python "%~dp0tools\run_demo_verification.py" %*
exit /b %ERRORLEVEL%
