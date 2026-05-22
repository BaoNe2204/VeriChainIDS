using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DownloadController : ControllerBase
{
    private readonly ILogger<DownloadController> _logger;
    private readonly IWebHostEnvironment _env;

    public DownloadController(ILogger<DownloadController> logger, IWebHostEnvironment env)
    {
        _logger = logger;
        _env = env;
    }

    /// <summary>
    /// Kiểm tra trạng thái Agent - có tồn tại không, size bao nhiêu
    /// </summary>
    [HttpGet("agent-status")]
    [AllowAnonymous]
    public IActionResult GetAgentStatus()
    {
        var (agentPath, isZip) = GetAgentPathWithType();
        if (System.IO.File.Exists(agentPath))
        {
            var fileInfo = new System.IO.FileInfo(agentPath);
            return Ok(new
            {
                exists = true,
                sizeBytes = fileInfo.Length,
                sizeMB = Math.Round(fileInfo.Length / (double)(1024 * 1024), 2),
                lastModified = fileInfo.LastWriteTimeUtc,
                version = "v1.0.0",
                path = agentPath,
                type = isZip ? "zip" : "exe"
            });
        }

        return Ok(new
        {
            exists = false,
            message = "Agent chưa được build. Chạy script build để tạo file ZIP.",
            buildScript = "Agent/Agent_build_exe/build.bat",
            instructions = new[]
            {
                "Mở CMD hoặc PowerShell (Admin)",
                "cd Agent/Agent_build_exe",
                "build.bat",
                "File ZIP sẽ được tạo tại dist/VeriChainIDSAgent.zip"
            }
        });
    }

    /// <summary>
    /// Download VeriChainIDS Agent (.zip hoặc .exe)
    /// </summary>
    [HttpGet("agent")]
    [AllowAnonymous]
    public IActionResult DownloadAgent()
    {
        var (agentPath, isZip) = GetAgentPathWithType();
        try
        {
            if (!System.IO.File.Exists(agentPath))
            {
                return NotFound(new
                {
                    success = false,
                    message = "Agent chưa được build. Chạy Agent/Agent_build_exe/build.bat để tạo file ZIP.",
                    hint = "cd Agent\\Agent_build_exe && build.bat"
                });
            }

            var fileBytes = System.IO.File.ReadAllBytes(agentPath);
            var fileName = isZip ? "VeriChainIDSAgent.zip" : "VeriChainIDSAgent.exe";
            var contentType = isZip ? "application/zip" : "application/vnd.microsoft.portable-executable";
            _logger.LogInformation("[DOWNLOAD] Agent downloaded: {FileName} ({Size} bytes)", fileName, fileBytes.Length);
            return File(fileBytes, contentType, fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi tải Agent");
            return StatusCode(500, new { success = false, message = "Lỗi hệ thống", error = ex.Message });
        }
    }

    /// <summary>
    /// Debug: kiểm tra đường dẫn agent
    /// </summary>
    [HttpGet("debug-paths")]
    [AllowAnonymous]
    public IActionResult DebugPaths()
    {
        var apiPath = _env.ContentRootPath;
        // Agent cùng cấp với Backend: Backend/.. = root -> Agent
        var rootDir = Path.GetFullPath(Path.Combine(apiPath, "..", ".."));
        var distDir = Path.Combine(rootDir, "Agent", "Agent_build_exe", "dist");
        var exePath = Path.Combine(distDir, "VeriChainIDSAgent.exe");
        var zipPath = Path.Combine(distDir, "VeriChainIDSAgent.zip");
        return Ok(new
        {
            contentRoot = apiPath,
            rootDir = rootDir,
            distDir = distDir,
            distDirExists = Directory.Exists(distDir),
            exeExists = System.IO.File.Exists(exePath),
            zipExists = System.IO.File.Exists(zipPath),
        });
    }

    private (string path, bool isZip) GetAgentPathWithType()
    {
        // Agent cùng cấp với Backend: Backend/.. = root -> Agent
        var apiPath = _env.ContentRootPath;
        var rootDir = Path.GetFullPath(Path.Combine(apiPath, "..", ".."));
        var distDir = Path.Combine(rootDir, "Agent", "Agent_build_exe", "dist");

        var zipPath = Path.Combine(distDir, "VeriChainIDSAgent.zip");
        var exePath = Path.Combine(distDir, "VeriChainIDSAgent.exe");

        if (System.IO.File.Exists(zipPath))
            return (zipPath, true);
        if (System.IO.File.Exists(exePath))
            return (exePath, false);
        return (zipPath, true);
    }
}
