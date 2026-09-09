@echo off
chcp 65001 >nul
title VeriChainIDS - VPS Launcher
echo ========================================================
echo       VeriChainIDS - VPS LAUNCHER (Auto Detect IP)
echo ========================================================
echo.
echo Đang lấy IP Public của VPS...
for /f "delims=" %%i in ('powershell -command "(Invoke-RestMethod api.ipify.org)"') do set VPS_IP=%%i
if "%VPS_IP%"=="" (
    echo Không thể lấy IP Public! Đang dùng localhost...
    set VPS_IP=127.0.0.1
) else (
    echo IP Public của VPS: %VPS_IP%
)
echo.

echo ========================================================
echo [1/4] Khởi động Blockchain Submitter (Port 8090)
start "Blockchain Submitter" cmd /c "cd Blockchain && title Blockchain Submitter && echo Chay Blockchain... && py -3.11 -m venv .venv && .venv\Scripts\python.exe -m uvicorn submitter:app --host 127.0.0.1 --port 8090"

echo [2/4] Khởi động Backend API (Port 5050)
start "Backend API" cmd /c "cd Backend\VeriChainIDS.API && title Backend API && echo Chay Backend... && dotnet run --urls http://0.0.0.0:5050"

echo [3/4] Khởi động AI Engine (Port 8000)
start "AI Engine" cmd /c "cd Al-Engine && title AI Engine && echo Chay AI Engine... && py -3.11 -m venv .venv && .venv\Scripts\python.exe ai_engine.py --backend-url http://localhost:5050"

echo [4/4] Khởi động Frontend (Port 5174)
:: Inject VITE_API_URL để Frontend (chạy trên trình duyệt client) biết đường gọi Backend
start "Frontend" cmd /c "cd Frontend && title Frontend && echo Chay Frontend... && set "VITE_API_URL=http://%VPS_IP%:5050" && npm run dev -- --host 0.0.0.0 --port 5174"
echo ========================================================
echo.
echo [OK] Đã gửi lệnh khởi chạy các dịch vụ!
echo Bạn có thể truy cập Dashboard tại: http://%VPS_IP%:5174
echo.
echo LƯU Ý KHI ĐƯA LÊN VPS:
echo 1. Hãy chắc chắn VPS đã mở port 5050 (Backend API) và 5174 (Frontend).
echo 2. Agent (client) cần cài đặt với lệnh: -u http://%VPS_IP%:5050
echo 3. SQL Server (LocalDB) có thể không chạy ổn định trên VPS như trên máy cá nhân, khuyên dùng SQL Express.
echo 4. Nếu bạn dùng VPS có domain (vd: api.verichain.com), hãy thay %%VPS_IP%% trong file này bằng domain.
echo.
pause
