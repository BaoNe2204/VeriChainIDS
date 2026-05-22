using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Extensions;
using VeriChainIDS.API.Hubs;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using VeriChainIDS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TicketsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IHubContext<AlertHub, IAlertHub> _hub;
    private readonly IEmailService _emailService;
    private readonly ILogger<TicketsController> _logger;

    public TicketsController(
        VeriChainIDSDbContext db,
        IHubContext<AlertHub, IAlertHub> hub,
        IEmailService emailService,
        ILogger<TicketsController> logger)
    {
        _db = db;
        _hub = hub;
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>Lấy danh sách tickets</summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<ApiResponse<PagedResult<TicketDto>>>> GetTickets(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? status = null,
        [FromQuery] string? priority = null,
        [FromQuery] string? category = null,
        [FromQuery] Guid? assignedTo = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<Ticket> query = _db.Tickets
            .Include(t => t.AssignedToUser)
            .Include(t => t.CreatedByUser)
            .Include(t => t.Comments)
                .ThenInclude(c => c.User);

        if (role != "SuperAdmin")
        {
            if (tenantId.HasValue)
                query = query.Where(t => t.TenantId == tenantId.Value);
            else
                return Forbid();
        }

        if (!string.IsNullOrEmpty(status))
            query = query.Where(t => t.Status == status);
        if (!string.IsNullOrEmpty(priority))
            query = query.Where(t => t.Priority == priority);
        if (!string.IsNullOrEmpty(category))
            query = query.Where(t => t.Category == category);
        if (assignedTo.HasValue)
            query = query.Where(t => t.AssignedTo == assignedTo.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<TicketDto>>(true, "OK", new PagedResult<TicketDto>(
            items.Select(MapTicketDto).ToList(),
            totalCount,
            page,
            pageSize,
            (int)Math.Ceiling(totalCount / (double)pageSize)
        )));
    }

    /// <summary>Lấy chi tiết ticket</summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<TicketDto>>> GetTicket(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var ticket = await _db.Tickets
            .Include(t => t.AssignedToUser)
            .Include(t => t.CreatedByUser)
            .Include(t => t.Alert)
            .Include(t => t.Comments)
                .ThenInclude(c => c.User)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (ticket == null)
            return NotFound(new ApiResponse<TicketDto>(false, "Ticket không tìm thấy.", null));

        if (role != "SuperAdmin" && ticket.TenantId != tenantId)
            return Forbid();

        return Ok(new ApiResponse<TicketDto>(true, "OK", MapTicketDto(ticket)));
    }

    /// <summary>Tạo ticket mới</summary>
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<ApiResponse<TicketDto>>> CreateTicket([FromBody] CreateTicketRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();
        
        // SuperAdmin có thể tạo ticket cho bất kỳ tenant nào (dùng request.TenantId)
        // Nếu SuperAdmin không chỉ định TenantId, tạo ticket với Guid.Empty (cho chính SuperAdmin)
        // Admin/User phải có tenantId trong JWT
        Guid effectiveTenantId;
        if (role == "SuperAdmin")
        {
            effectiveTenantId = request.TenantId ?? Guid.Empty; // Allow SuperAdmin to create tickets without specifying tenant
        }
        else
        {
            if (!tenantId.HasValue)
                return Unauthorized(new ApiResponse<TicketDto>(false, "Không xác định được tenant. Vui lòng đăng nhập lại.", null));
            effectiveTenantId = tenantId.Value;
        }

        var userId = GetUserId();

        // Sử dụng effectiveTenantId (từ JWT hoặc request tùy role)
        var ticketTenantId = effectiveTenantId;

        var ticketNumber = $"TK-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpper()}";

        var ticket = new Ticket
        {
            TenantId = ticketTenantId,
            AlertId = request.AlertId,
            TicketNumber = ticketNumber,
            Title = request.Title,
            Description = request.Description,
            Priority = request.Priority,
            Status = "OPEN",
            Category = request.Category,
            AssignedTo = request.AssignedTo,
            AssignedBy = request.AssignedTo,
            CreatedBy = request.CreatedBy,
            DueDate = DateTime.UtcNow.AddDays(GetPriorityDays(request.Priority))
        };

        _db.Tickets.Add(ticket);
        await _db.SaveChangesAsync();

        // Audit
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = ticketTenantId,
            UserId = userId,
            Action = "TICKET_CREATED",
            EntityType = "Ticket",
            EntityId = ticket.Id.ToString(),
            Details = $"Ticket {ticketNumber} created: {ticket.Title}"
        });
        await _db.SaveChangesAsync();

        // Load relationships
        await _db.Entry(ticket).Reference(t => t.AssignedToUser).LoadAsync();
        await _db.Entry(ticket).Reference(t => t.CreatedByUser).LoadAsync();
        await _db.Entry(ticket).Collection(t => t.Comments).LoadAsync();

        var dto = MapTicketDto(ticket);

        // Real-time notification — dùng ticketTenantId (từ JWT) thay vì request.TenantId
        await _hub.Clients.Group(ticketTenantId.ToString()).TicketCreated(dto);

        // === NOTIFICATION EMAIL ===
        // Gửi email cho tất cả Admin/SuperAdmin trong tenant về ticket mới
        var admins = await _db.Users
            .Where(u => u.TenantId == ticketTenantId && (u.Role == "Admin" || u.Role == "SuperAdmin"))
            .ToListAsync();

        var creator = await _db.Users.FindAsync(request.CreatedBy);

        foreach (var admin in admins)
        {
            // DB notification
            _db.Notifications.Add(new Notification
            {
                TenantId = ticketTenantId,
                UserId = admin.Id,
                Title = $"🎫 Ticket mới: {ticketNumber}",
                Message = $"{ticket.Title} (Priority: {ticket.Priority})",
                Type = "Ticket",
                Link = $"/dashboard/tickets/{ticket.Id}"
            });

            // Email - gửi cho người được assign hoặc tất cả admin nếu chưa assign
            if (request.AssignedTo.HasValue && request.AssignedTo.Value == admin.Id)
            {
                if (admin.EmailAlertsEnabled)
                    await _emailService.SendTicketNotificationAsync(ticketTenantId, admin.Email, ticket, "đã được phân công cho bạn");
            }
            else if (!request.AssignedTo.HasValue)
            {
                if (admin.EmailAlertsEnabled)
                    await _emailService.SendTicketNotificationAsync(ticketTenantId, admin.Email, ticket, "Ticket mới được tạo");
            }
        }

        // SignalR real-time notification push
        var notifDto = new NotificationDto(
            Guid.NewGuid(), ticketTenantId, Guid.Empty,
            $"🎫 Ticket mới: {ticketNumber}",
            $"{ticket.Title} (Priority: {ticket.Priority})",
            "Ticket",
            false,
            $"/dashboard/tickets/{ticket.Id}",
            DateTime.UtcNow
        );
        await _hub.Clients.Group(ticketTenantId.ToString()).NotificationReceived(notifDto);

        await _db.SaveChangesAsync();

        _logger.LogInformation("Ticket {Number} created: {Title}", ticketNumber, ticket.Title);

        return Ok(new ApiResponse<TicketDto>(true, $"Ticket {ticketNumber} đã được tạo!", dto));
    }

    /// <summary>Cập nhật trạng thái ticket</summary>
    [HttpPut("{id:guid}/status")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<TicketDto>>> UpdateTicketStatus(Guid id, [FromBody] UpdateTicketStatusRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var ticket = await _db.Tickets
            .Include(t => t.AssignedToUser)
            .Include(t => t.CreatedByUser)
            .Include(t => t.Comments)
                .ThenInclude(c => c.User)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (ticket == null)
            return NotFound(new ApiResponse<TicketDto>(false, "Ticket không tìm thấy.", null));

        if (role != "SuperAdmin" && ticket.TenantId != tenantId)
            return Forbid();

        var userId = GetUserId();

        ticket.Status = request.Status;
        ticket.UpdatedAt = DateTime.UtcNow;

        switch (request.Status)
        {
            case "IN_PROGRESS":
                ticket.AssignedTo = userId;
                ticket.AssignedBy = userId;
                break;
            case "RESOLVED":
                ticket.ResolvedAt = DateTime.UtcNow;
                break;
            case "CLOSED":
                ticket.ClosedAt = DateTime.UtcNow;
                ticket.ResolvedAt ??= DateTime.UtcNow;
                break;
        }

        // Add comment if provided
        if (!string.IsNullOrEmpty(request.Comment))
        {
            var comment = new TicketComment
            {
                TicketId = ticket.Id,
                UserId = userId,
                Content = request.Comment,
                IsInternal = false
            };
            _db.TicketComments.Add(comment);
        }

        // Update alert status if linked
        if (ticket.AlertId.HasValue && request.Status is "RESOLVED" or "CLOSED")
        {
            var alert = await _db.Alerts.FindAsync(ticket.AlertId.Value);
            if (alert != null)
            {
                alert.Status = "Resolved";
                alert.ResolvedBy = userId;
                alert.ResolvedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();

        // Audit
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = ticket.TenantId,
            UserId = userId,
            Action = "TICKET_STATUS_CHANGED",
            EntityType = "Ticket",
            EntityId = ticket.Id.ToString(),
            Details = $"Ticket {ticket.TicketNumber} status changed to {request.Status}"
        });
        await _db.SaveChangesAsync();

        await _db.Entry(ticket).Reference(t => t.AssignedToUser).LoadAsync();
        await _db.Entry(ticket).Reference(t => t.CreatedByUser).LoadAsync();
        await _db.Entry(ticket).Collection(t => t.Comments).LoadAsync();

        var dto = MapTicketDto(ticket);

        // Real-time notification
        await _hub.Clients.Group(ticket.TenantId.ToString()).TicketUpdated(dto);

        // === NOTIFICATION EMAIL ===
        var statusAction = request.Status switch
        {
            "IN_PROGRESS" => "chuyển sang IN_PROGRESS",
            "RESOLVED" => "đã được RESOLVED",
            "CLOSED" => "đã được CLOSED",
            "OPEN" => "mở lại",
            _ => $"cập nhật trạng thái thành {request.Status}"
        };

        var allAdmins = await _db.Users
            .Where(u => u.TenantId == ticket.TenantId && (u.Role == "Admin" || u.Role == "SuperAdmin"))
            .ToListAsync();

        foreach (var admin in allAdmins)
        {
            // DB notification
            _db.Notifications.Add(new Notification
            {
                TenantId = ticket.TenantId,
                UserId = admin.Id,
                Title = $"🔔 Ticket {ticket.TicketNumber} {statusAction}",
                Message = ticket.Title,
                Type = "Ticket",
                Link = $"/dashboard/tickets/{ticket.Id}"
            });

            // Email - gửi cho người được assign và người tạo
            if (ticket.AssignedTo.HasValue && ticket.AssignedTo.Value == admin.Id)
            {
                if (admin.EmailAlertsEnabled)
                    await _emailService.SendTicketNotificationAsync(ticket.TenantId, admin.Email, ticket, statusAction);
            }
            else if (ticket.CreatedBy.HasValue)
            {
                var createdBy = await _db.Users.FindAsync(ticket.CreatedBy.Value);
                if (createdBy != null && createdBy.Id == admin.Id)
                {
                    if (admin.EmailAlertsEnabled)
                        await _emailService.SendTicketNotificationAsync(ticket.TenantId, admin.Email, ticket, statusAction);
                }
            }
        }

        // SignalR real-time notification push
        var notifDto = new NotificationDto(
            Guid.NewGuid(), ticket.TenantId, Guid.Empty,
            $"🔔 Ticket {ticket.TicketNumber} {statusAction}",
            ticket.Title,
            "Ticket",
            false,
            $"/dashboard/tickets/{ticket.Id}",
            DateTime.UtcNow
        );
        await _hub.Clients.Group(ticket.TenantId.ToString()).NotificationReceived(notifDto);

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<TicketDto>(true, $"Ticket status updated to {request.Status}", dto));
    }

    /// <summary>Phân công ticket cho user</summary>
    [HttpPut("{id:guid}/assign")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<TicketDto>>> AssignTicket(Guid id, [FromBody] AssignTicketRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User")
            return Forbid();

        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new ApiResponse<TicketDto>(false, "Ticket không tìm thấy.", null));

        if (role != "SuperAdmin" && ticket.TenantId != tenantId)
            return Forbid();

        ticket.AssignedTo = request.AssignedTo;
        ticket.AssignedBy = request.AssignedBy;
        ticket.UpdatedAt = DateTime.UtcNow;

        // Add comment
        if (!string.IsNullOrEmpty(request.Comment))
        {
            _db.TicketComments.Add(new TicketComment
            {
                TicketId = ticket.Id,
                UserId = request.AssignedBy,
                Content = $"Ticket đã được phân công cho user. {request.Comment}",
                IsInternal = false
            });
        }

        await _db.SaveChangesAsync();

        // Load relationships
        await _db.Entry(ticket).Reference(t => t.AssignedToUser).LoadAsync();
        await _db.Entry(ticket).Reference(t => t.CreatedByUser).LoadAsync();
        await _db.Entry(ticket).Collection(t => t.Comments).LoadAsync();

        var dto = MapTicketDto(ticket);
        await _hub.Clients.Group(ticket.TenantId.ToString()).TicketUpdated(dto);

        // === NOTIFICATION EMAIL ===
        // Lấy thông tin người được assign và người gán
        var assignedUser = await _db.Users.FindAsync(request.AssignedTo);
        var assigner = await _db.Users.FindAsync(request.AssignedBy);

            // Gửi email cho người được assign
            if (assignedUser != null)
            {
            _db.Notifications.Add(new Notification
            {
                TenantId = ticket.TenantId,
                UserId = assignedUser.Id,
                Title = $"📋 Bạn được phân công ticket: {ticket.TicketNumber}",
                Message = ticket.Title,
                Type = "Ticket",
                Link = $"/dashboard/tickets/{ticket.Id}"
            });

                if (assignedUser.EmailAlertsEnabled)
                {
                    await _emailService.SendTicketNotificationAsync(
                        ticket.TenantId, assignedUser.Email, ticket,
                        $"đã phân công cho bạn (bởi {assigner?.FullName ?? "System"})"
                    );
                }
            }

        // Gửi cho tất cả Admin khác (không phải người được assign)
        var admins = await _db.Users
            .Where(u => u.TenantId == ticket.TenantId &&
                   (u.Role == "Admin" || u.Role == "SuperAdmin") &&
                   u.Id != request.AssignedTo)
            .ToListAsync();

        foreach (var admin in admins)
        {
            _db.Notifications.Add(new Notification
            {
                TenantId = ticket.TenantId,
                UserId = admin.Id,
                Title = $"📋 Ticket {ticket.TicketNumber} được phân công cho {assignedUser?.FullName ?? "Unknown"}",
                Message = ticket.Title,
                Type = "Ticket",
                Link = $"/dashboard/tickets/{ticket.Id}"
            });
        }

        // SignalR real-time notification push
        var notifDto = new NotificationDto(
            Guid.NewGuid(), ticket.TenantId, request.AssignedTo ?? Guid.Empty,
            $"📋 Bạn được phân công ticket: {ticket.TicketNumber}",
            ticket.Title,
            "Ticket",
            false,
            $"/dashboard/tickets/{ticket.Id}",
            DateTime.UtcNow
        );
        await _hub.Clients.Group(ticket.TenantId.ToString()).NotificationReceived(notifDto);

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<TicketDto>(true, "Ticket đã được phân công!", dto));
    }

    /// <summary>Thêm comment vào ticket</summary>
    [HttpPost("{id:guid}/comments")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<TicketCommentDto>>> AddComment(Guid id, [FromBody] AddTicketCommentRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new ApiResponse<TicketCommentDto>(false, "Ticket không tìm thấy.", null));

        if (role != "SuperAdmin" && ticket.TenantId != tenantId)
            return Forbid();

        var comment = new TicketComment
        {
            TicketId = id,
            UserId = request.UserId,
            Content = request.Content,
            IsInternal = request.IsInternal && role != "User"
        };

        _db.TicketComments.Add(comment);
        await _db.SaveChangesAsync();

        var user = await _db.Users.FindAsync(request.UserId);

        // === NOTIFICATION EMAIL ===
        // Load ticket relationships for notification
        var ticketForNotif = await _db.Tickets
            .Include(t => t.AssignedToUser)
            .Include(t => t.CreatedByUser)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (ticketForNotif != null && user != null)
        {
            // Gửi cho người được assign và người tạo (nếu khác người comment)
            var recipients = new HashSet<Guid>();
            if (ticketForNotif.AssignedTo.HasValue) recipients.Add(ticketForNotif.AssignedTo.Value);
            if (ticketForNotif.CreatedBy.HasValue) recipients.Add(ticketForNotif.CreatedBy.Value);

            foreach (var recipientId in recipients)
            {
                if (recipientId == request.UserId) continue; // Không gửi cho chính mình

                var recipient = await _db.Users.FindAsync(recipientId);
                if (recipient != null)
                {
                    _db.Notifications.Add(new Notification
                    {
                        TenantId = ticketForNotif.TenantId,
                        UserId = recipient.Id,
                        Title = $"💬 Comment mới trên {ticketForNotif.TicketNumber}",
                        Message = $"{user.FullName}: {request.Content[..Math.Min(request.Content.Length, 100)]}...",
                        Type = "Ticket",
                        Link = $"/dashboard/tickets/{ticketForNotif.Id}"
                    });

                    if (recipient.EmailAlertsEnabled)
                    {
                        await _emailService.SendTicketCommentEmailAsync(
                            ticketForNotif.TenantId, recipient.Email, ticketForNotif,
                            user.FullName ?? "System", request.Content
                        );
                    }
                }
            }

            // SignalR push
            var notifDto = new NotificationDto(
                Guid.NewGuid(), ticketForNotif.TenantId, request.UserId,
                $"💬 Comment mới trên {ticketForNotif.TicketNumber}",
                $"{user.FullName}: {request.Content[..Math.Min(request.Content.Length, 100)]}...",
                "Ticket",
                false,
                $"/dashboard/tickets/{ticketForNotif.Id}",
                DateTime.UtcNow
            );
            await _hub.Clients.Group(ticketForNotif.TenantId.ToString()).NotificationReceived(notifDto);
        }

        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<TicketCommentDto>(true, "Comment added!", new TicketCommentDto(
            comment.Id,
            comment.TicketId,
            comment.UserId,
            user?.FullName ?? "Unknown",
            comment.Content,
            comment.IsInternal,
            comment.CreatedAt
        )));
    }

    /// <summary>Xóa ticket</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteTicket(Guid id)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new ApiResponse<object>(false, "Ticket không tìm thấy.", null));

        if (role != "SuperAdmin" && ticket.TenantId != tenantId)
            return Forbid();

        // Delete related comments first
        var comments = await _db.TicketComments.Where(c => c.TicketId == id).ToListAsync();
        _db.TicketComments.RemoveRange(comments);

        _db.Tickets.Remove(ticket);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, "Ticket deleted successfully", null));
    }

    // --- Helpers ---
    private static TicketDto MapTicketDto(Ticket t) => new(
        t.Id,
        t.TenantId,
        t.AlertId,
        t.TicketNumber,
        t.Title,
        t.Description,
        t.Priority,
        t.Status,
        t.Category,
        t.AssignedToUser?.FullName,
        t.CreatedByUser?.FullName,
        t.CreatedAt,
        t.UpdatedAt,
        t.DueDate,
        t.ResolvedAt,
        t.ClosedAt,
        t.Comments?.Select(c => new TicketCommentDto(
            c.Id, c.TicketId, c.UserId, c.User?.FullName ?? "Unknown",
            c.Content, c.IsInternal, c.CreatedAt
        )).ToList()
    );

    private static int GetPriorityDays(string priority) => priority switch
    {
        "Critical" => 1,
        "High" => 2,
        "Medium" => 5,
        _ => 7
    };

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
}
