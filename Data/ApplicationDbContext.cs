using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using MediTrack.Models;

namespace MediTrack.Data;

/// <summary>
/// Entity Framework Core database context.
/// Replaces Firebase Firestore entirely.
/// Inherits IdentityDbContext to include ASP.NET Core Identity tables.
/// </summary>
public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options) { }

    public DbSet<Medicine>    Medicines    { get; set; }
    public DbSet<UserProfile> UserProfiles { get; set; }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // One user → one profile
        builder.Entity<UserProfile>()
            .HasOne(p => p.User)
            .WithOne(u => u.Profile)
            .HasForeignKey<UserProfile>(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // One user → many medicines
        builder.Entity<Medicine>()
            .HasOne(m => m.User)
            .WithMany(u => u.Medicines)
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Index for fast per-user medicine queries
        builder.Entity<Medicine>()
            .HasIndex(m => new { m.UserId, m.CreatedAt });
    }
}
