# Plan: "Longevity Legs" optional module (PLAN ONLY)

Status: proposal, no feature code yet. Written against `main` @ `5cd2d48` (Merge PR #8, fix/render-yaml-plans), 2026-10-19.

## 0. Source and framing

The source is an Instagram post by @cleansedforlife that summarizes BMJ research on adults aged 70-79. We use it **as guidance for exercise selection only**. The app makes no medical claims, gives no mortality numbers as promises, and doesn't diagnose anything. The post's points:
- Adults with the strongest legs had roughly 50% lower early mortality than those with the weakest (an association, not causation).
- About a 10% strength gain was linked to lower all-cause and cardiovascular mortality.
- Walking speed predicts survival.
- Cardio maintains strength; progressive resistance training builds it.
- Core moves: squat, RDL, calf raise, lunge, step-up. Dose: 2-3 sessions/week, 2-3 sets of 8-15 reps, RIR 2.

Before we ship any wording that names BMJ, someone has to find and verify the primary paper. Until then, the blurb attributes nothing to a journal (see Decisions).

## 1. Current architecture (what exists today)

| Concern | Where |
|---|---|
| Plan request contract | `WorkoutPlanner.Api/Models/PlanRequest.cs` (Weeks, DaysPerWeek, WorkoutDays, SessionMinutes, Equipment, Split, Goal, Level, IncludeWarmup/Cooldown, Restrictions, Rehab, Favorite/Disliked/AvoidExerciseIds, Progression, MixMode, Seed) |
| Endpoint | `Endpoints/WorkoutEndpoints.cs`: `POST /api/plan` (anonymous, `.WithValidation<PlanRequest>()`, rate limit "plan") calls `IWorkoutPlannerService.GeneratePlan` |
| Validation | `Validators/RequestValidators.cs` (PlanRequest validator) |
| Generator | `Services/WorkoutPlannerService.cs`: `GeneratePlan` (week/day loop, `targetTime = (sessionMinutes - warmup/cooldown reserve) * 60`, `CountHiitDays`/`AssignHiitMask`, `planWideRecent`/`dynamicAvoid`), `BuildSession` (pool = level + `HasEquipment` + `!IsRestricted`, then a slot loop over `GetSessionTemplate`/`GetBroSessionTemplate`, `PickWeightedExercise`, time budget `softLimit = targetTime+60`, `hardSkip = targetTime+120`, `minExercises = 3`/4 bro, then warm-up/cool-down via `MobilityCatalog`), `BuildHiitSession` |
| Sets/reps/rest/progression | `ComputeSets` (goal/level/`WeekProgression.SetDelta`, clamp, `ApplyUnilateralEvenRounds`), `ComputeReps` (goal plus `RepDelta`), `ComputeRest`, `ProgressionHint`, `GetWeekProgression`/`DeloadWeek`/`BuildProgressionSummary` (record `WeekProgression`) |
| Equipment | `HasEquipment(ex, selected)` (all required equipment must be selected; empty list = bodyweight). Equipment ids are in `Data/equipment.json`: barbell, bench, bodyweight, cable, dumbbells, ez-bar, foam-roller, kettlebell, machines, medicine-ball, pullup-bar, bands, stability-ball. **No trap-bar and no belt-squat/dip-belt id.** |
| Injury logic | `Services/InjuryRules.cs`: `ComputeAvoidance(Exercise)` from `ExerciseMechanics` (`Shoulder`, `RotatorCuff`, `Elbow`, `Wrist`, `Knee`, `Patellar`, `LowerBack`, `Neck`), `MuscleToInjury` fallback, `RehabToMechanics`, `AllowlistedExerciseIds`, `SpecificToParent`, `IsAllowlisted`, `MatchesRehab`. Generator gate: `WorkoutPlannerService.IsRestricted`. Rehab chains: `Services/RehabProgressionCatalog.cs` (`GetFor`) |
| Catalog | `Data/exercises.json` (654 entries; `slot`, `force`, `mechanic`, `mechanics{}`), loaded in `Services/DbInitializer.cs` (line ~121 `se.AvoidFor = InjuryRules.ComputeAvoidance(se)`). Taxonomy: `Services/ExerciseTaxonomy.cs` (`InferSlot`, `Reclassify`, `EnrichEquipmentFromName`). Model: `Models/Exercise.cs` + `ExerciseMechanics` (`[NotMapped]`) |
| Working weight / progression memory | `Models/WorkoutSession.cs` `CompletedExercise.WeightKg` (migration `20260829010632_AddWorkingWeightToCompletedExercises`), `Services/WorkoutSessionService.cs` `GetLastLoadsAsync` (latest kg per exercise id), `GET /api/runner/last-loads` (`Endpoints/RunnerEndpoints.cs`). UI: `wwwroot/js/app.js` ~L2010 `renderPlan` follow-up ("Last: X · try X+2.5/1"), `wwwroot/js/workoutRunner.js` (`lastLoads`), `runnerEngine.js` `parseWorkingWeightKg`, `startWeightGate.js`, `quitWorkout.js` |
| Settings storage | `Models/UserPreference.cs` / `Models/UserPreferenceDto.cs`, `Data/AppDbContext.cs` `UserPreference` entity config (~L85), `Endpoints/UserEndpoints.cs` `GET/PUT /api/user/preferences` + `MapPreferenceDto`/`ApplyPreferenceDto`. Client defaults in `app.js` (~L24 `defaultIncludeWarmup`, ~L383 apply to form, ~L436/452 save last-used, ~L476 PUT) |
| Planner UI | `wwwroot/index.html` `#customPlanDetails` > `#plannerSection` (numbered groups "1. Schedule", ..., `#equipmentContainer`, injury rows with `data-rehab` checkboxes ~L282-317). `app.js` criteria builder ~L520-545, `generate()` L1691, `renderPlan()` L1802, `renderRehabProgressions()` L2033 |
| 4-tab nav | `index.html` L461 `<nav id="bottomNav">`: `data-nav="planner"` (/), `history` (/history.html), `workout` (/workout.html, primary), `account` (/account.html, `#bottomNavAccount`). Mirrored in the other pages |
| Tests | `WorkoutPlanner.Tests/PlanGenerationTests.cs` (34 facts/theories, via `TestWebApplicationFactory`), `CompoundPreferenceTests.cs`, `UnilateralSetsTests.cs`, `ExerciseDataTests.cs`, JS `node --test` (`npm run test:runner`), `scripts/smoke-http.mjs` (`npm run test:smoke`), `scripts/verify-working-weight.mjs` (Playwright-style page check) |

### Catalog facts that drive the design (checked in exercises.json)
- Squat options: `goblet-squat`, `kettlebell-goblet-squat`, `bodyweight-squat`, `dumbbell-squat`, `dumbbell-squat-to-a-bench`, `box-squat` (barbell+bench), `barbell-squat-to-a-bench`, `leg-press`, `smith-machine-squat`, `hack-squat`. `chair-squat` is tagged `machines`, which looks like a data bug.
- RDL/hinge options: `db-romanian-deadlift`, `romanian-deadlift`, `stiff-legged-dumbbell-deadlift`, `smith-machine-stiff-legged-deadlift`, `band-good-morning-pull-through`, `barbell-hip-thrust`, `barbell-glute-bridge`, `single-leg-glute-bridge`, `butt-lift-bridge`.
- Calf options: `standing-dumbbell-calf-raise`, `calf-raise-on-a-dumbbell`, `calf-raises-with-bands`, `seated-calf-raise` (machine), `barbell-seated-calf-raise`, `dumbbell-seated-one-leg-calf-raise`, `standing-calf-raises`, `smith-machine-calf-raise`. **No bodyweight standing or seated calf raise.** `calf-press` is tagged `shoulder`/`rotator-cuff` (`Shoulder: horizontal`), which looks like a mechanics bug.
- Lunge options: `db-lunge`, `dumbbell-lunges`, `dumbbell-rear-lunge`, `split-squat-with-dumbbells`, `barbell-lunge`, `barbell-walking-lunge`, `smith-single-leg-split-squat`. **No bodyweight lunge, reverse lunge or split squat.**
- Step-up options: `db-step-up`, `dumbbell-step-ups`, `barbell-step-ups`, `step-up-with-knee-raise` (bodyweight+bench). **No rail- or hand-assisted step-up.**
- **Injury gap (important for Tom):** every DB lunge, step-up and RDL has `mechanics.shoulder = "neutral"`, so `InjuryRules.Shoulder` and `RotatorCuff` never tag them. RDLs set `gripLoad: true`, but that only drives `wrist`. So today, a user who restricts `rotator-cuff` can still get heavy dumbbells hanging from the arms (suitcase/dependent load) and a loaded RDL grip. `ExerciseMechanics.Shoulder` already documents a `dependent` value that nothing uses.
- **Knee gap:** almost every leg move has `avoidFor` including `knee`, and squats/lunges/step-ups also have `patellar`. With a `knee` restriction, the whole pattern disappears. "Regress instead of drop" therefore needs a curated allowlist, like the existing `InjuryRules.AllowlistedExerciseIds`, plus new low-range entries.

## 2. Architecture and hook points

New pure static service: `Services/LongevityLegsCatalog.cs`. It has no DB dependency, which matches the style of `RehabProgressionCatalog`/`MobilityCatalog`. It holds:
- `Patterns`: `squat`, `hinge` (RDL), `calf`, `lunge`, `step-up`.
- `EquivalenceGroups`: pattern → ordered list of exercise ids, from most to least preferred. Example for squat: goblet-squat, kettlebell-goblet-squat, dumbbell-squat-to-a-bench, box-squat, leg-press, bodyweight-squat, new `box-squat-bodyweight`.
- `Regressions`: (pattern, limitation) → ordered fallback ids (see §5).
- `LongevityPick Resolve(pattern, pool, equipment, restrictions, rehab, rng, recent)`: returns an exercise plus a `regressionReason` string, or null if the pattern is uncoverable.
- `Blurb` text constants, so the server is the single source of truth.

Hooks in `WorkoutPlannerService`:
1. `GeneratePlan`: read `req.IncludeLongevityLegs`. If false, skip every new code path. This is the zero-diff guarantee. If true, compute a **weekly coverage schedule** before the day loop (§6). A deterministic helper `AssignLongevityDays(strengthDayIndices, int targetSessions)` sits next to `AssignHiitMask`.
2. `BuildSession`: add an optional parameter `IReadOnlyList<string>? longevityPatterns`. When non-null, **after** the normal slot loop and before the "No main lifts" check and mobility:
   - Mark any already-picked work exercise whose id is in an equivalence group of a required pattern as covering it. The exercise gets `PlanExercise.LongevityPattern` and gets re-dosed (§7).
   - For each still-missing pattern, call `LongevityLegsCatalog.Resolve` with the **same** filtered `pool` (equipment + `IsRestricted` already applied, so injury and equipment win automatically). Append it as `Phase = "work"`, `Block = "longevity"`.
   - Time handling follows the Decision in §6.3.
3. `BuildHiitSession`: not touched. Longevity patterns go only on strength days. If the user has 0 strength days (`mixMode = conditioning` with all HIIT), see §6.2.
4. `PlanResponse`: add `LongevityLegs` (summary object: `Enabled`, `TargetSessionsPerWeek`, `CoveredSessionsPerWeek[]` per week, `Regressions[]` {pattern, chosenId, reason}, `UncoveredPatterns[]`, `Blurb`, `Disclaimer`). `renderPlan` displays it the same way it displays `RehabProgressions`.
5. `IsRestricted`: unchanged. Longevity regressions that need to bypass a broad `knee` tag go through a new, narrow allowlist (§5). The generic `IsAllowlisted` contract is not loosened.

## 3. Data model and migration changes

1. **Request** (`Models/PlanRequest.cs`): `public bool IncludeLongevityLegs { get; set; } = false;`. The validator needs no new rules. Old clients omit the field, so they get false and identical plans.
2. **Preference** (`Models/UserPreference.cs`, `UserPreferenceDto.cs`): `public bool DefaultIncludeLongevityLegs { get; set; }`. Map it in `UserEndpoints.MapPreferenceDto`/`ApplyPreferenceDto`. EF migration `AddLongevityLegsPreference` adds one bool column, `NOT NULL DEFAULT false`, to `UserPreferences`. Update `AppDbContextModelSnapshot`. Optionally add `LongevityLegsBlurbDismissed` bool in the same migration (decide in batch 2).
3. **Plan output** (`Models/PlanExercise.cs`): `public string? LongevityPattern { get; set; }` (squat|hinge|calf|lunge|step-up) and `public string? RegressionNote { get; set; }`. `Models/DayPlan.cs`: optional `string? LongevityNote`. Both are nullable and serialize as null or absent, so saved plans (`SavedPlan.PlanJson`) stay compatible.
4. **Exercise tags**: equivalence lives in code (`LongevityLegsCatalog`), **not** in `exercises.json`, so `ExerciseImportService`/`DbInitializer` don't need a schema change. An `ExerciseDataTests` guard asserts that every id referenced by the catalog exists in `exercises.json`.
5. **Mechanics fixes / additions in `exercises.json`** (data, re-run `DbInitializer` seeding):
   - Set `mechanics.shoulder = "dependent"` on arm-hung loaded moves: `db-lunge`, `dumbbell-lunges`, `dumbbell-rear-lunge`, `split-squat-with-dumbbells`, `db-step-up`, `dumbbell-step-ups`, `db-romanian-deadlift`, `stiff-legged-dumbbell-deadlift`, `romanian-deadlift`, `stiff-legged-barbell-deadlift`, `smith-machine-stiff-legged-deadlift`, `standing-dumbbell-calf-raise`, `calf-raise-on-a-dumbbell`.
   - Extend `InjuryRules.RotatorCuff` (and `tools/recompute-avoidfor.py` to match) so that `dependent` plus `GripLoad` adds `rotator-cuff`. Add a `gripLoad`-only rule for `rotator-cuff` on hinge moves too. **Only `rotator-cuff` is affected, not the broad `shoulder` tag.** This is a clinical-logic change that affects non-longevity plans too, so it gets its own batch and Tom's sign-off (Decision 9).
   - Fix `chair-squat` equipment (`machines` → `bodyweight`). Fix `calf-press` mechanics (`shoulder: neutral`).
   - **New entries** (bodyweight or bench, `mechanics` filled in, reps 8-15, demo via the stick-demo scripts): `bodyweight-box-squat` (sit-to-stand to a bench or chair), `assisted-step-up` (low step, hand on rail/wall), `bodyweight-split-squat-supported`, `bodyweight-reverse-lunge`, `standing-calf-raise-bodyweight` (hand on wall), `seated-calf-raise-bodyweight`, `goblet-step-up`, `goblet-reverse-lunge`, `hip-hinge-dowel` (bodyweight RDL pattern), `single-leg-rdl-supported` (hand on wall, no load), `banded-rdl` (band under feet, hands at hips). Equipment id additions (`trap-bar`, `hip-belt`) are optional. If they're added: `trap-bar-deadlift-high-handles`, `belt-squat`.
6. **Regression allowlist**: `LongevityLegsCatalog.KneeSafeIds` (`bodyweight-box-squat` at a high box, `seated-calf-raise-bodyweight`, `glute-bridge`/`single-leg-glute-bridge`, `assisted-step-up` low step). These apply only when `IncludeLongevityLegs` is true **and** the user ticked knee/patellar **rehab** (mirrors the existing rehab-allowlist semantics in `InjuryRules.IsAllowlisted`). With a knee *restriction* but no rehab, the knee-free fallbacks are calf raises, hinge/bridge, and a "talk to your clinician" note. No knee-flexion move gets force-allowed.

## 4. UI placement

- `index.html` `#plannerSection`: put a new checkbox row `#includeLongevityLegs` labelled **"Include Longevity Legs focus"** in the goals/options group, next to Progression/Mix (not inside the injury block). Add an ⓘ toggle that expands the blurb (§Decisions), and below it a small muted line: "Adds squat, hinge, calf, lunge and step-up work 2-3×/week; respects your injuries and equipment."
- `app.js`: criteria builder (~L533) adds `includeLongevityLegs: !!document.getElementById('includeLongevityLegs')?.checked`. The preference load (~L383) and save (~L436/452/877/950) round-trip `defaultIncludeLongevityLegs`. Defaults object (~L24) gets `defaultIncludeLongevityLegs: false`.
- `renderPlan` (L1802): add a "Longevity Legs" badge on covered exercises (`data-longevity-pattern`), a per-plan summary card (sessions/week covered, regressions with reasons, uncovered patterns with suggestions), and the blurb with a disclaimer. Put it after `renderRehabProgressions`.
- Preferences modal (`#preferencesModal`): mirror toggle.
- `history.html`/`history.js`: optional "Longevity Legs progress" mini-card (§7).
- 4-tab nav (`#bottomNav`): **no new tab.** The feature lives in Planner, the runner badge in Workout, and progress in History.
- `workout.html`/`workoutRunner.js`: show the badge plus "RIR 2: stop with ~2 good reps left" cue on longevity exercises. Hidden for other exercises.

## 5. Regressions per limitation (catalog `Regressions`)

Selection is always: pool (already equipment- and injury-filtered) ∩ equivalence group in order → else regression list in order → else uncovered (reported, never silently dropped).

| Pattern | Default order | rotator-cuff / shoulder | knee / patellar (with rehab) | lower-back | No equipment |
|---|---|---|---|---|---|
| Squat | goblet-squat → kettlebell-goblet-squat → dumbbell-squat-to-a-bench → leg-press → box-squat | goblet hold close to chest (goblet keeps elbows down, low cuff demand) → leg-press → bodyweight-box-squat | bodyweight-box-squat (high box) → leg-press partial range → wall-sit isometric (optional new) | leg-press → goblet → bodyweight-box-squat (avoid back-loaded barbell) | bodyweight-box-squat / bodyweight-squat |
| Hinge (RDL) | db-romanian-deadlift → romanian-deadlift → stiff-legged-dumbbell-deadlift | **no hand-hung load**: banded-rdl (hands at hips), hip-hinge-dowel, barbell-hip-thrust / barbell-glute-bridge (bar on hips), single-leg-glute-bridge, belt-loaded hinge if `hip-belt` exists; trap-bar high handles only if Tom approves (still grip) | glute-bridge family (minimal knee) | barbell-glute-bridge / butt-lift-bridge, band-good-morning-pull-through only with no lower-back restriction | hip-hinge-dowel → single-leg-rdl-supported → butt-lift-bridge |
| Calf | standing-dumbbell-calf-raise → standing-calf-raises → smith-machine-calf-raise | standing-calf-raise-bodyweight (hand on wall, single-leg for load) → seated-calf-raise (machine) → seated-calf-raise-bodyweight with load on knees | seated-calf-raise(-bodyweight) | any | standing-calf-raise-bodyweight |
| Lunge | dumbbell-rear-lunge → split-squat-with-dumbbells → db-lunge | goblet-reverse-lunge → bodyweight-split-squat-supported (rail/wall) → bodyweight-reverse-lunge; no suitcase dumbbells | bodyweight-split-squat-supported short range, else substitute step-up low or uncovered with note | split squat (more upright) over walking lunge | bodyweight-reverse-lunge |
| Step-up | db-step-up → dumbbell-step-ups | goblet-step-up → assisted-step-up (rail, bodyweight) → step-up-with-knee-raise | assisted-step-up low step | assisted-step-up | assisted-step-up (needs bench/step; else lunge counts twice and note) |

Each pick records `RegressionNote`, for example "Goblet hold instead of dumbbells at your sides to keep load off the rotator cuff."

## 6. Generation logic and priority order

### 6.1 Priority (highest first)
1. **Injury restrictions** (`IsRestricted` / `InjuryRules`). Never overridden. Longevity only chooses within the filtered pool, plus the rehab-gated `KneeSafeIds`.
2. **Equipment** (`HasEquipment`). Never overridden.
3. **Session time** (`targetTime`), per Decision 6.3.
4. **Longevity coverage** (patterns × frequency).
5. Existing template slots, favorites/dislikes (`PickWeightedExercise` weights), variety (`planWideRecent`). Dislikes are respected inside equivalence groups when an alternative exists.

### 6.2 Coverage rules (frequency)
- `strengthDays` = workout days minus HIIT days (from `AssignHiitMask`).
- Target sessions/week T = clamp(strengthDays, 0, 3), with minimum 2 when strengthDays ≥ 2.
- 5 patterns spread across T sessions. Every pattern appears ≥2×/week when T ≥ 2. Default rotation: S1 = squat, hinge, calf; S2 = lunge, step-up, calf, squat; S3 = hinge, lunge, step-up. Each pattern gets 2 sets per appearance, so ~4-6 sets/pattern/week.
- **strengthDays = 1** (fewer than 2 days): one compact "Longevity block" covering all 5 patterns at 2 sets each, ~12-15 min. `LongevityLegs.CoveredSessionsPerWeek = 1`, with a note: "The guidance suggests 2-3 sessions a week. Add a second day or try the 10-minute bodyweight home routine on a rest day." Optionally attach a bodyweight-only `DayPlan.Note` suggestion on one rest day (no auto-scheduled session, to keep the user's day choice intact).
- **strengthDays = 0** (all HIIT, conditioning): don't modify HIIT days. Report "uncovered: switch mix to hybrid to include Longevity Legs." Tests assert no exception.
- Upper/lower split: coverage goes on lower days first. Bro split: the legs day gets the full set, plus 1-2 mini patterns (calf, step-up) on another day to reach 2×.
- Deload weeks (`mods.Phase == "deload"`): keep coverage, sets = 2, RIR 3+.

### 6.3 Time
- Recommended: **counts toward the session**. Existing leg-slot picks that are in a group satisfy coverage at no extra cost, which is the merge strategy. Missing patterns get appended while `timeUsed + duration <= softLimit`. If they don't fit, replace the lowest-priority non-longevity work exercise (last-filled `legs`/`core`/`carry` slot first, never a rehab-boosted pick). If it still doesn't fit, reduce longevity to 2 sets. If it still doesn't fit, defer the pattern to another longevity day that week. Only then mark it uncovered.
- The time estimate uses the same formula as today: `sets * (WorkDuration + rest) + transition`.

### 6.4 Dose
For longevity-tagged exercises, override `ComputeSets`/`ComputeReps` with `ComputeLongevityDose(ex, mods)`: sets 2-3 (2 on deload, 3 when `mods.SetDelta > 0`), reps "8-15" (or 8-12 per leg for unilateral; even-rounds unaffected because sets are per leg via `ApplyUnilateralEvenRounds`), rest 60-90 s, `Progression` hint "RIR 2: stop with about 2 good reps left. When you hit 15 reps on all sets, add a little load or a harder variation." Goal settings (strength 3-5 reps) do **not** apply to longevity exercises. This is documented in the UI.

## 7. Progressive-overload tracking

- Reuse `CompletedExercise.WeightKg` and per-set reps (`CompletedSet`). No new table for v1.
- New service method `WorkoutSessionService.GetLongevityProgressAsync(userId)`: for each pattern, map completed exercise ids → pattern via `LongevityLegsCatalog`. Return the last N sessions' best set (kg × reps), estimated e1RM (Epley, only for reps ≤ 15), and a trend: % change from the first 2 sessions to the latest 2. Endpoint `GET /api/runner/longevity-progress` (auth).
- Next-step rule (double progression): if all sets hit the top of the range (15, or 12 for unilateral) at the logged weight → suggest +2.5 kg (≥20 kg) / +1 kg, mirroring the existing `app.js` L2010 rule. Bodyweight variants suggest the next regression level up (assisted-step-up → step-up-with-knee-raise → goblet-step-up). The ladder is defined in `LongevityLegsCatalog.Ladders`.
- Display: History page card "Longevity Legs: Squat +8% · Step-up: moved to goblet step-up." Wording is neutral ("stronger than when you started"), and the 10% figure is only used as an optional milestone label, not a health claim.
- The runner (`workoutRunner.js`) already pre-fills `lastLoads`. Add a cue only for longevity-badged exercises.

## 8. Tests

Unit/integration (`WorkoutPlanner.Tests`, new `LongevityLegsTests.cs`, via `TestWebApplicationFactory`):
1. `Off_PlanIsByteIdenticalToBaseline`: same seed with `IncludeLongevityLegs=false` vs field omitted. Serialized plans are equal, and also equal to pre-feature output (golden JSON for 3 seeds captured in batch 0).
2. `On_3StrengthDays_EachPatternAtLeastTwicePerWeek` (theory across full-body, upper-lower, bro-split, push-pull-legs).
3. `On_DoseIs2to3Sets_8to15Reps` for longevity-tagged exercises (also deload week).
4. `On_RespectsEquipment_BodyweightOnly` → only bodyweight/bench ids, all patterns covered (needs new catalog entries).
5. `On_RotatorCuffRestriction_NoDependentLoadOrGripHinge` → no `db-lunge`, `db-step-up`, `db-romanian-deadlift`, etc. Hinge resolves to banded/bridge. `RegressionNote` present.
6. `On_KneeRestriction_NoKneeFlexion_ReportsUncovered` and `On_KneeRehab_UsesKneeSafeIds`.
7. `On_OneDay_SingleBlockAllFivePatterns_WithNote`; `On_AllHiit_NoCrashReportsUncovered`.
8. `On_TimeLimit_10min_NoSessionExceedsHardSkip` and coverage degrades in the documented order.
9. `InjuryRules_DependentShoulder_TagsRotatorCuff` (unit on `ComputeAvoidance`), plus an `ExerciseDataTests` check that all catalog ids exist, plus new entries have mechanics.
10. Preferences round-trip `DefaultIncludeLongevityLegs` (extend the existing preference tests in `AuthTests`/`SavedPlanTests` style).
11. `GetLongevityProgressAsync` trend math and next-step rule.

JS: `node --test` file `longevityBadge.test.js` for the pure render helpers, added to `package.json` `test:runner`.

Smoke: extend `scripts/smoke-http.mjs` with `POST /api/plan` using `includeLongevityLegs:true`, bodyweight, 2 days, `restrictions:["rotator-cuff"]` → 200, `longevityLegs.enabled === true`, ≥1 exercise with `longevityPattern`, no `db-` ids. Optionally add a `scripts/verify-longevity.mjs` browser check: toggle exists in `#plannerSection`, blurb expands, badge renders.

Run: `dotnet test`, `npm run test:runner`, `npm run test:smoke`.

## 9. OpenCode batches (model `opencode-go/kimi-k2.7-code`; one concern each)

Each batch: branch off main, `dotnet build` + `dotnet test` green before handoff, no unrelated edits.

- **B0: Baseline goldens.** Files: `WorkoutPlanner.Tests/LongevityLegsTests.cs` (new, only test 1 against current code), `WorkoutPlanner.Tests/Golden/*.json`. AC: goldens for 3 seeds/configs committed; test passes on main.
- **B1: Request flag + DTO fields (no behaviour).** Files: `Models/PlanRequest.cs`, `Models/PlanExercise.cs`, `Models/DayPlan.cs`, `Models/PlanResponse.cs`. AC: B0 still passes; the new fields are nullable or default and absent from output when off (`JsonIgnore(WhenWritingNull)` if needed for goldens).
- **B2: Preference persistence.** Files: `Models/UserPreference.cs`, `Models/UserPreferenceDto.cs`, `Endpoints/UserEndpoints.cs`, `Data/Migrations/<ts>_AddLongevityLegsPreference.cs` + Designer + `AppDbContextModelSnapshot.cs`. AC: migration adds only the bool column(s) default false; GET/PUT round-trip test.
- **B3: Catalog data fixes + new exercises.** Files: `Data/exercises.json`, `Services/DbInitializer.cs` (only if seeding needs it), `ExerciseDataTests.cs`; demos via existing `scripts/generate-stick-demos.py` (separate commit). AC: new ids load, have mechanics/equipment/8-15 reps; `chair-squat`/`calf-press` fixed; existing tests green.
- **B4: Rotator-cuff dependent-load rule.** Files: `Services/InjuryRules.cs` (`RotatorCuff`), `tools/recompute-avoidfor.py`, `Data/exercises.json` (`shoulder: dependent` on listed ids), new tests in `LongevityLegsTests.cs` or `PlanGenerationTests.cs`. AC: listed ids gain `rotator-cuff` only; `shoulder` tag unchanged; B0 goldens without rotator-cuff restriction unchanged. **Gate: Tom approves (Decision 9).**
- **B5: `LongevityLegsCatalog` (pure).** Files: `Services/LongevityLegsCatalog.cs`, unit tests. AC: `Resolve` returns group → regression → null with reason; all ids exist; ladders defined.
- **B6: Generator integration.** Files: `Services/WorkoutPlannerService.cs` only (`GeneratePlan`, `BuildSession`, new `AssignLongevityDays`, `ComputeLongevityDose`, summary on `PlanResponse`). AC: tests 1-8 pass; off-path diff = zero (B0).
- **B7: Planner UI + blurb.** Files: `wwwroot/index.html`, `wwwroot/js/app.js` (criteria, prefs, `renderPlan` summary/badges), Tailwind classes via existing build if new. AC: toggle persists for logged-in users; anonymous users get the request field; blurb + disclaimer render; no change when off.
- **B8: Runner cue.** Files: `wwwroot/js/workoutRunner.js` (+ `workout.html` if markup), JS test. AC: badge/RIR cue only on `longevityPattern` exercises; `npm run test:runner` green.
- **B9: Progress tracking.** Files: `Services/IWorkoutSessionService.cs`, `Services/WorkoutSessionService.cs`, `Endpoints/RunnerEndpoints.cs`, `wwwroot/history.html`, `wwwroot/js/history.js`, tests. AC: endpoint auth-only; trend + next-step tests pass.
- **B10: Smoke.** Files: `scripts/smoke-http.mjs` (+ optional `scripts/verify-longevity.mjs`), `TESTPLAN.md`. AC: `npm run test:smoke` green locally/CI.

## 10. Risks

- **Clinical regression risk**: B4 changes injury tagging for everyone with `rotator-cuff`, so plans get fewer DB lunges and RDLs. It's intended, but it changes plans outside the feature. It also isn't covered by the "non-destructive" promise unless it ships behind the flag. Mitigation: either gate the rule to `IncludeLongevityLegs` or accept it as a bug fix (Decision 9).
- Pool exhaustion: bodyweight + knee + rotator-cuff may leave patterns uncovered. They must be reported, never silently dropped, and never forced past injury filters.
- Time budget: appended blocks can push sessions over the existing `hardSkip`. Tests 8 cover this.
- Golden drift: any change to `rng` call order breaks seed reproducibility. The longevity path must not consume `rng` when off, and ideally should use a separate `Random(seed ^ const)` when on.
- Messaging: mortality statistics can read as alarmist or as medical advice. Keep numbers out of the default blurb, and don't cite BMJ until the paper is verified.
- Older users (70-79 is the source cohort): balance/fall risk on lunges and step-ups. Default to supported variants for beginners.
- Saved plans (`SavedPlan.PlanJson`) from before the feature lack the new fields; renderers must null-check.
- Kimi batches touching the 1,181-line `WorkoutPlannerService.cs`: keep B6 small and review diff carefully.

## 11. Decisions for Tom (with recommendations)

1. **Default on/off?** Recommend **off** for everyone. That's the only way existing plans and new plans for existing users stay unchanged. Remember the user's last choice via `DefaultIncludeLongevityLegs`.
2. **Who sees it?** Recommend **everyone**. Don't age-gate: there's no age field, and leg strength helps at any age. Copy can say "inspired by research in older adults". Later, if a birth year is added, the toggle could be suggested (not auto-enabled) for users 50+.
3. **Counts toward session time or adds to it?** Recommend **counts toward it**: merge with existing leg picks, replace the lowest-priority slot, then trim sets, then defer (§6.3). Sessions shouldn't silently get longer than the time the user picked.
4. **Blurb wording, citation, disclaimer.** Recommend:
   > **Longevity Legs.** Strong legs help you get up, climb stairs, and keep walking well as you age. Research in older adults links stronger legs and a faster walking pace with better long-term health, and even modest strength gains seem to help. This focus adds squats, hip hinges, calf raises, lunges and step-ups 2-3 times a week, at 2-3 sets of 8-15 reps, stopping with about 2 reps in reserve. Cardio helps you keep strength; gradually adding load builds it.
   > *General fitness guidance, not medical advice. Check with your clinician if you have an injury or health condition, and stop any exercise that causes pain.*
   Leave the "50% / 10%" numbers out of the default text, and put them behind a "What's this based on?" link only once the BMJ paper is verified and cited directly (authors, year, DOI). Credit the Instagram post as "summary by @cleansedforlife" only if you want to. A primary-source citation is better.
5. **Free or premium?** Recommend **free**. There's no premium tier in the code today, and gating a safety-aware feature adds complexity. Progress analytics (B9) could be premium later.
6. **Merge with existing leg days or add mini-blocks?** Recommend **merge first**: tag existing leg-slot picks that already match, and fill gaps in the same session. Use a labelled mini-block only for the one-day case and bro-split second exposure.
7. **How strict is "guaranteed" under time limits?** Recommend: guarantee that **each pattern appears ≥2×/week whenever there are ≥2 strength days and sessions ≥20 min**. Below that, use best effort with explicit "uncovered/deferred" reporting. Injury and equipment always win, and the guarantee is satisfied by a regression, not by dropping the pattern.
8. **Regression choices per limitation.** Recommend the §5 table. For Tom specifically (rotator-cuff tear):
   - Squat: goblet hold. If the goblet bothers the shoulder, leg press or bodyweight box squat.
   - RDL: no hand-held RDL. Use banded RDL with hands at hips, or hip thrust/glute bridge with the bar on the hips. Add belt or hip loading if a `hip-belt` equipment id is added. Trap bar only if your clinician okays the grip.
   - Calf: bodyweight single-leg with a hand on the wall, or seated calf raise.
   - Lunge and step-up: goblet hold at light load, or bodyweight with rail support. No dumbbells at the sides.
9. **Should the rotator-cuff dependent-load/grip rule (B4) apply globally or only with Longevity Legs on?** Recommend **global**: it's a real gap in the current clinical logic (dumbbell lunges, step-ups and RDLs are never cuff-tagged). Ship it as its own reviewed change with a changelog note. If you want the strict "nothing else changes" promise, gate it behind the flag for v1.
10. **Add `trap-bar` / `hip-belt` equipment ids?** Recommend adding **`hip-belt`** (cheap, shoulder-friendly). Defer `trap-bar` until you decide on grip load.
