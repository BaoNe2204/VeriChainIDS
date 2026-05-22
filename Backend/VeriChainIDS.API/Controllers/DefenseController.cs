using System.ComponentModel.DataAnnotations;
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
using Microsoft.EntityFrameworkCore.Storage;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/defense")]
[Authorize]
public class DefenseController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IHubContext<AlertHub, IAlertHub> _alertHub;
    private readonly IHubContext<AgentHub, IAgentHub> _agentHub;
    private readonly ILogger<DefenseController> _logger;
    private readonly IEmailService _emailService;
    private readonly ITelegramService _telegramService;
    private readonly IConfiguration _configuration;
    private readonly IServiceScopeFactory _scopeFactory;

    public DefenseController(
        VeriChainIDSDbContext db,
        IHubContext<AlertHub, IAlertHub> alertHub,
        IHubContext<AgentHub, IAgentHub> agentHub,
        ILogger<DefenseController> logger,
        IEmailService emailService,
        ITelegramService telegramService,
        IConfiguration configuration,
        IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _alertHub = alertHub;
        _agentHub = agentHub;
        _logger = logger;
        _emailService = emailService;
        _telegramService = telegramService;
        _configuration = configuration;
        _scopeFactory = scopeFactory;
    }

    // ============================================================================
    // POST /api/defense/block-ip
    // AI Engine / Agent gọi khi phát hiện tấn công nghiêm trọng
    // ============================================================================
    [HttpPost("block-ip")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<object>>> BlockIP([FromBody] BlockIPRequest request)
    {
        // Ưu tiên: dùng TenantId từ request.ServerId (Agent/AI Engine)
        // Nếu không có, dùng TenantId từ API Key auth (middleware đã set context.Items)
        Guid effectiveTenantId;
        if (request.ServerId.HasValue)
        {
            var server = await _db.Servers.FindAsync(request.ServerId.Value);
            if (server == null)
                return NotFound(new ApiResponse<object>(false, $"Server {request.ServerId} not found.", null));
            effectiveTenantId = server.TenantId;
        }
        else
        {
            var tenantFromAuth = GetTenantId();
            if (!tenantFromAuth.HasValue)
                return BadRequest(new ApiResponse<object>(false, "TenantId không xác định được. Cần truyền ServerId hoặc dùng API Key có TenantId.", null));
            effectiveTenantId = tenantFromAuth.Value;
        }

        // Rate limit: max 10 blocks/minute per tenant (không cần serializable — chỉ đếm)
        var oneMinuteAgo = DateTime.UtcNow.AddMinutes(-1);
        var recentBlocks = await _db.BlockedIPs
            .Where(b => b.TenantId == effectiveTenantId && b.BlockedAt > oneMinuteAgo)
            .CountAsync();

        if (recentBlocks >= 10)
            return BadRequest(new ApiResponse<object>(false, "Rate limit exceeded. Max 10 blocks per minute.", null));

        // 2. Kiểm tra IP có trong Whitelist không — nếu có, bỏ qua block và notification
        // Hỗ trợ cả tenant-wide (ServerId=null) lẫn server-specific (ServerId=có giá trị)
        var isWhitelisted = await _db.Whitelists
            .AnyAsync(w => w.IpAddress == request.Ip
                && w.TenantId == effectiveTenantId
                && (w.ServerId == null || w.ServerId == request.ServerId));

        if (isWhitelisted)
        {
            _logger.LogInformation("[BLOCK] IP {Ip} nam trong Whitelist (ServerId={ServerId}) — bo qua block va notification.",
                request.Ip, request.ServerId);
            return Ok(new ApiResponse<object>(true, "Whitelisted IP — block ignored.", new { ip = request.Ip }));
        }

        // Retry loop: xử lý race condition khi nhiều request chặn cùng 1 IP một lúc
        const int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            try
            {
                return await TryBlockIP(request, effectiveTenantId);
            }
            catch (DbUpdateException) when (attempt < maxRetries - 1)
            {
                // Unique constraint vi phạm → có request khác đã insert cùng IP → retry để lấy bản ghi đó
                _logger.LogWarning("[BLOCK] Concurrent insert detected for {Ip}, retrying (attempt {N})",
                    request.Ip, attempt + 2);
                _db.ChangeTracker.Clear();
            }
            catch (DbUpdateConcurrencyException) when (attempt < maxRetries - 1)
            {
                _logger.LogWarning("[BLOCK] Concurrency conflict for {Ip}, retrying (attempt {N})",
                    request.Ip, attempt + 2);
                _db.ChangeTracker.Clear();
            }
        }

        return StatusCode(503, new ApiResponse<object>(false,
            "Không thể chặn IP do xung đột truy cập. Vui lòng thử lại.", null));
    }

    /// <summary>Thực hiện chặn IP trong transaction serializable để tránh race condition.</summary>
    private async Task<ActionResult<ApiResponse<object>>> TryBlockIP(BlockIPRequest request, Guid effectiveTenantId)
    {
        return await _db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            try
            {
                // Check xem đã bị block chưa (trong transaction)
                var existing = await _db.BlockedIPs
                    .FirstOrDefaultAsync(b =>
                        b.IpAddress == request.Ip &&
                        b.IsActive &&
                        b.TenantId == effectiveTenantId &&
                        (request.ServerId.HasValue ? b.ServerId == request.ServerId : b.ServerId == null));

                if (existing != null)
                {
                    existing.AttackType = request.AttackType ?? existing.AttackType;
                    existing.Severity = request.Severity ?? existing.Severity;
                    existing.Reason = request.Reason ?? existing.Reason;
                    existing.BlockedAt = DateTime.UtcNow;
                    existing.BlockedBy = request.BlockedBy ?? existing.BlockedBy;
                    existing.IsActive = true;
                    existing.ExpiresAt = request.BlockDurationMinutes.HasValue
                        ? DateTime.UtcNow.AddMinutes(request.BlockDurationMinutes.Value)
                        : existing.ExpiresAt;
                    if (request.Score.HasValue)
                        existing.AnomalyScore = request.Score;

                    await _db.SaveChangesAsync();
                    await tx.CommitAsync();

                    // Push SignalR (sau commit, lỗi SignalR không làm rollback DB)
                    var blockCmd = new BlockCommandDto
                    {
                        Ip = request.Ip,
                        Reason = request.Reason ?? "AI Detection",
                        AttackType = request.AttackType ?? "Unknown",
                        Severity = request.Severity ?? "Medium",
                        DurationMinutes = request.BlockDurationMinutes,
                        BlockId = existing.Id,
                        IssuedAt = DateTime.UtcNow,
                        IsTenantWide = !request.ServerId.HasValue
                    };
                    await PushBlockCommand(request.ServerId, effectiveTenantId, blockCmd);

                    _logger.LogWarning("[BLOCK] Updated: {Ip} by {By} | {Attack}",
                        request.Ip, request.BlockedBy, request.AttackType);

                    return Ok(new ApiResponse<object>(true, $"IP {request.Ip} block updated.", new
                    {
                        ip = request.Ip,
                        action = "updated",
                        blockedAt = existing.BlockedAt,
                        expiresAt = existing.ExpiresAt,
                        blockId = existing.Id,
                        anomalyScore = existing.AnomalyScore
                    }));
                }

                // Insert record mới
                var blockedIP = new BlockedIP
                {
                    Id = Guid.NewGuid(),
                    IpAddress = request.Ip,
                    TenantId = effectiveTenantId,
                    ServerId = request.ServerId,
                    AttackType = request.AttackType ?? "Unknown",
                    Severity = request.Severity ?? "Medium",
                    Reason = request.Reason ?? "AI Detection",
                    BlockedBy = request.BlockedBy ?? "AI-Engine",
                    BlockedAt = DateTime.UtcNow,
                    ExpiresAt = request.BlockDurationMinutes.HasValue
                        ? DateTime.UtcNow.AddMinutes(request.BlockDurationMinutes.Value)
                        : null,
                    IsActive = true,
                    AnomalyScore = request.Score
                };

                _db.BlockedIPs.Add(blockedIP);

                if (!string.IsNullOrEmpty(request.AttackType))
                {
                    var alert = new Alert
                    {
                        Id = Guid.NewGuid(),
                        TenantId = effectiveTenantId,
                        ServerId = request.ServerId,  // Lưu đúng server ID
                        Title = $"[Auto-Blocked] {request.AttackType} from {request.Ip}",
                        Description = request.Reason ?? $"IP {request.Ip} automatically blocked.",
                        Severity = request.Severity ?? "Medium",
                        AlertType = request.AttackType,
                        SourceIp = request.Ip,
                        TargetAsset = request.TargetAsset,
                        Status = "Acknowledged",
                        AnomalyScore = request.Score,
                        CreatedAt = DateTime.UtcNow
                    };
                    _db.Alerts.Add(alert);

                    try
                    {
                        var ticket = new Ticket
                        {
                            Id = Guid.NewGuid(),
                            TenantId = effectiveTenantId,
                            AlertId = alert.Id,
                            TicketNumber = $"TK-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpper()}",
                            Title = $"Incident: {request.AttackType} - {request.Ip}",
                            Description = $"Auto-generated by AI Engine.\n\nReason: {request.Reason}",
                            Priority = request.Severity ?? "Medium",
                            Status = "OPEN",
                            Category = "Security Incident",
                            CreatedBy = null
                        };
                        _db.Tickets.Add(ticket);
                    }
                    catch (Exception ticketEx)
                    {
                        _logger.LogError(ticketEx, "[BLOCK] Ticket creation failed — continuing");
                    }

                    _db.AuditLogs.Add(new AuditLog
                    {
                        TenantId = effectiveTenantId,
                        UserId = null,
                        Action = "AUTO_BLOCKED",
                        EntityType = "BlockedIP",
                        EntityId = blockedIP.Id.ToString(),
                        Details = $"Auto-blocked {request.Ip} - {request.AttackType}"
                    });
                }

                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                // === Gửi Email + Telegram + Notifications (sau commit — lỗi không ảnh hưởng transaction) ===
                if (request.AttackType != null)
                {
                    var blockedIpForNotify = blockedIP;
                    _ = Task.Run(async () =>
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var dbBg = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();
                        try
                        {
                            var alertForNotify = await dbBg.Alerts
                                .Where(a => a.TenantId == effectiveTenantId && a.SourceIp == request.Ip)
                                .OrderByDescending(a => a.CreatedAt)
                                .FirstOrDefaultAsync();
                            if (alertForNotify == null) return;

                            var ticketForNotify = await dbBg.Tickets
                                .Where(t => t.AlertId == alertForNotify.Id)
                                .FirstOrDefaultAsync();

                            await SendBlockNotificationsAsync(alertForNotify, ticketForNotify, effectiveTenantId, dbBg, scope.ServiceProvider);
                        }
                        catch (Exception ex) { _logger.LogError(ex, "[BLOCK] Notification send failed after DB committed"); }
                    });
                }

                // Push SignalR (sau commit)
                var newBlockCmd = new BlockCommandDto
                {
                    Ip = request.Ip,
                    Reason = request.Reason ?? "AI Detection",
                    AttackType = request.AttackType ?? "Unknown",
                    Severity = request.Severity ?? "Medium",
                    DurationMinutes = request.BlockDurationMinutes,
                    BlockId = blockedIP.Id,
                    IssuedAt = DateTime.UtcNow,
                    IsTenantWide = !request.ServerId.HasValue
                };
                try { await PushBlockCommand(request.ServerId, effectiveTenantId, newBlockCmd); }
                catch (Exception sigEx) { _logger.LogError(sigEx, "[BLOCK] SignalR push failed — DB committed"); }

                _logger.LogWarning("[BLOCK] New block: {Ip} by {By} | {Attack} | {Severity} | {BlockId}",
                    request.Ip, request.BlockedBy, request.AttackType, request.Severity, blockedIP.Id);

                return Ok(new ApiResponse<object>(true, $"IP {request.Ip} has been blocked.", new
                {
                    ip = request.Ip,
                    action = "blocked",
                    blockedAt = blockedIP.BlockedAt,
                    expiresAt = blockedIP.ExpiresAt,
                    blockId = blockedIP.Id,
                    attackType = blockedIP.AttackType,
                    severity = blockedIP.Severity,
                    anomalyScore = blockedIP.AnomalyScore
                }));
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });
    }

    /// <summary>Push block command qua SignalR đến Agent Hub và Dashboard.</summary>
    private async Task PushBlockCommand(Guid? serverId, Guid tenantId, BlockCommandDto blockCmd)
    {
        if (serverId.HasValue)
        {
            await _agentHub.Clients.Group(serverId.Value.ToString())
                .ReceiveBlockCommand(blockCmd);
        }
        else
        {
            var tenantServers = await _db.Servers
                .Where(s => s.TenantId == tenantId)
                .Select(s => s.Id)
                .ToListAsync();

            foreach (var sid in tenantServers)
                await _agentHub.Clients.Group(sid.ToString())
                    .ReceiveBlockCommand(blockCmd);
        }

        await _alertHub.Clients.Group(tenantId.ToString())
            .ReceiveBlockCommand(blockCmd);
    }

    // ============================================================================
    // POST /api/defense/unblock-ip
    // ============================================================================
    [HttpPost("unblock-ip")]
    public async Task<ActionResult<ApiResponse<object>>> UnblockIP([FromBody] UnblockIPRequest request)
    {
        var tenantId = GetTenantId();
        var userId = GetUserId();

        // Tìm IP bị block — filter theo ServerId nếu được chỉ định
        var blocked = await _db.BlockedIPs
            .FirstOrDefaultAsync(b =>
                b.IpAddress == request.Ip &&
                b.IsActive &&
                b.TenantId == (tenantId.HasValue ? tenantId.Value : b.TenantId) &&
                (request.ServerId.HasValue ? b.ServerId == request.ServerId : true));

        if (blocked == null)
        {
            // Thử tìm block tenant-wide nếu không có server cụ thể
            if (!request.ServerId.HasValue)
            {
                blocked = await _db.BlockedIPs
                    .FirstOrDefaultAsync(b =>
                        b.IpAddress == request.Ip &&
                        b.IsActive &&
                        (tenantId.HasValue ? b.TenantId == tenantId.Value : true));
            }
            if (blocked == null)
                return NotFound(new ApiResponse<object>(false, $"IP {request.Ip} is not currently blocked.", null));
        }

        // Xóa IP khỏi database thay vì chỉ đánh dấu inactive
        _db.BlockedIPs.Remove(blocked);

        if (tenantId.HasValue)
        {
            _db.AuditLogs.Add(new AuditLog
            {
                TenantId = tenantId.Value,
                UserId = userId,
                Action = "IP_UNBLOCKED",
                EntityType = "BlockedIP",
                EntityId = blocked.Id.ToString(),
                Details = $"IP {request.Ip} unblocked and removed from database (ServerId={request.ServerId})"
            });
        }

        await _db.SaveChangesAsync();

        // Push lệnh unblock qua SignalR → Agent nhận + thực thi
        // Nếu có ServerId cụ thể → push đến server đó
        // Nếu không có ServerId (tenant-wide block) → push đến tất cả server trong tenant
        if (request.ServerId.HasValue)
        {
            await _agentHub.Clients.Group(request.ServerId.Value.ToString())
                .ReceiveUnblockCommand(request.Ip);

            _logger.LogInformation(
                "[AGENT-PUSH] Unblock command sent to Server {ServerId}: IP={Ip}",
                request.ServerId, request.Ip);
        }
        else if (tenantId.HasValue)
        {
            // Tenant-wide block → push unblock đến tất cả server trong tenant
            var tenantServers = await _db.Servers
                .Where(s => s.TenantId == tenantId.Value)
                .Select(s => s.Id)
                .ToListAsync();

            foreach (var sid in tenantServers)
                await _agentHub.Clients.Group(sid.ToString()).ReceiveUnblockCommand(request.Ip);

            _logger.LogInformation(
                "[AGENT-PUSH] Unblock command sent to {Count} servers (tenant-wide): IP={Ip}",
                tenantServers.Count, request.Ip);
        }

        _logger.LogInformation("[UNBLOCK] IP {Ip} unblocked and removed from database (ServerId={ServerId})",
            request.Ip, request.ServerId);

        return Ok(new ApiResponse<object>(true, $"IP {request.Ip} has been unblocked and removed.", new
        {
            ip = request.Ip,
            action = "unblocked_and_removed",
            serverId = request.ServerId
        }));
    }

    // ============================================================================
    // GET /api/defense/blocked-ips
    // ============================================================================
    [HttpGet("blocked-ips")]
    public async Task<ActionResult<ApiResponse<PagedResult<BlockedIPDto>>>> GetBlockedIPs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] bool activeOnly = true)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<BlockedIP> query = _db.BlockedIPs.AsQueryable();

        if (role != "SuperAdmin")
        {
            if (tenantId.HasValue)
                query = query.Where(b => b.TenantId == tenantId.Value);
            else
                return Forbid();
        }

        if (activeOnly)
            query = query.Where(b => b.IsActive);

        var total = await query.CountAsync();
        var items = await query
            .Include(b => b.Server)
            .OrderByDescending(b => b.BlockedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(b => new BlockedIPDto(
                b.Id,
                b.IpAddress,
                b.AttackType,
                b.Severity,
                b.Reason ?? "",
                b.BlockedBy,
                b.BlockedAt,
                b.ExpiresAt,
                b.IsActive,
                b.UnblockedAt,
                b.UnblockedBy,
                b.AnomalyScore,
                b.ServerId,
                b.Server != null ? b.Server.Name : null
            ))
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<BlockedIPDto>>(true, "OK", new PagedResult<BlockedIPDto>(
            items,
            total,
            page,
            pageSize,
            (int)Math.Ceiling(total / (double)pageSize)
        )));
    }

    // ============================================================================
    // GET /api/defense/check/{ip}
    // ============================================================================
    [HttpGet("check/{ip}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<IPCheckResult>>> CheckIP(string ip)
    {
        var blocked = await _db.BlockedIPs
            .Where(b => b.IpAddress == ip && b.IsActive)
            .Where(b => b.ExpiresAt == null || b.ExpiresAt > DateTime.UtcNow)
            .FirstOrDefaultAsync();

        return Ok(new ApiResponse<IPCheckResult>(true, "OK", new IPCheckResult(
            ip,
            blocked != null,
            blocked?.BlockedAt,
            blocked?.ExpiresAt,
            blocked?.Reason,
            blocked?.AttackType
        )));
    }

    // ============================================================================
    // GET /api/defense/rate-limit-status
    // ============================================================================
    [HttpGet("rate-limit-status")]
    public async Task<ActionResult<ApiResponse<RateLimitStatus>>> GetRateLimitStatus()
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
            return Ok(new ApiResponse<RateLimitStatus>(true, "OK", new RateLimitStatus(0, 0, 0, 10, 100)));

        var oneMinuteAgo = DateTime.UtcNow.AddMinutes(-1);
        var oneHourAgo = DateTime.UtcNow.AddHours(-1);

        var blocksLastMinute = await _db.BlockedIPs
            .Where(b => b.TenantId == tenantId.Value && b.BlockedAt > oneMinuteAgo)
            .CountAsync();

        var blocksLastHour = await _db.BlockedIPs
            .Where(b => b.TenantId == tenantId.Value && b.BlockedAt > oneHourAgo)
            .CountAsync();

        var activeBlocks = await _db.BlockedIPs
            .Where(b => b.TenantId == tenantId.Value && b.IsActive)
            .CountAsync();

        return Ok(new ApiResponse<RateLimitStatus>(true, "OK", new RateLimitStatus(
            blocksLastMinute, blocksLastHour, activeBlocks, 10, 100
        )));
    }

    // ============================================================================
    // POST /api/defense/manual-block (Admin only)
    // ============================================================================
    [HttpPost("manual-block")]
    [Authorize(Roles = "SuperAdmin,Admin,Staff")]
    public async Task<ActionResult<ApiResponse<object>>> ManualBlock([FromBody] ManualBlockRequest request)
    {
        var tenantId = GetTenantId();
        var userId = GetUserId();
        var role = GetUserRole();

        // SuperAdmin có thể block mà không cần tenantId (global block)
        // Admin và Staff phải có tenantId
        if ((role == "Admin" || role == "Staff") && !tenantId.HasValue)
        {
            return BadRequest(new ApiResponse<object>(false, "TenantId is required.", null));
        }

        // Nếu là SuperAdmin và không có tenantId, tạo một global block
        Guid effectiveTenantId;
        if (!tenantId.HasValue && role == "SuperAdmin")
        {
            // SuperAdmin: lấy tenant đầu tiên hoặc tạo global block
            var firstTenant = await _db.Tenants.FirstOrDefaultAsync();
            if (firstTenant == null)
            {
                return BadRequest(new ApiResponse<object>(false, "No tenant found in system. Please create a tenant first.", null));
            }
            effectiveTenantId = firstTenant.Id;
        }
        else
        {
            effectiveTenantId = tenantId!.Value;
        }

        var existing = await _db.BlockedIPs
            .FirstOrDefaultAsync(b => b.IpAddress == request.Ip && b.IsActive && 
                (request.ServerId.HasValue ? b.ServerId == request.ServerId : b.ServerId == null));

        if (existing != null)
        {
            var scope = request.ServerId.HasValue ? "on this server" : "tenant-wide";
            return BadRequest(new ApiResponse<object>(false, $"IP {request.Ip} is already blocked {scope}.", null));
        }

        var blockedIP = new BlockedIP
        {
            Id = Guid.NewGuid(),
            IpAddress = request.Ip,
            TenantId = effectiveTenantId,
            ServerId = request.ServerId,  // Set ServerId if specified
            AttackType = "Manual Block",
            Severity = request.Severity ?? "Medium",
            Reason = request.Reason ?? "Manual block by admin",
            BlockedBy = userId.ToString(),
            BlockedAt = DateTime.UtcNow,
            ExpiresAt = request.DurationMinutes.HasValue
                ? DateTime.UtcNow.AddMinutes(request.DurationMinutes.Value)
                : null,
            IsActive = true
        };

        _db.BlockedIPs.Add(blockedIP);

        var blockScope = request.ServerId.HasValue ? $"on server {request.ServerId}" : "on all servers (tenant-wide)";
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = effectiveTenantId,
            UserId = userId,
            Action = "MANUAL_BLOCK",
            EntityType = "BlockedIP",
            EntityId = blockedIP.Id.ToString(),
            Details = $"Manual block: {request.Ip} {blockScope} - {request.Reason}"
        });

        await _db.SaveChangesAsync();

        // Push block command to agents
        // If ServerId specified: push only to that server
        // If ServerId is null: push to all servers in tenant (tenant-wide block)
        List<Guid> targetServers;
        if (request.ServerId.HasValue)
        {
            targetServers = new List<Guid> { request.ServerId.Value };
        }
        else
        {
            targetServers = await _db.Servers
                .Where(s => s.TenantId == effectiveTenantId)
                .Select(s => s.Id)
                .ToListAsync();
        }

        if (targetServers.Count > 0)
        {
            var blockCmd = new BlockCommandDto
            {
                Ip = request.Ip,
                Reason = request.Reason ?? "Manual block by admin",
                AttackType = "Manual Block",
                Severity = request.Severity ?? "Medium",
                DurationMinutes = request.DurationMinutes,
                BlockId = blockedIP.Id,
                IssuedAt = DateTime.UtcNow
            };

            foreach (var serverId in targetServers)
            {
                await _agentHub.Clients.Group(serverId.ToString())
                    .ReceiveBlockCommand(blockCmd);
            }

            var serverScope = request.ServerId.HasValue ? $"server {request.ServerId}" : $"{targetServers.Count} servers (tenant-wide)";
            _logger.LogWarning(
                "[MANUAL-BLOCK] Block command sent to {Scope}: IP={Ip} by User={UserId}",
                serverScope, request.Ip, userId);
        }

        // Push to dashboard
        await _alertHub.Clients.Group(effectiveTenantId.ToString()).ReceiveBlockCommand(new BlockCommandDto
        {
            Ip = request.Ip,
            Reason = request.Reason ?? "Manual block by admin",
            AttackType = "Manual Block",
            Severity = request.Severity ?? "Medium",
            DurationMinutes = request.DurationMinutes,
            BlockId = blockedIP.Id,
            IssuedAt = DateTime.UtcNow
        });

        _logger.LogWarning("[MANUAL-BLOCK] User {User} blocked {Ip}: {Reason}",
            userId, request.Ip, request.Reason);

        return Ok(new ApiResponse<object>(true, $"IP {request.Ip} has been manually blocked.", new
        {
            ip = request.Ip,
            blockedAt = blockedIP.BlockedAt,
            expiresAt = blockedIP.ExpiresAt,
            blockedBy = blockedIP.BlockedBy,
            tenantId = effectiveTenantId
        }));
    }

    // ============================================================================
    // GET /api/defense/firewall-rules
    // ============================================================================
    [HttpGet("firewall-rules")]
    public async Task<ActionResult<ApiResponse<FirewallRulesDto>>> GetFirewallRules()
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<BlockedIP> query = _db.BlockedIPs.Where(b => b.IsActive);

        if (role != "SuperAdmin")
        {
            if (tenantId.HasValue)
                query = query.Where(b => b.TenantId == tenantId.Value);
            else
                return Forbid();
        }

        var rules = await query
            .Where(b => b.ExpiresAt == null || b.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(b => b.BlockedAt)
            .Select(b => new FirewallRuleDto(
                b.IpAddress,
                b.AttackType,
                b.Severity,
                b.ExpiresAt,
                b.BlockedAt
            ))
            .ToListAsync();

        return Ok(new ApiResponse<FirewallRulesDto>(true, "OK", new FirewallRulesDto(
            rules,
            rules.Count,
            DateTime.UtcNow
        )));
    }

    // ============================================================================
    // Helpers
    // ============================================================================
    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? Guid.Empty.ToString());

    private Guid? GetTenantId()
    {
        // Ưu tiên context.Items (đặt bởi ApiKeyAuthMiddleware từ API Key)
        if (HttpContext.Items.TryGetValue("TenantId", out var tenantObj) && tenantObj is Guid tenantFromKey)
            return tenantFromKey;
        // Fallback: JWT claim
        var val = User.FindFirstValue("tenantId");
        return val != null ? Guid.Parse(val) : null;
    }

    private Guid? GetServerId()
    {
        if (HttpContext.Items.TryGetValue("ServerId", out var serverObj) && serverObj is Guid serverId)
            return serverId;
        return null;
    }

    private string GetUserRole() =>
        User.FindFirstValue(ClaimTypes.Role) ?? "User";

    /// <summary>Gửi Email + Telegram + In-app Notifications khi IP bị block (chạy sau transaction commit).</summary>
    private async Task SendBlockNotificationsAsync(Alert alert, Ticket? ticket, Guid tenantId, VeriChainIDSDbContext db, IServiceProvider sp)
    {
        var emailSvc = sp.GetRequiredService<IEmailService>();
        var telegramSvc = sp.GetRequiredService<ITelegramService>();

        // In-app notifications: gửi đến tất cả user trong tenant (SignalR + DB notification)
        var users = await db.Users
            .Where(u => u.TenantId == tenantId && u.IsActive)
            .ToListAsync();

        var server = alert.ServerId.HasValue ? await db.Servers.FindAsync(alert.ServerId.Value) : null;

        foreach (var user in users)
        {
            try
            {
                db.Notifications.Add(new Notification
                {
                    TenantId = tenantId,
                    UserId = user.Id,
                    Title = $"[{alert.Severity}] {alert.AlertType}",
                    Message = alert.Title,
                    Type = alert.Severity == "Critical" ? "Alert" : "Warning",
                    Link = ticket != null ? $"/dashboard/tickets/{ticket.Id}" : "/dashboard/alerts"
                });
                await db.SaveChangesAsync();

                var notifDto = new NotificationDto(
                    Guid.NewGuid(), tenantId, user.Id,
                    $"[{alert.Severity}] {alert.AlertType}",
                    alert.Title,
                    alert.Severity == "Critical" ? "Alert" : "Warning",
                    false,
                    ticket != null ? $"/dashboard/tickets/{ticket.Id}" : "/dashboard/alerts",
                    DateTime.UtcNow
                );
                await _alertHub.Clients.Group(tenantId.ToString()).NotificationReceived(notifDto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[BLOCK] Notification for user {UserId} failed", user.Id);
            }
        }

        // Email alert: gửi đến ServerAlertEmails (nếu có serverId)
        if (alert.ServerId.HasValue)
        {
            var serverAlertEmails = await db.ServerAlertEmails
                .Where(e => e.IsActive && e.ServerId == alert.ServerId)
                .ToListAsync();

            foreach (var alertEmail in serverAlertEmails)
            {
                try
                {
                    await emailSvc.SendAlertEmailAsync(tenantId, alertEmail.Email, alert, server);
                    _logger.LogInformation("[BLOCK] Alert email sent to {Email}", alertEmail.Email);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[BLOCK] Failed to send email to {Email}", alertEmail.Email);
                }
            }
        }

        // Telegram: gửi đến server recipients + user realtime recipients
        await SendBlockTelegramAsync(alert, ticket, tenantId, db, sp);
    }

    private async Task SendBlockTelegramAsync(Alert alert, Ticket? ticket, Guid tenantId, VeriChainIDSDbContext db, IServiceProvider sp)
    {
        if (!IsTelegramEnabled()) return;
        var telegramSvc = sp.GetRequiredService<ITelegramService>();

        var serverRecipients = new List<string>();
        if (alert.ServerId.HasValue)
        {
            var rawChatIds = await db.ServerTelegramRecipients
                .Where(r => r.ServerId == alert.ServerId.Value && r.IsActive)
                .Select(r => r.ChatId)
                .ToListAsync();

            var disabledChats = await db.Users
                .Where(u => u.TenantId == tenantId && u.IsActive && u.TelegramChatId != null && !u.TelegramAlertsEnabled)
                .Select(u => u.TelegramChatId!)
                .ToListAsync();

            var disabledSet = new HashSet<string>(
                disabledChats.Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()),
                StringComparer.Ordinal);

            serverRecipients = rawChatIds
                .Where(c => !string.IsNullOrWhiteSpace(c) && !disabledSet.Contains(c.Trim()))
                .Select(c => c.Trim())
                .ToList();
        }

        var allUsers = await db.Users
            .Where(u => u.TenantId == tenantId && u.IsActive && u.TelegramAlertsEnabled && !string.IsNullOrWhiteSpace(u.TelegramChatId))
            .ToListAsync();

        var realtimeUsers = allUsers.Where(u => MeetsSeverityThreshold(alert.Severity, u.AlertSeverityThreshold) && u.AlertDigestMode == "realtime").ToList();

        var hasRecipients = serverRecipients.Count > 0 || realtimeUsers.Count > 0;
        if (hasRecipients)
        {
            var sent = await telegramSvc.SendAlertAsync(tenantId, alert, null, ticket);
            _logger.LogInformation("[BLOCK] Telegram alert sent. Recipients={Count}, Sent={Sent}", serverRecipients.Count + realtimeUsers.Count, sent);
        }
        else
        {
            _logger.LogInformation("[BLOCK] No Telegram recipients for block alert {AlertId}", alert.Id);
        }
    }

    private static bool MeetsSeverityThreshold(string alertSeverity, string? userThreshold)
    {
        var order = new[] { "Low", "Medium", "High", "Critical" };
        var alertIdx = Array.IndexOf(order, alertSeverity);
        if (alertIdx < 0) alertIdx = 0;
        var thresholdIdx = Array.IndexOf(order, userThreshold ?? "Medium");
        if (thresholdIdx < 0) thresholdIdx = 1;
        return alertIdx >= thresholdIdx;
    }

    private bool IsTelegramEnabled()
    {
        var enabled = _configuration["TelegramBot:Enabled"];
        return bool.TryParse(enabled, out var value) && value;
    }
}

// =============================================================================
// Request / Response DTOs
// =============================================================================

public record BlockIPRequest(
    [Required] string Ip,
    string? AttackType,
    string? Severity,
    string? Reason,
    string? BlockedBy,
    string? TargetAsset,
    int? BlockDurationMinutes,
    Guid? ServerId,  // Server cần block — nếu có, Backend push lệnh qua SignalR đến Agent
    decimal? Score   // AI anomaly score khi block tự động
);

public record UnblockIPRequest(
    [Required] string Ip,
    string? UnblockedBy,
    Guid? ServerId   // Server cần unblock — push lệnh qua SignalR đến Agent
);

public record ManualBlockRequest(
    [Required] string Ip,
    string? Reason,
    string? Severity,
    int? DurationMinutes,
    Guid? ServerId  // If specified, block only on this server. If null, block on all servers (tenant-wide)
);

public record BlockedIPDto(
    Guid Id,
    string IpAddress,
    string AttackType,
    string Severity,
    string Reason,
    string BlockedBy,
    DateTime BlockedAt,
    DateTime? ExpiresAt,
    bool IsActive,
    DateTime? UnblockedAt,
    string? UnblockedBy,
    decimal? AnomalyScore,
    Guid? ServerId,
    string? ServerName
);

public record IPCheckResult(
    string IpAddress,
    bool IsBlocked,
    DateTime? BlockedAt,
    DateTime? ExpiresAt,
    string? Reason,
    string? AttackType
);

public record RateLimitStatus(
    int BlocksLastMinute,
    int BlocksLastHour,
    int ActiveBlocks,
    int MinuteLimit,
    int HourlyLimit
);

public record FirewallRuleDto(
    string IpAddress,
    string AttackType,
    string Severity,
    DateTime? ExpiresAt,
    DateTime BlockedAt
);

public record FirewallRulesDto(
    List<FirewallRuleDto> ActiveRules,
    int TotalActive,
    DateTime GeneratedAt
);
