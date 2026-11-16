@echo off
if not exist "%~dp0WebPlatform\PlayHub_Portable\source\reports\local-open-lan-0.url" (
  echo Run Run_PlayHub_Preview.cmd first to detect the LAN address.
  pause
  exit /b 1
)
start "" "%~dp0WebPlatform\PlayHub_Portable\source\reports\local-open-lan-0.url"
