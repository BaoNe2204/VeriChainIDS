using System.Security.Claims;
using System.Text;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Hubs;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/audit-logs")]
[Authorize]
public class AuditLogsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IHubContext<AlertHub, IAlertHub> _hub;
    private readonly ILogger<AuditLogsController> _logger;

    public AuditLogsController(
        VeriChainIDSDbContext db,
        IHubContext<AlertHub, IAlertHub> hub,
        ILogger<AuditLogsController> logger)
    {
        _db = db;
        _hub = hub;
        _logger = logger;
    }

    /// <summary>Lấy danh sách audit logs với filter</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<AuditLogDto>>>> GetAuditLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? action = null,
        [FromQuery] string? entityType = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        IQueryable<AuditLog> query = _db.AuditLogs.Include(a => a.User).AsQueryable();

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        if (!string.IsNullOrEmpty(action))
            query = query.Where(a => a.Action.Contains(action));
        if (!string.IsNullOrEmpty(entityType))
            query = query.Where(a => a.EntityType == entityType);
        if (userId.HasValue)
            query = query.Where(a => a.UserId == userId.Value);
        if (fromDate.HasValue)
            query = query.Where(a => a.Timestamp >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(a => a.Timestamp <= toDate.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AuditLogDto(
                a.Id, a.TenantId, a.UserId, a.User != null ? a.User.FullName : null,
                a.Action, a.EntityType, a.EntityId, a.IpAddress, a.Timestamp, a.Details))
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<AuditLogDto>>(true, "OK", new PagedResult<AuditLogDto>(
            items, totalCount, page, pageSize, (int)Math.Ceiling(totalCount / (double)pageSize))));
    }

    /// <summary>Lấy chi tiết audit log</summary>
    [HttpGet("{id:long}")]
    public async Task<ActionResult<ApiResponse<AuditLogDto>>> GetAuditLog(long id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var auditLog = await _db.AuditLogs
            .Include(a => a.User)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (auditLog == null)
            return NotFound(new ApiResponse<AuditLogDto>(false, "Audit log không tìm thấy.", null));

        if (role == "Admin" && auditLog.TenantId != tenantId)
            return Forbid();

        return Ok(new ApiResponse<AuditLogDto>(true, "OK", new AuditLogDto(
            auditLog.Id, auditLog.TenantId, auditLog.UserId, auditLog.User?.FullName,
            auditLog.Action, auditLog.EntityType, auditLog.EntityId, auditLog.IpAddress,
            auditLog.Timestamp, auditLog.Details)));
    }

    /// <summary>Thống kê audit logs theo action type</summary>
    [HttpGet("stats")]
    public async Task<ActionResult<ApiResponse<object>>> GetAuditStats(
        [FromQuery] int days = 30)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        var startDate = DateTime.UtcNow.AddDays(-days);

        IQueryable<AuditLog> query = _db.AuditLogs.Where(a => a.Timestamp >= startDate);

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        var stats = await query
            .GroupBy(a => a.Action)
            .Select(g => new { Action = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, "OK", stats));
    }

    /// <summary>Xuất audit logs ra CSV</summary>
    [HttpGet("export")]
    public async Task<IActionResult> ExportCsv(
        [FromQuery] string? action = null,
        [FromQuery] string? entityType = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        IQueryable<AuditLog> query = _db.AuditLogs.Include(a => a.User).AsQueryable();

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        if (!string.IsNullOrEmpty(action))
            query = query.Where(a => a.Action.Contains(action));
        if (!string.IsNullOrEmpty(entityType))
            query = query.Where(a => a.EntityType == entityType);
        if (userId.HasValue)
            query = query.Where(a => a.UserId == userId.Value);
        if (fromDate.HasValue)
            query = query.Where(a => a.Timestamp >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(a => a.Timestamp <= toDate.Value);

        var logs = await query
            .OrderByDescending(a => a.Timestamp)
            .Take(10000)
            .ToListAsync();

        var sb = new StringBuilder();
        sb.AppendLine("ID,Timestamp,Action,EntityType,EntityId,UserName,IPAddress,Details");

        foreach (var log in logs)
        {
            sb.AppendLine($"{log.Id},{log.Timestamp:yyyy-MM-dd HH:mm:ss},{Escape(log.Action)},{Escape(log.EntityType ?? "")},{Escape(log.EntityId ?? "")},{Escape(log.User?.FullName ?? "System")},{Escape(log.IpAddress ?? "")},{Escape(log.Details ?? "")}");
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv", $"audit_logs_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
    }

    /// <summary>Xuất audit logs ra Excel</summary>
    [HttpGet("export-excel")]
    public async Task<IActionResult> ExportExcel(
        [FromQuery] string? action = null,
        [FromQuery] string? entityType = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        IQueryable<AuditLog> query = _db.AuditLogs.Include(a => a.User).AsQueryable();

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        if (!string.IsNullOrEmpty(action))
            query = query.Where(a => a.Action.Contains(action));
        if (!string.IsNullOrEmpty(entityType))
            query = query.Where(a => a.EntityType == entityType);
        if (userId.HasValue)
            query = query.Where(a => a.UserId == userId.Value);
        if (fromDate.HasValue)
            query = query.Where(a => a.Timestamp >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(a => a.Timestamp <= toDate.Value);

        var logs = await query
            .OrderByDescending(a => a.Timestamp)
            .Take(10000)
            .ToListAsync();

        var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("Nhật Ký Hoạt Động");

        ws.Cell("A1").Value = "NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG";
        ws.Cell("A1").Style.Font.FontSize = 16;
        ws.Cell("A1").Style.Font.Bold = true;
        ws.Range("A1:H1").Merge();

        ws.Cell("A2").Value = $"Xuất lúc: {DateTime.Now:dd/MM/yyyy HH:mm:ss}";
        ws.Cell("A2").Style.Font.FontSize = 10;
        ws.Cell("A2").Style.Font.FontColor = XLColor.FromHtml("#718096");
        ws.Cell("A3").Value = $"Tổng bản ghi: {logs.Count}";
        ws.Cell("A3").Style.Font.FontSize = 10;
        ws.Cell("A3").Style.Font.FontColor = XLColor.FromHtml("#718096");

        var headers = new[] { "ID", "Thời gian", "Hành động", "Đối tượng", "ID Đối tượng", "Người dùng", "Địa chỉ IP", "Chi tiết" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cell(5, i + 1).Value = headers[i];
            ws.Cell(5, i + 1).Style.Font.Bold = true;
            ws.Cell(5, i + 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#2D3748");
            ws.Cell(5, i + 1).Style.Font.FontColor = XLColor.FromHtml("#FFFFFF");
        }

        int row = 6;
        foreach (var log in logs)
        {
            ws.Cell(row, 1).Value = log.Id;
            ws.Cell(row, 2).Value = log.Timestamp.ToString("dd/MM/yyyy HH:mm:ss");
            ws.Cell(row, 3).Value = log.Action;

            var actionColor = log.Action switch
            {
                string a when a.Contains("Create") => XLColor.FromHtml("#C6F6D5"),
                string a when a.Contains("Delete") || a.Contains("Remove") => XLColor.FromHtml("#FED7D7"),
                string a when a.Contains("Update") || a.Contains("Edit") => XLColor.FromHtml("#FAF089"),
                string a when a.Contains("Login") || a.Contains("Logout") => XLColor.FromHtml("#BEE3F8"),
                _ => XLColor.FromHtml("#E2E8F0")
            };
            ws.Cell(row, 3).Style.Fill.BackgroundColor = actionColor;

            ws.Cell(row, 4).Value = log.EntityType ?? "";
            ws.Cell(row, 5).Value = log.EntityId ?? "";
            ws.Cell(row, 6).Value = log.User?.FullName ?? "System";
            ws.Cell(row, 7).Value = log.IpAddress ?? "";
            ws.Cell(row, 8).Value = log.Details ?? "";
            row++;
        }

        ws.Columns().AdjustToContents();
        ws.Column(8).Width = 50;

        var fileName = $"ActivityLogs_{DateTime.Now:yyyyMMddHHmmss}.xlsx";
        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        ms.Position = 0;

        _logger.LogInformation("Activity logs exported to Excel: {Count} records", logs.Count);

        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }

    /// <summary>Thống kê theo ngày (cho biểu đồ timeline)</summary>
    [HttpGet("timeline")]
    public async Task<ActionResult<ApiResponse<object>>> GetTimeline(
        [FromQuery] int days = 30)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        var startDate = DateTime.UtcNow.AddDays(-days).Date;

        IQueryable<AuditLog> query = _db.AuditLogs.Where(a => a.Timestamp >= startDate);

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        var timeline = await query
            .GroupBy(a => a.Timestamp.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .OrderBy(x => x.Date)
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, "OK", timeline));
    }

    /// <summary>Top người dùng hoạt động nhiều nhất</summary>
    [HttpGet("top-users")]
    public async Task<ActionResult<ApiResponse<object>>> GetTopUsers(
        [FromQuery] int days = 30,
        [FromQuery] int top = 10)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        var startDate = DateTime.UtcNow.AddDays(-days);

        IQueryable<AuditLog> query = _db.AuditLogs
            .Include(a => a.User)
            .Where(a => a.Timestamp >= startDate && a.UserId != null);

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        var topUsers = await query
            .GroupBy(a => new { a.UserId, a.User!.FullName, a.User.Email })
            .Select(g => new
            {
                UserId = g.Key.UserId,
                UserName = g.Key.FullName,
                Email = g.Key.Email,
                ActionCount = g.Count()
            })
            .OrderByDescending(x => x.ActionCount)
            .Take(top)
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, "OK", topUsers));
    }

    /// <summary>Đếm log mới (dùng cho real-time polling)</summary>
    [HttpGet("count-since")]
    public async Task<ActionResult<ApiResponse<object>>> GetCountSince(
        [FromQuery] DateTime since,
        [FromQuery] string? action = null,
        [FromQuery] string? entityType = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        IQueryable<AuditLog> query = _db.AuditLogs.Where(a => a.Timestamp > since);

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        if (!string.IsNullOrEmpty(action))
            query = query.Where(a => a.Action.Contains(action));
        if (!string.IsNullOrEmpty(entityType))
            query = query.Where(a => a.EntityType == entityType);

        var count = await query.CountAsync();
        return Ok(new ApiResponse<object>(true, "OK", new { count }));
    }

    // Ghi audit log mới (được gọi nội bộ từ các controller khác)
    public async Task LogAsync(Guid? tenantId, Guid? userId, string action,
        string? entityType = null, string? entityId = null,
        string? ipAddress = null, string? details = null)
    {
        var auditLog = new AuditLog
        {
            TenantId = tenantId,
            UserId = userId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            IpAddress = ipAddress,
            Details = details,
            Timestamp = DateTime.UtcNow
        };

        _db.AuditLogs.Add(auditLog);
        await _db.SaveChangesAsync();

        // Real-time broadcast
        if (tenantId.HasValue)
        {
            var dto = new AuditLogDto(
                auditLog.Id, auditLog.TenantId, auditLog.UserId, null,
                auditLog.Action, auditLog.EntityType, auditLog.EntityId,
                auditLog.IpAddress, auditLog.Timestamp, auditLog.Details);

            await _hub.Clients.Group(tenantId.Value.ToString()).AuditLogReceived(dto);
        }
    }

    private static string Escape(string s) =>
        $"\"{s.Replace("\"", "\"\"")}\"";

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