using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Services;

public class CardanoBlockchainService : IBlockchainService
{
    private const string MetadataLabel = "674";
    private const string EvidenceSchemaVersion = "verichainids.evidence.v1";
    private static readonly JsonSerializerOptions HashJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly VeriChainIDSDbContext _db;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CardanoBlockchainService> _logger;

    public CardanoBlockchainService(
        VeriChainIDSDbContext db,
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<CardanoBlockchainService> logger)
    {
        _db = db;
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public string ComputeHash(object data)
    {
        var canonicalJson = ComputeCanonicalJson(data);
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(canonicalJson));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private string ComputeCanonicalJson(object data)
    {
        var normalized = NormalizeValue(data);
        return JsonSerializer.Serialize(normalized, HashJsonOptions);
    }

    public string ComputeIpHash(string ipAddress) =>
        ComputeHash(new SortedDictionary<string, object?>
        {
            ["kind"] = "ip",
            ["value"] = ipAddress.Trim()
        });

    public string? GetExplorerUrl(string? txHash, string? network = null)
    {
        if (string.IsNullOrWhiteSpace(txHash))
            return null;

        var effectiveNetwork = (network ?? GetConfiguredNetwork()).ToLowerInvariant();
        if (effectiveNetwork.Contains("demo", StringComparison.OrdinalIgnoreCase))
            return null;

        var explorerBase = effectiveNetwork switch
        {
            "mainnet" => "https://cardanoscan.io/transaction",
            "preview" => "https://preview.cardanoscan.io/transaction",
            _ => "https://preprod.cardanoscan.io/transaction"
        };
        return $"{explorerBase}/{txHash}";
    }

    public Task<BlockchainRecord> RecordAlertAsync(Alert alert, CancellationToken cancellationToken = default)
    {
        var evidence = BuildAlertEvidence(alert);
        var evidenceHash = ComputeHash(evidence);
        var metadata = new SortedDictionary<string, object?>
        {
            ["schema"] = EvidenceSchemaVersion,
            ["type"] = "alert",
            ["id"] = alert.Id.ToString("N")[..32],
            ["severity"] = alert.Severity,
            ["alertType"] = Truncate(alert.AlertType, 64),
            ["hash"] = evidenceHash,
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return RecordEvidenceAsync(alert.TenantId, "Alert", alert.Id.ToString(), evidenceHash, metadata, evidence, cancellationToken);
    }

    public Task<BlockchainRecord> RecordBlockActionAsync(BlockedIP blockedIp, CancellationToken cancellationToken = default)
    {
        var evidence = BuildBlockActionEvidence(blockedIp);
        var evidenceHash = ComputeHash(evidence);
        var metadata = new SortedDictionary<string, object?>
        {
            ["schema"] = EvidenceSchemaVersion,
            ["type"] = "block_ip",
            ["id"] = blockedIp.Id.ToString("N")[..32],
            ["ipHash"] = ComputeIpHash(blockedIp.IpAddress),
            ["attackType"] = Truncate(blockedIp.AttackType, 64),
            ["severity"] = blockedIp.Severity,
            ["hash"] = evidenceHash,
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return RecordEvidenceAsync(blockedIp.TenantId ?? Guid.Empty, "BlockIP", blockedIp.Id.ToString(), evidenceHash, metadata, evidence, cancellationToken);
    }

    public Task<BlockchainRecord> RecordAuditLogAsync(AuditLog auditLog, CancellationToken cancellationToken = default)
    {
        var evidence = BuildAuditLogEvidence(auditLog);
        var evidenceHash = ComputeHash(evidence);
        var metadata = new SortedDictionary<string, object?>
        {
            ["schema"] = EvidenceSchemaVersion,
            ["type"] = "audit_log",
            ["id"] = auditLog.Id.ToString(),
            ["action"] = Truncate(auditLog.Action, 64),
            ["hash"] = evidenceHash,
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return RecordEvidenceAsync(auditLog.TenantId ?? Guid.Empty, "AuditLog", auditLog.Id.ToString(), evidenceHash, metadata, evidence, cancellationToken);
    }

    public async Task<IncidentCustodyReportDto?> BuildIncidentCustodyChainAsync(Guid ticketId, CancellationToken cancellationToken = default)
    {
        var build = await BuildIncidentCustodyEvidenceAsync(ticketId, cancellationToken);
        return build?.Report;
    }

    public async Task<BlockchainRecord> RecordIncidentCustodyChainAsync(Guid ticketId, CancellationToken cancellationToken = default)
    {
        var build = await BuildIncidentCustodyEvidenceAsync(ticketId, cancellationToken)
            ?? throw new InvalidOperationException("Ticket not found.");
        if (!string.Equals(build.Report.Status, "CLOSED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Incident custody chain can only be anchored after the ticket is CLOSED.");

        var metadata = new SortedDictionary<string, object?>
        {
            ["schema"] = EvidenceSchemaVersion,
            ["type"] = "chain_of_custody",
            ["ticketId"] = build.Report.TicketId.ToString("N")[..32],
            ["alertId"] = build.Report.AlertId?.ToString("N")[..32],
            ["finalChainHash"] = build.Report.FinalChainHash,
            ["eventCount"] = build.Report.EventCount,
            ["status"] = build.Report.Status,
            ["hash"] = build.Report.EvidenceHash,
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return await RecordEvidenceAsync(
            build.Report.TenantId,
            "CustodyChain",
            ticketId.ToString(),
            build.Report.EvidenceHash,
            metadata,
            build.Evidence,
            cancellationToken);
    }

    public async Task<string?> GetOnChainHashAsync(string txHash, CancellationToken cancellationToken = default)
    {
        var projectId = _configuration["Cardano:BlockfrostProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
            return null;

        var baseUrl = GetBlockfrostBaseUrl();

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/txs/{txHash}/metadata");
        request.Headers.Add("project_id", projectId);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return null;

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
            return null;

        foreach (var item in doc.RootElement.EnumerateArray())
        {
            if (!item.TryGetProperty("label", out var label) || label.GetString() != MetadataLabel)
                continue;

            if (!item.TryGetProperty("json_metadata", out var jsonMetadata))
                continue;

            if (jsonMetadata.ValueKind == JsonValueKind.Object && jsonMetadata.TryGetProperty("hash", out var hash))
                return hash.GetString();
        }

        return null;
    }

    public async Task<CardanoTransactionStatus> GetTransactionStatusAsync(string txHash, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(txHash))
            return new CardanoTransactionStatus(false, null, null, "TxHash is empty.");

        var network = GetConfiguredNetwork();
        if (network.Contains("demo", StringComparison.OrdinalIgnoreCase))
            return new CardanoTransactionStatus(true, null, DateTime.UtcNow, null);

        var projectId = _configuration["Cardano:BlockfrostProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
            return new CardanoTransactionStatus(false, null, null, "Cardano:BlockfrostProjectId is not configured.");

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{GetBlockfrostBaseUrl()}/txs/{txHash}");
        request.Headers.Add("project_id", projectId);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            return new CardanoTransactionStatus(false, null, null, "Transaction not found on Cardano yet.");

        if (!response.IsSuccessStatusCode)
            return new CardanoTransactionStatus(false, null, null, $"Blockfrost returned HTTP {(int)response.StatusCode}.");

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        long? blockHeight = null;
        DateTime? blockTime = null;
        if (doc.RootElement.TryGetProperty("block_height", out var heightElement) && heightElement.TryGetInt64(out var height))
            blockHeight = height;
        if (doc.RootElement.TryGetProperty("block_time", out var timeElement) && timeElement.TryGetInt64(out var unixTime))
            blockTime = DateTimeOffset.FromUnixTimeSeconds(unixTime).UtcDateTime;

        return new CardanoTransactionStatus(true, blockHeight, blockTime, null);
    }

    public async Task<bool> VerifyRecordAsync(string txHash, string expectedHash, CancellationToken cancellationToken = default)
    {
        var onChainHash = await GetOnChainHashAsync(txHash, cancellationToken);
        return string.Equals(onChainHash, expectedHash, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<BlockchainRecord> RetryRecordAsync(Guid recordId, CancellationToken cancellationToken = default)
    {
        var record = await _db.BlockchainRecords.FirstOrDefaultAsync(r => r.Id == recordId, cancellationToken)
            ?? throw new KeyNotFoundException("Blockchain record not found.");

        if (record.Status == "Confirmed")
            return record;

        var now = DateTime.UtcNow;
        record.RetryCount += 1;
        record.LastRetryAt = now;
        record.NextRetryAt = null;
        record.LastSubmittedAt = now;
        record.Status = "Pending";
        record.ErrorMessage = null;

        try
        {
            var metadata = await BuildRetryMetadataAsync(record, cancellationToken);
            var txHash = await SubmitCardanoMetadataAsync(record.RecordType, record.EntityId, metadata, cancellationToken);
            record.TxHash = txHash;

            if (string.IsNullOrWhiteSpace(txHash))
            {
                record.Status = "Failed";
                record.ErrorMessage = "Blockchain submit returned no TxHash.";
                record.NextRetryAt = now.AddMinutes(GetRetryDelayMinutes());
            }
            else if (record.Network.Contains("demo", StringComparison.OrdinalIgnoreCase))
            {
                record.Status = "Confirmed";
                record.ConfirmedAt = now;
            }
            else
            {
                record.Status = "Pending";
            }
        }
        catch (Exception ex)
        {
            record.Status = "Failed";
            record.ErrorMessage = ex.Message;
            record.NextRetryAt = now.AddMinutes(GetRetryDelayMinutes());
            _logger.LogError(ex, "Cardano retry failed for blockchain record {RecordId}", recordId);
        }

        await _db.SaveChangesAsync(cancellationToken);
        return record;
    }

    public async Task<BlockchainHealthDto> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        var checkedAt = DateTime.UtcNow;
        var mode = GetSubmissionMode();
        var network = GetConfiguredNetwork();
        var blockfrostConfigured = !string.IsNullOrWhiteSpace(_configuration["Cardano:BlockfrostProjectId"]);
        string submitterStatus = mode.Equals("External", StringComparison.OrdinalIgnoreCase) ? "Unknown" : "Not required";
        bool? submitterOnline = null;
        decimal? walletAda = null;
        long? walletLovelace = null;
        bool? walletFunded = null;
        string? cardanoAddress = null;
        string? healthError = null;

        if (mode.Equals("External", StringComparison.OrdinalIgnoreCase))
        {
            var submitEndpoint = _configuration["Cardano:SubmitEndpoint"];
            var baseUri = TryGetSubmitterBaseUri(submitEndpoint);
            if (baseUri == null)
            {
                submitterStatus = "Offline";
                submitterOnline = false;
                healthError = "Cardano:SubmitEndpoint is missing or invalid.";
            }
            else
            {
                try
                {
                    using var healthResponse = await _httpClient.GetAsync(new Uri(baseUri, "health"), cancellationToken);
                    submitterOnline = healthResponse.IsSuccessStatusCode;
                    submitterStatus = submitterOnline == true ? "Online" : $"HTTP {(int)healthResponse.StatusCode}";

                    if (submitterOnline == true)
                    {
                        using var walletResponse = await _httpClient.GetAsync(new Uri(baseUri, "wallet/status"), cancellationToken);
                        if (walletResponse.IsSuccessStatusCode)
                        {
                            await using var walletStream = await walletResponse.Content.ReadAsStreamAsync(cancellationToken);
                            using var walletDoc = await JsonDocument.ParseAsync(walletStream, cancellationToken: cancellationToken);
                            if (walletDoc.RootElement.TryGetProperty("lovelace", out var lovelace) && lovelace.TryGetInt64(out var lovelaceValue))
                                walletLovelace = lovelaceValue;
                            if (walletDoc.RootElement.TryGetProperty("ada", out var ada) && ada.TryGetDecimal(out var adaValue))
                                walletAda = adaValue;
                            if (walletDoc.RootElement.TryGetProperty("funded", out var funded))
                                walletFunded = funded.GetBoolean();
                            if (walletDoc.RootElement.TryGetProperty("address", out var address))
                                cardanoAddress = address.GetString();
                        }
                    }
                }
                catch (Exception ex)
                {
                    submitterStatus = "Offline";
                    submitterOnline = false;
                    healthError = ex.Message;
                }
            }
        }

        var lastSuccess = await _db.BlockchainRecords
            .AsNoTracking()
            .Where(r => r.TxHash != null && r.Status != "Failed")
            .OrderByDescending(r => r.LastSubmittedAt ?? r.CreatedAt)
            .Select(r => new { r.TxHash, SubmittedAt = r.LastSubmittedAt ?? r.CreatedAt })
            .FirstOrDefaultAsync(cancellationToken);

        var lastError = await _db.BlockchainRecords
            .AsNoTracking()
            .Where(r => r.Status == "Failed" && r.ErrorMessage != null)
            .OrderByDescending(r => r.LastRetryAt ?? r.CreatedAt)
            .Select(r => r.ErrorMessage)
            .FirstOrDefaultAsync(cancellationToken);

        return new BlockchainHealthDto(
            network,
            mode,
            submitterStatus,
            submitterOnline,
            walletAda,
            walletLovelace,
            walletFunded,
            blockfrostConfigured,
            cardanoAddress,
            lastSuccess?.SubmittedAt,
            lastSuccess?.TxHash,
            healthError ?? lastError,
            checkedAt
        );
    }

    public async Task<BlockchainProofReportDto?> BuildProofReportAsync(Guid recordId, CancellationToken cancellationToken = default)
    {
        var record = await _db.BlockchainRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == recordId, cancellationToken);
        if (record == null)
            return null;

        var snapshot = await _db.EvidenceSnapshots
            .AsNoTracking()
            .Where(s => s.BlockchainRecordId == record.Id || (s.TenantId == record.TenantId && s.RecordType == record.RecordType && s.EntityId == record.EntityId))
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        bool? verifyResult = null;
        string verifyMessage;
        if (string.IsNullOrWhiteSpace(record.TxHash))
        {
            verifyMessage = "No TxHash is available yet.";
        }
        else if (record.Network.Contains("demo", StringComparison.OrdinalIgnoreCase))
        {
            verifyResult = snapshot == null || string.Equals(snapshot.SnapshotHash, record.DataHash, StringComparison.OrdinalIgnoreCase);
            verifyMessage = verifyResult == true ? "Local demo proof matches the evidence hash." : "Snapshot hash does not match the stored evidence hash.";
        }
        else
        {
            var onChainHash = await GetOnChainHashAsync(record.TxHash, cancellationToken);
            var localSnapshotMatch = snapshot == null || string.Equals(snapshot.SnapshotHash, record.DataHash, StringComparison.OrdinalIgnoreCase);
            verifyResult = onChainHash == null && record.Status != "Confirmed"
                ? localSnapshotMatch
                : string.Equals(onChainHash, record.DataHash, StringComparison.OrdinalIgnoreCase);
            verifyMessage = onChainHash == null
                ? record.Status == "Confirmed"
                    ? "No VeriChainIDS metadata hash was found on Cardano."
                    : localSnapshotMatch
                        ? "Local evidence hash matches. Cardano confirmation is still pending."
                        : "Snapshot hash does not match the stored evidence hash."
                : verifyResult == true
                    ? "Cardano metadata hash matches the stored evidence hash."
                    : "Cardano metadata hash does not match the stored evidence hash.";
        }

        return new BlockchainProofReportDto(
            record.Id,
            record.RecordType,
            record.EntityId,
            record.DataHash,
            record.TxHash,
            record.Network,
            record.MetadataLabel,
            record.BlockHeight,
            record.CreatedAt,
            record.ConfirmedAt,
            record.Status,
            verifyResult,
            verifyMessage,
            GetExplorerUrl(record.TxHash, record.Network),
            record.RetryCount,
            record.ErrorMessage,
            snapshot == null
                ? null
                : new EvidenceSnapshotDto(
                    snapshot.Id,
                    snapshot.RecordType,
                    snapshot.EntityId,
                    snapshot.SchemaVersion,
                    snapshot.SnapshotHash,
                    snapshot.SnapshotJson,
                    snapshot.CreatedAt)
        );
    }

    public async Task<BlockchainIntegrityReportDto?> BuildIntegrityReportAsync(Guid recordId, CancellationToken cancellationToken = default)
    {
        var record = await _db.BlockchainRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == recordId, cancellationToken);
        if (record == null)
            return null;

        var snapshot = await _db.EvidenceSnapshots
            .AsNoTracking()
            .Where(s => s.BlockchainRecordId == record.Id || (s.TenantId == record.TenantId && s.RecordType == record.RecordType && s.EntityId == record.EntityId))
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var currentEvidence = await BuildCurrentEvidenceSnapshotAsync(record, cancellationToken);
        var currentHash = currentEvidence == null ? null : ComputeHash(currentEvidence);
        var currentJson = currentEvidence == null ? null : ComputeCanonicalJson(currentEvidence);

        var snapshotContentHash = snapshot == null ? null : ComputeHashFromCanonicalJson(snapshot.SnapshotJson);
        var onChainHash = !string.IsNullOrWhiteSpace(record.TxHash) && !record.Network.Contains("demo", StringComparison.OrdinalIgnoreCase)
            ? await GetOnChainHashAsync(record.TxHash, cancellationToken)
            : null;

        var snapshotHashMatchesStoredHash = snapshot != null && string.Equals(snapshot.SnapshotHash, record.DataHash, StringComparison.OrdinalIgnoreCase);
        var snapshotContentMatchesStoredHash = snapshotContentHash != null && string.Equals(snapshotContentHash, record.DataHash, StringComparison.OrdinalIgnoreCase);
        var currentHashMatchesStoredHash = currentHash != null && string.Equals(currentHash, record.DataHash, StringComparison.OrdinalIgnoreCase);
        bool? storedHashMatchesOnChain = onChainHash == null ? null : string.Equals(record.DataHash, onChainHash, StringComparison.OrdinalIgnoreCase);
        bool? snapshotContentMatchesOnChain = onChainHash == null || snapshotContentHash == null ? null : string.Equals(snapshotContentHash, onChainHash, StringComparison.OrdinalIgnoreCase);
        bool? currentHashMatchesOnChain = onChainHash == null || currentHash == null ? null : string.Equals(currentHash, onChainHash, StringComparison.OrdinalIgnoreCase);

        var changes = snapshot != null && currentJson != null
            ? BuildJsonDiff(snapshot.SnapshotJson, currentJson)
            : Array.Empty<BlockchainIntegrityChangeDto>();

        var isTampered =
            snapshot == null ||
            currentEvidence == null ||
            !snapshotHashMatchesStoredHash ||
            !snapshotContentMatchesStoredHash ||
            !currentHashMatchesStoredHash ||
            storedHashMatchesOnChain == false ||
            snapshotContentMatchesOnChain == false ||
            currentHashMatchesOnChain == false ||
            changes.Count > 0;

        var verdict = BuildIntegrityVerdict(
            snapshot != null,
            currentEvidence != null,
            currentHashMatchesStoredHash,
            snapshotContentMatchesStoredHash,
            storedHashMatchesOnChain,
            changes.Count);

        return new BlockchainIntegrityReportDto(
            record.Id,
            record.RecordType,
            record.EntityId,
            record.DataHash,
            record.TxHash,
            onChainHash,
            snapshot?.SnapshotHash,
            snapshotContentHash,
            currentHash,
            snapshot != null,
            currentEvidence != null,
            snapshotHashMatchesStoredHash,
            snapshotContentMatchesStoredHash,
            currentHashMatchesStoredHash,
            storedHashMatchesOnChain,
            snapshotContentMatchesOnChain,
            currentHashMatchesOnChain,
            isTampered,
            verdict,
            changes
        );
    }

    public async Task<IpReputationResult> QueryIpReputationAsync(string ipAddress, CancellationToken cancellationToken = default)
    {
        var ipHash = ComputeIpHash(ipAddress);
        var blockReports = await _db.BlockedIPs
            .AsNoTracking()
            .Where(b => b.IpAddress == ipAddress)
            .OrderByDescending(b => b.BlockedAt)
            .ToListAsync(cancellationToken);
        var chainReports = await _db.BlockchainRecords
            .AsNoTracking()
            .Where(r => r.RecordType == "ThreatIntel" && r.EntityId.StartsWith(ipHash))
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        var severityScore = blockReports.Count == 0
            ? 0
            : blockReports.Max(r => MapSeverityScore(r.Severity));
        var reportCount = blockReports.Count + chainReports.Count;
        var lastReported = new[] { blockReports.FirstOrDefault()?.BlockedAt, chainReports.FirstOrDefault()?.CreatedAt }
            .Where(d => d.HasValue)
            .DefaultIfEmpty(null)
            .Max();

        return new IpReputationResult(
            ipAddress,
            ipHash,
            reportCount,
            severityScore,
            lastReported,
            reportCount >= 5 || severityScore >= 0.9
        );
    }

    public Task<BlockchainRecord> ReportMaliciousIpAsync(Guid tenantId, string ipAddress, string attackType, string severity, CancellationToken cancellationToken = default)
    {
        var ipHash = ComputeIpHash(ipAddress);
        var reportedAt = DateTime.UtcNow;
        var evidence = new SortedDictionary<string, object?>
        {
            ["ipHash"] = ipHash,
            ["attackType"] = Truncate(attackType, 64),
            ["severity"] = severity,
            ["reportedAt"] = reportedAt.ToString("O"),
            ["privacy"] = "raw_ip_not_stored_on_chain"
        };
        var evidenceHash = ComputeHash(evidence);
        var metadata = new SortedDictionary<string, object?>
        {
            ["schema"] = EvidenceSchemaVersion,
            ["type"] = "threat_intel",
            ["ipHash"] = ipHash,
            ["attackType"] = Truncate(attackType, 64),
            ["severity"] = severity,
            ["hash"] = evidenceHash,
            ["ts"] = reportedAt.ToString("O")
        };

        return RecordEvidenceAsync(tenantId, "ThreatIntel", $"{ipHash}:{Guid.NewGuid():N}", evidenceHash, metadata, evidence, cancellationToken);
    }

    private async Task<SortedDictionary<string, object?>?> BuildCurrentEvidenceSnapshotAsync(BlockchainRecord record, CancellationToken cancellationToken)
    {
        if (record.RecordType == "Alert")
        {
            if (!Guid.TryParse(record.EntityId, out var alertId))
                return null;

            var alert = await _db.Alerts
                .AsNoTracking()
                .FirstOrDefaultAsync(a => a.TenantId == record.TenantId && a.Id == alertId, cancellationToken);
            return alert == null ? null : BuildAlertEvidence(alert);
        }

        if (record.RecordType == "BlockIP")
        {
            if (!Guid.TryParse(record.EntityId, out var blockedIpId))
                return null;

            var blockedIp = await _db.BlockedIPs
                .AsNoTracking()
                .FirstOrDefaultAsync(b => b.Id == blockedIpId, cancellationToken);
            if (blockedIp == null || (blockedIp.TenantId ?? Guid.Empty) != record.TenantId)
                return null;

            return BuildBlockActionEvidence(blockedIp);
        }

        if (record.RecordType == "AuditLog")
        {
            if (!long.TryParse(record.EntityId, out var auditLogId))
                return null;

            var auditLog = await _db.AuditLogs
                .AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == auditLogId, cancellationToken);
            if (auditLog == null || (auditLog.TenantId ?? Guid.Empty) != record.TenantId)
                return null;

            return BuildAuditLogEvidence(auditLog);
        }

        if (record.RecordType == "CustodyChain")
        {
            if (!Guid.TryParse(record.EntityId, out var ticketId))
                return null;

            var build = await BuildIncidentCustodyEvidenceAsync(ticketId, cancellationToken);
            return build?.Evidence;
        }

        return null;
    }

    private async Task<CustodyBuildResult?> BuildIncidentCustodyEvidenceAsync(Guid ticketId, CancellationToken cancellationToken)
    {
        var ticket = await _db.Tickets
            .AsNoTracking()
            .Include(t => t.Alert)
            .Include(t => t.AssignedToUser)
            .Include(t => t.CreatedByUser)
            .Include(t => t.Comments)
                .ThenInclude(c => c.User)
            .FirstOrDefaultAsync(t => t.Id == ticketId, cancellationToken);
        if (ticket == null)
            return null;

        var alert = ticket.Alert;
        var entityIds = new HashSet<string>(StringComparer.Ordinal)
        {
            ticket.Id.ToString()
        };
        if (ticket.AlertId.HasValue)
            entityIds.Add(ticket.AlertId.Value.ToString());

        var sourceIp = alert?.SourceIp;
        var blockedIps = string.IsNullOrWhiteSpace(sourceIp)
            ? new List<BlockedIP>()
            : await _db.BlockedIPs
                .AsNoTracking()
                .Where(b => b.TenantId == ticket.TenantId && b.IpAddress == sourceIp)
                .OrderBy(b => b.BlockedAt)
                .ToListAsync(cancellationToken);
        foreach (var blockedIp in blockedIps)
            entityIds.Add(blockedIp.Id.ToString());

        var auditLogs = await _db.AuditLogs
            .AsNoTracking()
            .Include(a => a.User)
            .Where(a => a.TenantId == ticket.TenantId && a.EntityId != null && entityIds.Contains(a.EntityId))
            .OrderBy(a => a.Timestamp)
            .ToListAsync(cancellationToken);

        var sourceEvents = new List<CustodySourceEvent>();
        if (alert != null)
        {
            sourceEvents.Add(new CustodySourceEvent(
                alert.CreatedAt,
                "ALERT_CREATED",
                "AI Engine",
                "Alert",
                alert.Id.ToString(),
                $"Alert [{alert.Severity}] {alert.AlertType}: {alert.Title}"
            ));

            if (alert.AcknowledgedAt.HasValue)
                sourceEvents.Add(new CustodySourceEvent(
                    alert.AcknowledgedAt.Value,
                    "ALERT_ACKNOWLEDGED",
                    alert.AcknowledgedBy?.ToString() ?? "Analyst",
                    "Alert",
                    alert.Id.ToString(),
                    $"Alert acknowledged: {alert.Title}"
                ));

            if (alert.ResolvedAt.HasValue)
                sourceEvents.Add(new CustodySourceEvent(
                    alert.ResolvedAt.Value,
                    "ALERT_RESOLVED",
                    alert.ResolvedBy?.ToString() ?? "Analyst",
                    "Alert",
                    alert.Id.ToString(),
                    $"Alert resolved: {alert.Title}"
                ));
        }

        sourceEvents.Add(new CustodySourceEvent(
            ticket.CreatedAt,
            "TICKET_CREATED",
            ticket.CreatedByUser?.FullName ?? ticket.CreatedBy?.ToString() ?? "System",
            "Ticket",
            ticket.Id.ToString(),
            $"Ticket {ticket.TicketNumber} created: {ticket.Title}"
        ));

        if (ticket.AssignedTo.HasValue)
            sourceEvents.Add(new CustodySourceEvent(
                ticket.UpdatedAt,
                "TICKET_ASSIGNED",
                ticket.AssignedBy?.ToString() ?? "Analyst",
                "Ticket",
                ticket.Id.ToString(),
                $"Ticket assigned to {ticket.AssignedToUser?.FullName ?? ticket.AssignedTo.Value.ToString()}"
            ));

        if (ticket.ResolvedAt.HasValue)
            sourceEvents.Add(new CustodySourceEvent(
                ticket.ResolvedAt.Value,
                "TICKET_RESOLVED",
                ticket.AssignedToUser?.FullName ?? ticket.AssignedTo?.ToString() ?? "Analyst",
                "Ticket",
                ticket.Id.ToString(),
                $"Ticket {ticket.TicketNumber} resolved"
            ));

        if (ticket.ClosedAt.HasValue)
            sourceEvents.Add(new CustodySourceEvent(
                ticket.ClosedAt.Value,
                "TICKET_CLOSED",
                ticket.AssignedToUser?.FullName ?? ticket.AssignedTo?.ToString() ?? "Analyst",
                "Ticket",
                ticket.Id.ToString(),
                $"Ticket {ticket.TicketNumber} closed"
            ));

        foreach (var blockedIp in blockedIps)
        {
            sourceEvents.Add(new CustodySourceEvent(
                blockedIp.BlockedAt,
                "IP_BLOCKED",
                blockedIp.BlockedBy,
                "BlockedIP",
                blockedIp.Id.ToString(),
                $"IP hash {ComputeIpHash(blockedIp.IpAddress)[..16]}... blocked as {blockedIp.AttackType} ({blockedIp.Severity})"
            ));
        }

        foreach (var comment in ticket.Comments.OrderBy(c => c.CreatedAt))
        {
            sourceEvents.Add(new CustodySourceEvent(
                comment.CreatedAt,
                comment.IsInternal ? "INTERNAL_NOTE_ADDED" : "COMMENT_ADDED",
                comment.User?.FullName ?? comment.UserId.ToString(),
                "TicketComment",
                comment.Id.ToString(),
                Truncate(comment.Content, 160)
            ));
        }

        foreach (var audit in auditLogs)
        {
            sourceEvents.Add(new CustodySourceEvent(
                audit.Timestamp,
                audit.Action,
                audit.User?.FullName ?? audit.UserId?.ToString() ?? "System",
                audit.EntityType ?? "AuditLog",
                audit.EntityId ?? audit.Id.ToString(),
                audit.Details ?? audit.Action
            ));
        }

        var custodyEvents = new List<CustodyEventDto>();
        var previousHash = "GENESIS";
        var sequence = 1;
        foreach (var sourceEvent in sourceEvents
            .OrderBy(e => e.Timestamp)
            .ThenBy(e => e.EventType, StringComparer.Ordinal)
            .ThenBy(e => e.EntityId, StringComparer.Ordinal))
        {
            var eventCore = new SortedDictionary<string, object?>(StringComparer.Ordinal)
            {
                ["sequence"] = sequence,
                ["eventType"] = sourceEvent.EventType,
                ["actor"] = sourceEvent.Actor,
                ["entityType"] = sourceEvent.EntityType,
                ["entityId"] = sourceEvent.EntityId,
                ["timestamp"] = sourceEvent.Timestamp.ToString("O"),
                ["summary"] = sourceEvent.Summary,
                ["previousHash"] = previousHash
            };
            var stepHash = ComputeHash(eventCore);
            custodyEvents.Add(new CustodyEventDto(
                sequence,
                sourceEvent.EventType,
                sourceEvent.Actor,
                sourceEvent.EntityType,
                sourceEvent.EntityId,
                sourceEvent.Timestamp,
                sourceEvent.Summary,
                previousHash,
                stepHash
            ));
            previousHash = stepHash;
            sequence++;
        }

        var finalChainHash = previousHash;
        var evidence = new SortedDictionary<string, object?>(StringComparer.Ordinal)
        {
            ["schema"] = EvidenceSchemaVersion,
            ["type"] = "chain_of_custody",
            ["ticketId"] = ticket.Id,
            ["alertId"] = ticket.AlertId,
            ["tenantId"] = ticket.TenantId,
            ["ticketNumber"] = ticket.TicketNumber,
            ["status"] = ticket.Status,
            ["finalChainHash"] = finalChainHash,
            ["eventCount"] = custodyEvents.Count,
            ["events"] = custodyEvents
        };
        var evidenceHash = ComputeHash(evidence);

        var proof = await _db.BlockchainRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TenantId == ticket.TenantId && r.RecordType == "CustodyChain" && r.EntityId == ticket.Id.ToString(), cancellationToken);

        var report = new IncidentCustodyReportDto(
            ticket.Id,
            ticket.AlertId,
            ticket.TenantId,
            ticket.TicketNumber,
            ticket.Status,
            finalChainHash,
            evidenceHash,
            custodyEvents.Count,
            custodyEvents.FirstOrDefault()?.Timestamp ?? ticket.CreatedAt,
            ticket.ClosedAt,
            custodyEvents,
            proof == null ? null : MapBlockchainRecordDto(proof)
        );

        return new CustodyBuildResult(evidence, report);
    }

    private BlockchainRecordDto MapBlockchainRecordDto(BlockchainRecord record) => new(
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
        GetExplorerUrl(record.TxHash, record.Network),
        record.RetryCount,
        record.LastRetryAt,
        record.NextRetryAt,
        record.LastSubmittedAt,
        record.LastCheckedAt
    );

    private sealed record CustodySourceEvent(
        DateTime Timestamp,
        string EventType,
        string Actor,
        string EntityType,
        string EntityId,
        string Summary
    );

    private sealed record CustodyBuildResult(
        SortedDictionary<string, object?> Evidence,
        IncidentCustodyReportDto Report
    );

    private static SortedDictionary<string, object?> BuildAlertEvidence(Alert alert) =>
        new(StringComparer.Ordinal)
        {
            ["id"] = alert.Id,
            ["tenantId"] = alert.TenantId,
            ["serverId"] = alert.ServerId,
            ["alertType"] = alert.AlertType,
            ["severity"] = alert.Severity,
            ["sourceIp"] = alert.SourceIp,
            ["targetAsset"] = alert.TargetAsset,
            ["mitreTactic"] = alert.MitreTactic,
            ["mitreTechnique"] = alert.MitreTechnique,
            ["anomalyScore"] = alert.AnomalyScore,
            ["createdAt"] = alert.CreatedAt
        };

    private static SortedDictionary<string, object?> BuildBlockActionEvidence(BlockedIP blockedIp) =>
        new(StringComparer.Ordinal)
        {
            ["id"] = blockedIp.Id,
            ["tenantId"] = blockedIp.TenantId,
            ["serverId"] = blockedIp.ServerId,
            ["ipAddress"] = blockedIp.IpAddress,
            ["attackType"] = blockedIp.AttackType,
            ["severity"] = blockedIp.Severity,
            ["reason"] = blockedIp.Reason,
            ["blockedBy"] = blockedIp.BlockedBy,
            ["blockedAt"] = blockedIp.BlockedAt,
            ["expiresAt"] = blockedIp.ExpiresAt
        };

    private static SortedDictionary<string, object?> BuildAuditLogEvidence(AuditLog auditLog) =>
        new(StringComparer.Ordinal)
        {
            ["id"] = auditLog.Id,
            ["tenantId"] = auditLog.TenantId,
            ["userId"] = auditLog.UserId,
            ["action"] = auditLog.Action,
            ["entityType"] = auditLog.EntityType,
            ["entityId"] = auditLog.EntityId,
            ["timestamp"] = auditLog.Timestamp,
            ["details"] = auditLog.Details
        };

    private static string ComputeHashFromCanonicalJson(string canonicalJson)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(canonicalJson));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static IReadOnlyList<BlockchainIntegrityChangeDto> BuildJsonDiff(string snapshotJson, string currentJson)
    {
        try
        {
            using var snapshotDoc = JsonDocument.Parse(snapshotJson);
            using var currentDoc = JsonDocument.Parse(currentJson);
            var changes = new List<BlockchainIntegrityChangeDto>();
            CompareJsonElements(string.Empty, snapshotDoc.RootElement, currentDoc.RootElement, changes);
            return changes;
        }
        catch (JsonException)
        {
            return new[]
            {
                new BlockchainIntegrityChangeDto("$", "InvalidSnapshot", "Snapshot JSON is invalid", currentJson)
            };
        }
    }

    private static void CompareJsonElements(string path, JsonElement oldElement, JsonElement newElement, List<BlockchainIntegrityChangeDto> changes)
    {
        if (oldElement.ValueKind == JsonValueKind.Object && newElement.ValueKind == JsonValueKind.Object)
        {
            var keys = oldElement.EnumerateObject().Select(p => p.Name)
                .Union(newElement.EnumerateObject().Select(p => p.Name), StringComparer.Ordinal)
                .OrderBy(k => k, StringComparer.Ordinal);

            foreach (var key in keys)
            {
                var oldHasValue = oldElement.TryGetProperty(key, out var oldValue);
                var newHasValue = newElement.TryGetProperty(key, out var newValue);
                var childPath = string.IsNullOrEmpty(path) ? key : $"{path}.{key}";

                if (!oldHasValue)
                {
                    changes.Add(new BlockchainIntegrityChangeDto(childPath, "Added", null, FormatJsonValue(newValue)));
                    continue;
                }

                if (!newHasValue)
                {
                    changes.Add(new BlockchainIntegrityChangeDto(childPath, "Removed", FormatJsonValue(oldValue), null));
                    continue;
                }

                CompareJsonElements(childPath, oldValue, newValue, changes);
            }

            return;
        }

        if (oldElement.ValueKind == JsonValueKind.Array && newElement.ValueKind == JsonValueKind.Array)
        {
            if (!string.Equals(oldElement.GetRawText(), newElement.GetRawText(), StringComparison.Ordinal))
                changes.Add(new BlockchainIntegrityChangeDto(path, "Modified", FormatJsonValue(oldElement), FormatJsonValue(newElement)));
            return;
        }

        if (oldElement.ValueKind != newElement.ValueKind || !string.Equals(oldElement.GetRawText(), newElement.GetRawText(), StringComparison.Ordinal))
            changes.Add(new BlockchainIntegrityChangeDto(path, "Modified", FormatJsonValue(oldElement), FormatJsonValue(newElement)));
    }

    private static string? FormatJsonValue(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.Undefined => null,
            JsonValueKind.Null => "null",
            JsonValueKind.String => element.GetString(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => element.GetRawText()
        };

    private static string BuildIntegrityVerdict(
        bool snapshotAvailable,
        bool currentDataAvailable,
        bool currentHashMatchesStoredHash,
        bool snapshotContentMatchesStoredHash,
        bool? storedHashMatchesOnChain,
        int changeCount)
    {
        if (!snapshotAvailable)
            return "Original snapshot is missing. Cannot compare original and current data.";

        if (!currentDataAvailable)
            return "Current data is missing or was deleted.";

        if (storedHashMatchesOnChain == false)
            return "Stored local hash no longer matches the immutable Cardano hash. Local proof data may have been tampered with.";

        if (!snapshotContentMatchesStoredHash)
            return "Original snapshot content no longer matches the stored evidence hash. Snapshot may have been tampered with.";

        if (!currentHashMatchesStoredHash)
            return changeCount > 0
                ? "Current data was changed after the original snapshot was anchored."
                : "Current data hash changed, but no field-level diff could be produced.";

        return "Current data matches the original snapshot and anchored evidence hash.";
    }

    private async Task<BlockchainRecord> RecordEvidenceAsync(
        Guid tenantId,
        string recordType,
        string entityId,
        string dataHash,
        SortedDictionary<string, object?> metadata,
        object evidenceSnapshot,
        CancellationToken cancellationToken)
    {
        var existing = await _db.BlockchainRecords
            .FirstOrDefaultAsync(r => r.TenantId == tenantId && r.RecordType == recordType && r.EntityId == entityId, cancellationToken);

        if (existing != null)
            return existing;

        var network = GetConfiguredNetwork();
        var snapshotJson = ComputeCanonicalJson(evidenceSnapshot);
        var record = new BlockchainRecord
        {
            TenantId = tenantId,
            RecordType = recordType,
            EntityId = entityId,
            DataHash = dataHash,
            Network = network,
            MetadataLabel = MetadataLabel,
            Status = "Pending"
        };
        var snapshot = new EvidenceSnapshot
        {
            TenantId = tenantId,
            BlockchainRecordId = record.Id,
            RecordType = recordType,
            EntityId = entityId,
            SchemaVersion = EvidenceSchemaVersion,
            SnapshotHash = dataHash,
            SnapshotJson = snapshotJson
        };

        _db.BlockchainRecords.Add(record);
        _db.EvidenceSnapshots.Add(snapshot);

        try
        {
            record.LastSubmittedAt = DateTime.UtcNow;
            var txHash = await SubmitCardanoMetadataAsync(recordType, entityId, metadata, cancellationToken);
            record.TxHash = txHash;
            if (!string.IsNullOrWhiteSpace(txHash))
            {
                record.Status = network.Contains("demo", StringComparison.OrdinalIgnoreCase) ? "Confirmed" : "Pending";
                record.ConfirmedAt = record.Status == "Confirmed" ? DateTime.UtcNow : null;
            }
            else
            {
                record.Status = "Failed";
                record.ErrorMessage = "Blockchain submit returned no TxHash.";
                record.NextRetryAt = DateTime.UtcNow.AddMinutes(GetRetryDelayMinutes());
            }
        }
        catch (Exception ex)
        {
            record.Status = "Failed";
            record.ErrorMessage = ex.Message;
            record.NextRetryAt = DateTime.UtcNow.AddMinutes(GetRetryDelayMinutes());
            _logger.LogError(ex, "Cardano evidence submission failed for {RecordType} {EntityId}", recordType, entityId);
        }

        await _db.SaveChangesAsync(cancellationToken);
        return record;
    }

    private async Task<string?> SubmitCardanoMetadataAsync(
        string recordType,
        string entityId,
        SortedDictionary<string, object?> metadata,
        CancellationToken cancellationToken)
    {
        var mode = GetSubmissionMode();
        if (mode.Equals("Disabled", StringComparison.OrdinalIgnoreCase))
            return null;

        if (mode.Equals("External", StringComparison.OrdinalIgnoreCase))
        {
            var submitEndpoint = _configuration["Cardano:SubmitEndpoint"];
            if (string.IsNullOrWhiteSpace(submitEndpoint))
                throw new InvalidOperationException("Cardano:SubmitEndpoint is required when SubmissionMode=External.");

            var payload = new
            {
                recordType,
                entityId,
                label = MetadataLabel,
                metadata
            };

            var response = await _httpClient.PostAsJsonAsync(submitEndpoint, payload, cancellationToken);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<CardanoSubmissionResponse>(cancellationToken: cancellationToken);
            return result?.TxHash;
        }

        return ComputeHash(new
        {
            mode = "demo",
            network = GetConfiguredNetwork(),
            recordType,
            entityId,
            metadata,
            nonce = Guid.NewGuid()
        });
    }

    private async Task<SortedDictionary<string, object?>> BuildRetryMetadataAsync(BlockchainRecord record, CancellationToken cancellationToken)
    {
        var snapshot = await _db.EvidenceSnapshots
            .AsNoTracking()
            .Where(s => s.BlockchainRecordId == record.Id || (s.TenantId == record.TenantId && s.RecordType == record.RecordType && s.EntityId == record.EntityId))
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return new SortedDictionary<string, object?>
        {
            ["schema"] = snapshot?.SchemaVersion ?? EvidenceSchemaVersion,
            ["type"] = record.RecordType.ToLowerInvariant(),
            ["id"] = Truncate(record.EntityId, 64),
            ["hash"] = record.DataHash,
            ["snapshotHash"] = snapshot?.SnapshotHash ?? record.DataHash,
            ["retry"] = record.RetryCount,
            ["ts"] = DateTime.UtcNow.ToString("O")
        };
    }

    private string GetSubmissionMode() =>
        (_configuration["Cardano:SubmissionMode"] ?? "Demo").Trim();

    private string GetBlockfrostBaseUrl()
    {
        var network = GetConfiguredNetwork();
        return network.ToLowerInvariant() switch
        {
            "mainnet" => "https://cardano-mainnet.blockfrost.io/api/v0",
            "preview" => "https://cardano-preview.blockfrost.io/api/v0",
            _ => "https://cardano-preprod.blockfrost.io/api/v0"
        };
    }

    private static Uri? TryGetSubmitterBaseUri(string? submitEndpoint)
    {
        if (string.IsNullOrWhiteSpace(submitEndpoint) || !Uri.TryCreate(submitEndpoint, UriKind.Absolute, out var endpoint))
            return null;

        var baseText = endpoint.GetLeftPart(UriPartial.Authority);
        return Uri.TryCreate($"{baseText}/", UriKind.Absolute, out var baseUri) ? baseUri : null;
    }

    private int GetRetryDelayMinutes()
    {
        var raw = _configuration["Cardano:RetryDelayMinutes"];
        return int.TryParse(raw, out var minutes) && minutes > 0 ? minutes : 5;
    }

    private string GetConfiguredNetwork()
    {
        var network = (_configuration["Cardano:Network"] ?? "preprod").Trim().ToLowerInvariant();
        var mode = GetSubmissionMode();
        return mode.Equals("Demo", StringComparison.OrdinalIgnoreCase) ? $"{network}-demo" : network;
    }

    private static object? NormalizeValue(object? value)
    {
        if (value == null)
            return null;

        if (value is string or bool or byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal)
            return value;

        if (value is DateTime dt)
            return dt.Kind == DateTimeKind.Utc ? dt.ToString("O") : dt.ToUniversalTime().ToString("O");

        if (value is DateTimeOffset dto)
            return dto.ToUniversalTime().ToString("O");

        if (value is Guid guid)
            return guid.ToString();

        if (value is System.Collections.IDictionary dictionary)
        {
            var sorted = new SortedDictionary<string, object?>(StringComparer.Ordinal);
            foreach (System.Collections.DictionaryEntry item in dictionary)
            {
                if (item.Key != null)
                    sorted[item.Key.ToString() ?? string.Empty] = NormalizeValue(item.Value);
            }
            return sorted;
        }

        if (value is System.Collections.IEnumerable enumerable && value is not string)
        {
            var list = new List<object?>();
            foreach (var item in enumerable)
                list.Add(NormalizeValue(item));
            return list;
        }

        var properties = value.GetType()
            .GetProperties(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public)
            .Where(p => p.GetIndexParameters().Length == 0)
            .OrderBy(p => p.Name, StringComparer.Ordinal);

        var result = new SortedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var prop in properties)
            result[prop.Name] = NormalizeValue(prop.GetValue(value));
        return result;
    }

    private static string Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;
        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private static double MapSeverityScore(string? severity) =>
        severity?.ToUpperInvariant() switch
        {
            "CRITICAL" => 1.0,
            "HIGH" => 0.8,
            "MEDIUM" => 0.5,
            "LOW" => 0.2,
            _ => 0.1
        };

    private sealed record CardanoSubmissionResponse(string? TxHash);
}
