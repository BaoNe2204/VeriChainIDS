using VeriChainIDS.API.Models.DTOs;

namespace VeriChainIDS.API.Hubs;

/// <summary>
/// Hub cho Agent nhận lệnh từ Backend (SignalR WebSocket push).
/// Backend gọi: Clients.Group(serverId.ToString()).ReceiveBlockCommand(...)
/// Agent nhận: def receive_block_command(self, ip, reason, ...)
/// </summary>
public interface IAgentHub
{
    /// <summary>Lệnh block IP từ Backend/AI Engine</summary>
    Task ReceiveBlockCommand(BlockCommandDto command);

    /// <summary>Lệnh unblock IP</summary>
    Task ReceiveUnblockCommand(string ip);

    /// <summary>Yêu cầu Agent gửi heartbeat ngay</summary>
    Task Ping();
}

public class BlockCommandDto
{
    public string Ip { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string AttackType { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public int? DurationMinutes { get; set; }
    public Guid BlockId { get; set; }
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;
    /// <summary>True = tenant-wide block (no ServerId), agent should apply locally.</summary>
    public bool IsTenantWide { get; set; } = false;
}

public class AgentHub : Microsoft.AspNetCore.SignalR.Hub<IAgentHub>
{
    private readonly ILogger<AgentHub> _logger;

    public AgentHub(ILogger<AgentHub> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Agent gọi method này khi kết nối để đăng ký ServerId vào group.
    /// Client gọi: hub.invoke("JoinServerGroup", serverId)
    /// </summary>
    public async Task JoinServerGroup(Guid serverId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, serverId.ToString());
        _logger.LogInformation("[AgentHub] Agent joined server group: {ServerId} | Connection: {ConnId}",
            serverId, Context.ConnectionId);
    }

    /// <summary>
    /// Agent rời group khi disconnect
    /// </summary>
    public async Task LeaveServerGroup(Guid serverId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, serverId.ToString());
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("[AgentHub] Agent connected: {ConnId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception != null)
            _logger.LogWarning(exception, "[AgentHub] Agent disconnected with error: {ConnId}", Context.ConnectionId);
        else
            _logger.LogInformation("[AgentHub] Agent disconnected: {ConnId}", Context.ConnectionId);

        await base.OnDisconnectedAsync(exception);
    }
}
