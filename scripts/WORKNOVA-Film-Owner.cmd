@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0.."
if errorlevel 1 goto FAILED

echo ==============================================
echo WORKNOVA PRIVATE OWNER FILMING - NO UPLOAD

echo ==============================================
echo Everything stays on this computer, under output\videos\.
echo Use fictional demo data only. Never enter API keys or real customer data.
echo.
if not exist ".video-venv\Scripts\python.exe" (
    echo ERROR: Existing offline Python video environment is missing.
    echo Nothing was installed or downloaded.
    goto FAILED
)

call npm run worknova:video:capture:check
if errorlevel 1 goto FAILED
call npm run worknova:video:voice:check-cues
if errorlevel 1 goto FAILED
call npm run worknova:video:voice:check-model
if errorlevel 1 goto FAILED

echo.
echo [1/3] PART 1 - click actual WORKNOVA AI Work / Global Services UI.
echo Switch back to this window and press Enter to stop the recording.
call npm run worknova:video:capture:part1
if errorlevel 1 goto FAILED

echo.
echo [2/3] PART 2 - click five real local Agent Skill UI buttons.
echo Delegate, A2A, Gift Finder, Churn Saver, Invoice/Dispute.
echo Switch back here and press Enter to save the recording.
call npm run worknova:video:capture:part2
if errorlevel 1 goto FAILED

echo.
echo [3/3] Generating FIVE new owner-local Kokoro af_heart voice cues.
call npm run worknova:video:voice:part2
if errorlevel 1 goto FAILED

echo.
echo WORKNOVA PRIVATE SOURCE CAPTURE READY - RELEASE HOLD.
echo Newly generated WebM, WAV and JSON files: output\videos\
echo DO NOT upload to YouTube or Devpost until separate review and approval.
pause
exit /b 0
:FAILED
echo.
echo WORKNOVA WORKFLOW STOPPED. No publication or payment happened.
echo Check command error above; existing videos and model files were not overwritten.
pause
exit /b 2