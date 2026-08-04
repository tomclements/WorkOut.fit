#!/usr/bin/env python3
"""Recompute injury restrictions (avoidFor) for every exercise using general
anatomical / orthopedic knowledge.

Rule of thumb per joint:
  shoulder : overhead or loaded-above-horizontal pressing, weight-bearing on the
             hand, and vertical pulling that pulls the shoulder overhead.
  elbow    : arm isolation, pressing, vertical pulling, rows, dips, and grip-heavy
             work (bench/dips/push-ups/curls/extensions/carries).
  wrist    : weight-bearing through the hand, and grip/forearm work.
  knee     : primary lower-limb work plus deep knee-flexion movements.
  lower-back : axial spinal load, heavy spinal flexion/extension under load, and
               loaded carries.
  neck     : compression/tension through the cervical spine (shrugs, behind-neck,
             neck-dominant work).

Usage:
  python tools/recompute-avoidfor.py --dry-run
  python tools/recompute-avoidfor.py --write
"""
import json
import re
import sys
from collections import Counter

SEED = "WorkoutPlanner.Api/Data/exercises.json"

ARM = {"biceps", "triceps", "forearms", "grip"}
LEG = {"quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors",
       "hip-flexors", "legs"}
SHOULDER = {"shoulders", "rear-shoulders"}

# ---- name helpers -----------------------------------------------------------
def has_tokens(name, tokens):
    """Word/phrase match with plural support: 'dip' also hits 'Dips'."""
    n = " " + name.lower() + " "
    for t in tokens:
        if " " in t or "-" in t:
            if t.lower() in n:
                return True
        elif re.search(r"\b" + re.escape(t) + r"(?:s|es)?\b", n):
            return True
    return False


def flag(ex, *tags):
    """Merge tags into the exercise's avoidFor set."""
    cur = set(ex.setdefault("avoidFor", []))
    for t in tags:
        cur.add(t)
    ex["avoidFor"] = sorted(cur, key=str.lower)

# ---- movement-signal token sets --------------------------------------------
OVERHEAD_PRESS = [
    "overhead press", "overhead", "shoulder press", "military press", "arnold press",
    "push press", "press jerk", "jerk", "snatch", "clean", "thruster", "wall ball",
    "handstand", "behind-the-neck", "behind the neck", "windmill", "pushdown",
    "pullover", "around the world",
]
WEIGHT_BEARING_HANDS = [
    "plank", "push-up", "pushup", "press-up", "pressup", "dip", "handstand",
    "mountain climber", "crawl", "burpee", "inchworm", "body-up", "muscle-up",
    "wheelbarrow", "arm-balance", "bear", "wheel", "rollout", "pike",
]
LAT_OVERHEAD = ["pull-up", "pullup", "chin-up", "chinups", "behind-the-neck"]
SHOULDER_ISOLATION = ["lateral raise", "side raise", "front raise", "upright row",
                      "rear-delt", "rear delt", "rear"]
TRICEPS_WORK = ["triceps extension", "tricep extension", "triceps pushdown",
                "tricep pushdown", "skull crusher", "french press"]
CHEST_PUSH = ["bench press", "chest press", "chest fly", "chest flye", "flye",
              "pec deck", "fly", "crossover", "cross over", "chest push",
              "chest pass"]

ELBOW_TOKENS = ["bench press", "dip", "push-up", "pushup", "press-up", "pressup",
                "pull-up", "pullup", "chin-up", "chinups", "pushdown", "extension",
                "skull crusher", "french press", "curl", "kickback", "row", "carry",
                "deadlift", "shrug", "fly", "flye", "press", "body-up", "muscle-up",
                "clean", "snatch", "burpee"]

WRIST_TOKENS = ["wrist curl", "wrist roller", "reverse curl", "wrist", "grip",
                "farmer", "deadlift", "carry", "shrug", "handstand"]

KNEE_TOKENS = ["squat", "lunge", "leg press", "leg extension", "leg curl", "step-up",
               "step up", "wall sit", "pistol", "bulgarian", "split squat", "sumo",
               "box jump", "jump", "lateral lunge", "curtsey", "snatch", "clean",
               "thruster", "wall ball", "leg press", "hack", "sled", "sprint",
               "climbing", "sled", "jerk", "push press"]

LOWER_BACK_TOKENS = [
    "deadlift", "good morning", "good-morning", "stiff-leg", "stiff leg",
    "straight-leg", "straight leg", "squat", "sit-up", "situp", "crunch", "v-up",
    "toes-to-bar", "toes to bar", "leg raise", "back extension", "hyperextension",
    "reverse hyper", "overhead", "shoulder press", "military press", "push press",
    "jerk", "snatch", "clean", "thruster", "carry", "farmer", "suitcase",
    "barbell row", "t-bar", "pendlay", "bent-over", "bent over", "yates",
    "kettlebell swing", "box jump", "burpee", "windmill", "rollout",
    "pull through", "side bend", "bent press",
]

NECK_TOKENS = ["shrug", "behind-the-neck", "behind the neck", "neck", "yoke"]

# Rehabilitative / generally shoulder-safe work (external rotation, rear delt, scapular)
# — NOT contraindicated for a rotator cuff injury, so never tag shoulder from these.
REHAB_SHOULDER = ["face pull", "rear delt", "rear-delt", "reverse fly", "reverse flye",
                  "external rotation", "pull-apart", "band pull"]


def classify(ex):
    name = ex.get("name", "")
    primary = {p.lower() for p in ex.get("primary", [])}
    secondary = {s.lower() for s in ex.get("secondary", [])}
    all_m = primary | secondary
    slot = ex.get("slot", "")

    # ---- shoulder ----
    is_leg_press = "leg press" in name.lower()
    press_flag = has_tokens(name, ["press"]) and not is_leg_press
    row_flag = has_tokens(name, ["row"]) and "supported" not in name.lower()
    dip_flag = has_tokens(name, ["dip"]) and "hip" not in name.lower()

    if (primary & SHOULDER) \
            or has_tokens(name, OVERHEAD_PRESS) or has_tokens(name, WEIGHT_BEARING_HANDS) \
            or has_tokens(name, LAT_OVERHEAD) or has_tokens(name, SHOULDER_ISOLATION) \
            or has_tokens(name, CHEST_PUSH) or has_tokens(name, TRICEPS_WORK) \
            or press_flag or row_flag or dip_flag:
        flag(ex, "shoulder")
    # Rehabilitative rear-delt / external-rotation work is shoulder-safe
    if has_tokens(name, REHAB_SHOULDER):
        ex["avoidFor"] = [t for t in ex.get("avoidFor", []) if t != "shoulder"]

    # ---- elbow ----
    if primary & ARM:
        flag(ex, "elbow")
    else:
        is_leg_named = "leg" in name.lower()
        elbow_tokens = ELBOW_TOKENS
        if is_leg_named:
            # "leg curl", "leg extension", "leg press" load the knee, not the elbow
            elbow_tokens = [t for t in ELBOW_TOKENS
                            if t not in ("curl", "extension", "press", "leg press")]
        if has_tokens(name, elbow_tokens):
            flag(ex, "elbow")

    # ---- wrist ----
    if primary & ARM:
        flag(ex, "wrist")
    elif has_tokens(name, WEIGHT_BEARING_HANDS) or has_tokens(name, WRIST_TOKENS):
        flag(ex, "wrist")

    # ---- knee ----
    if primary & LEG or has_tokens(name, KNEE_TOKENS):
        flag(ex, "knee")

    # ---- lower-back ----
    if "lower back" in primary or slot == "carry" or has_tokens(name, LOWER_BACK_TOKENS):
        flag(ex, "lower-back")

    # ---- neck ----
    if "neck" in primary or has_tokens(name, NECK_TOKENS):
        flag(ex, "neck")


def main():
    dry = "--write" not in sys.argv
    with open(SEED, encoding="utf-8") as f:
        data = json.load(f)

    changes = Counter()
    gained = {t: [] for t in ["shoulder", "elbow", "wrist", "knee", "lower-back", "neck"]}
    removed = {t: [] for t in ["shoulder", "elbow", "wrist", "knee", "lower-back", "neck"]}

    for ex in data:
        before = set(ex.get("avoidFor", []))
        # reset to a clean, authoritative state (drop stale tags)
        ex["avoidFor"] = []
        classify(ex)
        after = set(ex["avoidFor"])
        for t in after - before:
            changes[t] += 1
            gained[t].append(ex["name"])
        for t in before - after:
            removed[t].append(ex["name"])

    print("exercise count:", len(data))
    print("\n-- net tag changes --")
    for t in sorted(changes, key=str.lower):
        print(f"{t:10s} +{changes[t]:4d}  removed {len(removed[t])}  example: {gained[t][:3]}")

    if dry:
        print("\n(dry run — pass --write to persist)")
        return

    with open(SEED, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("\nwritten:", SEED)


if __name__ == "__main__":
    main()
