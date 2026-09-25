@echo off
setlocal
set "GAME_EXE=%~dp0Build\NightsInTheWild.exe"
if not exist "%GAME_EXE%" (
  echo Game executable not found: "%GAME_EXE%"
  echo Export the Windows Desktop build first.
  exit /b 2
)
start "Voxel Frontier" "%GAME_EXE%" %*
