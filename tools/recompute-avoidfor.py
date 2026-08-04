#!/usr/bin/env python3
"""Mechanics-first injury restriction engine for the exercise catalog.

Each exercise gets a structured `mechanics` block (a name-independent anatomical
descriptor: hand support, shoulder/elbow position, grip, spinal/hip/knee load,
neck compression, rehab intent). A deterministic engine maps that descriptor to
`avoidFor` — deliberately mirroring WorkoutPlanner.Api/Services/InjuryRules.cs.

Rules of thumb per joint:
  shoulder : weight-bearing through the hand, overhead / elevated / horizontal
             placing. Rehab (rotator-cuff) work is deliberately exempt.
  elbow    : extension or flexion under load (isometric holds are not tagged).
  wrist    : weight-bearing through the hand, or a hard loaded pulling grip.
  knee     : deep/moderate knee flexion or any lower-limb primary work.
  lower-back : spinal flexion / axial compression / rotation / lateral buckling,
             or any hip-hinge pattern.
  neck     : cervical compression (shrugs, neck work, behind-the-neck).

Usage:
  python tools/recompute-avoidfor.py --dry-run   # preview tag diffs
  python tools/recompute-avoidfor.py --write     # persist mechanics + avoidFor
"""
import json
import re
import sys
from collections import Counter

SEED = "WorkoutPlanner.Api/Data/exercises.json"

ARM = {"biceps", "triceps", "forearms"}
LEG = {"quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"}

REHAB_SHOULDER = ["face pull", "rear delt", "rear-delt", "rear deltoid", "reverse fly",
                  "reverse flye", "external rotation", "pull-apart", "band pull"]

# ---- token sets -------------------------------------------------------------

HAND_SUPPORT = [
    "plank", "push-up", "pushup", "press-up", "pressup", "dip", "handstand",
    "mountain climber", "crawl", "burpee", "inchworm", "body-up", "muscle-up",
    "wheelbarrow", "arm-balance", "rollout", "pike", "pull-up", "pullup",
    "chin-up", "chinups", "renegade", "inverted row", "ring row",
    "kick-up", "kipping", "bear",
]
OVERHEAD = [
    "overhead", "shoulder press", "military press", "arnold press", "push press",
    "press jerk", "jerk", "snatch", "clean", "thruster", "wall ball", "handstand",
    "behind-the-neck", "behind the neck", "behind the head", "windmill", "pullover",
    "around the world",
    "lateral raise", "side raise", "front raise", "upright row", "y-raise", "y raise",
    "pull-up", "pullup", "chin-up", "chinups", "pike", "toes-to-bar", "toes to bar",
]
ELEVATED = ["landmine press", "z-press", "90-degree", "90 degree", "chest press"]


def _elevated(name):
    if has_tokens(name, ["dip"]) and "hip" not in (" " + (name or "").lower() + " ") \
            and "leg" not in (" " + (name or "").lower() + " "):
        return True
    # incline presses elevate the shoulder; incline curls/pulls stay low
    if has_tokens(name, ["incline"]):
        return has_tokens(name, ["press", "push-up", "pushup"])
    return bool(ELEVATED and has_tokens(name, ELEVATED))


def _low_press(name):
    # triceps presses/pushdowns and skull crushers keep the arm at the side (low)
    return has_tokens(name, ["pushdown", "skull", "french", "triceps press", "tricep press"])


def _is_row(name):
    return has_tokens(name, ["row"])
HORIZONTAL = [
    "bench press", "chest press", "chest fly", "chest flye", "flye", "fly",
    "pec deck", "crossover", "cross over", "chest pass", "row", "push-up", "pushup",
    "press-up", "pressup", "floor press", "plank", "push",
]
LOW = ["pulldown", "pull-down", "straight-arm", "pushdown", "face pull", "curl",
       "kickback", "shrug", "external rotation"]

ELBOW_EXTENSION = [
    "press", "push-up", "pushup", "press-up", "pressup", "dip", "pushdown",
    "extension", "skull crusher", "french press", "kickback", "jerk", "thruster",
    "fly", "flye", "bench press", "chest press", "body-up", "muscle-up",
]
ELBOW_FLEXION = [
    "curl", "row", "pull-up", "pullup", "chin-up", "chinups", "deadlift",
    "dead lift", "clean", "snatch", "pulldown", "pull-down",
]
GRIPLOAD = [
    "deadlift", "dead lift", "pull-up", "pullup", "chin-up", "chinups", "shrug",
    "farmer", "carry", "clean", "snatch", "grip", "dead hang",
]

SPINE_FLEXION = ["sit-up", "situp", "crunch", "v-up", "jackknife", "rollout", "wheel",
                 "toes-to-bar", "toes to bar", "leg raise", "knee raise"]
SPINE_ROTATION = ["russian twist", "woodchop", "chop", "windshield", "landmine",
                  "medicine ball slam", "torso twist", "rotational", "corkscrew",
                  "180", "twist", "windmill"]
SPINE_LATERAL = ["side bend", "lateral flexion", "side crunch"]
SPINE_EXTENSION = ["back extension", "hyperextension", "superman", "reverse hyper",
                   "good morning", "pull-through"]
SPINE_AXIAL = ["overhead", "shoulder press", "military press", "push press", "jerk",
               "snatch", "clean", "thruster", "wall ball", "carry", "farmer",
               "deadlift", "upright row", "squat", "yoke", "burpee", "box jump",
               "rack pull"]
HIP_HINGE = ["deadlift", "good morning", "stiff-leg", "stiff leg", "straight-leg",
             "straight leg", "sumo deadlift", "swing", "rack pull"]

HIP_HINGE = ["deadlift", "good morning", "stiff-leg", "stiff leg", "straight-leg",
             "straight leg", "sumo deadlift", "swing"]
HIP_SQUAT = ["squat", "lunge", "leg press", "step-up", "step up", "wall sit", "pistol",
             "bulgarian", "split squat", "hack", "box squat", "sissy", "thruster",
             "wall ball", "clean", "snatch", "jerk"]
KNEE_DEEP = ["squat", "lunge", "leg press", "step-up", "step up", "pistol",
             "bulgarian", "split squat", "hack", "box squat", "sissy", "wall sit",
             "leg curl", "leg extension", "thruster", "wall ball", "clean", "snatch",
             "jerk", "clean and", "burpee", "mountain climber"]
KNEE_MODERATE = ["deadlift", "dead lift", "swing", "sumo", "stiff-leg", "stiff leg",
                 "straight-leg", "straight leg", "rdl", "snatch", "clean", "jerk"]
NECK_TOKENS = ["shrug", "neck", "behind-the-neck", "behind the neck", "yoke"]

BENT_OVER_ROW = ["bent-over", "bent over", "t-bar", "pendlay", "yates", "barbell row",
                 "smith machine bent over"]


def has_tokens(name, tokens):
    """Word/phrase match with plural support: 'dip' also hits 'Dips'."""
    n = " " + (name or "").lower() + " "
    for t in tokens:
        if " " in t or "-" in t:
            if t.lower() in n:
                return True
        elif re.search(r"\b" + re.escape(t) + r"(?:s|es)?\b", n):
            return True
    return False


def _default_mechanics():
    return {
        "handSupport": False, "chain": "open", "shoulder": "neutral",
        "elbow": "none", "grip": "none", "gripLoad": False, "spine": "neutral",
        "hip": "neutral", "knee": "none", "neckCompress": False,
    }


def author_mechanics(ex):
    n = (ex.get("name") or "").lower()
    m = _default_mechanics()

    if has_tokens(ex.get("name", ""), REHAB_SHOULDER):
        m["rehab"] = "rotator-cuff"

    is_leg_press = has_tokens(n, ["leg press"])
    is_leg_iso = has_tokens(n, ["leg curl", "leg extension"])

    # Gorilla Chin/Crunch is a weighted chin-up + crunch hybrid: hanging-pull
    # overhead plus spinal flexion. Name only carries "chin", not "chin-up".
    gorilla_chin = has_tokens(ex.get("name", ""), ["gorilla chin"])

        # hand support — weight on the hands (forearm planks bear on the forearms)
    if gorilla_chin:
        m["handSupport"] = True
        m["chain"] = "closed"
    else:
        if has_tokens(n, ["plank"]) and ("forearm" in n or "elbow" in n):
            hand_support_tokens = [t for t in HAND_SUPPORT if t != "plank"]
        else:
            hand_support_tokens = HAND_SUPPORT
        m["handSupport"] = has_tokens(ex.get("name", ""), hand_support_tokens)
        if m["handSupport"] or has_tokens(n, ["inverted row", "ring row", "hang"]):
            m["chain"] = "closed"

    # shoulder position (order matters: overhead → elevated → horizontal → low)
    if gorilla_chin:
        m["shoulder"] = "overhead"
    elif has_tokens(ex.get("name", ""), OVERHEAD):
        m["shoulder"] = "overhead"
    elif is_leg_press:
        m["shoulder"] = "neutral"
    elif _elevated(ex.get("name", "")):
        m["shoulder"] = "elevated"
    elif has_tokens(ex.get("name", ""), HORIZONTAL) \
            or (has_tokens(ex.get("name", ""), ["press"]) and not _low_press(ex.get("name", ""))):
        m["shoulder"] = "horizontal"
    elif has_tokens(ex.get("name", ""), LOW):
        m["shoulder"] = "low"

    # elbow demand
    if is_leg_press or is_leg_iso:
        m["elbow"] = "none"
    elif has_tokens(ex.get("name", ""), ELBOW_EXTENSION):
        m["elbow"] = "extension"
    elif has_tokens(ex.get("name", ""), ELBOW_FLEXION):
        m["elbow"] = "flexion"
    elif m["handSupport"]:
        m["elbow"] = "extension" if has_tokens(
            ex.get("name", ""), ["push", "dip", "body-up", "muscle-up",
                                 "press-up", "pressup"]) else "isometric"

    # grip + hard grip load
    if has_tokens(n, ["chin-up", "chinups", "curl", "bicep"]):
        m["grip"] = "supinated"
    elif has_tokens(n, ["pull-up", "pullup", "deadlift", "barbell row", "shrug"]):
        m["grip"] = "pronated"
    m["gripLoad"] = has_tokens(ex.get("name", ""), GRIPLOAD)

    # hip / knee
    if is_leg_iso or has_tokens(ex.get("name", ""), KNEE_DEEP):
        m["knee"] = "deep"
    elif has_tokens(ex.get("name", ""), KNEE_MODERATE):
        m["knee"] = "moderate"

    if has_tokens(ex.get("name", ""), HIP_HINGE) \
            or (has_tokens(ex.get("name", ""), BENT_OVER_ROW) and not has_tokens(ex.get("name", ""), ["seated", "supported"])):
        m["hip"] = "hinge"
    elif has_tokens(ex.get("name", ""), HIP_SQUAT):
        m["hip"] = "squat"

    # spine
    if has_tokens(ex.get("name", ""), SPINE_FLEXION):
        m["spine"] = "flexion"
    elif has_tokens(ex.get("name", ""), SPINE_ROTATION):
        m["spine"] = "rotation"
    elif has_tokens(ex.get("name", ""), SPINE_LATERAL):
        m["spine"] = "lateral"
    elif has_tokens(ex.get("name", ""), SPINE_EXTENSION):
        m["spine"] = "extension"
    elif has_tokens(ex.get("name", ""), SPINE_AXIAL):
        m["spine"] = "axial"

    if has_tokens(ex.get("name", ""), NECK_TOKENS):
        m["neckCompress"] = True

    # Gorilla Chin/Crunch is a weighted chin-up + crunch hybrid: it hangs from
    # an overhand grip and pulls overhead, so it loads shoulder/elbow/wrist in
    # addition to the spine flexion the crunch component already flags.
    if gorilla_chin:
        m["shoulder"] = "overhead"
        m["elbow"] = "flexion"
        m["grip"] = "pronated"
        m["gripLoad"] = True

    return m


def compute_avoidance(primary, m):
    """Mirror of InjuryRules.ComputeAvoidance (must stay in lockstep)."""
    primary = {p.lower() for p in primary}
    rehab = (m.get("rehab") or "").lower()
    rehabilitative = rehab in {"rotator-cuff", "patellar"}
    avoid = set()

    # shoulder
    if not rehabilitative:
        supported = m["handSupport"]
        pos = m["shoulder"]
        if supported or pos in {"overhead", "elevated", "horizontal"} or "shoulders" in primary:
            avoid.add("shoulder")

    # elbow
    arm_primary = bool(primary & ARM)
    loads_elbow = m["elbow"] in {"extension", "flexion"}
    if loads_elbow or arm_primary:
        avoid.add("elbow")

    # wrist
    if m["handSupport"] or m["gripLoad"]:
        avoid.add("wrist")

    # knee
    leg = bool(primary & LEG)
    deep_flex = m["knee"] in {"deep", "moderate"}
    if deep_flex or leg or m["hip"] == "squat":
        avoid.add("knee")

    # lower-back
    spine = m["spine"]
    if (spine in {"flexion", "axial", "rotation", "lateral", "extension"}
            or m["hip"] == "hinge"):
        avoid.add("lower-back")

    # neck
    if m["neckCompress"]:
        avoid.add("neck")

    return sorted(avoid, key=str.lower)


def main():
    dry = "--write" not in sys.argv
    with open(SEED, encoding="utf-8") as f:
        data = json.load(f)

    gained = Counter()
    removed = Counter()
    gained_ex = {t: [] for t in ["shoulder", "elbow", "wrist", "knee", "lower-back", "neck"]}
    removed_ex = {t: [] for t in ["shoulder", "elbow", "wrist", "knee", "lower-back", "neck"]}

    for ex in data:
        before = set(ex.get("avoidFor", []))
        m = author_mechanics(ex)
        ex["mechanics"] = m
        after = set(compute_avoidance(ex.get("primary", []), m))
        ex["avoidFor"] = sorted(after, key=str.lower)
        gained.update(after - before)
        removed.update(before - after)
        for t in after - before:
            if len(gained_ex[t]) < 5:
                gained_ex[t].append(ex["name"])
        for t in before - after:
            if len(removed_ex[t]) < 5:
                removed_ex[t].append(ex["name"])

    print("exercise count:", len(data))
    print("-- net tag changes --")
    for t in ["shoulder", "elbow", "wrist", "knee", "lower-back", "neck"]:
        print(f"{t:10s} +{gained[t]:4d}  -{removed[t]:4d}  gained eg: {gained_ex[t]}  removed eg: {removed_ex[t]}")

    if dry:
        print("\n(dry run — pass --write to persist)")
        return

    with open(SEED, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("\nwritten:", SEED)


if __name__ == "__main__":
    main()