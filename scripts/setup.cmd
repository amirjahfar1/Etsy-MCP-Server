@echo off
rem Windows launcher (double-click or run in cmd/PowerShell): the real logic is scripts\setup.mjs (needs only Node >= 18).
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS from https://nodejs.org , then run this again.
  pause
  exit /b 1
)
node scripts\setup.mjs %*
if errorlevel 1 pause
