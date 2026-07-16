using FluentValidation;

namespace WorkoutPlanner.Api.Validators;

public class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var validator = context.HttpContext.RequestServices.GetService<IValidator<T>>();
        if (validator is null)
        {
            return await next(context);
        }

        var model = context.Arguments.OfType<T>().FirstOrDefault();
        if (model is null)
        {
            return await next(context);
        }

        var result = await validator.ValidateAsync(model, context.HttpContext.RequestAborted);
        if (result.IsValid)
        {
            return await next(context);
        }

        return Results.ValidationProblem(result.ToDictionary());
    }
}

public static class ValidationExtensions
{
    public static RouteHandlerBuilder WithValidation<T>(this RouteHandlerBuilder builder) where T : class
    {
        return builder.AddEndpointFilter<ValidationFilter<T>>();
    }
}
