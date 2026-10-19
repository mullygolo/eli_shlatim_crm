@echo off
cd /d "%~dp0server"
echo Starting server on port 3002...
npm run dev
pause
