#!/usr/bin/env python3
"""
VeriChainIDS Agent v3 — chạy nền: WinForms nhập key/URL, icon khay hệ thống, menu giống ứng dụng Windows.
"""

from __future__ import annotations

import json
import logging
import math
import os
import subprocess
import sys
import tempfile
import threading
import traceback
from pathlib import Path
from typing import Any, Callable, Optional

LOG_DIR = Path(os.getenv("LOCALAPPDATA", tempfile.gettempdir())) / "VeriChainIDS" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

_IS_FROZEN = getattr(sys, "frozen", False)
_LOG_HANDLERS: list[logging.Handler] = [
    logging.FileHandler(LOG_DIR / "agent.log", encoding="utf-8"),
]
if not _IS_FROZEN:
    _LOG_HANDLERS.append(logging.StreamHandler(sys.stdout))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=_LOG_HANDLERS,
)
logger = logging.getLogger("VeriChainIDS")

# subprocess: ẩn cửa sổ console khi chạy exe
_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

_agent_lock = threading.Lock()
_agent: Any = None
_tray_icon: Any = None


def _config_path() -> Path:
    p = Path(os.getenv("APPDATA", "")) / "VeriChainIDS"
    p.mkdir(parents=True, exist_ok=True)
    return p / "config.json"


def _load_config() -> Optional[dict]:
    try:
        cfg = _config_path()
        if cfg.exists():
            return json.loads(cfg.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


def _save_config(data: dict) -> bool:
    try:
        _config_path().write_text(json.dumps(data, indent=2), encoding="utf-8")
        return True
    except Exception:
        return False


def _powershell_escape(s: str) -> str:
    return s.replace("`", "``").replace("$", "`$").replace('"', '`"')


def _ask_connection_dialog(
    default_url: str = "http://localhost:5000",
    default_key: str = "",
    title: str = "VeriChainIDS — Kết nối",
) -> Optional[dict]:
    """
    Form WinForms (PowerShell): Backend URL + API Key.
    Trả về {"server_url": str, "api_key": str} hoặc None.
    """
    du = _powershell_escape(default_url)
    dk = _powershell_escape(default_key)
    tt = _powershell_escape(title)
    script = f"""
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = "{tt}"
$form.Size = New-Object System.Drawing.Size(500, 220)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$l1 = New-Object System.Windows.Forms.Label
$l1.Location = New-Object System.Drawing.Point(15, 15)
$l1.Size = New-Object System.Drawing.Size(460, 16)
$l1.Text = "Backend URL:"
$form.Controls.Add($l1)

$tbUrl = New-Object System.Windows.Forms.TextBox
$tbUrl.Location = New-Object System.Drawing.Point(15, 35)
$tbUrl.Size = New-Object System.Drawing.Size(455, 23)
$tbUrl.Text = "{du}"
$form.Controls.Add($tbUrl)

$l2 = New-Object System.Windows.Forms.Label
$l2.Location = New-Object System.Drawing.Point(15, 68)
$l2.Size = New-Object System.Drawing.Size(460, 16)
$l2.Text = "API Key (Dashboard → Servers):"
$form.Controls.Add($l2)

$tbKey = New-Object System.Windows.Forms.TextBox
$tbKey.Location = New-Object System.Drawing.Point(15, 88)
$tbKey.Size = New-Object System.Drawing.Size(455, 23)
$tbKey.Font = New-Object System.Drawing.Font("Consolas", 9)
$tbKey.Text = "{dk}"
$form.Controls.Add($tbKey)

$ok = New-Object System.Windows.Forms.Button
$ok.Location = New-Object System.Drawing.Point(300, 125)
$ok.Size = New-Object System.Drawing.Size(80, 28)
$ok.Text = "Kết nối"
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $ok
$form.Controls.Add($ok)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Location = New-Object System.Drawing.Point(390, 125)
$cancel.Size = New-Object System.Drawing.Size(80, 28)
$cancel.Text = "Hủy"
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $cancel
$form.Controls.Add($cancel)

$hint = New-Object System.Windows.Forms.Label
$hint.Location = New-Object System.Drawing.Point(15, 162)
$hint.Size = New-Object System.Drawing.Size(460, 40)
$hint.Text = "API Key chỉ lưu trên máy bạn (AppData\\VeriChainIDS\\config.json)."
$hint.ForeColor = [System.Drawing.Color]::Gray
$hint.Font = New-Object System.Drawing.Font(8)
$form.Controls.Add($hint)

$r = $form.ShowDialog()
if ($r -eq [System.Windows.Forms.DialogResult]::OK) {{
    $u = $tbUrl.Text.Trim()
    $k = $tbKey.Text.Trim()
    if ($k) {{
        $o = @{{ server_url = $u; api_key = $k }}
        ($o | ConvertTo-Json -Compress) | Write-Output
    }}
}}
"""
    try:
        out = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-WindowStyle",
                "Hidden",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            timeout=120,
            creationflags=_CREATE_NO_WINDOW,
        )
        raw = (out.stdout or "").strip()
        if not raw:
            return None
        line = raw.splitlines()[-1].strip()
        data = json.loads(line)
        key = (data.get("api_key") or "").strip()
        url = (data.get("server_url") or default_url).strip().rstrip("/")
        if not key:
            return None
        return {"api_key": key, "server_url": url or default_url}
    except Exception as e:
        logger.error("Dialog error: %s", e)
        return None


def _validate_key(key: str, url: str) -> bool:
    try:
        import requests as _req

        r = _req.get(
            f"{url.rstrip('/')}/health",
            headers={"X-API-Key": key},
            timeout=8,
        )
        return r.status_code < 500
    except Exception:
        return False


def _tray_image():
    from PIL import Image, ImageDraw

    size = 64
    img = Image.new("RGBA", (size, size), (26, 26, 46, 255))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    for r, alpha in ((26, 35), (20, 70), (14, 110)):
        draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            fill=(72, 118, 255, alpha),
        )
    R = 14
    pts: list[tuple[float, float]] = []
    for i in range(6):
        a = math.radians(-90 + i * 60)
        pts.append((cx + R * math.cos(a), cy + R * math.sin(a)))
    draw.polygon(pts, outline=(233, 69, 96, 255), width=3)
    return img


def _notify(title: str, body: str) -> None:
    global _tray_icon
    try:
        if _tray_icon is not None:
            _tray_icon.notify(title, body[:512])
    except Exception:
        logger.info("%s — %s", title, body)


def _agent_main_loop() -> None:
    global _agent
    try:
        with _agent_lock:
            ag = _agent
        if ag is not None:
            ag.start()
    except Exception:
        logger.exception("Agent thread crashed")
        _notify("VeriChainIDS Agent", "Lỗi agent — xem agent.log")


def _start_agent(api_key: str, server_url: str) -> bool:
    global _agent, _tray_icon
    try:
        from agent_core import VeriChainIDSAgentV3

        with _agent_lock:
            if _agent is not None:
                return True
            _agent = VeriChainIDSAgentV3(
                api_key=api_key,
                server_url=server_url,
                interval=5,
                batch_size=100,
                demo_mode=False,
                ssl_verify=True,
            )
            # Set notification callback để agent có thể thông báo lỗi
            _agent.set_notification_callback(_notify)
        
        t = threading.Thread(target=_agent_main_loop, daemon=True, name="VeriChainIDSAgent")
        t.start()
        logger.info("Agent thread started. Log: %s", LOG_DIR / "agent.log")
        return True
    except Exception:
        logger.exception("Không khởi động được agent")
        return False


def _on_view_status(icon, _item) -> None:
    with _agent_lock:
        ag = _agent
    if ag is None:
        _notify("VeriChainIDS Agent", "Agent chưa sẵn sàng.")
        return
    s = ag.get_stats()
    up = int(s.get("uptime_seconds") or 0)
    msg = (
        f"Đã gửi: {s.get('total_sent', 0)} | Lỗi: {s.get('total_failed', 0)} | "
        f"Chặn: {s.get('total_blocked', 0)} | Uptime: {up}s"
    )
    le = s.get("last_error")
    if le:
        msg += f" | Lỗi gần nhất: {le}"
    _notify("Trạng thái", msg)


def _on_open_logs(icon, _item) -> None:
    try:
        if sys.platform == "win32":
            os.startfile(str(LOG_DIR))
        else:
            import webbrowser

            webbrowser.open(LOG_DIR.as_uri())
    except Exception as e:
        logger.error("Mở thư mục log: %s", e)
        _notify("VeriChainIDS Agent", str(e))


def _on_change_key(icon, _item) -> None:
    global _agent
    cfg = _load_config() or {}
    url = (cfg.get("server_url") or "http://localhost:5000").strip().rstrip("/")
    old_key = (cfg.get("api_key") or "").strip()
    data = _ask_connection_dialog(default_url=url, default_key=old_key, title="VeriChainIDS — Đổi API Key")
    if not data:
        return
    new_key = data["api_key"]
    new_url = data["server_url"].rstrip("/")
    if not _validate_key(new_key, new_url):
        logger.warning("Backend không phản hồi sau khi đổi key; vẫn áp dụng theo cấu hình.")
    _save_config({"api_key": new_key, "server_url": new_url})
    with _agent_lock:
        ag = _agent
    if ag is not None:
        ag.server_url = new_url
        ag.blocker.backend_url = new_url
        try:
            ag.apply_api_key(new_key)
        except Exception:
            logger.exception("apply_api_key failed")
            _notify("VeriChainIDS Agent", "Đổi key lỗi — xem agent.log")
            return
    _notify("VeriChainIDS Agent", "Đã cập nhật API Key.")


def _on_about(icon, _item) -> None:
    _notify(
        "VeriChainIDS Agent",
        "Phiên bản 3.0 — giám sát & gửi log về backend. Chạy nền qua icon khay hệ thống.",
    )


def _on_exit(icon, _item) -> None:
    global _agent
    logger.info("Người dùng chọn Dừng Agent.")
    with _agent_lock:
        ag = _agent
        _agent = None
    if ag is not None:
        try:
            ag.stop()
        except Exception:
            pass
    try:
        icon.stop()
    except Exception:
        pass
    os._exit(0)


def _build_menu():
    from pystray import Menu, MenuItem

    return Menu(
        MenuItem("VeriChainIDS Agent", lambda *_: None, enabled=False),
        Menu.SEPARATOR,
        MenuItem("Xem trạng thái", _on_view_status),
        MenuItem("Mở thư mục Logs", _on_open_logs),
        MenuItem("Đổi API Key", _on_change_key),
        MenuItem("Thông tin", _on_about),
        Menu.SEPARATOR,
        MenuItem("Dừng Agent", _on_exit),
    )


def _run_tray() -> None:
    global _tray_icon
    from pystray import Icon

    _tray_icon = Icon(
        "VeriChainIDSAgent",
        _tray_image(),
        "VeriChainIDS Agent",
        menu=_build_menu(),
    )
    _tray_icon.run()


def main() -> None:
    if not _IS_FROZEN:
        logger.info("VeriChainIDS Agent v3.0 (dev — có console)")

    api_key: Optional[str] = None
    server_url = "http://localhost:5000"

    for i, arg in enumerate(sys.argv):
        if arg in ("-k", "--api-key") and i + 1 < len(sys.argv):
            api_key = sys.argv[i + 1].strip()
        if arg in ("-u", "--server-url") and i + 1 < len(sys.argv):
            server_url = sys.argv[i + 1].strip().rstrip("/")
        if arg in ("-r", "--reset"):
            p = _config_path()
            if p.exists():
                p.unlink()
            logger.info("Đã xóa config; cần nhập lại API Key.")

    cfg = _load_config()
    if not api_key and cfg:
        api_key = (cfg.get("api_key") or "").strip()
        server_url = (cfg.get("server_url") or server_url).strip().rstrip("/")

    if not api_key:
        data = _ask_connection_dialog(default_url=server_url)
        if not data:
            logger.error("Không có API Key — thoát.")
            sys.exit(1)
        api_key = data["api_key"]
        server_url = data["server_url"].rstrip("/")
        _save_config({"api_key": api_key, "server_url": server_url})

    if not _validate_key(api_key, server_url):
        logger.warning("Backend không phản hồi; vẫn chạy (kiểm tra URL / key / firewall).")
    else:
        logger.info("Backend OK: %s", server_url)

    if not _start_agent(api_key, server_url):
        sys.exit(1)

    try:
        _run_tray()
    except Exception:
        logger.exception("pystray error")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
