#!/usr/bin/env python3
"""
VeriChainIDS Agent v3 - Core Engine
Khong co circular import, self-contained, build dc voi PyInstaller.
"""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import logging
import logging.handlers
import os
import platform
import re
import socket
import subprocess
import sys
import threading
import time
import uuid
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
import sys

# ──────────────────────────────────────────────
#  Logging — file + console output
#  Log file: %LOCALAPPDATA%\VeriChainIDS\logs\agent.log
# ──────────────────────────────────────────────
LOG_DIR = os.path.join(os.environ.get("LOCALAPPDATA", "."), "VeriChainIDS", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

# Log rotation: 5 MB/file, giữ 5 file, tự động xóa file cũ > 30 ngày
_max_bytes = 5 * 1024 * 1024  # 5 MB
_backup_count = 5

_log_file = os.path.join(LOG_DIR, "agent.log")
_file_handler = logging.handlers.RotatingFileHandler(
    _log_file, maxBytes=_max_bytes, backupCount=_backup_count,
    encoding="utf-8"
)
_file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s - %(message)s"))

# Dọn log cũ > 30 ngày
try:
    cutoff = time.time() - 30 * 86400
    for f in os.listdir(LOG_DIR):
        if f.startswith("agent.log"):
            fp = os.path.join(LOG_DIR, f)
            if os.path.getmtime(fp) < cutoff:
                try:
                    os.remove(fp)
                except Exception:
                    pass
except Exception:
    pass
_console_handler = logging.StreamHandler(sys.stdout)
_console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))

_root = logging.getLogger()
_root.setLevel(logging.INFO)
_root.addHandler(_file_handler)
_root.addHandler(_console_handler)
logger = logging.getLogger("AgentCore")

# ──────────────────────────────────────────────
#  Constants
# ──────────────────────────────────────────────
AUTO_BLOCK_ENABLED = os.getenv("AUTO_BLOCK", "true").lower() == "true"
BLOCK_THRESHOLD_SCORE = float(os.getenv("BLOCK_THRESHOLD_SCORE", "0.6"))
DISTRIBUTED_SOURCE_THRESHOLD = int(os.getenv("DISTRIBUTED_SOURCE_THRESHOLD", "5"))
DISTRIBUTED_REQUEST_THRESHOLD = int(os.getenv("DISTRIBUTED_REQUEST_THRESHOLD", "80"))
ALERT_DEDUP_MINUTES = int(os.getenv("ALERT_DEDUP_MINUTES", "1"))
DEFAULT_INTERVAL = 1
DEFAULT_BATCH_SIZE = 200
MAX_RETRIES = 3
RETRY_DELAY = 3
HEARTBEAT_INTERVAL = 30
HEALTH_PORT = 17999  # Cổng health check HTTP — backend gọi GET /health để check agent online

PORT_SERVICE_MAP = {
    21: "FTP", 22: "SSH", 23: "TELNET", 25: "SMTP", 53: "DNS",
    80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS",
    445: "SMB", 3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL",
    6379: "Redis", 8080: "HTTP-ALT", 8443: "HTTPS-ALT", 27017: "MongoDB",
}
SUSPICIOUS_PORTS = {4444, 5555, 6666, 7777, 8888, 9999, 12345, 31337}

# Trusted networks (Google, Microsoft, Azure, AWS, GitHub, Cloudflare)
TRUSTED_NETWORKS = [
    ipaddress.ip_network("2404:6800::/32"),  # Google
    ipaddress.ip_network("2607:f8b0::/32"),  # Google
    ipaddress.ip_network("2001:4860::/32"),  # Google
    ipaddress.ip_network("13.107.0.0/16"),   # Microsoft
    ipaddress.ip_network("20.0.0.0/8"),      # Azure
    ipaddress.ip_network("52.0.0.0/8"),      # AWS/Azure
    ipaddress.ip_network("140.82.0.0/16"),   # GitHub
    ipaddress.ip_network("104.16.0.0/12"),   # Cloudflare
    ipaddress.ip_network("172.64.0.0/13"),   # Cloudflare
]

def load_trusted_ip_ranges() -> list:
    """Load trusted IP ranges from file - optimized for large files"""
    ranges = []
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        trusted_file = os.path.join(script_dir, "trusted_ip_ranges.txt")
        
        if os.path.exists(trusted_file):
            logger.info(f"Loading trusted IP ranges from {trusted_file}...")
            start_time = time.time()
            
            # Read file with larger buffer for better performance
            with open(trusted_file, 'r', buffering=8192) as f:
                valid_count = 0
                invalid_count = 0
                
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        try:
                            ranges.append(ipaddress.ip_network(line))
                            valid_count += 1
                        except ValueError:
                            invalid_count += 1
                            if invalid_count <= 5:  # Only log first 5 errors
                                logger.warning(f"Invalid IP range: {line}")
            
            elapsed = time.time() - start_time
            logger.info(f"Loaded {valid_count} trusted IP ranges in {elapsed:.2f}s (skipped {invalid_count} invalid)")
    except Exception as e:
        logger.error(f"Could not load trusted_ip_ranges.txt: {e}")
    
    return ranges

# Load trusted ranges from file + hardcoded
TRUSTED_NETWORKS.extend(load_trusted_ip_ranges())

def is_trusted_ip(ip: str) -> bool:
    """Check if IP belongs to trusted networks (Google, Microsoft, AWS, GitHub, Cloudflare)"""
    try:
        ip_obj = ipaddress.ip_address(ip)
        return any(ip_obj in net for net in TRUSTED_NETWORKS)
    except ValueError:
        return False

SQLI_PATTERNS = [
    r"UNION\s+(ALL\s+)?SELECT", r"DROP\s+(TABLE|DATABASE|INDEX)",
    r"WAITFOR\s+DELAY", r"BENCHMARK\s*\(", r"SLEEP\s*\(",
    r"('|\"|%)?(\bOR\b|\bAND\b).*(=|<|>)",
]
XSS_PATTERNS = [
    r"<script[^>]*>", r"javascript:", r"on\w+\s*=",
    r"<iframe[^>]*>", r"document\.cookie",
]
MALWARE_PATTERNS = [
    r"powershell", r"cmd\.exe", r"bash\s+-i", r"nc\s", r"certutil",
    r"wget\s", r"curl\s", r"bitsadmin", r"/etc/passwd",
]
PROCESS_RISK_KEYWORDS = {
    "powershell", "cmd", "wscript", "cscript", "bash", "sh",
    "python", "nc", "ncat", "netcat", "nmap", "mimikatz",
    "psexec", "wmic", "certutil", "bitsadmin",
}

logger = logging.getLogger("AgentCore")


# ──────────────────────────────────────────────
#  Health Check HTTP Server (siêu nhẹ, chạy nền)
# ──────────────────────────────────────────────
class HealthServer:
    """HTTP server nền trả về trạng thái Agent — backend gọi GET /health."""

    def __init__(self, agent: "AgentCore"):
        self.agent = agent
        self._running = False
        self._thread: threading.Thread | None = None
        self._port = HEALTH_PORT
        self._last_seen: float = time.time()

    def _ensure_firewall_rule(self) -> None:
        """Tự động mở port trong Windows Firewall."""
        if platform.system() != "Windows":
            return
        
        rule_name = "VeriChainIDS_Health_Port"
        try:
            # Kiểm tra rule đã tồn tại chưa
            check = subprocess.run(
                ["netsh", "advfirewall", "firewall", "show", "rule", f"name={rule_name}"],
                capture_output=True, text=True, timeout=5, creationflags=0x08000000
            )
            
            if "No rules match" in check.stdout or check.returncode != 0:
                # Tạo rule mới
                cmd = [
                    "netsh", "advfirewall", "firewall", "add", "rule",
                    f"name={rule_name}",
                    "dir=in",
                    "action=allow",
                    "protocol=TCP",
                    f"localport={self._port}",
                    "description=VeriChainIDS Agent Health Check - Auto-created"
                ]
                result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=10, creationflags=0x08000000
                )
                if result.returncode == 0:
                    logger.info("[FIREWALL] Opened port %d for health check", self._port)
                else:
                    logger.warning("[FIREWALL] Failed to open port %d: %s", self._port, result.stderr)
            else:
                logger.debug("[FIREWALL] Port %d already allowed", self._port)
        except Exception as exc:
            logger.warning("[FIREWALL] Firewall rule error: %s", exc)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        
        # Tự động mở firewall trước khi start server
        self._ensure_firewall_rule()
        
        self._thread = threading.Thread(target=self._serve, daemon=True, name="HealthServer")
        self._thread.start()
        logger.info("[HEALTH] HTTP server started on port %d", self._port)

    def _serve(self) -> None:
        import http.server
        class _Handler(http.server.BaseHTTPRequestHandler):
            agent_ref = self.agent
            last_seen = self._last_seen

            def do_GET(self):
                if self.path == "/health" or self.path == "/":
                    uptime = int(time.time() - (self.agent_ref._stats.get("start_time") or time.time()))
                    body = json.dumps({
                        "status": "online",
                        "server_id": self.agent_ref.server_id,
                        "api_key_prefix": self.agent_ref.api_key_prefix,
                        "uptime_seconds": uptime,
                        "version": "3.0",
                    }).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", len(body))
                    self.end_headers()
                    self.wfile.write(body)
                elif self.path == "/metrics":
                    stats = self.agent_ref._stats
                    body = json.dumps({
                        "total_sent": stats.get("total_sent", 0),
                        "total_failed": stats.get("total_failed", 0),
                        "total_attacks": stats.get("total_attacks", 0),
                        "total_blocked": stats.get("total_blocked", 0),
                    }).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", len(body))
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, fmt, *args):
                pass  # Suppress request logging

        import socket
        srv = http.server.HTTPServer(("0.0.0.0", self._port), _Handler)
        srv.timeout = 1
        while self._running:
            try:
                srv.handle_request()
            except Exception:
                if not self._running:
                    break
        srv.server_close()
        logger.info("[HEALTH] HTTP server stopped")

    def stop(self) -> None:
        self._running = False


# ──────────────────────────────────────────────
#  Data classes
# ──────────────────────────────────────────────
@dataclass
class TrafficLogEntry:
    source_ip: str
    destination_ip: str | None = None
    source_port: int | None = None
    destination_port: int | None = None
    protocol: str | None = None
    bytes_in: int = 0
    bytes_out: int = 0
    packets_in: int = 0
    packets_out: int = 0
    request_count: int = 1
    raw_payload: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "SourceIp": self.source_ip,
            "DestinationIp": self.destination_ip,
            "SourcePort": self.source_port,
            "DestinationPort": self.destination_port,
            "Protocol": self.protocol,
            "BytesIn": self.bytes_in,
            "BytesOut": self.bytes_out,
            "PacketsIn": self.packets_in,
            "PacketsOut": self.packets_out,
            "RequestCount": self.request_count,
            "RawPayload": self.raw_payload,
        }


@dataclass
class AttackSignature:
    attack_type: str
    severity: str
    score: float
    title: str
    description: str
    mitre_tactic: str
    mitre_technique: str
    evidence: dict[str, Any]


# ──────────────────────────────────────────────
#  IP Blocker
# ──────────────────────────────────────────────
class IPBlocker:
    """
    Chặn IP tấn công bằng 2 cơ chế:
      1. Primary  : Windows Firewall (netsh) / iptables — tường lửa hệ điều hành
      2. Fallback : pydivert packet interceptor — chặn ở tầng network driver

    Luồng daemon pydivert chạy nền, dùng threading.Lock để cập nhật danh sách
    IP bị chặn an toàn giữa các thread.
    """

    def __init__(self, backend_url: str, api_key: str, server_id: str = ""):
        self.backend_url = backend_url.rstrip("/")
        self.api_key = api_key
        self.server_id = server_id
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        })
        self._blocked_ips: set[str] = set()
        self._lock = threading.Lock()
        self._plat = platform.system()

        # ── Pydivert daemon ─────────────────────────
        self._divert_running = False
        self._divert_thread: threading.Thread | None = None
        self._pydivert_available = False

        if self._plat == "Windows":
            try:
                import wdivert  # type: ignore
                self._wdivert = wdivert
                self._pydivert_available = True
                logger.info("[BLOCKER] pydivert (wdivert) available — packet interceptor enabled")
            except ImportError:
                try:
                    import pydivert  # type: ignore
                    self._pydivert = pydivert
                    self._pydivert_available = True
                    logger.info("[BLOCKER] pydivert available — packet interceptor enabled")
                except ImportError:
                    logger.warning("[BLOCKER] pydivert NOT installed — fallback interceptor disabled")

        if self._pydivert_available:
            self._start_divert_daemon()

    # ── Pydivert daemon ──────────────────────────────────────────
    def _start_divert_daemon(self) -> None:
        """Khởi động daemon thread bắt và hủy gói tin từ IP bị chặn."""
        lib = getattr(self, "_pydivert", None) or getattr(self, "_wdivert", None)
        lib_name = "pydivert" if hasattr(self, "_pydivert") else "wdivert"

        self._divert_running = True
        self._divert_thread = threading.Thread(
            target=self._divert_loop,
            daemon=True,
            name="PydivertDaemon"
        )
        self._divert_thread.start()
        logger.info(
            "[BLOCKER] Pydivert daemon started (lib=%s) — intercepting inbound packets on all interfaces",
            lib_name
        )

        # Kiểm tra sau 2 giây: thread có đang sống không?
        threading.Timer(2.0, self._verify_divert_running, args=(lib, lib_name)).start()

    def _verify_divert_running(self, lib, lib_name: str) -> None:
        """Kiểm tra pydivert daemon có thực sự đang chạy không, sau 2 giây từ lúc start."""
        if self._divert_running and self._divert_thread and self._divert_thread.is_alive():
            logger.info(
                "[BLOCKER] Pydivert VERIFIED alive — thread_id=%s is_alive=True",
                self._divert_thread.ident
            )
        else:
            # Tái khởi động một lần
            logger.warning("[BLOCKER] Pydivert daemon chết sau 2s — thu lam 1 lan")
            try:
                self._divert_running = False
                if self._divert_thread:
                    self._divert_thread.join(timeout=2)
            except Exception:
                pass
            self._divert_running = True
            self._divert_thread = threading.Thread(
                target=self._divert_loop,
                daemon=True,
                name="PydivertDaemon-RESTART"
            )
            self._divert_thread.start()
            if self._divert_thread.is_alive():
                logger.info("[BLOCKER] Pydivert restart OK — thread_id=%s", self._divert_thread.ident)
            else:
                logger.error(
                    "[BLOCKER] Pydivert restart VAN CHET — can kiem tra WinDivert driver/permission\n"
                    "  => Thu chay agent bang quyen Administrator (run as admin)"
                )

    def _divert_loop(self) -> None:
        """Daemon loop: bắt gói tin inbound, drop nếu IP trong danh sách chặn."""
        lib = getattr(self, "_pydivert", None) or getattr(self, "_wdivert", None)
        lib_name = "pydivert" if hasattr(self, "_pydivert") else "wdivert"
        if lib is None:
            logger.error("[BLOCKER] Pydivert: lib is None, daemon thoat")
            return

        dropped_this_cycle = 0
        packets_this_cycle = 0
        last_report = time.time()

        while self._divert_running:
            try:
                # Filter: bắt inbound, loại local loopback
                with lib.WinDivert("inbound and ip.DstAddr != 127.0.0.1 and ip.DstAddr != ::1") as w:
                    for packet in w:
                        try:
                            ip_header = packet.ipv4 if packet.ipv4 else packet.ipv6
                            packets_this_cycle += 1
                            if ip_header:
                                src_ip = str(ip_header.src_addr)
                                with self._lock:
                                    if src_ip in self._blocked_ips:
                                        # Drop — không forward lên OS
                                        dropped_this_cycle += 1
                                        continue
                        except Exception:
                            pass
                        w.send(packet)

                        # Report mỗi 30 giây
                        if time.time() - last_report >= 30:
                            if dropped_this_cycle > 0:
                                logger.info(
                                    "[BLOCKER] Pydivert cycle report — pkts=%d dropped=%d (lib=%s)",
                                    packets_this_cycle, dropped_this_cycle, lib_name
                                )
                            packets_this_cycle = 0
                            dropped_this_cycle = 0
                            last_report = time.time()

            except OSError as e:
                # E.g. "Access is denied" → thiếu quyền admin
                if not self._divert_running:
                    break
                logger.error(
                    "[BLOCKER] Pydivert OSError (lib=%s) — kiem tra quyen Administrator:\n  %s",
                    lib_name, e
                )
                time.sleep(5)
            except Exception as e:
                if not self._divert_running:
                    break
                logger.debug("[BLOCKER] Pydivert cycle error (lib=%s): %s", lib_name, e)
                time.sleep(1)

    def _stop_divert_daemon(self) -> None:
        """Dừng daemon thread khi agent shutdown."""
        was_running = self._divert_running
        self._divert_running = False
        if self._divert_thread and self._divert_thread.is_alive():
            self._divert_thread.join(timeout=3)
            logger.info("[BLOCKER] Pydivert daemon stopped (was_alive=%s)", was_running)
        else:
            logger.info("[BLOCKER] Pydivert daemon cleanup (was_running=%s)", was_running)

    # ── Public API ────────────────────────────────────────────────
    def block(self, ip: str, reason: str, attack_type: str, severity: str) -> bool:
        # CHỐNG BLOCK NHẦM BACKEND SERVER
        backend_host = self.backend_url.split("//")[-1].split(":")[0]
        try:
            backend_ip = socket.gethostbyname(backend_host)
            if ip == backend_ip or ip == "127.0.0.1" or ip == "::1":
                logger.error(f"[CRITICAL] Agent định block IP của chính Backend/Localhost ({ip}). ĐÃ CHẶN HÀNH VI NÀY!")
                return False
        except:
            pass
        # 1. Kiểm tra đã block chưa
        with self._lock:
            if ip in self._blocked_ips:
                logger.info("[BLOCK] %s — da bi chan roi (bo qua)", ip)
                return True

        # 2. Kiểm tra whitelist
        if self._is_whitelisted(ip):
            logger.info("[BLOCK-SKIP] %s — NAM TRONG WHITELIST (bo qua block)", ip)
            return False

        logger.info("[BLOCK] Dang chan %s — %s | %s | %s", ip, attack_type, severity, reason[:40])

        # 3. Block bằng firewall (primary)
        local_ok = self._block_local(ip, reason)

        # 4. Thêm vào danh sách nội bộ (an toàn Lock)
        with self._lock:
            self._blocked_ips.add(ip)

        if local_ok:
            logger.info(
                "[BLOCK] %s — DA CHAN (netsh OK + pydivert active=%s)",
                ip, self._pydivert_available
            )
        else:
            logger.warning(
                "[BLOCK] %s — netsh FAILED, pydivert active=%s (chỉ chặn tại driver-level)",
                ip, self._pydivert_available
            )

        # 5. Report lên backend
        self._report_block_to_backend(ip, attack_type, severity, reason)
        return True

    def unblock(self, ip: str) -> bool:
        with self._lock:
            if ip not in self._blocked_ips:
                logger.info("[UNBLOCK] %s — khong co trong danh sach (bo qua)", ip)
                return True

        logger.info("[UNBLOCK] Dang mo chan %s", ip)

        ok = self._unblock_local(ip)
        with self._lock:
            self._blocked_ips.discard(ip)

        if ok:
            logger.info("[UNBLOCK] %s — DA MO CHAN (netsh)", ip)
        else:
            logger.warning("[UNBLOCK] %s — that bai netsh, da xoa khoi pydivert list", ip)
        return ok

    def get_blocked_count(self) -> int:
        with self._lock:
            return len(self._blocked_ips)

    def shutdown(self) -> None:
        """Dọn dẹp khi agent dừng."""
        self._stop_divert_daemon()

    # ── Firewall (primary) ────────────────────────────────────────
    def _block_local(self, ip: str, reason: str) -> bool:
        rule = f"VeriChainIDS_Block_{ip.replace('.', '_')}"
        cf = 0x08000000 if self._plat == "Windows" else 0

        if self._plat == "Windows":
            cmd = [
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name={rule}", "dir=in", "action=block",
                f"remoteip={ip}", "protocol=any",
                f"description=VeriChainIDS:{reason[:60]}",
            ]
        else:
            cmd = ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"]

        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=cf)
            return r.returncode == 0
        except Exception:
            return False

    def _unblock_local(self, ip: str) -> bool:
        rule = f"VeriChainIDS_Block_{ip.replace('.', '_')}"
        cf = 0x08000000 if self._plat == "Windows" else 0
        if self._plat == "Windows":
            cmd = ["netsh", "advfirewall", "firewall", "delete", "rule", f"name={rule}"]
        else:
            cmd = ["iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=cf)
            return r.returncode == 0
        except Exception:
            return False

    # ── Backend reporting ─────────────────────────────────────────
    def _is_whitelisted(self, ip: str) -> bool:
        try:
            logger.info("[WHITELIST-CHECK] Checking IP %s against backend whitelist...", ip)
            resp = self.session.get(
                f"{self.backend_url}/api/whitelists/ai-check/{ip}",
                timeout=5,
            )
            if resp.status_code == 200:
                data = resp.json()
                is_listed = data.get("data", {}).get("isWhitelisted", False)
                logger.info(
                    "[WHITELIST-CHECK] IP %s is %s (whitelist)",
                    ip, "WHITELISTED" if is_listed else "NOT in whitelist"
                )
                return is_listed
            logger.warning("[WHITELIST-CHECK] HTTP %d when checking whitelist for %s", resp.status_code, ip)
            return False
        except Exception as e:
            logger.warning("[WHITELIST-CHECK] Loi khi check whitelist cho %s: %s", ip, e)
            return False

    def _report_block_to_backend(self, ip: str, attack_type: str, severity: str, reason: str) -> None:
        try:
            payload = {
                "ip": ip,
                "attackType": attack_type,
                "severity": severity,
                "reason": reason,
                "score": 1.0,
                "blockedBy": "Agent-V3",
                "blockDurationMinutes": 60,
            }
            if self.server_id:
                payload["serverId"] = self.server_id
            self.session.post(
                f"{self.backend_url}/api/defense/block-ip",
                json=payload,
                timeout=10,
            )
        except Exception:
            pass


# ──────────────────────────────────────────────
#  Attack Detector
# ──────────────────────────────────────────────
class AttackDetector:
    def __init__(self, local_ip: str):
        self.local_ip = local_ip
        self._history: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=120))
        self._lock = threading.Lock()

    def analyze(self, logs: list[TrafficLogEntry]) -> list[AttackSignature]:
        grouped: dict[str, list[TrafficLogEntry]] = defaultdict(list)
        skip = {self.local_ip, "127.0.0.1", "::1", "localhost"}
        for log in logs:
            if log.source_ip and log.source_ip not in skip:
                # Skip trusted networks (Google, Microsoft, AWS, GitHub, Cloudflare)
                if is_trusted_ip(log.source_ip):
                    continue
                grouped[log.source_ip].append(log)

        attacks: list[AttackSignature] = []
        for ip, ip_logs in grouped.items():
            attacks.extend(self._detect_for_ip(ip, ip_logs))
        return attacks

    def _detect_for_ip(self, source_ip: str, logs: list[TrafficLogEntry]) -> list[AttackSignature]:
        total_req = sum(max(l.request_count, 1) for l in logs)
        total_bytes_in = sum(l.bytes_in for l in logs)
        total_bytes_out = sum(l.bytes_out for l in logs)
        total_packets_in = sum(l.packets_in for l in logs)
        total_packets_out = sum(l.packets_out for l in logs)
        ports = {l.destination_port for l in logs if l.destination_port}
        payloads = [l.raw_payload or "" for l in logs]
        now = datetime.now(timezone.utc)

        with self._lock:
            self._history[source_ip].append({
                "time": now, "requests": total_req, "ports": len(ports),
            })
            recent = [h for h in self._history[source_ip]
                      if (now - h["time"]).total_seconds() < 600]
            self._history[source_ip] = deque(recent, maxlen=120)

        avg_recent = sum(h["requests"] for h in recent) / max(len(recent), 1)
        attacks: list[AttackSignature] = []

        # DDoS — chỉ trigger khi CẢ current request rate CAO + history CAO đều thỏa mãn
        current_score = min(1.0, total_req / 600.0)
        history_score = min(1.0, avg_recent / 800.0)
        ddos_score = current_score * 0.7 + history_score * 0.3
        if ddos_score >= BLOCK_THRESHOLD_SCORE and any(p in {80, 443, 8080, 8443} for p in ports):
            attacks.append(AttackSignature("DDoS", "Critical", ddos_score,
                f"DDoS pressure from {source_ip}",
                f"{total_req} requests detected from {source_ip}.",
                "Impact", "T1498 - Network Denial of Service",
                {"source_ip": source_ip, "request_count": total_req, "target_ports": sorted(ports)}))

        # SSH BruteForce
        ssh_att = sum(max(l.request_count, 1) for l in logs if l.destination_port == 22)
        avg_bytes = (total_bytes_in + total_bytes_out) / max(total_req, 1)
        if ssh_att >= 12 and avg_bytes < 250:
            attacks.append(AttackSignature("BruteForce_SSH", "High",
                min(1.0, ssh_att / 20.0),
                f"SSH brute force from {source_ip}",
                f"{ssh_att} SSH attempts detected.",
                "Credential Access", "T1110 - Brute Force",
                {"source_ip": source_ip, "ssh_attempts": ssh_att}))

        # PortScan
        if len(ports) >= 10 and total_req <= len(ports) * 4:
            attacks.append(AttackSignature("PortScan", "Medium",
                min(1.0, len(ports) / 20.0),
                f"Port scan from {source_ip}",
                f"Scanning {len(ports)} ports.",
                "Discovery", "T1016 - System Network Configuration Discovery",
                {"source_ip": source_ip, "ports_scanned": sorted(ports)}))

        # SQL Injection
        text = "\n".join(payloads[-30:])
        sqli = sum(len(re.findall(p, text, re.IGNORECASE)) for p in SQLI_PATTERNS)
        if sqli > 0:
            attacks.append(AttackSignature("SQLInjection", "High",
                min(1.0, 0.7 + sqli * 0.05),
                f"SQL injection from {source_ip}",
                "SQL injection patterns detected.",
                "Initial Access", "T1190 - Exploit Public-Facing Application",
                {"source_ip": source_ip, "sqli_hits": sqli}))

        # XSS
        xss = sum(len(re.findall(p, text, re.IGNORECASE)) for p in XSS_PATTERNS)
        if xss > 0:
            attacks.append(AttackSignature("XSS", "Medium",
                min(1.0, 0.65 + xss * 0.04),
                f"XSS from {source_ip}",
                "XSS patterns detected.",
                "Execution", "T1059 - Command and Scripting Interpreter",
                {"source_ip": source_ip, "xss_hits": xss}))

        # Malware
        mw = sum(len(re.findall(p, text, re.IGNORECASE)) for p in MALWARE_PATTERNS)
        if mw > 0 or any(p in SUSPICIOUS_PORTS for p in ports):
            attacks.append(AttackSignature("Malware", "High",
                min(1.0, 0.6 + mw * 0.07 +
                    (0.1 if any(p in SUSPICIOUS_PORTS for p in ports) else 0.0)),
                f"Malware indicators from {source_ip}",
                "Suspicious payload or port.",
                "Execution", "T1059 - Command and Scripting Interpreter",
                {"source_ip": source_ip, "malware_hits": mw, "ports": sorted(ports)}))

        # SYN Flood
        syn_ratio = total_packets_out / max(total_packets_in, 1)
        if syn_ratio >= 4.5 and total_packets_out >= 40:
            attacks.append(AttackSignature("SYN_Flood", "Critical",
                min(1.0, syn_ratio / 8.0),
                f"SYN flood from {source_ip}",
                f"High outbound packet ratio: {syn_ratio:.1f}.",
                "Impact", "T1498 - Network Denial of Service",
                {"source_ip": source_ip, "syn_ratio": round(syn_ratio, 2)}))

        return attacks


# ──────────────────────────────────────────────
#  SignalR Hub Listener
# ──────────────────────────────────────────────
class AgentHubListener:
    def __init__(self, server_url: str, server_id: str, api_key: str, blocker: IPBlocker, agent: "VeriChainIDSAgentV3 | None" = None):
        self.server_url = server_url.rstrip("/")
        self.server_id = server_id
        self.api_key = api_key
        self.blocker = blocker
        self.agent = agent  # reference to parent agent for lock + detector access
        self.hub = None
        self._thread: threading.Thread | None = None
        self._running = False

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True, name="SignalR-Hub")
        self._thread.start()
        logger.info("[Hub] SignalR listener started (server_id=%s)", self.server_id)

    def stop(self) -> None:
        self._running = False
        if self.hub:
            try:
                self.hub.stop()
            except Exception:
                pass

    def _listen_loop(self) -> None:
        while self._running:
            try:
                self._connect_and_listen()
            except Exception:
                if not self._running:
                    break
                time.sleep(5)

    def _connect_and_listen(self) -> None:
        try:
            from signalrcore.hub_connection_builder import HubConnectionBuilder
        except ImportError:
            logger.warning("[Hub] signalrcore not installed - real-time commands disabled")
            self._running = False
            return

        self.hub = HubConnectionBuilder().with_url(
            f"{self.server_url}/hubs/agents",
            options={
                "headers": {
                    "X-API-Key": self.api_key,
                    "Authorization": f"Bearer {self.api_key}",
                },
                "skip_negotiation": False,
                "verify_ssl": True,
            },
        ).configure_logging(logging.WARNING).build()

        self.hub.on("ReceiveBlockCommand", self._on_block)
        self.hub.on("ReceiveUnblockCommand", self._on_unblock)

        self.hub.start()
        try:
            self.hub.send("JoinServerGroup", [self.server_id])
            logger.info("[Hub] Joined SignalR group: %s", self.server_id)
        except Exception as e:
            logger.warning("[Hub] Failed to join group: %s", e)

        while self._running:
            time.sleep(1)

    def _on_block(self, args: list[Any]) -> None:
        cmd = args[0] if args and isinstance(args[0], dict) else {}
        ip = cmd.get("ip") or (args[0] if args else None)
        if ip:
            # isTenantWide = true → lenh tenant-wide, agent block local
            is_tenant_wide = cmd.get("isTenantWide", False)
            if is_tenant_wide:
                logger.warning("[Hub] Nhan lenh block tenant-wide tu backend: %s", ip)
            else:
                logger.warning("[Hub] Nhan lenh block tu backend: %s", ip)
            ok = self.blocker.block(
                str(ip),
                str(cmd.get("reason", "Backend command")),
                str(cmd.get("attackType", "Unknown")),
                str(cmd.get("severity", "Medium")),
            )
            logger.info("[Hub] Ket qua block %s: %s", ip, "THANH CONG" if ok else "THAT BAI")

    def _on_unblock(self, args: list[Any]) -> None:
        ip = args[0] if args and isinstance(args[0], str) else (
            args[0].get("ip") if args and isinstance(args[0], dict) else None)
        if ip:
            logger.info("=" * 60)
            logger.info("[UNLOCK] NHAN LENH MO CHAN IP TU BACKEND")
            logger.info("[UNLOCK] IP: %s", ip)
            logger.info("[UNLOCK] Thoi gian: %s", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            logger.info("[UNLOCK] Server ID: %s", self.server_id or "N/A")
            logger.info("[UNLOCK] Dang thuc hien mo chan...")

            ok = self.blocker.unblock(str(ip))

            if ok:
                logger.info("[UNLOCK] ✓ MO CHAN THANH CONG - IP %s da duoc mo khoa", ip)
                logger.info("[UNLOCK] - Firewall rule da duoc xoa")
                logger.info("[UNLOCK] - IP da duoc loai khoi danh sach chan noi bo")
                # Ghi timestamp cooldown + xoa history de khong bi "dao dong" tu request cu
                if self.agent is not None:
                    with self.agent._lock:
                        self.agent._unblock_timestamps[str(ip)] = time.time()
                        if ip in self.agent.detector._history:
                            del self.agent.detector._history[ip]
                            logger.info("[UNLOCK] Da xoa history cua IP %s", ip)
                        cooldown = getattr(self.agent, "_unblock_cooldown_seconds", 5)
                        logger.info("[UNLOCK] Cooldown %ds bat dau cho IP %s", cooldown, ip)
                else:
                    logger.warning("[UNLOCK] Agent reference None - khong co cooldown/history cleanup")
            else:
                logger.warning("[UNLOCK] ✗ MO CHAN THAT BAI - Khong the mo khoa IP %s", ip)
                logger.warning("[UNLOCK] - Kiem tra quyen Administrator")
                logger.warning("[UNLOCK] - Kiem tra firewall rule ton tai")

            logger.info("=" * 60)


# ──────────────────────────────────────────────
#  System Metrics Collector
# ──────────────────────────────────────────────
@dataclass
class SystemMetrics:
    cpu_percent: float = 0.0
    ram_percent: float = 0.0
    ram_used_mb: int = 0
    ram_total_mb: int = 0
    disk_percent: float = 0.0
    network_bytes_sent: int = 0
    network_bytes_recv: int = 0
    uptime_seconds: int = 0
    hostname: str = ""
    os_name: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def _clamp_int(value: int, minimum: int = 0) -> int:
    return value if value >= minimum else minimum


class SystemCollector:
    def __init__(self, demo_mode: bool = False):
        self.demo_mode = demo_mode
        self._dns_cache: dict[str, str] = {}
        self._last_net: tuple[int, int] | None = None
        self._net_delta_sent = 0
        self._net_delta_recv = 0
        self._top_procs: list[dict[str, Any]] = []
        self._psutil = None
        self._try_psutil()

    def _try_psutil(self) -> None:
        try:
            import psutil as _p
            self._psutil = _p
        except ImportError:
            self._psutil = None

    def _get_local_ip(self) -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def collect_metrics(self) -> SystemMetrics:
        if self.demo_mode or self._psutil is None:
            self._top_procs = [{"Name": "nginx", "MemoryMb": 120, "User": "www-data"}]
            return SystemMetrics(
                cpu_percent=22.5, ram_percent=54.0, ram_used_mb=4096,
                ram_total_mb=8192, disk_percent=61.0,
                hostname=socket.gethostname(),
                os_name=platform.platform(),
            )

        cpu = self._psutil.cpu_percent(interval=0.1)
        ram = self._psutil.virtual_memory()
        disk_p = "C:\\" if platform.system().lower().startswith("win") else "/"
        disk = self._psutil.disk_usage(disk_p)
        net = self._psutil.net_io_counters()

        if self._last_net is None:
            self._net_delta_sent = self._net_delta_recv = 0
        else:
            self._net_delta_sent = _clamp_int(int(net.bytes_sent - self._last_net[0]))
            self._net_delta_recv = _clamp_int(int(net.bytes_recv - self._last_net[1]))
        self._last_net = (net.bytes_sent, net.bytes_recv)

        boot = self._psutil.boot_time()
        self._top_procs = self._snapshot_procs()

        return SystemMetrics(
            cpu_percent=cpu, ram_percent=ram.percent,
            ram_used_mb=int(ram.used / (1024 * 1024)),
            ram_total_mb=int(ram.total / (1024 * 1024)),
            disk_percent=disk.percent,
            network_bytes_sent=net.bytes_sent,
            network_bytes_recv=net.bytes_recv,
            uptime_seconds=int(time.time() - boot),
            hostname=socket.gethostname(),
            os_name=platform.platform(),
        )

    def _snapshot_procs(self) -> list[dict[str, Any]]:
        if self._psutil is None:
            return []
        procs = []
        for p in self._psutil.process_iter(["name", "username", "memory_info"]):
            try:
                info = p.info
                procs.append({
                    "Name": info.get("name") or "unknown",
                    "User": info.get("username") or "unknown",
                    "MemoryMb": int((info.get("memory_info", 0).rss or 0) / (1024 * 1024)),
                })
            except Exception:
                continue
        procs.sort(key=lambda x: x["MemoryMb"], reverse=True)
        return procs[:8]

    def collect_traffic(self, metrics: SystemMetrics, window: int) -> list[TrafficLogEntry]:
        if self.demo_mode or self._psutil is None:
            return self._demo_logs(metrics)
        return self._real_logs(metrics, window)

    def _real_logs(self, metrics: SystemMetrics, window: int) -> list[TrafficLogEntry]:
        local_ip = self._get_local_ip()
        hostname = metrics.hostname or socket.gethostname()
        groups: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"remote_ports": [], "local_ports": [], "statuses": Counter(),
                     "protocols": Counter(), "process_names": Counter(),
                     "users": Counter(), "cmdlines": [],
                     "tags": set(), "obs": 0, "dns": 0, "failed_login": 0})

        try:
            conns = self._psutil.net_connections(kind="inet")
        except Exception:
            return self._demo_logs(metrics)

        for conn in conns:
            try:
                if not conn.raddr:
                    continue
                remote_ip = str(conn.raddr.ip)
                if remote_ip in {local_ip, "127.0.0.1", "::1"}:
                    continue
                remote_port = int(getattr(conn.raddr, "port", 0) or 0)
                local_port = int(getattr(conn.laddr, "port", 0) or 0) if conn.laddr else 0
                protocol = "UDP" if getattr(conn, "type", 0) == socket.SOCK_DGRAM else "TCP"
                status = str(getattr(conn, "status", "") or "").upper()
                g = groups[remote_ip]
                g["obs"] += 1
                g["remote_ports"].append(remote_port)
                g["local_ports"].append(local_port)
                g["statuses"][status] += 1
                g["protocols"][protocol] += 1
                if local_port == 53 or remote_port == 53:
                    g["dns"] += 1
                if local_port in {22, 3389} and status not in {"ESTABLISHED", "LISTEN"}:
                    g["failed_login"] += 1
                if remote_port in SUSPICIOUS_PORTS or local_port in SUSPICIOUS_PORTS:
                    g["tags"].add("suspicious-port")
                if status in {"SYN_SENT", "SYN_RECV"}:
                    g["tags"].add("half-open")
                meta = self._process_meta(getattr(conn, "pid", None))
                if meta["name"]:
                    g["process_names"][meta["name"]] += 1
                if meta["user"]:
                    g["users"][meta["user"]] += 1
                if meta["cmdline"] and len(g["cmdlines"]) < 3:
                    g["cmdlines"].append(meta["cmdline"])
                g["tags"].update(meta["tags"])
            except Exception:
                continue

        if not groups:
            return self._demo_logs(metrics)

        total_w = sum(max(g["obs"], 1) for g in groups.values())
        logs: list[TrafficLogEntry] = []
        for rip, g in groups.items():
            w = max(g["obs"], 1) / max(total_w, 1)
            b_out = max(1, int(self._net_delta_sent * w))
            b_in = max(1, int(self._net_delta_recv * w))
            pk_out = max(g["obs"], int(max(b_out, 1) / 1200))
            pk_in = max(g["obs"], int(max(b_in, 1) / 1200))
            payload = self._build_payload(hostname, local_ip, rip, metrics, g, window)
            lp = Counter(g["local_ports"]).most_common(1)[0][0] if g["local_ports"] else None
            rp = Counter(g["remote_ports"]).most_common(1)[0][0] if g["remote_ports"] else None
            pr = g["protocols"].most_common(1)[0][0] if g["protocols"] else "TCP"
            logs.append(TrafficLogEntry(
                source_ip=rip, destination_ip=local_ip,
                source_port=rp, destination_port=lp, protocol=pr,
                bytes_in=b_in, bytes_out=b_out,
                packets_in=pk_in, packets_out=pk_out,
                request_count=max(g["obs"], 1),
                raw_payload=json.dumps(payload, ensure_ascii=True, separators=(",", ":")),
            ))
        return logs

    def _build_payload(self, hostname: str, local_ip: str, remote_ip: str,
                      metrics: SystemMetrics, data: dict, window: int) -> dict[str, Any]:
        rev_dns = self._reverse_dns(remote_ip)
        peer_cat = self._peer_category(remote_ip, local_ip)
        return {
            "schema": "verichainids.agent.v3.flow",
            "agentVersion": "3.0-hybrid",
            "hostname": hostname,
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "windowSeconds": window,
            "localIp": local_ip,
            "peerIp": remote_ip,
            "peerCategory": peer_cat,
            "reverseDns": rev_dns,
            "localPorts": sorted(set(p for p in data["local_ports"] if p)),
            "remotePorts": sorted(set(p for p in data["remote_ports"] if p)),
            "serviceHints": sorted({
                PORT_SERVICE_MAP.get(p, f"PORT-{p}") for p in data["local_ports"]
            })[:10],
            "statusSummary": dict(data["statuses"]),
            "processNames": [n for n, _ in data["process_names"].most_common(6)],
            "processUsers": [n for n, _ in data["users"].most_common(4)],
            "cmdlineSamples": data["cmdlines"][:3],
            "suspicionTags": sorted(data["tags"])[:12],
            "dnsQueryCount": data["dns"],
            "failedLoginHints": data["failed_login"],
            "system": {
                "cpuPercent": metrics.cpu_percent,
                "ramPercent": metrics.ram_percent,
                "diskPercent": metrics.disk_percent,
                "uptimeSeconds": metrics.uptime_seconds,
                "topProcesses": self._top_procs[:5],
            },
        }

    def _demo_logs(self, metrics: SystemMetrics) -> list[TrafficLogEntry]:
        local_ip = self._get_local_ip()
        samples = [
            ("111.222.33.44", 443, 80, "TCP", {"ESTABLISHED": 60, "SYN_SENT": 20}, ["python"], ["suspicious-port"]),
            ("198.51.100.23", 40222, 22, "TCP", {"SYN_SENT": 18}, ["sshd"], ["auth-surface"]),
            ("203.0.113.77", 55321, 53, "UDP", {"ESTABLISHED": 15}, ["dns"], ["dns-burst"]),
        ]
        logs = []
        for rip, rport, lport, proto, status, pnames, tags in samples:
            payload = self._build_payload(
                metrics.hostname, local_ip, rip, metrics,
                {"local_ports": [lport], "remote_ports": [rport],
                 "statuses": Counter(status), "process_names": Counter(pnames),
                 "users": Counter(["SYSTEM"]), "cmdlines": [f"{pnames[0]} demo"],
                 "tags": set(tags), "obs": sum(status.values()),
                 "dns": 10 if lport == 53 else 0, "failed_login": 12 if lport == 22 else 0},
                5,
            )
            logs.append(TrafficLogEntry(
                source_ip=rip, destination_ip=local_ip,
                source_port=rport, destination_port=lport, protocol=proto,
                bytes_in=3500, bytes_out=1500,
                packets_in=20, packets_out=28,
                request_count=sum(status.values()),
                raw_payload=json.dumps(payload, ensure_ascii=True, separators=(",", ":")),
            ))
        return logs

    def _process_meta(self, pid: int | None) -> dict[str, Any]:
        result: dict[str, Any] = {"name": "", "user": "", "cmdline": "", "tags": set()}
        if not pid or self._psutil is None:
            return result
        try:
            proc = self._psutil.Process(pid)
            name = str(proc.name() or "").lower()
            user = str(proc.username() or "")
            cmdline = " ".join(proc.cmdline()[:6])[:240]
            result["name"] = name
            result["user"] = user
            result["cmdline"] = cmdline
            if any(k in name for k in PROCESS_RISK_KEYWORDS):
                result["tags"].add("risky-process")
            if any(k in cmdline.lower() for k in PROCESS_RISK_KEYWORDS):
                result["tags"].add("risky-cmdline")
        except Exception:
            pass
        return result

    def _reverse_dns(self, ip: str) -> str:
        if ip in self._dns_cache:
            return self._dns_cache[ip]
        try:
            host = socket.gethostbyaddr(ip)[0]
        except Exception:
            host = ""
        self._dns_cache[ip] = host
        return host

    def _peer_category(self, peer_ip: str, local_ip: str) -> str:
        try:
            peer = ipaddress.ip_address(peer_ip)
            local = ipaddress.ip_address(local_ip)
            if peer.is_loopback:
                return "loopback"
            if peer.is_private and local.is_private:
                return "internal"
            if peer.is_private:
                return "private-external"
            return "external"
        except Exception:
            return "unknown"


# ──────────────────────────────────────────────
#  Main Agent
# ──────────────────────────────────────────────
class VeriChainIDSAgentV3:
    import winreg
    import sys
    import os

    # ──────────────────────────────────────────────
#  Main Agent
# ──────────────────────────────────────────────
class VeriChainIDSAgentV3:
    def _add_to_startup(self):
        """Tự động thêm Agent vào khởi động cùng Windows (Registry)"""
        if platform.system() != "Windows":
            return

        import winreg
        try:
            # Lấy đường dẫn file hiện tại
            script_path = os.path.realpath(sys.argv[0])
            
            # Nếu chạy file .py (chưa build exe) thì dùng pythonw để ẩn terminal
            if script_path.endswith(".py"):
                python_path = sys.executable.replace("python.exe", "pythonw.exe")
                cmd = f'"{python_path}" "{script_path}"'
            else:
                # Nếu đã build thành file .exe
                cmd = f'"{script_path}"'

            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, "VeriChainIDSAgent", 0, winreg.REG_SZ, cmd)
            winreg.CloseKey(key)
            logger.info("[Agent] Da tu dong dang ky Startup thành công.")
        except Exception as e:
            logger.warning(f"[Agent] Khong the tu dang ky Startup: {e}")

    def __init__(
        self,
        api_key: str,
        server_url: str = "http://localhost:5000",
        server_id: str = "",
        interval: int = DEFAULT_INTERVAL,
        batch_size: int = DEFAULT_BATCH_SIZE,
        demo_mode: bool = False,
        ssl_verify: bool = True,
    ):
        # Tự động đăng ký khi khởi tạo Agent
        self._add_to_startup()
        
        self.api_key = api_key
        self.server_url = server_url.rstrip("/")
        self.server_id = server_id
        self.interval = interval
        self.batch_size = batch_size
        self.demo_mode = demo_mode
        self.ssl_verify = ssl_verify

        local_ip = socket.gethostname()
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            local_ip = "127.0.0.1"

        self.collector = SystemCollector(demo_mode=demo_mode)
        self.detector = AttackDetector(local_ip=local_ip)
        self.blocker = IPBlocker(backend_url=server_url, api_key=api_key, server_id=server_id)
        self.hub: AgentHubListener | None = None
        self.health_server = HealthServer(self)
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": f"VeriChainIDSAgentV3/3.0 ({platform.system()})",
        })

        self._running = False
        self._lock = threading.Lock()
        self._stats: dict[str, Any] = {
            "total_sent": 0, "total_failed": 0,
            "total_attacks": 0, "total_blocked": 0,
            "distributed": 0, "start_time": None, "last_success": None,
        }
        self._recent_alerts: dict[str, datetime] = {}
        self._recent_distributed: deque[dict[str, Any]] = deque(maxlen=30)

        # Cooldown sau khi unblock - không chặn lại IP trong N giây
        self._unblock_timestamps: dict[str, float] = {}
        self._unblock_cooldown_seconds = 15

        # Callback để thông báo lỗi API key cho người dùng
        self._notification_callback = None
        self._api_key_error_notified = False

    @property
    def api_key_prefix(self) -> str:
        return self.api_key[:12] + "***" if len(self.api_key) > 12 else "***"

    def set_notification_callback(self, callback) -> None:
        """Set callback để gửi notification (từ main.py)"""
        self._notification_callback = callback

    def apply_api_key(self, new_key: str) -> None:
        """Đổi API key khi agent đang chạy (menu khay hệ thống)."""
        key = (new_key or "").strip()
        if not key:
            return
        with self._lock:
            self.api_key = key
        self.session.headers["X-API-Key"] = key
        self.blocker.api_key = key
        self.blocker.backend_url = self.server_url.rstrip("/")
        self.blocker.session.headers["X-API-Key"] = key

        if self.hub:
            try:
                self.hub.stop()
            except Exception:
                pass
            time.sleep(0.8)

        self.server_id = ""
        self._register()

        if self.server_id:
            if self.hub is None:
                self.hub = AgentHubListener(
                    self.server_url, self.server_id, self.api_key, self.blocker, agent=self
                )
            else:
                self.hub.api_key = self.api_key
                self.hub.server_id = self.server_id
            self.hub.start()
            logger.info("[Agent] SignalR khoi lai sau khi doi key")
        else:
            self.hub = None
            logger.warning("[Agent] Chua lay duoc server_id sau khi doi key")

        logger.info("[Agent] Da cap nhat API Key: %s", self.api_key_prefix)

    # ── Public API ──────────────────────────────
    def start(self) -> None:
        self._running = True
        self._stats["start_time"] = datetime.now(timezone.utc)

        self._print_start_banner()
        self._register()

        # Health check HTTP server — backend gọi GET http://localhost:17999/health
        self.health_server.start()

        # SignalR
        if self.server_id:
            self.hub = AgentHubListener(
                self.server_url, self.server_id, self.api_key, self.blocker, agent=self)
            self.hub.start()
        else:
            logger.warning("[Agent] Chua co server_id - SignalR real-time commands tat")

        threading.Thread(target=self._heartbeat_loop, daemon=True, name="Heartbeat").start()

        logger.info("[Agent] === Da san sang! Thu thap & gui logs ===")
        while self._running:
            try:
                self._cycle()
            except Exception as exc:
                logger.error("[Agent] Loi trong cycle: %s", exc)
                with self._lock:
                    self._stats["last_error"] = str(exc)
            time.sleep(self.interval)

    def stop(self) -> None:
        self._running = False
        if self.hub:
            self.hub.stop()
        self.health_server.stop()
        self.blocker.shutdown()
        logger.info("[Agent] Da dung.")

    def get_stats(self) -> dict[str, Any]:
        with self._lock:
            s = self._stats.copy()
            s["blocked_ips"] = list(self.blocker._blocked_ips)
            s["recent_distributed"] = list(self._recent_distributed)
            if s["start_time"]:
                s["uptime_seconds"] = (datetime.now(timezone.utc) - s["start_time"]).total_seconds()
            return s

    # ── Private ────────────────────────────────
    def _print_start_banner(self) -> None:
        logger.info("=" * 58)
        logger.info(" VeriChainIDS Agent v3.0 [%s]", datetime.now().strftime("%H:%M:%S"))
        logger.info(" Backend : %s", self.server_url)
        logger.info(" Key     : %s", self.api_key_prefix)
        logger.info(" Mode    : %s", "DEMO" if self.demo_mode else "LIVE")
        logger.info(" Interval: %ss", self.interval)
        logger.info(
            " AutoBlock: %s (nguong=%s)",
            "ON" if AUTO_BLOCK_ENABLED else "OFF",
            BLOCK_THRESHOLD_SCORE,
        )
        logger.info("=" * 58)

    def _register(self) -> None:
        """Kiểm tra backend + tự đăng ký server record nếu chưa có."""
        try:
            r = self.session.get(f"{self.server_url}/health", timeout=5, verify=self.ssl_verify)
            if r.status_code < 500:
                logger.info("[Agent] Backend online: %s", self.server_url)
        except requests.exceptions.SSLError as exc:
            logger.warning("[Agent] SSL error: %s -> disable verify", exc)
            self.ssl_verify = False
        except Exception as exc:
            logger.warning("[Agent] Backend khong phan hoi: %s", exc)

        if self.server_id:
            return

        # 1. Thử whoami trước (biết server_id rồi thì bỏ qua)
        try:
            r = self.session.get(f"{self.server_url}/api/agent/whoami", timeout=5, verify=self.ssl_verify)
            if r.status_code == 200:
                sid = r.json().get("data", {}).get("serverId")
                if sid:
                    self.server_id = str(sid)
                    logger.info("[Agent] Da lay server_id: %s", self.server_id)
                    if self.hub:
                        self.hub.server_id = self.server_id
                    return
        except Exception as exc:
            logger.warning("[Agent] /whoami that bai: %s", exc)

        # 2. Chưa có server_id → tự đăng ký
        hostname = socket.gethostname()
        local_ip = self._get_local_ip()

        # UUID v5 deterministic: namespace VeriChainIDS (fixed) + hostname + api_key prefix
        # dùng sha1 rồi lấy 16 bytes đầu cho UUID
        ns = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # DNS namespace
        seed = f"{hostname}:{self.api_key[:16]}".encode()
        raw = hashlib.sha1(ns.bytes + seed).digest()
        suggested_id = str(uuid.UUID(bytes=raw[:16], version=5))

        payload = {
            "serverId": suggested_id,
            "hostname": hostname,
            "ipAddress": local_ip,
            "os": f"{platform.system()} {platform.release()}",
            "healthUrl": f"http://{local_ip}:{HEALTH_PORT}",
        }

        try:
            r = self.session.post(
                f"{self.server_url}/api/agent/register",
                json=payload,
                timeout=10,
                verify=self.ssl_verify,
            )
            if r.status_code == 200:
                data = r.json()
                sid = data.get("data", {}).get("serverId")
                if sid:
                    self.server_id = str(sid)
                    msg = data.get("message", "")
                    logger.info("[Agent] Dang ky server OK — %s — server_id=%s", msg, self.server_id)
                    if self.hub:
                        self.hub.server_id = self.server_id
                else:
                    logger.warning("[Agent] /register tra 200 nhung khong co serverId: %s", data)
            else:
                logger.warning("[Agent] /register tra HTTP %d: %s", r.status_code, r.text[:200])
        except Exception as exc:
            logger.warning("[Agent] /register that bai: %s", exc)

    def _get_local_ip(self) -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(2)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _cycle(self) -> None:
        # Dọn unlock timestamps cũ (quá 2 tiếng)
        with self._lock:
            cutoff = time.time() - 7200
            expired = [ip for ip, ts in self._unblock_timestamps.items() if ts < cutoff]
            for ip in expired:
                del self._unblock_timestamps[ip]

        metrics = self.collector.collect_metrics()
        logs = self.collector.collect_traffic(metrics, self.interval)
        if not logs:
            return

        attacks = self.detector.analyze(logs)
        dist = self._detect_distributed(logs)
        all_attacks = attacks + dist

        if all_attacks:
            with self._lock:
                self._stats["total_attacks"] += len(all_attacks)
            for atk in all_attacks:
                logger.warning(
                    "[DETECT] %s (%s) score=%.2f | %s",
                    atk.attack_type, atk.severity, atk.score, atk.title,
                )
                if self._should_alert(atk):
                    self._send_alert(atk)
                if AUTO_BLOCK_ENABLED and atk.score >= BLOCK_THRESHOLD_SCORE:
                    self._auto_block(atk)

        # Gui logs
        for batch in [logs[i:i + self.batch_size] for i in range(0, len(logs), self.batch_size)]:
            payload = {
                "logs": [l.to_dict() for l in batch],
                "hostname": metrics.hostname,
                "os": metrics.os_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "agentVersion": "3.0-hybrid",
                "cpuPercent": metrics.cpu_percent,
                "ramPercent": metrics.ram_percent,
                "diskPercent": metrics.disk_percent,
            }
            ok = self._send_logs(payload)
            with self._lock:
                if ok:
                    self._stats["total_sent"] += len(batch)
                    self._stats["last_success"] = datetime.now(timezone.utc)
                else:
                    self._stats["total_failed"] += len(batch)

        # Status (file log; tray "Xem trạng thái" dùng get_stats)
        with self._lock:
            s = self._stats
        logger.debug(
            "%s Logs=%4d Attacks=%d Sent=%d Fail=%d Blocked=%d CPU=%.1f%% RAM=%.1f%% DISK=%.1f%%",
            datetime.now().strftime("%H:%M:%S"),
            len(logs),
            len(all_attacks),
            s["total_sent"],
            s["total_failed"],
            s["total_blocked"],
            metrics.cpu_percent,
            metrics.ram_percent,
            metrics.disk_percent,
        )

    def _detect_distributed(self, logs: list[TrafficLogEntry]) -> list[AttackSignature]:
        groups: dict[tuple, list[TrafficLogEntry]] = defaultdict(list)
        for log in logs:
            key = (log.destination_ip, log.destination_port, log.protocol)
            groups[key].append(log)

        attacks: list[AttackSignature] = []
        now = datetime.now(timezone.utc)

        for (dest_ip, dest_port, proto), grp in groups.items():
            sources = {l.source_ip for l in grp if l.source_ip}
            if len(sources) < DISTRIBUTED_SOURCE_THRESHOLD:
                continue
            total_req = sum(max(l.request_count, 1) for l in grp)
            if total_req < DISTRIBUTED_REQUEST_THRESHOLD:
                continue

            score = min(1.0, (len(sources) / 40.0) * 0.45 + (total_req / 2000.0) * 0.55)
            top_srcs = sorted(
                ((l.source_ip, l.request_count) for l in grp if l.source_ip),
                key=lambda x: x[1], reverse=True,
            )[:20]

            evidence = {
                "attack_scope": "distributed",
                "source_ips": [s for s, _ in top_srcs],
                "source_count": len(sources),
                "destination_ip": dest_ip,
                "destination_port": dest_port,
                "protocol": proto,
                "request_count": total_req,
                "top_talkers": [{"ip": s, "requestCount": r} for s, r in top_srcs],
                "detected_at": now.isoformat(),
            }
            sev = "Critical" if len(sources) >= 25 or total_req >= 1000 else "High"
            attacks.append(AttackSignature(
                "DDoS_Distributed", sev, score,
                f"Distributed DDoS on {dest_ip}:{dest_port} from {len(sources)} IPs",
                f"{len(sources)} sources, {total_req} requests.",
                "Impact", "T1498 - Network Denial of Service", evidence,
            ))
            with self._lock:
                self._stats["distributed"] += 1
            self._recent_distributed.append(evidence)

        return attacks

    def _should_alert(self, atk: AttackSignature) -> bool:
        key = f"{atk.attack_type}:{atk.evidence.get('source_ip', atk.evidence.get('destination_port', ''))}"
        now = datetime.now(timezone.utc)
        prev = self._recent_alerts.get(key)
        if prev and (now - prev) < timedelta(minutes=ALERT_DEDUP_MINUTES):
            return False
        self._recent_alerts[key] = now
        return True

    def _send_alert(self, atk: AttackSignature) -> None:
        try:
            r = self.session.post(
                f"{self.server_url}/api/alerts/trigger",
                json={
                    "alertType": atk.attack_type,
                    "severity": atk.severity,
                    "title": atk.title,
                    "description": atk.description,
                    "sourceIp": atk.evidence.get("source_ip", ""),
                    "mitreTactic": atk.mitre_tactic,
                    "mitreTechnique": atk.mitre_technique,
                    "anomalyScore": atk.score,
                    "recommendedAction": atk.description[:200],
                    "evidence": json.dumps(atk.evidence),
                    "blocked": AUTO_BLOCK_ENABLED and atk.score >= BLOCK_THRESHOLD_SCORE,
                },
                timeout=10, verify=self.ssl_verify,
            )
            logger.info("[ALERT] Gui alert thanh cong: %s (HTTP %d)", atk.title, r.status_code)
        except Exception as exc:
            logger.warning("[ALERT] Loi gui alert: %s", exc)

    def _auto_block(self, atk: AttackSignature) -> None:
        if atk.attack_type == "DDoS_Distributed":
            for ip in atk.evidence.get("source_ips", [])[:10]:
                # Skip nếu IP đang trong cooldown sau unlock
                with self._lock:
                    unlock_time = self._unblock_timestamps.get(ip, 0)
                    if unlock_time > 0 and (time.time() - unlock_time) < self._unblock_cooldown_seconds:
                        remaining = int(self._unblock_cooldown_seconds - (time.time() - unlock_time))
                        logger.info("[AUTO-BLOCK-SKIP] IP %s dang trong cooldown sau unlock (%ds con lai)", ip, remaining)
                        continue
                if self.blocker.block(ip, atk.title, atk.attack_type, atk.severity):
                    with self._lock:
                        self._stats["total_blocked"] += 1
            return
        ip = atk.evidence.get("source_ip", "")
        if not ip:
            return

        # Skip nếu IP đang trong cooldown sau unlock
        with self._lock:
            unlock_time = self._unblock_timestamps.get(ip, 0)
            if unlock_time > 0 and (time.time() - unlock_time) < self._unblock_cooldown_seconds:
                remaining = int(self._unblock_cooldown_seconds - (time.time() - unlock_time))
                logger.info("[AUTO-BLOCK-SKIP] IP %s dang trong cooldown sau unlock (%ds con lai)", ip, remaining)
                return

        if self.blocker.block(ip, atk.title, atk.attack_type, atk.severity):
            with self._lock:
                self._stats["total_blocked"] += 1

    def _send_logs(self, payload: dict[str, Any]) -> bool:
        for attempt in range(MAX_RETRIES):
            try:
                r = self.session.post(
                    f"{self.server_url}/api/logs/ingest",
                    json=payload, timeout=10, verify=self.ssl_verify,
                )
                if r.status_code == 200:
                    data = r.json()
                    if data.get("success"):
                        # Reset flag khi kết nối thành công trở lại
                        if self._api_key_error_notified:
                            logger.info("[INGEST] Ket noi thanh cong tro lai!")
                            self._api_key_error_notified = False
                        return True
                
                if r.status_code == 401:
                    # Parse response để biết lý do cụ thể
                    error_msg = "API Key không hợp lệ"
                    try:
                        error_data = r.json()
                        error_msg = error_data.get("message", error_msg)
                    except:
                        pass
                    
                    logger.error("[INGEST] API Key bi reject (401): %s", error_msg)
                    
                    # Thông báo cho người dùng (chỉ 1 lần)
                    if not self._api_key_error_notified and self._notification_callback:
                        self._api_key_error_notified = True
                        
                        # Xác định lý do cụ thể
                        if "expired" in error_msg.lower():
                            reason = "API Key đã HẾT HẠN"
                        elif "not found" in error_msg.lower() or "invalid" in error_msg.lower():
                            reason = "API Key KHÔNG TỒN TẠI (có thể đã bị xóa)"
                        elif "inactive" in error_msg.lower() or "disabled" in error_msg.lower():
                            reason = "API Key đã bị VÔ HIỆU HÓA"
                        else:
                            reason = "API Key KHÔNG HỢP LỆ"
                        
                        self._notification_callback(
                            "VeriChainIDS Agent - Lỗi API Key",
                            f"{reason}\n\n"
                            f"Agent không thể gửi logs lên server.\n\n"
                            f"Vui lòng:\n"
                            f"1. Kiểm tra API Key trong Dashboard\n"
                            f"2. Cập nhật API Key mới qua menu 'Đổi API Key'\n"
                            f"3. Hoặc khởi động lại agent với API Key mới"
                        )
                    
                    # CHỈ DỪNG KHI LỖI 401 (API key lỗi)
                    # Không dừng khi lỗi network (backend tắt)
                    self._running = False
                    return False
                    
            except requests.exceptions.SSLError:
                self.ssl_verify = False
            except requests.exceptions.ConnectionError as exc:
                # Backend tắt → KHÔNG dừng agent, chỉ log warning
                logger.warning("[INGEST] Backend chua san sang (lan %d): %s", attempt + 1, exc)
            except requests.exceptions.Timeout:
                # Timeout → KHÔNG dừng agent, chỉ log warning
                logger.warning("[INGEST] Timeout (lan %d)", attempt + 1)
            except Exception as exc:
                logger.error("[INGEST] Loi khong ro: %s", exc)
                return False
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
        
        # Retry hết → return False nhưng KHÔNG dừng agent
        # Agent sẽ tự động retry ở cycle tiếp theo (5 giây sau)
        return False

    def _heartbeat_loop(self) -> None:
        while self._running:
            time.sleep(HEARTBEAT_INTERVAL)
            try:
                with self._lock:
                    up = 0
                    if self._stats["start_time"]:
                        up = int((datetime.now(timezone.utc) - self._stats["start_time"]).total_seconds())
                logger.info(
                    "[HEARTBEAT] uptime=%ds sent=%d failed=%d attacks=%d blocked=%d distributed=%d",
                    up, self._stats["total_sent"], self._stats["total_failed"],
                    self._stats["total_attacks"], self._stats["total_blocked"],
                    self._stats["distributed"],
                )
            except Exception:
                pass