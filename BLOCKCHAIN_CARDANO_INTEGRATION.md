# 🔗 VeriChainIDS × Cardano Blockchain — Tích hợp & Mô tả Đầy Đủ

> **Dành cho:** Hackathon Presentation · AI & Blockchain Security System  
> **Dự án:** VeriChainIDS — Real-time Intrusion Detection System  
> **Blockchain:** Cardano (ADA) — Proof of Stake, Smart Contract (Plutus/Aiken)

---

## 🎯 Hackathon MVP Chốt

**Tagline:** AI detects the threat. Cardano proves the evidence.

Trong bản demo hackathon, Cardano nên được dùng như **decentralized evidence and verification layer** cho VeriChainIDS. Hệ thống **không lưu full security log hoặc raw IP lên blockchain**. Thay vào đó, VeriChainIDS tạo **SHA-256 evidence hash** từ alert/block/audit event đã xác nhận, rồi anchor hash đó vào Cardano transaction metadata.

**MVP demo flow:**
```
Agent collects traffic
→ AI Engine detects attack
→ Backend creates alert in SQL Server
→ Blockchain Service generates SHA-256 evidence hash
→ Submit hash + minimal metadata to Cardano
→ Save Cardano TxHash in BlockchainRecords
→ Dashboard shows "Verified on Cardano"
→ Auditor verifies local hash == on-chain hash
```

**Scope cho demo:** Phase 1 tập trung vào `Alert → Hash → Cardano TxHash → Verify on Dashboard`. Smart contract threat intelligence, multi-tenant IP reputation và global threat status nên được trình bày là Phase 2/3, không phải phần bắt buộc của MVP.

---

## 📌 Tổng Quan Dự Án Hiện Tại

VeriChainIDS là hệ thống **giám sát, cảnh báo và ngăn chặn xâm nhập mạng real-time** gồm 4 thành phần chính:

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| **Agent** | Python + WinDivert | Chạy trên máy chủ cần bảo vệ, thu thập traffic, block IP |
| **AI Engine** | Python + scikit-learn (IsolationForest) | Phân tích anomaly, phát hiện 20 loại tấn công MITRE ATT&CK |
| **Backend API** | ASP.NET Core 8 + SignalR + SQL Server | Xử lý logic, lưu trữ, push real-time |
| **Frontend** | React + TypeScript + Vite | Dashboard SOC, quản lý alerts, tickets, blocked IPs |

**Luồng hiện tại:**
```
Agent (thu traffic) → Backend API → AI Engine (phân tích) → Alert/Block → Dashboard
```

---

## 🎯 Tại Sao Cần Thêm Cardano Blockchain?

### Vấn đề hiện tại (Pain Points)
1. **Dữ liệu tập trung** — Toàn bộ alerts, blocked IPs, audit logs lưu trong SQL Server → dễ bị tamper, xóa, giả mạo
2. **Thiếu bằng chứng pháp lý** — Khi xảy ra sự cố, không có bằng chứng không thể chối cãi (non-repudiation)
3. **Không có cơ chế chia sẻ threat intelligence** — Mỗi tenant hoạt động độc lập, không học được từ nhau
4. **Audit log có thể bị sửa** — Admin có thể xóa/sửa AuditLog trong DB
5. **Thiếu tính minh bạch** — Khách hàng không thể tự verify hệ thống có hoạt động đúng không

### Cardano giải quyết được gì?
- ✅ **Immutable Evidence** — Hash của mọi alert/block action được ghi lên chain, không ai sửa được
- ✅ **Privacy-preserving Proof** — Chỉ lưu hash và metadata tối thiểu, không lưu raw IP/full log lên chain
- ✅ **Verifiable Audit Trail** — Bất kỳ ai cũng có thể verify lịch sử hành động
- ✅ **Threat Intelligence Roadmap** — Smart contract có thể ghi nhận IP reputation dạng hash giữa các tenant ở Phase 2
- ✅ **Agent-driven Response** — Khi on-chain threat status đủ ngưỡng, Backend/Agent đọc dữ liệu đó và cập nhật rule chặn cục bộ

---

## 🏗️ Kiến Trúc Tích Hợp Blockchain

**Phase 1 MVP:** dùng Cardano transaction metadata để anchor evidence hash.  
**Phase 2/3:** thêm Aiken smart contract cho Alert Registry, Audit Log và Threat Intelligence. Các smart contract bên dưới là **prototype concept**, không nên pitch như code production nếu chưa deploy lên testnet.

```
┌─────────────────────────────────────────────────────────────────┐
│                        VeriChainIDS System                       │
│                                                                   │
│  Agent ──► Backend API ──► AI Engine                             │
│               │                │                                  │
│               ▼                ▼                                  │
│         SQL Server DB    Alert/Block                              │
│               │                │                                  │
│               └────────┬───────┘                                  │
│                        │                                          │
│                        ▼                                          │
│              ┌─────────────────┐                                  │
│              │  Blockchain     │  ◄── NEW LAYER                   │
│              │  Service Layer  │                                  │
│              └────────┬────────┘                                  │
│                       │                                           │
└───────────────────────┼───────────────────────────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │      CARDANO BLOCKCHAIN      │
         │                              │
         │  ┌──────────────────────┐    │
         │  │  Alert Registry SC   │    │  Smart Contract 1
         │  │  (Plutus / Aiken)    │    │
         │  └──────────────────────┘    │
         │  ┌──────────────────────┐    │
         │  │  Threat Intel SC     │    │  Smart Contract 2
         │  │  (IP Reputation)     │    │
         │  └──────────────────────┘    │
         │  ┌──────────────────────┐    │
         │  │  Audit Log SC        │    │  Smart Contract 3
         │  │  (Immutable Logs)    │    │
         │  └──────────────────────┘    │
         └──────────────────────────────┘
```

---

## 📦 Những Gì Cần Thêm Vào Dự Án

### 1. 📁 Thư Mục Mới: `Blockchain/`

Với MVP, ưu tiên `cardano_service.py`, `submit_alert.py`, `verify_audit.py` và `README.md`. Thư mục `contracts/` là prototype cho Phase 2.

```
VeriChainIDS/
├── Blockchain/
│   ├── contracts/                    # Smart contracts (Aiken)
│   │   ├── alert_registry.ak         # SC lưu hash alert
│   │   ├── threat_intel.ak           # SC chia sẻ IP độc hại
│   │   └── audit_log.ak              # SC immutable audit
│   ├── scripts/                      # Off-chain scripts
│   │   ├── submit_alert.py           # Gửi alert hash lên chain
│   │   ├── query_threat_intel.py     # Query IP reputation từ chain
│   │   └── verify_audit.py           # Verify audit trail
│   ├── cardano_service.py            # Python service tích hợp
│   ├── requirements.txt              # pycardano, blockfrost-python
│   └── README.md
```

### 2. 🔧 Backend: Thêm `BlockchainController.cs` + `IBlockchainService.cs`

```
Backend/VeriChainIDS.API/
├── Controllers/
│   └── BlockchainController.cs       # API endpoints blockchain
├── Services/
│   ├── IBlockchainService.cs         # Interface
│   └── CardanoBlockchainService.cs   # Implementation
├── Models/
│   └── BlockchainModels.cs           # DTOs cho blockchain
```

### 3. 🗄️ Database: Thêm bảng `BlockchainRecords`

```sql
-- Migration mới
CREATE TABLE BlockchainRecords (
    Id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId    UNIQUEIDENTIFIER NOT NULL,
    RecordType  NVARCHAR(50) NOT NULL,   -- 'Alert', 'BlockIP', 'AuditLog'
    EntityId    NVARCHAR(200) NOT NULL,  -- ID của entity gốc
    DataHash    NVARCHAR(64) NOT NULL,   -- SHA-256 hash của data
    TxHash      NVARCHAR(64),            -- Cardano transaction hash
    BlockHeight BIGINT,                  -- Block number trên chain
    Status      NVARCHAR(20) DEFAULT 'Pending', -- Pending/Confirmed/Failed
    CreatedAt   DATETIME2 DEFAULT GETUTCDATE(),
    ConfirmedAt DATETIME2
);
```

### 4. 🤖 AI Engine: Thêm module `blockchain_reporter.py`

```
Al-Engine/
└── blockchain_reporter.py            # Phase 3: gửi threat intel dạng hash lên chain
```

### 5. 🖥️ Frontend: Thêm trang `BlockchainVerify`

```
Frontend/src/
├── pages/
│   └── BlockchainVerify.tsx          # Trang verify on-chain
├── components/
│   └── BlockchainBadge.tsx           # Badge "Verified on Cardano"
```

---

## 🔄 Luồng Hoạt Động Sau Khi Tích Hợp

### Luồng 1: Alert → Blockchain Record
```
1. AI Engine phát hiện tấn công
2. Backend tạo Alert trong SQL Server (như hiện tại)
3. [NEW] Backend tính SHA-256 hash của alert data
4. [NEW] BlockchainService gửi hash lên Cardano (qua Blockfrost API)
5. [NEW] Lưu TxHash vào bảng BlockchainRecords
6. Frontend hiển thị badge "✅ Verified on Cardano" kèm TxHash
```

### Luồng 2: Block IP → Immutable Evidence
```
1. AI Engine / Admin block một IP
2. Backend lưu BlockedIP vào SQL Server (như hiện tại)
3. [NEW] Ghi lên Cardano: {ipHash, attackType, severity, timestamp, tenantIdHash}
4. [NEW] Bất kỳ ai có TxHash đều có thể verify trên Cardanoscan
```

### Luồng 3: Decentralized Threat Intelligence
```
1. Tenant A phát hiện IP 1.2.3.4 tấn công → hash IP và ghi report lên chain
2. Tenant B phát hiện cùng IP → hash IP và ghi report lên chain
3. Smart contract ghi nhận IP hash này bị báo cáo bởi nhiều verified tenant
4. AI Engine của Tenant C query chain → tự động tăng risk score cho IP này
5. Khi đủ ngưỡng (vd: 5 tenant), on-chain threat status chuyển sang global threat
6. Backend/Agent đọc trạng thái này và tự động cập nhật firewall/blocking rule cục bộ
```

### Luồng 4: Audit Log Verification
```
1. Mọi hành động quan trọng (block/unblock/acknowledge) → hash ghi lên chain
2. Khi cần kiểm tra pháp lý → verify hash trên Cardano
3. Nếu DB bị sửa → hash không khớp → phát hiện tamper
```

---

## 💻 Code Mẫu / Prototype Cần Viết

Các đoạn code dưới đây là skeleton để demo và định hướng triển khai. Phần metadata transaction phù hợp cho MVP. Phần Aiken smart contract là **concept/prototype cho Phase 2**, cần compile, test và deploy lên testnet trước khi pitch là production-ready.

### `Blockchain/cardano_service.py`
```python
"""
VeriChainIDS Cardano Blockchain Service
Sử dụng PyCardano + Blockfrost để tương tác với Cardano testnet/mainnet
"""
import hashlib
import json
from datetime import datetime, timezone
from pycardano import (
    BlockFrostChainContext, TransactionBuilder, TransactionOutput,
    Address, Network, PaymentSigningKey, PaymentVerificationKey
)
from blockfrost import BlockFrostApi, ApiUrls

class CardanoService:
    def __init__(self, project_id: str, network: str = "testnet"):
        self.network = Network.TESTNET if network == "testnet" else Network.MAINNET
        self.context = BlockFrostChainContext(
            project_id=project_id,
            base_url=ApiUrls.testnet.value if network == "testnet" else ApiUrls.mainnet.value
        )
        self.api = BlockFrostApi(project_id=project_id)

    def hash_alert(self, alert_data: dict) -> str:
        """Tính SHA-256 hash của alert data"""
        canonical = json.dumps(alert_data, sort_keys=True, ensure_ascii=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

    def submit_alert_hash(self, alert_id: str, data_hash: str, signing_key_path: str) -> str:
        """
        Gửi alert hash lên Cardano dưới dạng metadata transaction
        Returns: transaction hash (TxHash)
        """
        skey = PaymentSigningKey.load(signing_key_path)
        vkey = PaymentVerificationKey.from_signing_key(skey)
        address = Address(payment_part=vkey.hash(), network=self.network)

        # Metadata label 674 theo kiểu CIP-20/custom schema cho VeriChainIDS
        metadata = {
            674: {  # VeriChainIDS metadata label
                "type": "alert",
                "id": alert_id[:64],
                "hash": data_hash,
                "ts": datetime.now(timezone.utc).isoformat()[:19]
            }
        }

        builder = TransactionBuilder(self.context)
        builder.add_input_address(address)
        # Gửi minimum ADA đến chính mình (self-transaction với metadata)
        builder.add_output(TransactionOutput(address, 2_000_000))  # 2 ADA minimum
        builder.auxiliary_data = metadata

        tx = builder.build_and_sign([skey], change_address=address)
        self.context.submit_tx(tx)
        return str(tx.id)

    def query_ip_reputation(self, ip_address: str) -> dict:
        """
        Query IP reputation từ Cardano smart contract
        Returns: {ip, report_count, severity_score, last_reported}
        """
        # Query UTxO tại smart contract address
        # (Implementation phụ thuộc vào smart contract đã deploy)
        pass

    def verify_record(self, tx_hash: str, expected_hash: str) -> bool:
        """Verify một record trên chain có khớp với expected hash không"""
        try:
            tx = self.api.transaction(tx_hash)
            metadata = self.api.transaction_metadata(tx_hash)
            for m in metadata:
                if m.label == "674":
                    return m.json_metadata.get("hash") == expected_hash
            return False
        except Exception:
            return False
```

### `Backend/Services/IBlockchainService.cs`
```csharp
namespace VeriChainIDS.API.Services;

public interface IBlockchainService
{
    /// <summary>Ghi hash của alert lên Cardano blockchain</summary>
    Task<string?> RecordAlertAsync(Guid alertId, string alertHash);

    /// <summary>Ghi hash của block action lên chain</summary>
    Task<string?> RecordBlockActionAsync(Guid blockId, string dataHash);

    /// <summary>Ghi audit log hash lên chain</summary>
    Task<string?> RecordAuditLogAsync(long auditLogId, string logHash);

    /// <summary>Verify một record có tồn tại trên chain không</summary>
    Task<bool> VerifyRecordAsync(string txHash, string expectedHash);

    /// <summary>Query IP reputation từ Threat Intel smart contract</summary>
    Task<IpReputationResult> QueryIpReputationAsync(string ipAddress);

    /// <summary>Submit IP report lên Threat Intel smart contract; implementation phải hash IP trước khi ghi on-chain</summary>
    Task<string?> ReportMaliciousIpAsync(string ipAddress, string attackType, string severity);
}

public record IpReputationResult(
    string IpAddress,
    int ReportCount,
    double SeverityScore,
    DateTime? LastReported,
    bool IsGloballyBlocked
);
```

### `Backend/Controllers/BlockchainController.cs`
```csharp
[ApiController]
[Route("api/blockchain")]
[Authorize]
public class BlockchainController : ControllerBase
{
    // GET /api/blockchain/verify/{txHash}
    // Verify một transaction hash trên Cardano
    
    // GET /api/blockchain/alert/{alertId}/proof
    // Lấy blockchain proof của một alert
    
    // GET /api/blockchain/ip-reputation/{ip}
    // Query IP reputation từ chain
    
    // GET /api/blockchain/records
    // Danh sách tất cả records đã ghi lên chain của tenant
    
    // POST /api/blockchain/report-ip
    // Phase 3: submit IP report lên Threat Intel smart contract
}
```

### `Blockchain/contracts/alert_registry.ak` (Aiken Smart Contract Prototype)
```aiken
// Alert Registry Smart Contract
// Lưu trữ hash của alerts từ VeriChainIDS nodes

use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Transaction}

type AlertDatum {
  tenant_hash: ByteArray,   // Hash của tenant ID (privacy)
  alert_hash: ByteArray,    // SHA-256 hash của alert data
  timestamp: Int,           // POSIX timestamp
  severity: Int,            // 1=Low, 2=Medium, 3=High, 4=Critical
}

type AlertRedeemer {
  Submit
  Verify { expected_hash: ByteArray }
}

validator {
  fn alert_registry(datum: AlertDatum, redeemer: AlertRedeemer, ctx: ScriptContext) -> Bool {
    when redeemer is {
      Submit -> {
        // Validate: alert_hash phải là 32 bytes (SHA-256)
        bytearray.length(datum.alert_hash) == 32
      }
      Verify { expected_hash } -> {
        // Verify hash khớp
        datum.alert_hash == expected_hash
      }
    }
  }
}
```

### `Blockchain/contracts/threat_intel.ak` (Aiken Smart Contract Prototype)
```aiken
// Threat Intelligence Smart Contract
// Decentralized IP reputation system

type IpReport {
  ip_hash: ByteArray,       // Hash của IP address (privacy)
  attack_type: ByteArray,   // Loại tấn công
  severity: Int,
  reporter_hash: ByteArray, // Hash của tenant ID
  timestamp: Int,
}

type ThreatDatum {
  reports: List<IpReport>,
  total_reports: Int,
  max_severity: Int,
}

// Khi total_reports >= GLOBAL_BLOCK_THRESHOLD → emit GlobalBlock event
const global_block_threshold: Int = 5

validator {
  fn threat_intel(datum: ThreatDatum, redeemer: IpReport, ctx: ScriptContext) -> Bool {
    let new_total = datum.total_reports + 1
    // Cho phép submit nếu reporter chưa báo cáo IP này
    let already_reported = list.any(
      datum.reports,
      fn(r) { r.reporter_hash == redeemer.reporter_hash }
    )
    !already_reported
  }
}
```

---

## 🔌 Tích Hợp Vào Code Hiện Tại

### Sửa `AlertsController.cs` — Thêm blockchain recording sau khi tạo alert
```csharp
// Sau dòng: await _db.SaveChangesAsync();
// Thêm:
_ = Task.Run(async () => {
    try {
        var alertData = new {
            id = alert.Id,
            tenantId = alert.TenantId,
            alertType = alert.AlertType,
            severity = alert.Severity,
            sourceIp = alert.SourceIp,
            createdAt = alert.CreatedAt
        };
        var hash = _blockchainService.ComputeHash(alertData);
        var txHash = await _blockchainService.RecordAlertAsync(alert.Id, hash);
        if (txHash != null) {
            _db.BlockchainRecords.Add(new BlockchainRecord {
                TenantId = alert.TenantId,
                RecordType = "Alert",
                EntityId = alert.Id.ToString(),
                DataHash = hash,
                TxHash = txHash,
                Status = "Pending"
            });
            await _db.SaveChangesAsync();
        }
    } catch (Exception ex) {
        _logger.LogError(ex, "Blockchain recording failed for alert {AlertId}", alert.Id);
        // Không throw — blockchain failure không được ảnh hưởng core flow
    }
});
```

### Sửa `DefenseController.cs` — Thêm blockchain recording khi block IP
```csharp
// Sau khi commit transaction thành công, thêm:
_ = Task.Run(async () => {
    var blockData = new {
        ip = request.Ip,
        attackType = request.AttackType,
        severity = request.Severity,
        blockedAt = DateTime.UtcNow,
        tenantId = effectiveTenantId
    };
    var hash = _blockchainService.ComputeHash(blockData);
    var txHash = await _blockchainService.RecordBlockActionAsync(blockedIP.Id, hash);
    // Lưu TxHash vào BlockchainRecords...
    
    // Phase 3: report lên Threat Intel smart contract.
    // Service implementation phải hash IP/tenant trước khi ghi dữ liệu on-chain.
    await _blockchainService.ReportMaliciousIpAsync(
        request.Ip, request.AttackType ?? "Unknown", request.Severity ?? "Medium"
    );
});
```

### Phase 3: Sửa `ai_engine.py` — Query blockchain trước khi phân tích
```python
# Trong vòng lặp phân tích, thêm:
async def enrich_with_blockchain_reputation(self, ip: str) -> float:
    """
    Query Cardano Threat Intel SC để lấy IP reputation score
    Returns: bonus_score (0.0 - 0.3) để cộng vào anomaly score
    """
    try:
        result = await self.cardano_service.query_ip_reputation(ip)
        if result['report_count'] >= 5:
            return 0.3  # Globally known bad IP
        elif result['report_count'] >= 2:
            return 0.15
        return 0.0
    except Exception:
        return 0.0  # Blockchain unavailable → không ảnh hưởng detection
```

---

## 🖥️ Frontend: Thêm Blockchain Verification UI

### `BlockchainBadge.tsx`
```tsx
// Hiển thị trên mỗi Alert card
const BlockchainBadge = ({ txHash }: { txHash?: string }) => {
  if (!txHash) return <span className="badge badge-pending">⏳ Pending Chain</span>;
  return (
    <a
      href={`https://testnet.cardanoscan.io/transaction/${txHash}`}
      target="_blank"
      className="badge badge-verified"
    >
      🔗 Verified on Cardano
    </a>
  );
};
```

### Trang `BlockchainVerify.tsx`
- Hiển thị danh sách tất cả records đã ghi lên chain
- Cho phép nhập TxHash để verify thủ công
- [Phase 3] Hiển thị IP reputation từ Threat Intel SC
- Thống kê: tổng records on-chain, pending, confirmed, failed

---

## 🌐 Cardano Network & Tools

| Tool | Mục đích | Link |
|---|---|---|
| **Blockfrost** | API gateway đến Cardano node | blockfrost.io |
| **PyCardano** | Python SDK tương tác Cardano | pycardano.readthedocs.io |
| **Aiken** | Ngôn ngữ viết smart contract | aiken-lang.org |
| **Cardano Testnet** | Test miễn phí, faucet ADA | docs.cardano.org/cardano-testnet |
| **Cardanoscan** | Block explorer để verify | testnet.cardanoscan.io |
| **cardano-cli** | CLI tool quản lý wallet/keys | - |

### Cài đặt dependencies
```bash
# Python (Blockchain service + AI Engine)
pip install pycardano blockfrost-python

# Aiken (Smart contract compiler)
# Windows: tải binary từ https://github.com/aiken-lang/aiken/releases

# .NET (Backend service)
dotnet add package Blockfrost.Api  # hoặc dùng HttpClient gọi Blockfrost REST API
```

---

## 📊 Giá Trị Blockchain Mang Lại (Cho Hackathon Pitch)

### Trước khi có Blockchain
```
❌ Dữ liệu tập trung → single point of failure
❌ Admin có thể xóa/sửa audit logs
❌ Không có bằng chứng pháp lý khi xảy ra sự cố
❌ Mỗi tenant hoạt động độc lập, không chia sẻ threat intel
❌ Khách hàng phải tin tưởng hoàn toàn vào nhà cung cấp
```

### Sau khi có Cardano Blockchain
```
✅ Immutable evidence — không ai sửa được lịch sử tấn công
✅ Non-repudiation — bằng chứng pháp lý có thể verify độc lập
✅ Privacy-preserving proof — chỉ đưa hash/metadata tối thiểu lên chain
✅ Transparent audit trail — khách hàng tự verify được
✅ Decentralized threat intelligence roadmap — cộng đồng cùng bảo vệ nhau ở Phase 2/3
✅ Agent-driven response — Agent đọc threat status on-chain rồi cập nhật rule chặn cục bộ
```

---

## 🗺️ Roadmap Tích Hợp (Hackathon Demo)

### Phase 1 — Immutable Evidence Log (Demo được ngay)
- [ ] Setup Blockfrost account + Cardano testnet wallet
- [ ] Viết `CardanoService` (Python) — submit metadata transaction
- [ ] Sửa `AlertsController` — ghi hash alert lên chain sau khi tạo
- [ ] Thêm bảng `BlockchainRecords` vào DB
- [ ] Frontend: hiển thị TxHash + link Cardanoscan trên Alert card/dashboard
- [ ] Demo end-to-end: `Alert → SHA-256 hash → Cardano TxHash → Verify`

### Phase 2 — Audit Verification Dashboard
- [ ] Thêm `BlockchainController` — proof, records, verify endpoints
- [ ] Thêm trang `BlockchainVerify`
- [ ] Verify thủ công bằng TxHash + expected hash
- [ ] Dashboard thống kê on-chain records: pending, confirmed, failed

### Phase 3 — Smart Contract Threat Intelligence
- [ ] Viết `alert_registry.ak` bằng Aiken
- [ ] Viết `threat_intel.ak` — IP reputation system dùng `ipHash`
- [ ] Deploy prototype lên Cardano Preprod testnet
- [ ] AI Engine query IP reputation từ chain để tăng risk score

### Phase 4 — Multi-tenant IP Reputation / Global Threat Status
- [ ] Verified tenant reporting
- [ ] On-chain global threat status khi đủ ngưỡng báo cáo
- [ ] Backend/Agent polling hoặc event watcher đọc trạng thái này
- [ ] Agent tự động cập nhật local firewall/blocking rules

---

## 🎤 Gợi Ý Pitch Hackathon

> *"AI detects the threat. Cardano proves the evidence."*
>
> *VeriChainIDS không chỉ phát hiện và ngăn chặn tấn công mạng bằng AI. Với Cardano, mỗi alert quan trọng được biến thành một SHA-256 evidence hash và được anchor lên blockchain, giúp khách hàng hoặc auditor tự verify rằng bằng chứng không bị chỉnh sửa sau khi phát hiện.*
>
> *Trong phase tiếp theo, khi cùng một IP hash bị nhiều verified tenant báo cáo, smart contract sẽ ghi nhận global threat status. Backend và Agent của VeriChainIDS đọc trạng thái này để tự động cập nhật rule chặn cục bộ. Blockchain cung cấp sự thật có thể kiểm chứng; hệ thống phòng thủ của chúng tôi thực thi phản ứng."*

---

## 📋 Checklist Nhanh Cho Hackathon

```
□ Tạo thư mục Blockchain/
□ Cài pycardano + blockfrost-python
□ Tạo Blockfrost project (free tier) → lấy project_id
□ Tạo Cardano testnet wallet + nhận ADA từ faucet
□ Viết CardanoService.py (submit metadata tx)
□ Thêm BlockchainRecord entity + migration
□ Thêm IBlockchainService + CardanoBlockchainService.cs
□ Sửa AlertsController: ghi hash sau khi tạo alert
□ Frontend: BlockchainBadge component trên Alert cards/dashboard
□ Test end-to-end: tạo alert → hash → submit Cardano metadata → nhận TxHash
□ Verify: so sánh local SHA-256 hash với on-chain metadata hash
□ Chuẩn bị demo: mở Cardanoscan live trong presentation

Phase 2+:
□ Sửa DefenseController: ghi hash block action, không ghi raw IP lên chain
□ Thêm BlockchainController: proof + records + verify endpoints
□ Frontend: trang BlockchainVerify
□ Viết Aiken smart contract prototype cho Alert Registry / Threat Intel
□ Dùng ipHash + tenantHash cho threat intelligence
```

---

*File này được tạo để hỗ trợ team VeriChainIDS chuẩn bị cho hackathon.*  
*Mọi code mẫu là pseudocode/skeleton — cần implement đầy đủ trước khi demo.*
