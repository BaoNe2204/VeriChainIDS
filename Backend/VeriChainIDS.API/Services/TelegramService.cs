using System.Net;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Models;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Services;

public interface ITelegramService
{
    /// <summary>Send a single alert immediately (realtime mode).</summary>
    Task<int> SendAlertAsync(Guid tenantId, Alert alert, Server? server, Ticket? ticket);

    /// <summary>Queue an alert for digest sending (non-realtime mode).</summary>
    Task QueueAlertAsync(Guid tenantId, Alert alert, Server? server, Ticket? ticket);

    /// <summary>Send pending digest alerts for a specific mode and cutoff time.</summary>
    Task SendDigestAsync(string digestMode, DateTime cutoffUtc);

    /// <summary>Send a whitelist notification to Telegram realtime users.</summary>
    Task SendWhitelistNotificationAsync(Guid tenantId, string ipAddress, string userName, string scopeLabel);
}

public class TelegramService : ITelegramService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<TelegramService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly VeriChainIDSDbContext _db;

    private static readonly string[] SeverityOrder = { "Low", "Medium", "High", "Critical" };

    public TelegramService(
        IConfiguration configuration,
        ILogger<TelegramService> logger,
        IHttpClientFactory httpClientFactory,
        VeriChainIDSDbContext db)
    {
        _configuration = configuration;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
        _db = db;
    }

    public async Task<int> SendAlertAsync(Guid tenantId, Alert alert, Server? server, Ticket? ticket)
    {
        if (!IsEnabled())
            return 0;

        var botToken = _configuration["TelegramBot:BotToken"];
        if (string.IsNullOrWhiteSpace(botToken))
        {
            _logger.LogWarning("TelegramBot is enabled but BotToken is missing.");
            return 0;
        }

        var chatIds = await GetChatIdsAsync(tenantId, alert.ServerId, "realtime");
        if (chatIds.Count == 0)
        {
            _logger.LogWarning("No Telegram recipients for alert {AlertId}. ServerId={ServerId}", alert.Id, alert.ServerId);
            return 0;
        }

        _logger.LogInformation("Sending Telegram alert to {Count} chat(s): {ChatIds}", chatIds.Count, string.Join(", ", chatIds));

        var client = _httpClientFactory.CreateClient(nameof(TelegramService));
        var endpoint = $"https://api.telegram.org/bot{botToken}/sendMessage";
        var message = BuildAlertMessage(tenantId, alert, server, ticket);

        var sentCount = 0;

        foreach (var chatId in chatIds)
        {
            try
            {
                using var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["chat_id"] = chatId,
                    ["text"] = message,
                    ["parse_mode"] = "HTML",
                    ["disable_web_page_preview"] = "true",
                });

                using var response = await client.PostAsync(endpoint, content);
                if (response.IsSuccessStatusCode)
                {
                    sentCount++;
                    continue;
                }

                var responseBody = await response.Content.ReadAsStringAsync();
                _logger.LogWarning(
                    "Failed to send Telegram alert to chat {ChatId}. Status={StatusCode}, Response={Response}",
                    chatId,
                    (int)response.StatusCode,
                    responseBody);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send Telegram alert to chat {ChatId}", chatId);
            }
        }

        return sentCount;
    }

    public async Task QueueAlertAsync(Guid tenantId, Alert alert, Server? server, Ticket? ticket)
    {
        if (!IsEnabled())
            return;

        // Find all users who have digest mode enabled (non-realtime) and meet severity threshold
        var eligibleUsers = await _db.Users
            .Where(u => u.TenantId == tenantId
                        && u.IsActive
                        && u.TelegramAlertsEnabled
                        && !string.IsNullOrWhiteSpace(u.TelegramChatId)
                        && u.AlertDigestMode != "realtime"
                        && MeetsSeverityThreshold(alert.Severity, u.AlertSeverityThreshold))
            .ToListAsync();

        if (eligibleUsers.Count == 0)
        {
            _logger.LogInformation("No digest recipients eligible for alert {AlertId}", alert.Id);
            return;
        }

        _logger.LogInformation("Queuing {Count} digest entries for alert {AlertId}", eligibleUsers.Count, alert.Id);

        var message = BuildAlertMessage(tenantId, alert, server, ticket);

        try
        {
            foreach (var user in eligibleUsers)
            {
                _db.AlertDigestQueue.Add(new AlertDigestQueue
                {
                    TenantId = tenantId,
                    UserId = user.Id,
                    TelegramChatId = user.TelegramChatId!,
                    DigestMode = user.AlertDigestMode,
                    AlertId = alert.Id,
                    Severity = alert.Severity,
                    AlertTitle = alert.Title,
                    AlertMessage = message,
                    AlertCreatedAt = alert.CreatedAt,
                });
            }

            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to queue alert {AlertId} for digest — AlertDigestQueue table may not exist yet.", alert.Id);
        }
    }

    public async Task SendDigestAsync(string digestMode, DateTime cutoffUtc)
    {
        if (!IsEnabled())
            return;

        var botToken = _configuration["TelegramBot:BotToken"];
        if (string.IsNullOrWhiteSpace(botToken))
        {
            _logger.LogWarning("TelegramBot: BotToken missing for digest send.");
            return;
        }

        List<AlertDigestQueue> queueItems;
        try
        {
            // Get all queued, unsent entries for this digest mode older than cutoff
            queueItems = await _db.AlertDigestQueue
                .Where(q => q.DigestMode == digestMode
                            && !q.IsSent
                            && q.QueuedAt <= cutoffUtc)
                .OrderBy(q => q.QueuedAt)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Digest:{Mode}] Failed to query AlertDigestQueue — table may not exist yet. Skipping digest.", digestMode);
            return;
        }

        if (queueItems.Count == 0)
        {
            _logger.LogDebug("No {DigestMode} digest items to send as of {Cutoff}", digestMode, cutoffUtc);
            return;
        }

        // Group by user+chatId
        var groups = queueItems
            .GroupBy(q => new { q.UserId, q.TelegramChatId })
            .ToList();

        var endpoint = $"https://api.telegram.org/bot{botToken}/sendMessage";
        var client = _httpClientFactory.CreateClient(nameof(TelegramService));

        foreach (var group in groups)
        {
            var items = group.ToList();

            // Sort by severity descending
            var sorted = items
                .OrderByDescending(i => Array.IndexOf(SeverityOrder, i.Severity ?? "Low"))
                .ThenByDescending(i => i.AlertCreatedAt)
                .ToList();

            var criticalCount = sorted.Count(i => i.Severity == "Critical");
            var highCount = sorted.Count(i => i.Severity == "High");
            var mediumCount = sorted.Count(i => i.Severity == "Medium");
            var lowCount = sorted.Count(i => i.Severity == "Low");

            var summary = digestMode switch
            {
                "hourly" => $"<b>VeriChainIDS Hourly Digest</b>\n{DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC\n",
                "daily" => $"<b>VeriChainIDS Daily Digest</b>\n{DateTime.UtcNow:yyyy-MM-dd} UTC\n",
                "weekly" => $"<b>VeriChainIDS Weekly Digest</b>\nW/c {DateTime.UtcNow:yyyy-MM-dd} UTC\n",
                _ => $"<b>VeriChainIDS Alert Digest</b>\n{DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC\n"
            };

            var body = new List<string> { summary };
            body.Add($"Total: {sorted.Count} alert(s) — ");
            if (criticalCount > 0) body.Add($"🔴 Critical: {criticalCount} ");
            if (highCount > 0) body.Add($"🟠 High: {highCount} ");
            if (mediumCount > 0) body.Add($"🟡 Medium: {mediumCount} ");
            if (lowCount > 0) body.Add($"🟢 Low: {lowCount}");
            body.Add("\n────────────────────\n");

            foreach (var item in sorted)
            {
                var icon = item.Severity switch
                {
                    "Critical" => "🔴",
                    "High" => "🟠",
                    "Medium" => "🟡",
                    _ => "🟢"
                };
                body.Add($"{icon} [{item.Severity}] {WebUtility.HtmlEncode(item.AlertTitle ?? "N/A")}\n");
                body.Add($"   {item.AlertMessage ?? "N/A"}\n\n");
            }

            var fullMessage = string.Join("", body);

            try
            {
                using var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["chat_id"] = group.Key.TelegramChatId,
                    ["text"] = fullMessage,
                    ["parse_mode"] = "HTML",
                    ["disable_web_page_preview"] = "true",
                });

                using var response = await client.PostAsync(endpoint, content);
                if (response.IsSuccessStatusCode)
                {
                    foreach (var item in items)
                    {
                        item.IsSent = true;
                        item.SentAt = DateTime.UtcNow;
                    }
                }
                else
                {
                    var respBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("Digest send failed for chat {ChatId}: {Resp}", group.Key.TelegramChatId, respBody);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Digest send error for chat {ChatId}", group.Key.TelegramChatId);
            }
        }

        await _db.SaveChangesAsync();

        // Cleanup old sent entries older than 7 days
        try
        {
            var oldCutoff = DateTime.UtcNow.AddDays(-7);
            var oldItems = await _db.AlertDigestQueue
                .Where(q => q.IsSent && q.SentAt < oldCutoff)
                .ToListAsync();
            if (oldItems.Count > 0)
            {
                _db.AlertDigestQueue.RemoveRange(oldItems);
                await _db.SaveChangesAsync();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to cleanup old digest entries — table may not exist yet.");
        }
    }

    private bool IsEnabled()
    {
        var enabled = _configuration["TelegramBot:Enabled"];
        return bool.TryParse(enabled, out var value) && value;
    }

    private static bool MeetsSeverityThreshold(string alertSeverity, string userThreshold)
    {
        var alertIdx = Array.IndexOf(SeverityOrder, alertSeverity);
        if (alertIdx < 0) alertIdx = 0;
        var thresholdIdx = Array.IndexOf(SeverityOrder, userThreshold);
        if (thresholdIdx < 0) thresholdIdx = 1; // default Medium
        return alertIdx >= thresholdIdx;
    }

    private async Task<List<string>> GetChatIdsAsync(Guid tenantId, Guid? serverId, string digestMode)
    {
        // Only return chat IDs for users who want realtime alerts
        var results = new HashSet<string>(StringComparer.Ordinal);
        var disabledOwnedChats = await _db.Users
            .Where(u => u.TenantId == tenantId && u.IsActive && u.TelegramChatId != null && !u.TelegramAlertsEnabled)
            .Select(u => u.TelegramChatId!)
            .ToListAsync();

        var disabledChatSet = disabledOwnedChats
            .Where(static id => !string.IsNullOrWhiteSpace(id))
            .Select(static id => id.Trim())
            .ToHashSet(StringComparer.Ordinal);

        // Server-level recipients — always send regardless of digest mode (original behavior)
        if (serverId.HasValue)
        {
            var serverChatIds = await _db.ServerTelegramRecipients
                .Where(r => r.ServerId == serverId.Value && r.IsActive)
                .Select(r => r.ChatId)
                .ToListAsync();

            foreach (var chatId in serverChatIds)
            {
                if (string.IsNullOrWhiteSpace(chatId))
                    continue;

                var normalized = chatId.Trim();
                if (disabledChatSet.Contains(normalized))
                {
                    _logger.LogInformation(
                        "Skipped Telegram chat {ChatId} for tenant {TenantId} because owner disabled telegram alerts",
                        normalized,
                        tenantId);
                    continue;
                }

                results.Add(normalized);
            }
        }

        // User-level realtime recipients — only if in realtime mode
        if (digestMode == "realtime")
        {
            var realtimeUsers = await _db.Users
                .Where(u => u.TenantId == tenantId
                            && u.IsActive
                            && u.TelegramAlertsEnabled
                            && !string.IsNullOrWhiteSpace(u.TelegramChatId)
                            && u.AlertDigestMode == "realtime")
                .Select(u => u.TelegramChatId!)
                .ToListAsync();

            foreach (var chatId in realtimeUsers)
            {
                var normalized = chatId.Trim();
                if (!disabledChatSet.Contains(normalized))
                    results.Add(normalized);
            }
        }

        if (results.Count == 0)
        {
            foreach (var chatId in GetConfiguredChatIds())
            {
                if (!disabledChatSet.Contains(chatId))
                    results.Add(chatId);
            }
        }

        return results.ToList();
    }

    private IEnumerable<string> GetConfiguredChatIds()
    {
        return _configuration
            .GetSection("TelegramBot:ChatIds")
            .GetChildren()
            .Select(section => section.Value?.Trim())
            .Where(chatId => !string.IsNullOrWhiteSpace(chatId))!
            .Cast<string>();
    }

    private static string BuildAlertMessage(Guid tenantId, Alert alert, Server? server, Ticket? ticket)
    {
        var severityIcon = alert.Severity switch
        {
            "Critical" => "[CRITICAL]",
            "High" => "[HIGH]",
            "Medium" => "[MEDIUM]",
            _ => "[LOW]"
        };

        var lines = new List<string>
        {
            $"<b>{severityIcon} VeriChainIDS Alert</b>",
            $"<b>Type:</b> {Encode(alert.AlertType)}",
            $"<b>Title:</b> {Encode(alert.Title)}",
            $"<b>Severity:</b> {Encode(alert.Severity)}",
            $"<b>Source IP:</b> {Encode(alert.SourceIp ?? "Unknown")}",
            $"<b>Server:</b> {Encode(server != null ? $"{server.Name} ({server.IpAddress})" : "N/A")}",
            $"<b>Tenant:</b> {Encode(tenantId.ToString())}",
            $"<b>MITRE:</b> {Encode($"{alert.MitreTactic} -> {alert.MitreTechnique}")}",
            $"<b>Time (UTC):</b> {Encode(alert.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"))}"
        };

        if (alert.AnomalyScore.HasValue)
            lines.Add($"<b>Anomaly Score:</b> {Encode(alert.AnomalyScore.Value.ToString("0.0000"))}");
        if (!string.IsNullOrWhiteSpace(alert.RecommendedAction))
            lines.Add($"<b>Action:</b> {Encode(alert.RecommendedAction)}");
        if (ticket != null)
            lines.Add($"<b>Ticket:</b> {Encode(ticket.TicketNumber)}");

        return string.Join("\n", lines);
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);

    public async Task SendWhitelistNotificationAsync(Guid tenantId, string ipAddress, string userName, string scopeLabel)
    {
        if (!IsEnabled())
            return;

        var botToken = _configuration["TelegramBot:BotToken"];
        if (string.IsNullOrWhiteSpace(botToken))
        {
            _logger.LogWarning("TelegramBot: BotToken missing for whitelist notification.");
            return;
        }

        var chatIds = await GetChatIdsAsync(tenantId, null, "realtime");
        if (chatIds.Count == 0)
        {
            _logger.LogInformation("[WHITELIST] No Telegram realtime recipients for tenant {TenantId}", tenantId);
            return;
        }

        var client = _httpClientFactory.CreateClient(nameof(TelegramService));
        var endpoint = $"https://api.telegram.org/bot{botToken}/sendMessage";

        var message = $"""
            ⚪ <b>VeriChainIDS — IP Added to Whitelist</b>

            🛡️ <b>IP:</b> <code>{ipAddress}</code>
            👤 <b>Added by:</b> {Encode(userName)}
            📍 <b>Scope:</b> {Encode(scopeLabel)}

            ⏰ <b>Time:</b> {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC

            <i>AI alerts for this IP will be ignored from now on.</i>
            """;

        var sentCount = 0;
        foreach (var chatId in chatIds)
        {
            try
            {
                using var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["chat_id"] = chatId,
                    ["text"] = message,
                    ["parse_mode"] = "HTML",
                    ["disable_web_page_preview"] = "true",
                });

                using var response = await client.PostAsync(endpoint, content);
                if (response.IsSuccessStatusCode)
                    sentCount++;
                else
                {
                    var respBody = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("[WHITELIST] Telegram send failed for chat {ChatId}: {Resp}", chatId, respBody);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[WHITELIST] Telegram send error for chat {ChatId}", chatId);
            }
        }

        _logger.LogInformation("[WHITELIST] Telegram notification sent to {Sent}/{Total} recipients", sentCount, chatIds.Count);
    }
}
