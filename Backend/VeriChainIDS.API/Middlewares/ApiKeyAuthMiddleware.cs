using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VeriChainIDS.API.Middlewares;

public class ApiKeyAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ApiKeyAuthMiddleware> _logger;
    private readonly IHubContext<AlertHub, IAlertHub> _alertHub;

    public ApiKeyAuthMiddleware(
        RequestDelegate next,
        ILogger<ApiKeyAuthMiddleware> logger,
        IHubContext<AlertHub, IAlertHub> alertHub)
    {
        _next = next;
        _logger = logger;
        _alertHub = alertHub;
    }

    public async Task InvokeAsync(HttpContext context, VeriChainIDSDbContext db)
    {
        var path = context.Request.Path.Value?.ToLower() ?? "";

        // Routes cần API Key auth
        // - /api/logs/ingest   → Agent gửi log
        // - /api/logs          → AI Engine đọc log (GET)
        // - /api/logs/top-sources → AI Engine đọc top sources
        // - /api/defense/block-ip → AI Engine / Agent block IP
        // - /api/alerts/trigger → Agent/AI Engine gửi alert (cần API Key hoặc JWT)
        var protectedRoutes = new[] {
            "/api/logs/ingest",
            "/api/logs",
            "/api/logs/ai-fetch",
            "/api/logs/top-sources",
            "/api/defense/block-ip",
            "/api/alerts/trigger",
            "/api/agent",
        };

        var needsApiKeyAuth = protectedRoutes.Any(r => path.StartsWith(r));

        // Khai báo trước: chấp nhận cả Bearer (ASP.NET JWT tự xử) lẫn X-API-Key
        var hasBearer = context.Request.Headers.ContainsKey("Authorization");
        var hasApiKey = context.Request.Headers.ContainsKey("X-API-Key");

        if (needsApiKeyAuth && !hasBearer && !hasApiKey)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { success = false, message = "Thiếu xác thực. Cần header Authorization: Bearer <token> hoặc X-API-Key." });
            return;
        }

        // Chỉ xử lý X-API-Key khi KHÔNG có Bearer token
        if (needsApiKeyAuth && hasApiKey)
        {
            var apiKey = context.Request.Headers["X-API-Key"].ToString();
            var keyHash = ComputeSha256(apiKey);

            var apiKeyRecord = await db.ApiKeys
                .Include(k => k.Tenant)
                .FirstOrDefaultAsync(k => k.KeyHash == keyHash && k.IsActive);

            if (apiKeyRecord == null)
            {
                _logger.LogWarning("API Key không hợp lệ: {Key}", apiKey[..Math.Min(8, apiKey.Length)] + "***");
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { success = false, message = "API Key không hợp lệ hoặc đã bị vô hiệu hóa." });
                return;
            }

            if (apiKeyRecord.ExpiresAt.HasValue && apiKeyRecord.ExpiresAt < DateTime.UtcNow)
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { success = false, message = "API Key đã hết hạn." });
                return;
            }

            if (apiKeyRecord.Tenant != null && !apiKeyRecord.Tenant.IsActive)
            {
                context.Response.StatusCode = 403;
                await context.Response.WriteAsJsonAsync(new { success = false, message = "Workspace đã bị vô hiệu hóa." });
                return;
            }

            apiKeyRecord.LastUsedAt = DateTime.UtcNow;
            context.Items["TenantId"] = apiKeyRecord.TenantId;
            context.Items["ServerId"] = apiKeyRecord.ServerId;
            context.Items["ApiKeyId"] = apiKeyRecord.Id;

            // Cập nhật server health nếu là server-level key
            if (apiKeyRecord.ServerId.HasValue)
            {
                var server = await db.Servers.FindAsync(apiKeyRecord.ServerId.Value);
                if (server != null)
                {
                    server.LastSeenAt = DateTime.UtcNow;
                    server.Status = "Online";

                    try
                    {
                        context.Request.EnableBuffering();
                        context.Request.Body.Position = 0;
                        using var reader = new StreamReader(context.Request.Body, leaveOpen: true);
                        var body = await reader.ReadToEndAsync();
                        context.Request.Body.Position = 0;

                        if (!string.IsNullOrEmpty(body))
                        {
                            try
                            {
                                using var doc = JsonDocument.Parse(body);
                                var root = doc.RootElement;
                                if (root.TryGetProperty("hostname", out var hostname))
                                    server.Name = hostname.GetString() ?? server.Name;
                                if (root.TryGetProperty("os", out var os))
                                    server.OS = os.GetString() ?? server.OS;
                                if (root.TryGetProperty("cpu_percent", out var cpu))
                                    server.CpuUsage = (decimal)cpu.GetDouble();
                                if (root.TryGetProperty("ram_percent", out var ram))
                                    server.RamUsage = (decimal)ram.GetDouble();
                                if (root.TryGetProperty("disk_percent", out var disk))
                                    server.DiskUsage = (decimal)disk.GetDouble();
                            }
                            catch (JsonException) { /* ignore malformed JSON */ }
                        }
                    }
                    catch (Exception ex)
                    {
                        // Client ngắt kết nối giữa chừng hoặc body không đọc được
                        _logger.LogDebug(ex, "Could not read request body for server health update");
                    }
                }
            }

            await db.SaveChangesAsync();

            // Push server health via SignalR real-time (only for server-level keys)
            if (apiKeyRecord.ServerId.HasValue)
            {
                var server = await db.Servers.FindAsync(apiKeyRecord.ServerId.Value);
                if (server != null && apiKeyRecord.TenantId != Guid.Empty)
                {
                    try
                    {
                        await _alertHub.Clients
                            .Group(apiKeyRecord.TenantId.ToString())
                            .ServerStatusChanged(
                                server.Id,
                                server.Status,
                                server.CpuUsage,
                                server.RamUsage,
                                server.DiskUsage
                            );
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to push server status via SignalR");
                    }
                }
            }
        }

        await _next(context);
    }

    private static string ComputeSha256(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLower();
    }
}

public static class ApiKeyAuthMiddlewareExtensions
{
    public static IApplicationBuilder UseApiKeyAuth(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<ApiKeyAuthMiddleware>();
    }
}
