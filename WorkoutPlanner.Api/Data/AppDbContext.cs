using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Data;

public class AppDbContext : IdentityDbContext<IdentityUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<SavedPlan> SavedPlans { get; set; } = null!;
    public DbSet<Exercise> Exercises { get; set; } = null!;
    public DbSet<EquipmentOption> EquipmentOptions { get; set; } = null!;
    public DbSet<AdminUser> AdminUsers { get; set; } = null!;
    public DbSet<WorkoutSession> WorkoutSessions { get; set; } = null!;
    public DbSet<CompletedExercise> CompletedExercises { get; set; } = null!;
    public DbSet<CompletedSet> CompletedSets { get; set; } = null!;
    public DbSet<UserPreference> UserPreferences { get; set; } = null!;
    public DbSet<UserFavoriteExercise> UserFavoriteExercises { get; set; } = null!;
    public DbSet<UserExerciseNote> UserExerciseNotes { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<SavedPlan>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.PlanJson).HasColumnType("TEXT");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => e.UserId);
        });

        builder.Entity<Exercise>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(100);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Level).HasMaxLength(50);
            entity.Property(e => e.Slot).HasMaxLength(50);
        });

        builder.Entity<EquipmentOption>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(100);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Category).HasMaxLength(100);
        });

        builder.Entity<AdminUser>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).HasMaxLength(256);
            entity.HasIndex(e => e.Email).IsUnique();
        });

        builder.Entity<WorkoutSession>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PlanName).HasMaxLength(200);
            entity.HasIndex(e => e.UserId);
            entity.HasMany(e => e.Exercises)
                .WithOne()
                .HasForeignKey(e => e.WorkoutSessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<CompletedExercise>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ExerciseId).HasMaxLength(100);
            entity.Property(e => e.ExerciseName).HasMaxLength(200);
            entity.HasMany(e => e.Sets)
                .WithOne()
                .HasForeignKey(e => e.CompletedExerciseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<UserPreference>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserId).HasMaxLength(450);
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.Property(e => e.DefaultEquipment)
                .HasConversion(
                    v => string.Join(',', v),
                    v => v.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList());
        });

        builder.Entity<UserFavoriteExercise>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserId).HasMaxLength(450);
            entity.Property(e => e.ExerciseId).HasMaxLength(100);
            entity.HasIndex(e => new { e.UserId, e.ExerciseId }).IsUnique();
        });

        builder.Entity<UserExerciseNote>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserId).HasMaxLength(450);
            entity.Property(e => e.ExerciseId).HasMaxLength(100);
            entity.HasIndex(e => new { e.UserId, e.ExerciseId }).IsUnique();
        });
    }
}
