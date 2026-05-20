using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MediTrack.Data;
using MediTrack.Models;

namespace MediTrack.Controllers;

[ApiController]
[Route("api/profile")]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly ApplicationDbContext         _db;
    private readonly UserManager<ApplicationUser> _users;

    public ProfileController(ApplicationDbContext db, UserManager<ApplicationUser> users)
    {
        _db    = db;
        _users = users;
    }

    private string UserId => _users.GetUserId(User)!;

    // GET /api/profile
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        try
        {
            var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == UserId);
            if (profile is null) return NotFound(new { exists = false });

            return Ok(new ProfileDto
            {
                Name     = profile.Name,
                ShopName = profile.ShopName,
                Phone    = profile.Phone,
                ShopType = profile.ShopType,
                Address  = profile.Address,
                Gst      = profile.Gst
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Could not load profile: " + ex.Message });
        }
    }

    // POST /api/profile  (first-time setup)
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ProfileDto dto)
    {
        try
        {
            if (dto == null) return BadRequest(new { message = "Profile data is required." });

            var existing = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == UserId);
            if (existing != null)
                return BadRequest(new { message = "Profile already exists. Use PUT to update." });

            var profile = new UserProfile
            {
                UserId   = UserId,
                Name     = dto.Name?.Trim()     ?? "",
                ShopName = dto.ShopName?.Trim() ?? "",
                Phone    = dto.Phone?.Trim()    ?? "",
                ShopType = dto.ShopType?.Trim() ?? "",
                Address  = dto.Address?.Trim()  ?? "",
                Gst      = dto.Gst?.Trim()      ?? ""
            };

            _db.UserProfiles.Add(profile);
            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Could not save profile: " + ex.Message });
        }
    }

    // PUT /api/profile  (update)
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] ProfileDto dto)
    {
        try
        {
            if (dto == null) return BadRequest(new { message = "Profile data is required." });

            var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == UserId);
            if (profile is null) return NotFound(new { message = "Profile not found." });

            profile.Name     = dto.Name?.Trim()     ?? "";
            profile.ShopName = dto.ShopName?.Trim() ?? "";
            profile.Phone    = dto.Phone?.Trim()    ?? "";
            profile.ShopType = dto.ShopType?.Trim() ?? "";
            profile.Address  = dto.Address?.Trim()  ?? "";
            profile.Gst      = dto.Gst?.Trim()      ?? "";

            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Could not update profile: " + ex.Message });
        }
    }
}

public class ProfileDto
{
    public string  Name     { get; set; } = string.Empty;
    public string  ShopName { get; set; } = string.Empty;
    public string  Phone    { get; set; } = string.Empty;
    public string  ShopType { get; set; } = string.Empty;
    public string? Address  { get; set; }
    public string? Gst      { get; set; }
}
