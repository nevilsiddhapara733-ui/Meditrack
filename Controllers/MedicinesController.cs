using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MediTrack.Data;
using MediTrack.Models;

namespace MediTrack.Controllers;

[ApiController]
[Route("api/medicines")]
[Authorize]
public class MedicinesController : ControllerBase
{
    private readonly ApplicationDbContext         _db;
    private readonly UserManager<ApplicationUser> _users;

    public MedicinesController(ApplicationDbContext db, UserManager<ApplicationUser> users)
    {
        _db    = db;
        _users = users;
    }

    private string UserId => _users.GetUserId(User)!;

    // GET /api/medicines
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var list = await _db.Medicines
                .Where(m => m.UserId == UserId)
                .OrderByDescending(m => m.CreatedAt)
                .Select(m => new MedicineDto(
                    m.Id.ToString(), m.Name, m.Batch, m.Qty,
                    m.Expiry.ToString("yyyy-MM-dd"), m.Category,
                    m.Supplier, m.Image, m.CreatedAt))
                .ToListAsync();

            return Ok(list);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Could not load medicines: " + ex.Message });
        }
    }

    // POST /api/medicines
    // FIX: DisableRequestSizeLimit allows large base64 images (5–15MB JSON body)
    [HttpPost]
    [DisableRequestSizeLimit]
    [RequestFormLimits(MultipartBodyLengthLimit = long.MaxValue, ValueLengthLimit = int.MaxValue)]
    public async Task<IActionResult> Create([FromBody] MedicineInputDto dto)
    {
        // FIX: Wrap everything in try-catch so errors return JSON, not HTML
        try
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(new { message = string.Join(", ", errors) });
            }

            // FIX: Validate date format properly
            if (!DateOnly.TryParse(dto.Expiry, out var expiryDate))
                return BadRequest(new { message = "Invalid expiry date format. Use YYYY-MM-DD." });

            var med = new Medicine
            {
                UserId   = UserId,
                Name     = dto.Name.Trim(),
                Batch    = dto.Batch.Trim(),
                Qty      = dto.Qty,
                Expiry   = expiryDate,
                Category = dto.Category,
                Supplier = dto.Supplier?.Trim() ?? string.Empty,
                Image    = dto.Image   // optional — can be null
            };

            _db.Medicines.Add(med);
            await _db.SaveChangesAsync();

            return Ok(new MedicineDto(
                med.Id.ToString(), med.Name, med.Batch, med.Qty,
                med.Expiry.ToString("yyyy-MM-dd"), med.Category,
                med.Supplier, med.Image, med.CreatedAt));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Failed to save medicine: " + ex.Message });
        }
    }

    // PUT /api/medicines/{id}
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] MedicineUpdateDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage)
                    .ToList();
                return BadRequest(new { message = string.Join(", ", errors) });
            }

            var med = await _db.Medicines
                .FirstOrDefaultAsync(m => m.Id == id && m.UserId == UserId);

            if (med is null) return NotFound(new { message = "Medicine not found." });

            if (!DateOnly.TryParse(dto.Expiry, out var expiryDate))
                return BadRequest(new { message = "Invalid expiry date format." });

            med.Name     = dto.Name.Trim();
            med.Batch    = dto.Batch.Trim();
            med.Qty      = dto.Qty;
            med.Expiry   = expiryDate;
            med.Category = dto.Category;
            med.Supplier = dto.Supplier?.Trim() ?? med.Supplier;

            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Failed to update medicine: " + ex.Message });
        }
    }

    // DELETE /api/medicines/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var med = await _db.Medicines
                .FirstOrDefaultAsync(m => m.Id == id && m.UserId == UserId);

            if (med is null) return NotFound(new { message = "Medicine not found." });

            _db.Medicines.Remove(med);
            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Failed to delete medicine: " + ex.Message });
        }
    }
}

// DTOs — using classes (not records) so [Required] works properly with model validation
// Records with primary constructor params ignore [property:] validation attributes in ASP.NET Core

public class MedicineDto
{
    public string    Id         { get; set; } = string.Empty;
    public string    Name       { get; set; } = string.Empty;
    public string    Batch      { get; set; } = string.Empty;
    public int       Qty        { get; set; }
    public string    Expiry     { get; set; } = string.Empty;
    public string    Category   { get; set; } = string.Empty;
    public string    Supplier   { get; set; } = string.Empty;
    public string?   Image      { get; set; }
    public DateTime  CreatedAt  { get; set; }

    public MedicineDto() { }
    public MedicineDto(string id, string name, string batch, int qty, string expiry,
                       string category, string supplier, string? image, DateTime createdAt)
    {
        Id = id; Name = name; Batch = batch; Qty = qty; Expiry = expiry;
        Category = category; Supplier = supplier; Image = image; CreatedAt = createdAt;
    }
}

public class MedicineInputDto
{
    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Medicine name is required.")]
    public string  Name     { get; set; } = string.Empty;

    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Batch number is required.")]
    public string  Batch    { get; set; } = string.Empty;

    [System.ComponentModel.DataAnnotations.Range(1, int.MaxValue, ErrorMessage = "Quantity must be at least 1.")]
    public int     Qty      { get; set; }

    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Expiry date is required.")]
    public string  Expiry   { get; set; } = string.Empty;

    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Category is required.")]
    public string  Category { get; set; } = string.Empty;

    public string? Supplier { get; set; }
    public string? Image    { get; set; }  // optional
}

public class MedicineUpdateDto
{
    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Medicine name is required.")]
    public string  Name     { get; set; } = string.Empty;

    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Batch number is required.")]
    public string  Batch    { get; set; } = string.Empty;

    [System.ComponentModel.DataAnnotations.Range(1, int.MaxValue, ErrorMessage = "Quantity must be at least 1.")]
    public int     Qty      { get; set; }

    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Expiry date is required.")]
    public string  Expiry   { get; set; } = string.Empty;

    [System.ComponentModel.DataAnnotations.Required(ErrorMessage = "Category is required.")]
    public string  Category { get; set; } = string.Empty;

    public string? Supplier { get; set; }
}
