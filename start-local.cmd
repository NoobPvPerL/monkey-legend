@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0tools\start-local.mjs" %*
) else (
  where node.exe >nul 2>nul
  if errorlevel 1 (
    echo Node.js 24 is required for a source checkout.
    echo Download the Windows game ZIP from GitHub Releases for a standalone copy.
    pause
    exit /b 1
  )
  node.exe "%~dp0tools\start-local.mjs" %*
)
if errorlevel 1 (
  echo Game startup failed. Read the error above.
  pause
  exit /b 1
)
