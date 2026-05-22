@echo off
chcp 65001 >nul 2>&1
echo.
echo ============================================================
echo   VeriChainIDS Agent - Setup/Remove Script
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "EXE_NAME=VeriChainIDSAgent.exe"
set "TASK_NAME=VeriChainIDSAgent"

echo Options:
echo   [1] Install to Windows Startup (Task Scheduler)
echo   [2] Remove from Startup
echo   [3] Remove config and exit
echo   [4] Exit
echo.
set /p choice="Select option (1-4): "

if "%choice%"=="1" goto install
if "%choice%"=="2" goto uninstall
if "%choice%"=="3" goto remove_config
if "%choice%"=="4" goto end

:install
echo.
echo [INFO] Installing VeriChainIDS Agent to startup...
echo.

REM Check if exe exists
if not exist "%SCRIPT_DIR%%EXE_NAME%" (
    echo [ERROR] %EXE_NAME% not found in current folder!
    pause
    exit /b 1
)

REM Remove existing task if any
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

REM Create new scheduled task with highest privileges
schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_DIR%%EXE_NAME%\"" /sc onlogon /rl highest /f
if errorlevel 1 (
    echo [ERROR] Failed to create scheduled task
    echo [TIP] Try running this script as Administrator
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Agent installed to startup!
echo.
echo The agent will now start automatically when you log in.
echo It runs in the background (system tray).
echo.
pause
goto end

:uninstall
echo.
echo [INFO] Removing from startup...
schtasks /delete /tn "%TASK_NAME%" /f
if errorlevel 1 (
    echo [INFO] Task may not exist or already removed
)
echo.
echo [SUCCESS] Agent removed from startup.
echo The agent is still installed but won't auto-start.
echo.
pause
goto end

:remove_config
echo.
echo [INFO] Removing configuration...
if exist "%APPDATA%\VeriChainIDS" (
    rmdir /s /q "%APPDATA%\VeriChainIDS"
    echo [SUCCESS] Configuration removed
) else (
    echo [INFO] No configuration found
)
echo.
echo [INFO] Removing startup task...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
echo.
echo [DONE] Cleanup complete.
echo.
pause
goto end

:end
