@echo off
chcp 65001 >nul
title VeriChainIDS - Attack Simulation Console
cd /d "%~dp0"
echo ==========================================================
echo        VERICHAIN IDS - ATTACK TOOLKIT (CHO MÁY PC)
echo ==========================================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] May tinh chua cai dat Python hoac chua them vao PATH!
    echo Vui long cai dat Python de chay cong cu nay.
    pause
    exit /b
)

python attack_tool.py
pause
