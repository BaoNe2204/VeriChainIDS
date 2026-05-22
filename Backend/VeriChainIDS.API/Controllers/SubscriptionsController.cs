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
public class SubscriptionsController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<SubscriptionsController> _logger;

    public SubscriptionsController(
        VeriChainIDSDbContext db,
        ILogger<SubscriptionsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>Lấy thông tin subscription hiện tại</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<SubscriptionDto>>> GetSubscription()
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "SuperAdmin")
        {
            return Ok(new ApiResponse<SubscriptionDto>(true, "OK", new SubscriptionDto(
                Guid.Empty, Guid.Empty, "Unlimited", 0, 999, 0, "Active",
                DateTime.UtcNow, DateTime.UtcNow.AddYears(100), 99999
            )));
        }

        if (!tenantId.HasValue) return Forbid();

        var subscription = await _db.Subscriptions
            .Where(s => s.TenantId == tenantId)
            .OrderByDescending(s => s.EndDate)
            .FirstOrDefaultAsync();

        if (subscription == null)
            return NotFound(new ApiResponse<SubscriptionDto>(false, "No subscription found.", null));

        var usedServers = await _db.Servers.CountAsync(s => s.TenantId == tenantId);

        return Ok(new ApiResponse<SubscriptionDto>(true, "OK", new SubscriptionDto(
            subscription.Id,
            subscription.TenantId,
            subscription.PlanName,
            subscription.PlanPrice,
            subscription.MaxServers,
            usedServers,
            subscription.Status,
            subscription.StartDate,
            subscription.EndDate,
            Math.Max(0, (subscription.EndDate - DateTime.UtcNow).Days)
        )));
    }

    /// <summary>SuperAdmin: subscription mới nhất của một tenant (đổi gói / hiển thị gói hiện tại)</summary>
    [HttpGet("for-tenant/{tenantId:guid}")]
    [Authorize(Roles = "SuperAdmin")]
    public async Task<ActionResult<ApiResponse<SubscriptionDto>>> GetSubscriptionForTenant(Guid tenantId)
    {
        var subscription = await _db.Subscriptions
            .AsNoTracking()
            .Where(s => s.TenantId == tenantId)
            .OrderByDescending(s => s.EndDate)
            .FirstOrDefaultAsync();

        if (subscription == null)
            return NotFound(new ApiResponse<SubscriptionDto>(false, "Tenant chưa có subscription.", null));

        var usedServers = await _db.Servers.CountAsync(s => s.TenantId == tenantId);

        return Ok(new ApiResponse<SubscriptionDto>(true, "OK", new SubscriptionDto(
            subscription.Id,
            subscription.TenantId,
            subscription.PlanName,
            subscription.PlanPrice,
            subscription.MaxServers,
            usedServers,
            subscription.Status,
            subscription.StartDate,
            subscription.EndDate,
            Math.Max(0, (subscription.EndDate - DateTime.UtcNow).Days)
        )));
    }

    /// <summary>Lấy lịch sử subscription</summary>
    [HttpGet("history")]
    public async Task<ActionResult<ApiResponse<List<SubscriptionDto>>>> GetSubscriptionHistory()
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User") return Forbid();

        IQueryable<Subscription> query = _db.Subscriptions.AsNoTracking();

        if (role == "Admin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(s => s.TenantId == tenantId);
        }

        var subscriptions = await query
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new SubscriptionDto(
                s.Id, s.TenantId, s.PlanName, s.PlanPrice, s.MaxServers, 0,
                s.Status, s.StartDate, s.EndDate,
                Math.Max(0, (s.EndDate - DateTime.UtcNow).Days)))
            .ToListAsync();

        return Ok(new ApiResponse<List<SubscriptionDto>>(true, "OK", subscriptions));
    }

    /// <summary>Tạo subscription mới (trial)</summary>
    [HttpPost("trial")]
    public async Task<ActionResult<ApiResponse<SubscriptionDto>>> CreateTrialSubscription()
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (!tenantId.HasValue) return Forbid();
        if (role == "User") return Forbid();

        // Check if already has active subscription
        var existing = await _db.Subscriptions
            .Where(s => s.TenantId == tenantId && s.Status == "Trial")
            .AnyAsync();

        if (existing)
            return BadRequest(new ApiResponse<SubscriptionDto>(false, "Bạn đã có subscription trial trước đó.", null));

        var subscription = new Subscription
        {
            TenantId = tenantId.Value,
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
            TenantId = tenantId.Value,
            UserId = GetUserId(),
            Action = "TRIAL_SUBSCRIPTION_CREATED",
            EntityType = "Subscription",
            EntityId = subscription.Id.ToString(),
            Details = "Trial subscription created"
        });
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<SubscriptionDto>(true, "Trial subscription đã được tạo!", new SubscriptionDto(
            subscription.Id, subscription.TenantId, subscription.PlanName, subscription.PlanPrice,
            subscription.MaxServers, 0, subscription.Status, subscription.StartDate,
            subscription.EndDate, 14
        )));
    }

    /// <summary>Tạo thanh toán (demo)</summary>
    [HttpPost("create-payment")]
    public async Task<ActionResult<ApiResponse<PaymentResponse>>> CreatePayment([FromBody] CreatePaymentRequest request)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        if (role == "User") return Forbid();

        Guid effectiveTenantId;
        if (role == "SuperAdmin")
            effectiveTenantId = request.TenantId != Guid.Empty ? request.TenantId : Guid.Empty; // Allow SuperAdmin to buy for themselves
        else
        {
            if (!tenantId.HasValue) return Forbid();
            effectiveTenantId = tenantId.Value;
        }

        var orderId = $"ORD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..6].ToUpper()}";
        var paymentUrl = $"/payment-result?orderId={orderId}&status=demo";

        var order = new PaymentOrder
        {
            TenantId = effectiveTenantId,
            OrderId = orderId,
            Amount = request.Amount,
            PlanName = request.PlanName,
            Status = "Pending",
            VnpTxnRef = orderId
        };

        _db.PaymentOrders.Add(order);
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<PaymentResponse>(true, "Tạo thanh toán thành công!", new PaymentResponse(orderId, paymentUrl)));
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
}