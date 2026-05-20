using Microsoft.AspNetCore.Identity;

namespace MediTrack.Models;

/// <summary>
/// Extends ASP.NET Core Identity's built-in user.
/// Replaces Firebase Auth user object.
/// </summary>
public class ApplicationUser : IdentityUser
{
    public UserProfile? Profile { get; set; }
    public ICollection<Medicine> Medicines { get; set; } = [];
}
