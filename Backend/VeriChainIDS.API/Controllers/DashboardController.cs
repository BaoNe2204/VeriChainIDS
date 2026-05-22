using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<DashboardController> _logger;

    public DashboardController(VeriChainIDSDbContext db, ILogger<DashboardController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>Tổng quan dashboard với stats</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<DashboardSummary>>> GetDashboard()
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<Server> serverQuery = _db.Servers.AsNoTracking();
        IQueryable<Alert> alertQuery = _db.Alerts.AsNoTracking();
        IQueryable<Ticket> ticketQuery = _db.Tickets.AsNoTracking();
        IQueryable<TrafficLog> trafficQuery = _db.TrafficLogs.AsNoTracking();

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            serverQuery = serverQuery.Where(s => s.TenantId == tenantId);
            alertQuery = alertQuery.Where(a => a.TenantId == tenantId);
            ticketQuery = ticketQuery.Where(t => t.TenantId == tenantId);
            trafficQuery = trafficQuery.Where(t => t.TenantId == tenantId);
        }
        else if (role == "User")
        {
            return Forbid();
        }

        var today = DateTime.UtcNow.Date;
        var oneHourAgo = DateTime.UtcNow.AddHours(-1);
        var oneDayAgo = DateTime.UtcNow.AddHours(-24);

        var servers = await serverQuery.ToListAsync();
        
        var openAlertsCount = await alertQuery.Where(a => a.Status == "Open").CountAsync();
        var totalAlertsCount = await alertQuery.CountAsync();
        var criticalAlertsCount = await alertQuery.Where(a => a.Severity == "Critical" && a.Status == "Open").CountAsync();
        
        var openTicketsCount = await ticketQuery.Where(t => t.Status == "OPEN").CountAsync();
        var closedTicketsCount = await ticketQuery.Where(t => t.Status == "CLOSED").CountAsync();
        var todayClosedCount = await ticketQuery.Where(t => t.ClosedAt >= today).CountAsync();
        
        var recentAlerts = await alertQuery
            .Include(a => a.Server)
            .OrderByDescending(a => a.CreatedAt)
            .Take(10)
            .ToListAsync();
        
        var bandwidthIn = await trafficQuery.Where(t => t.Timestamp >= oneHourAgo).SumAsync(t => t.BytesIn);
        var bandwidthOut = await trafficQuery.Where(t => t.Timestamp >= oneHourAgo).SumAsync(t => t.BytesOut);
        
        var vietnamTz = TimeZoneInfo.CreateCustomTimeZone("SE Asia Standard Time", TimeSpan.FromHours(7), "SE Asia Standard Time", "SE Asia Standard Time");
        var trafficGroups = await trafficQuery
            .Where(t => t.Timestamp >= oneDayAgo)
            .Select(t => new { t.Timestamp, t.IsAnomaly })
            .ToListAsync();

        var vnHourGroups = trafficGroups
            .Select(t => new { VnTime = TimeZoneInfo.ConvertTimeFromUtc(t.Timestamp, vietnamTz), t.IsAnomaly })
            .GroupBy(x => x.VnTime.Hour)
            .Select(g => new { Hour = g.Key, Requests = g.Count(), Attacks = g.Count(x => x.IsAnomaly) })
            .ToList();
        
        var attackTypeGroups = await alertQuery
            .GroupBy(a => a.AlertType ?? "Unknown")
            .Select(g => new { Type = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .Take(10)
            .ToListAsync();
        
        var mitreGroups = await alertQuery
            .Where(a => a.MitreTechnique != null)
            .GroupBy(a => a.MitreTechnique!)
            .Select(g => new { Tech = g.Key, Count = g.Count(), Severity = g.Max(a => a.Severity) })
            .OrderByDescending(g => g.Count)
            .Take(6)
            .ToListAsync();

        var now = DateTime.UtcNow;
        var trafficData = new List<TrafficPointDto>();
        for (int i = 23; i >= 0; i--)
        {
            var utcHourStart = now.AddHours(-i);
            var vnHourStart = TimeZoneInfo.ConvertTimeFromUtc(utcHourStart, vietnamTz);
            var hourValue = vnHourStart.Hour;
            var match = vnHourGroups.FirstOrDefault(g => g.Hour == hourValue);
            trafficData.Add(new TrafficPointDto(vnHourStart.ToString("HH:mm"), match?.Requests ?? 0, match?.Attacks ?? 0));
        }

        var colors = new[] { "#ef4444", "#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b" };
        var totalAttacks = attackTypeGroups.Sum(g => g.Count);
        var attackTypes = attackTypeGroups
            .Select((g, idx) => new AttackTypeDto(g.Type, totalAttacks > 0 ? Math.Round((decimal)g.Count / totalAttacks * 100, 1) : 0, colors[idx % colors.Length]))
            .ToList();

        var mitreData = mitreGroups
            .Select(m => new MitrelDto(m.Tech, GetMitreName(m.Tech), m.Count, MapSeverity(m.Severity)))
            .ToList();

        var summary = new DashboardSummary(
            servers.Count,
            servers.Count(s => s.Status == "Online"),
            servers.Count(s => s.Status == "Offline"),
            openAlertsCount,
            totalAlertsCount,
            criticalAlertsCount,
            openTicketsCount,
            closedTicketsCount,
            todayClosedCount,
            bandwidthIn + bandwidthOut,
            closedTicketsCount > 0 ? 120m : 85m,
            bandwidthIn,
            bandwidthOut,
            servers.Select(s => new ServerHealthDto(s.Id, s.Name, s.IpAddress, s.Status, s.CpuUsage, s.RamUsage, s.DiskUsage, s.LastSeenAt)).ToList(),
            recentAlerts.Select(a => new AlertDto(
                a.Id, a.TenantId, a.ServerId, a.Server?.Name, a.Severity, a.AlertType, a.Title, a.Description,
                a.SourceIp, a.TargetAsset, a.MitreTactic, a.MitreTechnique, a.Status, a.AnomalyScore,
                a.RecommendedAction, a.CreatedAt, a.AcknowledgedAt, a.ResolvedAt,
                a.AcknowledgedByUser?.FullName, a.ResolvedByUser?.FullName)).ToList(),
            trafficData,
            attackTypes,
            mitreData
        );

        return Ok(new ApiResponse<DashboardSummary>(true, "OK", summary));
    }

    /// <summary>Thống kê alerts theo ngày</summary>
    [HttpGet("alert-stats")]
    public async Task<ActionResult<ApiResponse<object>>> GetAlertStats(
        [FromQuery] int days = 7,
        [FromQuery] Guid? serverId = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User") return Forbid();

        var startDate = DateTime.UtcNow.AddDays(-days);

        IQueryable<Alert> query = _db.Alerts.AsNoTracking();

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        if (serverId.HasValue)
            query = query.Where(a => a.ServerId == serverId);

        query = query.Where(a => a.CreatedAt >= startDate);

        var stats = await query
            .GroupBy(a => a.CreatedAt.Date)
            .Select(g => new { Date = g.Key, Total = g.Count(), Open = g.Count(a => a.Status == "Open"), Resolved = g.Count(a => a.Status == "Resolved") })
            .OrderBy(x => x.Date)
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, "OK", stats));
    }

    /// <summary>Thống kê tickets theo ngày</summary>
    [HttpGet("ticket-stats")]
    public async Task<ActionResult<ApiResponse<object>>> GetTicketStats(
        [FromQuery] int days = 7)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User") return Forbid();

        var startDate = DateTime.UtcNow.AddDays(-days);

        IQueryable<Ticket> query = _db.Tickets.AsNoTracking();

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(t => t.TenantId == tenantId);
        }

        query = query.Where(t => t.CreatedAt >= startDate);

        var stats = await query
            .GroupBy(t => t.CreatedAt.Date)
            .Select(g => new { Date = g.Key, Total = g.Count(), Open = g.Count(t => t.Status == "OPEN"), InProgress = g.Count(t => t.Status == "IN_PROGRESS"), Resolved = g.Count(t => t.Status == "RESOLVED"), Closed = g.Count(t => t.Status == "CLOSED") })
            .OrderBy(x => x.Date)
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, "OK", stats));
    }

    /// <summary>Top attackers</summary>
    [HttpGet("top-attackers")]
    public async Task<ActionResult<ApiResponse<object>>> GetTopAttackers(
        [FromQuery] int top = 10,
        [FromQuery] int days = 30)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User") return Forbid();

        var startDate = DateTime.UtcNow.AddDays(-days);

        IQueryable<Alert> query = _db.Alerts.AsNoTracking()
            .Where(a => !string.IsNullOrEmpty(a.SourceIp) && a.Status == "Resolved");

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(a => a.TenantId == tenantId);
        }

        query = query.Where(a => a.CreatedAt >= startDate);

        var attackers = await query
            .GroupBy(a => a.SourceIp!)
            .Select(g => new { IpAddress = g.Key, AttackCount = g.Count(), MostCommonType = g.GroupBy(a => a.AlertType).OrderByDescending(x => x.Count()).First().Key })
            .OrderByDescending(x => x.AttackCount)
            .Take(top)
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, "OK", attackers));
    }

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

    private static string GetMitreName(string technique)
    {
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "T1190", "Exploit Public-Facing App" },
            { "T1110", "Brute Force" },
            { "T1498", "Network Denial of Service" },
            { "T1059", "Command & Scripting Interpreter" },
            { "T1070", "Data Destruction" },
            { "T1047", "Windows Management Instrumentation" },
            { "T1055", "Process Injection" },
            { "T1566", "Phishing" },
            { "T1005", "Data from Local System" },
            { "T1041", "Exfiltration Over C2" },
        };
        return names.TryGetValue(technique, out var name) ? name : technique;
    }

    private static string MapSeverity(string? severity)
    {
        return severity?.ToUpperInvariant() switch
        {
            "CRITICAL" => "Critical",
            "HIGH" => "High",
            "MEDIUM" => "Medium",
            _ => "Low"
        };
    }
}
