using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Controllers;

/// <summary>
/// Endpoints dành cho Agent tự đăng ký / lấy thông tin qua API Key.
/// </summary>
[ApiController]
[Route("api/agent")]
public class AgentController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<AgentController> _logger;

    public AgentController(VeriChainIDSDbContext db, ILogger<AgentController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Agent gọi GET /api/agent/whoami để lấy serverId đã đăng ký.
    /// Nếu chưa đăng ký → trả null (để Agent gọi POST /register).
    /// </summary>
    [HttpGet("whoami")]
    public async Task<ActionResult<ApiResponse<AgentWhoAmIResponse>>> WhoAmI()
    {
        var serverId = HttpContext.Items["ServerId"] as Guid?;
        var tenantId = HttpContext.Items["TenantId"] as Guid?;

        if (!serverId.HasValue || serverId.Value == Guid.Empty)
        {
            return Ok(new ApiResponse<AgentWhoAmIResponse>(
                true,
                "No server-level key registered yet; call POST /api/agent/register first.",
                new AgentWhoAmIResponse(null, tenantId, null)
            ));
        }

        var server = await _db.Servers
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == serverId.Value);

        return Ok(new ApiResponse<AgentWhoAmIResponse>(
            true,
            "OK",
            new AgentWhoAmIResponse(serverId, tenantId, server?.Name)
        ));
    }

    /// <summary>
    /// Agent gọi POST /api/agent/register để tự đăng ký server record.
    /// Nếu server có hostname này trong tenant đã tồn tại → trả serverId hiện có.
    /// Nếu chưa → tạo mới.
    /// Sau đó cập nhật ApiKey record gắn ServerId.
    /// </summary>
    [HttpPost("register")]
    public async Task<ActionResult<ApiResponse<AgentWhoAmIResponse>>> Register(
        [FromBody] AgentRegisterRequest request)
    {
        var apiKeyId = HttpContext.Items["ApiKeyId"] as Guid?;
        var tenantId = HttpContext.Items["TenantId"] as Guid?;

        if (string.IsNullOrWhiteSpace(request.Hostname))
        {
            return BadRequest(new ApiResponse<object>(false, "Hostname là bắt buộc.", null));
        }

        if (!tenantId.HasValue || tenantId.Value == Guid.Empty)
        {
            return BadRequest(new ApiResponse<object>(false, "TenantId không xác định được từ API Key.", null));
        }

        if (!apiKeyId.HasValue || apiKeyId.Value == Guid.Empty)
        {
            return BadRequest(new ApiResponse<object>(false, "ApiKeyId không xác định được.", null));
        }

        // 1. Tìm server có hostname này trong tenant
        var existing = await _db.Servers
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Name == request.Hostname);

        Guid serverId;
        string serverName;
        bool isNew;

        if (existing != null)
        {
            serverId = existing.Id;
            serverName = existing.Name;
            isNew = false;
            _logger.LogInformation("[Agent] Auto-registered: using existing server {ServerId} ({ServerName})",
                serverId, serverName);
        }
        else
        {
            // 2. Tạo server mới
            var newServer = new Server
            {
                TenantId = tenantId.Value,
                Name = request.Hostname,
                IpAddress = request.IpAddress ?? "",
                Status = "Online",
                OS = request.Os ?? "",
                CreatedAt = DateTime.UtcNow,
                LastSeenAt = DateTime.UtcNow
            };
            _db.Servers.Add(newServer);
            await _db.SaveChangesAsync();

            serverId = newServer.Id;
            serverName = newServer.Name;
            isNew = true;
            _logger.LogInformation("[Agent] Auto-registered: created NEW server {ServerId} ({ServerName}) for tenant {TenantId}",
                serverId, serverName, tenantId);

            // 3. Audit
            _db.AuditLogs.Add(new AuditLog
            {
                TenantId = tenantId.Value,
                UserId = Guid.Empty,
                Action = "SERVER_AGENT_AUTO_REGISTERED",
                EntityType = "Server",
                EntityId = serverId.ToString(),
                Details = $"Server '{serverName}' tự động đăng ký qua Agent."
            });
        }

        // 4. Cập nhật ApiKey gắn ServerId (nếu chưa gắn)
        var apiKey = await _db.ApiKeys.FindAsync(apiKeyId.Value);
        if (apiKey != null && (!apiKey.ServerId.HasValue || apiKey.ServerId.Value == Guid.Empty))
        {
            apiKey.ServerId = serverId;
            _logger.LogInformation("[Agent] ApiKey {ApiKeyId} linked to server {ServerId}", apiKeyId, serverId);
        }

        // 5. Cập nhật LastSeen + HealthUrl
        var server = await _db.Servers.FindAsync(serverId);
        if (server != null)
        {
            server.LastSeenAt = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(request.IpAddress))
                server.IpAddress = request.IpAddress;
            if (!string.IsNullOrEmpty(request.Os))
                server.OS = request.Os;
            if (isNew && !string.IsNullOrEmpty(request.Hostname))
                server.Name = request.Hostname;
            server.Status = "Online";
            server.IsHealthy = true;
            if (!string.IsNullOrEmpty(request.HealthUrl))
                server.HealthUrl = request.HealthUrl;
        }

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<AgentWhoAmIResponse>(
            true,
            isNew ? $"Server '{serverName}' đã được tạo và đăng ký." : $"Server '{serverName}' đã được liên kết.",
            new AgentWhoAmIResponse(serverId, tenantId, serverName)
        ));
    }
}
