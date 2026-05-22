using System.Net.Http.Json;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Hubs;
using VeriChainIDS.API.Models;
using VeriChainIDS.API.Models.DTOs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace VeriChainIDS.API.Services;

/// <summary>
/// Background service check health của Agent định kỳ.
/// - Health check: GET HealthUrl → alive
/// - Stale detection: Server Online nhưng LastSeenAt quá cũ → Offline
/// - Push SignalR ServerStatusChanged khi trạng thái thay đổi.
/// </summary>
public class AgentHealthBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<AlertHub, IAlertHub> _alertHub;
    private readonly ILogger<AgentHealthBackgroundService> _logger;
    private readonly HttpClient _httpClient;

    // Server offline nếu LastSeenAt cũ hơn 90s (3 chu kỳ heartbeat 30s)
    // + debounce: không re-push SignalR nếu server đã Offline rồi
    private const int StaleTimeoutSeconds = 90;

    // Debounce: không flip online nếu vừa mới bị mark offline
    private readonly Dictionary<Guid, DateTime> _lastOfflineTime = new();
    private readonly object _debounceLock = new();

    public AgentHealthBackgroundService(
        IServiceScopeFactory scopeFactory,
        IHubContext<AlertHub, IAlertHub> alertHub,
        ILogger<AgentHealthBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _alertHub = alertHub;
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[HEALTH-SVC] Agent health check background service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckAllAgentsHealthAsync(stoppingToken);
                await MarkStaleServersOfflineAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[HEALTH-SVC] Health check cycle failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }

    /// <summary>
    /// Chỉ check các server có HealthUrl → thử GET, retry 3 lần.
    /// Cập nhật DB + SignalR khi IsHealthy thay đổi.
    /// </summary>
    private async Task CheckAllAgentsHealthAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();

        var servers = await db.Servers
            .Where(s => !string.IsNullOrEmpty(s.HealthUrl))
            .ToListAsync(ct);

        if (servers.Count == 0)
            return;

        var tasks = servers.Select(CheckServerHealthAsync).ToList();
        await Task.WhenAll(tasks);
    }

    /// <summary>
    /// Server đang Status=Online nhưng LastSeenAt cũ hơn StaleTimeoutSeconds → Offline.
    /// Chạy ĐỘC LẬP với health check, không cần HealthUrl.
    /// </summary>
    private async Task MarkStaleServersOfflineAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddSeconds(-StaleTimeoutSeconds);

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();

        var stale = await db.Servers
            .Where(s => s.Status == "Online" &&
                        s.LastSeenAt != null &&
                        s.LastSeenAt < cutoff)
            .ToListAsync(ct);

        if (stale.Count == 0)
            return;

        _logger.LogInformation("[HEALTH-SVC] Found {Count} stale servers (LastSeenAt < {Cutoff})", stale.Count, cutoff);

        foreach (var s in stale)
        {
            s.Status = "Offline";
            s.IsHealthy = false;
            s.LastHealthCheckAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);

        foreach (var dbServer in stale)
        {
            _logger.LogInformation("[HEALTH-SVC] Marking stale server OFFLINE: {Name} (LastSeenAt: {LastSeen})",
                dbServer.Name, dbServer.LastSeenAt);

            try
            {
                await _alertHub.Clients
                    .Group(dbServer.TenantId.ToString())
                    .ServerStatusChanged(
                        dbServer.Id,
                        dbServer.Status,
                        dbServer.CpuUsage,
                        dbServer.RamUsage,
                        dbServer.DiskUsage);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[HEALTH-SVC] SignalR (stale) failed for {Name}", dbServer.Name);
            }
        }
    }

    private async Task CheckServerHealthAsync(Server server)
    {
        bool wasHealthy = server.IsHealthy;
        bool isHealthyNow = false;
        int retryCount = 3;
        int retryDelayMs = 1000;

        // Debounce: nếu server vừa bị mark offline trong 60s gần đây → bỏ qua
        lock (_debounceLock)
        {
            if (_lastOfflineTime.TryGetValue(server.Id, out var lastOffline) &&
                DateTime.UtcNow - lastOffline < TimeSpan.FromSeconds(60))
            {
                _logger.LogDebug("[HEALTH] Debounce skip {ServerName} (vua bi offline {Seconds}s truoc)",
                    server.Name, (int)(DateTime.UtcNow - lastOffline).TotalSeconds);
                return;
            }
        }

        for (int attempt = 1; attempt <= retryCount; attempt++)
        {
            try
            {
                var resp = await _httpClient.GetAsync(server.HealthUrl!);
                if (resp.IsSuccessStatusCode)
                {
                    isHealthyNow = true;
                    break;
                }

                _logger.LogDebug("[HEALTH] Attempt {Attempt}/{Max} failed for {ServerUrl}",
                    attempt, retryCount, server.HealthUrl);
            }
            catch (Exception ex)
            {
                _logger.LogDebug("[HEALTH] Attempt {Attempt}/{Max} error for {ServerUrl}: {Error}",
                    attempt, retryCount, server.HealthUrl, ex.Message);
            }

            if (attempt < retryCount)
            {
                await Task.Delay(retryDelayMs, CancellationToken.None);
            }
        }

        if (wasHealthy != isHealthyNow)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();

            var dbServer = await db.Servers.FindAsync(server.Id);
            if (dbServer != null)
            {
                dbServer.IsHealthy = isHealthyNow;
                dbServer.Status = isHealthyNow ? "Online" : "Offline";
                dbServer.LastHealthCheckAt = DateTime.UtcNow;
                await db.SaveChangesAsync();

                // Ghi nhận thời điểm offline để debounce
                if (!isHealthyNow)
                {
                    lock (_debounceLock)
                    {
                        _lastOfflineTime[dbServer.Id] = DateTime.UtcNow;
                    }
                }

                _logger.LogInformation(
                    "[HEALTH] Server {ServerName} ({HealthUrl}) → {Status} (retry:{Retries})",
                    dbServer.Name, server.HealthUrl, dbServer.Status, retryCount);

                try
                {
                    await _alertHub.Clients
                        .Group(dbServer.TenantId.ToString())
                        .ServerStatusChanged(
                            dbServer.Id,
                            dbServer.Status,
                            dbServer.CpuUsage,
                            dbServer.RamUsage,
                            dbServer.DiskUsage
                        );
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[HEALTH-SVC] SignalR push failed for {ServerName}", dbServer.Name);
                }
            }
        }
    }
}
