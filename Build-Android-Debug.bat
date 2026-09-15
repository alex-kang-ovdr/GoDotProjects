@echo off
setlocal
cd /d "%~dp0"
call "%~dp0Build-Android-Web.bat"
if errorlevel 1 exit /b %errorlevel%

if defined JAVA_HOME if not exist "%JAVA_HOME%\bin\java.exe" set "JAVA_HOME="
if exist "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot\bin\java.exe" set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
if not defined JAVA_HOME if exist "D:\SDK\jdk-17.0.15.6-hotspot\bin\java.exe" set "JAVA_HOME=D:\SDK\jdk-17.0.15.6-hotspot"
if not defined JAVA_HOME if exist "C:\Program Files\Android\Android Studio\jbr\release" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if defined ANDROID_HOME if not exist "%ANDROID_HOME%\platforms" set "ANDROID_HOME="
if not defined ANDROID_HOME if exist "D:\SDK\AndroidSDK\platforms" set "ANDROID_HOME=D:\SDK\AndroidSDK"
if defined ANDROID_SDK_ROOT if not exist "%ANDROID_SDK_ROOT%\platforms" set "ANDROID_SDK_ROOT="
if not defined ANDROID_SDK_ROOT if defined ANDROID_HOME set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
"%JAVA_HOME%\bin\java.exe" -version

pushd Platforms\Android
if not exist node_modules call npm install
if errorlevel 1 goto :fail
if not exist android call npx cap add android
if errorlevel 1 goto :fail
call npx cap sync android
if errorlevel 1 goto :fail
call android\gradlew.bat -p android assembleDebug
if errorlevel 1 goto :fail
copy /y android\app\build\outputs\apk\debug\app-debug.apk ..\..\Build\Android\CaptainSalvage-debug.apk >nul
if errorlevel 1 goto :fail
popd
echo [BUILD PASS] Android debug APK: Build\Android\CaptainSalvage-debug.apk
exit /b 0

:fail
set "build_error=%errorlevel%"
popd
exit /b %build_error%
