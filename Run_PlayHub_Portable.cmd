@echo off
chcp 65001 >nul
set "PLAYHUB_EXE=%~dp0WebPlatform\PlayHub_Portable\source\.local-build\PlayHub.exe"
if not exist "%PLAYHUB_EXE%" (
  echo Local portable build is missing. Use Run_PlayHub_Preview.cmd or build the portable executable.
  pause
  exit /b 1
)
"%PLAYHUB_EXE%" --rebex "%~dp0WebPlatform\PlayHub_Portable\RebexTinyWebServer.exe"
if errorlevel 1 pause
