using Microsoft.EntityFrameworkCore;
using VeriChainIDS.API.Models;

namespace VeriChainIDS.API.Data;

public class VeriChainIDSDbContext : DbContext
{
    public VeriChainIDSDbContext(DbContextOptions<VeriChainIDSDbContext> options)
        : base(options) { }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<PaymentOrder> PaymentOrders => Set<PaymentOrder>();
    public DbSet<Server> Servers => Set<Server>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<TrafficLog> TrafficLogs => Set<TrafficLog>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketComment> TicketComments => Set<TicketComment>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<BlockchainRecord> BlockchainRecords => Set<BlockchainRecord>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<BlockedIP> BlockedIPs => Set<BlockedIP>();
    public DbSet<ServerAlertEmail> ServerAlertEmails => Set<ServerAlertEmail>();
    public DbSet<ServerTelegramRecipient> ServerTelegramRecipients => Set<ServerTelegramRecipient>();
    public DbSet<AlertDigestQueue> AlertDigestQueue => Set<AlertDigestQueue>();
    public DbSet<PricingPlan> PricingPlans => Set<PricingPlan>();
    public DbSet<Whitelist> Whitelists => Set<Whitelist>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Tenant
        modelBuilder.Entity<Tenant>(e =>
        {
            e.HasIndex(t => t.Subdomain).IsUnique();
            e.Property(t => t.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
        });

        // User
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasOne(u => u.Tenant)
                .WithMany(t => t.Users)
                .HasForeignKey(u => u.TenantId)
                .OnDelete(DeleteBehavior.SetNull);

            // Alert acknowledgements — User has 2 separate FK columns pointing here
            e.HasMany(u => u.AcknowledgedAlerts)
                .WithOne(a => a.AcknowledgedByUser)
                .HasForeignKey("AcknowledgedBy")
                .OnDelete(DeleteBehavior.SetNull);
            e.HasMany(u => u.ResolvedAlerts)
                .WithOne(a => a.ResolvedByUser)
                .HasForeignKey("ResolvedBy")
                .OnDelete(DeleteBehavior.SetNull);

            // Tickets
            e.HasMany(u => u.AssignedTickets)
                .WithOne(t => t.AssignedToUser)
                .HasForeignKey("AssignedTo")
                .OnDelete(DeleteBehavior.SetNull);
            e.HasMany(u => u.CreatedTickets)
                .WithOne(t => t.CreatedByUser)
                .HasForeignKey("CreatedBy")
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Subscription
        modelBuilder.Entity<Subscription>(e =>
        {
            e.Property(s => s.PlanPrice).HasColumnType("decimal(18,2)");
            e.Property(s => s.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasOne(s => s.Tenant)
                .WithMany(t => t.Subscriptions)
                .HasForeignKey(s => s.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // PaymentOrder
        modelBuilder.Entity<PaymentOrder>(e =>
        {
            e.HasIndex(p => p.OrderId).IsUnique();
            e.Property(p => p.Amount).HasColumnType("decimal(18,2)");
            e.Property(p => p.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasOne(p => p.Tenant)
                .WithMany()
                .HasForeignKey(p => p.TenantId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Server
        modelBuilder.Entity<Server>(e =>
        {
            e.Property(s => s.CpuUsage).HasColumnType("decimal(5,2)");
            e.Property(s => s.RamUsage).HasColumnType("decimal(5,2)");
            e.Property(s => s.DiskUsage).HasColumnType("decimal(5,2)");
            e.Property(s => s.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasOne(s => s.Tenant)
                .WithMany(t => t.Servers)
                .HasForeignKey(s => s.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ApiKey
        modelBuilder.Entity<ApiKey>(e =>
        {
            e.Property(a => a.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasOne(a => a.Tenant)
                .WithMany(t => t.ApiKeys)
                .HasForeignKey(a => a.TenantId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(a => a.Server)
                .WithMany(s => s.ApiKeys)
                .HasForeignKey(a => a.ServerId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // TrafficLog
        modelBuilder.Entity<TrafficLog>(e =>
        {
            e.Property(t => t.Timestamp).HasDefaultValueSql("GETUTCDATE()");
            e.Property(t => t.AnomalyScore).HasColumnType("decimal(5,4)");
            e.HasIndex(t => new { t.TenantId, t.Timestamp }).HasDatabaseName("IX_TrafficLogs_TenantId_Time");
            e.HasIndex(t => new { t.TenantId, t.IsAnomaly, t.Timestamp }).HasDatabaseName("IX_TrafficLogs_Anomaly");
            e.HasOne(t => t.Tenant)
                .WithMany()
                .HasForeignKey(t => t.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Server)
                .WithMany(s => s.TrafficLogs)
                .HasForeignKey(t => t.ServerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Alert
        modelBuilder.Entity<Alert>(e =>
        {
            e.Property(a => a.AnomalyScore).HasColumnType("decimal(5,4)");
            e.Property(a => a.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(a => new { a.TenantId, a.Status }).HasDatabaseName("IX_Alerts_TenantId_Status");
            e.HasIndex(a => new { a.TenantId, a.CreatedAt }).HasDatabaseName("IX_Alerts_TenantId_Created");
            e.HasOne(a => a.Tenant)
                .WithMany(t => t.Alerts)
                .HasForeignKey(a => a.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.Server)
                .WithMany(s => s.Alerts)
                .HasForeignKey(a => a.ServerId)
                .OnDelete(DeleteBehavior.SetNull);
            e.Navigation(a => a.AcknowledgedByUser).UsePropertyAccessMode(PropertyAccessMode.Property);
            e.Navigation(a => a.ResolvedByUser).UsePropertyAccessMode(PropertyAccessMode.Property);
        });

        // Ticket
        modelBuilder.Entity<Ticket>(e =>
        {
            e.HasIndex(t => t.TicketNumber).IsUnique();
            e.Property(t => t.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.Property(t => t.UpdatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(t => new { t.TenantId, t.Status }).HasDatabaseName("IX_Tickets_TenantId_Status");
            e.HasOne(t => t.Tenant)
                .WithMany(ten => ten.Tickets)
                .HasForeignKey(t => t.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Alert)
                .WithMany(a => a.Tickets)
                .HasForeignKey(t => t.AlertId)
                .OnDelete(DeleteBehavior.SetNull);
            e.Navigation(t => t.AssignedToUser).UsePropertyAccessMode(PropertyAccessMode.Property);
            e.Navigation(t => t.AssignedByUser).UsePropertyAccessMode(PropertyAccessMode.Property);
            e.Navigation(t => t.CreatedByUser).UsePropertyAccessMode(PropertyAccessMode.Property);
        });

        // TicketComment
        modelBuilder.Entity<TicketComment>(e =>
        {
            e.Property(tc => tc.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasOne(tc => tc.Ticket)
                .WithMany(t => t.Comments)
                .HasForeignKey(tc => tc.TicketId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(tc => tc.User)
                .WithMany(u => u.TicketComments)
                .HasForeignKey(tc => tc.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // AuditLog
        modelBuilder.Entity<AuditLog>(e =>
        {
            e.Property(a => a.Timestamp).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(a => new { a.TenantId, a.Timestamp }).HasDatabaseName("IX_AuditLogs_TenantId_Time");
        });

        // BlockchainRecord
        modelBuilder.Entity<BlockchainRecord>(e =>
        {
            e.Property(b => b.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.Property(b => b.Status).HasDefaultValue("Pending");
            e.Property(b => b.Network).HasDefaultValue("preprod");
            e.Property(b => b.MetadataLabel).HasDefaultValue("674");
            e.HasIndex(b => new { b.TenantId, b.CreatedAt }).HasDatabaseName("IX_BlockchainRecords_TenantId_CreatedAt");
            e.HasIndex(b => new { b.TenantId, b.Status }).HasDatabaseName("IX_BlockchainRecords_TenantId_Status");
            e.HasIndex(b => b.TxHash).HasDatabaseName("IX_BlockchainRecords_TxHash");
            e.HasIndex(b => new { b.TenantId, b.RecordType, b.EntityId })
                .IsUnique()
                .HasDatabaseName("IX_BlockchainRecords_Tenant_Record_Entity");
            e.HasOne(b => b.Tenant)
                .WithMany(t => t.BlockchainRecords)
                .HasForeignKey(b => b.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Notification
        modelBuilder.Entity<Notification>(e =>
        {
            e.Property(n => n.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(n => new { n.UserId, n.IsRead }).HasDatabaseName("IX_Notifications_UserId_Unread");
            e.HasOne(n => n.Tenant)
                .WithMany(t => t.Notifications)
                .HasForeignKey(n => n.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(n => n.User)
                .WithMany(u => u.Notifications)
                .HasForeignKey(n => n.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // BlockedIP
        modelBuilder.Entity<BlockedIP>(e =>
        {
            e.Property(b => b.BlockedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(b => new { b.TenantId, b.IsActive }).HasDatabaseName("IX_BlockedIPs_TenantId_Active");
            e.HasIndex(b => b.IpAddress).HasDatabaseName("IX_BlockedIPs_IpAddress");
            // Unique index: chỉ 1 active block duy nhất cho mỗi (TenantId + ServerId + IpAddress)
            e.HasIndex(b => new { b.TenantId, b.ServerId, b.IpAddress })
                .HasDatabaseName("IX_BlockedIPs_Tenant_Server_Ip")
                .IsUnique()
                .HasFilter("IsActive = 1");
            e.HasOne(b => b.Tenant)
                .WithMany()
                .HasForeignKey(b => b.TenantId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ServerAlertEmail
        modelBuilder.Entity<ServerAlertEmail>(e =>
        {
            e.Property(s => s.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(s => new { s.ServerId, s.Email }).IsUnique().HasDatabaseName("IX_ServerAlertEmails_ServerId_Email");
            e.HasOne(s => s.Server)
                .WithMany(srv => srv.AlertEmails)
                .HasForeignKey(s => s.ServerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ServerTelegramRecipient
        modelBuilder.Entity<ServerTelegramRecipient>(e =>
        {
            e.Property(s => s.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(s => new { s.ServerId, s.ChatId }).IsUnique().HasDatabaseName("IX_ServerTelegramRecipients_ServerId_ChatId");
            e.HasOne(s => s.Server)
                .WithMany(srv => srv.TelegramRecipients)
                .HasForeignKey(s => s.ServerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // AlertDigestQueue
        modelBuilder.Entity<AlertDigestQueue>(e =>
        {
            e.Property(q => q.QueuedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(q => new { q.UserId, q.DigestMode, q.IsSent }).HasDatabaseName("IX_AlertDigestQueue_UserId_Mode_Sent");
            e.HasIndex(q => new { q.DigestMode, q.IsSent, q.QueuedAt }).HasDatabaseName("IX_AlertDigestQueue_Mode_Sent_Queued");
            e.HasOne(q => q.Tenant)
                .WithMany(t => t.AlertDigestQueue)
                .HasForeignKey(q => q.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(q => q.User)
                .WithMany(u => u.AlertDigestQueue)
                .HasForeignKey(q => q.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(q => q.Alert)
                .WithMany()
                .HasForeignKey(q => q.AlertId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Seed SuperAdmin
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasData(new User
            {
                Id = Guid.Parse("00000000-0000-0000-0000-000000000001"),
                Email = "admin@verichainids.vn",
                PasswordHash = "$2a$11$z3v29KYcBDsFzYtJmXW2f.rZsgTbmZy/uNYTfLYcozlMBQE16POc2", // VeriChainIDS@2026 (BCrypt-Verify 已校验)
                FullName = "Super Administrator",
                Role = "SuperAdmin",
                IsActive = true,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            });
        });

        // Whitelist
        modelBuilder.Entity<Whitelist>(e =>
        {
            e.HasIndex(w => w.TenantId).HasDatabaseName("IX_Whitelists_TenantId");
            e.HasIndex(w => w.IpAddress).HasDatabaseName("IX_Whitelists_IpAddress");
            e.HasIndex(w => w.ServerId).HasDatabaseName("IX_Whitelists_ServerId");
            e.HasIndex(w => new { w.TenantId, w.ServerId, w.IpAddress })
                .IsUnique()
                .HasDatabaseName("IX_Whitelists_TenantId_ServerId_IpAddress");
        });

        // ContactMessage
        modelBuilder.Entity<ContactMessage>(e =>
        {
            e.Property(c => c.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
            e.HasIndex(c => c.Status).HasDatabaseName("IX_ContactMessages_Status");
            e.HasIndex(c => c.CreatedAt).HasDatabaseName("IX_ContactMessages_CreatedAt");
            e.HasOne(c => c.RepliedByUser)
                .WithMany()
                .HasForeignKey(c => c.RepliedBy)
                .OnDelete(DeleteBehavior.SetNull);
        });
        // --- Cấu hình Precision cho Decimal (Fix Warning 30000) ---
            modelBuilder.Entity<BlockedIP>()
                .Property(b => b.AnomalyScore)
                .HasColumnType("decimal(5,4)"); // Lưu tối đa 0.9999

            modelBuilder.Entity<Alert>()
                .Property(a => a.AnomalyScore)
                .HasColumnType("decimal(5,4)");

            modelBuilder.Entity<TrafficLog>()
                .Property(t => t.AnomalyScore)
                .HasColumnType("decimal(5,4)");
    }
}
