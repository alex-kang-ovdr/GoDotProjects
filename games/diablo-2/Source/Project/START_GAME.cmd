@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0index.html" (
    echo index.html was not found.
    echo Extract all files from dark_descent_offline_web.zip into one folder.
    pause
    exit /b 1
)
start "Dark Descent XXVIII - Offline Edition 28.1" "%~dp0index.html"
endlocal
