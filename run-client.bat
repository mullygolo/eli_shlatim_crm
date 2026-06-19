@echo off
cd /d "%~dp0"
echo Starting client on http://localhost:3000
echo Make sure the server is running (run-server.bat) first.
npm run dev
pause
