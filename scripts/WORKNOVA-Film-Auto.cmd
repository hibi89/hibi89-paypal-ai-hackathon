@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0.."
if errorlevel 1 goto FAILED
echo WORKNOVA TWO-PART AUTO CAPTURE - OFFLINE / PRIVATE ONLY
echo No manual browser clicks are required.
echo Only fictional local demo data; no provider call, payment, upload or model download.
if not exist ".video-venv\Scripts\python.exe" goto FAILED
call npm run worknova:video:capture:auto:check
if errorlevel 1 goto FAILED
call npm run worknova:video:capture:auto
if errorlevel 1 goto FAILED
echo.
echo WORKNOVA PRIVATE AUTOMATED CAPTURE READY
echo Results are in output\videos\ . No publication was performed.
pause
exit /b 0
:FAILED
echo WORKNOVA AUTO CAPTURE STOPPED - existing video/source not overwritten.
pause
exit /b 2
