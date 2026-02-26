@echo off
chcp 65001 >nul 2>&1
setlocal

echo.
echo  CCG Workflow - Local Install
echo ================================
echo.

:: 1. Build
echo [1/3] Building...
cd /d "%~dp0"
call npx unbuild 2>nul
if %errorlevel% neq 0 (
    echo BUILD FAILED
    goto :end
)
echo OK
echo.

:: 2. Pack
echo [2/3] Packing...
for /f "delims=" %%i in ('npm pack 2^>nul') do set "PACKAGE_FILE=%%i"
if not exist "%PACKAGE_FILE%" (
    echo PACK FAILED
    goto :end
)
echo OK: %PACKAGE_FILE%
echo.

:: 3. Install
echo [3/3] Installing...
call npx "%PACKAGE_FILE%" init --force --skip-mcp --skip-prompt
if %errorlevel% neq 0 (
    echo INSTALL FAILED
    goto :end
)

echo.
echo ================================
echo  Done!
echo ================================

:end
endlocal
