using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

public interface IWorkoutPlannerService
{
    Task<PlanResponse> GeneratePlan(PlanRequest request);
}
