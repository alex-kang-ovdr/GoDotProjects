@echo off
setlocal
python "%~dp0tools\run_ball_sim_verification.py" %*
exit /b %ERRORLEVEL%
