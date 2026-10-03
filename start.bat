@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   Billiards hub - local server
echo   ------------------------------------
echo   Serve the 3D version fully offline via a local server
echo.

set PORT=8123

where node >nul 2>nul
if %errorlevel%==0 (
    echo   Starting http://localhost:%PORT%/
    echo   After the browser opens, press Ctrl+C to stop
    echo.
    start "" "http://localhost:%PORT%/index.html"
    npx --yes serve -l %PORT% .
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo   Starting http://localhost:%PORT%/
    echo   After the browser opens, press Ctrl+C to stop
    echo.
    start "" "http://localhost:%PORT%/index.html"
    python -m http.server %PORT%
    goto :eof
)

echo   [Error] Node.js or Python not found, cannot start a local server.
echo   Install one of them and retry, or double-click the html file directly (needs internet for three.js).
echo.
pause
