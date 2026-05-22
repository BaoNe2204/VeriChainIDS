using System.Collections.Concurrent;
using System.Net;
using System.Net.Mail;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Services;

public interface IEmailService
{
    Task SendAlertEmailAsync(Guid tenantId, string toEmail, Alert alert, Server? server);
    Task SendTicketNotificationAsync(Guid tenantId, string toEmail, Ticket ticket, string action);
    Task SendWelcomeEmailAsync(string toEmail, string companyName, string planName);
    Task SendPaymentConfirmationAsync(string toEmail, PaymentOrder order);
    Task SendNewUserCreatedEmailAsync(string toEmail, string fullName, string password, string role);
    Task SendPasswordChangedEmailAsync(string toEmail, string fullName);
    Task SendTicketCommentEmailAsync(Guid tenantId, string toEmail, Ticket ticket, string commenterName, string commentContent);
}

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;

    /// <summary>Rate limit: 1 email per (tenant + alertType + sourceIp) every 5 minutes.</summary>
    private static readonly ConcurrentDictionary<string, DateTime> _lastAlertSent = new();
    private static readonly TimeSpan _alertCooldown = TimeSpan.FromMinutes(5);

    /// <summary>Rate limit: 1 notification email per (tenantId + recipientEmail) every 5 minutes.</summary>
    private static readonly ConcurrentDictionary<string, DateTime> _lastNotifSent = new();
    private static readonly TimeSpan _notifCooldown = TimeSpan.FromMinutes(5);

    public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    private bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        try
        {
            var addr = new MailAddress(email);
            return addr.Address == email;
        }
        catch
        {
            return false;
        }
    }

    private static string AlertRateKey(Guid tenantId, string alertType, string? sourceIp) =>
        $"{tenantId}|{alertType}|{sourceIp ?? "none"}";

    private static string NotifRateKey(Guid tenantId, string email) =>
        $"{tenantId}|{email}";

    private bool IsAlertRateLimited(Guid tenantId, string alertType, string? sourceIp)
    {
        var key = AlertRateKey(tenantId, alertType, sourceIp);
        if (_lastAlertSent.TryGetValue(key, out var last))
        {
            if (DateTime.UtcNow - last < _alertCooldown)
                return true;
        }
        _lastAlertSent[key] = DateTime.UtcNow;
        return false;
    }

    private bool TrySetNotifRateLimited(Guid tenantId, string email)
    {
        var key = NotifRateKey(tenantId, email);
        if (_lastNotifSent.TryGetValue(key, out var last))
        {
            if (DateTime.UtcNow - last < _notifCooldown)
                return true;
        }
        _lastNotifSent[key] = DateTime.UtcNow;
        return false;
    }

    private SmtpClient BuildSmtpClient()
{
    var section = _configuration.GetSection("EmailConfig");
    
    var host = section["SmtpHost"] ?? "smtp.gmail.com";
    var port = int.Parse(section["SmtpPort"] ?? "587");
    var user = section["SmtpUser"];
    var pass = section["SmtpPass"];

    if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
    {
        _logger.LogCritical("SMTP Configuration is MISSING! Check appsettings.json path ConnectionStrings:EmailConfig");
    }

    var client = new SmtpClient(host, port)
    {
        UseDefaultCredentials = false,
        Credentials = new NetworkCredential(user, pass),
        EnableSsl = true
    };

    return client;
}

    private string GetFromEmail() => _configuration["ConnectionStrings:EmailConfig:FromEmail"] ?? "noreply@verichainids.vn";
    private string GetFromName() => _configuration["ConnectionStrings:EmailConfig:FromName"] ?? "VeriChainIDS SOC";


    public async Task SendAlertEmailAsync(Guid tenantId, string toEmail, Alert alert, Server? server)
    {
        // Validate email format
        if (!IsValidEmail(toEmail))
        {
            _logger.LogWarning("Invalid email format: {Email}. Skipping alert email.", toEmail);
            return;
        }

        // Rate limit: max 1 email per 5 minutes per (tenant + alertType + sourceIp)
        if (IsAlertRateLimited(tenantId, alert.AlertType ?? "Unknown", alert.SourceIp))
        {
            _logger.LogDebug("[Email] Rate-limited alert {AlertType} from {SourceIp} for tenant {TenantId}",
                alert.AlertType, alert.SourceIp, tenantId);
            return;
        }

        try
        {
            var severityColor = alert.Severity switch
            {
                "Critical" => "#DC2626",
                "High" => "#EA580C",
                "Medium" => "#D97706",
                _ => "#16A34A"
            };

            var body = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }}
        .header {{ background: linear-gradient(135deg, #dc2626, #991b1b); padding: 24px; text-align: center; }}
        .header h1 {{ color: white; margin: 0; font-size: 24px; }}
        .content {{ padding: 24px; }}
        .severity-badge {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 12px; color: white; background: {severityColor}; }}
        .detail-row {{ padding: 12px 0; border-bottom: 1px solid #334155; }}
        .detail-label {{ color: #94a3b8; font-size: 12px; text-transform: uppercase; }}
        .detail-value {{ color: #f1f5f9; font-size: 16px; margin-top: 4px; }}
        .action-btn {{ display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px; }}
        .footer {{ background: #0f172a; padding: 16px; text-align: center; color: #64748b; font-size: 12px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🚨 CẢNH BÁO BẢO MẬT - {alert.Severity.ToUpper()}</h1>
        </div>
        <div class='content'>
            <span class='severity-badge'>{alert.AlertType}</span>
            <h2 style='color: #f1f5f9; margin-top: 16px;'>{alert.Title}</h2>
            <p style='color: #94a3b8;'>{alert.Description}</p>
            <div class='detail-row'>
                <div class='detail-label'>Server bị ảnh hưởng</div>
                <div class='detail-value'>{(server != null ? $"{server.Name} ({server.IpAddress})" : "N/A")}</div>
            </div>
            <div class='detail-row'>
                <div class='detail-label'>IP nguồn tấn công</div>
                <div class='detail-value' style='color: #ef4444;'>{alert.SourceIp ?? "Không xác định"}</div>
            </div>
            <div class='detail-row'>
                <div class='detail-label'>MITRE ATT&CK</div>
                <div class='detail-value'>{alert.MitreTactic} → {alert.MitreTechnique}</div>
            </div>
            <div class='detail-row'>
                <div class='detail-label'>Thời gian</div>
                <div class='detail-value'>{alert.CreatedAt:dd/MM/yyyy HH:mm:ss} UTC</div>
            </div>
            <div class='detail-row'>
                <div class='detail-label'>Hành động khuyến nghị</div>
                <div class='detail-value'>{alert.RecommendedAction}</div>
            </div>
            <a href='#' class='action-btn'>XEM CHI TIẾT →</a>
        </div>
        <div class='footer'>
            VeriChainIDS SOC Platform | Email tự động - Vui lòng không reply
        </div>
    </div>
</body>
</html>";

            var msg = new MailMessage
            {
                From = new MailAddress(GetFromEmail(), GetFromName()),
                Subject = $"🚨 [{alert.Severity}] {alert.Title}",
                Body = body,
                IsBodyHtml = true
            };
            msg.To.Add(toEmail);

            using var client = BuildSmtpClient();
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send alert email to {Email}", toEmail);
        }
    }

    public async Task SendTicketNotificationAsync(Guid tenantId, string toEmail, Ticket ticket, string action)
    {
        // Validate email format
        if (!IsValidEmail(toEmail))
        {
            _logger.LogWarning("Invalid email format: {Email}. Skipping ticket notification.", toEmail);
            return;
        }

        // Rate limit: 1 email per (tenant + recipient) every 5 minutes
        if (TrySetNotifRateLimited(tenantId, toEmail))
        {
            _logger.LogDebug("[Email] Ticket notification rate-limited for {Email} in tenant {TenantId}", toEmail, tenantId);
            return;
        }

        // Fire-and-forget: không await, không chặn request chính
        _ = SendTicketNotificationInternalAsync(tenantId, toEmail, ticket, action);
    }

    private async Task SendTicketNotificationInternalAsync(Guid tenantId, string toEmail, Ticket ticket, string action)
    {
        try
        {
            var body = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; }}
        .header {{ background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 24px; text-align: center; }}
        .content {{ padding: 24px; }}
        .ticket-number {{ background: #334155; padding: 8px 16px; border-radius: 6px; font-family: monospace; font-size: 18px; color: #60a5fa; }}
        .status-badge {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }}
        .footer {{ background: #0f172a; padding: 16px; text-align: center; color: #64748b; font-size: 12px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1 style='color: white; margin: 0;'>🎫 PHIẾU SỰ CỐ MỚI</h1>
        </div>
        <div class='content'>
            <div class='ticket-number'>{ticket.TicketNumber}</div>
            <h2 style='color: #f1f5f9;'>{ticket.Title}</h2>
            <p style='color: #94a3b8;'>{ticket.Description}</p>
            <p><strong>Trạng thái:</strong> <span class='status-badge'>{ticket.Status}</span></p>
            <p><strong>Độ ưu tiên:</strong> {ticket.Priority}</p>
            <p><strong>Thao tác:</strong> {action}</p>
        </div>
        <div class='footer'>VeriChainIDS SOC Platform</div>
    </div>
</body>
</html>";

            var msg = new MailMessage
            {
                From = new MailAddress(GetFromEmail(), GetFromName()),
                Subject = $"🎫 [{ticket.TicketNumber}] {action}",
                Body = body,
                IsBodyHtml = true
            };
            msg.To.Add(toEmail);

            using var client = BuildSmtpClient();
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send ticket email to {Email}", toEmail);
        }
    }

    public async Task SendWelcomeEmailAsync(string toEmail, string companyName, string planName)
    {
        // Fire-and-forget: không chặn đăng ký user
        _ = SendWelcomeEmailInternalAsync(toEmail, companyName, planName);
    }

    private async Task SendWelcomeEmailInternalAsync(string toEmail, string companyName, string planName)
    {
        try
        {
            // Validate email format
            if (!IsValidEmail(toEmail))
            {
                _logger.LogWarning("Invalid email format: {Email}. Skipping welcome email.", toEmail);
                return;
            }

            var body = $@"
<!DOCTYPE html>
<html>
<head><meta charset='utf-8'></head>
<body style='font-family: Arial, sans-serif; background: #0f172a; color: #f1f5f9; padding: 40px;'>
    <div style='max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px;'>
        <h1 style='color: #10b981;'>🎉 Chào mừng {companyName}!</h1>
        <p>Bạn đã đăng ký thành công gói <strong>{planName}</strong> trên VeriChainIDS SOC Platform.</p>
        <p>Hệ thống của bạn đã sẵn sàng bảo vệ 24/7.</p>
        <a href='#' style='display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;'>ĐĂNG NHẬP NGAY</a>
    </div>
</body>
</html>";

            var msg = new MailMessage
            {
                From = new MailAddress(GetFromEmail(), GetFromName()),
                Subject = $"🎉 Chào mừng {companyName} đến với VeriChainIDS SOC!",
                Body = body,
                IsBodyHtml = true
            };
            msg.To.Add(toEmail);

            using var client = BuildSmtpClient();
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send welcome email to {Email}", toEmail);
        }
    }

    public async Task SendPaymentConfirmationAsync(string toEmail, PaymentOrder order)
    {
        // Fire-and-forget: không chặn request chính
        _ = SendPaymentConfirmationInternalAsync(toEmail, order);
    }

    private async Task SendPaymentConfirmationInternalAsync(string toEmail, PaymentOrder order)
    {
        try
        {
            // Validate email format
            if (!IsValidEmail(toEmail))
            {
                _logger.LogWarning("Invalid email format: {Email}. Skipping payment confirmation.", toEmail);
                return;
            }

            var body = $@"
<!DOCTYPE html>
<html>
<head><meta charset='utf-8'></head>
<body style='font-family: Arial, sans-serif; background: #0f172a; color: #f1f5f9; padding: 40px;'>
    <div style='max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px;'>
        <h1 style='color: #10b981;'>✅ Thanh toán thành công!</h1>
        <p><strong>Mã đơn hàng:</strong> {order.OrderId}</p>
        <p><strong>Gói dịch vụ:</strong> {order.PlanName}</p>
        <p><strong>Số tiền:</strong> {order.Amount:N0} VND</p>
        <p><strong>Trạng thái:</strong> Đã thanh toán</p>
    </div>
</body>
</html>";

            var msg = new MailMessage
            {
                From = new MailAddress(GetFromEmail(), GetFromName()),
                Subject = $"✅ Xác nhận thanh toán - {order.OrderId}",
                Body = body,
                IsBodyHtml = true
            };
            msg.To.Add(toEmail);

            using var client = BuildSmtpClient();
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send payment confirmation to {Email}", toEmail);
        }
    }

    public async Task SendNewUserCreatedEmailAsync(string toEmail, string fullName, string password, string role)
    {
        try
        {
            // Validate email format
            if (!IsValidEmail(toEmail))
            {
                _logger.LogWarning("Invalid email format: {Email}. Skipping email send.", toEmail);
                return;
            }

            var body = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }}
        .header {{ background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 24px; text-align: center; }}
        .header h1 {{ color: white; margin: 0; font-size: 24px; }}
        .content {{ padding: 24px; }}
        .info-box {{ background: #334155; padding: 16px; border-radius: 8px; margin: 16px 0; }}
        .info-row {{ padding: 8px 0; border-bottom: 1px solid #475569; }}
        .info-label {{ color: #94a3b8; font-size: 12px; text-transform: uppercase; }}
        .info-value {{ color: #f1f5f9; font-size: 16px; font-weight: bold; }}
        .credentials {{ background: #0f172a; padding: 16px; border-radius: 8px; font-family: monospace; }}
        .footer {{ background: #0f172a; padding: 16px; text-align: center; color: #64748b; font-size: 12px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>👤 TÀI KHOẢN MỚI ĐƯỢC TẠO</h1>
        </div>
        <div class='content'>
            <p>Xin chào <strong>{fullName}</strong>,</p>
            <p>Tài khoản của bạn đã được tạo trên <strong>VeriChainIDS SOC Platform</strong>.</p>
            <div class='info-box'>
                <div class='info-row'>
                    <div class='info-label'>Họ tên</div>
                    <div class='info-value'>{fullName}</div>
                </div>
                <div class='info-row'>
                    <div class='info-label'>Email</div>
                    <div class='info-value'>{toEmail}</div>
                </div>
                <div class='info-row'>
                    <div class='info-label'>Vai trò</div>
                    <div class='info-value'>{role}</div>
                </div>
            </div>
            <div class='credentials'>
                <div class='info-label'>Mật khẩu tạm thời</div>
                <div class='info-value' style='font-size: 20px; color: #10b981;'>{password}</div>
            </div>
            <p style='margin-top: 16px;'>⚠️ <strong>Vì lý do bảo mật</strong>, vui lòng đổi mật khẩu ngay sau khi đăng nhập.</p>
            <a href='#' style='display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 8px;'>ĐĂNG NHẬP NGAY</a>
        </div>
        <div class='footer'>
            VeriChainIDS SOC Platform | Email tự động - Vui lòng không reply
        </div>
    </div>
</body>
</html>";

            var msg = new MailMessage
            {
                From = new MailAddress(GetFromEmail(), GetFromName()),
                Subject = $"👤 Tài khoản VeriChainIDS SOC của bạn đã được tạo",
                Body = body,
                IsBodyHtml = true
            };
            msg.To.Add(toEmail);

            using var client = BuildSmtpClient();
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send new user created email to {Email}", toEmail);
        }
    }

    public async Task SendPasswordChangedEmailAsync(string toEmail, string fullName)
    {
        try
        {
            // Validate email format
            if (!IsValidEmail(toEmail))
            {
                _logger.LogWarning("Invalid email format: {Email}. Skipping password changed email.", toEmail);
                return;
            }

            var body = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }}
        .header {{ background: linear-gradient(135deg, #dc2626, #991b1b); padding: 24px; text-align: center; }}
        .header h1 {{ color: white; margin: 0; font-size: 24px; }}
        .content {{ padding: 24px; }}
        .warning {{ background: #7f1d1d; border-left: 4px solid #ef4444; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }}
        .footer {{ background: #0f172a; padding: 16px; text-align: center; color: #64748b; font-size: 12px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🔐 MẬT KHẨU ĐÃ ĐƯỢC THAY ĐỔI</h1>
        </div>
        <div class='content'>
            <p>Xin chào <strong>{fullName}</strong>,</p>
            <p>Mật khẩu tài khoản VeriChainIDS SOC của bạn đã được thay đổi thành công.</p>
            <div class='warning'>
                <p style='margin: 0;'>⚠️ Nếu bạn <strong>không thực hiện</strong> thay đổi này, vui lòng liên hệ quản trị viên ngay lập tức!</p>
            </div>
            <p>Thời gian: <strong>{DateTime.UtcNow:dd/MM/yyyy HH:mm} UTC</strong></p>
        </div>
        <div class='footer'>
            VeriChainIDS SOC Platform | Email tự động - Vui lòng không reply
        </div>
    </div>
</body>
</html>";

            var msg = new MailMessage
            {
                From = new MailAddress(GetFromEmail(), GetFromName()),
                Subject = "🔐 Thông báo: Mật khẩu đã được thay đổi",
                Body = body,
                IsBodyHtml = true
            };
            msg.To.Add(toEmail);

            using var client = BuildSmtpClient();
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send password changed email to {Email}", toEmail);
        }
    }

    public async Task SendTicketCommentEmailAsync(Guid tenantId, string toEmail, Ticket ticket, string commenterName, string commentContent)
    {
        // Validate email format
        if (!IsValidEmail(toEmail))
        {
            _logger.LogWarning("Invalid email format: {Email}. Skipping ticket comment email.", toEmail);
            return;
        }

        // Rate limit: 1 email per (tenant + recipient) every 5 minutes
        if (TrySetNotifRateLimited(tenantId, toEmail))
        {
            _logger.LogDebug("[Email] Ticket comment email rate-limited for {Email}", toEmail);
            return;
        }

        // Fire-and-forget: không await
        _ = SendTicketCommentEmailInternalAsync(tenantId, toEmail, ticket, commenterName, commentContent);
    }

    private async Task SendTicketCommentEmailInternalAsync(Guid tenantId, string toEmail, Ticket ticket, string commenterName, string commentContent)
    {
        try
        {
            var preview = commentContent.Length > 200 ? commentContent[..200] + "..." : commentContent;

            var body = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }}
        .header {{ background: linear-gradient(135deg, #8b5cf6, #6d28d9); padding: 24px; text-align: center; }}
        .content {{ padding: 24px; }}
        .ticket-number {{ background: #334155; padding: 8px 16px; border-radius: 6px; font-family: monospace; font-size: 18px; color: #60a5fa; display: inline-block; }}
        .comment-box {{ background: #0f172a; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #8b5cf6; }}
        .comment-author {{ color: #a78bfa; font-weight: bold; }}
        .footer {{ background: #0f172a; padding: 16px; text-align: center; color: #64748b; font-size: 12px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>💬 Comment mới trên Ticket</h1>
        </div>
        <div class='content'>
            <div class='ticket-number'>{ticket.TicketNumber}</div>
            <h2 style='color: #f1f5f9; margin-top: 16px;'>{ticket.Title}</h2>
            <div class='comment-box'>
                <div class='comment-author'>{commenterName}</div>
                <p style='margin: 8px 0 0 0; color: #e2e8f0;'>{preview}</p>
            </div>
            <a href='#' style='display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 8px;'>XEM CHI TIẾT</a>
        </div>
        <div class='footer'>
            VeriChainIDS SOC Platform | Email tự động - Vui lòng không reply
        </div>
    </div>
</body>
</html>";

            var msg = new MailMessage
            {
                From = new MailAddress(GetFromEmail(), GetFromName()),
                Subject = $"💬 [{ticket.TicketNumber}] {commenterName} đã bình luận",
                Body = body,
                IsBodyHtml = true
            };
            msg.To.Add(toEmail);

            using var client = BuildSmtpClient();
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send ticket comment email to {Email}", toEmail);
        }
    }
}
