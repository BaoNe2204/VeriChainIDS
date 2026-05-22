# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('WinDivert64.sys', '.'),
    ('WinDivert.dll', '.'),
    ('trusted_ip_ranges.txt', '.'),],
    hiddenimports=[
        'agent_core',
        'requests',
        'psutil',
        'pystray',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'signalrcore',
        'signalrcore.hub_connection_builder',
        'websocket',
        'websocket._app',
        'websocket._core',
        'pydivert',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='VeriChainIDSAgent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,         # Chạy nền (không cửa sổ console); log trong %LOCALAPPDATA%\\VeriChainIDS\\logs
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    uac_admin=True,       # Request admin rights
)
