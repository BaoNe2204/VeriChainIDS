#!/usr/bin/env python3
"""
WinDivert IP Blocker - Kernel-level packet filtering
Chặn IP ở tầng driver, hoạt động ngay cả khi Windows Firewall TẮT
"""

import logging
import threading
import time
from typing import Set

try:
    import pydivert
    WINDIVERT_AVAILABLE = True
except ImportError:
    WINDIVERT_AVAILABLE = False

logger = logging.getLogger("WinDivertBlocker")


class WinDivertBlocker:
    """
    Kernel-level IP blocker sử dụng WinDivert driver.
    
    Ưu điểm:
    - Hoạt động ngay cả khi Windows Firewall TẮT
    - Chặn ở kernel level → Hiệu suất cao
    - Real-time blocking
    
    Nhược điểm:
    - Chỉ hoạt động trên Windows
    - Cần quyền Administrator
    """
    
    def __init__(self):
        if not WINDIVERT_AVAILABLE:
            raise ImportError("pydivert not installed. Run: pip install pydivert")
        
        self._blocked_ips: Set[str] = set()
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._handle = None
        
        logger.info("[WinDivert] Initializing kernel-level blocker...")
    
    def start(self) -> None:
        """Khởi động WinDivert driver và bắt đầu filter packets"""
        if self._running:
            logger.warning("[WinDivert] Already running")
            return
        
        self._running = True
        self._thread = threading.Thread(
            target=self._packet_filter_loop,
            daemon=True,
            name="WinDivert-Filter"
        )
        self._thread.start()
        logger.info("[WinDivert] ✅ Kernel-level blocker started")
    
    def stop(self) -> None:
        """Dừng WinDivert driver"""
        self._running = False
        if self._handle:
            try:
                self._handle.close()
            except Exception:
                pass
        logger.info("[WinDivert] Stopped")
    
    def block(self, ip: str) -> bool:
        """
        Thêm IP vào blacklist.
        Gói tin từ IP này sẽ bị DROP ở kernel level.
        """
        with self._lock:
            if ip in self._blocked_ips:
                logger.debug("[WinDivert] %s already blocked", ip)
                return True
            
            self._blocked_ips.add(ip)
            logger.info("[WinDivert] ✅ Blocked %s (total: %d IPs)", 
                       ip, len(self._blocked_ips))
            return True
    
    def unblock(self, ip: str) -> bool:
        """Xóa IP khỏi blacklist"""
        with self._lock:
            if ip not in self._blocked_ips:
                logger.debug("[WinDivert] %s not in blocklist", ip)
                return True
            
            self._blocked_ips.discard(ip)
            logger.info("[WinDivert] ✅ Unblocked %s (remaining: %d IPs)", 
                       ip, len(self._blocked_ips))
            return True
    
    def is_blocked(self, ip: str) -> bool:
        """Kiểm tra IP có bị block không"""
        with self._lock:
            return ip in self._blocked_ips
    
    def get_blocked_ips(self) -> list[str]:
        """Lấy danh sách tất cả IP đang bị block"""
        with self._lock:
            return list(self._blocked_ips)
    
    def _packet_filter_loop(self) -> None:
        """
        Main loop: Chặn tất cả packets từ blocked IPs.
        
        Filter string: "inbound and ip"
        - inbound: Chỉ filter gói tin VÀO (không filter gói tin RA)
        - ip: Chỉ filter gói tin IP (không filter ARP, etc.)
        """
        try:
            # Mở WinDivert handle với filter
            # Priority 0 = highest priority (chặn trước Windows Firewall)
            self._handle = pydivert.WinDivert("inbound and ip")
            self._handle.open()
            
            logger.info("[WinDivert] 🔍 Packet filter loop started")
            logger.info("[WinDivert] Filter: 'inbound and ip'")
            logger.info("[WinDivert] Priority: 0 (highest)")
            
            packet_count = 0
            blocked_count = 0
            last_log_time = time.time()
            
            while self._running:
                try:
                    # Đọc packet từ driver (blocking call)
                    packet = self._handle.recv()
                    packet_count += 1
                    
                    # Parse packet để lấy source IP
                    src_ip = packet.src_addr
                    
                    # Check xem IP có bị block không
                    with self._lock:
                        is_blocked = src_ip in self._blocked_ips
                    
                    if is_blocked:
                        # DROP packet (không gọi send() → packet bị hủy)
                        blocked_count += 1
                        logger.debug("[WinDivert] 🚫 DROPPED packet from %s", src_ip)
                    else:
                        # ALLOW packet (gửi lại vào network stack)
                        self._handle.send(packet)
                    
                    # Log statistics mỗi 10 giây
                    now = time.time()
                    if now - last_log_time >= 10:
                        logger.info(
                            "[WinDivert] Stats: %d packets processed, %d blocked (%.1f%%)",
                            packet_count,
                            blocked_count,
                            (blocked_count / max(packet_count, 1)) * 100
                        )
                        last_log_time = now
                
                except Exception as e:
                    if self._running:
                        logger.error("[WinDivert] Error processing packet: %s", e)
                        time.sleep(0.1)
        
        except Exception as e:
            logger.error("[WinDivert] Fatal error in filter loop: %s", e)
        
        finally:
            if self._handle:
                try:
                    self._handle.close()
                except Exception:
                    pass
            logger.info("[WinDivert] Packet filter loop stopped")


# ──────────────────────────────────────────────────────────────
# DEMO / TEST
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
    )
    
    print("""
╔══════════════════════════════════════════════════════════════╗
║          WinDivert IP Blocker - Demo Mode                   ║
║                                                              ║
║  ⚠️  Cần chạy với quyền Administrator!                      ║
║  ⚠️  Chỉ hoạt động trên Windows!                            ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    if not WINDIVERT_AVAILABLE:
        print("❌ pydivert not installed!")
        print("   Run: pip install pydivert")
        exit(1)
    
    blocker = WinDivertBlocker()
    
    try:
        # Start blocker
        blocker.start()
        
        # Block một số IP test
        print("\n📝 Blocking test IPs...")
        blocker.block("192.168.1.100")
        blocker.block("10.0.0.50")
        blocker.block("45.33.32.152")
        
        print(f"\n✅ Currently blocking {len(blocker.get_blocked_ips())} IPs:")
        for ip in blocker.get_blocked_ips():
            print(f"   - {ip}")
        
        print("\n🔍 WinDivert is now filtering packets...")
        print("   Try to ping blocked IPs from another machine")
        print("   Press Ctrl+C to stop\n")
        
        # Keep running
        while True:
            time.sleep(1)
    
    except KeyboardInterrupt:
        print("\n\n⏹️  Stopping blocker...")
        blocker.stop()
        print("✅ Stopped")
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
        blocker.stop()
