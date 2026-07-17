using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;
using WorkoutPlanner.Api.Validators;

namespace WorkoutPlanner.Api.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/exercises", async (AppDbContext db) =>
        {
            var exercises = await db.Exercises
                .AsNoTracking()
                .OrderBy(e => e.Name)
                .ToListAsync();
            return Results.Ok(exercises);
        }).RequireAuthorization("Admin");

        app.MapGet("/api/admin/exercises/stats", async (IExerciseImportService importService) =>
        {
            var stats = await importService.GetLibraryStatsAsync();
            return Results.Ok(stats);
        }).RequireAuthorization("Admin");

        app.MapPost("/api/admin/exercises/refresh", async (bool? force, IExerciseImportService importService) =>
        {
            var result = await importService.RefreshFromFreeExerciseDbAsync(force ?? false);
            if (result.Errors.Count > 0 && result.Added == 0 && result.Updated == 0)
                return Results.Json(result, statusCode: StatusCodes.Status502BadGateway);
            return Results.Ok(result);
        }).RequireAuthorization("Admin");

        app.MapPost("/api/admin/exercises", async (Exercise dto, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Id) || string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest("Id and Name are required.");

            if (await db.Exercises.AnyAsync(e => e.Id == dto.Id))
                return Results.Conflict($"Exercise '{dto.Id}' already exists.");

            var validEquipment = await db.EquipmentOptions.Select(e => e.Id).ToListAsync();
            if (dto.Equipment.Any(eq => !validEquipment.Contains(eq, StringComparer.OrdinalIgnoreCase)))
                return Results.BadRequest("One or more equipment values are invalid.");

            db.Exercises.Add(dto);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/exercises/{dto.Id}", dto);
        }).RequireAuthorization("Admin").WithValidation<Exercise>();

        app.MapPut("/api/admin/exercises/{id}", async (string id, Exercise dto, AppDbContext db) =>
        {
            if (id != dto.Id)
                return Results.BadRequest("Id mismatch.");

            var existing = await db.Exercises.FindAsync(id);
            if (existing == null) return Results.NotFound();

            var validEquipment = await db.EquipmentOptions.Select(e => e.Id).ToListAsync();
            if (dto.Equipment.Any(eq => !validEquipment.Contains(eq, StringComparer.OrdinalIgnoreCase)))
                return Results.BadRequest("One or more equipment values are invalid.");

            existing.Name = dto.Name;
            existing.Equipment = dto.Equipment;
            existing.Level = dto.Level;
            existing.Primary = dto.Primary;
            existing.Secondary = dto.Secondary;
            existing.Slot = dto.Slot;
            existing.BaseSets = dto.BaseSets;
            existing.RepsMin = dto.RepsMin;
            existing.RepsMax = dto.RepsMax;
            existing.IsTimeBased = dto.IsTimeBased;
            existing.WorkDuration = dto.WorkDuration;
            existing.RestSec = dto.RestSec;
            existing.DemoUrl = dto.DemoUrl;
            existing.ImageUrl = dto.ImageUrl;
            existing.AvoidFor = dto.AvoidFor;

            await db.SaveChangesAsync();
            return Results.Ok(existing);
        }).RequireAuthorization("Admin").WithValidation<Exercise>();

        app.MapDelete("/api/admin/exercises/{id}", async (string id, AppDbContext db) =>
        {
            var existing = await db.Exercises.FindAsync(id);
            if (existing == null) return Results.NotFound();

            db.Exercises.Remove(existing);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        app.MapGet("/api/admin/equipment", async (AppDbContext db) =>
        {
            var equipment = await db.EquipmentOptions
                .AsNoTracking()
                .OrderBy(e => e.Name)
                .ToListAsync();
            return Results.Ok(equipment);
        }).RequireAuthorization("Admin");

        app.MapPost("/api/admin/equipment", async (EquipmentOption dto, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Id) || string.IsNullOrWhiteSpace(dto.Name))
                return Results.BadRequest("Id and Name are required.");

            if (await db.EquipmentOptions.AnyAsync(e => e.Id == dto.Id))
                return Results.Conflict($"Equipment '{dto.Id}' already exists.");

            db.EquipmentOptions.Add(dto);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/equipment/{dto.Id}", dto);
        }).RequireAuthorization("Admin");

        app.MapPut("/api/admin/equipment/{id}", async (string id, EquipmentOption dto, AppDbContext db) =>
        {
            if (id != dto.Id)
                return Results.BadRequest("Id mismatch.");

            var existing = await db.EquipmentOptions.FindAsync(id);
            if (existing == null) return Results.NotFound();

            existing.Name = dto.Name;
            existing.Category = dto.Category;

            await db.SaveChangesAsync();
            return Results.Ok(existing);
        }).RequireAuthorization("Admin");

        app.MapDelete("/api/admin/equipment/{id}", async (string id, AppDbContext db) =>
        {
            var existing = await db.EquipmentOptions.FindAsync(id);
            if (existing == null) return Results.NotFound();

            var inUse = await db.Exercises.AnyAsync(e => e.Equipment.Contains(id));
            if (inUse)
                return Results.BadRequest("Cannot delete equipment that is still used by exercises.");

            db.EquipmentOptions.Remove(existing);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        app.MapGet("/api/admin/users", async (AppDbContext db) =>
        {
            var users = await db.AdminUsers
                .AsNoTracking()
                .OrderBy(a => a.Email)
                .Select(a => new { a.Id, a.Email })
                .ToListAsync();
            return Results.Ok(users);
        }).RequireAuthorization("Admin");

        app.MapPost("/api/admin/users", async (AdminUser dto, AppDbContext db, UserManager<IdentityUser> userManager) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Email))
                return Results.BadRequest("Email is required.");

            var normalized = dto.Email.Trim().ToLowerInvariant();
            if (await db.AdminUsers.AnyAsync(a => a.Email == normalized))
                return Results.Conflict("That user is already an admin.");

            var user = await userManager.FindByEmailAsync(normalized);
            if (user == null)
            {
                user = new IdentityUser
                {
                    UserName = normalized,
                    Email = normalized,
                    EmailConfirmed = true
                };
                var createResult = await userManager.CreateAsync(user, "AdminPass123!");
                if (!createResult.Succeeded)
                    return Results.BadRequest(new { errors = createResult.Errors.Select(e => e.Description) });
            }

            await userManager.AddToRoleAsync(user, "Admin");
            db.AdminUsers.Add(new AdminUser { Email = normalized });
            await db.SaveChangesAsync();
            return Results.Ok(new { id = user.Id, email = normalized });
        }).RequireAuthorization("Admin");

        app.MapDelete("/api/admin/users/{id:int}", async (int id, AppDbContext db, UserManager<IdentityUser> userManager, ClaimsPrincipal currentUser) =>
        {
            var admin = await db.AdminUsers.FindAsync(id);
            if (admin == null) return Results.NotFound();

            if (currentUser.Identity?.Name?.Equals(admin.Email, StringComparison.OrdinalIgnoreCase) == true)
                return Results.BadRequest("You cannot remove yourself as an admin.");

            var remaining = await db.AdminUsers.CountAsync();
            if (remaining <= 1)
                return Results.BadRequest("At least one admin must remain.");

            var user = await userManager.FindByEmailAsync(admin.Email);
            if (user != null)
            {
                await userManager.RemoveFromRoleAsync(user, "Admin");
            }

            db.AdminUsers.Remove(admin);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        app.MapGet("/api/admin/me", (ClaimsPrincipal user) =>
        {
            return Results.Ok(new { email = user.Identity?.Name });
        }).RequireAuthorization("Admin");

        return app;
    }
}
