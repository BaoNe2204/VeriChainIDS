-- ============================================================================
-- RESET: TrafficLogs - Xóa toàn bộ log traffic (209 triệu records)
-- CẢNH BÁO: Đây là dữ liệu lớn, có thể mất thời gian
-- ============================================================================

USE [VeriChainIDS];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '================================================================';
PRINT ' RESET: TrafficLogs';
PRINT ' Started at: ' + CONVERT(VARCHAR(30), GETDATE(), 121);
PRINT '================================================================';
PRINT '';

BEGIN TRY
    BEGIN TRANSACTION;

    -- ============================================================
    -- Đếm trước
    -- ============================================================
    DECLARE @LogCount BIGINT;
    SELECT @LogCount = COUNT(*) FROM [dbo].[TrafficLogs];
    PRINT 'So ban ghi TrafficLogs hien tai: ' + CAST(@LogCount AS VARCHAR(30));

    -- Xóa toàn bộ TrafficLogs
    TRUNCATE TABLE [dbo].[TrafficLogs];
    PRINT '[OK] Da xoa toan bo TrafficLogs bang TRUNCATE (nhanh hon DELETE)';

    -- Reset identity ve 1
    DBCC CHECKIDENT ('[dbo].[TrafficLogs]', RESEED, 1);
    PRINT '[OK] Identity seed da reset ve 1';

    COMMIT TRANSACTION;

    PRINT '';
    PRINT '================================================================';
    PRINT ' SUCCESS! Da xoa ' + CAST(@LogCount AS VARCHAR(30)) + ' TrafficLogs.';
    PRINT ' Finished at: ' + CONVERT(VARCHAR(30), GETDATE(), 121);
    PRINT '================================================================';

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
-- BONUS: Reset Tat Ca Bang Logs cung luc
-- ============================================================================
PRINT '';
PRINT '=== RESET ALL LOGS (TrafficLogs + Alerts + Tickets + Notifications) ===';
PRINT '';

USE [VeriChainIDS];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT 'Dang dem so luong ban ghi...';

    DECLARE @T BIGINT, @A BIGINT, @Ti BIGINT, @TiC BIGINT, @N BIGINT, @D BIGINT;

    SELECT @T = COUNT(*) FROM TrafficLogs;
    SELECT @A = COUNT(*) FROM Alerts;
    SELECT @Ti = COUNT(*) FROM Tickets;
    SELECT @TiC = COUNT(*) FROM TicketComments;
    SELECT @N = COUNT(*) FROM Notifications;
    SELECT @D = COUNT(*) FROM AlertDigestQueue;

    PRINT '  TrafficLogs:       ' + CAST(@T AS VARCHAR(30));
    PRINT '  Alerts:            ' + CAST(@A AS VARCHAR(30));
    PRINT '  Tickets:           ' + CAST(@Ti AS VARCHAR(30));
    PRINT '  TicketComments:    ' + CAST(@TiC AS VARCHAR(30));
    PRINT '  Notifications:     ' + CAST(@N AS VARCHAR(30));
    PRINT '  AlertDigestQueue:  ' + CAST(@D AS VARCHAR(30));

    PRINT '';
    PRINT 'Dang xoa...';

    TRUNCATE TABLE TrafficLogs;
    DBCC CHECKIDENT ('TrafficLogs', RESEED, 1) WITH NO_INFOMSGS;
    PRINT '  [OK] TrafficLogs da xoa (TRUNCATE)';

    DELETE FROM AlertDigestQueue;
    DELETE FROM Alerts;
    DELETE FROM TicketComments;
    DELETE FROM Tickets;
    DELETE FROM Notifications;
    PRINT '  [OK] Alerts, Tickets, Notifications, AlertDigestQueue da xoa';

    COMMIT TRANSACTION;

    PRINT '';
    PRINT '================================================================';
    PRINT ' SUCCESS! Tat ca logs da duoc xoa sach.';
    PRINT '================================================================';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @E NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT '[ERROR] ' + @E;
    RAISERROR(@E, ERROR_SEVERITY(), ERROR_STATE());
END CATCH
GO

-- ============================================================================
-- Kiem tra ket qua
-- ============================================================================
PRINT '';
PRINT '=== KET QUA SAU RESET ===';
SELECT 'TrafficLogs' AS Bang, COUNT(*) AS SoBanGhi FROM TrafficLogs
UNION ALL SELECT 'Alerts', COUNT(*) FROM Alerts
UNION ALL SELECT 'Tickets', COUNT(*) FROM Tickets
UNION ALL SELECT 'Notifications', COUNT(*) FROM Notifications
UNION ALL SELECT 'AlertDigestQueue', COUNT(*) FROM AlertDigestQueue
UNION ALL SELECT 'TicketComments', COUNT(*) FROM TicketComments
ORDER BY SoBanGhi DESC;
GO
