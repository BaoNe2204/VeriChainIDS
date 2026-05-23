using System.Text;
using VeriChainIDS.API.Data;
using VeriChainIDS.API.Hubs;
using VeriChainIDS.API.Middlewares;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("DefaultConnection not found");

try
{
    var csb = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(connectionString);
    Console.WriteLine($"[DB] DataSource={csb.DataSource}; InitialCatalog={csb.InitialCatalog}");
}
catch { /* ignore parse errors */ }

builder.Services.AddDbContext<VeriChainIDSDbContext>(options =>
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(5, TimeSpan.FromSeconds(30), null);
        sqlOptions.CommandTimeout(60);
    })
    .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.SqlServerEventId.SavepointsDisabledBecauseOfMARS)));

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddSignalR();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "VeriChainIDS SOC API",
        Version = "v1",
        Description = "Security Operations Center API - SOC Platform"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var jwtSecretKey = builder.Configuration["JwtSettings:SecretKey"]
    ?? throw new InvalidOperationException("JwtSettings:SecretKey is not configured");
var key = Encoding.UTF8.GetBytes(jwtSecretKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = true,
        ValidIssuer = builder.Configuration["JwtSettings:Issuer"],
        ValidateAudience = true,
        ValidAudience = builder.Configuration["JwtSettings:Audience"],
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(5)  // Cho phép lệch giờ 5 phút giữa server và client
    };

    // SignalR token from query string
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

builder.Services.AddScoped<VeriChainIDS.API.Services.IJwtService, VeriChainIDS.API.Services.JwtService>();
builder.Services.AddScoped<VeriChainIDS.API.Services.IEmailService, VeriChainIDS.API.Services.EmailService>();
builder.Services.AddScoped<VeriChainIDS.API.Services.ITelegramService, VeriChainIDS.API.Services.TelegramService>();
builder.Services.AddHttpClient<VeriChainIDS.API.Services.IBlockchainService, VeriChainIDS.API.Services.CardanoBlockchainService>();
builder.Services.AddHostedService<VeriChainIDS.API.Services.AlertDigestBackgroundService>();
builder.Services.AddHostedService<VeriChainIDS.API.Services.AgentHealthBackgroundService>();
builder.Services.AddHttpClient();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        // Cho phép localhost + mạng LAN (192.168.x) để VM / máy khác mở Frontend bằng IP vẫn gọi được API
        policy
            .SetIsOriginAllowed(static origin =>
            {
                if (string.IsNullOrEmpty(origin)) return false;
                try
                {
                    var uri = new Uri(origin);
                    var h = uri.Host;
                    if (h is "localhost" or "127.0.0.1" or "localhost") return true;
                    if (h.StartsWith("192.168.", StringComparison.Ordinal)) return true;
                    if (h.StartsWith("10.", StringComparison.Ordinal)) return true;
                    return false;
                }
                catch
                {
                    return false;
                }
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddHealthChecks()
    .AddSqlServer(connectionString, name: "sqlserver");

var app = builder.Build();

// Auto-migrate database on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<VeriChainIDSDbContext>();
    try
    {
        await db.Database.EnsureCreatedAsync();
        await db.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH('Users', 'EmailAlertsEnabled') IS NULL
BEGIN
    ALTER TABLE Users ADD EmailAlertsEnabled BIT NOT NULL CONSTRAINT DF_Users_EmailAlertsEnabled DEFAULT 1;
END;

IF COL_LENGTH('Users', 'TelegramAlertsEnabled') IS NULL
BEGIN
    ALTER TABLE Users ADD TelegramAlertsEnabled BIT NOT NULL CONSTRAINT DF_Users_TelegramAlertsEnabled DEFAULT 0;
END;

IF COL_LENGTH('Users', 'PushNotificationsEnabled') IS NULL
BEGIN
    ALTER TABLE Users ADD PushNotificationsEnabled BIT NOT NULL CONSTRAINT DF_Users_PushNotificationsEnabled DEFAULT 1;
END;

IF COL_LENGTH('Users', 'TelegramChatId') IS NULL
BEGIN
    ALTER TABLE Users ADD TelegramChatId NVARCHAR(100) NULL;
END;

IF COL_LENGTH('Users', 'SessionTimeoutEnabled') IS NULL
BEGIN
    ALTER TABLE Users ADD SessionTimeoutEnabled BIT NOT NULL CONSTRAINT DF_Users_SessionTimeoutEnabled DEFAULT 0;
END;

IF COL_LENGTH('Users', 'SessionTimeoutMinutes') IS NULL
BEGIN
    ALTER TABLE Users ADD SessionTimeoutMinutes INT NOT NULL CONSTRAINT DF_Users_SessionTimeoutMinutes DEFAULT 30;
END;

IF COL_LENGTH('Users', 'AlertSeverityThreshold') IS NULL
BEGIN
    ALTER TABLE Users ADD AlertSeverityThreshold NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_AlertSeverityThreshold DEFAULT 'Medium';
END;

IF COL_LENGTH('Users', 'AlertDigestMode') IS NULL
BEGIN
    ALTER TABLE Users ADD AlertDigestMode NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_AlertDigestMode DEFAULT 'realtime';
END;

-- Tạo bảng AlertDigestQueue nếu chưa tồn tại
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AlertDigestQueue')
BEGIN
    CREATE TABLE AlertDigestQueue (
        Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        UserId UNIQUEIDENTIFIER NOT NULL,
        TelegramChatId NVARCHAR(100) NOT NULL,
        DigestMode NVARCHAR(20) NOT NULL DEFAULT 'hourly',
        AlertId UNIQUEIDENTIFIER NULL,
        Severity NVARCHAR(20) NULL,
        AlertTitle NVARCHAR(500) NULL,
        AlertMessage NVARCHAR(MAX) NULL,
        AlertCreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        IsSent BIT NOT NULL DEFAULT 0,
        SentAt DATETIME2 NULL,
        QueuedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
    -- Thêm FK sau vì Tenant/User có thể chưa tồn tại khi EnsureCreated chạy lần đầu
    ALTER TABLE AlertDigestQueue ADD CONSTRAINT FK_AlertDigestQueue_Tenant FOREIGN KEY (TenantId) REFERENCES Tenants(Id);
    ALTER TABLE AlertDigestQueue ADD CONSTRAINT FK_AlertDigestQueue_User FOREIGN KEY (UserId) REFERENCES Users(Id);
    ALTER TABLE AlertDigestQueue ADD CONSTRAINT FK_AlertDigestQueue_Alert FOREIGN KEY (AlertId) REFERENCES Alerts(Id);
END;
ELSE
BEGIN
    -- Migration: thêm các cột còn thiếu nếu bảng đã tồn tại nhưng thiếu cột
    IF COL_LENGTH('AlertDigestQueue', 'TenantId') IS NULL
        ALTER TABLE AlertDigestQueue ADD TenantId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID();
    IF COL_LENGTH('AlertDigestQueue', 'UserId') IS NULL
        ALTER TABLE AlertDigestQueue ADD UserId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID();
    IF COL_LENGTH('AlertDigestQueue', 'TelegramChatId') IS NULL
        ALTER TABLE AlertDigestQueue ADD TelegramChatId NVARCHAR(100) NOT NULL DEFAULT '';
    IF COL_LENGTH('AlertDigestQueue', 'DigestMode') IS NULL
        ALTER TABLE AlertDigestQueue ADD DigestMode NVARCHAR(20) NOT NULL DEFAULT 'hourly';
    IF COL_LENGTH('AlertDigestQueue', 'AlertId') IS NULL
        ALTER TABLE AlertDigestQueue ADD AlertId UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH('AlertDigestQueue', 'Severity') IS NULL
        ALTER TABLE AlertDigestQueue ADD Severity NVARCHAR(20) NULL;
    IF COL_LENGTH('AlertDigestQueue', 'AlertTitle') IS NULL
        ALTER TABLE AlertDigestQueue ADD AlertTitle NVARCHAR(500) NULL;
    IF COL_LENGTH('AlertDigestQueue', 'AlertMessage') IS NULL
        ALTER TABLE AlertDigestQueue ADD AlertMessage NVARCHAR(MAX) NULL;
    IF COL_LENGTH('AlertDigestQueue', 'AlertCreatedAt') IS NULL
        ALTER TABLE AlertDigestQueue ADD AlertCreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE();
    IF COL_LENGTH('AlertDigestQueue', 'IsSent') IS NULL
        ALTER TABLE AlertDigestQueue ADD IsSent BIT NOT NULL DEFAULT 0;
    IF COL_LENGTH('AlertDigestQueue', 'SentAt') IS NULL
        ALTER TABLE AlertDigestQueue ADD SentAt DATETIME2 NULL;
    IF COL_LENGTH('AlertDigestQueue', 'QueuedAt') IS NULL
        ALTER TABLE AlertDigestQueue ADD QueuedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE();
END;

-- Migration: thêm cột HealthUrl/IsHealthy cho Server (Agent Health Check)
IF COL_LENGTH('Servers', 'HealthUrl') IS NULL
    ALTER TABLE Servers ADD HealthUrl NVARCHAR(500) NULL;
IF COL_LENGTH('Servers', 'LastHealthCheckAt') IS NULL
    ALTER TABLE Servers ADD LastHealthCheckAt DATETIME2 NULL;
IF COL_LENGTH('Servers', 'IsHealthy') IS NULL
    ALTER TABLE Servers ADD IsHealthy BIT NOT NULL DEFAULT 0;

-- Migration: Cardano evidence records
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BlockchainRecords')
BEGIN
    CREATE TABLE BlockchainRecords (
        Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        TenantId UNIQUEIDENTIFIER NOT NULL,
        RecordType NVARCHAR(50) NOT NULL,
        EntityId NVARCHAR(200) NOT NULL,
        DataHash NVARCHAR(64) NOT NULL,
        TxHash NVARCHAR(64) NULL,
        BlockHeight BIGINT NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        Network NVARCHAR(50) NOT NULL DEFAULT 'preprod',
        MetadataLabel NVARCHAR(50) NOT NULL DEFAULT '674',
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        ConfirmedAt DATETIME2 NULL,
        ErrorMessage NVARCHAR(MAX) NULL,
        CONSTRAINT FK_BlockchainRecords_Tenants_TenantId FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
    );
END;
ELSE
BEGIN
    IF COL_LENGTH('BlockchainRecords', 'Network') IS NULL
        ALTER TABLE BlockchainRecords ADD Network NVARCHAR(50) NOT NULL DEFAULT 'preprod';
    IF COL_LENGTH('BlockchainRecords', 'MetadataLabel') IS NULL
        ALTER TABLE BlockchainRecords ADD MetadataLabel NVARCHAR(50) NOT NULL DEFAULT '674';
    IF COL_LENGTH('BlockchainRecords', 'ErrorMessage') IS NULL
        ALTER TABLE BlockchainRecords ADD ErrorMessage NVARCHAR(MAX) NULL;
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_TenantId_CreatedAt' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE INDEX IX_BlockchainRecords_TenantId_CreatedAt ON BlockchainRecords(TenantId, CreatedAt);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_TenantId_Status' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE INDEX IX_BlockchainRecords_TenantId_Status ON BlockchainRecords(TenantId, Status);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_TxHash' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE INDEX IX_BlockchainRecords_TxHash ON BlockchainRecords(TxHash);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_Tenant_Record_Entity' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE UNIQUE INDEX IX_BlockchainRecords_Tenant_Record_Entity ON BlockchainRecords(TenantId, RecordType, EntityId);
");
        Console.WriteLine("Database connected successfully!");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database connection failed: {ex.Message}");
    }
}

app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "VeriChainIDS API v1");
    c.RoutePrefix = "swagger";
});

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();
app.UseApiKeyAuth(); // Middleware kiểm tra API Key cho Agent

app.MapControllers();
app.MapHub<AlertHub>("/hubs/alerts");
app.MapHub<AgentHub>("/hubs/agents");
app.MapHealthChecks("/health");
app.MapHealthChecks("/api/health");

app.MapGet("/", () => new
{
    name = "VeriChainIDS SOC API",
    version = "1.0.0",
    status = "running",
    docs = "/swagger",
    health = "/health"
});

Console.WriteLine("VeriChainIDS API listening on http://localhost:5000 (LAN + localhost)");

app.Run();
