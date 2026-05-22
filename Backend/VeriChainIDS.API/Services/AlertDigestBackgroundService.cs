using VeriChainIDS.API.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace VeriChainIDS.API.Services;

public class AlertDigestBackgroundService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<AlertDigestBackgroundService> _logger;

    public AlertDigestBackgroundService(
        IServiceProvider services,
        ILogger<AlertDigestBackgroundService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AlertDigestBackgroundService started");

        // First run: after 1 minute to let things settle on startup
        var nextHourly = GetNextHourlyRun();
        var nextDaily = GetNextDailyRun();
        var nextWeekly = GetNextWeeklyRun();

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;

            // Hourly digest — every hour at :05
            if (now >= nextHourly)
            {
                await SendDigestAsync("hourly", now, stoppingToken);
                nextHourly = GetNextHourlyRun();
            }

            // Daily digest — 08:05 UTC
            if (now >= nextDaily)
            {
                await SendDigestAsync("daily", now, stoppingToken);
                nextDaily = GetNextDailyRun();
            }

            // Weekly digest — Monday 08:05 UTC
            if (now >= nextWeekly)
            {
                await SendDigestAsync("weekly", now, stoppingToken);
                nextWeekly = GetNextWeeklyRun();
            }

            var sleepMs = Math.Min(
                (nextHourly - now).TotalMilliseconds,
                Math.Min(
                    (nextDaily - now).TotalMilliseconds,
                    (nextWeekly - now).TotalMilliseconds));

            if (sleepMs <= 0)
                sleepMs = 60_000; // safety fallback: 1 min

            await Task.Delay(TimeSpan.FromMilliseconds(Math.Min(sleepMs, 60_000)), stoppingToken);
        }
    }

    private static DateTime GetNextHourlyRun()
    {
        var now = DateTime.UtcNow;
        // Next :05 mark
        var next = new DateTime(now.Year, now.Month, now.Day, now.Hour, 5, 0, DateTimeKind.Utc);
        if (next <= now) next = next.AddHours(1);
        return next;
    }

    private static DateTime GetNextDailyRun()
    {
        var now = DateTime.UtcNow;
        var todayTarget = new DateTime(now.Year, now.Month, now.Day, 8, 5, 0, DateTimeKind.Utc);
        if (todayTarget <= now) todayTarget = todayTarget.AddDays(1);
        return todayTarget;
    }

    private static DateTime GetNextWeeklyRun()
    {
        var now = DateTime.UtcNow;
        // Next Monday 08:05 UTC
        var daysUntilMonday = ((int)DayOfWeek.Monday - (int)now.DayOfWeek + 7) % 7;
        if (daysUntilMonday == 0 && now >= new DateTime(now.Year, now.Month, now.Day, 8, 5, 0, DateTimeKind.Utc))
            daysUntilMonday = 7;
        var nextMonday = new DateTime(now.Year, now.Month, now.Day, 8, 5, 0, DateTimeKind.Utc).AddDays(daysUntilMonday);
        return nextMonday;
    }

    private async Task SendDigestAsync(string digestMode, DateTime cutoffUtc, CancellationToken ct)
    {
        _logger.LogInformation("[Digest:{Mode}] Processing digest as of {Cutoff}", digestMode, cutoffUtc);

        using var scope = _services.CreateScope();
        var telegram = scope.ServiceProvider.GetRequiredService<ITelegramService>();

        try
        {
            await telegram.SendDigestAsync(digestMode, cutoffUtc);
            _logger.LogInformation("[Digest:{Mode}] Digest send completed", digestMode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Digest:{Mode}] Digest send failed", digestMode);
        }
    }
}
