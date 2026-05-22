using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VeriChainIDS.API.Migrations
{
    /// <inheritdoc />
    public partial class AddIsActiveToWhitelist : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Whitelists",
                type: "bit",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Whitelists");
        }
    }
}
