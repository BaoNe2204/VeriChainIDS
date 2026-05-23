using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Extensions;
using VeriChainIDS.API.Hubs;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using VeriChainIDS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/alerts")]
public class AlertsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IHubContext<AlertHub, IAlertHub> _alertHub;
    private readonly IEmailService _emailService;
    private readonly ITelegramService _telegramService;
    private readonly IBlockchainService _blockchainService;
    private readonly ILogger<AlertsController> _logger;
    private readonly IConfiguration _configuration = null!;

    public AlertsController(
        VeriChainIDSDbContext db,
        IHubContext<AlertHub, IAlertHub> alertHub,
        IEmailService emailService,
        ITelegramService telegramService,
        IBlockchainService blockchainService,
        ILogger<AlertsController> logger,
        IConfiguration configuration)
    {
        _db = db;
        _alertHub = alertHub;
        _emailService = emailService;
        _telegramService = telegramService;
        _blockchainService = blockchainService;
        _logger = logger;
        _configuration = configuration;
    }

    /// <summary>AI Engine gọi webhook này để tạo alert</summary>
    [HttpPost("trigger")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<AlertDto>>> TriggerAlert([FromBody] TriggerAlertRequest request)
    {
        // Ưu tiên TenantId từ request, fallback từ API Key middleware (AI Engine)
        var tenantId = request.TenantId ?? HttpContext.Items["TenantId"] as Guid?;

        if (!tenantId.HasValue)
        {
            _logger.LogError("TriggerAlert: TenantId is null. request.TenantId={ReqTid}, Items[TenantId]={CtxTid}",
                request.TenantId, HttpContext.Items["TenantId"]);
            return BadRequest(new ApiResponse<object>(false, "TenantId is required.", null));
        }

        // 1. Kiểm tra IP có trong Whitelist không
        // Hỗ trợ cả tenant-wide (ServerId=null) lẫn server-specific (ServerId=có giá trị)
        var isWhitelisted = await _db.Whitelists
            .AnyAsync(w => w.IpAddress == request.SourceIp
                && w.TenantId == tenantId
                && (w.ServerId == null || w.ServerId == request.ServerId));

        if (isWhitelisted)
        {
            _logger.LogInformation("[WHITELIST] IP {Ip} nam trong Whitelist (ServerId={ServerId}) — bo qua alert.",
                request.SourceIp, request.ServerId);
            return Ok(new ApiResponse<object>(true, "Whitelisted IP — alert ignored.", new { ip = request.SourceIp }));
        }

        try
        {
            var alert = new Alert
            {
                TenantId = tenantId.Value,
                ServerId = request.ServerId,
                Severity = request.Severity,
                AlertType = request.AlertType,
                Title = request.Title,
                Description = request.Description,
                SourceIp = request.SourceIp,
                TargetAsset = request.TargetAsset,
                MitreTactic = request.MitreTactic,
                MitreTechnique = request.MitreTechnique,
                AnomalyScore = request.AnomalyScore,
                RecommendedAction = request.RecommendedAction,
                Status = "Open"
            };

            _db.Alerts.Add(alert);
            await _db.SaveChangesAsync();

            BlockchainRecord? blockchainProof = null;
            try
            {
                blockchainProof = await _blockchainService.RecordAlertAsync(alert, HttpContext.RequestAborted);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Blockchain recording failed for alert {AlertId}", alert.Id);
            }

            _db.AuditLogs.Add(new AuditLog
            {
                TenantId = tenantId,
                UserId = null, // Alert triggered by external agent — no authenticated user
                Action = "ALERT_TRIGGERED",
                EntityType = "Alert",
                EntityId = alert.Id.ToString(),
                Details = $"Alert [{alert.Severity}] {alert.AlertType}: {alert.Title} from {alert.SourceIp ?? "unknown"}"
            });

            if (request.ServerId.HasValue)
            {
                var server = await _db.Servers.FindAsync(request.ServerId.Value);
                if (server != null && request.Severity is "High" or "Critical")
                    server.Status = "Warning";
                await _db.SaveChangesAsync();
            }

            var ticket = await CreateAutoTicket(alert);
            await SendAlertNotifications(alert, ticket);
            await _alertHub.Clients.Group(tenantId.Value.ToString()).ReceiveAlert(MapAlertDto(alert, blockchainProof));

            _logger.LogWarning("ALERT TRIGGERED: {Type} - {Title} | Severity: {Severity} | Source: {SourceIp}",
                request.AlertType, request.Title, request.Severity, request.SourceIp);

            return Ok(new ApiResponse<AlertDto>(true, "Alert đã được tạo!", MapAlertDto(alert, blockchainProof)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TriggerAlert failed: {Message} | Inner: {Inner}",
                ex.Message, ex.InnerException?.Message);
            return StatusCode(500, new ApiResponse<object>(false, $"Lỗi: {ex.InnerException?.Message ?? ex.Message}", null));
        }
    }

    /// <summary>Lấy danh sách alerts</summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<ApiResponse<PagedResult<AlertDto>>>> GetAlerts(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? severity = null,
        [FromQuery] string? status = null,
        [FromQuery] string? alertType = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<Alert> query = _db.Alerts
            .Include(a => a.Server)
            .Include(a => a.AcknowledgedByUser)
            .Include(a => a.ResolvedByUser);

        if (role != "SuperAdmin")
        {
            if (tenantId.HasValue)
                query = query.Where(a => a.TenantId == tenantId.Value);
            else
                return Forbid();
        }

        if (!string.IsNullOrEmpty(severity))
            query = query.Where(a => a.Severity == severity);
        if (!string.IsNullOrEmpty(status))
            query = query.Where(a => a.Status == status);
        if (!string.IsNullOrEmpty(alertType))
            query = query.Where(a => a.AlertType == alertType);
        if (fromDate.HasValue)
            query = query.Where(a => a.CreatedAt >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(a => a.CreatedAt <= toDate.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var alertEntityIds = items.Select(a => a.Id.ToString()).ToList();
        var proofs = await _db.BlockchainRecords
            .AsNoTracking()
            .Where(r => r.RecordType == "Alert" && alertEntityIds.Contains(r.EntityId))
            .ToDictionaryAsync(r => r.EntityId);

        return Ok(new ApiResponse<PagedResult<AlertDto>>(true, "OK", new PagedResult<AlertDto>(
            items.Select(a => MapAlertDto(a, proofs.GetValueOrDefault(a.Id.ToString()))).ToList(),
            totalCount,
            page,
            pageSize,
            (int)Math.Ceiling(totalCount / (double)pageSize)
        )));
    }

    /// <summary>Lấy chi tiết alert</summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<AlertDto>>> GetAlert(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var alert = await _db.Alerts
            .Include(a => a.Server)
            .Include(a => a.AcknowledgedByUser)
            .Include(a => a.ResolvedByUser)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (alert == null)
            return NotFound(new ApiResponse<AlertDto>(false, "Alert không tìm thấy.", null));

        if (role != "SuperAdmin" && alert.TenantId != tenantId)
            return Forbid();

        var proof = await _db.BlockchainRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TenantId == alert.TenantId && r.RecordType == "Alert" && r.EntityId == alert.Id.ToString());

        return Ok(new ApiResponse<AlertDto>(true, "OK", MapAlertDto(alert, proof)));
    }

    /// <summary>Cập nhật trạng thái alert</summary>
    [HttpPut("{id:guid}/status")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<AlertDto>>> UpdateAlertStatus(Guid id, [FromBody] UpdateAlertStatusRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var alert = await _db.Alerts
            .Include(a => a.Server)
            .Include(a => a.AcknowledgedByUser)
            .Include(a => a.ResolvedByUser)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (alert == null)
            return NotFound(new ApiResponse<AlertDto>(false, "Alert không tìm thấy.", null));

        if (role != "SuperAdmin" && alert.TenantId != tenantId)
            return Forbid();

        var userId = GetUserId();

        alert.Status = request.Status;
        if (request.Status == "Acknowledged")
            alert.AcknowledgedBy = request.UpdatedBy ?? userId;
        if (request.Status == "Resolved")
            alert.ResolvedBy = request.UpdatedBy ?? userId;

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = alert.TenantId,
            UserId = userId,
            Action = request.Status == "Acknowledged" ? "ALERT_ACKNOWLEDGED" : "ALERT_RESOLVED",
            EntityType = "Alert",
            EntityId = alert.Id.ToString(),
            Details = $"Alert [{alert.Severity}] {alert.AlertType} status changed to {request.Status}"
        });

        await _db.SaveChangesAsync();

        var proof = await _db.BlockchainRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TenantId == alert.TenantId && r.RecordType == "Alert" && r.EntityId == alert.Id.ToString());

        var dto = MapAlertDto(alert, proof);
        await _alertHub.Clients.Group(alert.TenantId.ToString()).ReceiveAlert(dto);

        return Ok(new ApiResponse<AlertDto>(true, $"Alert status updated to {request.Status}", dto));
    }

    /// <summary>Xóa alert</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteAlert(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();
        var userId = GetUserId();

        var alert = await _db.Alerts.FindAsync(id);
        if (alert == null)
            return NotFound(new ApiResponse<object>(false, "Alert không tìm thấy.", null));

        if (role != "SuperAdmin" && alert.TenantId != tenantId)
            return Forbid();

        var alertInfo = $"[{alert.Severity}] {alert.AlertType}: {alert.Title}";

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = alert.TenantId,
            UserId = userId,
            Action = "ALERT_DELETED",
            EntityType = "Alert",
            EntityId = alert.Id.ToString(),
            Details = $"Alert {alertInfo} was deleted"
        });

        _db.Alerts.Remove(alert);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "Alert deleted successfully", null));
    }

    // --- Helpers ---

    private async Task<Ticket> CreateAutoTicket(Alert alert)
    {
        var ticketNumber = $"TK-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpper()}";

        // Lấy user admin đầu tiên của tenant để gán CreatedBy (tránh FK violation)
        var adminUserId = await _db.Users
            .Where(u => u.TenantId == alert.TenantId && (u.Role == "Admin" || u.Role == "SuperAdmin"))
            .Select(u => (Guid?)u.Id)
            .FirstOrDefaultAsync();

        var ticket = new Ticket
        {
            TenantId = alert.TenantId,
            AlertId = alert.Id,
            TicketNumber = ticketNumber,
            Title = $"[Auto] {alert.Title}",
            Description = alert.Description,
            Priority = alert.Severity,
            Status = "OPEN",
            Category = "Security",
            CreatedBy = adminUserId // null nếu không có admin nào trong tenant
        };

        _db.Tickets.Add(ticket);

        // Audit
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = alert.TenantId,
            Action = "AUTO_TICKET_CREATED",
            EntityType = "Ticket",
            EntityId = ticket.Id.ToString(),
            Details = $"Auto ticket {ticketNumber} created from alert {alert.AlertType}"
        });

        await _db.SaveChangesAsync();
        return ticket;
    }

    private async Task SendAlertNotifications(Alert alert, Ticket ticket)
    {
        // In-app notifications: gửi đến tất cả user trong tenant (SignalR + DB notification)
        var users = await _db.Users
            .Where(u => u.TenantId == alert.TenantId && u.IsActive)
            .ToListAsync();

        var server = await _db.Servers.FindAsync(alert.ServerId);

        foreach (var user in users)
        {
            // DB notification
            _db.Notifications.Add(new Notification
            {
                TenantId = alert.TenantId,
                UserId = user.Id,
                Title = $"[{alert.Severity}] {alert.AlertType}",
                Message = alert.Title,
                Type = alert.Severity == "Critical" ? "Alert" : "Warning",
                Link = $"/dashboard/tickets/{ticket.Id}"
            });

            // SignalR real-time push
            var notifDto = new NotificationDto(
                Guid.NewGuid(), alert.TenantId, user.Id,
                $"[{alert.Severity}] {alert.AlertType}",
                alert.Title,
                alert.Severity == "Critical" ? "Alert" : "Warning",
                false,
                $"/dashboard/tickets/{ticket.Id}",
                DateTime.UtcNow
            );
            await _alertHub.Clients.Group(alert.TenantId.ToString()).NotificationReceived(notifDto);
        }

        // Email alert: CHỈ gửi đến danh sách ServerAlertEmails (cấu hình riêng cho từng server)
        // KHÔNG gửi email đến bảng Users
        var serverAlertEmails = await _db.ServerAlertEmails
            .Where(e => e.IsActive && e.ServerId == alert.ServerId)
            .ToListAsync();

        foreach (var alertEmail in serverAlertEmails)
        {
            try
            {
                await _emailService.SendAlertEmailAsync(alert.TenantId, alertEmail.Email, alert, server);
                _logger.LogInformation("Alert email sent to {Email} for server {ServerId}",
                    alertEmail.Email, alert.ServerId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send alert email to {Email}", alertEmail.Email);
            }
        }

        // Telegram — route per-user based on their digest mode + severity threshold
        await RouteTelegramAlert(alert, server, ticket);

        await _db.SaveChangesAsync();
    }

    private async Task RouteTelegramAlert(Alert alert, Server? server, Ticket? ticket)
    {
        if (!IsTelegramEnabled())
            return;

        // Step 1: Always send to server-level recipients (they are independent of user digest settings)
        var serverRecipients = new List<string>();
        if (alert.ServerId.HasValue)
        {
            var rawChatIds = await _db.ServerTelegramRecipients
                .Where(r => r.ServerId == alert.ServerId.Value && r.IsActive)
                .Select(r => r.ChatId)
                .ToListAsync();

            var disabledChats = await _db.Users
                .Where(u => u.TenantId == alert.TenantId && u.IsActive && u.TelegramChatId != null && !u.TelegramAlertsEnabled)
                .Select(u => u.TelegramChatId!)
                .ToListAsync();

            var disabledSet = new HashSet<string>(disabledChats.Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()), StringComparer.Ordinal);

            serverRecipients = rawChatIds
                .Where(c => !string.IsNullOrWhiteSpace(c) && !disabledSet.Contains(c.Trim()))
                .Select(c => c.Trim())
                .ToList();
        }

        // Step 2: Check user-level recipients
        var allUsers = await _db.Users
            .Where(u => u.TenantId == alert.TenantId
                        && u.IsActive
                        && u.TelegramAlertsEnabled
                        && !string.IsNullOrWhiteSpace(u.TelegramChatId))
            .ToListAsync();

        var realtimeUsers = allUsers.Where(u => MeetsSeverityThreshold(alert.Severity, u.AlertSeverityThreshold) && u.AlertDigestMode == "realtime").ToList();
        var digestUsers = allUsers.Where(u => MeetsSeverityThreshold(alert.Severity, u.AlertSeverityThreshold) && u.AlertDigestMode != "realtime").ToList();

        var hasRealtimeRecipients = serverRecipients.Count > 0 || realtimeUsers.Count > 0;

        if (hasRealtimeRecipients)
        {
            var sent = await _telegramService.SendAlertAsync(alert.TenantId, alert, server, ticket);
            _logger.LogInformation("Telegram alert sent. ServerRecipients={ServerCount}, RealtimeUsers={RealtimeCount}, DigestUsers={DigestCount}, SentCount={SentCount}, AlertId={AlertId}",
                serverRecipients.Count, realtimeUsers.Count, digestUsers.Count, sent, alert.Id);
        }

        if (digestUsers.Count > 0)
        {
            await _telegramService.QueueAlertAsync(alert.TenantId, alert, server, ticket);
            _logger.LogInformation("Queued {Count} digest entries for alert {AlertId}", digestUsers.Count, alert.Id);
        }

        if (!hasRealtimeRecipients && digestUsers.Count == 0)
        {
            _logger.LogInformation("No Telegram recipients matched for alert {AlertId}. ServerRecipients={Srv}, RealtimeUsers={RT}, DigestUsers={Dig}",
                alert.Id, serverRecipients.Count, realtimeUsers.Count, digestUsers.Count);
        }
    }

    private static bool MeetsSeverityThreshold(string alertSeverity, string userThreshold)
    {
        var order = new[] { "Low", "Medium", "High", "Critical" };
        var alertIdx = Array.IndexOf(order, alertSeverity);
        if (alertIdx < 0) alertIdx = 0;
        var thresholdIdx = Array.IndexOf(order, userThreshold);
        if (thresholdIdx < 0) thresholdIdx = 1; // default Medium
        return alertIdx >= thresholdIdx;
    }

    private bool IsTelegramEnabled()
    {
        var enabled = _configuration["TelegramBot:Enabled"];
        return bool.TryParse(enabled, out var value) && value;
    }

    private AlertDto MapAlertDto(Alert a, BlockchainRecord? proof = null) => new(
        a.Id,
        a.TenantId,
        a.ServerId,
        a.Server?.Name,
        a.Severity,
        a.AlertType,
        a.Title,
        a.Description,
        a.SourceIp,
        a.TargetAsset,
        a.MitreTactic,
        a.MitreTechnique,
        a.Status,
        a.AnomalyScore,
        a.RecommendedAction,
        a.CreatedAt,
        a.AcknowledgedAt,
        a.ResolvedAt,
        a.AcknowledgedByUser?.FullName,
        a.ResolvedByUser?.FullName,
        MapBlockchainRecordDto(proof)
    );

    private BlockchainRecordDto? MapBlockchainRecordDto(BlockchainRecord? record) =>
        record == null
            ? null
            : new BlockchainRecordDto(
                record.Id,
                record.TenantId,
                record.RecordType,
                record.EntityId,
                record.DataHash,
                record.TxHash,
                record.BlockHeight,
                record.Status,
                record.Network,
                record.MetadataLabel,
                record.CreatedAt,
                record.ConfirmedAt,
                record.ErrorMessage,
                _blockchainService.GetExplorerUrl(record.TxHash, record.Network)
            );

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? Guid.Empty.ToString());

    private Guid? GetTenantId()
    {
        if (HttpContext.Items.TryGetValue("TenantId", out var tenantObj) && tenantObj is Guid tenantFromKey)
            return tenantFromKey;
        var val = User.FindFirstValue("tenantId");
        return val != null ? Guid.Parse(val) : null;
    }

    private string GetUserRole() =>
        User.FindFirstValue(ClaimTypes.Role) ?? "User";
}
