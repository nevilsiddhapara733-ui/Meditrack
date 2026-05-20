using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MediTrack.Models;

/// <summary>
/// Pharmacy medicine/inventory item.
/// Replaces Firestore: users/{uid}/medicines/{docId}
/// Image stored as base64 string in DB (same as original Firebase approach).
/// </summary>
public class Medicine
{
    public int Id { get; set; }

    [Required]
    public string UserId { get; set; } = string.Empty;

    [ForeignKey(nameof(UserId))]
    public ApplicationUser? User { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Batch { get; set; } = string.Empty;

    [Required]
    public int Qty { get; set; }

    [Required]
    public DateOnly Expiry { get; set; }

    [Required, MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    [MaxLength(150)]
    public string Supplier { get; set; } = string.Empty;

    /// <summary>Base64 data URI — same format as original Firebase project.</summary>
    public string? Image { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
