@echo off
cd /d "%~dp0"
echo === אלי שלטים CRM ===
echo.
echo מריץ שרת (פורט 3002) ולקוח (פורט 3000)...
echo פתח בדפדפן: http://localhost:3000
echo.
call npm run dev:all
pause
