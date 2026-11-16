@echo off
if not exist "%~dp0WebPlatform\PlayHub_Portable\source\reports\local-open-public.url" (
  echo Run Run_PlayHub_Preview.cmd first to detect the public address.
  pause
  exit /b 1
)
start "" "%~dp0WebPlatform\PlayHub_Portable\source\reports\local-open-public.url"
