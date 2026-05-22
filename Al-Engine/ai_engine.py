#!/usr/bin/env python3
"""
VeriChainIDS AI Engine v3 — "PRO" Edition

Ghộp tinh hoa từ 2 engine:
  ✅ v1: MITRE ATT&CK 20 attacks, local auto-block (netsh/iptables), rich descriptions
  ✅ v2: Ensemble scoring (IsolationForest + drift + pressure), rolling baseline, risk ledger
  ✅ v3: Distributed DDoS detection, entropy analysis, advanced payload scanning
Detection pipeline:
  Traffic Logs → Feature Extraction → Ensemble Scoring (ML + Drift + Pressure)
  → Threat Profiling (MITRE-weighted) → Risk Ledger (stateful accumulation)
  → Alert + Auto-Block (local firewall + backend)

Cách chạy:
    python ai_engine.py --backend-url http://localhost:5000 --api-key sk-ai-engine-secret-key-2026
    python ai_engine.py -b http://192.168.1.6:5000 -i 5 -l 2 -t 0.70
    python ai_engine.py --backend-url http://localhost:5000 -i 5 -l 2 -t 0.40

Môi trường:
    BACKEND_URL          URL backend (default: http://localhost:5000)
    AI_API_KEY           API key để xác thực (default: sk-ai-engine-secret-key-2026)
    CHECK_INTERVAL       Giây giữa mỗi cycle (default: 5)
    LOOKBACK_MINUTES     Phút lookback log (default: 2)
    ANOMALY_THRESHOLD    Ngưỡng anomaly score để trigger (default: 0.68)
    AUTO_BLOCK_THRESHOLD Ngưỡng auto-block (default: 0.80)
    BASELINE_ALPHA       Hệ số học baseline (default: 0.15)
    RISK_DECAY           Risk giảm / cycle (default: 0.12)
    BLOCK_COOLDOWN_MIN   Cooldown block (default: 30 phút)
    ALLOW_LOCAL_BLOCK    Bật block local firewall (default: true)
    BASELINE_FILE        File lưu baseline (default: ai_engine_v3_baselines.json)
    DISTRIBUTED_THRESH   Ngưỡng IP cho distributed attack (default: 12)
    DISTRIBUTED_REQ      Ngưỡng request cho distributed (default: 180)
    IFOREST_ESTIMATORS   Số cây IsolationForest (default: 80)
    MAX_IPS_FOR_ML       Số IP tối đa được fit ML mỗi cycle (default: 400)
    MAX_LOGS_FOR_FEATURES Số logs tối đa được extract feature mỗi cycle (default: 3000)
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import math
import os
import platform
import re
import subprocess
import sys
import threading
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import requests

# ──────────────────────────────────────────────────────────────────────────────
# CẤU HÌNH
# ──────────────────────────────────────────────────────────────────────────────

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
AI_API_KEY = os.getenv("AI_API_KEY", "sk-ai-engine-secret-key-2026")
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL", "1"))
LOOKBACK_MINUTES = int(os.getenv("LOOKBACK_MINUTES", "1"))
PAGE_SIZE = int(os.getenv("PAGE_SIZE", "1000"))
ANOMALY_THRESHOLD = float(os.getenv("ANOMALY_THRESHOLD", "0.20"))
AUTO_BLOCK_THRESHOLD = float(os.getenv("AUTO_BLOCK_THRESHOLD", "0.30"))
RISK_DECAY = float(os.getenv("RISK_DECAY", "0.08"))
BASELINE_ALPHA = float(os.getenv("BASELINE_ALPHA", "0.20"))
BLOCK_COOLDOWN_MIN = int(os.getenv("BLOCK_COOLDOWN_MIN", "10"))
ALLOW_LOCAL_BLOCK = os.getenv("ALLOW_LOCAL_BLOCK", "true").lower() == "true"
BASELINE_FILE = Path(os.getenv("BASELINE_FILE", "ai_engine_baselines.json"))
DISTRIBUTED_SOURCE_THRESHOLD = int(os.getenv("DISTRIBUTED_SOURCE_THRESHOLD", "5"))
DISTRIBUTED_REQUEST_THRESHOLD = int(os.getenv("DISTRIBUTED_REQUEST_THRESHOLD", "80"))
IFOREST_ESTIMATORS = int(os.getenv("IFOREST_ESTIMATORS", "30"))
MAX_IPS_FOR_ML = int(os.getenv("MAX_IPS_FOR_ML", "200"))
MAX_LOGS_FOR_FEATURES = int(os.getenv("MAX_LOGS_FOR_FEATURES", "1000"))

LOGGING_FORMAT = "%(asctime)s [%(levelname)s] AI-PRO - %(message)s"

# Log rotation: 5 MB/file, giữ 5 file
_log_dir = os.path.join(os.environ.get("LOCALAPPDATA", "."), "VeriChainIDS", "logs")
os.makedirs(_log_dir, exist_ok=True)

_file_handler = logging.handlers.RotatingFileHandler(
    os.path.join(_log_dir, "ai_engine.log"),
    maxBytes=5 * 1024 * 1024,  # 5 MB
    backupCount=5,
    encoding="utf-8",
)
_file_handler.setFormatter(logging.Formatter(LOGGING_FORMAT))

logging.basicConfig(
    level=logging.INFO,
    format=LOGGING_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),
        _file_handler,
    ],
)

# Dọn log cũ > 30 ngày
try:
    cutoff = time.time() - 30 * 86400
    for f in os.listdir(_log_dir):
        if f.startswith("ai_engine.log"):
            fp = os.path.join(_log_dir, f)
            if os.path.getmtime(fp) < cutoff:
                try:
                    os.remove(fp)
                except Exception:
                    pass
except Exception:
    pass

logger = logging.getLogger("AIEnginePro")

# ──────────────────────────────────────────────────────────────────────────────
# MITRE ATT&CK — 20 Attacks (từ v1)
# ──────────────────────────────────────────────────────────────────────────────

MITRE: dict[str, dict[str, Any]] = {
    "DDoS": {
        "id": "T1498", "tactic": "Impact",
        "severity": "Critical", "auto_block": True, "block_threshold": 0.75,
        "action": "Block IP ngay. Enable rate limiting, contact ISP upstream."
    },
    "DDoS_Distributed": {
        "id": "T1498", "tactic": "Impact",
        "severity": "Critical", "auto_block": True, "block_threshold": 0.70,
        "action": "Multi-source DDoS. Block top talkers, enable upstream DDoS mitigation."
    },
    "BruteForce_SSH": {
        "id": "T1110", "tactic": "Credential Access",
        "severity": "High", "auto_block": True, "block_threshold": 0.70,
        "action": "Block IP, cài fail2ban, bật 2FA SSH, đổi port SSH mặc định."
    },
    "BruteForce_HTTP": {
        "id": "T1110", "tactic": "Credential Access",
        "severity": "High", "auto_block": True, "block_threshold": 0.75,
        "action": "Block IP, bật rate limiting, captcha, lockout policy."
    },
    "PortScan": {
        "id": "T1016", "tactic": "Discovery",
        "severity": "Medium", "auto_block": True, "block_threshold": 0.82,
        "action": "Block IP, đóng unused ports, cập nhật firewall rules."
    },
    "SQLInjection": {
        "id": "T1190", "tactic": "Initial Access",
        "severity": "High", "auto_block": True, "block_threshold": 0.70,
        "action": "Block IP, review WAF logs, sanitize inputs, dùng parameterized queries."
    },
    "Malware": {
        "id": "T1059", "tactic": "Execution",
        "severity": "Critical", "auto_block": True, "block_threshold": 0.75,
        "action": "ISOLATE SERVER NGAY. Forensic investigation, full system scan."
    },
    "XSS": {
        "id": "T1059", "tactic": "Execution",
        "severity": "Medium", "auto_block": False, "block_threshold": 0.90,
        "action": "Sanitize output, set CSP headers, review input validation."
    },
    "DNSAmplification": {
        "id": "T1498", "tactic": "Impact",
        "severity": "High", "auto_block": True, "block_threshold": 0.75,
        "action": "Block DNS queries > 512 bytes, disable open resolver."
    },
    "MITM": {
        "id": "T1557", "tactic": "Adversary-in-the-Middle",
        "severity": "High", "auto_block": True, "block_threshold": 0.82,
        "action": "Check ARP table, enable port security, inspect certificates."
    },
    "LateralMovement": {
        "id": "T1021", "tactic": "Lateral Movement",
        "severity": "High", "auto_block": True, "block_threshold": 0.78,
        "action": "Isolate affected systems, reset credentials, block lateral traffic."
    },
    "DataExfiltration": {
        "id": "T1041", "tactic": "Exfiltration",
        "severity": "Critical", "auto_block": True, "block_threshold": 0.70,
        "action": "BLOCK IP + DLP INVESTIGATION. Check data loss scope."
    },
    "DNSTunneling": {
        "id": "T1071", "tactic": "Command and Control",
        "severity": "Medium", "auto_block": True, "block_threshold": 0.82,
        "action": "Block long DNS queries, enable DNS query logging."
    },
    "Slowloris": {
        "id": "T1498", "tactic": "Impact",
        "severity": "Medium", "auto_block": True, "block_threshold": 0.82,
        "action": "Tuning server timeouts, enable mod_reqtimeout, rate limiting."
    },
    "SYN_Flood": {
        "id": "T1498", "tactic": "Impact",
        "severity": "Critical", "auto_block": True, "block_threshold": 0.70,
        "action": "Block IP, enable SYN cookies, increase connection queue."
    },
    "ICMP_Flood": {
        "id": "T1498", "tactic": "Impact",
        "severity": "Low", "auto_block": False, "block_threshold": 0.92,
        "action": "Block ICMP except essential (mtu discovery), limit ICMP rate."
    },
    "WebShellUpload": {
        "id": "T1105", "tactic": "Initial Access",
        "severity": "Critical", "auto_block": True, "block_threshold": 0.70,
        "action": "Block IP, review upload logs, scan uploaded files, WAF rules."
    },
    "PrivilegeEscalation": {
        "id": "T1068", "tactic": "Privilege Escalation",
        "severity": "Critical", "auto_block": True, "block_threshold": 0.78,
        "action": "Audit sudo/permissions, review audit logs, isolate account."
    },
    "Cryptomining": {
        "id": "T1496", "tactic": "Impact",
        "severity": "Medium", "auto_block": True, "block_threshold": 0.82,
        "action": "Block IP, scan for miner process, check scheduled tasks."
    },
    "SuspiciousProtocol": {
        "id": "T1046", "tactic": "Discovery",
        "severity": "Medium", "auto_block": True, "block_threshold": 0.88,
        "action": "Investigate protocol usage, block if unauthorized."
    },
    "UnknownAnomaly": {
        "id": "T1046", "tactic": "Discovery",
        "severity": "High", "auto_block": False, "block_threshold": 0.92,
        "action": "ML flag - investigate manually. Gather forensics data."
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# PAYLOAD PATTERNS (từ v2 — mở rộng)
# ──────────────────────────────────────────────────────────────────────────────

SQLI_PATTERNS = [
    r"UNION\s+(ALL\s+)?SELECT", r"WAITFOR\s+DELAY", r"BENCHMARK\s*\(",
    r"SLEEP\s*\(", r"DROP\s+(TABLE|DATABASE|INDEX)", r"EXEC(\s|\()",
    r"('|\"|%)?(\bOR\b|\bAND\b).*(=|<|>)",
    r"0x[0-9a-fA-F]+", r"CHAR\s*\(", r"--\s*$", r"/\*.*\*/",
]
XSS_PATTERNS = [
    r"<script[^>]*>", r"javascript:", r"on\w+\s*=", r"<iframe[^>]*>",
    r"<object[^>]*>|<embed[^>]*>", r"eval\s*\(", r"document\.cookie",
    r"document\.write",
]
WEBSHELL_PATTERNS = [
    r"\.(php3?|phtml|asp|x|jsp|cgi|pl)\b", r"cmd\.exe", r"powershell",
    r"shell_exec", r"system\s*\(", r"eval\s*\(",
]
MALWARE_PATTERNS = [
    r"base64\s+-d", r"/etc/passwd", r"/etc/shadow", r"certutil",
    r"bitsadmin", r"wget\s", r"curl\s", r"nc\s", r"bash\s+-i",
    r"/dev/tcp/", r"msfvenom", r"metasploit",
]
MINING_PATTERNS = [
    r"stratum\+tcp", r"bitcoin", r"monero", r"xmr", r"nanopool",
    r"ethermine", r"minexmr", r"cryptonight", r"hashvault", r"pool",
]
DNS_TUNNEL_PATTERNS = [
    r"^[A-Za-z0-9+/]{40,}={0,2}$", r"\.(tk|ml|ga|cf|gq|su)$",
]
PRIV_ESC_PATTERNS = [
    r"\bsudo\b", r"\bsu\b", r"chmod\s+777", r"/etc/sudoers",
    r"SeDebugPrivilege", r"token_id\s*=", r"whoami.*&",
]
CMD_PATTERNS = [
    r"[;&|`$]", r"\b(cat|ls|wget|curl|nc|bash|sh|cmd|powershell)\s",
    r"\|\s*\w+", r"\$\([^)]+\)|\$\{[^}]+\}", r"/etc/passwd",
]

PORT_SERVICE = {
    21: "FTP", 22: "SSH", 23: "TELNET", 25: "SMTP", 53: "DNS",
    80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS",
    445: "SMB", 3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL",
    6379: "Redis", 8080: "HTTP-ALT", 8443: "HTTPS-ALT", 27017: "MongoDB",
}


# ──────────────────────────────────────────────────────────────────────────────
# UTILITY
# ──────────────────────────────────────────────────────────────────────────────

def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def safe_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except Exception:
        return default


def parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def entropy(values: list) -> float:
    if not values:
        return 0.0
    counts = Counter(values)
    total = sum(counts.values())
    score = 0.0
    for count in counts.values():
        p = count / total
        if p > 0:
            score -= p * math.log2(p)
    return score


# ──────────────────────────────────────────────────────────────────────────────
# DATA MODELS
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class IPFeatures:
    ip: str
    request_count: int = 0
    total_bytes_in: int = 0
    total_bytes_out: int = 0
    total_packets_in: int = 0
    total_packets_out: int = 0
    avg_bytes_per_request: float = 0.0
    bytes_out_ratio: float = 0.0
    unique_dest_ports: int = 0
    unique_dest_ips: int = 0
    http_connections: int = 0
    ssh_connections: int = 0
    dns_queries: int = 0
    icmp_count: int = 0
    failed_login_count: int = 0
    request_rate: float = 0.0
    burstiness: float = 0.0
    port_entropy: float = 0.0
    dest_ip_entropy: float = 0.0
    payload_sqli_hits: int = 0
    payload_xss_hits: int = 0
    payload_webshell_hits: int = 0
    payload_malware_hits: int = 0
    payload_mining_hits: int = 0
    payload_dns_tunnel_hits: int = 0
    payload_priv_esc_hits: int = 0
    payload_cmd_hits: int = 0
    suspicious_protocol_ratio: float = 0.0
    internal_lateral_ratio: float = 0.0
    syn_like_ratio: float = 0.0
    dns_amplification_ratio: float = 0.0
    time_span_seconds: float = 1.0
    evidence_payloads: list[str] = field(default_factory=list)
    protocols: list[str] = field(default_factory=list)
    ports: list[int] = field(default_factory=list)
    destination_ips: list[str] = field(default_factory=list)
    server_ids: list[str] = field(default_factory=list)

    def to_vector(self) -> list[float]:
        return [
            self.request_count, self.total_bytes_in, self.total_bytes_out,
            self.avg_bytes_per_request, self.bytes_out_ratio,
            self.unique_dest_ports, self.unique_dest_ips,
            self.http_connections, self.ssh_connections, self.dns_queries,
            self.icmp_count, self.failed_login_count, self.request_rate,
            self.burstiness, self.port_entropy, self.dest_ip_entropy,
            self.payload_sqli_hits, self.payload_xss_hits,
            self.payload_webshell_hits, self.payload_malware_hits,
            self.payload_mining_hits, self.payload_dns_tunnel_hits,
            self.payload_priv_esc_hits, self.suspicious_protocol_ratio,
            self.internal_lateral_ratio, self.syn_like_ratio,
            self.dns_amplification_ratio,
        ]


@dataclass
class BaselineRecord:
    sample_count: int = 0
    mean: dict[str, float] = field(default_factory=dict)
    variance: dict[str, float] = field(default_factory=dict)
    last_seen: str = ""

    def to_json(self) -> dict[str, Any]:
        return {
            "sample_count": self.sample_count,
            "mean": self.mean,
            "variance": self.variance,
            "last_seen": self.last_seen,
        }

    @staticmethod
    def from_json(data: dict[str, Any]) -> "BaselineRecord":
        return BaselineRecord(
            sample_count=safe_int(data.get("sample_count"), 0),
            mean={k: safe_float(v) for k, v in (data.get("mean") or {}).items()},
            variance={k: safe_float(v) for k, v in (data.get("variance") or {}).items()},
            last_seen=str(data.get("last_seen") or ""),
        )


@dataclass
class ThreatDecision:
    source_ip: str
    attack_type: str
    score: float
    severity: str
    mitre_id: str
    mitre_tactic: str
    rationale: list[str]
    evidence: dict[str, Any]
    auto_block: bool
    should_block: bool
    server_id: str | None = None


# ──────────────────────────────────────────────────────────────────────────────
# FEATURE EXTRACTOR
# ──────────────────────────────────────────────────────────────────────────────

class FeatureExtractor:
    suspicious_protocols = {"IRC", "TOR", "SOCKS", "PROXY"}
    internal_ports = {22, 3389, 445, 139, 5985, 5986}

    @staticmethod
    def _parse_structured_payload(raw: str) -> dict[str, Any]:
        if not raw or not raw.lstrip().startswith("{"):
            return {}
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def extract(self, logs: list[dict[str, Any]]) -> dict[str, IPFeatures]:
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for log in logs:
            ip = (
                log.get("sourceIp") or log.get("SourceIp")
                or log.get("source_ip") or log.get("ip") or "unknown"
            )
            grouped[str(ip)].append(log)

        features: dict[str, IPFeatures] = {}
        for ip, ip_logs in grouped.items():
            timestamps: list[datetime] = []
            dest_ports: list[int] = []
            dest_ips: list[str] = []
            protocols: list[str] = []
            payloads: list[str] = []
            server_ids: list[str] = []
            login_failures = 0
            http_connections = 0
            ssh_connections = 0
            dns_queries = 0
            icmp_count = 0
            total_bytes_in = 0
            total_bytes_out = 0
            total_packets_in = 0
            total_packets_out = 0
            internal_hits = 0
            suspicious_proto_hits = 0
            s_failed = 0
            s_dns = 0
            s_icmp = 0
            s_syn_out = 0
            s_syn_in = 0

            for item in ip_logs:
                dst_port = safe_int(
                    item.get("destinationPort") or item.get("DestinationPort")
                    or item.get("destination_port")
                )
                dst_ip = str(
                    item.get("destinationIp") or item.get("DestinationIp")
                    or item.get("destination_ip") or ""
                ).strip()
                proto = str(item.get("protocol") or item.get("Protocol") or "").upper()
                raw = str(
                    item.get("rawPayload") or item.get("RawPayload")
                    or item.get("raw_payload") or ""
                )
                status_code = safe_int(item.get("statusCode") or item.get("StatusCode"))
                login_success = item.get("loginSuccess")
                ts = parse_ts(item.get("timestamp") or item.get("Timestamp"))
                srv_id = str(
                    item.get("serverId") or item.get("ServerId")
                    or item.get("server_id") or ""
                ).strip()

                if ts:
                    timestamps.append(ts)
                if dst_port > 0:
                    dest_ports.append(dst_port)
                if dst_ip:
                    dest_ips.append(dst_ip)
                if proto:
                    protocols.append(proto)
                if raw:
                    payloads.append(raw[:500])
                if srv_id:
                    server_ids.append(srv_id)

                structured = self._parse_structured_payload(raw)
                if structured:
                    suspicion_tags = structured.get("suspicionTags") or []
                    for tag in suspicion_tags[:10]:
                        payloads.append(str(tag)[:120])
                    s_failed += safe_int(structured.get("failedLoginHints"))
                    s_dns += safe_int(structured.get("dnsQueryCount"))
                    s_icmp += safe_int(structured.get("icmpCount"))
                    status_summary = structured.get("statusSummary") or {}
                    s_syn_out += safe_int(status_summary.get("SYN_SENT"))
                    s_syn_in += safe_int(status_summary.get("ESTABLISHED"))
                    if str(structured.get("peerCategory", "")).lower() == "internal":
                        internal_hits += 1

                bi = safe_int(item.get("bytesIn") or item.get("BytesIn") or item.get("bytes_in"))
                bo = safe_int(item.get("bytesOut") or item.get("BytesOut") or item.get("bytes_out"))
                pi = safe_int(item.get("packetsIn") or item.get("PacketsIn") or item.get("packets_in"))
                po = safe_int(item.get("packetsOut") or item.get("PacketsOut") or item.get("packets_out"))

                total_bytes_in += bi
                total_bytes_out += bo
                total_packets_in += pi
                total_packets_out += po

                if dst_port in {80, 443, 8080, 8443}:
                    http_connections += 1
                elif dst_port == 22:
                    ssh_connections += 1
                elif dst_port == 53:
                    dns_queries += 1
                if proto == "ICMP":
                    icmp_count += 1
                if dst_port in self.internal_ports:
                    internal_hits += 1
                if proto in self.suspicious_protocols:
                    suspicious_proto_hits += 1
                if login_success is False or status_code in {401, 403, 429}:
                    login_failures += 1

            login_failures += s_failed
            dns_queries += s_dns
            icmp_count += s_icmp
            total_packets_out += s_syn_out
            total_packets_in += s_syn_in

            timestamps.sort()
            if len(timestamps) >= 2:
                span = max((timestamps[-1] - timestamps[0]).total_seconds(), 1.0)
                intervals = [
                    max((b - a).total_seconds(), 0.001)
                    for a, b in zip(timestamps[:-1], timestamps[1:])
                ]
                burstiness = 1.0 / (1.0 + (sum(intervals) / len(intervals)))
            else:
                span = 1.0
                burstiness = 0.0

            payload_text = "\n".join(payloads[-50:])

            def count_hits(patterns: list[str]) -> int:
                total = 0
                for pat in patterns:
                    total += len(re.findall(pat, payload_text, re.IGNORECASE | re.MULTILINE))
                return total

            req_count = len(ip_logs)
            total_bytes = total_bytes_in + total_bytes_out

            features[ip] = IPFeatures(
                ip=ip,
                request_count=req_count,
                total_bytes_in=total_bytes_in,
                total_bytes_out=total_bytes_out,
                total_packets_in=total_packets_in,
                total_packets_out=total_packets_out,
                avg_bytes_per_request=(total_bytes / max(req_count, 1)),
                bytes_out_ratio=(total_bytes_out / max(total_bytes_in, 1)),
                unique_dest_ports=len(set(dest_ports)),
                unique_dest_ips=len(set(dest_ips)),
                http_connections=http_connections,
                ssh_connections=ssh_connections,
                dns_queries=dns_queries,
                icmp_count=icmp_count,
                failed_login_count=login_failures,
                request_rate=req_count / max(span, 1.0),
                burstiness=burstiness,
                port_entropy=entropy(dest_ports),
                dest_ip_entropy=entropy(dest_ips),
                payload_sqli_hits=count_hits(SQLI_PATTERNS),
                payload_xss_hits=count_hits(XSS_PATTERNS),
                payload_webshell_hits=count_hits(WEBSHELL_PATTERNS),
                payload_malware_hits=count_hits(MALWARE_PATTERNS),
                payload_mining_hits=count_hits(MINING_PATTERNS),
                payload_dns_tunnel_hits=count_hits(DNS_TUNNEL_PATTERNS),
                payload_priv_esc_hits=count_hits(PRIV_ESC_PATTERNS),
                payload_cmd_hits=count_hits(CMD_PATTERNS),
                suspicious_protocol_ratio=suspicious_proto_hits / max(req_count, 1),
                internal_lateral_ratio=internal_hits / max(req_count, 1),
                syn_like_ratio=total_packets_out / max(total_packets_in, 1),
                dns_amplification_ratio=total_bytes_out / max(total_bytes_in, 1),
                time_span_seconds=span,
                evidence_payloads=payloads[-5:],
                protocols=sorted(set(protocols)),
                ports=dest_ports,
                destination_ips=dest_ips,
                server_ids=server_ids,
            )
        return features


# ──────────────────────────────────────────────────────────────────────────────
# BASELINE STORE — Statistical rolling baseline (từ v2)
# ──────────────────────────────────────────────────────────────────────────────

class BaselineStore:
    TRACKED = [
        "request_rate", "avg_bytes_per_request", "bytes_out_ratio",
        "unique_dest_ports", "unique_dest_ips", "failed_login_count",
        "port_entropy", "dest_ip_entropy", "syn_like_ratio", "dns_amplification_ratio",
    ]

    def __init__(self, path: Path, alpha: float = BASELINE_ALPHA):
        self.path = path
        self.alpha = alpha
        self._lock = threading.Lock()
        self._records: dict[str, BaselineRecord] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            self._records = {
                ip: BaselineRecord.from_json(d)
                for ip, d in payload.items()
            }
            logger.info("Loaded %d baseline records from %s", len(self._records), self.path)
        except Exception as exc:
            logger.warning("Baseline load failed: %s", exc)

    def save(self) -> None:
        with self._lock:
            payload = {ip: rec.to_json() for ip, rec in self._records.items()}
        try:
            self.path.write_text(
                json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8"
            )
        except Exception as exc:
            logger.warning("Baseline save failed: %s", exc)

    def drift_score(self, f: IPFeatures) -> tuple[float, dict[str, float]]:
        with self._lock:
            rec = self._records.get(f.ip)
        if not rec or rec.sample_count < 3:
            return 0.15, {}

        drifts: dict[str, float] = {}
        for m in self.TRACKED:
            current = safe_float(getattr(f, m, 0.0))
            mean = safe_float(rec.mean.get(m, 0.0))
            var = max(safe_float(rec.variance.get(m, 1.0)), 1e-6)
            z = abs(current - mean) / math.sqrt(var)
            drifts[m] = clamp(z / 6.0)

        if not drifts:
            return 0.0, {}
        return sum(drifts.values()) / len(drifts), drifts

    def update(self, features: dict[str, IPFeatures]) -> None:
        with self._lock:
            for ip, f in features.items():
                rec = self._records.setdefault(ip, BaselineRecord())
                rec.sample_count += 1
                rec.last_seen = datetime.now(timezone.utc).isoformat()
                for m in self.TRACKED:
                    current = safe_float(getattr(f, m, 0.0))
                    old_mean = safe_float(rec.mean.get(m, current))
                    old_var = max(safe_float(rec.variance.get(m, 1.0)), 1e-6)

                    if rec.sample_count == 1:
                        new_mean, new_var = current, 1.0
                    else:
                        new_mean = (1 - self.alpha) * old_mean + self.alpha * current
                        delta = current - old_mean
                        new_var = max((1 - self.alpha) * old_var + self.alpha * (delta * delta), 1e-6)

                    rec.mean[m] = new_mean
                    rec.variance[m] = new_var


# ──────────────────────────────────────────────────────────────────────────────
# ENSEMBLE ANOMALY SCORER (từ v2)
# ──────────────────────────────────────────────────────────────────────────────

try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import RobustScaler
    _HAS_SKLEARN = True
except Exception:
    IsolationForest = None
    RobustScaler = None
    _HAS_SKLEARN = False


class EnsembleScorer:
    def __init__(self, threshold: float = ANOMALY_THRESHOLD):
        self.threshold = threshold

    def score(
        self, features: dict[str, IPFeatures], baselines: BaselineStore
    ) -> dict[str, dict[str, Any]]:
        if not features:
            return {}

        ips = list(features.keys())
        vectors = np.array([features[ip].to_vector() for ip in ips], dtype=np.float32)
        model_scores = {ip: 0.0 for ip in ips}
        ml_available = False

        if _HAS_SKLEARN and len(ips) >= 4:
            try:
                ml_ips = self._select_ips_for_ml(features, ips)
                ml_vectors = np.array([features[ip].to_vector() for ip in ml_ips], dtype=np.float32)
                scaler = RobustScaler()
                scaled = scaler.fit_transform(ml_vectors)
                contamination = min(max(1.0 / len(ml_ips), 0.02), 0.25)
                model = IsolationForest(
                    n_estimators=max(20, IFOREST_ESTIMATORS),
                    contamination=contamination,
                    random_state=42,
                    n_jobs=1,
                )
                model.fit(scaled)
                raw = model.score_samples(scaled)
                mn, mx = float(np.min(raw)), float(np.max(raw))
                for ip, v in zip(ml_ips, raw):
                    normalized = 1.0 - ((float(v) - mn) / max(mx - mn, 1e-6))
                    model_scores[ip] = clamp(normalized)
                ml_available = True
            except Exception as exc:
                logger.warning("IsolationForest failed, using drift only: %s", exc)

        results: dict[str, dict[str, Any]] = {}
        for ip in ips:
            drift_score, drift_comp = baselines.drift_score(features[ip])
            pressure = self._feature_pressure(features[ip])

            # When ML model is available, use full ensemble weights
            # When ML model is NOT available (< 4 IPs), rebalance to drift+pressure
            if ml_available:
                anomaly = clamp(0.45 * model_scores[ip] + 0.35 * drift_score + 0.20 * pressure)
            else:
                # No ML → redistribute weight: drift(40%) + pressure(60%)
                anomaly = clamp(0.40 * drift_score + 0.60 * pressure)

            # Rule-based override: if feature pressure is clearly elevated,
            # the traffic has strong attack indicators (payload patterns,
            # high request rate, etc.) — force anomaly even if ensemble is low
            rule_override = self._rule_based_check(features[ip], pressure)
            if rule_override:
                anomaly = max(anomaly, rule_override)

            verdict = "normal"
            if anomaly >= self.threshold:
                verdict = "anomaly"
            elif anomaly >= self.threshold * 0.8:
                verdict = "suspicious"

            results[ip] = {
                "score": anomaly,
                "verdict": verdict,
                "model_score": model_scores[ip],
                "drift_score": drift_score,
                "feature_pressure": pressure,
                "drift_components": drift_comp,
            }
        return results

    @staticmethod
    def _select_ips_for_ml(features: dict[str, IPFeatures], ips: list[str]) -> list[str]:
        if len(ips) <= MAX_IPS_FOR_ML:
            return ips

        ranked = sorted(
            ips,
            key=lambda ip: (
                features[ip].request_count,
                features[ip].failed_login_count,
                features[ip].payload_sqli_hits
                + features[ip].payload_xss_hits
                + features[ip].payload_webshell_hits
                + features[ip].payload_malware_hits
                + features[ip].payload_dns_tunnel_hits
                + features[ip].payload_priv_esc_hits,
                features[ip].unique_dest_ports,
            ),
            reverse=True,
        )
        return ranked[:MAX_IPS_FOR_ML]

    @staticmethod
    def _feature_pressure(f: IPFeatures) -> float:
        signals = [
            clamp(f.request_rate / 150.0),
            clamp(f.unique_dest_ports / 40.0),
            clamp(f.failed_login_count / 25.0),
            clamp(f.payload_sqli_hits / 8.0),
            clamp(f.payload_xss_hits / 8.0),
            clamp(f.payload_webshell_hits / 3.0),
            clamp(f.payload_malware_hits / 5.0),
            clamp(f.payload_dns_tunnel_hits / 5.0),
            clamp(f.payload_priv_esc_hits / 4.0),
            clamp(f.internal_lateral_ratio),
            clamp((f.syn_like_ratio - 1.0) / 8.0),
            clamp((f.dns_amplification_ratio - 1.0) / 12.0),
        ]
        return sum(signals) / len(signals)

    @staticmethod
    def _rule_based_check(f: IPFeatures, pressure: float) -> float:
        """Rule-based override: returns minimum anomaly score if clear attack
        indicators are present, 0.0 otherwise.
        This ensures obvious attacks are detected even when ensemble ML
        score is low (e.g., single-IP scenario, new IP with no baseline)."""
        score = 0.0

        # DDoS / SYN Flood: extremely high request count or request rate
        if f.request_count >= 100 and f.request_rate >= 5.0:
            score = max(score, clamp(0.65 + f.request_rate / 500.0))
        if f.syn_like_ratio >= 3.0 and f.request_count >= 50:
            score = max(score, 0.80)

        # Brute Force: many failed logins
        if f.failed_login_count >= 15:
            score = max(score, clamp(0.70 + f.failed_login_count / 200.0))

        # SQL Injection: payload pattern matches
        if f.payload_sqli_hits >= 3:
            score = max(score, clamp(0.72 + f.payload_sqli_hits / 50.0))

        # Malware / Reverse Shell: dangerous command patterns
        if f.payload_malware_hits >= 2:
            score = max(score, clamp(0.75 + f.payload_malware_hits / 40.0))

        # Web Shell upload
        if f.payload_webshell_hits >= 2:
            score = max(score, clamp(0.75 + f.payload_webshell_hits / 30.0))

        # Port Scan: many unique destination ports
        if f.unique_dest_ports >= 15:
            score = max(score, clamp(0.68 + f.unique_dest_ports / 200.0))

        # XSS: multiple hits
        if f.payload_xss_hits >= 3:
            score = max(score, clamp(0.70 + f.payload_xss_hits / 50.0))

        # Privilege Escalation
        if f.payload_priv_esc_hits >= 2:
            score = max(score, clamp(0.72 + f.payload_priv_esc_hits / 30.0))

        # DNS Tunneling
        if f.payload_dns_tunnel_hits >= 3:
            score = max(score, clamp(0.70 + f.payload_dns_tunnel_hits / 40.0))

        # High overall pressure — catch-all for compound attacks
        if pressure >= 0.25:
            score = max(score, clamp(0.50 + pressure))

        return clamp(score)


# ──────────────────────────────────────────────────────────────────────────────
# THREAT PROFILER — MITRE-weighted attack families (từ v2 + MITRE từ v1)
# ──────────────────────────────────────────────────────────────────────────────

class ThreatProfiler:
    PROFILES: dict[str, dict[str, Any]] = {
        "DDoS": {
            "severity": "Critical", "block_threshold": 0.73,
            "weights": {
                "request_rate": 0.35, "burstiness": 0.2,
                "http_connections": 0.15, "syn_like_ratio": 0.15,
                "unique_dest_ips": 0.05,
            },
        },
        "DDoS_Distributed": {
            "severity": "Critical", "block_threshold": 0.70,
            "weights": {
                "request_rate": 0.30, "unique_dest_ports": 0.20,
                "syn_like_ratio": 0.20, "burstiness": 0.15,
                "feature_pressure": 0.15,
            },
        },
        "BruteForce_SSH": {
            "severity": "High", "block_threshold": 0.70,
            "weights": {
                "ssh_connections": 0.35, "failed_login_count": 0.25,
                "request_rate": 0.15, "avg_inverse": 0.15, "burstiness": 0.10,
            },
        },
        "BruteForce_HTTP": {
            "severity": "High", "block_threshold": 0.75,
            "weights": {
                "http_connections": 0.25, "failed_login_count": 0.30,
                "request_rate": 0.20, "avg_inverse": 0.15, "xss_hits": 0.10,
            },
        },
        "PortScan": {
            "severity": "Medium", "block_threshold": 0.82,
            "weights": {
                "unique_dest_ports": 0.45, "port_entropy": 0.25,
                "avg_inverse": 0.15, "request_rate": 0.15,
            },
        },
        "SQLInjection": {
            "severity": "High", "block_threshold": 0.70,
            "weights": {
                "sqli_hits": 0.55, "http_connections": 0.15,
                "request_rate": 0.10, "feature_pressure": 0.20,
            },
        },
        "XSS": {
            "severity": "Medium", "block_threshold": 0.90,
            "weights": {"xss_hits": 0.60, "http_connections": 0.15, "feature_pressure": 0.25},
        },
        "WebShellUpload": {
            "severity": "Critical", "block_threshold": 0.70,
            "weights": {
                "webshell_hits": 0.55, "malware_hits": 0.15,
                "http_connections": 0.10, "feature_pressure": 0.20,
            },
        },
        "Malware": {
            "severity": "Critical", "block_threshold": 0.75,
            "weights": {
                "malware_hits": 0.35, "bytes_out_ratio": 0.20,
                "unique_dest_ips": 0.15, "suspicious_proto": 0.15,
                "feature_pressure": 0.15,
            },
        },
        "DataExfiltration": {
            "severity": "Critical", "block_threshold": 0.70,
            "weights": {
                "bytes_out_ratio": 0.45, "total_bytes_out": 0.20,
                "unique_dest_ips": 0.10, "request_rate": 0.10, "drift_score": 0.15,
            },
        },
        "DNSTunneling": {
            "severity": "High", "block_threshold": 0.82,
            "weights": {
                "dns_queries": 0.20, "dns_tunnel_hits": 0.45,
                "dest_ip_entropy": 0.10, "bytes_out_ratio": 0.10,
                "feature_pressure": 0.15,
            },
        },
        "DNSAmplification": {
            "severity": "High", "block_threshold": 0.75,
            "weights": {
                "dns_queries": 0.25, "dns_amp_ratio": 0.40,
                "request_rate": 0.15, "feature_pressure": 0.20,
            },
        },
        "Slowloris": {
            "severity": "High", "block_threshold": 0.82,
            "weights": {
                "http_connections": 0.25, "avg_inverse": 0.25,
                "time_span_long": 0.20, "burstiness_inv": 0.15, "request_rate": 0.15,
            },
        },
        "SYN_Flood": {
            "severity": "Critical", "block_threshold": 0.70,
            "weights": {
                "syn_like_ratio": 0.45, "request_rate": 0.20,
                "burstiness": 0.20, "feature_pressure": 0.15,
            },
        },
        "ICMP_Flood": {
            "severity": "Medium", "block_threshold": 0.92,
            "weights": {"icmp_count": 0.45, "request_rate": 0.20, "burstiness": 0.20, "feature_pressure": 0.15},
        },
        "LateralMovement": {
            "severity": "High", "block_threshold": 0.78,
            "weights": {
                "internal_lateral_ratio": 0.35, "unique_dest_ips": 0.15,
                "unique_dest_ports": 0.15, "dest_ip_entropy": 0.15, "drift_score": 0.20,
            },
        },
        "PrivilegeEscalation": {
            "severity": "Critical", "block_threshold": 0.78,
            "weights": {
                "priv_esc_hits": 0.55, "malware_hits": 0.15,
                "drift_score": 0.15, "feature_pressure": 0.15,
            },
        },
        "Cryptomining": {
            "severity": "Medium", "block_threshold": 0.82,
            "weights": {
                "mining_hits": 0.45, "bytes_out_ratio": 0.20,
                "suspicious_proto": 0.15, "drift_score": 0.20,
            },
        },
        "SuspiciousProtocol": {
            "severity": "Medium", "block_threshold": 0.88,
            "weights": {"suspicious_proto": 0.55, "drift_score": 0.20, "feature_pressure": 0.25},
        },
        "MITM": {
            "severity": "High", "block_threshold": 0.82,
            "weights": {
                "internal_lateral_ratio": 0.30, "unique_dest_ips": 0.20,
                "dest_ip_entropy": 0.20, "feature_pressure": 0.15, "drift_score": 0.15,
            },
        },
        "UnknownAnomaly": {
            "severity": "High", "block_threshold": 0.92,
            "weights": {"anomaly_score": 0.70, "drift_score": 0.30},
        },
    }

    def profile(
        self, features: dict[str, IPFeatures],
        anomaly_scores: dict[str, dict[str, Any]],
    ) -> list[ThreatDecision]:
        decisions: list[ThreatDecision] = []
        for ip, f in features.items():
            anomaly = anomaly_scores.get(ip)
            if not anomaly or anomaly["verdict"] == "normal":
                continue

            family_scores = self._compute_family_scores(f, anomaly)
            attack_type, profile_score = max(family_scores.items(), key=lambda item: item[1])
            profile = self.PROFILES.get(attack_type, self.PROFILES["UnknownAnomaly"])
            final_score = clamp(0.55 * anomaly["score"] + 0.45 * profile_score)

            mitre = MITRE.get(attack_type, MITRE["UnknownAnomaly"])
            severity = profile["severity"]
            if final_score > 0.92 and severity == "High":
                severity = "Critical"
            elif final_score > 0.88 and severity == "Medium":
                severity = "High"

            rationale = self._build_rationale(f, anomaly, attack_type, family_scores)
            evidence = self._build_evidence(f, anomaly, family_scores)
            auto_block = mitre.get("auto_block", False)
            block_threshold = profile.get("block_threshold", AUTO_BLOCK_THRESHOLD)
            should_block = auto_block and final_score >= max(block_threshold, AUTO_BLOCK_THRESHOLD * 0.9)

            # Determine primary serverId from features
            srv_id = None
            if f.server_ids:
                srv_counter = Counter(f.server_ids)
                srv_id = srv_counter.most_common(1)[0][0]

            decisions.append(ThreatDecision(
                source_ip=ip,
                attack_type=attack_type,
                score=final_score,
                severity=severity,
                mitre_id=mitre["id"],
                mitre_tactic=mitre["tactic"],
                rationale=rationale,
                evidence=evidence,
                auto_block=auto_block,
                should_block=should_block,
                server_id=srv_id,
            ))
        return decisions

    def _compute_family_scores(
        self, f: IPFeatures, anomaly: dict[str, Any]
    ) -> dict[str, float]:
        t = {
            "request_rate": clamp(f.request_rate / 150.0),
            "burstiness": clamp(f.burstiness),
            "burstiness_inv": 1.0 - clamp(f.burstiness),
            "http_connections": clamp(f.http_connections / 250.0),
            "ssh_connections": clamp(f.ssh_connections / 80.0),
            "failed_login_count": clamp(f.failed_login_count / 40.0),
            "avg_inverse": 1.0 - clamp(f.avg_bytes_per_request / 4000.0),
            "unique_dest_ports": clamp(f.unique_dest_ports / 60.0),
            "unique_dest_ips": clamp(f.unique_dest_ips / 60.0),
            "port_entropy": clamp(f.port_entropy / 6.0),
            "dest_ip_entropy": clamp(f.dest_ip_entropy / 6.0),
            "sqli_hits": clamp(f.payload_sqli_hits / 8.0),
            "xss_hits": clamp(f.payload_xss_hits / 8.0),
            "webshell_hits": clamp(f.payload_webshell_hits / 4.0),
            "malware_hits": clamp(f.payload_malware_hits / 6.0),
            "mining_hits": clamp(f.payload_mining_hits / 4.0),
            "dns_tunnel_hits": clamp(f.payload_dns_tunnel_hits / 6.0),
            "priv_esc_hits": clamp(f.payload_priv_esc_hits / 4.0),
            "bytes_out_ratio": clamp(f.bytes_out_ratio / 20.0),
            "total_bytes_out": clamp(f.total_bytes_out / 150_000_000.0),
            "dns_queries": clamp(f.dns_queries / 300.0),
            "dns_amp_ratio": clamp(f.dns_amplification_ratio / 25.0),
            "icmp_count": clamp(f.icmp_count / 400.0),
            "suspicious_proto": clamp(f.suspicious_protocol_ratio),
            "internal_lateral_ratio": clamp(f.internal_lateral_ratio),
            "syn_like_ratio": clamp((f.syn_like_ratio - 1.0) / 12.0),
            "time_span_long": clamp(f.time_span_seconds / 240.0),
            "feature_pressure": anomaly["feature_pressure"],
            "drift_score": anomaly["drift_score"],
            "anomaly_score": anomaly["score"],
        }

        scores: dict[str, float] = {}
        for atype, prof in self.PROFILES.items():
            total = sum(t.get(k, 0.0) * w for k, w in prof["weights"].items())
            weight_sum = sum(prof["weights"].values())
            scores[atype] = clamp(total / max(weight_sum, 1e-6))

        # Post-processing: penalize UnknownAnomaly when specific attack
        # indicators are present, so named attack types win classification
        if "UnknownAnomaly" in scores:
            has_specific_indicator = (
                f.payload_sqli_hits >= 3
                or f.payload_malware_hits >= 2
                or f.payload_webshell_hits >= 2
                or f.payload_xss_hits >= 3
                or f.payload_priv_esc_hits >= 2
                or f.payload_dns_tunnel_hits >= 3
                or f.payload_mining_hits >= 2
                or f.failed_login_count >= 15
                or f.unique_dest_ports >= 15
                or (f.request_count >= 100 and f.request_rate >= 5.0)
            )
            if has_specific_indicator:
                scores["UnknownAnomaly"] *= 0.3  # Heavy penalty
        return scores

    def _build_rationale(
        self, f: IPFeatures, anomaly: dict[str, Any],
        attack_type: str, family_scores: dict[str, float]
    ) -> list[str]:
        top_alt = sorted(family_scores.items(), key=lambda x: x[1], reverse=True)[1:3]
        rationale = [
            f"ensemble={anomaly['score']:.3f}",
            f"drift={anomaly['drift_score']:.3f}",
            f"pressure={anomaly['feature_pressure']:.3f}",
            f"profile={attack_type} ({family_scores.get(attack_type, 0):.3f})",
        ]
        if f.request_rate > 0:
            rationale.append(f"req_rate={f.request_rate:.1f}/s")
        if f.failed_login_count:
            rationale.append(f"failed_logins={f.failed_login_count}")
        if f.payload_sqli_hits:
            rationale.append(f"sqli_hits={f.payload_sqli_hits}")
        if f.payload_xss_hits:
            rationale.append(f"xss_hits={f.payload_xss_hits}")
        if f.unique_dest_ports >= 10:
            rationale.append(f"ports_scanned={f.unique_dest_ports}")
        if top_alt:
            rationale.append("alternatives=" + ", ".join(f"{n}:{s:.2f}" for n, s in top_alt))
        return rationale

    def _build_evidence(
        self, f: IPFeatures, anomaly: dict[str, Any], family_scores: dict[str, float]
    ) -> dict[str, Any]:
        top_families = sorted(family_scores.items(), key=lambda x: x[1], reverse=True)[:4]
        return {
            "requestCount": f.request_count,
            "requestRate": round(f.request_rate, 2),
            "avgBytesPerRequest": round(f.avg_bytes_per_request, 2),
            "bytesOutMB": round(f.total_bytes_out / 1024 / 1024, 2),
            "bytesOutRatio": round(f.bytes_out_ratio, 2),
            "uniqueDestPorts": f.unique_dest_ports,
            "uniqueDestIps": f.unique_dest_ips,
            "failedLoginCount": f.failed_login_count,
            "httpConnections": f.http_connections,
            "sshConnections": f.ssh_connections,
            "dnsQueries": f.dns_queries,
            "icmpCount": f.icmp_count,
            "sqliHits": f.payload_sqli_hits,
            "xssHits": f.payload_xss_hits,
            "webshellHits": f.payload_webshell_hits,
            "malwareHits": f.payload_malware_hits,
            "dnsTunnelHits": f.payload_dns_tunnel_hits,
            "privEscHits": f.payload_priv_esc_hits,
            "cmdHits": f.payload_cmd_hits,
            "miningHits": f.payload_mining_hits,
            "protocols": f.protocols,
            "ports": sorted(set(f.ports))[:30],
            "destinationIps": sorted(set(f.destination_ips))[:20],
            "recentPayloads": f.evidence_payloads,
            "ensembleScore": round(anomaly["score"], 4),
            "modelScore": round(anomaly["model_score"], 4),
            "driftScore": round(anomaly["drift_score"], 4),
            "featurePressure": round(anomaly["feature_pressure"], 4),
            "profileCandidates": [{"name": n, "score": round(s, 4)} for n, s in top_families],
            "driftComponents": {k: round(v, 4) for k, v in anomaly["drift_components"].items()},
            "mitreId": MITRE.get("DDoS", {}).get("id", "T1046"),
            "detectedAt": datetime.now(timezone.utc).isoformat(),
        }


# ──────────────────────────────────────────────────────────────────────────────
# DISTRIBUTED DDoS DETECTOR (từ agent_v3)
# ──────────────────────────────────────────────────────────────────────────────

class DistributedDetector:
    """Phát hiện DDoS phân tán — nhiều IP nguồn cùng đánh 1 đích."""

    def detect(
        self, features: dict[str, IPFeatures], threshold_src: int, threshold_req: int
    ) -> list[ThreatDecision]:
        grouped: dict[tuple, list[IPFeatures]] = defaultdict(list)
        for f in features.values():
            for port in set(f.ports):
                for proto in f.protocols:
                    key = (port, proto)
                    grouped[key].append(f)
                    break

        decisions: list[ThreatDecision] = []
        now = datetime.now(timezone.utc)

        for (port, proto), members in grouped.items():
            unique_ips = {f.ip for f in members}
            if len(unique_ips) < threshold_src:
                continue

            total_requests = sum(f.request_count for f in members)
            total_bytes_out = sum(f.total_bytes_out for f in members)
            if total_requests < threshold_req:
                continue

            avg_score = min(1.0, (len(unique_ips) / 40.0) * 0.45 + (total_requests / 2000.0) * 0.55)
            top_sources = sorted(
                ((f.ip, f.request_count) for f in members),
                key=lambda x: x[1], reverse=True
            )[:20]

            evidence = {
                "attack_scope": "distributed",
                "source_ips": [ip for ip, _ in top_sources],
                "source_count": len(unique_ips),
                "target_port": port,
                "protocol": proto,
                "total_requests": total_requests,
                "total_bytes_out_mb": round(total_bytes_out / 1024 / 1024, 2),
                "top_talkers": [{"ip": ip, "requests": req} for ip, req in top_sources],
                "detected_at": now.isoformat(),
            }

            severity = "Critical" if len(unique_ips) >= 25 or total_requests >= 1000 else "High"
            decisions.append(ThreatDecision(
                source_ip=", ".join(ip for ip, _ in top_sources[:5]) + "...",
                attack_type="DDoS_Distributed",
                score=clamp(avg_score),
                severity=severity,
                mitre_id="T1498",
                mitre_tactic="Impact",
                rationale=[
                    f"{len(unique_ips)} unique sources targeting port {port} via {proto}",
                    f"Total requests: {total_requests:,}, bytes out: {total_bytes_out / 1024 / 1024:.1f} MB",
                ],
                evidence=evidence,
                auto_block=True,
                should_block=avg_score >= AUTO_BLOCK_THRESHOLD * 0.9,
            ))

        return decisions


# ──────────────────────────────────────────────────────────────────────────────
# RISK LEDGER — Stateful accumulation + decay (từ v2)
# ──────────────────────────────────────────────────────────────────────────────

class RiskLedger:
    def __init__(self, decay: float = RISK_DECAY):
        self.decay = decay
        self._scores: dict[str, float] = defaultdict(float)
        self._history: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=10))
        self._lock = threading.Lock()

    def apply(self, decisions: list[ThreatDecision]) -> list[ThreatDecision]:
        with self._lock:
            for ip in list(self._scores.keys()):
                self._scores[ip] = max(0.0, self._scores[ip] - self.decay)

            updated: list[ThreatDecision] = []
            for d in decisions:
                self._scores[d.source_ip] = clamp(
                    self._scores[d.source_ip] + d.score * 0.55, 0.0, 1.0
                )
                self._history[d.source_ip].append(d.score)
                cumulative = self._scores[d.source_ip]
                d.score = clamp(0.65 * d.score + 0.35 * cumulative)
                d.should_block = d.should_block or d.score >= AUTO_BLOCK_THRESHOLD
                updated.append(d)
            return updated


# ──────────────────────────────────────────────────────────────────────────────
# AUTO-BLOCK ENGINE (từ v1 + v2)
# ──────────────────────────────────────────────────────────────────────────────

class AutoBlockEngine:
    def __init__(self, backend_url: str, api_key: str, server_id: str = ""):
        self.backend_url = backend_url.rstrip("/")
        self.api_key = api_key
        self.server_id = server_id
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": "VeriChainIDS-AI-Engine-v3/3.0",
        })
        self._blocked: dict[str, datetime] = {}
        self._lock = threading.Lock()
        self._platform = platform.system().lower()

    def should_block(self, d: ThreatDecision) -> bool:
        if not d.auto_block or not d.should_block:
            return False
        with self._lock:
            blocked_at = self._blocked.get(d.source_ip)
        if not blocked_at:
            return True
        return (datetime.now(timezone.utc) - blocked_at) > timedelta(minutes=BLOCK_COOLDOWN_MIN)

    def block(self, d: ThreatDecision) -> bool:
        ip = d.source_ip.split(",")[0].strip()
        
        # Check cooldown trước khi log — tránh spam
        with self._lock:
            blocked_at = self._blocked.get(ip)
        
        if blocked_at:
            elapsed = (datetime.now(timezone.utc) - blocked_at).total_seconds()
            if elapsed < BLOCK_COOLDOWN_MIN * 60:
                # Đã block gần đây, bỏ qua (không log nữa)
                return True
        
        # Lần đầu block hoặc hết cooldown → log + thực thi
        logger.warning(
            "[AUTO-BLOCK] BLOCKING | %s | IP: %s | Score: %.3f | MITRE: %s",
            d.attack_type, ip, d.score, d.mitre_id
        )

        local_ok = True
        if ALLOW_LOCAL_BLOCK:
            local_ok = self._block_local(ip, d.attack_type)

        backend_ok = self._report_to_backend(d, ip)
        success = local_ok and backend_ok

        if success:
            with self._lock:
                self._blocked[ip] = datetime.now(timezone.utc)
        return success

    def _block_local(self, ip: str, reason: str) -> bool:
        if "windows" in self._platform:
            rule_name = f"VeriChainIDS_AI_v3_{ip.replace('.', '_')}"
            cmd = [
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name={rule_name}", "dir=in", "action=block",
                f"remoteip={ip}", "protocol=any",
                f"description=AI-v3:{reason[:40]}",
            ]
        else:
            cmd = ["iptables", "-C", "INPUT", "-s", ip, "-j", "DROP"]
            try:
                chk = subprocess.run(cmd, capture_output=True)
                if chk.returncode == 0:
                    logger.info("IP %s already blocked in iptables", ip)
                    return True
            except Exception:
                pass
            cmd = ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                logger.info("[LOCAL] Blocked %s on %s firewall", ip, self._platform)
                return True
            logger.warning("[LOCAL] Firewall block failed: %s", result.stderr.strip())
            return False
        except FileNotFoundError:
            logger.error("[LOCAL] Firewall tool not found — need %s", "Administrator/root")
            return False
        except Exception as exc:
            logger.warning("[LOCAL] Firewall block error: %s", exc)
            return False

    def _report_to_backend(self, d: ThreatDecision, ip: str) -> bool:
        mitre = MITRE.get(d.attack_type, MITRE["UnknownAnomaly"])
        server_id = d.server_id or self.server_id or None
        payload = {
            "ip": ip,
            "attackType": d.attack_type,
            "severity": d.severity,
            "reason": mitre.get("action", "; ".join(d.rationale[:3])),
            "score": d.score,
            "blockedBy": "AI-Engine-v3",
            "blockDurationMinutes": 60,
            "serverId": server_id,
            "mitreId": d.mitre_id,
            "mitreTactic": d.mitre_tactic,
        }
        try:
            resp = self.session.post(
                f"{self.backend_url}/api/defense/block-ip",
                json=payload, timeout=10,
            )
            if resp.status_code == 200:
                logger.info("[BACKEND] Block reported: %s", ip)
                return True
            try:
                err = resp.json().get("message", resp.text)
            except Exception:
                err = resp.text
            logger.warning("[BACKEND] Block report failed (%d): %s", resp.status_code, err)
            return False
        except Exception as exc:
            logger.error("[BACKEND] Block report error: %s", exc)
            return False


# ──────────────────────────────────────────────────────────────────────────────
# MAIN SERVICE
# ──────────────────────────────────────────────────────────────────────────────

class AIEngineV3Service:
    def _is_whitelisted(self, ip: str, server_id: str = None) -> bool:
        try:
            url = f"{self.backend_url}/api/whitelists/ai-check/{ip}"
            params = {}
            if server_id:
                params["serverId"] = server_id
            
            resp = self.session.get(url, params=params, timeout=5)
            
            if resp.status_code == 200:
                data = resp.json()
                return data.get("data", {}).get("isWhitelisted", False)
            else:
                logger.warning("Whitelist check failed: %d", resp.status_code)
                return False
        except Exception as exc:
            logger.warning("Whitelist check error for IP %s: %s", ip, exc)
            return False

    def __init__(
        self,
        backend_url: str,
        api_key: str,
        interval: int = CHECK_INTERVAL,
        lookback: int = LOOKBACK_MINUTES,
        threshold: float = ANOMALY_THRESHOLD,
        server_id: str = "",
    ):
        self.backend_url = backend_url.rstrip("/")
        self.interval = interval
        self.lookback = lookback
        self.threshold = threshold
        self.server_id = server_id

        self.extractor = FeatureExtractor()
        self.baselines = BaselineStore(BASELINE_FILE)
        self.scorer = EnsembleScorer(threshold)
        self.profiler = ThreatProfiler()
        self.distributed = DistributedDetector()
        self.risk_ledger = RiskLedger()
        self.blocker = AutoBlockEngine(backend_url, api_key, server_id)

        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": "VeriChainIDS-AI-Engine-v3/3.0",
        })

        self._running = False
        self._stats = {
            "cycles": 0, "threats": 0, "blocked": 0,
            "alerts": 0, "distributed": 0, "last_cycle": None,
        }
        self._lock = threading.Lock()

    def start(self) -> None:
        self._running = True
        logger.info("=" * 65)
        logger.info(" VeriChainIDS AI Engine v3 — PRO EDITION")
        logger.info(" Backend: %s", self.backend_url)
        logger.info(" Interval: %ss | Lookback: %s min | Threshold: %.2f", self.interval, self.lookback, self.threshold)
        logger.info(" Ensemble: ML(45%%) + Drift(35%%) + Pressure(20%%)")
        logger.info(" Performance caps: pageSize=%d | maxLogs=%d | maxMlIps=%d | trees=%d",
            PAGE_SIZE, MAX_LOGS_FOR_FEATURES, MAX_IPS_FOR_ML, IFOREST_ESTIMATORS)
        logger.info(" Local firewall block: %s", "ENABLED" if ALLOW_LOCAL_BLOCK else "DISABLED")
        logger.info(" Distributed DDoS detection: ENABLED")
        logger.info(" Baseline file: %s", BASELINE_FILE)
        logger.info(" Attack profiles: %d types", len(self.profiler.PROFILES))
        logger.info("=" * 65)

        while self._running:
            try:
                self._run_cycle()
            except Exception as exc:
                logger.exception("Cycle failed: %s", exc)
            time.sleep(self.interval)

    def stop(self) -> None:
        self._running = False
        self.baselines.save()
        logger.info("AI Engine v3 stopped. Final stats: %s", self.get_stats())

    def _run_cycle(self) -> None:
        t0 = time.time()

        with self._lock:
            self._stats["cycles"] += 1

        logs = self._fetch_logs()
        if not logs:
            logger.debug("No logs fetched cycle #%d", self._stats["cycles"])
            return

        raw_log_count = len(logs)
        if len(logs) > MAX_LOGS_FOR_FEATURES:
            logs = logs[:MAX_LOGS_FOR_FEATURES]
            logger.info(
                "[CYCLE #%d] Truncated logs for feature extraction: %d -> %d",
                self._stats["cycles"],
                raw_log_count,
                len(logs),
            )

        features = self.extractor.extract(logs)

        # Step 1: Ensemble anomaly scoring
        anomaly_scores = self.scorer.score(features, self.baselines)

        # Step 2: Threat profiling
        decisions = self.profiler.profile(features, anomaly_scores)

        # Step 3: Distributed DDoS detection
        distributed: list[ThreatDecision] = self.distributed.detect(
            features, DISTRIBUTED_SOURCE_THRESHOLD, DISTRIBUTED_REQUEST_THRESHOLD
        )

        # Step 4: Merge and apply risk ledger
        all_decisions = decisions + distributed
        all_decisions = self.risk_ledger.apply(all_decisions)

        # Log summary
        high_conf = [d for d in all_decisions if d.score >= self.threshold]
        logger.info(
            "[CYCLE #%d] logs=%d/%d ips=%d suspicious=%d distributed=%d",
            self._stats["cycles"], len(logs), raw_log_count, len(features),
            len(high_conf), len(distributed)
        )

        # Process each threat
        for d in high_conf:
            # Check whitelist TRƯỚC — nếu whitelisted thì bỏ qua luôn (không log WARNING)
            if self._is_whitelisted(d.source_ip, d.server_id):
                logger.debug(
                    "[WHITELIST] Skipping %s from %s (whitelisted)",
                    d.attack_type, d.source_ip
                )
                continue
            
            self._trigger_alert(d)
            with self._lock:
                self._stats["threats"] += 1

            if self.blocker.should_block(d):
                if self.blocker.block(d):
                    with self._lock:
                        self._stats["blocked"] += 1

            if d.attack_type == "DDoS_Distributed":
                with self._lock:
                    self._stats["distributed"] += 1

            logger.warning(
                "[%s] %-20s | Score: %.3f | Block: %s | IP: %s | MITRE: %s",
                d.severity, d.attack_type, d.score,
                "YES" if d.should_block else "NO",
                d.source_ip[:40], d.mitre_id,
            )

        # Update baselines
        self.baselines.update(features)
        if self._stats["cycles"] % 5 == 0:
            self.baselines.save()

        with self._lock:
            self._stats["last_cycle"] = datetime.now(timezone.utc).isoformat()

        logger.info("[CYCLE] Done in %.2fs | Total blocked: %d", time.time() - t0, self._stats["blocked"])

    def _fetch_logs(self) -> list[dict[str, Any]]:
        since = datetime.now(timezone.utc) - timedelta(minutes=self.lookback)
        try:
            # /api/logs/ai-fetch bypasses TenantId filter — reads all logs across workspaces
            # Use /api/logs if you want tenant-scoped reads
            from_str = since.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
            resp = self.session.get(
                f"{self.backend_url}/api/logs/ai-fetch",
                params={"fromDate": from_str, "pageSize": PAGE_SIZE},
                timeout=20,
            )
            if resp.status_code != 200:
                logger.warning("Log fetch failed: %d", resp.status_code)
                return []
            data = resp.json()
            if data.get("success") and data.get("data"):
                return data["data"].get("items", [])
            return []
        except Exception as exc:
            logger.warning("Could not fetch logs: %s", exc)
            return []

    def _trigger_alert(self, d: ThreatDecision) -> None:
        # Whitelist check đã được thực hiện ở caller, không cần check lại
        mitre = MITRE.get(d.attack_type, MITRE["UnknownAnomaly"])
        # Determine serverId: from threat decision, or fallback to engine-level
        server_id = d.server_id or self.server_id or None
        payload = {
            "severity": d.severity,
            "alertType": d.attack_type.upper(),
            "title": self._gen_title(d),
            "description": self._gen_description(d, mitre),
            "sourceIp": d.source_ip.split(",")[0].strip(),
            "serverId": server_id,
            "targetAsset": None,
            "mitreTactic": d.mitre_tactic,
            "mitreTechnique": f"{d.mitre_id} - {d.mitre_tactic}",
            "anomalyScore": d.score,
            "recommendedAction": mitre.get("action", "Investigate and contain."),
            "autoBlocked": d.should_block,
            "evidence": json.dumps(d.evidence, ensure_ascii=False),
        }
        try:
            resp = self.session.post(
                f"{self.backend_url}/api/alerts/trigger",
                json=payload, timeout=10,
            )
            if resp.status_code == 200:
                with self._lock:
                    self._stats["alerts"] += 1
            else:
                logger.warning("Alert push failed: %d — %s", resp.status_code, resp.text)
        except Exception as exc:
            logger.warning("Alert push error: %s", exc)

    def _gen_title(self, d: ThreatDecision) -> str:
        titles = {
            "DDoS": f"DDoS Attack: {d.source_ip}",
            "DDoS_Distributed": f"Distributed DDoS: {d.evidence.get('source_count','?')} sources",
            "BruteForce_SSH": f"SSH Brute Force: {d.source_ip}",
            "BruteForce_HTTP": f"HTTP Login Brute Force: {d.source_ip}",
            "PortScan": f"Port Scan: {d.source_ip} — {d.evidence.get('uniqueDestPorts',0)} ports",
            "SQLInjection": f"SQL Injection: {d.source_ip}",
            "Malware": f"Malware / Suspicious Execution: {d.source_ip}",
            "XSS": f"XSS Attempt: {d.source_ip}",
            "DNSAmplification": f"DNS Amplification: {d.source_ip}",
            "MITM": f"MITM / ARP Spoofing: {d.source_ip}",
            "LateralMovement": f"Lateral Movement: {d.source_ip}",
            "DataExfiltration": f"Data Exfiltration: {d.source_ip} — {d.evidence.get('bytesOutMB',0)} MB",
            "DNSTunneling": f"DNS Tunneling: {d.source_ip}",
            "Slowloris": f"Slowloris DoS: {d.source_ip}",
            "SYN_Flood": f"SYN Flood: {d.source_ip}",
            "ICMP_Flood": f"ICMP Flood: {d.source_ip}",
            "WebShellUpload": f"Web Shell Upload: {d.source_ip}",
            "PrivilegeEscalation": f"Privilege Escalation: {d.source_ip}",
            "Cryptomining": f"Cryptomining Indicator: {d.source_ip}",
            "SuspiciousProtocol": f"Suspicious Protocol: {d.source_ip}",
            "UnknownAnomaly": f"Unknown Anomaly: {d.source_ip} — score {d.score:.3f}",
        }
        return titles.get(d.attack_type, f"{d.attack_type}: {d.source_ip}")

    def _gen_description(self, d: ThreatDecision, mitre: dict) -> str:
        ev = d.evidence
        desc = f"**[{d.severity}] {d.attack_type}**\n\n"
        desc += f"**Source IP:** `{d.source_ip}`\n"
        desc += f"**Anomaly Score:** `{d.score:.3f}`\n"
        desc += f"**MITRE ATT&CK:** `{d.mitre_id} - {d.mitre_tactic}`\n\n"
        desc += "| Metric | Value |\n|---|---|\n"
        desc += f"| Requests | {ev.get('requestCount', 0):,} |\n"
        desc += f"| Request Rate | {ev.get('requestRate', 0):.1f}/s |\n"
        desc += f"| Unique Ports | {ev.get('uniqueDestPorts', 0)} |\n"
        desc += f"| Bytes Out | {ev.get('bytesOutMB', 0):.2f} MB |\n"
        desc += f"| SSH Conn | {ev.get('sshConnections', 0)} |\n"
        desc += f"| HTTP Conn | {ev.get('httpConnections', 0)} |\n"
        desc += f"| Failed Logins | {ev.get('failedLoginCount', 0)} |\n"
        desc += f"| SQLi Hits | {ev.get('sqliHits', 0)} |\n"
        desc += f"| XSS Hits | {ev.get('xssHits', 0)} |\n"
        desc += f"| Ensemble | {ev.get('ensembleScore', 0):.4f} |\n"
        desc += f"| Drift | {ev.get('driftScore', 0):.4f} |\n"
        desc += f"| Pressure | {ev.get('featurePressure', 0):.4f} |\n\n"
        desc += f"**Rationale:** {' | '.join(d.rationale[:5])}\n\n"
        desc += f"**Recommendation:** {mitre.get('action', 'Investigate.')}"
        return desc

    def get_stats(self) -> dict[str, Any]:
        with self._lock:
            return self._stats.copy()


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="VeriChainIDS AI Engine v3 — PRO: Ensemble ML + MITRE ATT&CK + Auto-Block",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ai_engine_v3.py --backend-url http://localhost:5000
  python ai_engine_v3.py -b http://192.168.1.6:5000 --api-key sk-xxx -i 5 -l 2 -t 0.68
  python ai_engine_v3.py -b http://192.168.1.6:5000 --api-key sk-xxx --server-id SVR_ID -v

Detection pipeline:
  Traffic Logs → Feature Extraction (26 features) → Ensemble Scoring
  (IsolationForest + Statistical Drift + Feature Pressure)
  → Threat Profiling (MITRE-weighted) → Risk Ledger (stateful)
  → Alert + Auto-Block (local firewall + backend API)
        """,
    )
    parser.add_argument("--backend-url", "-b", default=BACKEND_URL)
    parser.add_argument("--api-key", default=AI_API_KEY)
    parser.add_argument("--interval", "-i", type=int, default=CHECK_INTERVAL)
    parser.add_argument("--lookback", "-l", type=int, default=LOOKBACK_MINUTES)
    parser.add_argument("--threshold", "-t", type=float, default=ANOMALY_THRESHOLD)
    parser.add_argument("--block-threshold", type=float, default=AUTO_BLOCK_THRESHOLD)
    parser.add_argument("--server-id", default=os.getenv("VERICHAINIDS_SERVER_ID", ""))
    parser.add_argument("--no-local-block", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.block_threshold != AUTO_BLOCK_THRESHOLD:
        os.environ["AUTO_BLOCK_THRESHOLD"] = str(args.block_threshold)

    global ALLOW_LOCAL_BLOCK
    if args.no_local_block:
        ALLOW_LOCAL_BLOCK = False

    service = AIEngineV3Service(
        backend_url=args.backend_url,
        api_key=args.api_key,
        interval=args.interval,
        lookback=args.lookback,
        threshold=args.threshold,
        server_id=args.server_id,
    )

    try:
        service.start()
    except KeyboardInterrupt:
        service.stop()


if __name__ == "__main__":
    main()
