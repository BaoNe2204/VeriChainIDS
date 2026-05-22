"""
Test script để demo tính năng thông báo lỗi API Key

Chạy script này để test:
    python test_api_key_notification.py
"""

import time
import threading
from agent_core import VeriChainIDSAgentV3


def mock_notification(title: str, body: str):
    """Mock notification function để test"""
    print("\n" + "="*60)
    print(f"📢 NOTIFICATION:")
    print(f"   Title: {title}")
    print(f"   Body:\n{body}")
    print("="*60 + "\n")


def test_invalid_api_key():
    """Test với API key không hợp lệ"""
    print("🧪 TEST: API Key không hợp lệ\n")
    
    # Tạo agent với API key giả
    agent = VeriChainIDSAgentV3(
        api_key="sk_test_invalid_key_12345",
        server_url="http://localhost:5000",
        interval=5,
        batch_size=100,
        demo_mode=False,
        ssl_verify=False,
    )
    
    # Set notification callback
    agent.set_notification_callback(mock_notification)
    
    print("✅ Agent đã khởi tạo với API key không hợp lệ")
    print("✅ Notification callback đã được set")
    print("\n⏳ Đang chạy agent... (sẽ gửi logs và nhận 401)\n")
    
    # Start agent trong thread riêng
    def run_agent():
        try:
            agent.start()
        except Exception as e:
            print(f"❌ Agent stopped: {e}")
    
    t = threading.Thread(target=run_agent, daemon=True)
    t.start()
    
    # Chờ 15 giây để agent gửi logs và nhận 401
    time.sleep(15)
    
    # Stop agent
    agent.stop()
    print("\n✅ Test hoàn tất!")


if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════════╗
║  TEST THÔNG BÁO LỖI API KEY                                  ║
╚══════════════════════════════════════════════════════════════╝

Mục đích:
- Test tính năng thông báo khi API key không hợp lệ (401)
- Kiểm tra agent có dừng lại khi gặp 401 không
- Kiểm tra notification có hiển thị đúng không

Kịch bản:
1. Khởi tạo agent với API key giả
2. Agent gửi logs lên server
3. Server trả về 401 (API key không hợp lệ)
4. Agent hiển thị notification
5. Agent tự động dừng lại

""")
    
    try:
        test_invalid_api_key()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test bị dừng bởi người dùng")
    except Exception as e:
        print(f"\n\n❌ Lỗi: {e}")
