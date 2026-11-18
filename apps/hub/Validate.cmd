@echo off
setlocal
echo PlayHub Windows/IIS PoC acceptance
echo Run this command from an elevated Administrator Command Prompt.
echo The HTTP and browser checks may request the administrator password twice.
echo Real Google login, a second LAN computer, and a Windows reboot remain manual checks.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Test-PoC.ps1" %*
set "PlayHubValidationExit=%ERRORLEVEL%"
if "%PlayHubValidationExit%"=="0" echo Automated gates passed. Manual acceptance is still pending.
if not "%PlayHubValidationExit%"=="0" echo Validation is incomplete or failed. Read reports\poc-acceptance.json and .html under the installation folder.
endlocal & exit /b %PlayHubValidationExit%
