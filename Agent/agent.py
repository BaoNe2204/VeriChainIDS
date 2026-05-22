#!/usr/bin/env python3
"""
VeriChainIDS Agent v3 - Hybrid enterprise sensor

Combines:
- v2 rich telemetry collection
- v1 local attack detection, alerting, and auto-block
- distributed pressure detection for many-source attacks in a single cycle
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import logging
import os
import platform
import re
import socket
import subprocess
import sys
import threading
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

LOGGING_FORMAT = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=LOGGING_FORMAT,
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("VeriChainIDSAgentV3")

DISTRIBUTED_SOURCE_THRESHOLD = int(os.getenv("DISTRIBUTED_SOURCE_THRESHOLD", "12"))
DISTRIBUTED_REQUEST_THRESHOLD = int(os.getenv("DISTRIBUTED_REQUEST_THRESHOLD", "180"))
ALERT_DEDUP_MINUTES = int(os.getenv("ALERT_DEDUP_MINUTES", "5"))

try:
    from agent import (
        AgentHubListener,
        AttackDetector,
        AttackSignature,
        AUTO_BLOCK_ENABLED,
        BLOCK_THRESHOLD_SCORE,
        DEFAULT_BATCH_SIZE,
        DEFAULT_INTERVAL,
        HEARTBEAT_INTERVAL,
        IPBlocker,
        MAX_RETRIES,
        RETRY_DELAY,
        TrafficLogEntry,
    )
    from agent_v2 import EnhancedDataCollector
except Exception:
    DEFAULT_INTERVAL = 5
    DEFAULT_BATCH_SIZE = 100
    MAX_RETRIES = 3
    RETRY_DELAY = 5
    HEARTBEAT_INTERVAL = 30
    AUTO_BLOCK_ENABLED = os.getenv("AUTO_BLOCK", "true").lower() == "true"
    BLOCK_THRESHOLD_SCORE = float(os.getenv("BLOCK_THRESHOLD_SCORE", "0.75"))
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

    def is_trusted_ip(ip: str) -> bool:
        """Check if IP belongs to trusted networks (Google, Microsoft, AWS, GitHub, Cloudflare)"""
        try:
            ip_obj = ipaddress.ip_address(ip)
            return any(ip_obj in net for net in TRUSTED_NETWORKS)
        except ValueError:
            return False

    SQLI_PATTERNS = [
        r"UNION\s+(ALL\s+)?SELECT",
        r"DROP\s+(TABLE|DATABASE|INDEX)",
        r"WAITFOR\s+DELAY",
        r"BENCHMARK\s*\(",
        r"SLEEP\s*\(",
        r"('|\"|%)?(\bOR\b|\bAND\b).*(=|<|>)",
    ]
    XSS_PATTERNS = [
        r"<script[^>]*>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe[^>]*>",
        r"document\.cookie",
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

    class AttackDetector:
        def __init__(self, local_ip: str, backend_ip: str | None = None):
            self.local_ip = local_ip
            self.backend_ip = backend_ip
            self._history: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=120))
            self._lock = threading.Lock()

        def analyze(self, logs: list[TrafficLogEntry]) -> list[AttackSignature]:
            grouped: dict[str, list[TrafficLogEntry]] = defaultdict(list)
            # Whitelist: local IP, localhost, backend IP
            whitelist = {self.local_ip, "127.0.0.1", "::1", "localhost"}
            if self.backend_ip:
                whitelist.add(self.backend_ip)
            
            for log in logs:
                if log.source_ip and log.source_ip not in whitelist:
                    # Skip trusted networks (Google, Microsoft, AWS, GitHub, Cloudflare)
                    if is_trusted_ip(log.source_ip):
                        continue
                    grouped[log.source_ip].append(log)

            attacks: list[AttackSignature] = []
            for source_ip, ip_logs in grouped.items():
                attacks.extend(self._detect_for_ip(source_ip, ip_logs))
            return attacks

        def _detect_for_ip(self, source_ip: str, logs: list[TrafficLogEntry]) -> list[AttackSignature]:
            total_requests = sum(max(log.request_count, 1) for log in logs)
            total_bytes_in = sum(log.bytes_in for log in logs)
            total_bytes_out = sum(log.bytes_out for log in logs)
            total_packets_in = sum(log.packets_in for log in logs)
            total_packets_out = sum(log.packets_out for log in logs)
            ports = {log.destination_port for log in logs if log.destination_port}
            payloads = [log.raw_payload or "" for log in logs]
            avg_bytes = (total_bytes_in + total_bytes_out) / max(total_requests, 1)
            now = datetime.now(timezone.utc)

            with self._lock:
                self._history[source_ip].append({"time": now, "requests": total_requests, "ports": len(ports)})
                recent = [item for item in self._history[source_ip] if (now - item["time"]).total_seconds() < 600]
                self._history[source_ip] = deque(recent, maxlen=120)
            avg_recent_requests = sum(item["requests"] for item in recent) / max(len(recent), 1)

            attacks: list[AttackSignature] = []
            ddos_score = min(1.0, total_requests / 300.0 + avg_recent_requests / 800.0)
            if ddos_score >= 0.8 and any(port in {80, 443, 8080, 8443} for port in ports):
                attacks.append(AttackSignature("DDoS", "Critical", ddos_score, f"DDoS pressure from {source_ip}",
                                               f"High request density detected from {source_ip} with {total_requests} requests in this cycle.",
                                               "Impact", "T1498 - Network Denial of Service",
                                               {"source_ip": source_ip, "request_count": total_requests, "target_ports": sorted(ports)}))

            ssh_attempts = sum(max(log.request_count, 1) for log in logs if log.destination_port == 22)
            if ssh_attempts >= 12 and avg_bytes < 250:
                attacks.append(AttackSignature("BruteForce_SSH", "High", min(1.0, ssh_attempts / 20.0),
                                               f"SSH brute force from {source_ip}", "Repeated low-volume SSH attempts detected.",
                                               "Credential Access", "T1110 - Brute Force",
                                               {"source_ip": source_ip, "ssh_attempts": ssh_attempts}))

            if len(ports) >= 10 and total_requests <= len(ports) * 4:
                attacks.append(AttackSignature("PortScan", "Medium", min(1.0, len(ports) / 20.0),
                                               f"Port scan from {source_ip}", f"Wide port probing detected across {len(ports)} ports.",
                                               "Discovery", "T1016 - System Network Configuration Discovery",
                                               {"source_ip": source_ip, "ports_scanned": sorted(ports)}))

            payload_text = "\n".join(payloads[-30:])
            sqli_hits = sum(len(re.findall(pattern, payload_text, re.IGNORECASE)) for pattern in SQLI_PATTERNS)
            if sqli_hits > 0:
                attacks.append(AttackSignature("SQLInjection", "High", min(1.0, 0.7 + sqli_hits * 0.05),
                                               f"SQL injection indicators from {source_ip}",
                                               "Payload patterns match SQL injection probes.",
                                               "Initial Access", "T1190 - Exploit Public-Facing Application",
                                               {"source_ip": source_ip, "sqli_hits": sqli_hits}))

            xss_hits = sum(len(re.findall(pattern, payload_text, re.IGNORECASE)) for pattern in XSS_PATTERNS)
            if xss_hits > 0:
                attacks.append(AttackSignature("XSS", "Medium", min(1.0, 0.65 + xss_hits * 0.04),
                                               f"XSS indicators from {source_ip}",
                                               "Payload patterns match cross-site scripting attempts.",
                                               "Execution", "T1059 - Command and Scripting Interpreter",
                                               {"source_ip": source_ip, "xss_hits": xss_hits}))

            malware_hits = sum(len(re.findall(pattern, payload_text, re.IGNORECASE)) for pattern in MALWARE_PATTERNS)
            if malware_hits > 0 or any(port in SUSPICIOUS_PORTS for port in ports):
                attacks.append(AttackSignature("Malware", "High",
                                               min(1.0, 0.6 + malware_hits * 0.07 + (0.1 if any(port in SUSPICIOUS_PORTS for port in ports) else 0.0)),
                                               f"Malware-like behavior from {source_ip}",
                                               "Suspicious process or payload indicators were observed.",
                                               "Execution", "T1059 - Command and Scripting Interpreter",
                                               {"source_ip": source_ip, "malware_hits": malware_hits, "ports": sorted(ports)}))

            syn_ratio = total_packets_out / max(total_packets_in, 1)
            if syn_ratio >= 4.5 and total_packets_out >= 40:
                attacks.append(AttackSignature("SYN_Flood", "Critical", min(1.0, syn_ratio / 8.0),
                                               f"SYN flood indicators from {source_ip}",
                                               "Half-open style traffic suggests SYN flood behavior.",
                                               "Impact", "T1498 - Network Denial of Service",
                                               {"source_ip": source_ip, "syn_ratio": round(syn_ratio, 2)}))
            return attacks

    class IPBlocker:
        def __init__(self, backend_url: str, api_key: str):
            self.backend_url = backend_url.rstrip("/")
            self.api_key = api_key
            self.session = requests.Session()
            self.session.headers.update({"X-API-Key": api_key, "Content-Type": "application/json"})
            self._blocked_ips: set[str] = set()
            self._lock = threading.Lock()
            self._platform = platform.system()

        def block(self, ip: str, reason: str, attack_type: str, severity: str) -> bool:
            with self._lock:
                if ip in self._blocked_ips:
                    logger.info("[BLOCK] %s — da bi chan roi (bo qua)", ip)
                    return True
            logger.info("[BLOCK] Dang chan %s — %s | %s | %s", ip, attack_type, severity, reason[:40])
            local_ok = self._block_local(ip, reason)
            if local_ok:
                with self._lock:
                    self._blocked_ips.add(ip)
                logger.info("[BLOCK] %s — DA CHAN thanh cong (local firewall)", ip)
            else:
                logger.warning("[BLOCK] %s — THAT BAI (local firewall bi loi)", ip)
            self._report_block_to_backend(ip, attack_type, severity, reason, local_ok)
            return local_ok

        def unblock(self, ip: str) -> bool:
            logger.info("[UNBLOCK] Dang mo chan %s", ip)
            ok = self._unblock_local(ip)
            with self._lock:
                self._blocked_ips.discard(ip)
            if ok:
                logger.info("[UNBLOCK] %s — DA MO CHAN thanh cong", ip)
            else:
                logger.warning("[UNBLOCK] %s — THAT BAI (khong the mo chan local)", ip)
            return ok

        def _block_local(self, ip: str, reason: str) -> bool:
            if self._platform == "Windows":
                rule_name = f"VeriChainIDS_Block_{ip.replace('.', '_')}"
                cmd = ["netsh", "advfirewall", "firewall", "add", "rule", f"name={rule_name}", "dir=in", "action=block", f"remoteip={ip}", "protocol=any", f"description=VeriChainIDS:{reason[:60]}"]
            else:
                cmd = ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                return result.returncode == 0
            except Exception:
                return False

        def _unblock_local(self, ip: str) -> bool:
            if self._platform == "Windows":
                rule_name = f"VeriChainIDS_Block_{ip.replace('.', '_')}"
                cmd = ["netsh", "advfirewall", "firewall", "delete", "rule", f"name={rule_name}"]
            else:
                cmd = ["iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                return result.returncode == 0
            except Exception:
                return False

        def _report_block_to_backend(self, ip: str, attack_type: str, severity: str, reason: str, success: bool) -> None:
            try:
                self.session.post(
                    f"{self.backend_url}/api/defense/block-ip",
                    json={"ip": ip, "attackType": attack_type, "severity": severity, "reason": reason, "score": 1.0, "blockedBy": "Agent-V3", "blockDurationMinutes": 60},
                    timeout=10,
                )
            except Exception:
                pass

    class AgentHubListener:
        def __init__(self, server_url: str, server_id: str, api_key: str, ip_blocker: "IPBlocker"):
            self.server_url = server_url.rstrip("/")
            self.server_id = server_id
            self.api_key = api_key
            self.blocker = ip_blocker
            self.hub = None
            self._thread: threading.Thread | None = None
            self._running = False

        def start(self) -> None:
            if self._running:
                return
            self._running = True
            self._thread = threading.Thread(target=self._listen_loop, daemon=True)
            self._thread.start()

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
                logger.warning("[HubListener] signalrcore not installed")
                return
            self.hub = HubConnectionBuilder().with_url(
                f"{self.server_url}/hubs/agents",
                options={"headers": {"X-API-Key": self.api_key, "Authorization": f"Bearer {self.api_key}"}, "skip_negotiation": False, "verify_ssl": True},
            ).configure_logging(logging.WARNING).build()
            self.hub.on("ReceiveBlockCommand", self._on_block_command)
            self.hub.on("ReceiveUnblockCommand", self._on_unblock_command)
            self.hub.start()
            try:
                self.hub.send("JoinServerGroup", [self.server_id])
            except Exception:
                pass
            while self._running:
                time.sleep(1)

        def _on_block_command(self, args: list[Any]) -> None:
            cmd = args[0] if args and isinstance(args[0], dict) else {}
            ip = cmd.get("ip") or (args[0] if args else None)
            if ip:
                # Tenant-wide block command: apply locally regardless of serverId
                # isTenantWide = true means this agent should block locally (tenant-wide scope)
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

        def _on_unblock_command(self, args: list[Any]) -> None:
            ip = args[0] if args and isinstance(args[0], str) else (args[0].get("ip") if args and isinstance(args[0], dict) else None)
            if ip:
                logger.info("[Hub] Unblock command tu backend: %s", ip)
                ok = self.blocker.unblock(str(ip))
                logger.info("[Hub] Ket qua unblock %s: %s", ip, "THANH CONG" if ok else "THAT BAI")

    def clamp_int(value: int, minimum: int = 0) -> int:
        return value if value >= minimum else minimum

    class EnhancedDataCollector:
        def __init__(self, demo_mode: bool = False):
            self.demo_mode = demo_mode
            self._dns_cache: dict[str, str] = {}
            self._last_net_io: tuple[int, int] | None = None
            self._net_delta_sent = 0
            self._net_delta_recv = 0
            self._top_processes: list[dict[str, Any]] = []
            self._try_import_psutil()

        def _try_import_psutil(self) -> None:
            try:
                import psutil
                self.psutil = psutil
            except ImportError:
                self.psutil = None

        def collect_system_metrics(self) -> SystemMetrics:
            if self.demo_mode or self.psutil is None:
                self._top_processes = [{"name": "nginx", "memoryMb": 120, "user": "www-data"}, {"name": "sshd", "memoryMb": 48, "user": "root"}]
                return SystemMetrics(cpu_percent=22.5, ram_percent=54.0, ram_used_mb=4096, ram_total_mb=8192, disk_percent=61.0, network_bytes_sent=0, network_bytes_recv=0, uptime_seconds=7200, hostname=socket.gethostname(), os_name=platform.platform())

            cpu = self.psutil.cpu_percent(interval=0.1)
            ram = self.psutil.virtual_memory()
            disk_path = "C:\\" if platform.system().lower().startswith("win") else "/"
            disk = self.psutil.disk_usage(disk_path)
            net = self.psutil.net_io_counters()
            boot_time = self.psutil.boot_time()
            if self._last_net_io is None:
                self._net_delta_sent = 0
                self._net_delta_recv = 0
            else:
                self._net_delta_sent = clamp_int(net.bytes_sent - self._last_net_io[0])
                self._net_delta_recv = clamp_int(net.bytes_recv - self._last_net_io[1])
            self._last_net_io = (net.bytes_sent, net.bytes_recv)
            self._top_processes = self._snapshot_top_processes()
            return SystemMetrics(cpu_percent=cpu, ram_percent=ram.percent, ram_used_mb=int(ram.used / (1024 * 1024)), ram_total_mb=int(ram.total / (1024 * 1024)), disk_percent=disk.percent, network_bytes_sent=net.bytes_sent, network_bytes_recv=net.bytes_recv, uptime_seconds=int(time.time() - boot_time), hostname=socket.gethostname(), os_name=platform.platform())

        def collect_traffic_logs(self, metrics: SystemMetrics, window_seconds: int) -> list[TrafficLogEntry]:
            if self.demo_mode or self.psutil is None:
                return self._generate_demo_logs(metrics, window_seconds)
            return self._collect_real_logs(metrics, window_seconds)

        def _snapshot_top_processes(self) -> list[dict[str, Any]]:
            top: list[dict[str, Any]] = []
            if self.psutil is None:
                return top
            for proc in self.psutil.process_iter(["name", "username", "memory_info"]):
                try:
                    info = proc.info
                    top.append({"name": info.get("name") or "unknown", "user": info.get("username") or "unknown", "memoryMb": int((info.get("memory_info").rss if info.get("memory_info") else 0) / (1024 * 1024))})
                except Exception:
                    continue
            top.sort(key=lambda item: item.get("memoryMb", 0), reverse=True)
            return top[:8]

        def _collect_real_logs(self, metrics: SystemMetrics, window_seconds: int) -> list[TrafficLogEntry]:
            local_ip = self._get_local_ip()
            hostname = metrics.hostname or socket.gethostname()
            groups: dict[str, dict[str, Any]] = defaultdict(lambda: {"remote_ports": [], "local_ports": [], "statuses": Counter(), "protocols": Counter(), "process_names": Counter(), "users": Counter(), "cmdlines": [], "tags": set(), "observations": 0, "dns_query_count": 0, "failed_login_hints": 0})
            try:
                connections = self.psutil.net_connections(kind="inet")
            except Exception:
                return self._generate_demo_logs(metrics, window_seconds)

            for conn in connections:
                try:
                    if not conn.raddr:
                        continue
                    remote_ip = str(conn.raddr.ip)
                    if remote_ip in {"127.0.0.1", "::1", local_ip}:
                        continue
                    remote_port = int(getattr(conn.raddr, "port", 0) or 0)
                    local_port = int(getattr(conn.laddr, "port", 0) or 0) if conn.laddr else 0
                    protocol = "UDP" if getattr(conn, "type", 0) == socket.SOCK_DGRAM else "TCP"
                    status = str(getattr(conn, "status", "") or "UNKNOWN").upper()
                    group = groups[remote_ip]
                    group["observations"] += 1
                    group["remote_ports"].append(remote_port)
                    group["local_ports"].append(local_port)
                    group["statuses"][status] += 1
                    group["protocols"][protocol] += 1
                    if local_port == 53 or remote_port == 53:
                        group["dns_query_count"] += 1
                    if local_port in {22, 3389} and status not in {"ESTABLISHED", "LISTEN"}:
                        group["failed_login_hints"] += 1
                    if remote_port in SUSPICIOUS_PORTS or local_port in SUSPICIOUS_PORTS:
                        group["tags"].add("suspicious-port")
                    if status in {"SYN_SENT", "SYN_RECV"}:
                        group["tags"].add("half-open")
                    meta = self._get_process_meta(getattr(conn, "pid", None))
                    if meta["name"]:
                        group["process_names"][meta["name"]] += 1
                    if meta["user"]:
                        group["users"][meta["user"]] += 1
                    if meta["cmdline"] and len(group["cmdlines"]) < 3:
                        group["cmdlines"].append(meta["cmdline"])
                    group["tags"].update(meta["tags"])
                except Exception:
                    continue

            if not groups:
                return self._generate_demo_logs(metrics, window_seconds)

            total_weight = sum(max(1, item["observations"]) for item in groups.values())
            logs: list[TrafficLogEntry] = []
            for remote_ip, data in groups.items():
                weight = max(1, data["observations"]) / max(total_weight, 1)
                bytes_out = max(1, int(self._net_delta_sent * weight))
                bytes_in = max(1, int(self._net_delta_recv * weight))
                packets_out = max(data["observations"], int(max(bytes_out, 1) / 1200))
                packets_in = max(data["observations"], int(max(bytes_in, 1) / 1200))
                payload = self._build_payload(hostname, local_ip, remote_ip, metrics, data, window_seconds)
                local_port = Counter(data["local_ports"]).most_common(1)[0][0] if data["local_ports"] else None
                remote_port = Counter(data["remote_ports"]).most_common(1)[0][0] if data["remote_ports"] else None
                protocol = data["protocols"].most_common(1)[0][0] if data["protocols"] else "TCP"
                logs.append(TrafficLogEntry(source_ip=remote_ip, destination_ip=local_ip, source_port=remote_port, destination_port=local_port, protocol=protocol, bytes_in=bytes_in, bytes_out=bytes_out, packets_in=packets_in, packets_out=packets_out, request_count=max(1, data["observations"]), raw_payload=json.dumps(payload, ensure_ascii=True, separators=(",", ":"))))
            return logs

        def _build_payload(
            self,
            hostname: str,
            local_ip: str,
            remote_ip: str,
            metrics: SystemMetrics,
            data: dict[str, Any],
            window_seconds: int,
        ) -> dict[str, Any]:
            reverse_dns = self._reverse_dns(remote_ip)
            peer_category = self._peer_category(remote_ip, local_ip)
            service_hints = sorted({
                PORT_SERVICE_MAP.get(port, f"PORT-{port}")
                for port in data["local_ports"]
                if port
            })
            return {
                "schema": "verichainids.agent.v3.flow",
                "agentVersion": "3.0-hybrid",
                "hostname": hostname,
                "observedAt": datetime.now(timezone.utc).isoformat(),
                "windowSeconds": window_seconds,
                "localIp": local_ip,
                "peerIp": remote_ip,
                "peerCategory": peer_category,
                "reverseDns": reverse_dns,
                "localPorts": sorted(set(p for p in data["local_ports"] if p)),
                "remotePorts": sorted(set(p for p in data["remote_ports"] if p)),
                "serviceHints": service_hints[:10],
                "statusSummary": dict(data["statuses"]),
                "processNames": [name for name, _ in data["process_names"].most_common(6)],
                "processUsers": [name for name, _ in data["users"].most_common(4)],
                "cmdlineSamples": data["cmdlines"][:3],
                "suspicionTags": sorted(data["tags"])[:12],
                "dnsQueryCount": data["dns_query_count"],
                "failedLoginHints": data["failed_login_hints"],
                "system": {
                    "cpuPercent": metrics.cpu_percent,
                    "ramPercent": metrics.ram_percent,
                    "diskPercent": metrics.disk_percent,
                    "uptimeSeconds": metrics.uptime_seconds,
                    "topProcesses": self._top_processes[:5],
                },
            }

        def _generate_demo_logs(self, metrics: SystemMetrics, window_seconds: int) -> list[TrafficLogEntry]:
            local_ip = self._get_local_ip()
            samples = [
                ("111.222.33.44", 443, 80, "TCP", {"ESTABLISHED": 60, "SYN_SENT": 20}, ["python", "powershell"], ["suspicious-port", "half-open"]),
                ("198.51.100.23", 40222, 22, "TCP", {"SYN_SENT": 18, "TIME_WAIT": 9}, ["sshd"], ["auth-surface"]),
                ("203.0.113.77", 55321, 53, "UDP", {"ESTABLISHED": 15}, ["dns"], ["dns-burst"]),
            ]
            logs: list[TrafficLogEntry] = []
            for remote_ip, remote_port, local_port, protocol, status_summary, process_names, tags in samples:
                payload = {
                    "schema": "verichainids.agent.v3.flow",
                    "agentVersion": "3.0-hybrid",
                    "hostname": metrics.hostname,
                    "observedAt": datetime.now(timezone.utc).isoformat(),
                    "windowSeconds": window_seconds,
                    "localIp": local_ip,
                    "peerIp": remote_ip,
                    "peerCategory": "external",
                    "reverseDns": "",
                    "localPorts": [local_port],
                    "remotePorts": [remote_port],
                    "serviceHints": [PORT_SERVICE_MAP.get(local_port, f"PORT-{local_port}")],
                    "statusSummary": status_summary,
                    "processNames": process_names,
                    "processUsers": ["SYSTEM"],
                    "cmdlineSamples": [f"{process_names[0]} demo"],
                    "suspicionTags": tags,
                    "dnsQueryCount": 10 if local_port == 53 else 0,
                    "failedLoginHints": 12 if local_port == 22 else 0,
                    "system": {
                        "cpuPercent": metrics.cpu_percent,
                        "ramPercent": metrics.ram_percent,
                        "diskPercent": metrics.disk_percent,
                        "uptimeSeconds": metrics.uptime_seconds,
                        "topProcesses": self._top_processes[:3],
                    },
                }
                logs.append(TrafficLogEntry(source_ip=remote_ip, destination_ip=local_ip, source_port=remote_port, destination_port=local_port, protocol=protocol, bytes_in=3500, bytes_out=1500, packets_in=20, packets_out=28, request_count=sum(status_summary.values()), raw_payload=json.dumps(payload, ensure_ascii=True, separators=(",", ":"))))
            return logs

        def _get_local_ip(self) -> str:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.connect(("8.8.8.8", 80))
                ip = sock.getsockname()[0]
                sock.close()
                return ip
            except Exception:
                return "127.0.0.1"

        def _get_process_meta(self, pid: int | None) -> dict[str, Any]:
            result = {"name": "", "user": "", "cmdline": "", "tags": set()}
            if not pid or self.psutil is None:
                return result
            try:
                proc = self.psutil.Process(pid)
                name = str(proc.name() or "").lower()
                user = str(proc.username() or "")
                cmdline = " ".join(proc.cmdline()[:6])[:240]
                result["name"] = name
                result["user"] = user
                result["cmdline"] = cmdline
                if any(keyword in name for keyword in PROCESS_RISK_KEYWORDS):
                    result["tags"].add("risky-process")
                if any(keyword in cmdline.lower() for keyword in PROCESS_RISK_KEYWORDS):
                    result["tags"].add("risky-cmdline")
            except Exception:
                return result
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


class VeriChainIDSAgentV3:
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
        self.api_key = api_key
        self.server_url = server_url.rstrip("/")
        self.server_id = server_id
        self.interval = interval
        self.batch_size = batch_size
        self.demo_mode = demo_mode
        self.ssl_verify = ssl_verify

        self.collector = EnhancedDataCollector(demo_mode=demo_mode)
        local_ip = self.collector._get_local_ip()
        
        # Extract backend IP from server_url to whitelist it
        backend_ip = self._extract_backend_ip(server_url)
        if backend_ip:
            logger.info("Backend IP detected: %s (will be whitelisted)", backend_ip)
        
        self.detector = AttackDetector(local_ip=local_ip, backend_ip=backend_ip)
        self.blocker = IPBlocker(backend_url=server_url, api_key=api_key)
        self.hub_listener: AgentHubListener | None = None
        self.session = requests.Session()
        self.session.headers.update(
            {
                "X-API-Key": api_key,
                "Content-Type": "application/json",
                "User-Agent": f"VeriChainIDSAgentV3/3.0 ({platform.system()})",
            }
        )

        self._running = False
        self._lock = threading.Lock()
        self._stats = {
            "total_sent": 0,
            "total_failed": 0,
            "total_attacks_detected": 0,
            "total_ips_blocked": 0,
            "distributed_events": 0,
            "start_time": None,
            "last_success": None,
            "last_error": None,
        }
        self._recent_alerts: dict[str, datetime] = {}
        self._recent_distributed: deque[dict[str, Any]] = deque(maxlen=30)

    @property
    def api_key_prefix(self) -> str:
        return self.api_key[:12] + "***" if len(self.api_key) > 12 else "***"

    def _extract_backend_ip(self, url: str) -> str | None:
        """Extract IP address from backend URL for whitelisting."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            hostname = parsed.hostname
            if not hostname:
                return None
            # Check if hostname is already an IP
            try:
                ipaddress.ip_address(hostname)
                return hostname
            except ValueError:
                # Hostname is a domain, resolve it
                try:
                    return socket.gethostbyname(hostname)
                except Exception:
                    return None
        except Exception:
            return None

    def start(self) -> None:
        self._running = True
        self._stats["start_time"] = datetime.now(timezone.utc)

        logger.info("=" * 60)
        logger.info(" VeriChainIDS Agent v3 - HYBRID STARTING")
        logger.info(" API Key: %s", self.api_key_prefix)
        logger.info(" Server URL: %s", self.server_url)
        logger.info(" Interval: %ss", self.interval)
        logger.info(" Demo Mode: %s", "ON" if self.demo_mode else "OFF")
        logger.info(" Auto-Block: %s", "ENABLED" if AUTO_BLOCK_ENABLED else "DISABLED")
        logger.info(" Distributed Detection: ENABLED")
        logger.info("=" * 60)

        self._register_agent()

        if self.server_id:
            self.hub_listener = AgentHubListener(
                server_url=self.server_url,
                server_id=self.server_id,
                api_key=self.api_key,
                ip_blocker=self.blocker,
            )
            self.hub_listener.start()
        else:
            logger.warning("[HubListener] No server_id provided - SignalR push disabled")

        threading.Thread(target=self._heartbeat_loop, daemon=True).start()

        while self._running:
            try:
                self._collect_and_send()
            except Exception as exc:
                logger.error("Fatal error in main loop: %s", exc)
                with self._lock:
                    self._stats["last_error"] = str(exc)
            time.sleep(self.interval)

    def stop(self) -> None:
        self._running = False
        if self.hub_listener:
            self.hub_listener.stop()

    def _register_agent(self) -> None:
        try:
            response = self.session.get(
                f"{self.server_url}/health",
                timeout=5,
                verify=self.ssl_verify,
            )
            if response.status_code < 500:
                logger.info("Backend connection verified: %s", self.server_url)
        except requests.exceptions.SSLError as exc:
            logger.warning("SSL verification failed: %s. Retrying without verify.", exc)
            self.ssl_verify = False
        except Exception as exc:
            logger.warning("Backend health check failed: %s", exc)

    def _collect_and_send(self) -> None:
        metrics = self.collector.collect_system_metrics()
        logs = self.collector.collect_traffic_logs(metrics, self.interval)
        if not logs:
            logger.debug("No logs collected this cycle")
            return

        local_attacks = self.detector.analyze(logs)
        distributed_attacks = self._detect_distributed_pressure(logs)
        all_attacks = self._merge_attacks(local_attacks, distributed_attacks)

        if all_attacks:
            with self._lock:
                self._stats["total_attacks_detected"] += len(all_attacks)
            logger.warning(
                "[DETECTION] Found %s attack(s): %s",
                len(all_attacks),
                [attack.attack_type for attack in all_attacks],
            )

        for attack in all_attacks:
            if self._should_emit_alert(attack):
                self._send_attack_alert(attack)
            if AUTO_BLOCK_ENABLED and attack.score >= BLOCK_THRESHOLD_SCORE:
                self._block_from_attack(attack)

        batches = [logs[i:i + self.batch_size] for i in range(0, len(logs), self.batch_size)]
        for batch in batches:
            payload = {
                "logs": [log.to_dict() for log in batch],
                "hostname": metrics.hostname,
                "os": metrics.os_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "agentVersion": "3.0-hybrid",
                "cpuPercent": metrics.cpu_percent,
                "ramPercent": metrics.ram_percent,
                "diskPercent": metrics.disk_percent,
            }
            logger.debug("[METRICS] Sending: CPU=%.1f%% RAM=%.1f%% DISK=%.1f%%", 
                        metrics.cpu_percent, metrics.ram_percent, metrics.disk_percent)
            success = self._send_with_retry(payload)
            with self._lock:
                if success:
                    self._stats["total_sent"] += len(batch)
                    self._stats["last_success"] = datetime.now(timezone.utc)
                else:
                    self._stats["total_failed"] += len(batch)

        logger.info(
            "[%s] Sent %s logs | attacks=%s | CPU %.1f%% | RAM %.1f%% | DISK %.1f%%",
            datetime.now().strftime("%H:%M:%S"),
            len(logs),
            len(all_attacks),
            metrics.cpu_percent,
            metrics.ram_percent,
            metrics.disk_percent,
        )

    def _detect_distributed_pressure(self, logs: list[TrafficLogEntry]) -> list[AttackSignature]:
        grouped: dict[tuple[str | None, int | None, str | None], list[TrafficLogEntry]] = defaultdict(list)
        for log in logs:
            key = (log.destination_ip, log.destination_port, log.protocol)
            grouped[key].append(log)

        attacks: list[AttackSignature] = []
        now = datetime.now(timezone.utc)

        for (destination_ip, destination_port, protocol), group in grouped.items():
            unique_sources = {log.source_ip for log in group if log.source_ip}
            if len(unique_sources) < DISTRIBUTED_SOURCE_THRESHOLD:
                continue

            total_requests = sum(max(log.request_count, 1) for log in group)
            if total_requests < DISTRIBUTED_REQUEST_THRESHOLD:
                continue

            average_score = min(1.0, (len(unique_sources) / 40.0) * 0.45 + (total_requests / 2000.0) * 0.55)
            top_sources = sorted(
                (
                    (log.source_ip, log.request_count)
                    for log in group
                    if log.source_ip
                ),
                key=lambda item: item[1],
                reverse=True,
            )[:20]

            evidence = {
                "attack_scope": "distributed",
                "source_ips": [src for src, _ in top_sources],
                "source_count": len(unique_sources),
                "destination_ip": destination_ip,
                "destination_port": destination_port,
                "protocol": protocol,
                "request_count": total_requests,
                "top_talkers": [{"ip": src, "requestCount": req} for src, req in top_sources],
                "detected_at": now.isoformat(),
            }

            severity = "Critical" if len(unique_sources) >= 25 or total_requests >= 1000 else "High"
            attacks.append(
                AttackSignature(
                    attack_type="DDoS_Distributed",
                    severity=severity,
                    score=average_score,
                    title=f"Distributed DDoS pressure on port {destination_port} from {len(unique_sources)} IPs",
                    description=(
                        f"Many-source pressure detected against {destination_ip}:{destination_port} "
                        f"over protocol {protocol}. {len(unique_sources)} sources generated {total_requests} requests."
                    ),
                    mitre_tactic="Impact",
                    mitre_technique="T1498 - Network Denial of Service",
                    evidence=evidence,
                )
            )
            with self._lock:
                self._stats["distributed_events"] += 1
            self._recent_distributed.append(evidence)

        return attacks

    def _merge_attacks(
        self,
        local_attacks: list[AttackSignature],
        distributed_attacks: list[AttackSignature],
    ) -> list[AttackSignature]:
        merged: list[AttackSignature] = list(local_attacks)
        for distributed in distributed_attacks:
            merged.append(distributed)
            source_ips = distributed.evidence.get("source_ips", [])
            for source_ip in source_ips[:10]:
                merged.append(
                    AttackSignature(
                        attack_type="DDoS_Node",
                        severity=distributed.severity,
                        score=min(1.0, distributed.score + 0.05),
                        title=f"DDoS participant detected: {source_ip}",
                        description=f"{source_ip} appears to participate in distributed pressure observed this cycle.",
                        mitre_tactic="Impact",
                        mitre_technique="T1498 - Network Denial of Service",
                        evidence={
                            "source_ip": source_ip,
                            "destination_ip": distributed.evidence.get("destination_ip"),
                            "destination_port": distributed.evidence.get("destination_port"),
                            "source_count": distributed.evidence.get("source_count"),
                            "request_count": distributed.evidence.get("request_count"),
                            "parent_attack": "DDoS_Distributed",
                        },
                    )
                )
        return merged

    def _should_emit_alert(self, attack: AttackSignature) -> bool:
        attack_key = f"{attack.attack_type}:{attack.evidence.get('source_ip') or attack.evidence.get('destination_port')}"
        now = datetime.now(timezone.utc)
        previous = self._recent_alerts.get(attack_key)
        if previous and (now - previous) < timedelta(minutes=ALERT_DEDUP_MINUTES):
            return False
        self._recent_alerts[attack_key] = now
        return True

    def _block_from_attack(self, attack: AttackSignature) -> None:
        if attack.attack_type == "DDoS_Distributed":
            for source_ip in attack.evidence.get("source_ips", [])[:10]:
                success = self.blocker.block(
                    ip=source_ip,
                    reason=attack.title,
                    attack_type=attack.attack_type,
                    severity=attack.severity,
                )
                if success:
                    with self._lock:
                        self._stats["total_ips_blocked"] += 1
            return

        ip = attack.evidence.get("source_ip", "")
        if not ip:
            return
        success = self.blocker.block(
            ip=ip,
            reason=attack.title,
            attack_type=attack.attack_type,
            severity=attack.severity,
        )
        if success:
            with self._lock:
                self._stats["total_ips_blocked"] += 1

    def _send_attack_alert(self, attack: AttackSignature) -> None:
        try:
            payload = {
                "alertType": attack.attack_type,
                "severity": attack.severity,
                "title": attack.title,
                "description": attack.description,
                "sourceIp": attack.evidence.get("source_ip", ""),
                "mitreTactic": attack.mitre_tactic,
                "mitreTechnique": attack.mitre_technique,
                "anomalyScore": attack.score,
                "recommendedAction": f"Hybrid agent analysis | {attack.description}",
                "evidence": json.dumps(attack.evidence),
                "blocked": AUTO_BLOCK_ENABLED and attack.score >= BLOCK_THRESHOLD_SCORE,
            }
            response = self.session.post(
                f"{self.server_url}/api/alerts/trigger",
                json=payload,
                timeout=10,
                verify=self.ssl_verify,
            )
            if response.status_code == 200:
                logger.info("[ALERT] Sent to backend: %s", attack.title)
            else:
                logger.warning("[ALERT] Backend rejected: %s", response.status_code)
        except Exception as exc:
            logger.error("[ALERT] Failed to send alert: %s", exc)

    def _send_with_retry(self, payload: dict[str, Any]) -> bool:
        for attempt in range(MAX_RETRIES):
            try:
                response = self.session.post(
                    f"{self.server_url}/api/logs/ingest",
                    json=payload,
                    timeout=10,
                    verify=self.ssl_verify,
                )
                if response.status_code == 200:
                    data = response.json()
                    return bool(data.get("success"))
                if response.status_code == 401:
                    logger.error("API Key rejected (401 Unauthorized)")
                    with self._lock:
                        self._stats["last_error"] = "401 Unauthorized"
                    return False
                logger.warning("Request failed: %s", response.status_code)
            except requests.exceptions.SSLError:
                logger.warning("SSL error on attempt %s, retrying without verify...", attempt + 1)
                self.ssl_verify = False
            except requests.exceptions.ConnectionError as exc:
                logger.warning("Connection error on attempt %s: %s", attempt + 1, exc)
            except requests.exceptions.Timeout:
                logger.warning("Request timeout on attempt %s", attempt + 1)
            except Exception as exc:
                logger.error("Unexpected error sending logs: %s", exc)
                with self._lock:
                    self._stats["last_error"] = str(exc)
                return False

            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
        return False

    def _heartbeat_loop(self) -> None:
        while self._running:
            time.sleep(HEARTBEAT_INTERVAL)
            try:
                with self._lock:
                    uptime = 0
                    if self._stats["start_time"]:
                        uptime = int((datetime.now(timezone.utc) - self._stats["start_time"]).total_seconds())
                    logger.info(
                        "[HEARTBEAT] uptime=%ss sent=%s failed=%s attacks=%s blocked=%s distributed=%s",
                        uptime,
                        self._stats["total_sent"],
                        self._stats["total_failed"],
                        self._stats["total_attacks_detected"],
                        self._stats["total_ips_blocked"],
                        self._stats["distributed_events"],
                    )
            except Exception:
                pass

    def get_stats(self) -> dict[str, Any]:
        with self._lock:
            stats = self._stats.copy()
            stats["api_key"] = self.api_key_prefix
            stats["blocked_ips"] = list(self.blocker._blocked_ips)
            stats["recent_distributed_events"] = list(self._recent_distributed)
            if stats["start_time"]:
                stats["uptime_seconds"] = (
                    datetime.now(timezone.utc) - stats["start_time"]
                ).total_seconds()
            return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="VeriChainIDS Agent v3 - hybrid rich telemetry + local detection + autoblock",
    )
    parser.add_argument("-k", "--api-key", required=True, help="API Key from VeriChainIDS dashboard")
    parser.add_argument("-u", "--server-url", default="http://localhost:5000")
    parser.add_argument("--server-id", default=os.getenv("VERICHAINIDS_SERVER_ID", ""))
    parser.add_argument("-i", "--interval", type=int, default=DEFAULT_INTERVAL)
    parser.add_argument("-b", "--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--no-ssl-verify", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    agent = VeriChainIDSAgentV3(
        api_key=args.api_key,
        server_url=args.server_url,
        server_id=args.server_id,
        interval=args.interval,
        batch_size=args.batch_size,
        demo_mode=args.demo,
        ssl_verify=not args.no_ssl_verify,
    )

    try:
        agent.start()
    except KeyboardInterrupt:
        logger.info("Agent v3 stopped by user")
        logger.info("Final stats: %s", agent.get_stats())
        agent.stop()


if __name__ == "__main__":
    main()