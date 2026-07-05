@echo off
setlocal
set "PYTHON=C:\Users\AbdulWasayKhan\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON%" (
  echo Python runtime was not found.
  echo Open this project in Codex once to restore the bundled runtime.
  pause
  exit /b 1
)
start "" http://127.0.0.1:8787
"%PYTHON%" "%~dp0server.py"
endlocal
