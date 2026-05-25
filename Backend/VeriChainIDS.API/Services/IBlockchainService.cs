using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;

namespace VeriChainIDS.API.Services;

public interface IBlockchainService
{
    string ComputeHash(object data);
    string ComputeIpHash(string ipAddress);
    string? GetExplorerUrl(string? txHash, string? network = null);

    Task<BlockchainRecord> RecordAlertAsync(Alert alert, CancellationToken cancellationToken = default);
    Task<BlockchainRecord> RecordBlockActionAsync(BlockedIP blockedIp, CancellationToken cancellationToken = default);
    Task<BlockchainRecord> RecordAuditLogAsync(AuditLog auditLog, CancellationToken cancellationToken = default);
    Task<IncidentCustodyReportDto?> BuildIncidentCustodyChainAsync(Guid ticketId, CancellationToken cancellationToken = default);
    Task<BlockchainRecord> RecordIncidentCustodyChainAsync(Guid ticketId, CancellationToken cancellationToken = default);

    Task<string?> GetOnChainHashAsync(string txHash, CancellationToken cancellationToken = default);
    Task<CardanoTransactionStatus> GetTransactionStatusAsync(string txHash, CancellationToken cancellationToken = default);
    Task<bool> VerifyRecordAsync(string txHash, string expectedHash, CancellationToken cancellationToken = default);
    Task<BlockchainRecord> RetryRecordAsync(Guid recordId, CancellationToken cancellationToken = default);
    Task<BlockchainHealthDto> GetHealthAsync(CancellationToken cancellationToken = default);
    Task<BlockchainProofReportDto?> BuildProofReportAsync(Guid recordId, CancellationToken cancellationToken = default);
    Task<BlockchainIntegrityReportDto?> BuildIntegrityReportAsync(Guid recordId, CancellationToken cancellationToken = default);
    Task<IpReputationResult> QueryIpReputationAsync(string ipAddress, CancellationToken cancellationToken = default);
    Task<BlockchainRecord> ReportMaliciousIpAsync(Guid tenantId, string ipAddress, string attackType, string severity, CancellationToken cancellationToken = default);
}
