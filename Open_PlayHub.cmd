@echo off
if not exist "%~dp0WebPlatform\PlayHub_Portable\source\reports\local-connect.html" (
  echo Run Run_PlayHub_Preview.cmd first to create the connection links.
  pause
  exit /b 1
)
start "" "%~dp0WebPlatform\PlayHub_Portable\source\reports\local-connect.html"
