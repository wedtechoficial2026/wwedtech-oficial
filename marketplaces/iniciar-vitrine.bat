@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul
cd /d "%~dp0.."

set "PLATFORM=%~1"
set "PORT=%~2"
set "PHP_PATH="

if not "%PLATFORM%"=="mercado-livre" if not "%PLATFORM%"=="amazon" if not "%PLATFORM%"=="shopee" (
    echo [ERRO] Vitrine invalida.
    exit /b 1
)
if "%PORT%"=="" set "PORT=8011"

for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.*") do (
    if exist "%%~D\php.exe" set "PHP_PATH=%%~D\php.exe"
)
if not defined PHP_PATH (
    for /f "delims=" %%P in ('where php 2^>nul') do (
        if not defined PHP_PATH set "PHP_PATH=%%P"
    )
)
if not defined PHP_PATH if exist "C:\xampp\php\php.exe" set "PHP_PATH=C:\xampp\php\php.exe"
if not defined PHP_PATH if exist "C:\php\php.exe" set "PHP_PATH=C:\php\php.exe"

if not defined PHP_PATH (
    echo [ERRO] PHP nao encontrado. Instale com: winget install --id PHP.PHP.8.3 -e
    pause
    exit /b 1
)

for %%F in ("%PHP_PATH%") do set "PHP_DIR=%%~dpF"
set "EXT_DIR=%PHP_DIR%ext"
set "PHP_ARGS=-d extension_dir=""%EXT_DIR%"""
for %%E in (pdo_sqlite sqlite3 mbstring openssl fileinfo) do (
    "%PHP_PATH%" -m 2^>nul | findstr /i /x "%%E" > nul
    if errorlevel 1 if exist "%EXT_DIR%\php_%%E.dll" set "PHP_ARGS=!PHP_ARGS! -d extension=%%E"
)

set "DOCROOT=%CD%\marketplaces\%PLATFORM%"
echo Vitrine: %PLATFORM%
echo Endereco: http://localhost:%PORT%/
echo Para encerrar, pressione Ctrl+C.
echo.
"%PHP_PATH%" %PHP_ARGS% -S localhost:%PORT% -t "%DOCROOT%" "%CD%\marketplaces\router.php"
