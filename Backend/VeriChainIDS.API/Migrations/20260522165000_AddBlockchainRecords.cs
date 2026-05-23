using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VeriChainIDS.API.Migrations
{
    public partial class AddBlockchainRecords : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BlockchainRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWID()"),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EntityId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DataHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TxHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    BlockHeight = table.Column<long>(type: "bigint", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "Pending"),
                    Network = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false, defaultValue: "preprod"),
                    MetadataLabel = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false, defaultValue: "674"),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    ConfirmedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ErrorMessage = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BlockchainRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BlockchainRecords_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BlockchainRecords_Tenant_Record_Entity",
                table: "BlockchainRecords",
                columns: new[] { "TenantId", "RecordType", "EntityId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BlockchainRecords_TenantId_CreatedAt",
                table: "BlockchainRecords",
                columns: new[] { "TenantId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BlockchainRecords_TenantId_Status",
                table: "BlockchainRecords",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_BlockchainRecords_TxHash",
                table: "BlockchainRecords",
                column: "TxHash");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "BlockchainRecords");
        }
    }
}
