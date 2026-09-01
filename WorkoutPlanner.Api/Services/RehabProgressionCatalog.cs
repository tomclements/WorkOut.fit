using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Curated per-area rehab progressions. Each chain moves from gentle, low-load
/// movement toward normal training. Stages reference a demo id only where the
/// catalog/demo actually exists, so thumbnails never 404.
/// </summary>
public static class RehabProgressionCatalog
{
    private const string DefaultStop = "Stop if you feel sharp pain, numbness, or symptoms that get worse over the next 24 hours.";

    private static readonly Dictionary<string, RehabProgressionArea> Areas = new(StringComparer.OrdinalIgnoreCase)
    {
        ["shoulder"] = new RehabProgressionArea
        {
            Area = "shoulder",
            Label = "Shoulder",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Wall slides / scapular setting",
                    Cue = "Back against a wall, ribs down, slide your forearms up and down slowly.",
                    StopIf = "Stop if you feel a pinch or sharp pain at the front of the shoulder." },
                new() { Stage = 2, Name = "Band external rotation",
                    Cue = "Elbow glued to your side, rotate the hand outward against a light band, slow on the way back.",
                    StopIf = "Stop if the shoulder aches for hours afterwards.",
                    DemoExerciseId = "external-rotation-with-band" },
                new() { Stage = 3, Name = "Band pull-apart / face pull",
                    Cue = "Pull the band apart to chest height, squeezing your shoulder blades together.",
                    StopIf = "Stop if pain climbs during the set.",
                    DemoExerciseId = "band-pull-apart" },
                new() { Stage = 4, Name = "Controlled row \u2192 light press",
                    Cue = "Reintroduce rowing, then pressing, only once rows are completely pain-free.",
                    StopIf = "Stop if pressing brings back the original pain \u2014 go back a stage." }
            }
        },
        ["rotator-cuff"] = new RehabProgressionArea
        {
            Area = "rotator-cuff",
            Label = "Rotator cuff",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Pendulum swings",
                    Cue = "Lean forward, let the arm hang, swing gently in small circles. Keep it passive.",
                    StopIf = "Stop if the shoulder pinches or aches sharply." },
                new() { Stage = 2, Name = "Band external rotation",
                    Cue = "Elbow glued to your side, rotate the hand outward against a light band, slow on the way back.",
                    StopIf = "Stop if the shoulder aches for hours afterwards.",
                    DemoExerciseId = "external-rotation-with-band" },
                new() { Stage = 3, Name = "Band pull-apart",
                    Cue = "Pull the band apart to chest height, squeezing your shoulder blades together.",
                    StopIf = "Stop if pain climbs during the set.",
                    DemoExerciseId = "band-pull-apart" },
                new() { Stage = 4, Name = "Light rows (no overhead)",
                    Cue = "Reintroduce rowing at light load; avoid overhead pressing until pain-free.",
                    StopIf = "Stop if pressing brings back the original pain \u2014 go back a stage." }
            }
        },
        ["knee"] = new RehabProgressionArea
        {
            Area = "knee",
            Label = "Knee",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Quad sets / straight-leg raise",
                    Cue = "Tighten the thigh with the leg straight, hold 5s, then progress to raising the leg.",
                    StopIf = "Stop if the knee swells or locks." },
                new() { Stage = 2, Name = "Shallow wall sit",
                    Cue = "Back to a wall, slide down only 30\u201340\u00b0, hold. Keep the angle small and pain-free.",
                    StopIf = "Stop if you feel pain under or around the kneecap." },
                new() { Stage = 3, Name = "Low step-up",
                    Cue = "Step up onto a low stair, drive through the whole foot, step down slowly.",
                    StopIf = "Stop if the knee feels unstable or painful on the way down." },
                new() { Stage = 4, Name = "Split squat \u2192 squat",
                    Cue = "Build depth gradually; only add load once bodyweight squats are pain-free.",
                    StopIf = DefaultStop }
            }
        },
        ["patellar"] = new RehabProgressionArea
        {
            Area = "patellar",
            Label = "Kneecap",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Quad sets",
                    Cue = "Tighten the thigh muscle with the leg straight, hold 5s, repeat. This activates the VMO without loading the kneecap.",
                    StopIf = "Stop if you feel pain behind or around the kneecap." },
                new() { Stage = 2, Name = "Shallow wall sit",
                    Cue = "Back against a wall, slide down only 30\u201340\u00b0. Keep the angle shallow and pain-free.",
                    StopIf = "Stop if the kneecap aches during or after the hold." },
                new() { Stage = 3, Name = "Low step-up",
                    Cue = "Step onto a low box, drive through the whole foot, step down under control.",
                    StopIf = "Stop if the knee feels unstable or the kneecap tracks poorly." },
                new() { Stage = 4, Name = "Partial squat",
                    Cue = "Bodyweight squat to a comfortable depth; do not push through kneecap pain.",
                    StopIf = DefaultStop }
            }
        },
        ["lower-back"] = new RehabProgressionArea
        {
            Area = "lower-back",
            Label = "Lower back",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Cat-cow / pelvic tilts",
                    Cue = "Move gently through a comfortable range; keep it slow and easy.",
                    StopIf = "Stop if pain radiates down a leg or you feel numbness/tingling." },
                new() { Stage = 2, Name = "Bird-dog",
                    Cue = "On all fours, extend opposite arm and leg, keep the spine still, alternate sides.",
                    StopIf = "Stop if your back arches or you feel it working in the spine, not the core." },
                new() { Stage = 3, Name = "Glute bridge",
                    Cue = "Drive through your heels, squeeze the glutes, avoid overarching at the top.",
                    StopIf = DefaultStop },
                new() { Stage = 4, Name = "Light hip-hinge pattern",
                    Cue = "Practice hinging at the hips with a neutral spine before adding any load.",
                    StopIf = "Stop if you feel the hinge in your back rather than your hips." }
            }
        },
        ["wrist"] = new RehabProgressionArea
        {
            Area = "wrist",
            Label = "Wrist",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Wrist circles / gentle range",
                    Cue = "Slow, pain-free circles and flexion/extension without load.",
                    StopIf = DefaultStop },
                new() { Stage = 2, Name = "Isometric towel squeeze",
                    Cue = "Squeeze a rolled towel gently and hold; no movement, no pain.",
                    StopIf = DefaultStop },
                new() { Stage = 3, Name = "Light wrist extension / flexion",
                    Cue = "Forearm supported, move a light dumbbell through a small range.",
                    StopIf = DefaultStop },
                new() { Stage = 4, Name = "Light carries / pressing",
                    Cue = "Return to loaded grip work gradually, wrist neutral.",
                    StopIf = DefaultStop }
            }
        },
        ["elbow"] = new RehabProgressionArea
        {
            Area = "elbow",
            Label = "Elbow",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Pain-free range of motion",
                    Cue = "Gently bend and straighten through a comfortable range, several times a day.",
                    StopIf = DefaultStop },
                new() { Stage = 2, Name = "Isometric holds",
                    Cue = "Hold the elbow at ~90° against light resistance without moving.",
                    StopIf = DefaultStop },
                new() { Stage = 3, Name = "Slow eccentric wrist / elbow",
                    Cue = "Lower a light weight slowly (3–4s); this is the workhorse for tendon rehab.",
                    StopIf = "Stop if pain exceeds mild discomfort during or after." },
                new() { Stage = 4, Name = "Gradual return to pulls / presses",
                    Cue = "Add gripping and loaded movements back in small, pain-free steps.",
                    StopIf = DefaultStop }
            }
        },
        ["neck"] = new RehabProgressionArea
        {
            Area = "neck",
            Label = "Neck",
            Stages = new List<RehabProgressionStage>
            {
                new() { Stage = 1, Name = "Chin tucks",
                    Cue = "Gently draw the head straight back (make a double chin), hold 3–5s.",
                    StopIf = "Stop if you feel dizziness, headache, or arm symptoms." },
                new() { Stage = 2, Name = "Isometric holds",
                    Cue = "Press your hand against your forehead/side and resist without moving.",
                    StopIf = DefaultStop },
                new() { Stage = 3, Name = "Controlled range",
                    Cue = "Slow rotations and tilts within a comfortable range.",
                    StopIf = DefaultStop },
                new() { Stage = 4, Name = "Resume loading carefully",
                    Cue = "Return to loaded shrugs/overhead work only once fully symptom-free.",
                    StopIf = DefaultStop }
            }
        }
    };

    /// <summary>Return the progression chains for the given rehab area keys (shoulder, knee, ...).</summary>
    public static List<RehabProgressionArea> GetFor(IEnumerable<string>? rehabAreas)
    {
        var result = new List<RehabProgressionArea>();
        if (rehabAreas == null) return result;
        foreach (var area in rehabAreas.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (Areas.TryGetValue(area, out var chain)) result.Add(chain);
        }
        return result;
    }
}
