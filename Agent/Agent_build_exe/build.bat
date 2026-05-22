@echo off
chcp 65001 >nul 2>&1
echo.
echo ============================================================
echo   VeriChainIDS — build VeriChainIDSAgent + VeriChainIDSDebug
echo ============================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found.
    pause
    exit /b 1
)

REM === Tìm thư mục pydivert ===
echo [1/6] Locating pydivert package...
for /f "delims=" %%i in ('python -c "import pydivert,os; print(os.path.dirname(pydivert.__file__))" 2^>nul') do set PYDIVERT_DIR=%%i
set PYDIVERT_DIR=%PYDIVERT_DIR%\windivert_dll

echo    pydivert dir : %PYDIVERT_DIR%

REM === Kiểm tra WinDivert files có trong site-packages ===
set WD_DLL=
set WD_SYS=
if exist "%PYDIVERT_DIR%\WinDivert64.dll" set "WD_DLL=%PYDIVERT_DIR%\WinDivert64.dll"
if exist "%PYDIVERT_DIR%\WinDivert64.sys" set "WD_SYS=%PYDIVERT_DIR%\WinDivert64.sys"

if "%WD_DLL%"=="" (
    echo [WARN] WinDivert64.dll not found in %PYDIVERT_DIR%
    echo         pydivert must be installed: pip install pydivert
)
if "%WD_SYS%"=="" (
    echo [WARN] WinDivert64.sys not found in %PYDIVERT_DIR%
)

echo [2/6] pip install pyinstaller + requirements...
python -m pip install --upgrade pyinstaller >nul 2>&1
python -m pip install -r requirements.txt >nul 2>&1
if errorlevel 1 (
    python -m pip install requests psutil pystray pillow signalrcore websocket-client pydivert >nul 2>&1
)

echo [3/6] Stop running exe (if any)...
taskkill /F /IM VeriChainIDSAgent.exe >nul 2>&1
taskkill /F /IM VeriChainIDSDebug.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [4/6] Clean dist\build...
if exist "dist" rmdir /s /q "dist"
if exist "build" rmdir /s /q "build"
if exist "__pycache__" rmdir /s /q "__pycache__"
mkdir dist >nul 2>&1

echo [5/6] PyInstaller...
python -m PyInstaller VeriChainIDSAgent.spec --clean --noconfirm
if errorlevel 1 (
    echo [ERROR] VeriChainIDSAgent build failed
    pause
    exit /b 1
)
python -m PyInstaller VeriChainIDSDebug.spec --clean --noconfirm
if errorlevel 1 (
    echo [ERROR] VeriChainIDSDebug build failed
    pause
    exit /b 1
)

echo [6/6] Copy WinDivert driver files to dist...
set COPY_OK=0
if not "%WD_DLL%"=="" (
    copy /Y "%WD_DLL%" "dist\WinDivert64.dll" >nul 2>&1
    if not errorlevel 1 (
        echo    [OK] WinDivert64.dll  -> dist\
        set COPY_OK=1
    ) else (
        echo    [FAIL] WinDivert64.dll copy failed
    )
)
if not "%WD_SYS%"=="" (
    copy /Y "%WD_SYS%" "dist\WinDivert64.sys" >nul 2>&1
    if not errorlevel 1 (
        echo    [OK] WinDivert64.sys  -> dist\
        set COPY_OK=1
    ) else (
        echo    [FAIL] WinDivert64.sys copy failed
    )
)
if "%COPY_OK%"=="0" (
    echo    [WARN] WinDivert files not found — pydivert may not be installed
    echo           Run: pip install pydivert  (requires Administrator for driver install)
)

REM === [7/7] Tạo file ZIP chứa Agent + Driver (Sửa lỗi !ZIP_FILES!) ===
echo [7/7] Packaging VeriChainIDSAgent.zip...
if exist "dist\VeriChainIDSAgent.zip" del /f /q "dist\VeriChainIDSAgent.zip" >nul 2>&1

set "Z_AGENT=dist\VeriChainIDSAgent.exe"
set "Z_DEBUG=dist\VeriChainIDSDebug.exe"
set "Z_DLL=dist\WinDivert64.dll"
set "Z_SYS=dist\WinDivert64.sys"

powershell -NoProfile -Command "$files = @('%Z_AGENT%', '%Z_DEBUG%', '%Z_DLL%', '%Z_SYS%') | Where-Object { Test-Path $_ }; if ($files) { Compress-Archive -Path $files -DestinationPath 'dist\VeriChainIDSAgent.zip' -Force; exit 0 } else { exit 1 }"

if not errorlevel 1 (
    for %%A in ("dist\VeriChainIDSAgent.zip") do echo    [OK] VeriChainIDSAgent.zip  %%~zA bytes
) else (
    echo    [FAIL] Zip packaging failed - No files found
)

echo.
echo ============================================================
echo   Build Complete
echo ============================================================
echo.
if exist "dist\VeriChainIDSAgent.exe" (
    for %%A in ("dist\VeriChainIDSAgent.exe") do echo  [OK] dist\VeriChainIDSAgent.exe     %%~zA bytes
)
if exist "dist\VeriChainIDSDebug.exe" (
    for %%A in ("dist\VeriChainIDSDebug.exe") do echo  [OK] dist\VeriChainIDSDebug.exe     %%~zA bytes
)
if exist "dist\WinDivert64.dll" (
    for %%A in ("dist\WinDivert64.dll") do echo  [OK] dist\WinDivert64.dll       %%~zA bytes
)
if exist "dist\WinDivert64.sys" (
    for %%A in ("dist\WinDivert64.sys") do echo  [OK] dist\WinDivert64.sys       %%~zA bytes
)
if exist "dist\VeriChainIDSAgent.zip" (
    for %%A in ("dist\VeriChainIDSAgent.zip") do echo  [OK] dist\VeriChainIDSAgent.zip     %%~zA bytes
)
echo.
pause
