@echo off
rem One-click uninstaller. Pass -Chrome Edge or -Chrome All to widen the scope.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
if "%EXITCODE%"=="0" (
  echo Uninstall finished.
) else (
  echo Uninstall failed with exit code %EXITCODE%.
)
echo.
pause
exit /b %EXITCODE%
