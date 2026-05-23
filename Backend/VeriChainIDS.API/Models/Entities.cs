using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace VeriChainIDS.API.Models;

public class Tenant
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(200)]
    public string CompanyName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Subdomain { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;

    // Navigation
    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
    public ICollection<Server> Servers { get; set; } = new List<Server>();
    public ICollection<ApiKey> ApiKeys { get; set; } = new List<ApiKey>();
    public ICollection<Alert> Alerts { get; set; } = new List<Alert>();
    public ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();
    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
    public ICollection<AlertDigestQueue> AlertDigestQueue { get; set; } = new List<AlertDigestQueue>();
    public ICollection<BlockchainRecord> BlockchainRecords { get; set; } = new List<BlockchainRecord>();
    public ICollection<EvidenceSnapshot> EvidenceSnapshots { get; set; } = new List<EvidenceSnapshot>();
}

public class User
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? TenantId { get; set; }

    [Required, MaxLength(255), EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string PasswordHash { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string FullName { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Role { get; set; } = "User"; // SuperAdmin, Admin, User

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    public bool TwoFactorEnabled { get; set; } = false;
    public string? TwoFactorSecret { get; set; }
    public bool SessionTimeoutEnabled { get; set; } = false;
    public int SessionTimeoutMinutes { get; set; } = 30;
    public bool EmailAlertsEnabled { get; set; } = true;
    public bool TelegramAlertsEnabled { get; set; } = false;
    public bool PushNotificationsEnabled { get; set; } = true;
    [MaxLength(100)]
    public string? TelegramChatId { get; set; }

    /// <summary>Minimum severity level to receive alerts (Critical, High, Medium, Low). Default: Medium.</summary>
    [MaxLength(20)]
    public string AlertSeverityThreshold { get; set; } = "Medium";

    /// <summary>Alert digest mode: realtime, hourly, daily, weekly. Default: realtime.</summary>
    [MaxLength(20)]
    public string AlertDigestMode { get; set; } = "realtime";

    /// <summary>Base64 avatar image data URL (compressed, max ~50KB).</summary>
    [MaxLength(100_000)]
    public string? AvatarUrl { get; set; }

    // Navigation
    [ForeignKey(nameof(TenantId))]
    public Tenant? Tenant { get; set; }

    public ICollection<Alert> AcknowledgedAlerts { get; set; } = new List<Alert>();
    public ICollection<Alert> ResolvedAlerts { get; set; } = new List<Alert>();
    public ICollection<Ticket> AssignedTickets { get; set; } = new List<Ticket>();
    public ICollection<Ticket> CreatedTickets { get; set; } = new List<Ticket>();
    public ICollection<TicketComment> TicketComments { get; set; } = new List<TicketComment>();
    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
    public ICollection<AlertDigestQueue> AlertDigestQueue { get; set; } = new List<AlertDigestQueue>();
}

public class Subscription
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    [Required, MaxLength(50)]
    public string PlanName { get; set; } = string.Empty; // Starter, Pro, Enterprise

    [Column(TypeName = "decimal(18,2)")]
    public decimal PlanPrice { get; set; } = 0;

    public int MaxServers { get; set; } = 1;

    [Required, MaxLength(50)]
    public string Status { get; set; } = "Trial";

    public DateTime StartDate { get; set; } = DateTime.UtcNow;
    public DateTime EndDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;
}

public class PaymentOrder
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100)]
    public string OrderId { get; set; } = string.Empty;

    public Guid? TenantId { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal Amount { get; set; }

    [MaxLength(10)]
    public string Currency { get; set; } = "VND";

    [Required, MaxLength(50)]
    public string PlanName { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Status { get; set; } = "Pending";

    [MaxLength(100)]
    public string? VnpTxnRef { get; set; }

    [MaxLength(100)]
    public string? VnpayTransactionNo { get; set; }

    [MaxLength(10)]
    public string? VnpayResponseCode { get; set; }

    [MaxLength(50)]
    public string? PaymentMethod { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; }

    [ForeignKey(nameof(TenantId))]
    public Tenant? Tenant { get; set; }
}

public class Server
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string IpAddress { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string ApiKeyHash { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Status { get; set; } = "Offline";

    [MaxLength(100)]
    public string? OS { get; set; }

    [Column(TypeName = "decimal(5,2)")]
    public decimal CpuUsage { get; set; } = 0;

    [Column(TypeName = "decimal(5,2)")]
    public decimal RamUsage { get; set; } = 0;

    [Column(TypeName = "decimal(5,2)")]
    public decimal DiskUsage { get; set; } = 0;

    public DateTime? LastSeenAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Agent Health Check
    [MaxLength(500)]
    public string? HealthUrl { get; set; }

    public DateTime? LastHealthCheckAt { get; set; }

    public bool IsHealthy { get; set; } = false;

    // Navigation
    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    public ICollection<ApiKey> ApiKeys { get; set; } = new List<ApiKey>();
    public ICollection<TrafficLog> TrafficLogs { get; set; } = new List<TrafficLog>();
    public ICollection<Alert> Alerts { get; set; } = new List<Alert>();
    public ICollection<ServerAlertEmail> AlertEmails { get; set; } = new List<ServerAlertEmail>();
    public ICollection<ServerTelegramRecipient> TelegramRecipients { get; set; } = new List<ServerTelegramRecipient>();
}

public class ApiKey
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    public Guid? ServerId { get; set; }

    [Required, MaxLength(500)]
    public string KeyHash { get; set; } = string.Empty;

    /// <summary>Encrypted full API key (DPAPI encrypted, reversible by server admin)</summary>
    public string? EncryptedKey { get; set; }

    [Required, MaxLength(20)]
    public string KeyPrefix { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    public string Permissions { get; set; } = "{\"ingest\":true,\"read\":false,\"write\":false}";

    public DateTime? LastUsedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    [ForeignKey(nameof(ServerId))]
    public Server? Server { get; set; }
}

public class TrafficLog
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    [Required]
    public Guid TenantId { get; set; }

    [Required]
    public Guid ServerId { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [Required, MaxLength(50)]
    public string SourceIp { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? DestinationIp { get; set; }

    public int? SourcePort { get; set; }
    public int? DestinationPort { get; set; }

    [MaxLength(20)]
    public string? Protocol { get; set; }

    public long BytesIn { get; set; } = 0;
    public long BytesOut { get; set; } = 0;
    public long PacketsIn { get; set; } = 0;
    public long PacketsOut { get; set; } = 0;
    public int RequestCount { get; set; } = 1;
    public bool IsAnomaly { get; set; } = false;

    [Column(TypeName = "decimal(5,4)")]
    public decimal? AnomalyScore { get; set; }

    public string? RawPayload { get; set; }

    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    [ForeignKey(nameof(ServerId))]
    public Server Server { get; set; } = null!;
}

public class Alert
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    public Guid? ServerId { get; set; }

    [Required, MaxLength(20)]
    public string Severity { get; set; } = "Low";

    [Required, MaxLength(100)]
    public string AlertType { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    [MaxLength(50)]
    public string? SourceIp { get; set; }

    [MaxLength(200)]
    public string? TargetAsset { get; set; }

    [MaxLength(100)]
    public string? MitreTactic { get; set; }

    [MaxLength(100)]
    public string? MitreTechnique { get; set; }

    [Required, MaxLength(50)]
    public string Status { get; set; } = "Open";

    [Column(TypeName = "decimal(5,4)")]
    public decimal? AnomalyScore { get; set; }

    public string? RecommendedAction { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? AcknowledgedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }

    public Guid? AcknowledgedBy { get; set; }
    public Guid? ResolvedBy { get; set; }

    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    [ForeignKey(nameof(ServerId))]
    public Server? Server { get; set; }

    [ForeignKey(nameof(AcknowledgedBy))]
    public User? AcknowledgedByUser { get; set; }

    [ForeignKey(nameof(ResolvedBy))]
    public User? ResolvedByUser { get; set; }

    public ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();
}

public class Ticket
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    public Guid? AlertId { get; set; }

    [Required, MaxLength(50)]
    public string TicketNumber { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    [Required, MaxLength(20)]
    public string Priority { get; set; } = "Medium";

    [Required, MaxLength(50)]
    public string Status { get; set; } = "OPEN";

    [MaxLength(100)]
    public string? Category { get; set; }

    public Guid? AssignedTo { get; set; }
    public Guid? AssignedBy { get; set; }

    public Guid? CreatedBy { get; set; }  // Nullable cho ticket tự động từ AI Engine

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DueDate { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ClosedAt { get; set; }

    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    [ForeignKey(nameof(AlertId))]
    public Alert? Alert { get; set; }

    [ForeignKey(nameof(AssignedTo))]
    public User? AssignedToUser { get; set; }

    [ForeignKey(nameof(AssignedBy))]
    public User? AssignedByUser { get; set; }

    [ForeignKey(nameof(CreatedBy))]
    public User CreatedByUser { get; set; } = null!;

    public ICollection<TicketComment> Comments { get; set; } = new List<TicketComment>();
}

public class TicketComment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TicketId { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    public string Content { get; set; } = string.Empty;

    public bool IsInternal { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TicketId))]
    public Ticket Ticket { get; set; } = null!;

    [ForeignKey(nameof(UserId))]
    public User User { get; set; } = null!;
}

public class AuditLog
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public Guid? TenantId { get; set; }
    public Guid? UserId { get; set; }

    [Required, MaxLength(200)]
    public string Action { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? EntityType { get; set; }

    [MaxLength(200)]
    public string? EntityId { get; set; }

    [MaxLength(50)]
    public string? IpAddress { get; set; }

    [MaxLength(500)]
    public string? UserAgent { get; set; }

    public string? Details { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }
}

public class BlockchainRecord
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    [Required, MaxLength(50)]
    public string RecordType { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string EntityId { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string DataHash { get; set; } = string.Empty;

    [MaxLength(64)]
    public string? TxHash { get; set; }

    public long? BlockHeight { get; set; }

    [Required, MaxLength(20)]
    public string Status { get; set; } = "Pending";

    [MaxLength(50)]
    public string Network { get; set; } = "preprod";

    [MaxLength(50)]
    public string MetadataLabel { get; set; } = "674";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ConfirmedAt { get; set; }
    public string? ErrorMessage { get; set; }
    public int RetryCount { get; set; } = 0;
    public DateTime? LastRetryAt { get; set; }
    public DateTime? NextRetryAt { get; set; }
    public DateTime? LastSubmittedAt { get; set; }
    public DateTime? LastCheckedAt { get; set; }

    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    public ICollection<EvidenceSnapshot> EvidenceSnapshots { get; set; } = new List<EvidenceSnapshot>();
}

public class EvidenceSnapshot
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    public Guid? BlockchainRecordId { get; set; }

    [Required, MaxLength(50)]
    public string RecordType { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string EntityId { get; set; } = string.Empty;

    [Required, MaxLength(80)]
    public string SchemaVersion { get; set; } = "verichainids.evidence.v1";

    [Required, MaxLength(64)]
    public string SnapshotHash { get; set; } = string.Empty;

    [Required]
    public string SnapshotJson { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    [ForeignKey(nameof(BlockchainRecordId))]
    public BlockchainRecord? BlockchainRecord { get; set; }
}

public class Notification
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Message { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Type { get; set; } = "Info";

    public bool IsRead { get; set; } = false;
    public string? Link { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TenantId))]
    public Tenant Tenant { get; set; } = null!;

    [ForeignKey(nameof(UserId))]
    public User User { get; set; } = null!;
}

/// <summary>
/// Queues alert notifications for digest sending (hourly / daily / weekly).
/// The AlertDigestBackgroundService processes this queue at the configured interval.
/// </summary>
public class AlertDigestQueue
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid TenantId { get; set; }

    [Required]
    public Guid UserId { get; set; }

    /// <summary>Chat ID to send the digest to (denormalised from User for reliability).</summary>
    [Required, MaxLength(100)]
    public string TelegramChatId { get; set; } = string.Empty;

    [Required, MaxLength(20)]
    public string DigestMode { get; set; } = "hourly"; // hourly | daily | weekly

    /// <summary>The alert that triggered this queue entry.</summary>
    public Guid? AlertId { get; set; }

    /// <summary>Alert severity for grouping in digest.</summary>
    [MaxLength(20)]
    public string? Severity { get; set; }

    /// <summary>Alert title for display in digest.</summary>
    [MaxLength(500)]
    public string? AlertTitle { get; set; }

    /// <summary>Full HTML message for the digest entry.</summary>
    public string? AlertMessage { get; set; }

    /// <summary>When the alert was created (UTC).</summary>
    public DateTime AlertCreatedAt { get; set; }

    /// <summary>Whether this entry has been sent and can be cleaned up.</summary>
    public bool IsSent { get; set; } = false;

    /// <summary>When this entry was processed.</summary>
    public DateTime? SentAt { get; set; }

    public DateTime QueuedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TenantId))]
    public Tenant? Tenant { get; set; }

    [ForeignKey(nameof(UserId))]
    public User? User { get; set; }

    [ForeignKey(nameof(AlertId))]
    public Alert? Alert { get; set; }
}

public class BlockedIP
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? TenantId { get; set; }

    /// <summary>
    /// Server ID - if specified, block applies only to this server.
    /// If NULL, block applies to all servers in the tenant (tenant-wide).
    /// </summary>
    public Guid? ServerId { get; set; }

    [Required, MaxLength(45)]
    public string IpAddress { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string AttackType { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Severity { get; set; } = "Medium";

    public decimal? AnomalyScore { get; set; }

    [MaxLength(500)]
    public string? Reason { get; set; }

    [Required, MaxLength(100)]
    public string BlockedBy { get; set; } = "AI-Engine";

    public DateTime BlockedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ExpiresAt { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime? UnblockedAt { get; set; }

    [MaxLength(100)]
    public string? UnblockedBy { get; set; }

    [MaxLength(500)]
    public string? Evidence { get; set; }

    [ForeignKey(nameof(TenantId))]
    public Tenant? Tenant { get; set; }

    [ForeignKey(nameof(ServerId))]
    public Server? Server { get; set; }
}

public class ServerAlertEmail
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ServerId { get; set; }

    [Required, MaxLength(255), EmailAddress]
    public string Email { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(ServerId))]
    public Server Server { get; set; } = null!;
}

public class ServerTelegramRecipient
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ServerId { get; set; }

    [Required, MaxLength(100)]
    public string ChatId { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? DisplayName { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(ServerId))]
    public Server Server { get; set; } = null!;
}

public class PricingPlan
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Column(TypeName = "decimal(18,0)")]
    public decimal Price { get; set; } = 0;

    [Column(TypeName = "decimal(18,0)")]
    public decimal? OriginalPrice { get; set; }

    [MaxLength(20)]
    public string BillingPeriod { get; set; } = "monthly";

    public bool IsActive { get; set; } = true;
    public bool IsPopular { get; set; } = false;
    public bool IsEnterprise { get; set; } = false;
    public bool IsTrial { get; set; } = false;

    public int Servers { get; set; } = 1;
    public int Users { get; set; } = 1;

    [MaxLength(20)]
    public string Storage { get; set; } = "1 GB";

    [MaxLength(20)]
    public string Bandwidth { get; set; } = "100 GB";

    public int ApiCalls { get; set; } = 1000;
    public int DailyAlerts { get; set; } = 100;

    [MaxLength(20)]
    public string Retention { get; set; } = "7 days";

    public int ConcurrentConnections { get; set; } = 10;

    public bool RealTimeMonitoring { get; set; } = true;
    public bool ThreatIntelligence { get; set; } = false;
    public bool AutoResponse { get; set; } = false;
    public bool CustomRules { get; set; } = false;
    public bool WhiteLabel { get; set; } = false;
    public bool PrioritySupport { get; set; } = false;

    [MaxLength(10)]
    public string Sla { get; set; } = "99%";

    [MaxLength(20)]
    public string BackupFrequency { get; set; } = "Daily";

    public bool TeamManagement { get; set; } = false;
    public bool AuditLogs { get; set; } = true;
    public bool ApiAccess { get; set; } = true;
    public bool Sso { get; set; } = false;
    public bool CustomIntegrations { get; set; } = false;
    public bool DedicatedSupport { get; set; } = false;
    public bool SlaCredits { get; set; } = false;

    [MaxLength(2000)]
    public string? Features { get; set; } = "[]";

    public int SortOrder { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Whitelist
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? TenantId { get; set; }

    /// <summary>
    /// Server ID - nếu được chỉ định, whitelist chỉ áp dụng cho server này.
    /// Nếu NULL, whitelist áp dụng cho tất cả server trong tenant.
    /// </summary>
    public Guid? ServerId { get; set; }

    [Required, MaxLength(50)]
    public string IpAddress { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TenantId))]
    public Tenant? Tenant { get; set; }

    [ForeignKey(nameof(ServerId))]
    public Server? Server { get; set; }
}

/// <summary>Tin nhắn liên hệ từ khách hàng gửi cho admin.</summary>
public class ContactMessage
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(255), EmailAddress]
    public string Email { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Subject { get; set; }

    [Required]
    public string Message { get; set; } = string.Empty;

    /// <summary>unread | read | replied</summary>
    [Required, MaxLength(20)]
    public string Status { get; set; } = "unread";

    public string? Reply { get; set; }

    public Guid? RepliedBy { get; set; }

    public DateTime? RepliedAt { get; set; }

    [MaxLength(50)]
    public string? IpAddress { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(RepliedBy))]
    public User? RepliedByUser { get; set; }
}
