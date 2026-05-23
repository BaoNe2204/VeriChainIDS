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
        var normalized = NormalizeValue(data);
        var canonicalJson = JsonSerializer.Serialize(normalized, HashJsonOptions);
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(canonicalJson));
        return Convert.ToHexString(bytes).ToLowerInvariant();
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

        var metadata = new SortedDictionary<string, object?>
        {
            ["type"] = "alert",
            ["id"] = alert.Id.ToString("N")[..32],
            ["severity"] = alert.Severity,
            ["alertType"] = Truncate(alert.AlertType, 64),
            ["hash"] = ComputeHash(evidence),
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return RecordEvidenceAsync(alert.TenantId, "Alert", alert.Id.ToString(), ComputeHash(evidence), metadata, cancellationToken);
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

        var metadata = new SortedDictionary<string, object?>
        {
            ["type"] = "block_ip",
            ["id"] = blockedIp.Id.ToString("N")[..32],
            ["ipHash"] = ComputeIpHash(blockedIp.IpAddress),
            ["attackType"] = Truncate(blockedIp.AttackType, 64),
            ["severity"] = blockedIp.Severity,
            ["hash"] = ComputeHash(evidence),
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return RecordEvidenceAsync(blockedIp.TenantId ?? Guid.Empty, "BlockIP", blockedIp.Id.ToString(), ComputeHash(evidence), metadata, cancellationToken);
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

        var metadata = new SortedDictionary<string, object?>
        {
            ["type"] = "audit_log",
            ["id"] = auditLog.Id.ToString(),
            ["action"] = Truncate(auditLog.Action, 64),
            ["hash"] = ComputeHash(evidence),
            ["ts"] = DateTime.UtcNow.ToString("O")
        };

        return RecordEvidenceAsync(auditLog.TenantId ?? Guid.Empty, "AuditLog", auditLog.Id.ToString(), ComputeHash(evidence), metadata, cancellationToken);
    }

    public async Task<string?> GetOnChainHashAsync(string txHash, CancellationToken cancellationToken = default)
    {
        var projectId = _configuration["Cardano:BlockfrostProjectId"];
        if (string.IsNullOrWhiteSpace(projectId))
            return null;

        var network = GetConfiguredNetwork();
        var baseUrl = network.ToLowerInvariant() switch
        {
            "mainnet" => "https://cardano-mainnet.blockfrost.io/api/v0",
            "preview" => "https://cardano-preview.blockfrost.io/api/v0",
            _ => "https://cardano-preprod.blockfrost.io/api/v0"
        };

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

    public async Task<bool> VerifyRecordAsync(string txHash, string expectedHash, CancellationToken cancellationToken = default)
    {
        var onChainHash = await GetOnChainHashAsync(txHash, cancellationToken);
        return string.Equals(onChainHash, expectedHash, StringComparison.OrdinalIgnoreCase);
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
        CancellationToken cancellationToken)
    {
        var existing = await _db.BlockchainRecords
            .FirstOrDefaultAsync(r => r.TenantId == tenantId && r.RecordType == recordType && r.EntityId == entityId, cancellationToken);

        if (existing != null)
            return existing;

        var network = GetConfiguredNetwork();
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

        try
        {
            var txHash = await SubmitCardanoMetadataAsync(recordType, entityId, metadata, cancellationToken);
            record.TxHash = txHash;
            if (!string.IsNullOrWhiteSpace(txHash))
            {
                record.Status = network.Contains("demo", StringComparison.OrdinalIgnoreCase) ? "Confirmed" : "Pending";
                record.ConfirmedAt = record.Status == "Confirmed" ? DateTime.UtcNow : null;
            }
        }
        catch (Exception ex)
        {
            record.Status = "Failed";
            record.ErrorMessage = ex.Message;
            _logger.LogError(ex, "Cardano evidence submission failed for {RecordType} {EntityId}", recordType, entityId);
        }

        _db.BlockchainRecords.Add(record);
        await _db.SaveChangesAsync(cancellationToken);
        return record;
    }

    private async Task<string?> SubmitCardanoMetadataAsync(
        string recordType,
        string entityId,
        SortedDictionary<string, object?> metadata,
        CancellationToken cancellationToken)
    {
        var mode = (_configuration["Cardano:SubmissionMode"] ?? "Demo").Trim();
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

    private string GetConfiguredNetwork()
    {
        var network = (_configuration["Cardano:Network"] ?? "preprod").Trim().ToLowerInvariant();
        var mode = (_configuration["Cardano:SubmissionMode"] ?? "Demo").Trim();
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
