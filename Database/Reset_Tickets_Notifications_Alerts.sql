-- ============================================================================
-- RESET: Tickets, Notifications, Alerts (Trung tâm Sự cố)
-- Chạy script này để xóa sạch dữ liệu các bảng liên quan
-- ============================================================================

USE [VeriChainIDS];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '================================================================';
PRINT ' RESET: Tickets, Notifications, Alerts (Trung tâm Sự cố)';
PRINT ' Started at: ' + CONVERT(VARCHAR(30), GETDATE(), 121);
PRINT '================================================================';
PRINT '';

BEGIN TRY
    BEGIN TRANSACTION;

    -- ============================================================
    -- 1. QUẢN LÝ TICKET
    -- ============================================================
    PRINT '>>> [1/3] Reset Tickets...';

    DECLARE @TicketCount INT;
    DECLARE @CommentCount INT;

    -- Đếm trước
    SELECT @TicketCount = COUNT(*) FROM [dbo].[Tickets];
    SELECT @CommentCount = COUNT(*) FROM [dbo].[TicketComments];

    -- Xóa TicketComments trước (FK -> Tickets)
    DELETE FROM [dbo].[TicketComments];
    PRINT '    [OK] Deleted ' + CAST(@CommentCount AS VARCHAR(20)) + ' TicketComments';

    -- Xóa Tickets
    DELETE FROM [dbo].[Tickets];
    PRINT '    [OK] Deleted ' + CAST(@TicketCount AS VARCHAR(20)) + ' Tickets';

    -- Reset identity seed (nếu cần)
    -- DBCC CHECKIDENT ('[dbo].[Tickets]', RESEED, 0);
    -- DBCC CHECKIDENT ('[dbo].[TicketComments]', RESEED, 0);

    PRINT '';
    PRINT '>>> [2/3] Reset Notifications...';

    -- ============================================================
    -- 2. THÔNG BÁO
    -- ============================================================
    DECLARE @NotifCount INT;
    SELECT @NotifCount = COUNT(*) FROM [dbo].[Notifications];

    DELETE FROM [dbo].[Notifications];
    PRINT '    [OK] Deleted ' + CAST(@NotifCount AS VARCHAR(20)) + ' Notifications';

    -- DBCC CHECKIDENT ('[dbo].[Notifications]', RESEED, 0);

    PRINT '';
    PRINT '>>> [3/3] Reset Trung tâm Sự cố (Alerts)...';

    -- ============================================================
    -- 3. TRUNG TÂM SỰ CỐ (Alerts)
    --    Lưu ý: Alerts có FK -> Servers, Tickets có FK -> Alerts
    --    Thứ tự xóa: Alerts trước (vì Ticket.AlertId có ON DELETE SET NULL)
    -- ============================================================
    DECLARE @AlertCount INT;
    DECLARE @DigestCount INT;
    SELECT @AlertCount = COUNT(*) FROM [dbo].[Alerts];
    SELECT @DigestCount = COUNT(*) FROM [dbo].[AlertDigestQueue];

    -- AlertDigestQueue phụ thuộc Alerts (ON DELETE SET NULL trên AlertId)
    -- Xóa trước khi xóa Alerts để tránh orphan
    DELETE FROM [dbo].[AlertDigestQueue];
    PRINT '    [OK] Deleted ' + CAST(@DigestCount AS VARCHAR(20)) + ' AlertDigestQueue records';

    DELETE FROM [dbo].[Alerts];
    PRINT '    [OK] Deleted ' + CAST(@AlertCount AS VARCHAR(20)) + ' Alerts';

    -- DBCC CHECKIDENT ('[dbo].[Alerts]', RESEED, 0);
    -- DBCC CHECKIDENT ('[dbo].[AlertDigestQueue]', RESEED, 0);

    COMMIT TRANSACTION;

    PRINT '';
    PRINT '================================================================';
    PRINT ' SUCCESS! Reset hoàn tất.';
    PRINT '================================================================';
    PRINT '';
    PRINT 'Tong so ban ghi da xoa:';
    PRINT '  - Tickets:          ' + CAST(ISNULL(@TicketCount,0) AS VARCHAR(20));
    PRINT '  - TicketComments:   ' + CAST(ISNULL(@CommentCount,0) AS VARCHAR(20));
    PRINT '  - Notifications:    ' + CAST(ISNULL(@NotifCount,0) AS VARCHAR(20));
    PRINT '  - AlertDigestQueue: ' + CAST(ISNULL(@DigestCount,0) AS VARCHAR(20));
    PRINT '  - Alerts:           ' + CAST(ISNULL(@AlertCount,0) AS VARCHAR(20));
    PRINT '';
    PRINT 'Cac bang con lai (Servers, Users, TrafficLogs, BlockedIPs,';
    PRINT 'Whitelists, ApiKeys, AuditLogs...) KHONG bi xoa.';
    PRINT '';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrSev INT = ERROR_SEVERITY();
    DECLARE @ErrState INT = ERROR_STATE();

    PRINT '';
    PRINT '[ERROR] ' + @ErrMsg;
    RAISERROR(@ErrMsg, @ErrSev, @ErrState);
END CATCH
GO

-- ============================================================================
-- BONUS: Xem so luong ban ghi hien tai
-- ============================================================================
PRINT '';
PRINT '=== CURRENT RECORD COUNTS ===';
SELECT 'Tickets' AS TableName, COUNT(*) AS RecordCount FROM [dbo].[Tickets]
UNION ALL
SELECT 'TicketComments', COUNT(*) FROM [dbo].[TicketComments]
UNION ALL
SELECT 'Notifications', COUNT(*) FROM [dbo].[Notifications]
UNION ALL
SELECT 'Alerts', COUNT(*) FROM [dbo].[Alerts]
UNION ALL
SELECT 'AlertDigestQueue', COUNT(*) FROM [dbo].[AlertDigestQueue]
ORDER BY RecordCount DESC;
GO
