@echo off
title College Knowledge AI - All-in-One Server
echo ========================================================
echo   Starting College Knowledge AI (Single Unified Port)
echo ========================================================

REM 1. Ensure Ollama is running
echo [1/3] Checking Ollama service...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Ollama is already active.
) else (
    echo Starting Ollama background server...
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    timeout /t 3 /nobreak >nul
)

REM 2. Launch FastAPI Server (Serves Frontend UI + Backend API on Port 8000)
echo [2/3] Launching Unified Application on http://localhost:8000 ...
start http://localhost:8000

"%~dp0backend\venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
pause
