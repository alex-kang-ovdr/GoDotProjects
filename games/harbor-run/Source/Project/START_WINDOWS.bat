@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 serve.py
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python not found. Open index.html in a WebGL2 browser instead.
    start "" "%~dp0index.html"
  ) else (
    python serve.py
  )
)
pause
