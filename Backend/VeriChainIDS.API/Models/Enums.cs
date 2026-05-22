namespace VeriChainIDS.API.Models;

public enum UserRole
{
    SuperAdmin,
    Admin,
    User
}

public enum SubscriptionStatus
{
    Trial,
    Active,
    Expired,
    Cancelled
}

public enum PaymentStatus
{
    Pending,
    Paid,
    Failed,
    Refunded
}

public enum ServerStatus
{
    Online,
    Offline,
    Warning
}

public enum AlertSeverity
{
    Low,
    Medium,
    High,
    Critical
}

public enum AlertStatus
{
    Open,
    Acknowledged,
    Investigating,
    Resolved,
    FalsePositive
}

public enum TicketStatus
{
    OPEN,
    IN_PROGRESS,
    PENDING,
    RESOLVED,
    CLOSED
}

public enum TicketPriority
{
    Low,
    Medium,
    High,
    Critical
}
