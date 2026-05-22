using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VeriChainIDS.API.Migrations
{
    /// <inheritdoc />
    public partial class AddServerIdToWhitelists : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ServerId",
                table: "Whitelists",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Whitelists_ServerId",
                table: "Whitelists",
                column: "ServerId");

            migrationBuilder.CreateIndex(
                name: "IX_Whitelists_TenantId_ServerId_IpAddress",
                table: "Whitelists",
                columns: new[] { "TenantId", "ServerId", "IpAddress" },
                unique: true,
                filter: "[TenantId] IS NOT NULL AND [ServerId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Whitelists_Servers_ServerId",
                table: "Whitelists",
                column: "ServerId",
                principalTable: "Servers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Whitelists_Tenants_TenantId",
                table: "Whitelists",
                column: "TenantId",
                principalTable: "Tenants",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Whitelists_Servers_ServerId",
                table: "Whitelists");

            migrationBuilder.DropForeignKey(
                name: "FK_Whitelists_Tenants_TenantId",
                table: "Whitelists");

            migrationBuilder.DropIndex(
                name: "IX_Whitelists_ServerId",
                table: "Whitelists");

            migrationBuilder.DropIndex(
                name: "IX_Whitelists_TenantId_ServerId_IpAddress",
                table: "Whitelists");

            migrationBuilder.DropColumn(
                name: "ServerId",
                table: "Whitelists");
        }
    }
}
