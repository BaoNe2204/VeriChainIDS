// ============================================
// Tool tạo BCrypt Password Hash
// Chạy: dotnet script GeneratePasswordHash.cs
// Hoặc copy code này vào Program.cs tạm để chạy
// ============================================

using System;

class Program
{
    static void Main()
    {
        // Mật khẩu cần hash
        string password = "1";
        
        // Tạo BCrypt hash (workFactor = 11)
        string hash = BCrypt.Net.BCrypt.HashPassword(password, 11);
        
        Console.WriteLine("===========================================");
        Console.WriteLine("BCrypt Password Hash Generator");
        Console.WriteLine("===========================================");
        Console.WriteLine($"Password: {password}");
        Console.WriteLine($"Hash: {hash}");
        Console.WriteLine("===========================================");
        Console.WriteLine();
        Console.WriteLine("Copy hash này vào file SQL:");
        Console.WriteLine($"DECLARE @PasswordHash NVARCHAR(500) = '{hash}';");
    }
}
