@echo off
call "%~1" -no_logo -arch=x64
if errorlevel 1 exit /b %errorlevel%

cl.exe /nologo /std:c++20 /W4 /WX /EHsc /I"%~2" "%~3" "%~4" /Fe"%~5"
