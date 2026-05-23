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
        var evidence = new SortedDictionary<string, object?>
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
        var evidence = new SortedDictionary<string, object?>
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
        var evidence = new SortedDictionary<string, object?>
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
            verifyResult = string.Equals(onChainHash, record.DataHash, StringComparison.OrdinalIgnoreCase);
            verifyMessage = onChainHash == null
                ? "No VeriChainIDS metadata hash was found on Cardano."
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

    public async Task<IpReputationResult> QueryIpReputationAsync(string ipAddress, CancellationToken cancellationToken = default)
    {
        var ipHash = ComputeIpHash(ipAddress);
        var reports = await _db.BlockedIPs
            .AsNoTracking()
            .Where(b => b.IpAddress == ipAddress)
            .OrderByDescending(b => b.BlockedAt)
            .ToListAsync(cancellationToken);

        var severityScore = reports.Count == 0
            ? 0
            : reports.Max(r => MapSeverityScore(r.Severity));

        return new IpReputationResult(
            ipAddress,
            ipHash,
            reports.Count,
            severityScore,
            reports.FirstOrDefault()?.BlockedAt,
            reports.Count >= 5 || severityScore >= 0.9
        );
    }

    public async Task<string?> ReportMaliciousIpAsync(string ipAddress, string attackType, string severity, CancellationToken cancellationToken = default)
    {
        var metadata = new SortedDictionary<string, object?>
        {
            ["type"] = "threat_intel",
            ["ipHash"] = ComputeIpHash(ipAddress),
            ["attackType"] = Truncate(attackType, 64),
            ["severity"] = severity,
            ["hash"] = ComputeHash(new { ipAddress, attackType, severity, reportedAt = DateTime.UtcNow }),
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return await SubmitCardanoMetadataAsync("ThreatIntel", ComputeIpHash(ipAddress), metadata, cancellationToken);
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
