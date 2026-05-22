using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/contact")]
public class ContactController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<ContactController> _logger;

    public ContactController(VeriChainIDSDbContext db, ILogger<ContactController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // ── POST /api/contact  — Gửi tin nhắn (public, không cần đăng nhập) ──────
    [HttpPost]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<object>>> Send([FromBody] SendContactRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Message))
            return BadRequest(new ApiResponse<object>(false, "Vui lòng điền đầy đủ thông tin.", null));

        var msg = new ContactMessage
        {
            Name    = req.Name.Trim(),
            Email   = req.Email.Trim().ToLower(),
            Subject = req.Subject?.Trim(),
            Message = req.Message.Trim(),
            Status  = "unread",
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
        };

        _db.ContactMessages.Add(msg);
        await _db.SaveChangesAsync();

        _logger.LogInformation("New contact message from {Email}", msg.Email);
        return Ok(new ApiResponse<object>(true, "Tin nhắn đã được gửi thành công!", new { id = msg.Id }));
    }

    // ── GET /api/contact  — Lấy danh sách (SuperAdmin only) ─────────────────
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<ApiResponse<PagedResult<ContactMessageDto>>>> GetAll(
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        if (!IsSuperAdmin()) return Forbid();

        var query = _db.ContactMessages
            .Include(c => c.RepliedByUser)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status))
            query = query.Where(c => c.Status == status);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new ContactMessageDto(
                c.Id, c.Name, c.Email, c.Subject, c.Message,
                c.Status, c.Reply, c.RepliedByUser != null ? c.RepliedByUser.FullName : null,
                c.RepliedAt, c.IpAddress, c.CreatedAt))
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<ContactMessageDto>>(true, "OK",
            new PagedResult<ContactMessageDto>(items, total, page, pageSize, (int)Math.Ceiling((double)total / pageSize))));
    }

    // ── GET /api/contact/stats  — Thống kê nhanh ─────────────────────────────
    [HttpGet("stats")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> GetStats()
    {
        if (!IsSuperAdmin()) return Forbid();

        var stats = await _db.ContactMessages
            .GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        return Ok(new ApiResponse<object>(true, "OK", new
        {
            total   = stats.Sum(s => s.Count),
            unread  = stats.FirstOrDefault(s => s.Status == "unread")?.Count ?? 0,
            read    = stats.FirstOrDefault(s => s.Status == "read")?.Count ?? 0,
            replied = stats.FirstOrDefault(s => s.Status == "replied")?.Count ?? 0,
        }));
    }

    // ── PUT /api/contact/{id}/read  — Đánh dấu đã đọc ────────────────────────
    [HttpPut("{id:guid}/read")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> MarkRead(Guid id)
    {
        if (!IsSuperAdmin()) return Forbid();

        var msg = await _db.ContactMessages.FindAsync(id);
        if (msg == null) return NotFound(new ApiResponse<object>(false, "Không tìm thấy tin nhắn.", null));

        if (msg.Status == "unread")
        {
            msg.Status = "read";
            await _db.SaveChangesAsync();
        }
        return Ok(new ApiResponse<object>(true, "OK", null));
    }

    // ── POST /api/contact/{id}/reply  — Phản hồi ─────────────────────────────
    [HttpPost("{id:guid}/reply")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> Reply(Guid id, [FromBody] ReplyContactRequest req)
    {
        if (!IsSuperAdmin()) return Forbid();
        if (string.IsNullOrWhiteSpace(req.Reply))
            return BadRequest(new ApiResponse<object>(false, "Nội dung phản hồi không được trống.", null));

        var msg = await _db.ContactMessages.FindAsync(id);
        if (msg == null) return NotFound(new ApiResponse<object>(false, "Không tìm thấy tin nhắn.", null));

        var userId = GetUserId();
        msg.Reply      = req.Reply.Trim();
        msg.Status     = "replied";
        msg.RepliedBy  = userId == Guid.Empty ? null : userId;
        msg.RepliedAt  = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        _logger.LogInformation("Contact message {Id} replied by {UserId}", id, userId);

        return Ok(new ApiResponse<object>(true, "Phản hồi đã được gửi!", null));
    }

    // ── DELETE /api/contact/{id}  — Xóa tin nhắn ─────────────────────────────
    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        if (!IsSuperAdmin()) return Forbid();

        var msg = await _db.ContactMessages.FindAsync(id);
        if (msg == null) return NotFound(new ApiResponse<object>(false, "Không tìm thấy tin nhắn.", null));

        _db.ContactMessages.Remove(msg);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, "Đã xóa tin nhắn.", null));
    }

    // ── GET /api/contact/check  — Khách tra cứu phản hồi theo email ──────────
    [HttpGet("check")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<List<ContactMessageDto>>>> CheckByEmail([FromQuery] string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new ApiResponse<List<ContactMessageDto>>(false, "Vui lòng nhập email.", null));

        var msgs = await _db.ContactMessages
            .Where(c => c.Email == email.Trim().ToLower())
            .OrderByDescending(c => c.CreatedAt)
            .Take(10)
            .Select(c => new ContactMessageDto(
                c.Id, c.Name, c.Email, c.Subject, c.Message,
                c.Status, c.Reply, null, c.RepliedAt, null, c.CreatedAt))
            .ToListAsync();

        return Ok(new ApiResponse<List<ContactMessageDto>>(true, "OK", msgs));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private bool IsSuperAdmin() =>
        User.FindFirstValue(ClaimTypes.Role)?.ToLower() == "superadmin";

    private Guid GetUserId()
    {
        var val = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return val != null ? Guid.Parse(val) : Guid.Empty;
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────
public record SendContactRequest(
    string Name,
    string Email,
    string? Subject,
    string Message
);

public record ReplyContactRequest(string Reply);

public record ContactMessageDto(
    Guid Id,
    string Name,
    string Email,
    string? Subject,
    string Message,
    string Status,
    string? Reply,
    string? RepliedByName,
    DateTime? RepliedAt,
    string? IpAddress,
    DateTime CreatedAt
);
