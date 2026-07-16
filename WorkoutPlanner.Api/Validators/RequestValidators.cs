using FluentValidation;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Validators;

public class PlanRequestValidator : AbstractValidator<PlanRequest>
{
    public PlanRequestValidator()
    {
        RuleFor(x => x.Weeks).InclusiveBetween(1, 12);
        RuleFor(x => x.DaysPerWeek).InclusiveBetween(1, 7);
        RuleFor(x => x.SessionMinutes).InclusiveBetween(5, 90);
        RuleFor(x => x.Equipment).NotEmpty().WithMessage("At least one equipment option is required.");
        RuleFor(x => x.Goal).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Level).NotEmpty().MaximumLength(50);
    }
}

public class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(6);
    }
}

public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public class SavePlanRequestValidator : AbstractValidator<SavePlanRequest>
{
    public SavePlanRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.PlanJson).NotEmpty();
    }
}

public class SaveSessionRequestValidator : AbstractValidator<SaveSessionRequest>
{
    public SaveSessionRequestValidator()
    {
        RuleFor(x => x.PlanName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.StartedAt).NotEmpty();
        RuleFor(x => x.DurationSeconds).GreaterThanOrEqualTo(0);
        RuleForEach(x => x.Exercises).SetValidator(new CompletedExerciseDtoValidator());
    }
}

public class CompletedExerciseDtoValidator : AbstractValidator<CompletedExerciseDto>
{
    public CompletedExerciseDtoValidator()
    {
        RuleFor(x => x.ExerciseId).NotEmpty().MaximumLength(100);
        RuleFor(x => x.ExerciseName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.TargetSets).GreaterThan(0);
    }
}

public class ExerciseValidator : AbstractValidator<Models.Exercise>
{
    public ExerciseValidator()
    {
        RuleFor(x => x.Id).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Level).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Slot).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Equipment).NotEmpty();
        RuleFor(x => x.Primary).NotEmpty();
        RuleFor(x => x.BaseSets).InclusiveBetween(1, 10);
        RuleFor(x => x.RepsMin).GreaterThan(0);
        RuleFor(x => x.RepsMax).GreaterThanOrEqualTo(x => x.RepsMin);
        RuleFor(x => x.WorkDuration).GreaterThan(0);
        RuleFor(x => x.RestSec).GreaterThanOrEqualTo(0);
    }
}

public class EquipmentOptionValidator : AbstractValidator<EquipmentOption>
{
    public EquipmentOptionValidator()
    {
        RuleFor(x => x.Id).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Category).NotEmpty().MaximumLength(100);
    }
}

public class ForgotPasswordRequestValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}

public class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8);
    }
}
