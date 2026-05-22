-- ============================================================================
-- STEP 1: Create Database
-- Chạy file này TRƯỚC TIÊN
-- ============================================================================

SET NOCOUNT ON;

PRINT '================================================================';
PRINT ' Creating VeriChainIDS Database';
PRINT '================================================================';

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'VeriChainIDS')
BEGIN
    CREATE DATABASE [VeriChainIDS];
    PRINT '[OK] Database VeriChainIDS created successfully.';
END
ELSE
BEGIN
    PRINT '[INFO] Database VeriChainIDS already exists. Skipping creation.';
END

PRINT '';
PRINT '================================================================';
PRINT ' Step 1 COMPLETE';
PRINT ' Now run: VeriChainIDS_CreateTables.sql';
PRINT '================================================================';
