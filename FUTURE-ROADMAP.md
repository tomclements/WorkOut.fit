# Workout Planner – Future Roadmap

This is a living plan of improvements for the Workout Planner app. Items are grouped by priority and rough effort. The first section details the **admin exercise refresh** feature specifically.

---

## 1. Admin: “Refresh exercises from source” interface

### Goal
Give admins a one-click way to pull the latest public-domain exercise data from `yuhonas/free-exercise-db` and merge it into the app without overwriting manually curated exercises or breaking the generator.

### Suggested implementation

#### Backend
1. **Import service**
   - Add `IExerciseImportService` / `ExerciseImportService`.
   - Reuse the mapping logic from `scripts/import-free-exercise-db.py` (ideally port it to C# so the API can run it without Python).
   - Fetch `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`.
   - Filter to supported categories (`strength`, `plyometrics`, `powerlifting`, `olympic weightlifting`, `strongman`).
   - Map source fields to the app’s `Exercise` schema (equipment, slot, level, avoidFor, etc.).
   - Merge with existing exercises by normalized ID:
     - Add new exercises.
     - Skip existing IDs (preserve manual edits).
     - Optionally add a `force` flag to overwrite existing imported entries, but never the original 35 seed exercises unless explicitly flagged.
2. **Admin endpoint**
   - `POST /api/admin/exercises/refresh` (admin only).
   - Accepts optional query parameter `?force=false`.
   - Returns summary: `{ added, skipped, duplicates, errors, totalExercises }`.
   - Saves new exercises to `Data/exercises.json` and reloads the DB cache (or just re-seeds on next restart; the API can also call `db.SaveChangesAsync` for immediate effect).
3. **Equipment sync**
   - Ensure any new equipment categories from the source are added to `Data/equipment.json` before the exercises are saved.
   - Validate that every exercise references an existing equipment ID.
4. **Safety / audit**
   - Create a backup copy of `exercises.json` before writing (e.g., `exercises.json.bak.<timestamp>`).
   - Log the refresh action (who, when, counts) to a new `ImportLog` table or simple JSON log.

#### Frontend (admin page)
1. Add a **“Refresh exercises”** card/section on `/admin.html`.
2. Show current counts: total exercises, imported vs. manually added, last refresh date.
3. **“Refresh now”** button with a confirmation dialog explaining that manual edits are preserved.
4. Optional **“Force overwrite existing imports”** checkbox.
5. Display results after the call: added / skipped / duplicates / errors.
6. Show a spinner during the import because fetching + mapping 800+ exercises can take a few seconds.

#### Migration path
- Keep the Python script in `scripts/import-free-exercise-db.py` for local/offline use.
- The C# import service can share the same mapping rules; consider generating mapping rules from a shared config or code to avoid drift.

#### Open questions
- Should the refresh happen immediately in the running DB, or only update the JSON seed file and require a restart?
- Should imported exercises be tagged with a `source` flag so admins can identify them later?
- Should there be an option to delete all imported exercises and reset to the original seed set?

---

## 2. Short-term improvements (high value, low risk)

1. **Session history dashboard** ✅ Done
   - New page `/history.html` lists saved workout sessions.
   - Shows date, duration, total sets/reps, and a per-exercise detail view.
2. **User profile & preferences**
   - Default equipment selection, preferred music source, default voice setting.
   - Store in a `UserPreference` table linked to Identity.
3. **Exercise favorites / notes**
   - Let users mark exercises as favorites and add private notes.
   - Influence plan generation to prefer favorites when possible.
4. **Split selection** ✅ Done
   - Users can now pick a workout split (full body, upper/lower, push/pull/legs, bro split) when generating a plan.
   - The generator uses the split to schedule days and select exercises. Full body draws from all exercise types.
   - **Bro split** uses true body-part days (chest / back / legs / shoulders / arms) matched via `primary`/`secondary` muscles, higher per-session volume, 4–5 day templates, and an in-UI frequency note vs PPL/upper-lower.
5. **Day-of-week selection** ✅ Done
   - Users can pick specific days (Mon–Sun) for workouts instead of only a day count.
   - The generator schedules workouts on those days and rests on the others.
6. **Export / share plans**
   - Export generated plans as PDF or shareable public read-only link.
   - Import plans from JSON backup.
7. **Accessibility pass**
   - ARIA labels, focus management for the runner, keyboard-only navigation, high-contrast mode.

---

## 3. Medium-term improvements

1. **Push notifications**
   - Remind users of scheduled workout days via Web Push API.
   - Store scheduled workout days in the user profile.
2. **External music integration**
   - Spotify Web Playback SDK / OAuth (requires premium + Spotify app registration).
   - Apple Music via MusicKit JS.
   - Start with “open in Spotify/Apple Music” deeplinks as a low-effort fallback.
3. **Progressive plan generator**
   - Periodization (deload weeks, intensity blocks).
   - User-provided progress feedback (weights, reps achieved) to auto-progress the next plan.
4. **Exercise imagery**
   - Use the images from `free-exercise-db` (hosted on GitHub raw) or cache them locally.
   - Show an image alongside the demo link in the runner.
5. **Admin analytics**
   - Most popular exercises, most common equipment selections, completion rates.

---

## 4. Long-term / exploratory

1. **Mobile app wrapper**
   - Capacitor or PWA-in-store to get native install, background timer, and richer sensor access.
2. **Nutrition & recovery**
   - Simple calorie/macro estimator based on goal and workout volume.
   - Rest-day recovery tips and hydration reminders.
3. **Social features**
   - Friend list, shared plans, leaderboards (opt-in).
4. **AI plan assistant**
   - Let users type goals in natural language and map to plan parameters.
5. **Multi-language support**
   - Localize the UI and exercise names/instructions.

---

## Sprint A (site polish) ✅ Done

- `GET /health` with database connectivity check
- Shared bottom nav (Planner · History · Run · Account) — hidden during active runner sessions
- Success toasts for plan/session/preference saves
- Empty dashboard + history onboarding copy for new users
- Runner mobile polish: larger timers/targets, high-contrast mode, clearer sensor UX, fullscreen + wake lock already present

## Sprint B (engagement) ✅ Done

- Exercise **images** from free-exercise-db (seeded `imageUrl`, shown in planner / picker / runner)
- History **streak** + Chart.js **volume & minutes** charts (last 30 days)
- **Favorites** UI (star on plan exercises & picker, favorites-only filter, prefer favorites in generation)

## Suggested next sprint

If you want to continue, I’d recommend this order:

1. **Admin refresh-from-source interface** (covered in section 1).
2. **Share/export plans** (public link or PDF).
3. **External music integration** (Spotify/Apple Music links first, full SDK later).

Tell me which one you want to build next.
