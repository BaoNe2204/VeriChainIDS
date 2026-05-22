using System.Security.Claims;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/pricing-plans")]
[Authorize]
public class PricingPlansController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly ILogger<PricingPlansController> _logger;

    public PricingPlansController(VeriChainIDSDbContext db, ILogger<PricingPlansController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // GET: /api/pricing-plans — public, không cần đăng nhập
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<List<PricingPlan>>>> GetAll()
    {
        var plans = await _db.PricingPlans
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.Price)
            .ToListAsync();

        // Convert features JSON to list for each plan
        var result = plans.Select(p =>
        {
            var featuresList = new List<string>();
            if (!string.IsNullOrEmpty(p.Features))
            {
                try
                {
                    featuresList = JsonSerializer.Deserialize<List<string>>(p.Features) ?? new List<string>();
                }
                catch { featuresList = new List<string>(); }
            }
            return new
            {
                id = p.Id.ToString(),
                name = p.Name,
                description = p.Description,
                price = p.Price.ToString("N0"),
                originalPrice = p.OriginalPrice?.ToString("N0"),
                billingPeriod = p.BillingPeriod,
                isActive = p.IsActive,
                isPopular = p.IsPopular,
                isEnterprise = p.IsEnterprise,
                isTrial = p.IsTrial,
                features = featuresList,
                limits = new
                {
                    servers = p.Servers,
                    users = p.Users,
                    storage = p.Storage,
                    bandwidth = p.Bandwidth,
                    apiCalls = p.ApiCalls,
                    dailyAlerts = p.DailyAlerts,
                    retention = p.Retention,
                    concurrentConnections = p.ConcurrentConnections
                },
                capabilities = new
                {
                    realTimeMonitoring = p.RealTimeMonitoring,
                    threatIntelligence = p.ThreatIntelligence,
                    autoResponse = p.AutoResponse,
                    customRules = p.CustomRules,
                    whiteLabel = p.WhiteLabel,
                    prioritySupport = p.PrioritySupport,
                    sla = p.Sla,
                    backupFrequency = p.BackupFrequency,
                    teamManagement = p.TeamManagement,
                    auditLogs = p.AuditLogs,
                    apiAccess = p.ApiAccess,
                    sso = p.Sso,
                    customIntegrations = p.CustomIntegrations,
                    dedicatedSupport = p.DedicatedSupport,
                    slaCredits = p.SlaCredits
                }
            };
        }).ToList();

        return Ok(new ApiResponse<object>(true, "Lấy danh sách gói thành công", result));
    }

    // GET: /api/pricing-plans/{id} — public
    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<object>>> GetById(Guid id)
    {
        var p = await _db.PricingPlans.FindAsync(id);
        if (p == null)
            return NotFound(new ApiResponse<object>(false, "Không tìm thấy gói", null));

        var featuresList = new List<string>();
        if (!string.IsNullOrEmpty(p.Features))
        {
            try
            {
                featuresList = JsonSerializer.Deserialize<List<string>>(p.Features) ?? new List<string>();
            }
            catch { }
        }

        var result = new
        {
            id = p.Id.ToString(),
            name = p.Name,
            description = p.Description,
            price = p.Price.ToString("N0"),
            originalPrice = p.OriginalPrice?.ToString("N0"),
            billingPeriod = p.BillingPeriod,
            isActive = p.IsActive,
            isPopular = p.IsPopular,
            isEnterprise = p.IsEnterprise,
            isTrial = p.IsTrial,
            features = featuresList,
            limits = new
            {
                servers = p.Servers,
                users = p.Users,
                storage = p.Storage,
                bandwidth = p.Bandwidth,
                apiCalls = p.ApiCalls,
                dailyAlerts = p.DailyAlerts,
                retention = p.Retention,
                concurrentConnections = p.ConcurrentConnections
            },
            capabilities = new
            {
                realTimeMonitoring = p.RealTimeMonitoring,
                threatIntelligence = p.ThreatIntelligence,
                autoResponse = p.AutoResponse,
                customRules = p.CustomRules,
                whiteLabel = p.WhiteLabel,
                prioritySupport = p.PrioritySupport,
                sla = p.Sla,
                backupFrequency = p.BackupFrequency,
                teamManagement = p.TeamManagement,
                auditLogs = p.AuditLogs,
                apiAccess = p.ApiAccess,
                sso = p.Sso,
                customIntegrations = p.CustomIntegrations,
                dedicatedSupport = p.DedicatedSupport,
                slaCredits = p.SlaCredits
            }
        };

        return Ok(new ApiResponse<object>(true, "Lấy thông tin gói thành công", result));
    }

    // POST: /api/pricing-plans
    [HttpPost]
    public async Task<ActionResult<ApiResponse<PricingPlan>>> Create([FromBody] CreatePricingPlanDto dto)
    {
        // If this is marked as popular, unset other popular plans
        if (dto.IsPopular)
        {
            var otherPopular = await _db.PricingPlans.Where(p => p.IsPopular && p.Id != Guid.Empty).ToListAsync();
            foreach (var existingPlan in otherPopular)
                existingPlan.IsPopular = false;
        }

        var planCount = await _db.PricingPlans.CountAsync();

        var newPlan = new PricingPlan
        {
            Name = dto.Name,
            Description = dto.Description,
            Price = dto.Price,
            OriginalPrice = dto.OriginalPrice,
            BillingPeriod = dto.BillingPeriod,
            IsActive = dto.IsActive,
            IsPopular = dto.IsPopular,
            IsEnterprise = dto.IsEnterprise,
            IsTrial = dto.IsTrial,
            Servers = dto.Limits.Servers,
            Users = dto.Limits.Users,
            Storage = dto.Limits.Storage,
            Bandwidth = dto.Limits.Bandwidth,
            ApiCalls = dto.Limits.ApiCalls,
            DailyAlerts = dto.Limits.DailyAlerts,
            Retention = dto.Limits.Retention,
            ConcurrentConnections = dto.Limits.ConcurrentConnections,
            RealTimeMonitoring = dto.Capabilities.RealTimeMonitoring,
            ThreatIntelligence = dto.Capabilities.ThreatIntelligence,
            AutoResponse = dto.Capabilities.AutoResponse,
            CustomRules = dto.Capabilities.CustomRules,
            WhiteLabel = dto.Capabilities.WhiteLabel,
            PrioritySupport = dto.Capabilities.PrioritySupport,
            Sla = dto.Capabilities.Sla,
            BackupFrequency = dto.Capabilities.BackupFrequency,
            TeamManagement = dto.Capabilities.TeamManagement,
            AuditLogs = dto.Capabilities.AuditLogs,
            ApiAccess = dto.Capabilities.ApiAccess,
            Sso = dto.Capabilities.Sso,
            CustomIntegrations = dto.Capabilities.CustomIntegrations,
            DedicatedSupport = dto.Capabilities.DedicatedSupport,
            SlaCredits = dto.Capabilities.SlaCredits,
            Features = JsonSerializer.Serialize(dto.Features ?? new List<string>()),
            SortOrder = planCount
        };

        _db.PricingPlans.Add(newPlan);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Created pricing plan: {PlanName}", newPlan.Name);

        return Ok(new ApiResponse<PricingPlan>(true, "Tạo gói thành công", newPlan));
    }

    // PUT: /api/pricing-plans/{id}
    [HttpPut("{id}")]
    public async Task<ActionResult<ApiResponse<PricingPlan>>> Update(Guid id, [FromBody] UpdatePricingPlanDto dto)
    {
        var plan = await _db.PricingPlans.FindAsync(id);
        if (plan == null)
            return NotFound(new ApiResponse<object>(false, "Không tìm thấy gói", null));

        // If this is marked as popular, unset other popular plans
        if (dto.IsPopular && !plan.IsPopular)
        {
            var otherPopular = await _db.PricingPlans.Where(p => p.IsPopular && p.Id != id).ToListAsync();
            foreach (var p in otherPopular)
                p.IsPopular = false;
        }

        plan.Name = dto.Name;
        plan.Description = dto.Description;
        plan.Price = dto.Price;
        plan.OriginalPrice = dto.OriginalPrice;
        plan.BillingPeriod = dto.BillingPeriod;
        plan.IsActive = dto.IsActive;
        plan.IsPopular = dto.IsPopular;
        plan.IsEnterprise = dto.IsEnterprise;
        plan.IsTrial = dto.IsTrial;
        plan.Servers = dto.Limits.Servers;
        plan.Users = dto.Limits.Users;
        plan.Storage = dto.Limits.Storage;
        plan.Bandwidth = dto.Limits.Bandwidth;
        plan.ApiCalls = dto.Limits.ApiCalls;
        plan.DailyAlerts = dto.Limits.DailyAlerts;
        plan.Retention = dto.Limits.Retention;
        plan.ConcurrentConnections = dto.Limits.ConcurrentConnections;
        plan.RealTimeMonitoring = dto.Capabilities.RealTimeMonitoring;
        plan.ThreatIntelligence = dto.Capabilities.ThreatIntelligence;
        plan.AutoResponse = dto.Capabilities.AutoResponse;
        plan.CustomRules = dto.Capabilities.CustomRules;
        plan.WhiteLabel = dto.Capabilities.WhiteLabel;
        plan.PrioritySupport = dto.Capabilities.PrioritySupport;
        plan.Sla = dto.Capabilities.Sla;
        plan.BackupFrequency = dto.Capabilities.BackupFrequency;
        plan.TeamManagement = dto.Capabilities.TeamManagement;
        plan.AuditLogs = dto.Capabilities.AuditLogs;
        plan.ApiAccess = dto.Capabilities.ApiAccess;
        plan.Sso = dto.Capabilities.Sso;
        plan.CustomIntegrations = dto.Capabilities.CustomIntegrations;
        plan.DedicatedSupport = dto.Capabilities.DedicatedSupport;
        plan.SlaCredits = dto.Capabilities.SlaCredits;
        plan.Features = JsonSerializer.Serialize(dto.Features ?? new List<string>());
        plan.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        _logger.LogInformation("Updated pricing plan: {PlanName}", plan.Name);

        return Ok(new ApiResponse<PricingPlan>(true, "Cập nhật gói thành công", plan));
    }

    // DELETE: /api/pricing-plans/{id}
    [HttpDelete("{id}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id)
    {
        var plan = await _db.PricingPlans.FindAsync(id);
        if (plan == null)
            return NotFound(new ApiResponse<object>(false, "Không tìm thấy gói", null));

        var planName = plan.Name;
        _db.PricingPlans.Remove(plan);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Deleted pricing plan: {PlanName}", planName);

        return Ok(new ApiResponse<object>(true, $"Đã xóa gói '{planName}'", null));
    }

    // POST: /api/pricing-plans/{id}/duplicate
    [HttpPost("{id}/duplicate")]
    public async Task<ActionResult<ApiResponse<PricingPlan>>> Duplicate(Guid id)
    {
        var original = await _db.PricingPlans.FindAsync(id);
        if (original == null)
            return NotFound(new ApiResponse<object>(false, "Không tìm thấy gói", null));

        var planCount = await _db.PricingPlans.CountAsync();

        var duplicate = new PricingPlan
        {
            Name = $"{original.Name} (Copy)",
            Description = original.Description,
            Price = original.Price,
            OriginalPrice = original.OriginalPrice,
            BillingPeriod = original.BillingPeriod,
            IsActive = original.IsActive,
            IsPopular = false, // Don't copy popular status
            IsEnterprise = original.IsEnterprise,
            IsTrial = original.IsTrial,
            Servers = original.Servers,
            Users = original.Users,
            Storage = original.Storage,
            Bandwidth = original.Bandwidth,
            ApiCalls = original.ApiCalls,
            DailyAlerts = original.DailyAlerts,
            Retention = original.Retention,
            ConcurrentConnections = original.ConcurrentConnections,
            RealTimeMonitoring = original.RealTimeMonitoring,
            ThreatIntelligence = original.ThreatIntelligence,
            AutoResponse = original.AutoResponse,
            CustomRules = original.CustomRules,
            WhiteLabel = original.WhiteLabel,
            PrioritySupport = original.PrioritySupport,
            Sla = original.Sla,
            BackupFrequency = original.BackupFrequency,
            TeamManagement = original.TeamManagement,
            AuditLogs = original.AuditLogs,
            ApiAccess = original.ApiAccess,
            Sso = original.Sso,
            CustomIntegrations = original.CustomIntegrations,
            DedicatedSupport = original.DedicatedSupport,
            SlaCredits = original.SlaCredits,
            Features = original.Features,
            SortOrder = planCount
        };

        _db.PricingPlans.Add(duplicate);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Duplicated pricing plan: {PlanName}", duplicate.Name);

        return Ok(new ApiResponse<PricingPlan>(true, $"Đã tạo bản sao gói '{duplicate.Name}'", duplicate));
    }

    // PUT: /api/pricing-plans/{id}/toggle-active
    [HttpPut("{id}/toggle-active")]
    public async Task<ActionResult<ApiResponse<PricingPlan>>> ToggleActive(Guid id)
    {
        var plan = await _db.PricingPlans.FindAsync(id);
        if (plan == null)
            return NotFound(new ApiResponse<object>(false, "Không tìm thấy gói", null));

        plan.IsActive = !plan.IsActive;
        plan.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<PricingPlan>(true, $"Đã {(plan.IsActive ? "kích hoạt" : "ẩn")} gói '{plan.Name}'", plan));
    }

    // PUT: /api/pricing-plans/{id}/toggle-popular
    [HttpPut("{id}/toggle-popular")]
    public async Task<ActionResult<ApiResponse<PricingPlan>>> TogglePopular(Guid id)
    {
        var plan = await _db.PricingPlans.FindAsync(id);
        if (plan == null)
            return NotFound(new ApiResponse<object>(false, "Không tìm thấy gói", null));

        // If making this popular, unset others first
        if (!plan.IsPopular)
        {
            var otherPopular = await _db.PricingPlans.Where(p => p.IsPopular && p.Id != id).ToListAsync();
            foreach (var p in otherPopular)
            {
                p.IsPopular = false;
                p.UpdatedAt = DateTime.UtcNow;
            }
        }

        plan.IsPopular = !plan.IsPopular;
        plan.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<PricingPlan>(true, $"Đã {(plan.IsPopular ? "đánh dấu nổi bật" : "bỏ nổi bật")} gói '{plan.Name}'", plan));
    }
}

public class CreatePricingPlanDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public decimal? OriginalPrice { get; set; }
    public string BillingPeriod { get; set; } = "monthly";
    public bool IsActive { get; set; } = true;
    public bool IsPopular { get; set; } = false;
    public bool IsEnterprise { get; set; } = false;
    public bool IsTrial { get; set; } = false;
    public List<string> Features { get; set; } = new();
    public LimitsDto Limits { get; set; } = new();
    public CapabilitiesDto Capabilities { get; set; } = new();
}

public class UpdatePricingPlanDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public decimal? OriginalPrice { get; set; }
    public string BillingPeriod { get; set; } = "monthly";
    public bool IsActive { get; set; } = true;
    public bool IsPopular { get; set; } = false;
    public bool IsEnterprise { get; set; } = false;
    public bool IsTrial { get; set; } = false;
    public List<string> Features { get; set; } = new();
    public LimitsDto Limits { get; set; } = new();
    public CapabilitiesDto Capabilities { get; set; } = new();
}

public class LimitsDto
{
    public int Servers { get; set; } = 1;
    public int Users { get; set; } = 1;
    public string Storage { get; set; } = "1 GB";
    public string Bandwidth { get; set; } = "100 GB";
    public int ApiCalls { get; set; } = 1000;
    public int DailyAlerts { get; set; } = 100;
    public string Retention { get; set; } = "7 days";
    public int ConcurrentConnections { get; set; } = 10;
}

public class CapabilitiesDto
{
    public bool RealTimeMonitoring { get; set; } = true;
    public bool ThreatIntelligence { get; set; } = false;
    public bool AutoResponse { get; set; } = false;
    public bool CustomRules { get; set; } = false;
    public bool WhiteLabel { get; set; } = false;
    public bool PrioritySupport { get; set; } = false;
    public string Sla { get; set; } = "99%";
    public string BackupFrequency { get; set; } = "Daily";
    public bool TeamManagement { get; set; } = false;
    public bool AuditLogs { get; set; } = true;
    public bool ApiAccess { get; set; } = true;
    public bool Sso { get; set; } = false;
    public bool CustomIntegrations { get; set; } = false;
    public bool DedicatedSupport { get; set; } = false;
    public bool SlaCredits { get; set; } = false;
}
