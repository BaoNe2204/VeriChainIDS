using System.Security.Claims;

namespace VeriChainIDS.API.Middlewares;

/// <summary>
/// Middleware chặn temp token (dùng cho 2FA) ở tất cả endpoint ngoại trừ /api/auth/login-2fa
/// Ngăn user dùng temp token chưa verify 2FA để truy cập hệ thống
/// </summary>
public class TempTokenBlockerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TempTokenBlockerMiddleware> _logger;

    public TempTokenBlockerMiddleware(RequestDelegate next, ILogger<TempTokenBlockerMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Bỏ qua các endpoint không cần auth hoặc là endpoint login-2fa
        var path = context.Request.Path.Value?.ToLowerInvariant() ?? string.Empty;
        
        // Cho phép các endpoint này (không check temp token)
        if (path.Contains("/swagger") || 
            path.Contains("/health") || 
            path == "/" ||
            path.Contains("/api/auth/login") ||  // Cho phép cả login thường và login với 2FA code
            path.Contains("/api/auth/register") ||
            path.Contains("/api/auth/login-2fa") ||  // Endpoint dùng temp token để verify 2FA
            path.Contains("/hubs/") ||
            path.Contains("/api/agent") ||  // Agent endpoints dùng API key, không dùng JWT
            path.Contains("/api/download"))  // Public download endpoints
        {
            await _next(context);
            return;
        }

        // Chỉ check temp token nếu request có Authorization header và user đã authenticated
        if (context.User?.Identity?.IsAuthenticated == true)
        {
            var tokenType = context.User.FindFirstValue("tokenType");
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            
            // Debug logging
            _logger.LogDebug("[TempTokenBlocker] Path: {Path}, TokenType: {TokenType}, UserId: {UserId}", 
                path, tokenType ?? "null", userId ?? "null");
            
            // Nếu là temp token → chặn (trừ các endpoint đã được bỏ qua ở trên)
            if (tokenType == "temp")
            {
                _logger.LogWarning("[TempTokenBlocker] ⛔ BLOCKED temp token access to {Path} by user {UserId}", path, userId);
                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new
                {
                    success = false,
                    message = "Token tạm thời chỉ dùng để xác thực 2FA. Vui lòng hoàn tất xác thực 2FA tại /api/auth/login-2fa.",
                    data = (object?)null
                });
                return;
            }
            else
            {
                _logger.LogDebug("[TempTokenBlocker] ✅ ALLOWED normal token to {Path}", path);
            }
        }

        await _next(context);
    }
}

public static class TempTokenBlockerMiddlewareExtensions
{
    public static IApplicationBuilder UseTempTokenBlocker(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<TempTokenBlockerMiddleware>();
    }
}
