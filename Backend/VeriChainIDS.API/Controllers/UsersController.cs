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
[Authorize]
public class UsersController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IEmailService _emailService;
    private readonly ILogger<UsersController> _logger;

    public UsersController(
        VeriChainIDSDbContext db,
        IEmailService emailService,
        ILogger<UsersController> logger)
    {
        _db = db;
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>Lấy danh sách users với phân trang</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<UserDto>>>> GetUsers(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        [FromQuery] bool? isActive = null)
    {
        var currentRole = GetUserRole();
        var userId = GetUserId();
        var tenantId = GetTenantId();

        IQueryable<User> query = _db.Users.Include(u => u.Tenant).AsQueryable();

        if (currentRole == "SuperAdmin")
        {
            // SuperAdmin thấy all users
        }
        else if (currentRole == "Admin" || currentRole == "Staff")
        {
            // Admin và Staff chỉ thấy user cùng tenant
            query = query.Where(u => u.TenantId == tenantId);
        }
        else
        {
            return Forbid();
        }

        if (!string.IsNullOrEmpty(search))
            query = query.Where(u => u.FullName.Contains(search) || u.Email.Contains(search));
        if (!string.IsNullOrEmpty(role))
            query = query.Where(u => u.Role == role);
        if (isActive.HasValue)
            query = query.Where(u => u.IsActive == isActive.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new UserDto(
                u.Id, u.TenantId, u.Tenant!.CompanyName, u.Email, u.FullName, u.Role,
                u.LastLoginAt, u.TwoFactorEnabled, u.SessionTimeoutEnabled, u.SessionTimeoutMinutes,
                u.EmailAlertsEnabled, u.TelegramAlertsEnabled, u.PushNotificationsEnabled,
                u.TelegramChatId, u.AlertSeverityThreshold, u.AlertDigestMode, u.AvatarUrl))
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<UserDto>>(true, "OK", new PagedResult<UserDto>(
            items, totalCount, page, pageSize, (int)Math.Ceiling(totalCount / (double)pageSize))));
    }

    /// <summary>Lấy thông tin user theo ID</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<UserDto>>> GetUser(Guid id)
    {
        var currentRole = GetUserRole();
        var tenantId = GetTenantId();

        var user = await _db.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id == id);
        if (user == null)
            return NotFound(new ApiResponse<UserDto>(false, "User không tìm thấy.", null));

        if ((currentRole == "Admin" || currentRole == "Staff") && user.TenantId != tenantId)
            return Forbid();

        return Ok(new ApiResponse<UserDto>(true, "OK", MapUserDto(user)));
    }

    /// <summary>Tạo user mới</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<UserDto>>> CreateUser([FromBody] CreateUserRequest request)
    {
        var currentRole = GetUserRole();
        var currentTenantId = GetTenantId();

        if (currentRole != "SuperAdmin" && currentRole != "Admin" && currentRole != "Staff")
            return Forbid();

        // Staff chỉ được tạo User
        if (currentRole == "Staff" && request.Role != "User")
            return BadRequest(new ApiResponse<UserDto>(false, "Staff chỉ được tạo tài khoản User.", null));

        // Admin chỉ được tạo Staff hoặc User, không được tạo Admin/SuperAdmin khác
        if (currentRole == "Admin" && (request.Role == "Admin" || request.Role == "SuperAdmin"))
            return BadRequest(new ApiResponse<UserDto>(false, "Admin chỉ được tạo Staff hoặc User.", null));

        if ((currentRole == "Admin" || currentRole == "Staff") && request.TenantId != null && request.TenantId != currentTenantId)
            return Forbid();

        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            return BadRequest(new ApiResponse<UserDto>(false, "Email đã tồn tại.", null));

        if (currentRole == "Admin" && request.Role == "SuperAdmin")
            return Forbid();

        var user = new User
        {
            TenantId = request.TenantId ?? currentTenantId,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName,
            Role = request.Role
        };

        // Admin/Staff tự động gán tenantId của mình nếu không chỉ định
        if (user.TenantId == null && (currentRole == "Admin" || currentRole == "Staff"))
            user.TenantId = currentTenantId;

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // === NOTIFICATIONS ===
        await _emailService.SendNewUserCreatedEmailAsync(user.Email, user.FullName, request.Password, "Admin");

        // Chỉ tạo notifications nếu có TenantId hợp lệ
        if (user.TenantId.HasValue)
        {
            var admins = await _db.Users
                .Where(u => u.TenantId == user.TenantId && u.Id != user.Id && (u.Role == "Admin" || u.Role == "SuperAdmin"))
                .ToListAsync();

            foreach (var admin in admins)
            {
                _db.Notifications.Add(new Notification
                {
                    TenantId = user.TenantId.Value,
                    UserId = admin.Id,
                    Title = $"User mới: {user.FullName}",
                    Message = $"Tài khoản {user.Email} với vai trò {user.Role} đã được tạo.",
                    Type = "Info",
                    Link = "/dashboard/users"
                });
            }

            _db.Notifications.Add(new Notification
            {
                TenantId = user.TenantId.Value,
                UserId = user.Id,
                Title = "Chào mừng bạn!",
                Message = $"Tài khoản của bạn đã được tạo. Vai trò: {user.Role}",
                Type = "Info",
                Link = "/dashboard"
            });

            _db.AuditLogs.Add(new AuditLog
            {
                TenantId = user.TenantId,
                UserId = GetUserId(),
                Action = "USER_CREATED",
                EntityType = "User",
                EntityId = user.Id.ToString(),
                Details = $"User {user.Email} created"
            });

            await _db.SaveChangesAsync();
        }
        else
        {
            // Vẫn ghi audit log nhưng không có TenantId
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = GetUserId(),
                Action = "USER_CREATED",
                EntityType = "User",
                EntityId = user.Id.ToString(),
                Details = $"User {user.Email} created (no tenant)"
            });
            await _db.SaveChangesAsync();
        }

        return Ok(new ApiResponse<UserDto>(true, "Tạo user thành công!", MapUserDto(user)));
    }

    /// <summary>Cập nhật user</summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<UserDto>>> UpdateUser(Guid id, [FromBody] UpdateUserRequest request)
    {
        var currentRole = GetUserRole();
        var currentTenantId = GetTenantId();

        var user = await _db.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id == id);
        if (user == null)
            return NotFound(new ApiResponse<UserDto>(false, "User không tìm thấy.", null));

        if (currentRole == "Admin" && user.TenantId != currentTenantId)
            return Forbid();
        if (currentRole == "Staff" && (user.TenantId != currentTenantId || user.Role == "Admin" || user.Role == "SuperAdmin" || user.Role == "Staff"))
            return Forbid();
        if (currentRole == "User")
            return Forbid();

        // Staff chỉ được cập nhật User
        if (currentRole == "Staff" && request.Role != null && request.Role != "User")
            return BadRequest(new ApiResponse<UserDto>(false, "Staff chỉ được cập nhật tài khoản User.", null));

        // Admin không được nâng Staff lên Admin/SuperAdmin
        if (currentRole == "Admin" && request.Role is "Admin" or "SuperAdmin")
            return BadRequest(new ApiResponse<UserDto>(false, "Admin không được nâng quyền người khác lên Admin.", null));

        if (!string.IsNullOrEmpty(request.FullName))
            user.FullName = request.FullName;
        if (!string.IsNullOrEmpty(request.Role))
        {
            user.Role = request.Role;
        }
        if (request.IsActive.HasValue)
            user.IsActive = request.IsActive.Value;

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = user.TenantId,
            UserId = GetUserId(),
            Action = "USER_UPDATED",
            EntityType = "User",
            EntityId = user.Id.ToString(),
            Details = $"User {user.Email} updated"
        });

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<UserDto>(true, "Cập nhật thành công!", MapUserDto(user)));
    }

    /// <summary>Xóa user</summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteUser(Guid id)
    {
        var currentRole = GetUserRole();
        var currentTenantId = GetTenantId();
        var currentUserId = GetUserId();

        var user = await _db.Users.FindAsync(id);
        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        if (currentRole == "Admin" && user.TenantId != currentTenantId)
            return Forbid();
        if (currentRole == "Staff" && (user.TenantId != currentTenantId || user.Role != "User"))
            return Forbid();
        if (currentRole == "User")
            return Forbid();

        if (user.Id == currentUserId)
            return BadRequest(new ApiResponse<object>(false, "Không thể tự xóa chính mình.", null));

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = user.TenantId,
            UserId = currentUserId,
            Action = "USER_DELETED",
            EntityType = "User",
            EntityId = user.Id.ToString(),
            Details = $"User {user.Email} deleted"
        });

        // Null out CreatedBy on tickets created by this user to avoid FK conflict
        var ticketsCreatedByUser = await _db.Tickets
            .Where(t => t.CreatedBy == user.Id)
            .ToListAsync();
        foreach (var ticket in ticketsCreatedByUser)
            ticket.CreatedBy = null;

        // Null out AssignedTo/AssignedBy on tickets assigned to this user
        var ticketsAssigned = await _db.Tickets
            .Where(t => t.AssignedTo == user.Id || t.AssignedBy == user.Id)
            .ToListAsync();
        foreach (var ticket in ticketsAssigned)
        {
            if (ticket.AssignedTo == user.Id) ticket.AssignedTo = null;
            if (ticket.AssignedBy == user.Id) ticket.AssignedBy = null;
        }

        // Delete ticket comments by this user (UserId is [Required], can't null)
        var comments = await _db.TicketComments.Where(c => c.UserId == user.Id).ToListAsync();
        _db.TicketComments.RemoveRange(comments);

        // Delete notifications by this user (UserId is NOT NULL in DB, can't null)
        var notifications = await _db.Notifications.Where(n => n.UserId == user.Id).ToListAsync();
        _db.Notifications.RemoveRange(notifications);

        // Remove AlertDigestQueue entries by this user
        var digestQueue = await _db.AlertDigestQueue.Where(q => q.UserId == user.Id).ToListAsync();
        _db.AlertDigestQueue.RemoveRange(digestQueue);

        // Null out ResolvedBy on alerts resolved by this user
        var resolvedAlerts = await _db.Alerts.Where(a => a.ResolvedBy == user.Id).ToListAsync();
        foreach (var alert in resolvedAlerts)
            alert.ResolvedBy = null;

        // Null out AcknowledgedBy on alerts acknowledged by this user
        var acknowledgedAlerts = await _db.Alerts.Where(a => a.AcknowledgedBy == user.Id).ToListAsync();
        foreach (var alert in acknowledgedAlerts)
            alert.AcknowledgedBy = null;

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "Xóa user thành công!", null));
    }

    /// <summary>Đổi mật khẩu cho user khác (Admin/SuperAdmin)</summary>
    [HttpPut("{id:guid}/password")]
    public async Task<ActionResult<ApiResponse<object>>> ChangeUserPassword(Guid id, [FromBody] ChangeUserPasswordRequest request)
    {
        var currentRole = GetUserRole();
        var currentTenantId = GetTenantId();

        if (currentRole != "SuperAdmin" && currentRole != "Admin" && currentRole != "Staff")
            return Forbid();

        var user = await _db.Users.FindAsync(id);
        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        if (currentRole == "Admin" && user.TenantId != currentTenantId)
            return Forbid();
        if (currentRole == "Staff" && (user.TenantId != currentTenantId || user.Role != "User"))
            return Forbid();

        if (string.IsNullOrEmpty(request.NewPassword) || request.NewPassword.Length < 6)
            return BadRequest(new ApiResponse<object>(false, "Mật khẩu phải có ít nhất 6 ký tự.", null));

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = currentTenantId,
            UserId = GetUserId(),
            Action = "USER_PASSWORD_CHANGED",
            EntityType = "User",
            EntityId = user.Id.ToString(),
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            Details = $"Password changed for user {user.Email}"
        });

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "Đổi mật khẩu thành công!", null));
    }

    /// <summary>Cập nhật cài đặt nhận thông báo</summary>
    [HttpPut("{id:guid}/notification-settings")]
    public async Task<ActionResult<ApiResponse<UserDto>>> UpdateNotificationSettings(Guid id, [FromBody] UpdateNotificationSettingsRequest request)
    {
        var currentRole = GetUserRole();
        var currentTenantId = GetTenantId();

        var user = await _db.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id == id);
        if (user == null)
            return NotFound(new ApiResponse<UserDto>(false, "User không tìm thấy.", null));

        // Users can only update their own settings
        if (GetUserId() != id && currentRole == "User")
            return Forbid();

        if (currentRole == "Admin" && user.TenantId != currentTenantId)
            return Forbid();

        user.EmailAlertsEnabled = request.EmailAlertsEnabled;
        user.TelegramAlertsEnabled = request.TelegramAlertsEnabled;
        user.PushNotificationsEnabled = request.PushNotificationsEnabled;
        user.TelegramChatId = string.IsNullOrWhiteSpace(request.TelegramChatId) ? null : request.TelegramChatId.Trim();
        if (!string.IsNullOrEmpty(request.AlertSeverityThreshold))
            user.AlertSeverityThreshold = request.AlertSeverityThreshold.Trim();
        if (!string.IsNullOrEmpty(request.AlertDigestMode))
            user.AlertDigestMode = request.AlertDigestMode.Trim();

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<UserDto>(true, "Cập nhật cài đặt thông báo thành công!", MapUserDto(user)));
    }

    /// <summary>Cập nhật cài đặt bảo mật</summary>
    [HttpPut("{id:guid}/security-settings")]
    public async Task<ActionResult<ApiResponse<UserDto>>> UpdateSecuritySettings(Guid id, [FromBody] UpdateSecuritySettingsRequest request)
    {
        var currentRole = GetUserRole();
        var currentTenantId = GetTenantId();

        var user = await _db.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id == id);
        if (user == null)
            return NotFound(new ApiResponse<UserDto>(false, "User không tìm thấy.", null));

        // Users can only update their own settings
        if (GetUserId() != id && currentRole == "User")
            return Forbid();

        if (currentRole == "Admin" && user.TenantId != currentTenantId)
            return Forbid();

        var sessionTimeoutMinutes = request.SessionTimeoutMinutes <= 0 ? 30 : Math.Clamp(request.SessionTimeoutMinutes, 5, 240);

        user.TwoFactorEnabled = request.TwoFactorEnabled;
        user.SessionTimeoutEnabled = request.SessionTimeoutEnabled;
        user.SessionTimeoutMinutes = sessionTimeoutMinutes;

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<UserDto>(true, "Cập nhật cài đặt bảo mật thành công!", MapUserDto(user)));
    }

    /// <summary>SuperAdmin: Thay đổi subscription plan của user</summary>
    [HttpPut("{id:guid}/subscription")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateUserSubscription(
        Guid id,
        [FromBody] UpdateSubscriptionRequest request)
    {
        var user = await _db.Users.Include(u => u.Tenant).FirstOrDefaultAsync(u => u.Id == id);
        if (user == null)
            return NotFound(new ApiResponse<object>(false, "User không tìm thấy.", null));

        var tenant = user.Tenant;
        if (tenant == null)
            return NotFound(new ApiResponse<object>(false, "Tenant không tìm thấy.", null));

        // Validate plan exists
        var plan = await _db.PricingPlans.FirstOrDefaultAsync(p => p.Id == request.PlanId);
        if (plan == null)
            return NotFound(new ApiResponse<object>(false, "Gói không tồn tại.", null));

        // Create new subscription
        var startDate = request.StartDate ?? DateTime.UtcNow;
        var endDate = request.EndDate ?? startDate.AddMonths(request.DurationMonths ?? 1);

        var subscription = new Subscription
        {
            TenantId = tenant.Id,
            PlanName = plan.Name,
            PlanPrice = plan.Price,
            MaxServers = plan.Servers,
            StartDate = startDate,
            EndDate = endDate,
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        _db.Subscriptions.Add(subscription);
        await _db.SaveChangesAsync();

        _logger.LogInformation("SuperAdmin updated subscription for user {UserId} to plan {PlanName}", id, plan.Name);

        return Ok(new ApiResponse<object>(true, $"Đã cập nhật gói {plan.Name} cho người dùng.", new
        {
            userId = id,
            tenantId = tenant.Id,
            planId = plan.Id,
            planName = plan.Name,
            startDate = subscription.StartDate,
            endDate = subscription.EndDate
        }));
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

    private static UserDto MapUserDto(User user) => new(
        user.Id, user.TenantId, user.Tenant?.CompanyName, user.Email, user.FullName, user.Role,
        user.LastLoginAt, user.TwoFactorEnabled, user.SessionTimeoutEnabled, user.SessionTimeoutMinutes,
        user.EmailAlertsEnabled, user.TelegramAlertsEnabled, user.PushNotificationsEnabled,
        user.TelegramChatId, user.AlertSeverityThreshold, user.AlertDigestMode, user.AvatarUrl);
}

public record ChangeUserPasswordRequest(string NewPassword);