@echo off
setlocal
cd /d "%~dp0"
set HOST=0.0.0.0
echo Starting shared workspace for users on this local network.
echo Trusted participants only: GDScript executes with this Windows user's permissions.
echo Share the LAN collaboration address printed below.
call START_GAMEPLAYFORGE.cmd
