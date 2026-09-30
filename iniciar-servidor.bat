@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================================
echo        Iniciando Servidor PHP - WedTech Dashboard
echo ========================================================
echo.

set "PORT=8000"
set "PHP_PATH="

rem 1) PHP instalado via winget (pasta do usuario atual)
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.*") do (
    if exist "%%~D\php.exe" set "PHP_PATH=%%~D\php.exe"
)

rem 2) PHP no PATH
if not defined PHP_PATH (
    for /f "delims=" %%P in ('where php 2^>nul') do (
        if not defined PHP_PATH set "PHP_PATH=%%P"
    )
)

rem 3) Locais comuns (XAMPP / C:\php)
if not defined PHP_PATH if exist "C:\xampp\php\php.exe" set "PHP_PATH=C:\xampp\php\php.exe"
if not defined PHP_PATH if exist "C:\php\php.exe" set "PHP_PATH=C:\php\php.exe"

if not defined PHP_PATH (
    echo [ERRO] PHP nao encontrado.
    echo Instale com:  winget install --id PHP.PHP.8.3 -e
    echo.
    pause
    exit /b 1
)

for %%F in ("%PHP_PATH%") do set "PHP_DIR=%%~dpF"
set "EXT_DIR=%PHP_DIR%ext"

rem Carrega as extensoes necessarias (SQLite / mbstring) mesmo sem php.ini
set "PHP_ARGS=-d extension_dir="%EXT_DIR%""
for %%E in (pdo_sqlite sqlite3 mbstring openssl fileinfo) do (
    "%PHP_PATH%" -m 2>nul | findstr /i /x "%%E" > nul
    if errorlevel 1 if exist "%EXT_DIR%\php_%%E.dll" set "PHP_ARGS=!PHP_ARGS! -d extension=%%E"
)

echo PHP: %PHP_PATH%
echo Servidor rodando em: http://localhost:%PORT%
echo Pressione Ctrl+C para encerrar o servidor.
echo.

start "" "http://localhost:%PORT%"
"%PHP_PATH%" %PHP_ARGS% -S localhost:%PORT%

pause
