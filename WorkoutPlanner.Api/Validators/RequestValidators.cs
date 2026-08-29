using FluentValidation;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Validators;

public class SubmitFeedbackRequestValidator : AbstractValidator<SubmitFeedbackRequest>
{
    public SubmitFeedbackRequestValidator()
    {
        RuleFor(x => x.Message)
            .NotEmpty().WithMessage("Please enter your feedback.")
            .MinimumLength(5).WithMessage("Please write at least a few words.")
            .MaximumLength(4000);
        RuleFor(x => x.Category)
            .Must(c => string.IsNullOrWhiteSpace(c) ||
                       new[] { "suggestion", "bug", "other" }.Contains(c.ToLowerInvariant()))
            .WithMessage("Category must be suggestion, bug, or other.");
        RuleFor(x => x.ContactEmail)
            .EmailAddress()
            .When(x => !string.IsNullOrWhiteSpace(x.ContactEmail))
            .WithMessage("Contact email looks invalid.");
        RuleFor(x => x.PageUrl).MaximumLength(500);
        RuleFor(x => x.Website).MaximumLength(200);
    }
}

public class PlanRequestValidator : AbstractValidator<PlanRequest>
{
    public PlanRequestValidator()
    {
        RuleFor(x => x.Weeks).InclusiveBetween(1, 12);
        RuleFor(x => x.DaysPerWeek).InclusiveBetween(1, 7);
        RuleForEach(x => x.WorkoutDays).InclusiveBetween(0, 6);
        RuleFor(x => x.SessionMinutes).InclusiveBetween(5, 90);
        RuleFor(x => x.Equipment).NotEmpty().WithMessage("At least one equipment option is required.");
        RuleFor(x => x.Goal).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Level).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Progression)
            .Must(p => string.IsNullOrWhiteSpace(p) ||
                       new[] { "none", "linear", "wave", "block" }.Contains(p.ToLowerInvariant()))
            .WithMessage("Progression must be none, linear, wave, or block.");
        RuleFor(x => x.MixMode)
            .Must(m => string.IsNullOrWhiteSpace(m) ||
                       new[] { "strength", "hybrid", "conditioning", "hiit", "strength-only", "mixed" }
                           .Contains(m.ToLowerInvariant()))
            .WithMessage("Mix mode must be strength, hybrid, or conditioning.");
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
        RuleFor(x => x.WeightKg)
            .InclusiveBetween(0.25m, 500m)
            .When(x => x.WeightKg.HasValue && x.WeightKg.Value > 0)
            .WithMessage("Working weight must be between 0.25 and 500 kg.");
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
