# 🚀 HƯỚNG DẪN DEMO TẤN CÔNG & PHÒNG THỦ THỰC TẾ (MÔ HÌNH 3 MÁY)

Mô hình triển khai gồm 3 thành phần:
1. **VPS 1 (SOC / Center Server)**: Chạy toàn bộ hệ thống VeriChainIDS (Backend API, AI Engine, Dashboard, Blockchain Submitter, Database).
2. **VPS 2 (Victim Server / Máy chủ mục tiêu)**: Máy chủ dịch vụ cần bảo vệ, cài đặt **VeriChainIDS Agent** và chạy dịch vụ web mục tiêu.
3. **PC của bạn (Attacker / Máy tấn công)**: Chạy công cụ `attack_tool.py` tấn công vào VPS 2 để minh họa tính năng phát hiện và tự động chặn (Auto-Block) của hệ thống.

---

## 🖥️ PHẦN 1: THIẾT LẬP TRÊN VPS 1 (TRUNG TÂM SOC & SERVER)

1. Clone code hoặc copy toàn bộ project lên VPS 1.
2. Đảm bảo VPS 1 đã mở các Port Firewall:
   - **3000** (Dashboard Frontend)
   - **5000** (Backend API)
3. Chạy file:
   ```cmd
   run_vps.bat
   ```
4. Mở trình duyệt truy cập Dashboard: `http://<IP_VPS_1>:3000`
5. Vào mục **Servers / Agents** (hoặc **Quản lý máy chủ**):
   - Tạo mới 1 Server đại diện cho VPS 2.
   - Nhấn **Tạo API Key** (Agent Token) và **Copy chuỗi API Key** này lại.

---

## 🎯 PHẦN 2: THIẾT LẬP TRÊN VPS 2 (MÁY CHỦ MỤC TIÊU CẦN BẢO VỆ)

Trên VPS 2 cần chạy 2 cửa sổ:

### Cửa sổ 1: Chạy VeriChainIDS Agent
Chạy file `agent.py` (hoặc file exe `VeriChainIDSAgent.exe`) trỏ về VPS 1 bằng lệnh:
```bash
# Cú pháp:
python agent.py -k <API_KEY_COPY_TU_VPS_1> -u http://<IP_VPS_1>:5000

# Ví dụ thực tế:
python agent.py -k vcid_live_9a8b7c6d5e... -u http://14.225.10.50:5000
```
> *Agent sẽ kết nối về VPS 1, hiển thị trạng thái Heartbeat màu xanh và bắt đầu giám sát các kết nối mạng tới VPS 2.*

### Cửa sổ 2: Chạy Target Web Service (Hứng traffic từ Attacker)
Mở thư mục `Demo_Tools` và chạy:
```cmd
run_target_vps.bat
# Hoặc lệnh: python target_service.py
```
> *Service này sẽ mở Web Server tại cổng `8080` và cổng SSH giả lập `2222` để nhận đòn tấn công từ PC.*

---

## ⚡ PHẦN 3: THỰC HIỆN TẤN CÔNG TỪ MÁY PC CỦA BẠN (ATTACKER)

1. Trên máy tính cá nhân (PC), vào thư mục `Demo_Tools`:
2. Click đúp vào file `run_attack_pc.bat` (hoặc mở CMD gõ: `python attack_tool.py`).
3. Tool sẽ tự động lấy và hiển thị **IP Public thực tế của PC**.
4. Nhập IP của VPS 2 và cổng `8080`.
5. Menu tấn công gồm các kịch bản chuẩn SOC:
   - **[1] ⚡ Port Scanning**: Quét 22 cổng trên VPS 2 -> Kích hoạt cảnh báo `PortScan`.
   - **[2] 🌊 HTTP / DDoS Flood**: Bắn 400 requests dồn dập -> Kích hoạt cảnh báo `DDoS` (Critical) & kích hoạt **Auto-Block**.
   - **[3] 💉 SQL Injection**: Bắn 8 payload SQLi (`UNION SELECT`, `' OR 1=1--`...) -> Kích hoạt cảnh báo `SQLInjection` (High).
   - **[4] 👾 XSS & Exploit**: Bắn payload script, shell command -> Kích hoạt cảnh báo `XSS` / `Malware`.
   - **[5] 🔐 SSH / Auth Brute Force**: Dò mật khẩu liên tục vào port 2222 -> Kích hoạt cảnh báo `BruteForce_SSH`.
   - **[6] 💥 COMBO ALL-IN-ONE**: Tự động chạy toàn bộ chuỗi tấn công để thuyết trình.
   - **[7] 🔍 Kiểm tra kết nối**: Kiểm tra xem IP của PC đã bị VPS 2 drop gói tin / chặn hoàn toàn chưa.

---

## 🎬 KỊCH BẢN BIỂU DIỄN THUYẾT TRÌNH (DEMO FLOW HOÀN HẢO)

1. **Trước khi tấn công:**
   - Mở Dashboard trên màn hình lớn: `http://<IP_VPS_1>:3000`. Cho thấy trạng thái VPS 2 đang xanh (Online, 0 Alerts).
2. **Bắt đầu tấn công:**
   - Trên PC, chọn **[6] Combo All-in-One** hoặc chọn **[2] DDoS / [3] SQL Injection**.
   - Chỉ trong 3-5 giây, màn hình Dashboard VPS 1 sẽ **nổi còi cảnh báo thời gian thực**:
     - Xuất hiện Alert đỏ `DDoS / SQL Injection` từ đúng địa chỉ IP của máy PC.
     - Telegram Bot thông báo tức thì về điện thoại.
     - AI Engine ghi nhận điểm bất thường (Anomaly Score > 0.85).
     - Hash được tạo và gửi lên Cardano Blockchain.
3. **Phòng thủ tự động (Auto-Block):**
   - Agent trên VPS 2 tự động thêm rule vào Windows Firewall / iptables: `VeriChainIDS_Block_<IP_PC>`.
   - Trên PC, chọn **[7] Kiểm tra kết nối**: Kết quả báo ngay lập tức **[BLOCKED / TIMEOUT]**! PC không thể truy cập vào VPS 2 được nữa!
4. **Mở chặn từ SOC Dashboard:**
   - Người quản trị vào Dashboard -> Danh sách IP bị chặn -> Nhấn **Mở chặn (Unblock)**.
   - Agent trên VPS 2 nhận lệnh xóa rule firewall, PC kết nối lại bình thường.
