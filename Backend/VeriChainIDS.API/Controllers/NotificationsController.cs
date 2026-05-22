using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Hubs;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IHubContext<AlertHub, IAlertHub> _hub;
    private readonly ILogger<NotificationsController> _logger;

    public NotificationsController(
        VeriChainIDSDbContext db,
        IHubContext<AlertHub, IAlertHub> hub,
        ILogger<NotificationsController> logger)
    {
        _db = db;
        _hub = hub;
        _logger = logger;
    }

    /// <summary>Lấy danh sách notifications của user hiện tại</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<NotificationDto>>>> GetNotifications(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] bool? isRead = null,
        [FromQuery] string? type = null)
    {
        var userId = GetUserId();
        var tenantId = GetTenantId();

        IQueryable<Notification> query = _db.Notifications.Where(n => n.UserId == userId);

        if (isRead.HasValue)
            query = query.Where(n => n.IsRead == isRead.Value);
        if (!string.IsNullOrEmpty(type))
            query = query.Where(n => n.Type == type);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new NotificationDto(
                n.Id,
                n.TenantId,
                n.UserId,
                n.Title,
                n.Message,
                n.Type,
                n.IsRead,
                n.Link,
                n.CreatedAt
            ))
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<NotificationDto>>(true, "OK", new PagedResult<NotificationDto>(
            items, totalCount, page, pageSize, (int)Math.Ceiling(totalCount / (double)pageSize)
        )));
    }

    /// <summary>Đếm số notification chưa đọc</summary>
    [HttpGet("unread-count")]
    public async Task<ActionResult<ApiResponse<object>>> GetUnreadCount()
    {
        var userId = GetUserId();
        var count = await _db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead);
        return Ok(new ApiResponse<object>(true, "OK", new { count }));
    }

    /// <summary>Đánh dấu 1 notification là đã đọc</summary>
    [HttpPut("{id:guid}/read")]
    public async Task<ActionResult<ApiResponse<object>>> MarkAsRead(Guid id)
    {
        var userId = GetUserId();
        var notification = await _db.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (notification == null)
            return NotFound(new ApiResponse<object>(false, "Notification không tìm thấy.", null));

        notification.IsRead = true;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "Đã đánh dấu là đã đọc.", null));
    }

    /// <summary>Đánh dấu TẤT CẢ notifications là đã đọc</summary>
    [HttpPut("read-all")]
    public async Task<ActionResult<ApiResponse<object>>> MarkAllAsRead()
    {
        var userId = GetUserId();
        var count = await _db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));

        return Ok(new ApiResponse<object>(true, $"Đã đánh dấu {count} notification là đã đọc.", null));
    }

    /// <summary>Xóa notification</summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteNotification(Guid id)
    {
        var userId = GetUserId();
        var notification = await _db.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

        if (notification == null)
            return NotFound(new ApiResponse<object>(false, "Notification không tìm thấy.", null));

        _db.Notifications.Remove(notification);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "Đã xóa notification.", null));
    }

    /// <summary>Xóa tất cả notifications đã đọc</summary>
    [HttpDelete("clear-read")]
    public async Task<ActionResult<ApiResponse<object>>> ClearReadNotifications()
    {
        var userId = GetUserId();
        var count = await _db.Notifications
            .Where(n => n.UserId == userId && n.IsRead)
            .ExecuteDeleteAsync();

        return Ok(new ApiResponse<object>(true, $"Đã xóa {count} notifications.", null));
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
}
