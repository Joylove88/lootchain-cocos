@echo off
setlocal
REM LootChain spine skeleton batch upgrade 3.8 -> 4.2 (run on the PC with Spine editor installed)
REM Upgrades assets/resources/spine/{hero,gacha,ui} in place. File names unchanged; atlas/png untouched.
REM Prerequisite: commit everything to git BEFORE running (git history is the rollback).

set SPINE=C:\Program Files\Spine\Spine.com
if not exist "%SPINE%" set SPINE=C:\Program Files (x86)\Spine\Spine.com
if not exist "%SPINE%" (
  echo [ERROR] Spine.com not found. Edit SPINE path at top of this script.
  pause
  exit /b 1
)

set BASE=%~dp0..\..\assets\resources\spine

echo ===== hero (json) =====
for /r "%BASE%\hero" %%f in (*.json) do (
  echo [json] %%f
  "%SPINE%" -u 4.2.43 -i "%%f" -o "%%~dpf" -e "%~dp0json42.export.json"
)
echo ===== hero (skel) =====
for /r "%BASE%\hero" %%f in (*.skel) do (
  echo [skel] %%f
  "%SPINE%" -u 4.2.43 -i "%%f" -o "%%~dpf" -e "%~dp0skel42.export.json"
)
echo ===== gacha (json) =====
for /r "%BASE%\gacha" %%f in (*.json) do (
  echo [json] %%f
  "%SPINE%" -u 4.2.43 -i "%%f" -o "%%~dpf" -e "%~dp0json42.export.json"
)
echo ===== gacha (skel) =====
for /r "%BASE%\gacha" %%f in (*.skel) do (
  echo [skel] %%f
  "%SPINE%" -u 4.2.43 -i "%%f" -o "%%~dpf" -e "%~dp0skel42.export.json"
)
echo ===== ui (json) =====
for /r "%BASE%\ui" %%f in (*.json) do (
  echo [json] %%f
  "%SPINE%" -u 4.2.43 -i "%%f" -o "%%~dpf" -e "%~dp0json42.export.json"
)
echo ===== ui (skel) =====
for /r "%BASE%\ui" %%f in (*.skel) do (
  echo [skel] %%f
  "%SPINE%" -u 4.2.43 -i "%%f" -o "%%~dpf" -e "%~dp0skel42.export.json"
)

echo.
echo Done. Verify a few files changed (git status), then commit and push.
pause
