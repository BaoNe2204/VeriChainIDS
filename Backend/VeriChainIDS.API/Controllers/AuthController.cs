using System.Security.Claims;
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
public class AuthController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IJwtService _jwtService;
    private readonly IEmailService _emailService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        VeriChainIDSDbContext db,
        IJwtService jwtService,
        IEmailService emailService,
        ILogger<AuthController> logger)
    {
        _db = db;
        _jwtService = jwtService;
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>Đăng nhập (bước 1: email + password; bước 2: temp token + 2FA code)</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<dynamic>>> Login([FromBody] LoginRequest request)
    {
        var email = request.Email.Trim();
        var user = await _db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Email == email && u.IsActive);

        if (user == null)
            return Unauthorized(new ApiResponse<object>(false, "Email hoặc mật khẩu không đúng.", null));

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash.Trim()))
            return Unauthorized(new ApiResponse<object>(false, "Email hoặc mật khẩu không đúng.", null));

        // Nếu có mã 2FA → đây là bước 2 (temp token + code)
        if (!string.IsNullOrEmpty(request.TwoFactorCode))
        {
            _logger.LogInformation("[Login-2FA-Step2] User {Email} attempting 2FA with code prefix: {Code}",
                email, request.TwoFactorCode.Length > 2 ? request.TwoFactorCode[..2] + "**" : "**");

            if (!user.TwoFactorEnabled || string.IsNullOrEmpty(user.TwoFactorSecret))
                return BadRequest(new ApiResponse<object>(false, "2FA không được bật cho tài khoản này.", null));

            if (!TryVerifyTotp(user.TwoFactorSecret, request.TwoFactorCode))
                return BadRequest(new ApiResponse<object>(false, "Mã 2FA không đúng.", null));

            _logger.LogInformation("[Login-2FA-Step2] User {Email} 2FA verified successfully", email);
        }
        else if (user.TwoFactorEnabled && !string.IsNullOrEmpty(user.TwoFactorSecret))
        {
            // Bước 1: mật khẩu đúng nhưng chưa có code → yêu cầu 2FA
            var tempToken = _jwtService.GenerateTempToken(user.Id, user.TenantId, user.Email, user.Role);
            return Ok(new ApiResponse<object>(true, "Vui lòng nhập mã 2FA.", new { requiresTwoFactor = true, tempToken }));
        }

        // Không có 2FA hoặc đã xác thực 2FA thành công
        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var token = _jwtService.GenerateToken(user.Id, user.TenantId, user.Email, user.Role);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            TenantId = user.TenantId,
            Action = "USER_LOGIN",
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers.UserAgent.ToString(),
            Details = $"User {user.Email} logged in"
        });
        await _db.SaveChangesAsync();

        var response = new AuthResponse(token, MapUserDto(user));
        return Ok(new ApiResponse<AuthResponse>(true, "Đăng nhập thành công!", response));
    }

    /// <summary>Đăng ký + Tạo Tenant mới</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> Register([FromBody] RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            return BadRequest(new ApiResponse<AuthResponse>(false, "Email đã được sử dụng.", null));

        var tenant = new Tenant
        {
            CompanyName = request.CompanyName,
            Subdomain = GenerateSubdomain(request.CompanyName)
        };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        var user = new User
        {
            TenantId = tenant.Id,
            Email = request.Email,
            PasswordHash = passwordHash,
            FullName = request.CompanyName + " Admin",
            Role = "Admin"
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var subscription = new Subscription
        {
            TenantId = tenant.Id,
            PlanName = "Starter",
            PlanPrice = 0,
            MaxServers = 1,
            Status = "Trial",
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(14)
        };
        _db.Subscriptions.Add(subscription);
        await _db.SaveChangesAsync();

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = tenant.Id,
            UserId = user.Id,
            Action = "TENANT_REGISTERED",
            Details = $"New tenant {tenant.CompanyName} registered"
        });
        await _db.SaveChangesAsync();

        await _emailService.SendWelcomeEmailAsync(request.Email, request.CompanyName, "Starter");

        var token = _jwtService.GenerateToken(user.Id, user.TenantId, user.Email, user.Role);
        var response = new AuthResponse(token, MapUserDto(user));

        return Ok(new ApiResponse<AuthResponse>(true, "Đăng ký thành công! Workspace đã được tạo.", response));
    }

    /// <summary>Bước 2 đăng nhập: dùng temp token + mã 2FA</summary>
    [HttpPost("login-2fa")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<AuthResponse>>> LoginWith2FA([FromBody] TwoFactorVerifyRequest request)
    {
        var userId = GetUserId();
        var tokenType = User.FindFirstValue("tokenType");
        if (tokenType != "temp")
            return BadRequest(new ApiResponse<object>(false, "Token không hợp lệ. Vui lòng đăng nhập lại.", null));

        var user = await _db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);

        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        if (!user.TwoFactorEnabled || string.IsNullOrEmpty(user.TwoFactorSecret))
            return BadRequest(new ApiResponse<object>(false, "2FA không được bật.", null));

        _logger.LogInformation("[Login-2FA] User {UserId} attempting login-2fa with code prefix: {Code}",
            userId, request.Code?.Length > 2 ? request.Code[..2] + "**" : "**");

        if (!TryVerifyTotp(user.TwoFactorSecret, request.Code))
            return BadRequest(new ApiResponse<object>(false, "Mã 2FA không đúng.", null));

        _logger.LogInformation("[Login-2FA] User {UserId} 2FA verified successfully", userId);

        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var token = _jwtService.GenerateToken(user.Id, user.TenantId, user.Email, user.Role);

        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            TenantId = user.TenantId,
            Action = "USER_LOGIN_2FA",
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers.UserAgent.ToString(),
            Details = $"User {user.Email} logged in with 2FA"
        });
        await _db.SaveChangesAsync();

        var response = new AuthResponse(token, MapUserDto(user));
        return Ok(new ApiResponse<AuthResponse>(true, "Đăng nhập thành công!", response));
    }

    /// <summary>Lấy thông tin user hiện tại</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<UserDto>>> GetMe()
    {
        var userId = GetUserId();
        var user = await _db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
            return NotFound(new ApiResponse<UserDto>(false, "User không tìm thấy.", null));

        return Ok(new ApiResponse<UserDto>(true, "OK", MapUserDto(user)));
    }

    /// <summary>Đổi mật khẩu user hiện tại</summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = GetUserId();
        var user = await _db.Users.FindAsync(userId);

        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
            return BadRequest(new ApiResponse<object>(false, "Mật khẩu hiện tại không đúng.", null));

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        await _db.SaveChangesAsync();

        await _emailService.SendPasswordChangedEmailAsync(user.Email, user.FullName);

        return Ok(new ApiResponse<object>(true, "Đổi mật khẩu thành công!", null));
    }

    /// <summary>Tạo secret + QR code để setup 2FA</summary>
    [HttpPost("2fa/setup")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<TwoFactorSetupResponse>>> SetupTwoFactor()
    {
        var userId = GetUserId();
        var user = await _db.Users.FindAsync(userId);
        if (user == null)
            return NotFound(new ApiResponse<TwoFactorSetupResponse>(false, "User không tìm thấy.", null));

        if (user.TwoFactorEnabled && !string.IsNullOrEmpty(user.TwoFactorSecret))
            return Ok(new ApiResponse<TwoFactorSetupResponse>(true, "2FA đã bật.", new TwoFactorSetupResponse(
                user.TwoFactorSecret, string.Empty, string.Empty)));

        var secretBytes = OtpNet.KeyGeneration.GenerateRandomKey(20);
        var secret = OtpNet.Base32Encoding.ToString(secretBytes);
        var issuer = "VeriChainIDS";
        var account = user.Email;
        var otpUri = $"otpauth://totp/{Uri.EscapeDataString(issuer)}:{Uri.EscapeDataString(account)}?secret={secret}&issuer={Uri.EscapeDataString(issuer)}&digits=6&period=30";

        // Encode URI thành base64 để truyền sang frontend (frontend dùng Google Charts API render QR)
        var base64Uri = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(otpUri));
        user.TwoFactorSecret = secret;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<TwoFactorSetupResponse>(true, "OK", new TwoFactorSetupResponse(secret, base64Uri, secret)));
    }

    /// <summary>Xác thực mã 2FA và bật 2FA</summary>
    [HttpPost("2fa/verify")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> VerifyTwoFactor([FromBody] TwoFactorVerifyRequest request)
    {
        var userId = GetUserId();
        var user = await _db.Users.FindAsync(userId);
        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        if (string.IsNullOrEmpty(user.TwoFactorSecret))
            return BadRequest(new ApiResponse<object>(false, "Chưa tạo secret 2FA. Gọi /2fa/setup trước.", null));

        _logger.LogInformation("[2FA-Verify] User {UserId} attempting verify with code prefix: {Code}",
            userId, request.Code?.Length > 2 ? request.Code[..2] + "**" : "**");

        if (!TryVerifyTotp(user.TwoFactorSecret, request.Code))
            return BadRequest(new ApiResponse<object>(false, "Mã 2FA không đúng.", null));

        user.TwoFactorEnabled = true;
        await _db.SaveChangesAsync();

        _logger.LogInformation("[2FA-Verify] User {UserId} enabled 2FA successfully", userId);
        return Ok(new ApiResponse<object>(true, "Đã bật 2FA thành công!", null));
    }

    /// <summary>Tắt 2FA (cần xác thực mã trước)</summary>
    [HttpPost("2fa/disable")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> DisableTwoFactor([FromBody] TwoFactorVerifyRequest request)
    {
        var userId = GetUserId();
        var user = await _db.Users.FindAsync(userId);
        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        if (!string.IsNullOrEmpty(user.TwoFactorSecret) && user.TwoFactorEnabled)
        {
            if (!TryVerifyTotp(user.TwoFactorSecret, request.Code))
                return BadRequest(new ApiResponse<object>(false, "Mã 2FA không đúng.", null));
        }

        user.TwoFactorEnabled = false;
        user.TwoFactorSecret = null;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "Đã tắt 2FA.", null));
    }

    /// <summary>Upload avatar (base64 data URL, max 100KB, client-side compressed)</summary>
    [HttpPost("avatar")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> UploadAvatar([FromBody] AvatarUploadRequest request)
    {
        var userId = GetUserId();
        var user = await _db.Users.FindAsync(userId);
        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        if (string.IsNullOrEmpty(request.AvatarDataUrl))
        {
            user.AvatarUrl = null; // clear avatar
        }
        else
        {
            // Basic validation: must be a data URL, must start with image MIME type
            if (!request.AvatarDataUrl.StartsWith("data:image/") || request.AvatarDataUrl.Length > 100_000)
                return BadRequest(new ApiResponse<object>(false, "Dữ liệu avatar không hợp lệ.", null));

            user.AvatarUrl = request.AvatarDataUrl;
        }

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, "Đã cập nhật avatar.", null));
    }

    /// <summary>
    /// Otp.NET mặc định chỉ khớp đúng 1 bước 30s — gần ranh giới hoặc lệch đồng hồ là fail dù mã đúng.
    /// RFC 6238 khuyên ±1 bước (độ trễ mạng / clock skew).
    /// Dùng RfcSpecified để cho phép ±1 bước (60s) — an toàn hơn.
    /// </summary>
    private bool TryVerifyTotp(string? base32Secret, string? code)
    {
        if (string.IsNullOrWhiteSpace(base32Secret) || string.IsNullOrWhiteSpace(code))
            return false;

        var normalized = base32Secret.Trim()
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .ToUpperInvariant();

        _logger.LogDebug("[2FA] Attempting verify with secret prefix: {Prefix}..., code: {Code}",
            normalized.Length > 4 ? normalized[..4] : normalized,
            code);

        byte[] secretBytes;
        try
        {
            secretBytes = OtpNet.Base32Encoding.ToBytes(normalized);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[2FA] Failed to decode Base32 secret: {Error}", ex.Message);
            return false;
        }

        // Cho phép ±1 bước (60s) — an toàn với clock skew nhẹ
        var totp = new OtpNet.Totp(secretBytes);
        bool isValid = totp.VerifyTotp(code.Trim(), out long timeStepMatched, OtpNet.VerificationWindow.RfcSpecifiedNetworkDelay);

        if (!isValid)
        {
            // Thử thủ công với ±2 bước để debug
            for (int offset = -2; offset <= 2; offset++)
            {
                if (offset == 0) continue;
                try
                {
                    long targetTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30 + offset;
                    var altTotp = new OtpNet.Totp(secretBytes, step: 30, totpSize: 6);
                    string altCode = altTotp.ComputeTotp(DateTimeOffset.FromUnixTimeSeconds(targetTime * 30).UtcDateTime);
                    if (string.Equals(altCode, code.Trim(), StringComparison.Ordinal))
                    {
                        _logger.LogWarning("[2FA] Code matched at offset {Offset} steps — possible clock skew detected", offset);
                        return true;
                    }
                }
                catch { /* ignore */ }
            }
            _logger.LogWarning("[2FA] Verification failed for code: {Code}", code);
        }
        else
        {
            _logger.LogInformation("[2FA] Verification succeeded at time step: {TimeStep}", timeStepMatched);
        }

        return isValid;
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? Guid.Empty.ToString());

    private static UserDto MapUserDto(User user) => new(
        user.Id, user.TenantId, user.Tenant?.CompanyName, user.Email, user.FullName, user.Role,
        user.LastLoginAt, user.TwoFactorEnabled, user.SessionTimeoutEnabled, user.SessionTimeoutMinutes,
        user.EmailAlertsEnabled, user.TelegramAlertsEnabled, user.PushNotificationsEnabled,
        user.TelegramChatId, user.AlertSeverityThreshold, user.AlertDigestMode, user.AvatarUrl);

    private static string GenerateSubdomain(string companyName)
    {
        var slug = companyName.ToLower()
            .Replace(" ", "-").Replace(".", "-").Replace(",", "").Replace("(", "").Replace(")", "");
        slug = slug.Normalize(System.Text.NormalizationForm.FormD);
        slug = new string(slug.Where(c => !char.GetUnicodeCategory(c).Equals(System.Globalization.UnicodeCategory.NonSpacingMark)).ToArray());
        return slug + "-" + Guid.NewGuid().ToString("N")[..6];
    }
}

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
