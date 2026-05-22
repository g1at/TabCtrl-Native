@echo off
rem One-click installer for TabCtrl native messaging host (Chrome + Store id).
rem Double-click this file, or run it from cmd / PowerShell. Pass extra args
rem (e.g. -Chrome Edge, -ExtensionId <id>, -UseManifestKey) to forward them to
rem install.ps1.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
if "%EXITCODE%"=="0" (
  echo Install finished successfully.
) else (
  echo Install failed with exit code %EXITCODE%.
)
echo.
pause
exit /b %EXITCODE%
