@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================================
echo      Vitrines de demonstracao WedTech
echo ========================================================
echo.
echo Mercado Livre: http://localhost:8011/
echo Amazon:        http://localhost:8012/
echo Shopee:        http://localhost:8013/
echo.
echo Abrindo tres servidores independentes. Feche cada janela do PHP
ECHO ou pressione Ctrl+C nela para encerrar a respectiva vitrine.
echo.

start "WedTech - Mercado Livre (8011)" "%~dp0iniciar-vitrine.bat" mercado-livre 8011
start "WedTech - Amazon (8012)" "%~dp0iniciar-vitrine.bat" amazon 8012
start "WedTech - Shopee (8013)" "%~dp0iniciar-vitrine.bat" shopee 8013

start "" "http://localhost:8011/"
start "" "http://localhost:8012/"
start "" "http://localhost:8013/"
echo Vitrines abertas no navegador.
echo Deixe abertas as tres janelas do PHP durante a apresentacao.
pause
