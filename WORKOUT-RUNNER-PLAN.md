# Workout Runner – Design Plan

## Goal

Turn a generated workout plan into a guided, real-time session the user can follow. The runner should:

1. Show the current exercise, set, reps and rest periods.
2. Provide timers for work and rest intervals.
3. Let the user count reps (manual tap or sensor-assisted).
4. Play background music – either built-in royalty-free tracks or the user’s own Spotify subscription.
5. Log what was completed for progress tracking.

---

## User flow

1. User generates or loads a saved plan on the planner page.
2. Click **“Start workout”**.
3. Choose a music source:
   - **None**
   - **Built-in playlist** (open-source/royalty-free)
   - **Spotify** (if logged in and premium)
   - **My own device** (phone/laptop Spotify/Apple Music/YouTube Music)
4. The runner walks through each exercise and set:
   - Display exercise name, target muscles, reps/time, demo video link.
   - Work phase: rep counter + optional work timer.
   - Rest phase: countdown timer before the next set/exercise.
5. Finish screen shows summary: exercises completed, total time, sets done.
6. Optional: save the session to the user’s history.

---

## Workout runner UI (`/workout.html`)

### Pre-session screen

- Loaded plan name/week/day.
- Music source selector.
- Spotify connect/login button (if not already linked).
- Big **“Start workout”** button.

### Active session screen

```
+--------------------------------------------------+
|  Workout Timer: 14:23                            |
+--------------------------------------------------+
|  CURRENT: Dumbbell Goblet Squat                  |
|  Target: legs, glutes                            |
|  Set 2 of 3   |   Reps: 10-12                    |
+--------------------------------------------------+
|  [Demo video link]                               |
+--------------------------------------------------+
|  Reps completed:  [ - ]  10  [ + ]               |
|  Work timer: 00:32                               |
+--------------------------------------------------+
|  [ Mark set complete ]                           |
+--------------------------------------------------+
|  Next up: Dumbbell Bent-Over Row                 |
+--------------------------------------------------+
```

### Rest screen

```
+--------------------------------------------------+
|  REST                                            |
|  00:45 remaining                                 |
+--------------------------------------------------+
|  Next: Push-Up  |  Set 2 of 3  |  10-15 reps     |
+--------------------------------------------------+
|  [ Skip rest ]                                   |
+--------------------------------------------------+
```

### Finish screen

- Total duration.
- Sets/exercises completed.
- Option to save session or return home.

---

## Timers

### Work timer

- Auto-starts when the user begins a set.
- Default duration can be estimated from the exercise (`workDuration` field) or left as a stopwatch.
- Audio cue when target time is reached.

### Rest timer

- Auto-starts after a set is marked complete.
- Duration comes from the exercise’s `restSec` field.
- Plays a short beep at 5 seconds and 0 seconds.

### Overall workout timer

- Starts when the session begins and pauses if the user pauses.

### Implementation

All timers live in a single `WorkoutRunner.js` module using `requestAnimationFrame` or `setInterval`. Audio cues can use the Web Audio API or preloaded WAV/MP3 files.

---

## Rep counter

### Manual counter

Default, works on every device:

- Large `-` / `+` buttons.
- Keyboard shortcuts (spacebar = +1).
- Optional haptic feedback on supported devices.

### Sensor-assisted counter (future)

- Accelerometer/gyroscope access via `DeviceMotionEvent`.
- Count a rep when the phone detects a vertical or horizontal motion spike.
- Must request `DeviceMotion` permission on iOS.
- Accuracy varies by exercise, so it should be an optional mode with manual override.

---

## Music integration

### Option A – Built-in royalty-free playlist (open source / no account)

- Host a small set of MP3 files in `wwwroot/music/` or stream from a royalty-free source such as:
  - **Free Music Archive** (API available)
  - **Jamendo** (royalty-free API)
  - **Musopen** (classical, public domain)
- Use the HTML5 `<audio>` element with a playlist.
- Lower volume automatically during rest phases.
- Pros: no user account, works offline, no legal issues with the right license.
- Cons: limited selection, user cannot use their own music.

### Option B – Spotify (requires user premium + app registration)

Spotify is the most practical third-party choice because it has both a Web API and a browser playback SDK.

#### Backend additions

- Store Spotify credentials per user in the database (`UserSpotifyToken` table):
  - `UserId`, `AccessToken` (encrypted), `RefreshToken` (encrypted), `ExpiresAt`.
- New endpoints:
  - `GET /api/spotify/login` – starts OAuth2 PKCE or code-flow login.
  - `GET /api/spotify/callback` – exchanges code for tokens.
  - `POST /api/spotify/refresh` – refreshes an expired token.
  - `GET /api/spotify/playlists` – lists user playlists.
  - `POST /api/spotify/play` – starts playback on the user’s active device.
  - `POST /api/spotify/pause` – pauses playback.
- Use the Spotify Web API (`https://api.spotify.com/v1/`).

#### Frontend additions

- Load the Spotify Web Playback SDK (`https://sdk.scdn.co/spotify-player.js`).
- Create a browser playback device.
- Transfer playback to the browser device.
- Let the user pick a playlist/album to queue.
- Auto-pause during rest timers and resume during work sets (optional).

#### Notes

- Spotify playback in a browser **requires a Premium subscription**.
- Requires registering an app at https://developer.spotify.com/dashboard and adding the `ClientId`/`ClientSecret` to config.
- Safari/iOS can block autoplay; user may need to interact first.

### Option C – User’s own device (simplest, no API)

- Let the user start their own music app in the background.
- The runner page only provides a timer overlay.
- Optional: generate a short Spotify URI (`spotify:playlist:xxx`) or Apple Music URL the user can click to open their app.
- Pros: works with any service, no API keys, no premium check.
- Cons: no auto-pause/volume control.

### Recommended first step

Build **Option A** first (built-in playlist) and **Option C** (user’s own device link). Add **Option B** later if users request Spotify control.

---

## Data model additions

### `WorkoutSession`

Log each completed workout so users can see progress.

```csharp
public class WorkoutSession
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string PlanName { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int DurationSeconds { get; set; }
    public List<CompletedExercise> Exercises { get; set; } = new();
}

public class CompletedExercise
{
    public int Id { get; set; }
    public string ExerciseId { get; set; } = string.Empty;
    public string ExerciseName { get; set; } = string.Empty;
    public int SetsCompleted { get; set; }
    public int TargetSets { get; set; }
    public List<int> RepsPerSet { get; set; } = new();
}
```

### `UserMusicPreference`

Remember the user’s preferred music source.

```csharp
public class UserMusicPreference
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Source { get; set; } = "none"; // none, builtin, spotify, device
    public string? SpotifyPlaylistId { get; set; }
}
```

---

## Backend endpoints to add

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/runner/plan/{savedPlanId}` | Returns a saved plan in runner-friendly format. |
| POST | `/api/runner/sessions` | Saves a completed workout session. |
| GET | `/api/runner/sessions` | Lists the user’s past sessions. |
| GET | `/api/music/tracks` | Returns built-in royalty-free track list. |
| GET | `/api/spotify/login` | Starts Spotify OAuth. |
| GET | `/api/spotify/callback` | Spotify OAuth callback. |
| GET | `/api/spotify/playlists` | Returns user’s Spotify playlists. |
| POST | `/api/spotify/play` | Starts playback. |
| POST | `/api/spotify/pause` | Pauses playback. |

---

## Suggested implementation phases

### Phase 1 – Basic runner (no music) ✅

- Create `/workout.html` and `WorkoutRunner.js`.
- Load a plan from query string or localStorage.
- Walk through exercises/sets.
- Work timer + rest timer.
- Manual rep counter.
- Finish screen.

### Phase 2 – Built-in music ✅

- Built-in generative ambient music using the Web Audio API.
- Play/pause/lower volume during rest timers.

### Phase 3 – Session logging ✅

- Add `WorkoutSession` entity + migration.
- Save completed sessions for logged-in users.
- Show history on the planner page (future enhancement).

### Phase 4 – Motion-sensor rep counter ✅

- Prototype with `DeviceMotionEvent`.
- Add toggle to enable/disable with manual override.

### Phase 5 – Spotify / third-party music integration (future)

- Register Spotify app.
- Add OAuth endpoints and token storage.
- Integrate Spotify Web Playback SDK.
- Add playlist/device selection UI.

---

## Open questions

1. ✅ Start with built-in generative music; third-party integrations deferred.
2. ✅ Prototype motion-sensor rep counter implemented.
3. ✅ Sessions saved only for logged-in users.
4. Do you want to add a **session history** section to the planner page now, or wait until later?
5. Do you want to pursue **Spotify integration** next, or focus on other features first?
