@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo.
echo ========================================
echo   המערכת - הפעלת השרת והממשק
echo ========================================
echo.
echo ממשק: http://localhost:3000/
echo שרת API: פורט 3002
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo שגיאה: npm לא נמצא. התקן Node.js או הוסף ל-PATH.
    pause
    exit /b 1
)

echo מפעיל שרת (פורט 3002) בחלון נפרד...
start "Server-3002" cmd /k "cd /d ""%~dp0server"" && npm run dev"
timeout /t 3 /nobreak >nul
echo מפעיל ממשק (פורט 3000)...
start "Client-3000" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo שני חלונות נפתחו: שרת וממשק.
echo סגור את החלונות כדי לעצור.
echo.
pause
