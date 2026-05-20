using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using MediTrack.Models;

namespace MediTrack.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser>  _users;
    private readonly SignInManager<ApplicationUser> _signIn;

    public AuthController(UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn)
    {
        _users  = users;
        _signIn = signIn;
    }

    // GET /api/auth/me
    [HttpGet("me")]
    public IActionResult Me()
    {
        if (!User.Identity?.IsAuthenticated ?? true)
            return Unauthorized(new { authenticated = false });

        return Ok(new { authenticated = true, email = User.Identity!.Name });
    }

    // POST /api/auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        try
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
                return BadRequest(new { message = "Email and password are required." });

            var result = await _signIn.PasswordSignInAsync(
                dto.Email.ToLower(), dto.Password, isPersistent: true, lockoutOnFailure: false);

            if (result.Succeeded)
            {
                var user = await _users.FindByEmailAsync(dto.Email.ToLower());
                return Ok(new { success = true, email = user!.Email });
            }

            return BadRequest(new { message = "Invalid email or password." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Login failed: " + ex.Message });
        }
    }

    // POST /api/auth/register
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        try
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
                return BadRequest(new { message = "Email and password are required." });

            if (dto.Password != dto.ConfirmPassword)
                return BadRequest(new { message = "Passwords do not match." });

            var existing = await _users.FindByEmailAsync(dto.Email.ToLower());
            if (existing != null)
                return BadRequest(new { message = "An account with this email already exists." });

            var user   = new ApplicationUser { UserName = dto.Email.ToLower(), Email = dto.Email.ToLower() };
            var result = await _users.CreateAsync(user, dto.Password);

            if (result.Succeeded)
            {
                await _signIn.SignInAsync(user, isPersistent: true);
                return Ok(new { success = true, email = user.Email });
            }

            var firstError = result.Errors.FirstOrDefault()?.Description ?? "Registration failed.";
            return BadRequest(new { message = firstError });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Registration failed: " + ex.Message });
        }
    }

    // POST /api/auth/logout
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _signIn.SignOutAsync();
        return Ok(new { success = true });
    }
}

public class LoginDto
{
    public string Email    { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class RegisterDto
{
    public string Email           { get; set; } = string.Empty;
    public string Password        { get; set; } = string.Empty;
    public string ConfirmPassword { get; set; } = string.Empty;
}
