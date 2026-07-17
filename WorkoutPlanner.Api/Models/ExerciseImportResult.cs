namespace WorkoutPlanner.Api.Models;

public class ExerciseImportResult
{
    public int Added { get; set; }
    public int Updated { get; set; }
    public int Duplicates { get; set; }
    public int Skipped { get; set; }
    public int EquipmentAdded { get; set; }
    public int TotalExercises { get; set; }
    public int TotalEquipment { get; set; }
    public bool Force { get; set; }
    public bool SeedFileUpdated { get; set; }
    public string? BackupPath { get; set; }
    public List<string> Errors { get; set; } = new();
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
}

public class ExerciseLibraryStats
{
    public int TotalExercises { get; set; }
    public int WithImages { get; set; }
    public int TotalEquipment { get; set; }
    public DateTime? SeedFileLastWriteUtc { get; set; }
}
