using System.Security.Cryptography;
using System.Text;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/logs")]
public class LogsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<LogsController> _logger;

    public LogsController(VeriChainIDSDbContext db, ILogger<LogsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Agent gọi API này để bắn log lên (có API Key auth via middleware)
    /// </summary>
    [HttpPost("ingest")]
    [AllowAnonymous] // Auth qua middleware ApiKeyAuth
    public async Task<ActionResult<ApiResponse<object>>> IngestLogs([FromBody] LogIngestRequest request)
    {
        var tenantId = HttpContext.Items["TenantId"] as Guid?;
        var serverId = HttpContext.Items["ServerId"] as Guid?;

        _logger.LogInformation("[INGEST] Received request from ServerId={ServerId}, Logs={LogCount}, CPU={Cpu}%, RAM={Ram}%, DISK={Disk}%", 
            serverId, request.Logs?.Count ?? 0, request.CpuPercent, request.RamPercent, request.DiskPercent);

        if (!tenantId.HasValue)
        {
            return Unauthorized(new ApiResponse<object>(false, "API Key không hợp lệ.", null));
        }

        if (request.Logs == null || request.Logs.Count == 0)
        {
            return BadRequest(new ApiResponse<object>(false, "Danh sách log rỗng.", null));
        }

        // Update server metrics if provided by agent
        if (serverId.HasValue)
        {
            var server = await _db.Servers.FindAsync(serverId.Value);
            if (server != null)
            {
                // Extract system metrics from agent payload if available
                // Agent v3 sends metrics in request object
                if (request.CpuPercent.HasValue)
                    server.CpuUsage = (decimal)request.CpuPercent.Value;
                if (request.RamPercent.HasValue)
                    server.RamUsage = (decimal)request.RamPercent.Value;
                if (request.DiskPercent.HasValue)
                    server.DiskUsage = (decimal)request.DiskPercent.Value;
                if (!string.IsNullOrEmpty(request.Os))
                    server.OS = request.Os;
                
                server.Status = "Online";
                server.LastSeenAt = DateTime.UtcNow;
                
                await _db.SaveChangesAsync();
                
                _logger.LogInformation("[INGEST] Updated server metrics: CPU={Cpu}%, RAM={Ram}%, DISK={Disk}%", 
                    server.CpuUsage, server.RamUsage, server.DiskUsage);
            }
        }

        // Giới hạn 5000 log per request để tránh abuse
        const int maxLogsPerRequest = 5000;
        var logsToProcess = request.Logs.Count > maxLogsPerRequest
            ? request.Logs.Take(maxLogsPerRequest).ToList()
            : request.Logs;

        if (request.Logs.Count > maxLogsPerRequest)
        {
            _logger.LogWarning("Agent {ServerId} gửi quá nhiều logs ({Count}), bị truncate còn {Max}", serverId, request.Logs.Count, maxLogsPerRequest);
        }

        var trafficLogs = logsToProcess.Select(log => new TrafficLog
        {
            TenantId = tenantId.Value,
            ServerId = serverId ?? Guid.Empty,
            SourceIp = log.SourceIp,
            DestinationIp = log.DestinationIp,
            SourcePort = log.SourcePort,
            DestinationPort = log.DestinationPort,
            Protocol = log.Protocol,
            BytesIn = log.BytesIn,
            BytesOut = log.BytesOut,
            PacketsIn = log.PacketsIn,
            PacketsOut = log.PacketsOut,
            RequestCount = log.RequestCount,
            RawPayload = log.RawPayload,
            Timestamp = DateTime.UtcNow,
            IsAnomaly = false
        }).ToList();

        _db.TrafficLogs.AddRange(trafficLogs);
        // Chunk lớn để tránh SQL timeout khi gửi volume cao
        const int chunkSize = 500;
        for (int i = 0; i < trafficLogs.Count; i += chunkSize)
        {
            var chunk = trafficLogs.Skip(i).Take(chunkSize).ToList();
            _db.TrafficLogs.Local.Clear();
            _db.TrafficLogs.AddRange(chunk);
            await _db.SaveChangesAsync();
        }

        _logger.LogInformation("Ingested {Count} traffic logs for server {ServerId}", logsToProcess.Count, serverId);

        return Ok(new ApiResponse<object>(true, $"Đã nhận {logsToProcess.Count} log entries.", new
        {
            received = logsToProcess.Count,
            timestamp = DateTime.UtcNow
        }));
    }

    /// <summary>AI Engine đọc logs KHÔNG giới hạn TenantId (đọc tất cả logs mọi workspace)</summary>
    /// <remarks>Dùng khi AI Engine cần phân tích logs từ nhiều Agent thuộc workspace khác nhau</remarks>
    [HttpGet("ai-fetch")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<PagedResult<TrafficLog>>>> AiFetchLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 3000,
        [FromQuery] Guid? serverId = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null,
        [FromQuery] bool? isAnomaly = null)
    {
        Guid? tenantId = HttpContext.Items["TenantId"] as Guid?;
        string role = GetUserOrApiKeyRole();

        // Kiểm tra API key hợp lệ (middleware đã xác thực rồi, nhưng vẫn check vì [AllowAnonymous])
        if (HttpContext.Items["ApiKeyId"] == null && User.Identity?.IsAuthenticated != true)
            return Unauthorized(new ApiResponse<object>(false, "Cần xác thực bằng X-API-Key hoặc JWT.", null));

        IQueryable<TrafficLog> query = _db.TrafficLogs;

        // SuperAdmin/API key AI: không filter TenantId → đọc toàn bộ logs
        // Nếu muốn giới hạn 1 tenant: truyền ?tenantId=xxx vào query
        if (role != "SuperAdmin")
        {
            // API key AI: bỏ qua TenantId → đọc all logs (bypass workspace isolation)
            // User JWT thường: vẫn filter theo TenantId
            if (HttpContext.Items["ApiKeyId"] == null && tenantId.HasValue)
                query = query.Where(t => t.TenantId == tenantId.Value);
        }

        if (serverId.HasValue)
            query = query.Where(t => t.ServerId == serverId.Value);

        if (fromDate.HasValue)
            query = query.Where(t => t.Timestamp >= fromDate.Value);

        if (toDate.HasValue)
            query = query.Where(t => t.Timestamp <= toDate.Value);

        if (isAnomaly.HasValue)
            query = query.Where(t => t.IsAnomaly == isAnomaly.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(t => t.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(t => t.Server)
            .ToListAsync();

        _logger.LogInformation(
            "[AI-FETCH] role={Role} tenantId={TenantId} items={Items} totalCount={Total} page={Page}",
            role, tenantId, items.Count, totalCount, page);

        return Ok(new ApiResponse<PagedResult<TrafficLog>>(true, "OK", new PagedResult<TrafficLog>(
            items, totalCount, page, pageSize, (int)Math.Ceiling(totalCount / (double)pageSize)
        )));
    }

    /// <summary>Lấy traffic logs (dashboard, analytics, AI Engine)</summary>
    [HttpGet]
    [AllowAnonymous] // Chấp nhận cả JWT Bearer (user) lẫn X-API-Key (AI Engine/Agent)
    public async Task<ActionResult<ApiResponse<PagedResult<TrafficLog>>>> GetLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100,
        [FromQuery] Guid? serverId = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null,
        [FromQuery] bool? isAnomaly = null)
    {
        // JWT auth → lấy từ claims; X-API-Key → lấy từ middleware đã set
        Guid? tenantId = HttpContext.Items["TenantId"] as Guid?;
        string role = GetUserOrApiKeyRole();

        IQueryable<TrafficLog> query = _db.TrafficLogs;

        if (role != "SuperAdmin")
        {
            if (tenantId.HasValue)
                query = query.Where(t => t.TenantId == tenantId.Value);
            else
                return Forbid();
        }

        if (serverId.HasValue)
            query = query.Where(t => t.ServerId == serverId.Value);

        if (fromDate.HasValue)
            query = query.Where(t => t.Timestamp >= fromDate.Value);

        if (toDate.HasValue)
            query = query.Where(t => t.Timestamp <= toDate.Value);

        if (isAnomaly.HasValue)
            query = query.Where(t => t.IsAnomaly == isAnomaly.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(t => t.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(t => t.Server)
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<TrafficLog>>(true, "OK", new PagedResult<TrafficLog>(
            items, totalCount, page, pageSize, (int)Math.Ceiling(totalCount / (double)pageSize)
        )));
    }

    /// <summary>Thống kê traffic theo IP nguồn (phát hiện tấn công)</summary>
    [HttpGet("top-sources")]
    [AllowAnonymous] // Chấp nhận cả JWT Bearer lẫn X-API-Key
    public async Task<ActionResult<ApiResponse<List<object>>>> GetTopSources(
        [FromQuery] int top = 20,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        var tenantId = HttpContext.Items["TenantId"] as Guid?;
        var role = GetUserOrApiKeyRole();

        var query = _db.TrafficLogs.AsQueryable();

        if (role != "SuperAdmin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(t => t.TenantId == tenantId.Value);
        }

        if (fromDate.HasValue)
            query = query.Where(t => t.Timestamp >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(t => t.Timestamp <= toDate.Value);

        var topSources = await query
            .GroupBy(t => t.SourceIp)
            .Select(g => new
            {
                IpAddress = g.Key,
                RequestCount = g.Sum(t => t.RequestCount),
                TotalBytes = g.Sum(t => t.BytesIn + t.BytesOut),
                PacketCount = g.Sum(t => t.PacketsIn + t.PacketsOut),
                UniquePorts = g.Select(t => t.DestinationPort).Distinct().Count(),
                LastSeen = g.Max(t => t.Timestamp)
            })
            .OrderByDescending(x => x.RequestCount)
            .Take(top)
            .ToListAsync();

        return Ok(new ApiResponse<List<object>>(true, "OK", topSources.Cast<object>().ToList()));
    }

    /// <summary>Xóa log cũ (cleanup)</summary>
    [HttpDelete("cleanup")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    public async Task<ActionResult<ApiResponse<object>>> CleanupOldLogs([FromQuery] int daysOld = 30)
    {
        var tenantId = HttpContext.Items["TenantId"] as Guid?;
        var role = GetUserRole();

        var cutoff = DateTime.UtcNow.AddDays(-daysOld);

        var query = _db.TrafficLogs.Where(t => t.Timestamp < cutoff);
        if (role != "SuperAdmin" && tenantId.HasValue)
            query = query.Where(t => t.TenantId == tenantId.Value);

        var count = await query.CountAsync();
        _db.TrafficLogs.RemoveRange(query);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, $"Đã xóa {count} log entries cũ hơn {daysOld} ngày.", new { deleted = count }));
    }

    private string GetUserRole() =>
        User.FindFirstValue(System.Security.Claims.ClaimTypes.Role) ?? "User";

    /// <summary>Dùng cho endpoint [AllowAnonymous]: ưu tiên JWT claims, fallback "Service" khi dùng X-API-Key</summary>
    private string GetUserOrApiKeyRole()
    {
        if (User.Identity?.IsAuthenticated == true)
            return User.FindFirstValue(System.Security.Claims.ClaimTypes.Role) ?? "User";
        // X-API-Key auth → coi như service/admin, có quyền đọc logs
        return HttpContext.Items["ApiKeyId"] != null ? "Service" : "User";
    }
}
