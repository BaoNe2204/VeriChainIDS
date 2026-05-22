using VeriChainIDS.API.Models.DTOs;

namespace VeriChainIDS.API.Hubs;

public interface IAlertHub
{
    Task ReceiveAlert(AlertDto alert);
    Task AlertStatusChanged(AlertDto alert);
    Task TicketCreated(TicketDto ticket);
    Task TicketUpdated(TicketDto ticket);
    Task ServerStatusChanged(Guid serverId, string status, decimal? cpu, decimal? ram, decimal? disk);
    Task NotificationReceived(NotificationDto notification);
    /// <summary>Frontend nhận lệnh block IP (từ AI Engine hoặc SOC)</summary>
    Task ReceiveBlockCommand(BlockCommandDto command);
    Task ReceiveUnblockCommand(string ip);
    /// <summary>Frontend nhận audit log mới (real-time update)</summary>
    Task AuditLogReceived(AuditLogDto auditLog);
}

public class AlertHub : Microsoft.AspNetCore.SignalR.Hub<IAlertHub>
{
    public override async Task OnConnectedAsync()
    {
        // Khi user login, họ join vào group theo tenantId
        await base.OnConnectedAsync();
    }

    public async Task JoinTenantGroup(Guid tenantId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, tenantId.ToString());
    }

    public async Task LeaveTenantGroup(Guid tenantId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, tenantId.ToString());
    }
}
