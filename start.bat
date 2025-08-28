@echo off
title Tuya Widget Launcher
color 0B

echo.
echo ========================================
echo        Tuya Widget Launcher
echo ========================================
echo.
echo Запуск приложения в режиме разработки...
echo.
echo Горячие клавиши:
echo - Alt+W: Показать/Скрыть окно
echo - Alt+Q: Выход из приложения
echo.
echo Приложение будет оставаться в taskbar при закрытии окна
echo.

cd /d "%~dp0"

REM Запускаем приложение в фоне и скрываем консоль
start /min cmd /c "npm start & exit"

REM Ждем немного и закрываем консоль
timeout /t 3 /nobreak >nul
exit
