# VERICHAINIDS — HỆ THỐNG PHÂN TÍCH & BỘ CÂU HỎI PHẢN BIỆN HỘI ĐỒNG (Q&A CHEAT SHEET)

> [!IMPORTANT]
> **Dành cho Sinh viên:** Nguyễn Trần Gia Bảo (Đại diện nhóm đồ án VeriChainIDS).  
> Tài liệu này tổng hợp toàn bộ **Mô hình Phân tích Hệ thống**, **Ánh xạ File Mã Nguồn (Source Code Mapping)**, và **Bộ Câu Hỏi Phản Biện Chuyên Sâu** thường gặp từ Hội đồng Giám khảo kèm câu trả lời mẫu đạt điểm tối đa.

---

## 1. MÔ HÌNH PHÂN TÍCH & THIẾT KẾ KẾT CẤU HỆ THỐNG (4-TIER ARCHITECTURE)

Hệ thống **VeriChainIDS** được thiết kế theo mô hình **4 Tầng Tách Biệt (4-Tier Architecture)** nhằm đảm bảo tính sẵn sàng cao, khả năng mở rộng chiều ngang (Horizontal Scaling) và cô lập tài nguyên:

```mermaid
graph TD
    subgraph Tier1["Tầng 1: Presentation Tier (React SPA)"]
        UI["React 18 + TailwindCSS\nSignalR Client (Real-time Dashboard)"]
    end

    subgraph Tier2["Tầng 2: Application Tier (ASP.NET Core 8.0)"]
        API["RESTful API / Auth JWT"]
        Hub["SignalR Hub (Real-time Push & Command Control)"]
        BackgroundService["Background Ticket & SLA Processing"]
        DB[(SQL Server 2019\nMonthly Partitioned Log DB)]
        API --> DB
        Hub --> API
    end

    subgraph Tier3["Tầng 3: Intelligence Tier (Python AI Engine)"]
        FE["27-Dim Feature Extractor"]
        ML["Isolation Forest (scikit-learn)\n+ RobustScaler"]
        BL["Rolling Statistical Baseline\n(Exponential Decay Drift)"]
        RL["Stateful Risk Ledger"]
        FE --> ML
        FE --> BL
        ML & BL --> RL
    end

    subgraph Tier4["Tầng 4: Data Collection & Enforcement (Edge Agent)"]
        Agent["C# / Python Native Agent"]
        PacketCap["Socket & WinDivert Packet Capture"]
        FW["Windows Firewall / netsh Rules Block"]
        Agent --> PacketCap
        Agent --> FW
    end

    %% Flow connections
    UI <-->|HTTP / WebSockets| Tier2
    Tier4 -->|HTTP Log Push (5s Interval)| Tier2
    Tier3 <-->|Poll Logs / Push Threat Alerts| Tier2
    Tier2 -->|SignalR Command Block IP| Tier4
```

---

## 2. BẢNG ÁNH XẠ FILE MÃ NGUỒN (SRC CODE MAPPING)

Khi Hội đồng đề nghị **"Mở code phần [X] cho tôi xem"**, hãy truy cập ngay các file mã nguồn sau trong dự án:

| Thành phần / Chức năng | Đường dẫn File Mã Nguồn | Chức năng kỹ thuật chi tiết |
| :--- | :--- | :--- |
| **Trích xuất Vector 27 Chiều & Isolation Forest** | [ai_engine.py](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Al-Engine/ai_engine.py#L377-L391) | Hàm `to_vector()` gom 27 chỉ số (entropy port, syn_like_ratio, sqli_hits,...) đưa vào `IsolationForest` & `RobustScaler`. |
| **Thuật toán Rolling Baseline & Risk Ledger** | [ai_engine.py](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Al-Engine/ai_engine.py#L635-L710) | Tính trung bình động và độ lệch chuẩn của lưu lượng IP với hệ số suy giảm alpha = 0.15. |
| **Agent Thu Thuật Log & Chặn Tường Lửa Biên** | [agent_core.py](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Agent/Agent_build_exe/agent_core.py#L185-L235) | Bắt gói tin, mở cổng Health Server `5050` và thực thi lệnh `netsh advfirewall` để block IP độc hại ngay tại máy chủ biên. |
| **Chống Tấn Công Tầng Thấp WinDivert** | [windivert_blocker.py](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Agent/windivert_blocker.py#L1-L80) | Can thiệp driver kernel Windows Divert để drop packet ở tầng Kernel trước khi tới TCP/IP stack. |
| **Tầng Backend Core API & JWT Auth** | [Program.cs](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Backend/VeriChainIDS.API/Program.cs) | Đăng ký Service, Middleware JWT, SignalR Hubs, Cấu hình Entity Framework Core và CORS. |
| **SignalR Real-time Hub** | [AgentHub.cs](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Backend/VeriChainIDS.API/Hubs/AgentHub.cs) | Kênh giao tiếp 2 chiều giữa Backend, Frontend và Agent để phát lệnh chặn IP thời gian thực. |
| **Tối Ưu SQL Partitioning & Stored Procedures** | [DTOs.cs](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Backend/VeriChainIDS.API/Models/DTOs.cs) | Các Data Transfer Objects và script định nghĩa cấu trúc dữ liệu log phân vùng theo tháng. |
| **Giao Diện SOC Dashboard & Real-time Alerts** | [App.tsx](file:///c:/Users/Administrator/Documents/Demo/VeriChainIDS/Frontend/src/App.tsx) | Component React chính hiển thị biểu đồ đe dọa, quản lý Server, Tickets và tích hợp VNPay. |

---

## 3. BỘ CÂU HỎI PHẢN BIỆN HỘI ĐỒNG & CÂU TRẢ LỜI CHUẨN XÁC (Q&A)

### Group A: Về Trí Tuệ Nhân Tạo & Mô Hình Học Máy (AI / Machine Learning)

> [!TIP]
> **Q1: Tại sao nhóm lại chọn Isolation Forest mà không dùng các mô hình Học máy có giám sát (Supervised Learning) như Random Forest, SVM hay Deep Learning (LSTM/CNN)?**
> 
> **Trả lời:**
> * **Đặc thù dữ liệu an ninh mạng:** Trong môi trường thực tế, dữ liệu log tấn công cực kỳ khan hiếm và bị lệch pha nghiêm trọng (Imbalanced Data - log bình thường chiếm 99.9%). Học có giám sát đòi hỏi tập dữ liệu gán nhãn (Labeled Dataset) rất lớn và dễ bị hỏng khi gặp **Zero-day Attack** (cuộc tấn công chưa từng xuất hiện).
> * **Cơ chế Isolation Forest:** Dựa trên nguyên lý các điểm dữ liệu bất thường (Anomalies) thường ít về số lượng và khác biệt về thuộc tính, nên chúng bị cô lập rất nhanh (độ dài đường đi $h(x)$ trên cây quyết định ngắn hơn nhiều so với điểm bình thường).
> * **Hiệu năng:** Isolation Forest có độ phức tạp tuyến tính $O(n)$, xử lý vector 27 chiều cực nhanh, thời gian train/predict chỉ dưới 10ms cho mỗi chu kỳ 5 giây, hoàn toàn đáp ứng tiêu chí **Real-time Engine**.

---

> [!TIP]
> **Q2: Vector 27 chiều của nhóm gồm những chỉ số gì? Làm sao nhóm tính được chỉ số Entropy?**
> 
> **Trả lời:**
> * **Cấu trúc 27 chiều:** Gom 4 nhóm đặc trưng:
>   1. *Lưu lượng & Tần suất:* Request count, Total Bytes In/Out, Request Rate, Burstiness.
>   2. *Tỷ lệ Gói tin & Giao thức:* SYN/ACK ratio, DNS Amplification ratio, Internal Lateral movement ratio.
>   3. *Độ hỗn loạn (Entropy):* Port Entropy và Destination IP Entropy (đo mức độ quét cổng/quét mạng).
>   4. *Payload Fingerprinting:* Đếm số lần khớp các Mẫu regex của SQLi, XSS, Webshell, Malware, Mining, Command Injection.
> * **Công thức Entropy:** Sử dụng công thức Shannon Entropy:
>   $$H(X) = -\sum_{i=1}^{n} P(x_i) \log_2 P(x_i)$$
>   Nếu 1 IP gửi request tới 1000 port ngẫu nhiên trong 5 giây, Port Entropy sẽ tiến sát tới 1 (bất thường cao - Port Scanning). Nếu chỉ gửi tới port 80/443, Port Entropy xấp xỉ 0 (bình thường).

---

> [!TIP]
> **Q3: Mô hình của em giải quyết bài toán False Positive (Báo động giả) như thế nào?**
> 
> **Trả lời:**
> Nhóm áp dụng **Cơ chế Anomaly Ensemble Scoring 3 Lớp**:
> 1. **Isolation Forest (Weight 40%):** Nhận diện điểm bất thường tổng quát.
> 2. **Statistical Rolling Baseline (Weight 30%):** Sử dụng thuật toán suy giảm lũy thừa (Exponential Weighted Moving Average với $\alpha = 0.15$) để học hành vi chuẩn theo khung giờ của từng IP server. Nếu lưu lượng tăng nhưng khớp với Baseline khung giờ cao điểm thì không coi là tấn công.
> 3. **Risk Ledger (Weight 30%):** Sổ cái tích lũy điểm rủi ro theo thời gian với cơ chế suy giảm tự động (`Risk Decay = 0.12 / cycle`). IP phải vi phạm liên tục trong nhiều chu kỳ hoặc có payload độc hại nguy hiểm thì điểm mới vượt ngưỡng `AUTO_BLOCK_THRESHOLD = 0.80` để chặn.

---

> [!TIP]
> **Q8: Isolation Forest là mô hình học không giám sát dạng hộp đen (Black-box). Khi hệ thống cảnh báo một IP độc hại, làm sao kỹ thuật viên SOC biết chính xác lý do tại sao nó bị gắn cờ là bất thường?**
> 
> **Trả lời:**
> * **Không phụ thuộc thuần túy vào Black-box:** VeriChainIDS áp dụng cơ chế **Trí tuệ nhân tạo có giải thích được (Explainable AI - XAI)** kết hợp giữa Học máy và Phân tích đặc trưng (Feature Attribution).
> * **Ba tầng minh bạch hóa cảnh báo:**
>   1. **Feature Deviation Analysis:** So sánh trực tiếp 27 chiều của IP nghi vấn với **Statistical Baseline**. Hệ thống chỉ ra cụ thể chỉ số nào bị lệch chuẩn (ví dụ: `Request Rate` vượt 4.5 lần so với trung bình, hoặc `Port Entropy = 0.88` chỉ ra hành vi Port Scan).
>   2. **Payload & Evidence Extraction:** Trích xuất và đính kèm 5 chuỗi Payload/Header thô thực tế gây ra vi phạm (SQLi/XSS/Webshell regex hits).
>   3. **Ánh xạ MITRE ATT&CK & Rationale:** Hệ thống tự động sinh báo cáo tự nhiên (Human-readable Rationale) kèm mã MITRE (vd: `T1190 - Exploit Public-Facing Application`, `T1046 - Network Service Discovery`), giúp kỹ thuật viên SOC nắm trọn bối cảnh trong 3 giây mà không cần tự giải mã cây Isolation Forest.

---

### Group B: Về Kiến Trúc Cơ Sở Dữ Liệu & Tối Ưu Hiệu Năng (Database & Performance)

> [!TIP]
> **Q4: Log mạng sinh ra hàng triệu bản ghi mỗi ngày, SQL Server của em có bị treo/nghẽn không? Giải pháp của nhóm là gì?**
> 
> **Trả lời:**
> Nhóm đã thiết kế chiến lược tối ưu CSDL chuẩn doanh nghiệp:
> 1. **Monthly Partitioning (Phân vùng theo tháng):** Bảng `TrafficLogs` được phân vùng theo trường `Timestamp`. Khi cần xóa log cũ quá 90 ngày, hệ thống chạy lệnh `ALTER TABLE... DROP PARTITION`. Lệnh này xóa mức hệ tập tin (Filegroup), hoàn tất trong vài mili-giây mà **không gây khóa bảng (Table Lock)** hay tạo **Phân mảnh Index (Index Fragmentation)** như lệnh `DELETE FROM`.
> 2. **Dọn dẹp tự động giờ thấp điểm:** Tích hợp Background Service chạy định kỳ lúc 2:00 AM để lưu trữ lạnh (Cold Storage) cảnh báo cũ và thực thi `ALTER INDEX ALL ON TrafficLogs REBUILD`.
> 3. **Batch Insertion:** Agent thu thập log và gửi về theo Batch (mặc định 200 logs/lần) giúp giảm thiểu số lượng kết nối I/O tới SQL Server.

---

### Group C: Về Bảo Mật, Agent & Chặn Tường Lửa (Security & Agent Firewall)

> [!TIP]
> **Q5: Cơ chế chặn IP của Agent hoạt động ra sao? Làm sao để không bị tin tặc lợi dụng tấn công từ chối dịch vụ bằng cách Giả mạo IP (IP Spoofing)?**
> 
> **Trả lời:**
> * **Cơ chế chặn:** Agent chạy dưới dạng Windows Service / Background Process có quyền Admin. Khi nhận lệnh Block từ SignalR Hub hoặc từ AI Engine, Agent gọi lệnh `netsh advfirewall firewall add rule name="VeriChainIDS_Block_IP" dir=in action=block remoteip=X.X.X.X`. 
> * **Ở tầng Kernel:** Tích hợp thư viện `WinDivert` can thiệp trực tiếp vào Network Driver để drop packet trước khi packet đi vào mạng nội bộ.
> * **Chống IP Spoofing:** 
>   1. Hệ thống áp dụng danh sách mạng tin cậy **TRUSTED_NETWORKS** (Google, Cloudflare, Microsoft, Subnet nội bộ) -> Tuyệt đối không bao giờ block các IP này.
>   2. Với các giao thức TCP (HTTP, SSH), việc IP Spoofing không thể hoàn tất bắt tay 3 bước (TCP 3-way Handshake). Hệ thống kiểm tra trạng thái kết nối `ESTABLISHED` từ `psutil` để xác minh IP thật trước khi hạ lệnh Block.

---

> [!TIP]
> **Q6: Giữa Agent và Backend truyền nhận dữ liệu qua giao thức gì? Có an toàn không?**
> 
> **Trả lời:**
> * Giao tiếp 2 chiều: Log được push từ Agent lên Backend qua **HTTPS REST API** (mã hóa SSL/TLS). Các lệnh chặn tức thời được Backend đẩy xuống Agent qua kênh **SignalR WebSockets (WSS)**.
> * Mỗi Agent khi cài đặt được cấp một **API Key riêng (Secret Key)**. Mọi request gửi lên đều chứa Header `X-API-Key`. Backend xác thực HMAC SHA256 / JWT trước khi chấp nhận dữ liệu log.

---

### Group D: Về Quy Trình Phản Ứng Sự Cố & Tính Năng Thương Mại (SOC & Business Workflow)

> [!TIP]
> **Q7: Sau khi phát hiện tấn công, hệ thống xử lý tiếp theo như thế nào ngoài việc chặn IP?**
> 
> **Trả lời:**
> Hệ thống thực hiện quy trình phản ứng sự cố khép kín theo chuẩn SOC:
> 1. **Tự động tạo Ticket:** Cảnh báo được đóng gói thành một Sự cố (Incident Ticket) có mức độ ưu tiên (Low, Medium, High, Critical) dựa trên MITRE ATT&CK Tactic.
> 2. **Cam kết SLA:** Mỗi Ticket gắn liền với đồng hồ đếm ngược SLA (Response & Resolution SLA). Nếu quá hạn chưa có kỹ thuật viên nhận, hệ thống gửi thông báo cảnh báo.
> 3. **Tích hợp Thanh toán VNPay:** Đối với phiên bản SaaS/Commercial, doanh nghiệp có thể đăng ký gói giám sát (Basic, Premium, Enterprise) và gia hạn qua cổng thanh toán VNPay Sandbox/Production đã tích hợp hoàn chỉnh.

---

## 4. CHEAT SHEET: KỊCH BẢN TRẢ LỜI SIÊU TỐC KHI THẦY CÔ HỎI TRỰC TIẾP

> [!IMPORTANT]
> **Dành cho Bạn trong lúc phản biện:** Khi Giáo viên đặt câu hỏi, hãy **gõ nhanh từ khóa ngắn gọn vào khung chat với AI**, AI sẽ lập tức xuất ra câu trả lời kỹ thuật ngắn gọn 3-4 dòng để bạn đọc trực tiếp cho Hội đồng nghe!

### Danh mục từ khóa gõ nhanh (Quick Keywords):
- `gõ: ai` hoặc `gõ: isolation forest` $\rightarrow$ Trả lời về Thuật toán AI, 27 chiều, tại sao không dùng Random Forest.
- `gõ: false positive` $\rightarrow$ Trả lời về Báo động giả, Rolling Baseline, Risk Ledger.
- `gõ: partition` hoặc `gõ: database` $\rightarrow$ Trả lời về Phân vùng SQL, Monthly Partition, Drop Partition.
- `gõ: agent` hoặc `gõ: firewall` $\rightarrow$ Trả lời về Agent, netsh, WinDivert, Chống IP Spoofing.
- `gõ: spoofing` $\rightarrow$ Trả lời về Chống giả mạo IP, Whitelist Cloudflare/Google.
- `gõ: sla` hoặc `gõ: ticket` $\rightarrow$ Trả lời về Quy trình SOC, Ticket, SLA, VNPay.

---
*Chúc bạn Nguyễn Trần Gia Bảo và nhóm thực hiện đồ án VeriChainIDS bảo vệ thành công rực rỡ và đạt điểm tối đa từ Hội đồng!*
