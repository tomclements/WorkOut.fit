FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Render injects these during Docker builds when available
ARG RENDER_GIT_COMMIT=unknown
ARG RENDER_GIT_BRANCH=unknown

COPY WorkoutPlanner.slnx .
COPY WorkoutPlanner.Api/WorkoutPlanner.Api.csproj WorkoutPlanner.Api/
RUN dotnet restore WorkoutPlanner.Api/WorkoutPlanner.Api.csproj

COPY . .
WORKDIR /src/WorkoutPlanner.Api
RUN dotnet publish -c Release -o /app/publish

# Ensure static site files are present even if publish layout changes
RUN mkdir -p /app/publish/wwwroot \
    && cp -r /src/WorkoutPlanner.Api/wwwroot/. /app/publish/wwwroot/ \
    && printf '{\n  "commit": "%s",\n  "branch": "%s",\n  "buildTimeUtc": "%s"\n}\n' \
         "$RENDER_GIT_COMMIT" "$RENDER_GIT_BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
         > /app/publish/build-info.json \
    && printf '{\n  "commit": "%s",\n  "branch": "%s",\n  "buildTimeUtc": "%s"\n}\n' \
         "$RENDER_GIT_COMMIT" "$RENDER_GIT_BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
         > /app/publish/wwwroot/build-info.json \
    && test -f /app/publish/wwwroot/about.html \
    && test -f /app/publish/wwwroot/index.html \
    && ls -la /app/publish/wwwroot/

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Re-declare ARGs so they can be stamped into the runtime image when Render passes them
ARG RENDER_GIT_COMMIT=unknown
ARG RENDER_GIT_BRANCH=unknown
ENV RENDER_GIT_COMMIT=$RENDER_GIT_COMMIT
ENV RENDER_GIT_BRANCH=$RENDER_GIT_BRANCH

ENV ASPNETCORE_ENVIRONMENT=Production
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT dotnet WorkoutPlanner.Api.dll --urls "http://0.0.0.0:${PORT}"
