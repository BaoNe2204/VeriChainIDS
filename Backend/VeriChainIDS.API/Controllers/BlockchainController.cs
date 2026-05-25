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
[Route("api/blockchain")]
[Authorize]
public class BlockchainController : ControllerBase
{
    private readonly VeriChainIDSDbContext _db;
    private readonly IBlockchainService _blockchainService;
    private readonly ILogger<BlockchainController> _logger;

    public BlockchainController(
        VeriChainIDSDbContext db,
        IBlockchainService blockchainService,
        ILogger<BlockchainController> logger)
    {
        _db = db;
        _blockchainService = blockchainService;
        _logger = logger;
    }

    [HttpGet("records")]
    public async Task<ActionResult<ApiResponse<PagedResult<BlockchainRecordDto>>>> GetRecords(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? recordType = null,
        [FromQuery] string? status = null)
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<BlockchainRecord> query = _db.BlockchainRecords.AsNoTracking();
        if (role != "SuperAdmin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(r => r.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(recordType))
            query = query.Where(r => r.RecordType == recordType);
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(r => r.Status == status);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new ApiResponse<PagedResult<BlockchainRecordDto>>(true, "OK", new PagedResult<BlockchainRecordDto>(
            items.Select(MapRecordDto).ToList(),
            total,
            page,
            pageSize,
            (int)Math.Ceiling(total / (double)pageSize)
        )));
    }

    [HttpGet("stats")]
    public async Task<ActionResult<ApiResponse<BlockchainStatsDto>>> GetStats()
    {
        var tenantId = GetTenantId();
        var role = GetUserRole();

        IQueryable<BlockchainRecord> query = _db.BlockchainRecords.AsNoTracking();
        if (role != "SuperAdmin")
        {
            if (!tenantId.HasValue) return Forbid();
            query = query.Where(r => r.TenantId == tenantId.Value);
        }

        var records = await query
            .GroupBy(r => 1)
            .Select(g => new BlockchainStatsDto(
                g.Count(),
                g.Count(r => r.Status == "Pending"),
                g.Count(r => r.Status == "Confirmed"),
                g.Count(r => r.Status == "Failed"),
                g.Count(r => r.RecordType == "Alert"),
                g.Count(r => r.RecordType == "BlockIP"),
                g.Count(r => r.RecordType == "AuditLog")
            ))
            .FirstOrDefaultAsync();

        return Ok(new ApiResponse<BlockchainStatsDto>(true, "OK", records ?? new BlockchainStatsDto(0, 0, 0, 0, 0, 0, 0)));
    }

    [HttpGet("health")]
    public async Task<ActionResult<ApiResponse<BlockchainHealthDto>>> GetHealth()
    {
        var health = await _blockchainService.GetHealthAsync(HttpContext.RequestAborted);
        return Ok(new ApiResponse<BlockchainHealthDto>(true, "OK", health));
    }

    [HttpGet("alert/{alertId:guid}/proof")]
    public async Task<ActionResult<ApiResponse<BlockchainRecordDto>>> GetAlertProof(Guid alertId)
    {
        var alert = await _db.Alerts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == alertId);
        if (alert == null)
            return NotFound(new ApiResponse<BlockchainRecordDto>(false, "Alert not found.", null));

        if (!CanAccessTenant(alert.TenantId))
            return Forbid();

        var record = await _db.BlockchainRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TenantId == alert.TenantId && r.RecordType == "Alert" && r.EntityId == alertId.ToString());

        if (record == null)
            return NotFound(new ApiResponse<BlockchainRecordDto>(false, "Blockchain proof not found for this alert.", null));

        return Ok(new ApiResponse<BlockchainRecordDto>(true, "OK", MapRecordDto(record)));
    }

    [HttpPost("alerts/{alertId:guid}/anchor")]
    public async Task<ActionResult<ApiResponse<BlockchainRecordDto>>> AnchorAlert(Guid alertId)
    {
        var alert = await _db.Alerts.FirstOrDefaultAsync(a => a.Id == alertId);
        if (alert == null)
            return NotFound(new ApiResponse<BlockchainRecordDto>(false, "Alert not found.", null));

        if (!CanAccessTenant(alert.TenantId))
            return Forbid();

        try
        {
            var record = await _blockchainService.RecordAlertAsync(alert, HttpContext.RequestAborted);
            return Ok(new ApiResponse<BlockchainRecordDto>(true, "Alert evidence anchored.", MapRecordDto(record)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Manual blockchain anchoring failed for alert {AlertId}", alertId);
            return StatusCode(500, new ApiResponse<BlockchainRecordDto>(false, "Blockchain anchoring failed.", null));
        }
    }

    [HttpPost("verify")]
    public async Task<ActionResult<ApiResponse<BlockchainVerifyResponse>>> Verify([FromBody] BlockchainVerifyRequest request)
    {
        return await VerifyCore(request.TxHash, request.ExpectedHash);
    }

    [HttpGet("verify/{txHash}")]
    public async Task<ActionResult<ApiResponse<BlockchainVerifyResponse>>> VerifyByTxHash(
        string txHash,
        [FromQuery] string expectedHash)
    {
        if (string.IsNullOrWhiteSpace(expectedHash))
            return BadRequest(new ApiResponse<BlockchainVerifyResponse>(false, "expectedHash is required.", null));

        return await VerifyCore(txHash, expectedHash);
    }

    [HttpPost("verify-public")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<BlockchainVerifyResponse>>> VerifyPublic([FromBody] BlockchainVerifyRequest request)
    {
        return await VerifyCore(request.TxHash, request.ExpectedHash, enforceTenant: false);
    }

    [HttpPost("records/{recordId:guid}/retry")]
    public async Task<ActionResult<ApiResponse<BlockchainRecordDto>>> RetryRecord(Guid recordId)
    {
        var record = await _db.BlockchainRecords.AsNoTracking().FirstOrDefaultAsync(r => r.Id == recordId);
        if (record == null)
            return NotFound(new ApiResponse<BlockchainRecordDto>(false, "Blockchain record not found.", null));
        if (!CanAccessTenant(record.TenantId))
            return Forbid();

        var retried = await _blockchainService.RetryRecordAsync(recordId, HttpContext.RequestAborted);
        return Ok(new ApiResponse<BlockchainRecordDto>(true, "Blockchain retry submitted.", MapRecordDto(retried)));
    }

    [HttpPost("records/{recordId:guid}/confirm")]
    public async Task<ActionResult<ApiResponse<BlockchainRecordDto>>> ConfirmRecord(Guid recordId)
    {
        var record = await _db.BlockchainRecords.FirstOrDefaultAsync(r => r.Id == recordId);
        if (record == null)
            return NotFound(new ApiResponse<BlockchainRecordDto>(false, "Blockchain record not found.", null));
        if (!CanAccessTenant(record.TenantId))
            return Forbid();
        if (string.IsNullOrWhiteSpace(record.TxHash))
            return BadRequest(new ApiResponse<BlockchainRecordDto>(false, "Record has no TxHash yet.", MapRecordDto(record)));

        var status = await _blockchainService.GetTransactionStatusAsync(record.TxHash, HttpContext.RequestAborted);
        record.LastCheckedAt = DateTime.UtcNow;
        if (status.Exists)
        {
            record.Status = "Confirmed";
            record.BlockHeight = status.BlockHeight;
            record.ConfirmedAt = status.BlockTime ?? DateTime.UtcNow;
            record.ErrorMessage = null;
        }
        else if (!string.IsNullOrWhiteSpace(status.ErrorMessage))
        {
            record.ErrorMessage = status.ErrorMessage;
        }

        await _db.SaveChangesAsync(HttpContext.RequestAborted);
        return Ok(new ApiResponse<BlockchainRecordDto>(true, status.Exists ? "Transaction confirmed." : "Transaction is not confirmed yet.", MapRecordDto(record)));
    }

    [HttpGet("records/{recordId:guid}/proof-report")]
    public async Task<ActionResult<ApiResponse<BlockchainProofReportDto>>> GetProofReport(Guid recordId)
    {
        var record = await _db.BlockchainRecords.AsNoTracking().FirstOrDefaultAsync(r => r.Id == recordId);
        if (record == null)
            return NotFound(new ApiResponse<BlockchainProofReportDto>(false, "Blockchain record not found.", null));
        if (!CanAccessTenant(record.TenantId))
            return Forbid();

        var report = await _blockchainService.BuildProofReportAsync(recordId, HttpContext.RequestAborted);
        return Ok(new ApiResponse<BlockchainProofReportDto>(true, "OK", report));
    }

    [HttpGet("records/{recordId:guid}/integrity")]
    public async Task<ActionResult<ApiResponse<BlockchainIntegrityReportDto>>> GetIntegrityReport(Guid recordId)
    {
        var record = await _db.BlockchainRecords.AsNoTracking().FirstOrDefaultAsync(r => r.Id == recordId);
        if (record == null)
            return NotFound(new ApiResponse<BlockchainIntegrityReportDto>(false, "Blockchain record not found.", null));
        if (!CanAccessTenant(record.TenantId))
            return Forbid();

        var report = await _blockchainService.BuildIntegrityReportAsync(recordId, HttpContext.RequestAborted);
        return Ok(new ApiResponse<BlockchainIntegrityReportDto>(true, "OK", report));
    }

    [HttpGet("custody/tickets/{ticketId:guid}")]
    public async Task<ActionResult<ApiResponse<IncidentCustodyReportDto>>> GetTicketCustody(Guid ticketId)
    {
        var ticket = await _db.Tickets.AsNoTracking().FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null)
            return NotFound(new ApiResponse<IncidentCustodyReportDto>(false, "Ticket not found.", null));
        if (!CanAccessTenant(ticket.TenantId))
            return Forbid();

        var report = await _blockchainService.BuildIncidentCustodyChainAsync(ticketId, HttpContext.RequestAborted);
        return Ok(new ApiResponse<IncidentCustodyReportDto>(true, "OK", report));
    }

    [HttpPost("custody/tickets/{ticketId:guid}/anchor")]
    public async Task<ActionResult<ApiResponse<BlockchainRecordDto>>> AnchorTicketCustody(Guid ticketId)
    {
        var ticket = await _db.Tickets.AsNoTracking().FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null)
            return NotFound(new ApiResponse<BlockchainRecordDto>(false, "Ticket not found.", null));
        if (!CanAccessTenant(ticket.TenantId))
            return Forbid();

        try
        {
            var record = await _blockchainService.RecordIncidentCustodyChainAsync(ticketId, HttpContext.RequestAborted);
            return Ok(new ApiResponse<BlockchainRecordDto>(true, "Incident custody chain anchored.", MapRecordDto(record)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Incident custody anchoring failed for ticket {TicketId}", ticketId);
            return StatusCode(500, new ApiResponse<BlockchainRecordDto>(false, "Incident custody anchoring failed.", null));
        }
    }

    [HttpGet("ip-reputation/{ipAddress}")]
    public async Task<ActionResult<ApiResponse<IpReputationResult>>> GetIpReputation(string ipAddress)
    {
        var result = await _blockchainService.QueryIpReputationAsync(ipAddress, HttpContext.RequestAborted);
        return Ok(new ApiResponse<IpReputationResult>(true, "OK", result));
    }

    [HttpPost("report-ip")]
    public async Task<ActionResult<ApiResponse<object>>> ReportIp([FromBody] ReportMaliciousIpRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            tenantId = await _db.Tenants
                .AsNoTracking()
                .Select(t => t.Id)
                .FirstOrDefaultAsync(HttpContext.RequestAborted);
            if (tenantId == Guid.Empty)
                return BadRequest(new ApiResponse<object>(false, "TenantId is required to report threat intelligence.", null));
        }

        var record = await _blockchainService.ReportMaliciousIpAsync(
            tenantId.Value,
            request.IpAddress,
            request.AttackType ?? "Unknown",
            request.Severity ?? "Medium",
            HttpContext.RequestAborted);

        return Ok(new ApiResponse<object>(true, "IP reputation report submitted.", new
        {
            ipHash = _blockchainService.ComputeIpHash(request.IpAddress),
            txHash = record.TxHash,
            explorerUrl = _blockchainService.GetExplorerUrl(record.TxHash, record.Network),
            record = MapRecordDto(record)
        }));
    }

    private async Task<ActionResult<ApiResponse<BlockchainVerifyResponse>>> VerifyCore(string txHash, string expectedHash, bool enforceTenant = true)
    {
        if (!enforceTenant)
        {
            var publicOnChainHash = await _blockchainService.GetOnChainHashAsync(txHash, HttpContext.RequestAborted);
            if (!string.IsNullOrWhiteSpace(publicOnChainHash))
            {
                var publicMatch = string.Equals(publicOnChainHash, expectedHash, StringComparison.OrdinalIgnoreCase);
                return Ok(new ApiResponse<BlockchainVerifyResponse>(true, "OK", new BlockchainVerifyResponse(
                    publicMatch,
                    txHash,
                    expectedHash,
                    publicOnChainHash,
                    "Cardano metadata",
                    publicMatch ? "Expected hash matches Cardano metadata." : "Expected hash does not match Cardano metadata.",
                    _blockchainService.GetExplorerUrl(txHash)
                )));
            }
        }

        var local = await _db.BlockchainRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TxHash == txHash);

        if (enforceTenant && local != null && !CanAccessTenant(local.TenantId))
            return Forbid();

        if (local != null)
        {
            var localMatch = string.Equals(local.DataHash, expectedHash, StringComparison.OrdinalIgnoreCase);
            if (!enforceTenant && !local.Network.Contains("demo", StringComparison.OrdinalIgnoreCase) && local.Status != "Confirmed")
            {
                return Ok(new ApiResponse<BlockchainVerifyResponse>(true, "OK", new BlockchainVerifyResponse(
                    false,
                    txHash,
                    expectedHash,
                    local.DataHash,
                    $"Local evidence record ({local.Status})",
                    local.Status == "Failed"
                        ? $"Blockchain transaction failed: {local.ErrorMessage ?? "unknown error"}"
                        : "Blockchain transaction is still pending confirmation.",
                    _blockchainService.GetExplorerUrl(local.TxHash, local.Network)
                )));
            }

            return Ok(new ApiResponse<BlockchainVerifyResponse>(true, "OK", new BlockchainVerifyResponse(
                localMatch,
                txHash,
                expectedHash,
                local.DataHash,
                local.Network.Contains("demo", StringComparison.OrdinalIgnoreCase) ? "Local demo proof" : "Local evidence record",
                localMatch ? "Expected hash matches stored evidence hash." : "Expected hash does not match stored evidence hash.",
                _blockchainService.GetExplorerUrl(local.TxHash, local.Network)
            )));
        }

        var onChainHash = await _blockchainService.GetOnChainHashAsync(txHash, HttpContext.RequestAborted);
        var onChainMatch = string.Equals(onChainHash, expectedHash, StringComparison.OrdinalIgnoreCase);

        return Ok(new ApiResponse<BlockchainVerifyResponse>(true, "OK", new BlockchainVerifyResponse(
            onChainMatch,
            txHash,
            expectedHash,
            onChainHash,
            "Cardano metadata",
            onChainHash == null
                ? "No VeriChainIDS metadata hash was found for this transaction."
                : onChainMatch
                    ? "Expected hash matches Cardano metadata."
                    : "Expected hash does not match Cardano metadata.",
            _blockchainService.GetExplorerUrl(txHash)
        )));
    }

    private BlockchainRecordDto MapRecordDto(BlockchainRecord record) => new(
        record.Id,
        record.TenantId,
        record.RecordType,
        record.EntityId,
        record.DataHash,
        record.TxHash,
        record.BlockHeight,
        record.Status,
        record.Network,
        record.MetadataLabel,
        record.CreatedAt,
        record.ConfirmedAt,
        record.ErrorMessage,
        _blockchainService.GetExplorerUrl(record.TxHash, record.Network),
        record.RetryCount,
        record.LastRetryAt,
        record.NextRetryAt,
        record.LastSubmittedAt,
        record.LastCheckedAt
    );

    private bool CanAccessTenant(Guid tenantId)
    {
        var role = GetUserRole();
        if (role == "SuperAdmin")
            return true;

        var currentTenantId = GetTenantId();
        return currentTenantId.HasValue && currentTenantId.Value == tenantId;
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
