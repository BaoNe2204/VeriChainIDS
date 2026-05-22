using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VeriChainIDS.API.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueIndex_BlockedIPs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<decimal>(
                name: "AnomalyScore",
                table: "BlockedIPs",
                type: "decimal(5,4)",
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "decimal(18,2)",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BlockedIPs_Tenant_Server_Ip",
                table: "BlockedIPs",
                columns: new[] { "TenantId", "ServerId", "IpAddress" },
                unique: true,
                filter: "IsActive = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BlockedIPs_Tenant_Server_Ip",
                table: "BlockedIPs");

            migrationBuilder.AlterColumn<decimal>(
                name: "AnomalyScore",
                table: "BlockedIPs",
                type: "decimal(18,2)",
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "decimal(5,4)",
                oldNullable: true);
        }
    }
}
