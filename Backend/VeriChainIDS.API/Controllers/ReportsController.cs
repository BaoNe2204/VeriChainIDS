using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<ReportsController> _logger;

    public ReportsController(VeriChainIDSDbContext db, ILogger<ReportsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>Xuất báo cáo Excel</summary>
    [HttpGet("export-excel")]
    [Authorize]
    public async Task<IActionResult> ExportExcel(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        [FromQuery] Guid? tenantId,
        [FromQuery] bool includeActivityLogs = true)
    {
        var now = DateTime.UtcNow;
        var vietnamTz = TimeZoneInfo.CreateCustomTimeZone("SE Asia Standard Time", TimeSpan.FromHours(7), "SE Asia Standard Time", "SE Asia Standard Time");
        DateTime ToVietNam(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(utc, vietnamTz);
        var start = startDate ?? now.AddDays(-30);
        var end = endDate ?? now;

        var currentTenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<Alert> alertQuery = _db.Alerts
            .Include(a => a.Server)
            .Include(a => a.AcknowledgedByUser)
            .Include(a => a.ResolvedByUser)
            .AsQueryable();

        IQueryable<Ticket> ticketQuery = _db.Tickets
            .Include(t => t.AssignedToUser)
            .Include(t => t.CreatedByUser)
            .Include(t => t.Comments)
                .ThenInclude(c => c.User)
            .AsQueryable();

        IQueryable<AuditLog> auditQuery = _db.AuditLogs
            .Include(a => a.User)
            .AsQueryable();

        if (role == "SuperAdmin")
        {
            if (tenantId.HasValue)
            {
                alertQuery = alertQuery.Where(a => a.TenantId == tenantId);
                ticketQuery = ticketQuery.Where(t => t.TenantId == tenantId);
                auditQuery = auditQuery.Where(a => a.TenantId == tenantId);
            }
        }
        else if (role == "Admin")
        {
            if (currentTenantId.HasValue)
            {
                alertQuery = alertQuery.Where(a => a.TenantId == currentTenantId);
                ticketQuery = ticketQuery.Where(t => t.TenantId == currentTenantId);
                auditQuery = auditQuery.Where(a => a.TenantId == currentTenantId);
            }
        }
        else
        {
            return Forbid();
        }

        alertQuery = alertQuery.Where(a => a.CreatedAt >= start && a.CreatedAt <= end);
        ticketQuery = ticketQuery.Where(t => t.CreatedAt >= start && t.CreatedAt <= end);
        auditQuery = auditQuery.Where(a => a.Timestamp >= start && a.Timestamp <= end);

        var alerts = await alertQuery.OrderByDescending(a => a.CreatedAt).ToListAsync();
        var tickets = await ticketQuery.OrderByDescending(t => t.CreatedAt).ToListAsync();
        var auditLogs = await auditQuery.OrderByDescending(a => a.Timestamp).Take(5000).ToListAsync();

        var topAttackers = alerts
            .Where(a => !string.IsNullOrEmpty(a.SourceIp) && a.Status == "Resolved")
            .GroupBy(a => a.SourceIp!)
            .Select(g => new ThreatSourceDto(g.Key, g.Count(), g.GroupBy(a => a.AlertType).OrderByDescending(x => x.Count()).First().Key))
            .OrderByDescending(x => x.AttackCount)
            .Take(10)
            .ToList();

        var alertsByType = alerts
            .GroupBy(a => a.AlertType)
            .Select(g => new AlertTypeStatDto(g.Key, g.Count(), g.First().Severity))
            .OrderByDescending(x => x.Count)
            .ToList();

        var totalAlerts = alerts.Count;
        var openAlerts = alerts.Count(a => a.Status == "Open");
        var resolvedAlerts = alerts.Count(a => a.Status == "Resolved");
        var criticalAlerts = alerts.Count(a => a.Severity == "Critical");
        var totalTickets = tickets.Count;
        var openTickets = tickets.Count(t => t.Status == "OPEN");
        var closedTickets = tickets.Count(t => t.Status == "CLOSED");
        var inProgressTickets = tickets.Count(t => t.Status == "IN_PROGRESS");

        var tenantName = "VeriChainIDS SOC";
        if (currentTenantId.HasValue)
        {
            var tenant = await _db.Tenants.FindAsync(currentTenantId.Value);
            tenantName = tenant?.CompanyName ?? tenantName;
        }

        var workbook = new ClosedXML.Excel.XLWorkbook();
        var wsSummary = workbook.Worksheets.Add("Tổng Quan");

        wsSummary.Cell("A1").Value = "VERICHAINIDS SOC - BÁO CÁO BẢO MẬT";
        wsSummary.Cell("A1").Style.Font.FontSize = 18;
        wsSummary.Cell("A1").Style.Font.Bold = true;
        wsSummary.Range("A1:D1").Merge();

        wsSummary.Cell("A2").Value = $"Công ty: {tenantName}";
        wsSummary.Cell("A3").Value = $"Thời gian: {start:dd/MM/yyyy} - {end:dd/MM/yyyy}";
        wsSummary.Cell("A4").Value = $"Ngày xuất: {DateTime.UtcNow:dd/MM/yyyy HH:mm} UTC";
        wsSummary.Range("A2:D4").Style.Font.FontSize = 11;

        wsSummary.Cell("A6").Value = "CHỈ SỐ TỔNG QUAN";
        wsSummary.Cell("A6").Style.Font.Bold = true;
        wsSummary.Cell("A6").Style.Font.FontSize = 13;
        wsSummary.Range("A6:B6").Merge();

        var summaryRows = new[]
        {
            ("Tổng cảnh báo", totalAlerts, "Cảnh báo đã được ghi nhận"),
            ("Cảnh báo mở", openAlerts, "Đang chờ xử lý"),
            ("Cảnh báo đã xử lý", resolvedAlerts, "Đã được giải quyết"),
            ("Cảnh báo nguy hiểm", criticalAlerts, "Cấp độ Critical"),
            ("", 0, ""),
            ("Tổng phiếu sự cố", totalTickets, "Tổng số ticket"),
            ("Ticket đang mở", openTickets, "Chờ xử lý"),
            ("Ticket đang xử lý", inProgressTickets, "Đang được assign"),
            ("Ticket đã đóng", closedTickets, "Đã hoàn thành"),
        };

        var summaryColor = new Dictionary<string, string>
        {
            ["Cảnh báo nguy hiểm"] = "E53E3E",
            ["Cảnh báo mở"] = "DD6B20",
            ["Ticket đang mở"] = "DD6B20",
            ["Cảnh báo đã xử lý"] = "38A169",
            ["Ticket đã đóng"] = "38A169"
        };

        int row = 7;
        foreach (var (label, value, note) in summaryRows)
        {
            if (string.IsNullOrEmpty(label)) { row++; continue; }
            wsSummary.Cell($"A{row}").Value = label;
            wsSummary.Cell($"A{row}").Style.Font.Bold = true;
            wsSummary.Cell($"B{row}").Value = value;

            if (summaryColor.TryGetValue(label, out var hexColor))
            {
                var color = System.Drawing.ColorTranslator.FromHtml($"#{hexColor}");
                wsSummary.Cell($"B{row}").Style.Font.FontColor = ClosedXML.Excel.XLColor.FromArgb(color.A, color.R, color.G, color.B);
                wsSummary.Cell($"B{row}").Style.Font.Bold = true;
            }

            wsSummary.Cell($"C{row}").Value = note;
            wsSummary.Cell($"C{row}").Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#718096");
            row++;
        }

        row += 2;
        wsSummary.Cell($"A{row}").Value = "TOP NGUỒN TẤN CÔNG";
        wsSummary.Cell($"A{row}").Style.Font.Bold = true;
        wsSummary.Range($"A{row}:C{row}").Merge();

        row++;
        wsSummary.Cell($"A{row}").Value = "IP Address";
        wsSummary.Cell($"B{row}").Value = "Số lần tấn công";
        wsSummary.Cell($"C{row}").Value = "Loại tấn công phổ biến";
        wsSummary.Range($"A{row}:C{row}").Style.Font.Bold = true;
        wsSummary.Range($"A{row}:C{row}").Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#2D3748");
        wsSummary.Range($"A{row}:C{row}").Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#FFFFFF");

        row++;
        foreach (var attacker in topAttackers)
        {
            wsSummary.Cell($"A{row}").Value = attacker.IpAddress;
            wsSummary.Cell($"B{row}").Value = attacker.AttackCount;
            wsSummary.Cell($"C{row}").Value = attacker.MostCommonType;
            if (attacker.AttackCount > 5)
                wsSummary.Range($"A{row}:C{row}").Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#FED7D7");
            row++;
        }

        row += 2;
        wsSummary.Cell($"A{row}").Value = "PHÂN BỔ CẢNH BÁO THEO LOẠI";
        wsSummary.Cell($"A{row}").Style.Font.Bold = true;
        row++;
        wsSummary.Cell($"A{row}").Value = "Loại cảnh báo";
        wsSummary.Cell($"B{row}").Value = "Số lượng";
        wsSummary.Cell($"C{row}").Value = "Mức độ nghiêm trọng";
        wsSummary.Range($"A{row}:C{row}").Style.Font.Bold = true;
        row++;
        foreach (var at in alertsByType)
        {
            wsSummary.Cell($"A{row}").Value = at.AlertType;
            wsSummary.Cell($"B{row}").Value = at.Count;
            wsSummary.Cell($"C{row}").Value = at.Severity;

            var sevColor = at.Severity switch
            {
                "Critical" => "#E53E3E",
                "High" => "DD6B20",
                "Medium" => "D69E2E",
                _ => "38A169"
            };
            wsSummary.Cell($"C{row}").Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml(sevColor);
            wsSummary.Cell($"C{row}").Style.Font.Bold = true;
            row++;
        }

        wsSummary.Columns().AdjustToContents();

        var wsAlerts = workbook.Worksheets.Add("Chi Tiết Cảnh Báo");
        wsAlerts.Cell("A1").Value = "CHI TIẾT CẢNH BÁO BẢO MẬT";
        wsAlerts.Cell("A1").Style.Font.FontSize = 14;
        wsAlerts.Cell("A1").Style.Font.Bold = true;
        wsAlerts.Range("A1:L1").Merge();

        var alertHeaders = new[] { "ID", "Thời gian", "Loại", "Mức độ", "Tiêu đề", "Server", "IP Nguồn",
            "MITRE Tactic", "MITRE Technique", "Trạng thái", "Người tiếp nhận", "Người xử lý" };

        for (int i = 0; i < alertHeaders.Length; i++)
        {
            wsAlerts.Cell(3, i + 1).Value = alertHeaders[i];
            wsAlerts.Cell(3, i + 1).Style.Font.Bold = true;
            wsAlerts.Cell(3, i + 1).Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#1A202C");
            wsAlerts.Cell(3, i + 1).Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#FFFFFF");
        }

        int alertRow = 4;
        foreach (var alert in alerts)
        {
            wsAlerts.Cell(alertRow, 1).Value = alert.Id.ToString()[..8];
            wsAlerts.Cell(alertRow, 2).Value = ToVietNam(alert.CreatedAt).ToString("dd/MM/yyyy HH:mm");
            wsAlerts.Cell(alertRow, 3).Value = alert.AlertType;
            wsAlerts.Cell(alertRow, 4).Value = alert.Severity;
            wsAlerts.Cell(alertRow, 5).Value = alert.Title;
            wsAlerts.Cell(alertRow, 6).Value = alert.Server?.Name ?? "N/A";
            wsAlerts.Cell(alertRow, 7).Value = alert.SourceIp ?? "N/A";
            wsAlerts.Cell(alertRow, 8).Value = alert.MitreTactic ?? "";
            wsAlerts.Cell(alertRow, 9).Value = alert.MitreTechnique ?? "";
            wsAlerts.Cell(alertRow, 10).Value = alert.Status;
            wsAlerts.Cell(alertRow, 11).Value = alert.AcknowledgedByUser?.FullName ?? "";
            wsAlerts.Cell(alertRow, 12).Value = alert.ResolvedByUser?.FullName ?? "";

            var sevFill = alert.Severity switch
            {
                "Critical" => ClosedXML.Excel.XLColor.FromHtml("#FED7D7"),
                "High" => ClosedXML.Excel.XLColor.FromHtml("#FEEBC8"),
                "Medium" => ClosedXML.Excel.XLColor.FromHtml("#FAF089"),
                _ => ClosedXML.Excel.XLColor.FromHtml("#C6F6D5")
            };
            wsAlerts.Cell(alertRow, 4).Style.Fill.BackgroundColor = sevFill;

            var statusFill = alert.Status switch
            {
                "Resolved" => ClosedXML.Excel.XLColor.FromHtml("#C6F6D5"),
                "Open" => ClosedXML.Excel.XLColor.FromHtml("#FED7D7"),
                "Investigating" => ClosedXML.Excel.XLColor.FromHtml("#FEEBC8"),
                _ => ClosedXML.Excel.XLColor.FromHtml("#E2E8F0")
            };
            wsAlerts.Cell(alertRow, 10).Style.Fill.BackgroundColor = statusFill;
            alertRow++;
        }

        wsAlerts.Columns().AdjustToContents();

        var wsTickets = workbook.Worksheets.Add("Phiếu Sự Cố");
        wsTickets.Cell("A1").Value = "DANH SÁCH PHIẾU SỰ CỐ";
        wsTickets.Cell("A1").Style.Font.FontSize = 14;
        wsTickets.Cell("A1").Style.Font.Bold = true;
        wsTickets.Range("A1:J1").Merge();

        var ticketHeaders = new[] { "Mã Ticket", "Tiêu đề", "Độ ưu tiên", "Trạng thái", "Người phụ trách",
            "Người tạo", "Ngày tạo", "Ngày đóng", "Danh mục", "Số bình luận" };

        for (int i = 0; i < ticketHeaders.Length; i++)
        {
            wsTickets.Cell(3, i + 1).Value = ticketHeaders[i];
            wsTickets.Cell(3, i + 1).Style.Font.Bold = true;
            wsTickets.Cell(3, i + 1).Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#2B6CB0");
            wsTickets.Cell(3, i + 1).Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#FFFFFF");
        }

        int ticketRow = 4;
        foreach (var ticket in tickets)
        {
            wsTickets.Cell(ticketRow, 1).Value = ticket.TicketNumber;
            wsTickets.Cell(ticketRow, 1).Style.Font.Bold = true;
            wsTickets.Cell(ticketRow, 1).Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#3182CE");
            wsTickets.Cell(ticketRow, 2).Value = ticket.Title;
            wsTickets.Cell(ticketRow, 3).Value = ticket.Priority;
            wsTickets.Cell(ticketRow, 4).Value = ticket.Status;
            wsTickets.Cell(ticketRow, 5).Value = ticket.AssignedToUser?.FullName ?? "Chưa phân công";
            wsTickets.Cell(ticketRow, 6).Value = ticket.CreatedByUser?.FullName ?? "";
            wsTickets.Cell(ticketRow, 7).Value = ToVietNam(ticket.CreatedAt).ToString("dd/MM/yyyy HH:mm");
            wsTickets.Cell(ticketRow, 8).Value = ticket.ClosedAt.HasValue ? ToVietNam(ticket.ClosedAt.Value).ToString("dd/MM/yyyy HH:mm") : "";
            wsTickets.Cell(ticketRow, 9).Value = ticket.Category ?? "";
            wsTickets.Cell(ticketRow, 10).Value = ticket.Comments?.Count ?? 0;

            var prioFill = ticket.Priority switch
            {
                "Critical" => ClosedXML.Excel.XLColor.FromHtml("#FED7D7"),
                "High" => ClosedXML.Excel.XLColor.FromHtml("#FEEBC8"),
                "Medium" => ClosedXML.Excel.XLColor.FromHtml("#FAF089"),
                _ => ClosedXML.Excel.XLColor.FromHtml("#C6F6D5")
            };
            wsTickets.Cell(ticketRow, 3).Style.Fill.BackgroundColor = prioFill;

            var statusFill2 = ticket.Status switch
            {
                "CLOSED" => ClosedXML.Excel.XLColor.FromHtml("#C6F6D5"),
                "RESOLVED" => ClosedXML.Excel.XLColor.FromHtml("#9AE6B4"),
                "IN_PROGRESS" => ClosedXML.Excel.XLColor.FromHtml("#FBD38D"),
                "OPEN" => ClosedXML.Excel.XLColor.FromHtml("#FEB2B2"),
                _ => ClosedXML.Excel.XLColor.FromHtml("#E2E8F0")
            };
            wsTickets.Cell(ticketRow, 4).Style.Fill.BackgroundColor = statusFill2;
            ticketRow++;
        }

        wsTickets.Columns().AdjustToContents();

        if (topAttackers.Count > 0)
        {
            var wsAttack = workbook.Worksheets.Add("Nguồn Tấn Công");
            wsAttack.Cell("A1").Value = "TOP NGUỒN TẤN CÔNG NGUY HIỂM";
            wsAttack.Cell("A1").Style.Font.FontSize = 14;
            wsAttack.Cell("A1").Style.Font.Bold = true;
            wsAttack.Range("A1:C1").Merge();

            wsAttack.Cell(3, 1).Value = "IP Address";
            wsAttack.Cell(3, 2).Value = "Số lần tấn công";
            wsAttack.Cell(3, 3).Value = "Loại tấn công";
            wsAttack.Range("A3:C3").Style.Font.Bold = true;
            wsAttack.Range("A3:C3").Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#C53030");
            wsAttack.Range("A3:C3").Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#FFFFFF");

            int atRow = 4;
            foreach (var attacker in topAttackers)
            {
                wsAttack.Cell(atRow, 1).Value = attacker.IpAddress;
                wsAttack.Cell(atRow, 1).Style.Font.Bold = true;
                wsAttack.Cell(atRow, 1).Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#C53030");
                wsAttack.Cell(atRow, 2).Value = attacker.AttackCount;
                wsAttack.Cell(atRow, 3).Value = attacker.MostCommonType;

                var dangerColor = attacker.AttackCount > 10
                    ? ClosedXML.Excel.XLColor.FromHtml("#FED7D7")
                    : ClosedXML.Excel.XLColor.FromHtml("#FEEBC8");
                wsAttack.Range($"A{atRow}:C{atRow}").Style.Fill.BackgroundColor = dangerColor;
                atRow++;
            }

            wsAttack.Columns().AdjustToContents();
        }

        if (includeActivityLogs && auditLogs.Count > 0)
        {
            var wsAudit = workbook.Worksheets.Add("Nhật Ký Hoạt Động");
            wsAudit.Cell("A1").Value = "NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG";
            wsAudit.Cell("A1").Style.Font.FontSize = 14;
            wsAudit.Cell("A1").Style.Font.Bold = true;
            wsAudit.Range("A1:H1").Merge();

            wsAudit.Cell("A2").Value = $"Tổng bản ghi: {auditLogs.Count}";
            wsAudit.Cell("A2").Style.Font.FontSize = 10;
            wsAudit.Cell("A2").Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#718096");

            var auditHeaders = new[] { "ID", "Thời gian", "Hành động", "Đối tượng", "ID Đối tượng", "Người dùng", "Địa chỉ IP", "Chi tiết" };
            for (int i = 0; i < auditHeaders.Length; i++)
            {
                wsAudit.Cell(4, i + 1).Value = auditHeaders[i];
                wsAudit.Cell(4, i + 1).Style.Font.Bold = true;
                wsAudit.Cell(4, i + 1).Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#2D3748");
                wsAudit.Cell(4, i + 1).Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#FFFFFF");
            }

            int auditRow = 5;
            foreach (var log in auditLogs)
            {
                wsAudit.Cell(auditRow, 1).Value = log.Id;
                wsAudit.Cell(auditRow, 2).Value = log.Timestamp.ToString("dd/MM/yyyy HH:mm:ss");
                wsAudit.Cell(auditRow, 3).Value = log.Action;

                var actionColor = log.Action switch
                {
                    string a when a.Contains("Create") || a.Contains("Login") => ClosedXML.Excel.XLColor.FromHtml("#C6F6D5"),
                    string a when a.Contains("Delete") || a.Contains("Remove") => ClosedXML.Excel.XLColor.FromHtml("#FED7D7"),
                    string a when a.Contains("Update") || a.Contains("Edit") => ClosedXML.Excel.XLColor.FromHtml("#FAF089"),
                    string a when a.Contains("Alert") => ClosedXML.Excel.XLColor.FromHtml("#FEEBC8"),
                    _ => ClosedXML.Excel.XLColor.FromHtml("#E2E8F0")
                };
                wsAudit.Cell(auditRow, 3).Style.Fill.BackgroundColor = actionColor;

                wsAudit.Cell(auditRow, 4).Value = log.EntityType ?? "";
                wsAudit.Cell(auditRow, 5).Value = log.EntityId ?? "";
                wsAudit.Cell(auditRow, 6).Value = log.User?.FullName ?? "System";
                wsAudit.Cell(auditRow, 7).Value = log.IpAddress ?? "";
                wsAudit.Cell(auditRow, 8).Value = log.Details ?? "";
                auditRow++;
            }

            wsAudit.Columns().AdjustToContents();
            wsAudit.Column(8).Width = 50;
        }

        var fileName = $"VeriChainIDS_Report_{tenantName.Replace(" ", "_")}_{DateTime.UtcNow:yyyyMMddHHmmss}.xlsx";
        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        ms.Position = 0;

        _logger.LogInformation("Report exported: {FileName}", fileName);

        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
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