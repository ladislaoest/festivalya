@echo off
echo ========================================
echo   Iniciando Proyecto Mapa
echo ========================================
echo.
echo Abriendo el navegador en http://localhost:3001...
start http://localhost:3001
echo.
echo Ejecutando el servidor...
npm start
if %ERRORLEVEL% neq 0 (
    echo.
    echo Error al iniciar el proyecto. Asegurate de tener Node.js instalado.
    pause
)
