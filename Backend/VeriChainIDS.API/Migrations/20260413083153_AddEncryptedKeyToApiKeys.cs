using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VeriChainIDS.API.Migrations
{
    /// <inheritdoc />
    public partial class AddEncryptedKeyToApiKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HealthUrl",
                table: "Servers",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsHealthy",
                table: "Servers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastHealthCheckAt",
                table: "Servers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EncryptedKey",
                table: "ApiKeys",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HealthUrl",
                table: "Servers");

            migrationBuilder.DropColumn(
                name: "IsHealthy",
                table: "Servers");

            migrationBuilder.DropColumn(
                name: "LastHealthCheckAt",
                table: "Servers");

            migrationBuilder.DropColumn(
                name: "EncryptedKey",
                table: "ApiKeys");
        }
    }
}
