using System.ComponentModel.DataAnnotations;

namespace VeriChainIDS.API.Models.DTOs;

// ============ AUTH DTOs ============
public record RegisterRequest(
    [Required] string CompanyName,
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password
);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password,
    string? TwoFactorCode
);

public record AuthResponse(
    string Token,
    UserDto User
);

public record LoginResult(
    bool RequiresTwoFactor,
    string? TempToken
);

public record TwoFactorSetupResponse(
    string Secret,
    string QrCodeBase64,
    string ManualEntryKey
);

public record TwoFactorVerifyRequest(
    [Required] string Code
);

public record TwoFactorSetupRequest(
    [Required] string Code
);

public record AvatarUploadRequest(
    string? AvatarDataUrl
);

public record UserDto(
    Guid Id,
    Guid? TenantId,
    string? TenantName,
    string Email,
    string FullName,
    string Role,
    DateTime? LastLoginAt,
    bool TwoFactorEnabled,
    bool SessionTimeoutEnabled,
    int SessionTimeoutMinutes,
    bool EmailAlertsEnabled,
    bool TelegramAlertsEnabled,
    bool PushNotificationsEnabled,
    string? TelegramChatId,
    string AlertSeverityThreshold,
    string AlertDigestMode,
    string? AvatarUrl
);

public record CreateUserRequest(
    [Required] string Email,
    [Required, MinLength(6)] string Password,
    [Required] string FullName,
    [Required] string Role,  // Admin, User
    Guid? TenantId
);

public record UpdateUserRequest(
    Guid Id,
    string? FullName,
    string? Role,
    bool? IsActive,
    Guid? UpdatedBy
);

public record UpdateNotificationSettingsRequest(
    bool EmailAlertsEnabled,
    bool TelegramAlertsEnabled,
    bool PushNotificationsEnabled,
    string? TelegramChatId,
    string? AlertSeverityThreshold,
    string? AlertDigestMode
);

public record UpdateSecuritySettingsRequest(
    bool TwoFactorEnabled,
    bool SessionTimeoutEnabled,
    int SessionTimeoutMinutes
);

// ============ SERVER DTOs ============
public record ServerDto(
    Guid Id,
    string Name,
    string IpAddress,
    string Status,
    string? OS,
    decimal CpuUsage,
    decimal RamUsage,
    decimal DiskUsage,
    DateTime? LastSeenAt,
    DateTime CreatedAt,
    List<ApiKeyDto>? ApiKeys
);

public record CreateServerRequest(
    [Required] string Name,
    [Required] string IpAddress,
    /// <summary>SuperAdmin có thể bỏ trống — API gán tenant theo subscription mới nhất.</summary>
    Guid? TenantId,
    Guid CreatedBy
);

public record UpdateServerRequest(
    Guid Id,
    string? Name,
    string? Status,
    Guid UpdatedBy
);

// ============ API KEY DTOs ============
public record ApiKeyDto(
    Guid Id,
    Guid ServerId,
    string Name,
    string KeyPrefix,
    string Permissions,
    DateTime? LastUsedAt,
    DateTime? ExpiresAt,
    bool IsActive,
    DateTime CreatedAt
);

public record ApiKeyGeneratedResponse(
    Guid Id,
    string PlainApiKey,
    string Name,
    DateTime CreatedAt
);

// ============ LOG INGEST DTOs ============
public record LogIngestRequest(
    List<TrafficLogEntry> Logs,
    string? Hostname,
    string? Os,
    string? Timestamp,
    double? CpuPercent,
    double? RamPercent,
    double? DiskPercent
);

public record TrafficLogEntry(
    string SourceIp,
    string? DestinationIp,
    int? SourcePort,
    int? DestinationPort,
    string? Protocol,
    long BytesIn,
    long BytesOut,
    long PacketsIn,
    long PacketsOut,
    int RequestCount,
    string? RawPayload
);

// ============ ALERT DTOs ============
public record AlertDto(
    Guid Id,
    Guid TenantId,
    Guid? ServerId,
    string? ServerName,
    string Severity,
    string AlertType,
    string Title,
    string? Description,
    string? SourceIp,
    string? TargetAsset,
    string? MitreTactic,
    string? MitreTechnique,
    string Status,
    decimal? AnomalyScore,
    string? RecommendedAction,
    DateTime CreatedAt,
    DateTime? AcknowledgedAt,
    DateTime? ResolvedAt,
    string? AcknowledgedByName,
    string? ResolvedByName,
    BlockchainRecordDto? BlockchainProof = null
);

public record TriggerAlertRequest(
    Guid? TenantId,   // Nullable — nếu gửi từ AI Engine (X-API-Key), lấy từ middleware
    Guid? ServerId,
    [Required] string Severity,
    [Required] string AlertType,
    [Required] string Title,
    string? Description,
    string? SourceIp,
    string? TargetAsset,
    string? MitreTactic,
    string? MitreTechnique,
    decimal? AnomalyScore,
    string? RecommendedAction
);

public record UpdateAlertStatusRequest(
    Guid AlertId,
    [Required] string Status,
    Guid? UpdatedBy
);

// ============ TICKET DTOs ============
public record TicketDto(
    Guid Id,
    Guid TenantId,
    Guid? AlertId,
    string TicketNumber,
    string Title,
    string? Description,
    string Priority,
    string Status,
    string? Category,
    string? AssignedToName,
    string? CreatedByName,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DueDate,
    DateTime? ResolvedAt,
    DateTime? ClosedAt,
    List<TicketCommentDto>? Comments
);

public record TicketCommentDto(
    Guid Id,
    Guid TicketId,
    Guid UserId,
    string UserName,
    string Content,
    bool IsInternal,
    DateTime CreatedAt
);

public record CreateTicketRequest(
    Guid? TenantId,  // SuperAdmin phải truyền, Admin/User lấy từ JWT
    Guid? AlertId,
    [Required] string Title,
    string? Description,
    [Required] string Priority,
    string? Category,
    Guid? AssignedTo,
    Guid CreatedBy
);

public record UpdateTicketStatusRequest(
    Guid TicketId,
    [Required] string Status,
    Guid UpdatedBy,
    string? Comment
);

public record AssignTicketRequest(
    Guid TicketId,
    Guid? AssignedTo,
    Guid AssignedBy,
    string? Comment
);

public record AddTicketCommentRequest(
    Guid TicketId,
    Guid UserId,
    [Required] string Content,
    bool IsInternal
);

// ============ PAYMENT DTOs ============
public record CreatePaymentRequest(
    Guid TenantId, // Not required - SuperAdmin can use Guid.Empty
    [Required] string PlanName,
    [Required] decimal Amount
);

public record PaymentResponse(
    string OrderId,
    string PaymentUrl
);

public record VnpayReturnRequest(
    string vnp_TmnCode,
    string vnp_Amount,
    string vnp_BankCode,
    string vnp_CardType,
    string vnp_OrderInfo,
    string vnp_PayDate,
    string vnp_ResponseCode,
    string vnp_SecureHash,
    string vnp_TxnRef,
    string vnp_TransactionNo,
    string vnp_TransactionStatus,
    string vnp_VnpayTransactionNo
);

// ============ REPORT DTOs ============
public record ReportFilter(
    DateTime StartDate,
    DateTime EndDate,
    Guid? TenantId,
    string? Status,
    string? Severity
);

public record ReportResponse(
    DateTime GeneratedAt,
    DateTime StartDate,
    DateTime EndDate,
    string TenantName,
    int TotalAlerts,
    int OpenAlerts,
    int ResolvedAlerts,
    int TotalTickets,
    int OpenTickets,
    int InProgressTickets,
    int ClosedTickets,
    List<ThreatSourceDto> TopAttackers,
    List<AlertTypeStatDto> AlertsByType,
    List<DailyStatDto> DailyAlerts,
    List<DailyStatDto> DailyTickets
);

public record ThreatSourceDto(
    string IpAddress,
    int AttackCount,
    string MostCommonType
);

public record AlertTypeStatDto(
    string AlertType,
    int Count,
    string Severity
);

public record DailyStatDto(
    DateTime Date,
    int AlertCount,
    int TicketCount
);

// ============ NOTIFICATION DTOs ============
public record NotificationDto(
    Guid Id,
    Guid TenantId,
    Guid UserId,
    string Title,
    string Message,
    string Type,
    bool IsRead,
    string? Link,
    DateTime CreatedAt
);

// ============ AUDIT LOG DTOs ============
public record AuditLogDto(
    long Id,
    Guid? TenantId,
    Guid? UserId,
    string? UserName,
    string Action,
    string? EntityType,
    string? EntityId,
    string? IpAddress,
    DateTime Timestamp,
    string? Details
);

// ============ BLOCKCHAIN DTOs ============
public record BlockchainRecordDto(
    Guid Id,
    Guid TenantId,
    string RecordType,
    string EntityId,
    string DataHash,
    string? TxHash,
    long? BlockHeight,
    string Status,
    string Network,
    string MetadataLabel,
    DateTime CreatedAt,
    DateTime? ConfirmedAt,
    string? ErrorMessage,
    string? ExplorerUrl,
    int RetryCount = 0,
    DateTime? LastRetryAt = null,
    DateTime? NextRetryAt = null,
    DateTime? LastSubmittedAt = null,
    DateTime? LastCheckedAt = null
);

public record BlockchainStatsDto(
    int TotalRecords,
    int PendingRecords,
    int ConfirmedRecords,
    int FailedRecords,
    int AlertRecords,
    int BlockIpRecords,
    int AuditLogRecords
);

public record BlockchainVerifyRequest(
    [Required] string TxHash,
    [Required] string ExpectedHash
);

public record BlockchainVerifyResponse(
    bool IsValid,
    string TxHash,
    string ExpectedHash,
    string? OnChainHash,
    string Source,
    string Message,
    string? ExplorerUrl
);

public record CardanoTransactionStatus(
    bool Exists,
    long? BlockHeight,
    DateTime? BlockTime,
    string? ErrorMessage
);

public record BlockchainHealthDto(
    string Network,
    string SubmissionMode,
    string SubmitterStatus,
    bool? SubmitterOnline,
    decimal? WalletAda,
    long? WalletLovelace,
    bool? WalletFunded,
    bool BlockfrostConfigured,
    string? CardanoAddress,
    DateTime? LastSuccessfulSubmit,
    string? LastSuccessfulTxHash,
    string? LastError,
    DateTime CheckedAt
);

public record EvidenceSnapshotDto(
    Guid Id,
    string RecordType,
    string EntityId,
    string SchemaVersion,
    string SnapshotHash,
    string SnapshotJson,
    DateTime CreatedAt
);

public record BlockchainProofReportDto(
    Guid EvidenceId,
    string RecordType,
    string EntityId,
    string DataHash,
    string? TxHash,
    string Network,
    string MetadataLabel,
    long? BlockHeight,
    DateTime CreatedAt,
    DateTime? ConfirmedAt,
    string Status,
    bool? VerifyResult,
    string VerifyMessage,
    string? CardanoscanLink,
    int RetryCount,
    string? ErrorMessage,
    EvidenceSnapshotDto? Snapshot
);

public record BlockchainAnchorAlertRequest(
    [Required] Guid AlertId
);

public record ReportMaliciousIpRequest(
    [Required] string IpAddress,
    string? AttackType,
    string? Severity
);

public record IpReputationResult(
    string IpAddress,
    string IpHash,
    int ReportCount,
    double SeverityScore,
    DateTime? LastReported,
    bool IsGloballyBlocked
);

// ============ DASHBOARD DTOs ============
public record DashboardSummary(
    int TotalServers,
    int OnlineServers,
    int OfflineServers,
    int TotalAlerts,
    int OpenAlerts,
    int CriticalAlerts,
    int TotalTickets,
    int OpenTickets,
    int ClosedTicketsToday,
    decimal TotalRequests,
    decimal AvgResponseMs,
    decimal CurrentBandwidthIn,
    decimal CurrentBandwidthOut,
    List<ServerHealthDto> ServerHealth,
    List<AlertDto> RecentAlerts,
    List<TrafficPointDto>? TrafficData,
    List<AttackTypeDto>? AttackTypes,
    List<MitrelDto>? MitreData
);

public record TrafficPointDto(string Time, decimal Requests, decimal Attacks);
public record AttackTypeDto(string Name, decimal Value, string Color);
public record MitrelDto(string Technique, string Name, int Count, string Risk);

public record ServerHealthDto(
    Guid Id,
    string Name,
    string IpAddress,
    string Status,
    decimal CpuUsage,
    decimal RamUsage,
    decimal DiskUsage,
    DateTime? LastSeenAt
);

// ============ SUBSCRIPTION DTOs ============
public record SubscriptionDto(
    Guid Id,
    Guid TenantId,
    string PlanName,
    decimal PlanPrice,
    int MaxServers,
    int UsedServers,
    string Status,
    DateTime StartDate,
    DateTime EndDate,
    int DaysRemaining
);

// ============ PAGINATION ============
public record PagedResult<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);

// ============ COMMON ============
public record ApiResponse<T>(
    bool Success,
    string Message,
    T? Data
);

public record ApiErrorResponse(
    bool Success,
    string Message,
    List<string>? Errors
);

// ============ SERVER ALERT EMAIL DTOs ============
public record ServerAlertEmailDto(
    Guid Id,
    Guid ServerId,
    string Email,
    bool IsActive,
    DateTime CreatedAt
);

public record AddServerAlertEmailRequest(
    string Email
);

// ============ SERVER TELEGRAM RECIPIENT DTOs ============
public record ServerTelegramRecipientDto(
    Guid Id,
    Guid ServerId,
    string ChatId,
    string? DisplayName,
    bool IsActive,
    DateTime CreatedAt
);

public record AddServerTelegramRecipientRequest(
    string ChatId,
    string? DisplayName
);

// ============ AGENT DTOs ============
public record AgentWhoAmIResponse(Guid? ServerId, Guid? TenantId, string? ServerName);

public record AgentRegisterRequest(
    Guid ServerId,       // suggested/idempotent server ID (từ Agent, deterministic theo hostname)
    string Hostname,     // required
    string? IpAddress,
    string? Os,
    string? HealthUrl    // Agent health check URL, vd: http://192.168.1.100:17999
);

// ============ WHITELIST DTOs ============
public record WhitelistDto(
    Guid Id,
    Guid? TenantId,
    Guid? ServerId,
    string IpAddress,
    string? Description,
    string? ServerName,
    DateTime CreatedAt
);

public record AddWhitelistRequest(
    string IpAddress,
    string? Description,
    Guid? ServerId  // Nếu NULL thì là whitelist tenant-wide
);

// ============ SUBSCRIPTION DTOs ============
public record UpdateSubscriptionRequest(
    [Required] Guid PlanId,
    DateTime? StartDate,
    DateTime? EndDate,
    int? DurationMonths
);
