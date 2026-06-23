@echo off
echo ===================================================
echo   ALPHATECH AI BUG TRIAGE PLATFORM RUNNER
echo ===================================================
echo.

echo [1/3] Starting Python AI Classifier service on port 8000...
start "Python AI Classifier" cmd /k "cd bug-classifier-ai && python -m uvicorn api.app:app --host 127.0.0.1 --port 8000"

echo [2/3] Starting Node.js Backend service on port 5000...
start "Node.js Backend" cmd /k "cd bug-triage-backend\bug-triage-backend && npm run dev"

echo [3/3] Starting React Frontend on port 3000...
start "Vite React Dashboard" cmd /k "cd ai-bug-triage-dashboard && npm run dev"

echo.
echo ===================================================
echo   All services launched!
echo   - AI microservice: http://127.0.0.1:8000
echo   - Backend gateway: http://localhost:5000
echo   - Frontend dashboard: http://localhost:3000
echo ===================================================
pause
