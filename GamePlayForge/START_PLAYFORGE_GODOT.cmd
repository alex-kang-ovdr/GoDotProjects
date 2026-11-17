@echo off
setlocal
cd /d "%~dp0"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
node Tools\run-godot.cjs
if errorlevel 1 pause
