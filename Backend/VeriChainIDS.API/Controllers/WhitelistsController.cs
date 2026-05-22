using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Hubs;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using VeriChainIDS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/whitelists")]
[Authorize]
public class WhitelistsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<WhitelistsController> _logger;
    private readonly IHubContext<AlertHub, IAlertHub> _alertHub;
    private readonly ITelegramService _telegramService;
    private readonly IServiceScopeFactory _scopeFactory;

    public WhitelistsController(
        VeriChainIDSDbContext db,
        ILogger<WhitelistsController> logger,
        IHubContext<AlertHub, IAlertHub> alertHub,
        ITelegramService telegramService,
        IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _logger = logger;
        _alertHub = alertHub;
        _telegramService = telegramService;
        _scopeFactory = scopeFactory;
    }

    /// <summary>Lấy danh sách Whitelist, hỗ trợ lọc theo ServerId</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<WhitelistDto>>>> GetWhitelists(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] Guid? serverId = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<Whitelist> query = _db.Whitelists
            .Include(w => w.Server)
            .AsQueryable();

        if (role == "Admin" || role == "Staff")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(w => w.TenantId == tenantId);
        }
        else if (role != "SuperAdmin")
        {
            return Forbid();
        }

        // Filter by ServerId — nếu có, lấy whitelist của server đó hoặc tenant-wide
        // Nếu không có serverId filter, lấy tất cả
        if (serverId.HasValue)
        {
            query = query.Where(w => w.ServerId == serverId.Value || w.ServerId == null);
        }

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(w => w.IpAddress.Contains(search) || (w.Description != null && w.Description.Contains(search)));

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(w => w.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(w => new WhitelistDto(
                w.Id,
                w.TenantId,
                w.ServerId,
                w.IpAddress,
                w.Description,
                w.Server != null ? w.Server.Name : null,
                w.CreatedAt))
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<WhitelistDto>>(true, "OK", new PagedResult<WhitelistDto>(
            items, totalCount, page, pageSize, (int)Math.Ceiling(totalCount / (double)pageSize))));
    }

    /// <summary>Thêm IP vào Whitelist, với optional ServerId</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<WhitelistDto>>> AddWhitelist([FromBody] AddWhitelistRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        // Kiểm tra trùng IP trong cùng tenant + server
        var existing = await _db.Whitelists
            .FirstOrDefaultAsync(w =>
                w.IpAddress == request.IpAddress &&
                w.TenantId == (role == "SuperAdmin" ? (Guid?)null : tenantId) &&
                w.ServerId == request.ServerId);

        if (existing != null)
        {
            var scope = request.ServerId.HasValue ? $"trên server {request.ServerId}" : "tenant-wide";
            return BadRequest(new ApiResponse<WhitelistDto>(false, $"IP {request.IpAddress} đã có trong Whitelist {scope}.", null));
        }

        // Validate ServerId nếu có
        if (request.ServerId.HasValue)
        {
            var server = await _db.Servers.FindAsync(request.ServerId.Value);
            if (server == null)
                return BadRequest(new ApiResponse<WhitelistDto>(false, $"Server {request.ServerId} không tồn tại.", null));

            // Đảm bảo server thuộc đúng tenant
            if (role == "Admin" && server.TenantId != tenantId)
                return Forbid();
        }

        _logger.LogInformation(
            "[WHITELIST] Dang them IP {Ip} vao whitelist (ServerId={ServerId}, TenantId={TenantId}) boi {Role}",
            request.IpAddress, request.ServerId, tenantId, role);

        var whitelist = new Whitelist
        {
            TenantId = role == "SuperAdmin" ? null : tenantId,
            ServerId = request.ServerId,
            IpAddress = request.IpAddress.Trim(),
            Description = request.Description?.Trim(),
            CreatedAt = DateTime.UtcNow,
        };

        _db.Whitelists.Add(whitelist);
        await _db.SaveChangesAsync();

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = whitelist.TenantId,
            UserId = null,
            Action = "WHITELIST_ADDED",
            EntityType = "Whitelist",
            EntityId = whitelist.Id.ToString(),
            Details = $"IP {whitelist.IpAddress} added to whitelist (ServerId={request.ServerId?.ToString() ?? "tenant-wide"})"
        });
        await _db.SaveChangesAsync();

        // Load server name for response
        string? serverName = null;
        if (request.ServerId.HasValue)
        {
            var srv = await _db.Servers.FindAsync(request.ServerId.Value);
            serverName = srv?.Name;
        }

        _logger.LogInformation("[WHITELIST] Da them {Ip} vao whitelist (ServerId={ServerId}) boi {Role}",
            request.IpAddress, request.ServerId, role);

        // === Trigger notifications asynchronously (after DB committed) ===
        var effectiveTenantId = whitelist.TenantId ?? tenantId ?? Guid.Empty;
        var addedByRole = role;
        
        // Lấy UserName từ HttpContext TRƯỚC khi chạy background task (vì HttpContext sẽ bị dispose)
        string? capturedUserName = null;
        if (HttpContext?.User?.Identity?.Name != null)
            capturedUserName = HttpContext.User.Identity.Name;
        if (string.IsNullOrEmpty(capturedUserName))
        {
            var claim = HttpContext?.User?.FindFirst(ClaimTypes.Name)
                        ?? HttpContext?.User?.FindFirst("name");
            capturedUserName = claim?.Value;
        }
        
        _ = Task.Run(async () =>
        {
            using var scope = _scopeFactory.CreateScope();
            var dbBg = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();
            var telegramServiceBg = scope.ServiceProvider.GetRequiredService<ITelegramService>();
            try
            {
                var notifTenantId = effectiveTenantId;
                if (notifTenantId == Guid.Empty) return;

                var users = await dbBg.Users
                    .Where(u => u.TenantId == notifTenantId && u.IsActive)
                    .ToListAsync();

                // Dùng userName đã capture, fallback sang DB nếu cần
                string? userName = capturedUserName;
                if (string.IsNullOrEmpty(userName))
                {
                    var userRec = await dbBg.Users
                        .Where(u => u.TenantId == notifTenantId)
                        .FirstOrDefaultAsync();
                    userName = userRec?.FullName ?? addedByRole;
                }

                var serverInfo = request.ServerId.HasValue
                    ? await dbBg.Servers.FindAsync(request.ServerId.Value)
                    : null;
                var scopeLabel = serverInfo != null ? $"server \"{serverInfo.Name}\"" : "tenant-wide";

                foreach (var user in users)
                {
                    try
                    {
                        dbBg.Notifications.Add(new Notification
                        {
                            TenantId = notifTenantId,
                            UserId = user.Id,
                            Title = "⚪ [WHITELISTED] New IP Added to Whitelist",
                            Message = $"IP {request.IpAddress} đã được thêm vào Whitelist {scopeLabel} bởi User {userName}. Hệ thống AI sẽ bỏ qua các cảnh báo liên quan đến IP này từ nay về sau.",
                            Type = "Info",
                            Link = "/dashboard/whitelist",
                            CreatedAt = DateTime.UtcNow
                        });
                        await dbBg.SaveChangesAsync();

                        var notifDto = new NotificationDto(
                            Guid.NewGuid(), notifTenantId, user.Id,
                            "⚪ [WHITELISTED] New IP Added to Whitelist",
                            $"IP {request.IpAddress} đã được thêm vào Whitelist bởi User {userName}.",
                            "Info", false, "/dashboard/whitelist", DateTime.UtcNow
                        );
                        await _alertHub.Clients.Group(notifTenantId.ToString()).NotificationReceived(notifDto);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "[WHITELIST] Notification for user {UserId} failed", user.Id);
                    }
                }

                // Gửi Telegram với service từ scope mới
                await telegramServiceBg.SendWhitelistNotificationAsync(notifTenantId, request.IpAddress, userName ?? addedByRole, scopeLabel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[WHITELIST] Notification send failed after DB committed");
            }
        });

        return Ok(new ApiResponse<WhitelistDto>(true,
            $"IP {request.IpAddress} đã thêm vào Whitelist.",
            new WhitelistDto(whitelist.Id, whitelist.TenantId, whitelist.ServerId,
                whitelist.IpAddress, whitelist.Description, serverName, whitelist.CreatedAt)));
    }

    /// <summary>Xóa IP khỏi Whitelist</summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> RemoveWhitelist(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        var whitelist = await _db.Whitelists.FindAsync(id);
        if (whitelist == null)
            return NotFound(new ApiResponse<object>(false, "Không tìm thấy Whitelist.", null));

            if (role == "Admin" && whitelist.TenantId != tenantId)
                return Forbid();

        _logger.LogInformation(
            "[WHITELIST] Dang xoa IP {Ip} (ServerId={ServerId}, TenantId={TenantId}) boi {Role}",
            whitelist.IpAddress, whitelist.ServerId, whitelist.TenantId, role);

        var ipAddress = whitelist.IpAddress;
        var serverIdVal = whitelist.ServerId;

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = whitelist.TenantId,
            UserId = null,
            Action = "WHITELIST_REMOVED",
            EntityType = "Whitelist",
            EntityId = whitelist.Id.ToString(),
            Details = $"IP {ipAddress} removed from whitelist (ServerId={serverIdVal?.ToString() ?? "tenant-wide"})"
        });

        _db.Whitelists.Remove(whitelist);
        await _db.SaveChangesAsync();

        _logger.LogInformation("[WHITELIST] Da xoa {Ip} khoi whitelist boi {Role}", whitelist.IpAddress, role);

        return Ok(new ApiResponse<object>(true, $"IP {whitelist.IpAddress} đã xóa khỏi Whitelist.", null));
    }

    /// <summary>Kiểm tra IP có trong Whitelist không (dùng cho internal)</summary>
    [HttpGet("check/{ip}")]
    public async Task<ActionResult<ApiResponse<object>>> CheckWhitelist(string ip, [FromQuery] Guid? serverId = null)
    {
        var tenantId = GetTenantId();

        var exists = await _db.Whitelists
            .AnyAsync(w =>
                w.IpAddress == ip &&
                (tenantId.HasValue ? w.TenantId == tenantId : w.TenantId == null) &&
                (serverId.HasValue ? w.ServerId == serverId.Value || w.ServerId == null : true));

        return Ok(new ApiResponse<object>(true, exists ? "Whitelisted" : "Not whitelisted", new { ip, isWhitelisted = exists }));
    }

    /// <summary>
    /// AI Engine endpoint - Check whitelist across all tenants (requires API Key)
    /// </summary>
    [HttpGet("ai-check/{ip}")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<object>>> AICheckWhitelist(string ip, [FromQuery] Guid? serverId = null)
    {
        // Verify API Key from header
        if (!Request.Headers.TryGetValue("X-API-Key", out var apiKey) || string.IsNullOrWhiteSpace(apiKey))
        {
            return Unauthorized(new ApiResponse<object>(false, "API Key required", null));
        }

        // Check whitelist across all tenants
        var exists = await _db.Whitelists
            .AnyAsync(w =>
                w.IpAddress == ip &&
                w.IsActive &&
                (!serverId.HasValue || w.ServerId == null || w.ServerId == serverId.Value));

        _logger.LogInformation(
            "[AI-WHITELIST] Check IP={IP}, ServerId={ServerId} → isWhitelisted={Result}",
            ip, serverId, exists);

        return Ok(new ApiResponse<object>(true, exists ? "Whitelisted" : "Not whitelisted", 
            new { ip, serverId, isWhitelisted = exists }));
    }

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