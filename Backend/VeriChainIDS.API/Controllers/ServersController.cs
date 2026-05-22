using System.Security.Cryptography;
using System.Text;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Extensions;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Runtime.Versioning;
namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ServersController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<ServersController> _logger;

    public ServersController(VeriChainIDSDbContext db, ILogger<ServersController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>Lấy danh sách server của tenant</summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<ApiResponse<PagedResult<ServerDto>>>> GetServers(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<Server> query = _db.Servers.Include(s => s.ApiKeys);

        if (role != "SuperAdmin")
        {
            query = query.Where(s => s.TenantId == tenantId);
        }

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(s => s.Name.Contains(search) || s.IpAddress.Contains(search));
        }

        if (!string.IsNullOrEmpty(status))
        {
            query = query.Where(s => s.Status == status);
        }

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new ServerDto(
                s.Id,
                s.Name,
                s.IpAddress,
                s.Status,
                s.OS,
                s.CpuUsage,
                s.RamUsage,
                s.DiskUsage,
                s.LastSeenAt,
                s.CreatedAt,
                s.ApiKeys.Select(k => new ApiKeyDto(
                    k.Id, k.ServerId ?? Guid.Empty, k.Name, k.KeyPrefix,
                    k.Permissions, k.LastUsedAt, k.ExpiresAt, k.IsActive, k.CreatedAt
                )).ToList()
            ))
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<ServerDto>>(true, "OK", new PagedResult<ServerDto>(
            items, totalCount, page, pageSize, (int)Math.Ceiling(totalCount / (double)pageSize)
        )));
    }

    /// <summary>Thêm server mới + sinh API Key</summary>
    [HttpPost("add")]
    [Authorize]
    [SupportedOSPlatform("windows")]
    public async Task<ActionResult<ApiResponse<ApiKeyGeneratedResponse>>> AddServer([FromBody] CreateServerRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        Guid targetTenantId;
        if (role == "SuperAdmin")
        {
            if (request.TenantId is { } tid && tid != Guid.Empty)
                targetTenantId = tid;
            else
            {
                var latestSub = await _db.Subscriptions
                    .AsNoTracking()
                    .OrderByDescending(s => s.EndDate)
                    .FirstOrDefaultAsync();
                if (latestSub == null)
                    return BadRequest(new ApiResponse<ApiKeyGeneratedResponse>(false,
                        "Chưa có subscription nào. Hãy đăng ký tenant/gói cước trước khi thêm server.", null));
                targetTenantId = latestSub.TenantId;
            }
        }
        else
        {
            if (request.TenantId is not { } adminTid || adminTid == Guid.Empty || tenantId != adminTid)
                return Forbid();
            targetTenantId = adminTid;
        }

        var createdBy = request.CreatedBy != Guid.Empty
            ? request.CreatedBy
            : (Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : Guid.Empty);
        if (createdBy == Guid.Empty)
            return BadRequest(new ApiResponse<ApiKeyGeneratedResponse>(false, "Không xác định người tạo (CreatedBy).", null));

        // Check giới hạn server
        var subscription = await _db.Subscriptions
            .Where(s => s.TenantId == targetTenantId)
            .OrderByDescending(s => s.EndDate)
            .FirstOrDefaultAsync();

        if (subscription == null)
            return BadRequest(new ApiResponse<ApiKeyGeneratedResponse>(false, "Không tìm thấy subscription.", null));

        var currentServerCount = await _db.Servers.CountAsync(s => s.TenantId == targetTenantId);
        if (currentServerCount >= subscription.MaxServers)
            return BadRequest(new ApiResponse<ApiKeyGeneratedResponse>(false,
                $"Bạn đã đạt giới hạn {subscription.MaxServers} server cho gói {subscription.PlanName}. Vui lòng nâng cấp gói cước.", null));

        // Tạo server
        var plainApiKey = $"sk_live_{GenerateSecureKey(32)}";
        var server = new Server
        {
            TenantId = targetTenantId,
            Name = request.Name,
            IpAddress = request.IpAddress,
            ApiKeyHash = ComputeSha256(plainApiKey),
            Status = "Offline",
            CreatedAt = DateTime.UtcNow
        };
        _db.Servers.Add(server);
        await _db.SaveChangesAsync();

        // Tạo API Key record
        var apiKeyRecord = new ApiKey
        {
            TenantId = targetTenantId,
            ServerId = server.Id,
            KeyHash = ComputeSha256(plainApiKey),
            EncryptedKey = EncryptString(plainApiKey),
            KeyPrefix = $"sk_live_{plainApiKey[8..12]}",
            Name = $"Agent Key - {server.Name}",
            Permissions = "{\"ingest\":true,\"read\":true,\"write\":false}",
            IsActive = true
        };
        _db.ApiKeys.Add(apiKeyRecord);

        // Audit
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = targetTenantId,
            UserId = createdBy,
            Action = "SERVER_ADDED",
            EntityType = "Server",
            EntityId = server.Id.ToString(),
            Details = $"Server '{server.Name}' ({server.IpAddress}) added"
        });
        await _db.SaveChangesAsync();

        _logger.LogInformation("Server {Name} added for tenant {TenantId}", server.Name, server.TenantId);

        return Ok(new ApiResponse<ApiKeyGeneratedResponse>(true,
            $"Server '{server.Name}' đã được tạo. Hãy lưu giữ API Key bên dưới!", new ApiKeyGeneratedResponse(
                server.Id,
                plainApiKey,
                server.Name,
                server.CreatedAt
            )));
    }

    /// <summary>Lấy thông tin server + API Key</summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ServerDto>>> GetServer(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var server = await _db.Servers
            .Include(s => s.ApiKeys)
            .FirstOrDefaultAsync(s => s.Id == id);

        if (server == null)
            return NotFound(new ApiResponse<ServerDto>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        return Ok(new ApiResponse<ServerDto>(true, "OK", new ServerDto(
            server.Id, server.Name, server.IpAddress, server.Status,
            server.OS, server.CpuUsage, server.RamUsage, server.DiskUsage,
            server.LastSeenAt, server.CreatedAt,
            server.ApiKeys.Select(k => new ApiKeyDto(
                k.Id, k.ServerId ?? Guid.Empty, k.Name, k.KeyPrefix,
                k.Permissions, k.LastUsedAt, k.ExpiresAt, k.IsActive, k.CreatedAt
            )).ToList()
        )));
    }

    /// <summary>Cập nhật server</summary>
    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ServerDto>>> UpdateServer(Guid id, [FromBody] UpdateServerRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();
        var userId = GetUserId();

        // Staff không được sửa server
        if (role == "Staff")
            return Forbid();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<ServerDto>(false, "Server không tìm tại.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        if (!string.IsNullOrEmpty(request.Name))
            server.Name = request.Name;
        if (!string.IsNullOrEmpty(request.Status))
            server.Status = request.Status;

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = server.TenantId,
            UserId = userId.HasValue && await _db.Users.AnyAsync(u => u.Id == userId.Value) ? userId : null,
            Action = "SERVER_UPDATED",
            EntityType = "Server",
            EntityId = server.Id.ToString(),
            Details = $"Server '{server.Name}' updated"
        });

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<ServerDto>(true, "Cập nhật thành công!", null));
    }

    /// <summary>Xóa server</summary>
    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> DeleteServer(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();
        var userId = GetUserId();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<object>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var serverName = server.Name;
        var serverIp = server.IpAddress;

        try
        {
            // Dùng ExecuteSqlRaw để xóa không bị EF cascade SetNull làm rối query
            var serverIdParam = new Microsoft.Data.SqlClient.SqlParameter("@serverId", id);
            var alertIds = await _db.Alerts
                .Where(a => a.ServerId == id)
                .Select(a => a.Id)
                .ToListAsync();
            var alertIdList = alertIds.ToArray();

            // Xóa TicketComments của tickets liên quan alerts của server
            if (alertIdList.Length > 0)
            {
                var alertIdsParam = string.Join(",", alertIdList.Select((_, i) => $"@a{i}"));
                var aParams = alertIdList.Select((v, i) => new Microsoft.Data.SqlClient.SqlParameter($"@a{i}", v)).ToList();
                await _db.Database.ExecuteSqlRawAsync(
                    $"DELETE FROM TicketComments WHERE TicketId IN (SELECT Id FROM Tickets WHERE AlertId IN ({alertIdsParam}))",
                    aParams.ToArray());
                // Xóa tickets
                await _db.Database.ExecuteSqlRawAsync(
                    $"DELETE FROM Tickets WHERE AlertId IN ({alertIdsParam})",
                    aParams.ToArray());
            }
            // Xóa alerts
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM Alerts WHERE ServerId = @serverId",
                serverIdParam);
            // Xóa các bảng còn lại (không có vòng lặp FK phức tạp)
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM TrafficLogs WHERE ServerId = @serverId",
                serverIdParam);
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM BlockedIPs WHERE ServerId = @serverId",
                serverIdParam);
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM Whitelists WHERE ServerId = @serverId",
                serverIdParam);
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM ServerAlertEmails WHERE ServerId = @serverId",
                serverIdParam);
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM ServerTelegramRecipients WHERE ServerId = @serverId",
                serverIdParam);
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM ApiKeys WHERE ServerId = @serverId",
                serverIdParam);
            // Cuối cùng xóa server
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM Servers WHERE Id = @serverId",
                serverIdParam);

            _db.AuditLogs.Add(new AuditLog
            {
                TenantId = server.TenantId,
                UserId = userId.HasValue && await _db.Users.AnyAsync(u => u.Id == userId.Value) ? userId : null,
                Action = "SERVER_DELETED",
                EntityType = "Server",
                EntityId = id.ToString(),
                Details = $"Server '{serverName}' ({serverIp}) deleted"
            });
            await _db.SaveChangesAsync();

            return Ok(new ApiResponse<object>(true, "Xóa server thành công!", null));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi xóa server {ServerId}", id);
            return StatusCode(500, new ApiResponse<object>(false, $"Lỗi khi xóa server: {ex.Message}", null));
        }
    }

    /// <summary>Tái tạo API Key mới cho server</summary>
    [HttpPost("{id:guid}/regenerate-key")]
    [Authorize]
    [SupportedOSPlatform("windows")]
    public async Task<ActionResult<ApiResponse<ApiKeyGeneratedResponse>>> RegenerateKey(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();
        var userId = GetUserId();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<ApiKeyGeneratedResponse>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var newPlainKey = $"sk_live_{GenerateSecureKey(32)}";
        server.ApiKeyHash = ComputeSha256(newPlainKey);

        // Deactivate old keys
        var oldKeys = await _db.ApiKeys.Where(k => k.ServerId == id).ToListAsync();
        foreach (var k in oldKeys) k.IsActive = false;

        var newKey = new ApiKey
        {
            TenantId = server.TenantId,
            ServerId = server.Id,
            KeyHash = ComputeSha256(newPlainKey),
            EncryptedKey = EncryptString(newPlainKey),
            KeyPrefix = $"sk_live_{newPlainKey[8..12]}",
            Name = $"Agent Key - {server.Name} (Regenerated {DateTime.UtcNow:yyyyMMdd})",
            Permissions = "{\"ingest\":true,\"read\":true,\"write\":false}",
            IsActive = true
        };
        _db.ApiKeys.Add(newKey);

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = server.TenantId,
            UserId = userId.HasValue && await _db.Users.AnyAsync(u => u.Id == userId.Value) ? userId : null,
            Action = "API_KEY_REGENERATED",
            EntityType = "Server",
            EntityId = server.Id.ToString(),
            Details = $"API key regenerated for server '{server.Name}'"
        });

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<ApiKeyGeneratedResponse>(true,
            "API Key đã được tái tạo!", new ApiKeyGeneratedResponse(server.Id, newPlainKey, server.Name, DateTime.UtcNow)));
    }

    /// <summary>Lấy API Key của server (chỉ Admin)</summary>
    [HttpGet("{id:guid}/key")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> GetServerApiKey(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<object>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var activeKey = await _db.ApiKeys
            .Where(k => k.ServerId == id && k.IsActive)
            .OrderByDescending(k => k.CreatedAt)
            .FirstOrDefaultAsync();

        if (activeKey == null)
            return NotFound(new ApiResponse<object>(false, "Không có API Key active.", null));

        // Chỉ lưu hash trong DB — không thể trả về plain key. Prefix để nhận biết; key đầy đủ chỉ có lúc tạo mới / tái tạo.
        return Ok(new ApiResponse<object>(true, "Chỉ có prefix; key đầy đủ cần tái tạo nếu đã mất.", new
        {
            plainApiKey = (string?)null,
            keyPrefix = activeKey.KeyPrefix,
            serverId = server.Id,
            serverName = server.Name,
            activeKey.Name,
            activeKey.CreatedAt,
            activeKey.LastUsedAt
        }));
    }

    /// <summary>Reveal full API Key (chỉ SuperAdmin/Admin) - key được mã hóa bằng DPAPI</summary>
    [HttpGet("{id:guid}/reveal-key")]
    [Authorize]
    [SupportedOSPlatform("windows")]
    public async Task<ActionResult<ApiResponse<object>>> RevealServerApiKey(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<object>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var activeKey = await _db.ApiKeys
            .Where(k => k.ServerId == id && k.IsActive)
            .OrderByDescending(k => k.CreatedAt)
            .FirstOrDefaultAsync();

        if (activeKey == null)
            return NotFound(new ApiResponse<object>(false, "Không có API Key active.", null));

        // Nếu chưa có EncryptedKey, không thể khôi phục key gốc (SHA256 là hash một chiều)
        // User phải nhấn Regenerate để tạo key mới
        if (string.IsNullOrEmpty(activeKey.EncryptedKey))
        {
            return Ok(new ApiResponse<object>(true, "KEY_CHUA_MA_HOA", new
            {
                plainApiKey = (string?)null,
                keyPrefix = activeKey.KeyPrefix,
                serverId = server.Id,
                serverName = server.Name,
                activeKey.Name,
                activeKey.CreatedAt,
                message = "API Key này chưa được mã hóa. Vui lòng nhấn nút Regenerate (mũi tên xoay) để tạo key mới có thể xem."
            }));
        }

        var plainKey = DecryptString(activeKey.EncryptedKey);

        // Ghi log khi reveal
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = server.TenantId,
            UserId = GetUserId(),
            Action = "API_KEY_REVEALED",
            EntityType = "Server",
            EntityId = server.Id.ToString(),
            Details = $"API key revealed for server '{server.Name}'"
        });
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "OK", new
        {
            plainApiKey = plainKey,
            keyPrefix = activeKey.KeyPrefix,
            serverId = server.Id,
            serverName = server.Name,
            activeKey.Name,
            activeKey.CreatedAt,
            activeKey.LastUsedAt
        }));
    }

    private Guid? GetTenantId()
    {
        if (HttpContext.Items.TryGetValue("TenantId", out var tenantObj) && tenantObj is Guid tenantFromKey)
            return tenantFromKey;
        var val = User.FindFirstValue("tenantId");
        return val != null ? Guid.Parse(val) : null;
    }

    private string GetUserRole() => User.FindFirstValue(System.Security.Claims.ClaimTypes.Role) ?? "User";

    private Guid? GetUserId()
    {
        var val = User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier);
        return val != null ? Guid.Parse(val) : null;
    }

    private static string GenerateSecureKey(int length)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        return Convert.ToBase64String(bytes).Replace("+", "").Replace("/", "").Replace("=", "")[..length];
    }

    private static string ComputeSha256(string input)
    {
        var bytes = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLower();
    }

    [SupportedOSPlatform("windows")]
    private static string EncryptString(string plainText)
    {
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var encryptedBytes = System.Security.Cryptography.ProtectedData.Protect(
            plainBytes, null, System.Security.Cryptography.DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(encryptedBytes);
    }

    [SupportedOSPlatform("windows")]
    private static string DecryptString(string encryptedText)
    {
        var encryptedBytes = Convert.FromBase64String(encryptedText);
        var plainBytes = System.Security.Cryptography.ProtectedData.Unprotect(
            encryptedBytes, null, System.Security.Cryptography.DataProtectionScope.CurrentUser);
        return Encoding.UTF8.GetString(plainBytes);
    }

    // ============================================================================
    // SERVER ALERT EMAIL MANAGEMENT
    // ============================================================================

    /// <summary>Lấy danh sách email nhận thông báo của server</summary>
    [HttpGet("{id:guid}/alert-emails")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<List<ServerAlertEmailDto>>>> GetServerAlertEmails(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<List<ServerAlertEmailDto>>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var emails = await _db.ServerAlertEmails
            .Where(e => e.ServerId == id)
            .OrderBy(e => e.CreatedAt)
            .Select(e => new ServerAlertEmailDto(e.Id, e.ServerId, e.Email, e.IsActive, e.CreatedAt))
            .ToListAsync();

        return Ok(new ApiResponse<List<ServerAlertEmailDto>>(true, "OK", emails));
    }

    /// <summary>Thêm email nhận thông báo cho server (tối đa 5 email)</summary>
    [HttpPost("{id:guid}/alert-emails")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ServerAlertEmailDto>>> AddServerAlertEmail(
        Guid id, 
        [FromBody] AddServerAlertEmailRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<ServerAlertEmailDto>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        // Check limit: max 5 emails per server
        var currentCount = await _db.ServerAlertEmails.CountAsync(e => e.ServerId == id && e.IsActive);
        if (currentCount >= 5)
            return BadRequest(new ApiResponse<ServerAlertEmailDto>(false, 
                "Mỗi server chỉ được thêm tối đa 5 email nhận thông báo.", null));

        // Check duplicate
        var exists = await _db.ServerAlertEmails
            .AnyAsync(e => e.ServerId == id && e.Email == request.Email);
        if (exists)
            return BadRequest(new ApiResponse<ServerAlertEmailDto>(false, 
                "Email này đã được thêm cho server.", null));

        var alertEmail = new ServerAlertEmail
        {
            ServerId = id,
            Email = request.Email,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.ServerAlertEmails.Add(alertEmail);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Alert email {Email} added for server {ServerId}", request.Email, id);

        return Ok(new ApiResponse<ServerAlertEmailDto>(true, "Thêm email thành công!", 
            new ServerAlertEmailDto(alertEmail.Id, alertEmail.ServerId, alertEmail.Email, 
                alertEmail.IsActive, alertEmail.CreatedAt)));
    }

    /// <summary>Xóa email nhận thông báo</summary>
    [HttpDelete("{serverId:guid}/alert-emails/{emailId:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> DeleteServerAlertEmail(Guid serverId, Guid emailId)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        var server = await _db.Servers.FindAsync(serverId);
        if (server == null)
            return NotFound(new ApiResponse<object>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var alertEmail = await _db.ServerAlertEmails.FindAsync(emailId);
        if (alertEmail == null || alertEmail.ServerId != serverId)
            return NotFound(new ApiResponse<object>(false, "Email không tìm thấy.", null));

        _db.ServerAlertEmails.Remove(alertEmail);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Alert email {Email} removed from server {ServerId}", alertEmail.Email, serverId);

        return Ok(new ApiResponse<object>(true, "Xóa email thành công!", null));
    }

    /// <summary>Bật/tắt email nhận thông báo</summary>
    [HttpPut("{serverId:guid}/alert-emails/{emailId:guid}/toggle")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ServerAlertEmailDto>>> ToggleServerAlertEmail(
        Guid serverId, 
        Guid emailId)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        var server = await _db.Servers.FindAsync(serverId);
        if (server == null)
            return NotFound(new ApiResponse<ServerAlertEmailDto>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var alertEmail = await _db.ServerAlertEmails.FindAsync(emailId);
        if (alertEmail == null || alertEmail.ServerId != serverId)
            return NotFound(new ApiResponse<ServerAlertEmailDto>(false, "Email không tìm thấy.", null));

        alertEmail.IsActive = !alertEmail.IsActive;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Alert email {Email} toggled to {Status} for server {ServerId}", 
            alertEmail.Email, alertEmail.IsActive ? "active" : "inactive", serverId);

        return Ok(new ApiResponse<ServerAlertEmailDto>(true, 
            alertEmail.IsActive ? "Email đã được bật!" : "Email đã được tắt!", 
            new ServerAlertEmailDto(alertEmail.Id, alertEmail.ServerId, alertEmail.Email, 
                alertEmail.IsActive, alertEmail.CreatedAt)));
    }

    // ============================================================================
    // SERVER TELEGRAM RECIPIENT MANAGEMENT
    // ============================================================================

    /// <summary>Lấy danh sách Telegram chat nhận thông báo của server</summary>
    [HttpGet("{id:guid}/telegram-recipients")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<List<ServerTelegramRecipientDto>>>> GetServerTelegramRecipients(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<List<ServerTelegramRecipientDto>>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var recipients = await _db.ServerTelegramRecipients
            .Where(r => r.ServerId == id)
            .OrderBy(r => r.CreatedAt)
            .Select(r => new ServerTelegramRecipientDto(
                r.Id,
                r.ServerId,
                r.ChatId,
                r.DisplayName,
                r.IsActive,
                r.CreatedAt))
            .ToListAsync();

        return Ok(new ApiResponse<List<ServerTelegramRecipientDto>>(true, "OK", recipients));
    }

    /// <summary>Thêm Telegram chat nhận thông báo cho server (tối đa 5 chat)</summary>
    [HttpPost("{id:guid}/telegram-recipients")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ServerTelegramRecipientDto>>> AddServerTelegramRecipient(
        Guid id,
        [FromBody] AddServerTelegramRecipientRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        var server = await _db.Servers.FindAsync(id);
        if (server == null)
            return NotFound(new ApiResponse<ServerTelegramRecipientDto>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var chatId = request.ChatId.Trim();
        if (string.IsNullOrWhiteSpace(chatId))
            return BadRequest(new ApiResponse<ServerTelegramRecipientDto>(false, "Chat ID là bắt buộc.", null));

        var currentCount = await _db.ServerTelegramRecipients.CountAsync(r => r.ServerId == id && r.IsActive);
        if (currentCount >= 5)
            return BadRequest(new ApiResponse<ServerTelegramRecipientDto>(false,
                "Mỗi server chỉ được thêm tối đa 5 Telegram chat nhận thông báo.", null));

        var exists = await _db.ServerTelegramRecipients
            .AnyAsync(r => r.ServerId == id && r.ChatId == chatId);
        if (exists)
            return BadRequest(new ApiResponse<ServerTelegramRecipientDto>(false,
                "Chat ID này đã được thêm cho server.", null));

        var recipient = new ServerTelegramRecipient
        {
            ServerId = id,
            ChatId = chatId,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.ServerTelegramRecipients.Add(recipient);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Telegram recipient {ChatId} added for server {ServerId}", chatId, id);

        return Ok(new ApiResponse<ServerTelegramRecipientDto>(true, "Thêm Telegram chat thành công!",
            new ServerTelegramRecipientDto(
                recipient.Id,
                recipient.ServerId,
                recipient.ChatId,
                recipient.DisplayName,
                recipient.IsActive,
                recipient.CreatedAt)));
    }

    /// <summary>Xóa Telegram chat nhận thông báo</summary>
    [HttpDelete("{serverId:guid}/telegram-recipients/{recipientId:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> DeleteServerTelegramRecipient(Guid serverId, Guid recipientId)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        var server = await _db.Servers.FindAsync(serverId);
        if (server == null)
            return NotFound(new ApiResponse<object>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var recipient = await _db.ServerTelegramRecipients.FindAsync(recipientId);
        if (recipient == null || recipient.ServerId != serverId)
            return NotFound(new ApiResponse<object>(false, "Telegram chat không tìm thấy.", null));

        _db.ServerTelegramRecipients.Remove(recipient);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Telegram recipient {ChatId} removed from server {ServerId}", recipient.ChatId, serverId);

        return Ok(new ApiResponse<object>(true, "Xóa Telegram chat thành công!", null));
    }

    /// <summary>Bật/tắt Telegram chat nhận thông báo</summary>
    [HttpPut("{serverId:guid}/telegram-recipients/{recipientId:guid}/toggle")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ServerTelegramRecipientDto>>> ToggleServerTelegramRecipient(
        Guid serverId,
        Guid recipientId)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role != "SuperAdmin" && role != "Admin")
            return Forbid();

        var server = await _db.Servers.FindAsync(serverId);
        if (server == null)
            return NotFound(new ApiResponse<ServerTelegramRecipientDto>(false, "Server không tìm thấy.", null));

        if (role != "SuperAdmin" && server.TenantId != tenantId)
            return Forbid();

        var recipient = await _db.ServerTelegramRecipients.FindAsync(recipientId);
        if (recipient == null || recipient.ServerId != serverId)
            return NotFound(new ApiResponse<ServerTelegramRecipientDto>(false, "Telegram chat không tìm thấy.", null));

        recipient.IsActive = !recipient.IsActive;
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Telegram recipient {ChatId} toggled to {Status} for server {ServerId}",
            recipient.ChatId,
            recipient.IsActive ? "active" : "inactive",
            serverId);

        return Ok(new ApiResponse<ServerTelegramRecipientDto>(true,
            recipient.IsActive ? "Telegram chat đã được bật!" : "Telegram chat đã được tắt!",
            new ServerTelegramRecipientDto(
                recipient.Id,
                recipient.ServerId,
                recipient.ChatId,
                recipient.DisplayName,
                recipient.IsActive,
                recipient.CreatedAt)));
    }
}
