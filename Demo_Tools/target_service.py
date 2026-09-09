#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VeriChainIDS - Victim Target Service
Chạy trên VPS 2 (Máy chủ mục tiêu / Victim) để mô phỏng dịch vụ Web/API
và nhận lưu lượng tấn công từ PC cho Agent giám sát.
"""

import sys
import time
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

PORT = 8080

class VulnerableHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        client_ip = self.client_address[0]
        path = self.path
        timestamp = time.strftime("%H:%M:%S")

        # In log trực quan trên màn hình console
        if any(kw in path.upper() for kw in ["UNION", "SELECT", "DROP", "OR 1=1", "WAITFOR", "--", "%27"]):
            print(f"\033[91m[{timestamp}] [ALERT - SQLi] từ {client_ip} -> GET {path}\033[0m")
        elif any(kw in path.lower() for kw in ["<script>", "javascript:", "alert(", "cookie"]):
            print(f"\033[93m[{timestamp}] [ALERT - XSS] từ {client_ip} -> GET {path}\033[0m")
        else:
            print(f"\033[92m[{timestamp}] [HTTP GET] từ {client_ip} -> {path}\033[0m")

        self.send_response(200)
        self.send_header("Content-type", "text/html; charset=utf-8")
        self.send_header("Server", "VeriChainIDS-Victim-Node")
        self.end_headers()
        
        response = f"""
        <html>
        <head><title>Victim Target Server</title></head>
        <body style="font-family: Arial; padding: 30px; background: #0f172a; color: #f8fafc;">
            <h1>🎯 VPS 2: Target Web Server (Được bảo vệ bởi VeriChainIDS Agent)</h1>
            <p><strong>Client IP:</strong> {client_ip}</p>
            <p><strong>Path:</strong> {path}</p>
            <p style="color: #38bdf8;">Dịch vụ đang hoạt động bình thường và được giám sát thời gian thực.</p>
        </body>
        </html>
        """
        self.wfile.write(response.encode("utf-8"))

    def do_POST(self):
        client_ip = self.client_address[0]
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8', errors='ignore')
        timestamp = time.strftime("%H:%M:%S")

        print(f"\033[96m[{timestamp}] [HTTP POST] từ {client_ip} -> {self.path} | Body: {post_data[:100]}\033[0m")

        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"received","message":"Processed by target server"}')

    def log_message(self, format, *args):
        # Tắt log mặc định của BaseHTTPRequestHandler để tự custom màu ở trên
        return

def start_dummy_ssh(port=2222):
    """Mở thêm 1 port TCP mô phỏng SSH/Login service để test brute force"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("0.0.0.0", port))
        s.listen(50)
        print(f"\033[94m[*] Đã mở Port mô phỏng SSH/Auth tại port {port}\033[0m")
        while True:
            client, addr = s.accept()
            print(f"\033[93m[!] Nhận kết nối thăm dò SSH từ {addr[0]}:{addr[1]}\033[0m")
            try:
                client.sendall(b"SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6\r\n")
                time.sleep(0.1)
                client.close()
            except Exception:
                pass
    except Exception as e:
        print(f"[-] Không thể mở port {port}: {e}")

def main():
    print("=" * 65)
    print("   🎯 VERICHAIN IDS - VICTIM TARGET SERVICE (MÁY CHỦ MỤC TIÊU)")
    print("=" * 65)
    print(f"[*] Đang khởi động Web Server mục tiêu tại: http://0.0.0.0:{PORT}")
    print("[*] Mục đích: Hứng traffic từ PC để VeriChainIDS Agent phát hiện và chặn IP.")
    print("=" * 65)

    # Chạy thêm port mô phỏng SSH ở luồng phụ
    t = threading.Thread(target=start_dummy_ssh, args=(2222,), daemon=True)
    t.start()

    server = HTTPServer(("0.0.0.0", PORT), VulnerableHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Đã dừng Target Service.")
        server.server_close()

if __name__ == "__main__":
    main()
