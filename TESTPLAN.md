# Workout Planner – Test Plan

## Test strategy

The project uses a combination of:

- **Automated integration tests** (xUnit + `WebApplicationFactory`) that spin up the real ASP.NET Core app and exercise the HTTP API.
- **Automated data-integrity tests** that validate the seed JSON files.
- **Manual UI checks** for the planner and admin pages.

The integration tests use an isolated **SQLite in-memory database** per test fixture so they run quickly and do not depend on the local `workoutplanner.db` file.

## How to run the tests

```powershell
cd C:\Users\tomcl\source\workout-planner
dotnet test
```

To run with full output:

```powershell
dotnet test --verbosity normal
```

## Automated test coverage

### 1. Plan generation (`PlanGenerationTests.cs`)

| # | Test case | What it verifies |
|---|---|---|
| 1.1 | `GeneratePlan_ReturnsValidPlan` (multiple inputs) | Plan returns the requested number of weeks, 7 days per week, and valid metadata for various weeks/days/goals/levels. |
| 1.2 | `GeneratePlan_DumbbellsOnly_DoesNotIncludeBenchExercises` | When only dumbbells + bodyweight are selected, bench-required exercises (DB bench press, DB chest fly, DB step-up) and pull-up are **not** returned. |
| 1.3 | `GeneratePlan_WithBench_IncludesBenchExercises` | When bench is selected, bench-required exercises **can** be included. |
| 1.4 | `GeneratePlan_EachWorkoutHasExercises` | Every scheduled workout day has at least one exercise and a positive estimated duration. |
| 1.5 | `GeneratePlan_ShoulderRestriction_ExcludesOverheadPress` | Selecting a shoulder restriction removes shoulder-aggravating exercises while still producing a non-empty plan. |
| 1.6 | `GeneratePlan_NoMatchingExercises_ReturnsBadRequest` | If the selected equipment does not match any exercise, the API returns a clear 400 error. |
| 1.7 | `GeneratePlan_ExercisesHaveDemoLinks` | Every exercise returned by the generator has a non-empty demo URL. |

### 2. Authentication (`AuthTests.cs`)

| # | Test case | What it verifies |
|---|---|---|
| 2.1 | `Register_CreatesUserAndReturnsEmail` | A new user can register and the API returns their email. |
| 2.2 | `Me_ReturnsUnauthorized_WhenAnonymous` | `/api/auth/me` returns 401 when not logged in. |
| 2.3 | `Login_AfterRegister_ReturnsEmail` | A registered user can log in and then access `/api/auth/me`. |
| 2.4 | `Login_WithWrongPassword_ReturnsUnauthorized` | Invalid credentials return 401. |
| 2.5 | `Logout_ClearsAuthentication` | After logout, `/api/auth/me` returns 401. |

### 3. Saved plans (`SavedPlanTests.cs`)

| # | Test case | What it verifies |
|---|---|---|
| 3.1 | `SavePlan_RequiresAuthentication` | Saving a plan without being logged in returns 401. |
| 3.2 | `SaveAndListPlan_Works` | A logged-in user can save a plan and see it in their list. |
| 3.3 | `LoadSavedPlan_ReturnsOriginalPlan` | Loading a saved plan returns the originally stored plan data. |
| 3.4 | `DeleteSavedPlan_Works` | A user can delete their own saved plan. |
| 3.5 | `UserCannotAccessOtherUsersPlan` | One user cannot load another user's saved plan. |

### 4. Workout runner sessions (`RunnerSessionTests.cs`)

| # | Test case | What it verifies |
|---|---|---|
| 4.1 | `SaveSession_RequiresAuthentication` | Saving a workout session without being logged in returns 401. |
| 4.2 | `SaveAndRetrieveSession_Works` | A logged-in user can save a completed session with sets/reps and retrieve it. |
| 4.3 | `UserCannotAccessOtherUsersSession` | One user cannot load another user's session. |

### 5. Validation (`ValidationTests.cs`)

| # | Test case | What it verifies |
|---|---|---|
| 5.1 | `GeneratePlan_InvalidWeeks_ReturnsValidationError` | Invalid plan parameters return 400 with validation errors. |
| 5.2 | `GeneratePlan_MissingEquipment_ReturnsValidationError` | Missing equipment returns 400. |
| 5.3 | `Register_InvalidEmail_ReturnsValidationError` | Invalid email format is rejected at registration. |
| 5.4 | `Register_ShortPassword_ReturnsValidationError` | Passwords shorter than 6 characters are rejected. |

### 6. Exercise data integrity (`ExerciseDataTests.cs`)

| # | Test case | What it verifies |
|---|---|---|
| 5.1 | `ExercisesJson_LoadsSuccessfully` | `Data/exercises.json` deserializes into a non-empty list. |
| 5.2 | `AllExercises_HaveRequiredFields` | Every exercise has id, name, equipment, primary muscles, slot, positive sets, work duration, etc. |
| 5.3 | `AllExercises_HaveDemoUrl` | Every exercise has a demo URL starting with `http`. |
| 5.4 | `AllSlots_AreKnown` | Every exercise uses a recognised slot value. |
| 5.5 | `AllEquipmentIds_AreKnown` | Every exercise references equipment IDs that exist in `equipment.json`. |
| 5.6 | `ExercisesJson_HasExpandedLibrary` | The exercise library has been expanded beyond the original seed data. |

### 7. Admin endpoints (manual / integration)

The admin endpoints are covered by the existing auth and data tests, and are exercised manually through `/admin.html`. They require the seeded `Admin` role.

| # | Area | Checks |
|---|---|---|
| 7.1 | Admin login | Only a user in the `Admin` role can access `/api/admin/*` endpoints. |
| 7.2 | Exercise CRUD | Create, read, update, delete exercises via the admin UI/API. |
| 7.3 | Equipment CRUD | Create, read, update, delete equipment via the admin UI/API. |
| 7.4 | Equipment delete guard | Deleting equipment still referenced by exercises is blocked. |

## Manual UI checklist

- [x] Public planner loads equipment checkboxes dynamically from `/api/equipment`.
- [x] Selecting only dumbbells + bodyweight does not show bench/pull-up exercises in generated plans.
- [x] Adding bench to the selection can include bench-required exercises.
- [x] Register/login/logout flow works in the top-right modal.
- [x] Logged-in users see "Save plan" and can load/delete saved plans.
- [x] Selecting a shoulder restriction removes overhead press and other shoulder-aggravating exercises.
- [x] `/admin.html` prompts for admin credentials.
- [x] Admin can add/edit/delete exercises and equipment.
- [x] "Start workout" button opens the runner with the current plan.
- [x] Runner shows the selected day's exercises, sets, reps and rest timers.
- [x] Built-in background music can be toggled during a session.
- [x] Motion-sensor rep counter can be enabled (mobile) with manual override.
- [x] Logged-in users can save completed sessions from the finish screen.
- [x] Runner keeps the screen on during the workout where supported.
- [x] Rep +/- and action buttons are large enough for touch input.
- [x] Haptic feedback on rep count, set completion, and rest end (supported devices).
- [x] PWA manifest and service worker allow offline access to the app shell.
- [x] Full-screen mode can be toggled from the runner header.
- [x] Voice cues announce the current exercise and rest transitions.
- [x] Refreshing the page offers to resume an in-progress workout.

## Test results

Last executed: `dotnet test --verbosity normal`

```text
Total tests: 34
     Passed: 34
     Failed: 0
```

All automated tests pass.
