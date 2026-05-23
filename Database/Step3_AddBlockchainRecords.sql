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
        CONSTRAINT FK_BlockchainRecords_Tenants_TenantId
            FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_TenantId_CreatedAt' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE INDEX IX_BlockchainRecords_TenantId_CreatedAt ON BlockchainRecords(TenantId, CreatedAt);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_TenantId_Status' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE INDEX IX_BlockchainRecords_TenantId_Status ON BlockchainRecords(TenantId, Status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_TxHash' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE INDEX IX_BlockchainRecords_TxHash ON BlockchainRecords(TxHash);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BlockchainRecords_Tenant_Record_Entity' AND object_id = OBJECT_ID('BlockchainRecords'))
    CREATE UNIQUE INDEX IX_BlockchainRecords_Tenant_Record_Entity ON BlockchainRecords(TenantId, RecordType, EntityId);
