using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using VeriChainIDS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "SuperAdmin")]
public class TestController : ControllerBase
{
    private readonly IEmailService _emailService;
    private readonly ITelegramService _telegramService;

    public TestController(IEmailService emailService, ITelegramService telegramService)
    {
        _emailService = emailService;
        _telegramService = telegramService;
    }

    /// <summary>Test gửi email</summary>
    [HttpPost("test-email")]
    public async Task<ActionResult<ApiResponse<object>>> TestEmail([FromBody] TestEmailRequest request)
    {
        try
        {
            await _emailService.SendWelcomeEmailAsync(request.Email, request.CompanyName ?? "Test Company", "Trial");
            return Ok(new ApiResponse<object>(true, "Email da duoc gui! Kiem tra ho thu.", null));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, $"Loi gui email: {ex.Message}", null));
        }
    }

    /// <summary>Generate BCrypt password hash</summary>
    [HttpPost("hash-password")]
    public Task<ActionResult<ApiResponse<object>>> HashPassword([FromBody] HashPasswordRequest request)
    {
        try
        {
            var hash = BCrypt.Net.BCrypt.HashPassword(request.Password, 11);
            return Task.FromResult<ActionResult<ApiResponse<object>>>(Ok(new ApiResponse<object>(true, "Hash generated successfully", new {
                password = request.Password,
                hash = hash
            })));
        }
        catch (Exception ex)
        {
            return Task.FromResult<ActionResult<ApiResponse<object>>>(BadRequest(new ApiResponse<object>(false, $"Error: {ex.Message}", null)));
        }
    }

    /// <summary>Test gửi email cảnh báo giả lập tấn công</summary>
    [HttpPost("simulate-attack")]
    public async Task<ActionResult<ApiResponse<object>>> SimulateAttack([FromBody] SimulateAttackRequest request)
    {
        try
        {
            var db = HttpContext.RequestServices.GetRequiredService<VeriChainIDSDbContext>();

            // Auto-discover TenantId from ServerId if not provided
            Guid tenantId;
            if (request.TenantId.HasValue)
            {
                tenantId = request.TenantId.Value;
            }
            else if (request.ServerId.HasValue)
            {
                var srvLookup = await db.Servers.FindAsync(request.ServerId.Value);
                if (srvLookup == null)
                    return BadRequest(new ApiResponse<object>(false, "ServerId not found in DB. Check your serverId.", null));
                tenantId = srvLookup.TenantId;
            }
            else
            {
                var firstTenant = await db.Tenants.Where(t => t.IsActive).FirstOrDefaultAsync();
                if (firstTenant == null)
                    return BadRequest(new ApiResponse<object>(false, "TenantId required. No active tenants in DB.", null));
                tenantId = firstTenant.Id;
            }

            var alert = new Alert
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ServerId = request.ServerId,
                Severity = request.Severity ?? "Critical",
                AlertType = request.AlertType ?? "DDoS",
                Title = request.Title ?? "[TEST] Phat hien tan cong DDoS",
                Description = request.Description ?? "Day la alert TEST. He thong phat hien 10,000 requests/giay tu IP 1.1.1.1",
                SourceIp = request.SourceIp ?? "1.1.1.1",
                TargetAsset = request.TargetAsset ?? "Web Server",
                MitreTactic = "Impact",
                MitreTechnique = "T1498 - Network Denial of Service",
                AnomalyScore = 0.95m,
                RecommendedAction = "Chan IP nguon tan cong, bat rate limiting",
                Status = "Open",
                CreatedAt = DateTime.UtcNow
            };

            db.Alerts.Add(alert);

            var serverEntity = request.ServerId.HasValue ? await db.Servers.FindAsync(request.ServerId.Value) : null;

            var adminUserId = await db.Users
                .Where(u => u.TenantId == tenantId && (u.Role == "Admin" || u.Role == "SuperAdmin"))
                .Select(u => (Guid?)u.Id)
                .FirstOrDefaultAsync();

            var ticketNumber = $"TK-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpper()}";
            var ticket = new Ticket
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                AlertId = alert.Id,
                TicketNumber = ticketNumber,
                Title = $"[Auto] {alert.Title}",
                Description = alert.Description,
                Priority = alert.Severity,
                Status = "OPEN",
                Category = "Security",
                CreatedBy = adminUserId ?? tenantId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Tickets.Add(ticket);
            await db.SaveChangesAsync();

            // Email alert: CHỈ gửi đến ServerAlertEmails — KHÔNG gửi đến bảng Users
            int emailsSent = 0;
            if (request.ServerId.HasValue)
            {
                var srvEmails = await db.ServerAlertEmails
                    .Where(e => e.ServerId == request.ServerId.Value && e.IsActive).ToListAsync();
                foreach (var alertEmail in srvEmails)
                {
                    try { await _emailService.SendAlertEmailAsync(tenantId, alertEmail.Email, alert, serverEntity); emailsSent++; }
                    catch (Exception ex) { Console.WriteLine($"[TestController] Email fail {alertEmail.Email}: {ex.Message}"); }
                }
            }

            var telegramChatsSent = await _telegramService.SendAlertAsync(tenantId, alert, serverEntity, ticket);

            Console.WriteLine($"[TestController] Alert created (tenant={tenantId}). Emails sent: {emailsSent}. Telegram: {telegramChatsSent} chats. Ticket: {ticketNumber}");

            return Ok(new ApiResponse<object>(true, $"Alert tao thanh cong! Email gui den {emailsSent} server email(s). Telegram gui den {telegramChatsSent} chat(s). Ticket: {ticketNumber}", new {
                tenantId = tenantId,
                alertId = alert.Id,
                ticketNumber = ticketNumber,
                emailsSent = emailsSent,
                telegramChatsSent = telegramChatsSent
            }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, $"Loi: {ex.Message}", null));
        }
    }
}

public record TestEmailRequest(string Email, string? CompanyName = null);
public record HashPasswordRequest(string Password);
public record SimulateAttackRequest(
    Guid? TenantId = null,
    Guid? ServerId = null,
    string? Severity = null,
    string? AlertType = null,
    string? Title = null,
    string? Description = null,
    string? SourceIp = null,
    string? TargetAsset = null
);
