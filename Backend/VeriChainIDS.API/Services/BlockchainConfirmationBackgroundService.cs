using VeriChainIDS.API.Data;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Services;

public class BlockchainConfirmationBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BlockchainConfirmationBackgroundService> _logger;

    public BlockchainConfirmationBackgroundService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<BlockchainConfirmationBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var startupDelay = TimeSpan.FromSeconds(15);
        try
        {
            await Task.Delay(startupDelay, stoppingToken);
        }
        catch (TaskCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ConfirmPendingRecordsAsync(stoppingToken);
                await RetryDueFailedRecordsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Blockchain confirmation worker failed.");
            }

            try
            {
                await Task.Delay(GetInterval(), stoppingToken);
            }
            catch (TaskCanceledException)
            {
                return;
            }
        }
    }

    private async Task ConfirmPendingRecordsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();
        var blockchain = scope.ServiceProvider.GetRequiredService<IBlockchainService>();

        var records = await db.BlockchainRecords
            .Where(r => r.Status == "Pending"
                && r.TxHash != null
                && !r.Network.Contains("demo")
                && (r.LastCheckedAt == null || r.LastCheckedAt < DateTime.UtcNow.AddMinutes(-1)))
            .OrderBy(r => r.LastCheckedAt ?? r.CreatedAt)
            .Take(GetBatchSize())
            .ToListAsync(cancellationToken);

        foreach (var record in records)
        {
            if (string.IsNullOrWhiteSpace(record.TxHash))
                continue;

            var status = await blockchain.GetTransactionStatusAsync(record.TxHash, cancellationToken);
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
        }

        if (records.Count > 0)
            await db.SaveChangesAsync(cancellationToken);
    }

    private async Task RetryDueFailedRecordsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();
        var blockchain = scope.ServiceProvider.GetRequiredService<IBlockchainService>();
        var now = DateTime.UtcNow;
        var maxRetries = GetMaxRetries();

        var dueRecordIds = await db.BlockchainRecords
            .AsNoTracking()
            .Where(r => r.Status == "Failed"
                && r.RetryCount < maxRetries
                && r.NextRetryAt != null
                && r.NextRetryAt <= now)
            .OrderBy(r => r.NextRetryAt)
            .Take(GetBatchSize())
            .Select(r => r.Id)
            .ToListAsync(cancellationToken);

        foreach (var recordId in dueRecordIds)
        {
            try
            {
                await blockchain.RetryRecordAsync(recordId, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Automatic blockchain retry failed for record {RecordId}", recordId);
            }
        }
    }

    private TimeSpan GetInterval()
    {
        var raw = _configuration["Cardano:ConfirmationWorkerIntervalSeconds"];
        return int.TryParse(raw, out var seconds) && seconds > 0
            ? TimeSpan.FromSeconds(seconds)
            : TimeSpan.FromSeconds(60);
    }

    private int GetBatchSize()
    {
        var raw = _configuration["Cardano:ConfirmationWorkerBatchSize"];
        return int.TryParse(raw, out var size) && size > 0 ? size : 20;
    }

    private int GetMaxRetries()
    {
        var raw = _configuration["Cardano:MaxRetryCount"];
        return int.TryParse(raw, out var count) && count > 0 ? count : 3;
    }
}
