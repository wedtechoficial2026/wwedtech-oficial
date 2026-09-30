@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================================
echo      WedTech - iniciando tudo de uma vez
echo ========================================================
echo.
echo   Painel, login e area do consultor: http://localhost:8000/
echo   Vitrine Mercado Livre:             http://localhost:8011/
echo   Vitrine Amazon:                    http://localhost:8012/
echo   Vitrine Shopee:                    http://localhost:8013/
echo.
echo   Contas de exemplo:
echo     vendedor (lojista):  admin@wedtech.com  /  admin123
echo     adm (consultor):     adm@wedtech.com    /  adm123
echo.

rem Cada servidor roda na propria janela (minimizada); o titulo permite encerrar todos juntos
start "WedTech - Painel (8000)" /min cmd /c ""%~dp0iniciar-servidor.bat""
start "WedTech - Mercado Livre (8011)" /min cmd /c ""%~dp0marketplaces\iniciar-vitrine.bat" mercado-livre 8011"
start "WedTech - Amazon (8012)" /min cmd /c ""%~dp0marketplaces\iniciar-vitrine.bat" amazon 8012"
start "WedTech - Shopee (8013)" /min cmd /c ""%~dp0marketplaces\iniciar-vitrine.bat" shopee 8013"

echo Servidores iniciados. O navegador abre o site em alguns segundos.
echo.
echo Deixe esta janela aberta enquanto usar o sistema.
echo Para ENCERRAR TODOS os servidores, pressione qualquer tecla aqui.
pause > nul

for %%T in ("WedTech - Painel*" "WedTech - Mercado Livre*" "WedTech - Amazon*" "WedTech - Shopee*") do (
    taskkill /FI "WINDOWTITLE eq %%~T" /T /F > nul 2>&1
)
echo Servidores encerrados.
timeout /t 2 > nul
