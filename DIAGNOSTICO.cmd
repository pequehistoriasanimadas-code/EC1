@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_ENABLE_LOGGING=1
echo Iniciando EC Automatic News en modo diagnostico...
echo.
"EC Automatic News.exe" --enable-logging --v=1
echo.
echo Si la aplicacion se cerro, revisa:
echo   EC Automatic News Data\logs\startup.log
echo.
pause
