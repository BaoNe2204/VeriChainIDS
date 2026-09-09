@echo off
chcp 65001 >nul
title VeriChainIDS - Victim Target Service
cd /d "%~dp0"
echo ==========================================================
echo        VERICHAIN IDS - VICTIM SERVICE (CHO VPS 2)
echo ==========================================================
echo.
echo [1] Dang khoi dong Web Server muc tieu tren cong 8080 va 2222...
echo [2] LUU Y: Tren VPS 2 nay, ban can chay them VeriChainIDS Agent!
echo     Lenh chay Agent:
echo     python agent.py -k <API_KEY_LAY_TU_VPS_1> -u http://<IP_VPS_1>:5000
echo.
echo ==========================================================
python target_service.py
pause
