@echo off
setlocal
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required. No package was created.
  exit /b 1
)
if "%~1"=="" (
  echo Usage: Build_Source_Zip.bat VERSION
  echo Creates source-only ZIP. Does not build engines or publish.
  exit /b 1
)
python "%~dp0package_source.py" --version "%~1" --output "%~dp0..\..\dist\PlayHub-Platform-Source-%~1.zip"
exit /b %errorlevel%
