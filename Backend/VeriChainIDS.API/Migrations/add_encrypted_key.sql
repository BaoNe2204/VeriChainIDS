-- Manual migration to add EncryptedKey column to ApiKeys table
ALTER TABLE [ApiKeys] ADD [EncryptedKey] nvarchar(max) NULL;
