using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace VeriChainIDS.API.Extensions;

public static class HttpContextExtensions
{
    /// <summary>
    /// Lấy TenantId từ HttpContext — ưu tiên:
    /// 1. context.Items["TenantId"] (được đặt bởi ApiKeyAuthMiddleware)
    /// 2. User.FindFirstValue("tenantId") (JWT claim — cho user đăng nhập thường)
    /// 3. Tra cứu từ ServerId nếu có (cho Agent/AI Engine dùng server-level API Key)
    /// </summary>
    public static Guid? GetTenantId(this HttpContext context)
    {
        // Ưu tiên 1: ApiKeyAuthMiddleware đã đặt sẵn từ API Key
        if (context.Items.TryGetValue("TenantId", out var tenantObj) && tenantObj is Guid tenantFromKey)
            return tenantFromKey;

        // Ưu tiên 2: JWT claim (user đăng nhập thông thường)
        var jwtTenant = context.User.FindFirstValue("tenantId");
        if (!string.IsNullOrEmpty(jwtTenant))
            return Guid.Parse(jwtTenant);

        return null;
    }

    /// <summary>
    /// Lấy ServerId từ HttpContext (được đặt bởi ApiKeyAuthMiddleware khi dùng server-level API Key)
    /// </summary>
    public static Guid? GetServerId(this HttpContext context)
    {
        if (context.Items.TryGetValue("ServerId", out var serverObj) && serverObj is Guid serverId)
            return serverId;
        return null;
    }
}
