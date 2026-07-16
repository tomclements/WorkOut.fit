FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY WorkoutPlanner.slnx .
COPY WorkoutPlanner.Api/WorkoutPlanner.Api.csproj WorkoutPlanner.Api/
RUN dotnet restore WorkoutPlanner.Api/WorkoutPlanner.Api.csproj

COPY . .
WORKDIR /src/WorkoutPlanner.Api
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT dotnet WorkoutPlanner.Api.dll --urls "http://0.0.0.0:${PORT}"
