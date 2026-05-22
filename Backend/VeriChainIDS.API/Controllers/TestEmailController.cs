using VeriChainIDS.API.Services;
using Microsoft.AspNetCore.Mvc;

namespace VeriChainIDS.API.Controllers;

[ApiController]
[Route("api/test-email")]
public class TestEmailController : ControllerBase
{
    private readonly IEmailService _emailService;
    private readonly ILogger<TestEmailController> _logger;

    public TestEmailController(IEmailService emailService, ILogger<TestEmailController> logger)
    {
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>
    /// Test gửi email đơn giản để kiểm tra SMTP config
    /// GET /api/test-email?to=your-email@gmail.com
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> TestEmail([FromQuery] string to)
    {
        if (string.IsNullOrEmpty(to))
            return BadRequest("Missing 'to' parameter. Example: /api/test-email?to=your-email@gmail.com");

        try
        {
            _logger.LogInformation("Testing email send to {Email}", to);
            
            await _emailService.SendWelcomeEmailAsync(to, "Test Company", "Trial Plan");
            
            return Ok(new
            {
                success = true,
                message = $"Email sent successfully to {to}. Check your inbox (and spam folder).",
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Email test failed");
            return StatusCode(500, new
            {
                success = false,
                message = "Email send failed. Check logs for details.",
                error = ex.Message,
                innerError = ex.InnerException?.Message
            });
        }
    }
}
