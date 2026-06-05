@echo off
title oddeNova — Presentation
cd /d "%~dp0..\.."

:: Read nvm paths from system environment
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('NVM_HOME','Machine')"`) do set NVM_HOME=%%i
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('NVM_SYMLINK','Machine')"`) do set NVM_SYMLINK=%%i
if not "%NVM_HOME%"=="" set PATH=%NVM_HOME%;%PATH%
if not "%NVM_SYMLINK%"=="" set PATH=%NVM_SYMLINK%;%PATH%

:: Check if dev server is already running on port 5173
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    echo Dev server already running.
    goto open
)

echo Starting dev server...
start "oddeNova Dev Server" /min cmd /k "npm run dev"
timeout /t 5 /nobreak >nul

:open
echo Opening presentation...

set URL=http://localhost:5173/presentation.html
set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
set CHROME86=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
set EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe

if exist "%CHROME%" (
    start "" "%CHROME%" --app=%URL%
) else if exist "%CHROME86%" (
    start "" "%CHROME86%" --app=%URL%
) else if exist "%EDGE%" (
    start "" "%EDGE%" --app=%URL%
) else (
    start "" "%URL%"
    goto done
)

:: Resize window in background after browser opens
start /b "" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0presentation-resize.ps1"

:done
exit
