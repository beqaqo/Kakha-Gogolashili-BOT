@echo off
SETLOCAL
SET "PYTHONPATH=%CD%"

echo [1/2] Launching Backend (FastAPI)...
start "Kakha Bot Backend" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Launching Frontend (Vite)...
cd Frontend
start "Kakha Bot Frontend" cmd /k "npm run dev"

echo.
echo ======================================================
echo   Kakha Gogolashvili Bot is initializing...
echo.
echo   - Backend: http://127.0.0.1:8000
echo   - Frontend: http://localhost:5173
echo.
echo   Close the newly opened windows to stop the services.
echo ======================================================
pause
