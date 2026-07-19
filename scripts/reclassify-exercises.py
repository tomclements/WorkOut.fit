#!/usr/bin/env python3
"""Reclassify exercises.json with consistent slots + required equipment.

Taxonomy (must stay aligned with ExerciseTaxonomy.cs):
  slots: push | pull | legs | core | carry  (no "total")
  equipment: AND list of required gear ids

Usage:
  python scripts/reclassify-exercises.py
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXERCISES_PATH = ROOT / "WorkoutPlanner.Api" / "Data" / "exercises.json"
FREE_DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"

PRIMARY_TO_SLOT = {
    "chest": "push",
    "triceps": "push",
    "shoulders": "push",
    "rear-shoulders": "pull",
    "lats": "pull",
    "biceps": "pull",
    "middle back": "pull",
    "traps": "pull",
    "forearms": "pull",
    "neck": "pull",
    "back": "pull",
    "quadriceps": "legs",
    "hamstrings": "legs",
    "calves": "legs",
    "glutes": "legs",
    "adductors": "legs",
    "abductors": "legs",
    "hip-flexors": "legs",
    "legs": "legs",
    "abdominals": "core",
    "core": "core",
    "obliques": "core",
    "lower back": "core",
    "grip": "carry",
}


def normalize_force(force: str | None) -> str:
    f = (force or "").lower()
    return f if f in ("push", "pull", "static") else "unknown"


def normalize_mechanic(mechanic: str | None) -> str:
    m = (mechanic or "").lower()
    return m if m in ("compound", "isolation") else "unknown"


def infer_slot(primary: list[str], force: str | None, name: str) -> str:
    n = name.lower()
    if re.search(r"farmer.?s?\s*carry|suitcase\s*carry|yoke\s*walk|loaded\s*carry", n):
        return "carry"
    if re.search(r"mountain\s*climber", n):
        return "core"
    if re.search(r"\bburpee", n):
        return "legs"
    if re.search(r"clean|snatch|jerk|thruster", n):
        return "legs"

    for m in primary or []:
        if m in PRIMARY_TO_SLOT:
            return PRIMARY_TO_SLOT[m]

    f = (force or "").lower()
    if f == "push":
        return "push"
    if f == "pull":
        return "pull"
    if f == "static":
        return "core"
    return "core"


def needs_bench(n: str, eq: set[str]) -> bool:
    """Whether the exercise needs a bench (or box/seat modeled as bench).

    Must stay aligned with ExerciseTaxonomy.NeedsBench in C#.
    """
    # Explicit floor work never needs a bench
    if re.search(r"\bfloor\b", n):
        return False

    # Name literally includes "bench"
    if re.search(r"\bbench\b", n):
        return True

    # Platform / box patterns (box modeled as bench in our catalog)
    if re.search(r"\bbox squat\b|\bstep[ -]?ups?\b|\bhip thrust\b", n):
        return True

    # Adjustable / flat bench positions
    if re.search(r"\b(incline|decline)\b", n):
        return True

    # Preacher pad / spider curl (not "spider crawl")
    if "preacher" in n or re.search(r"spider\s*curl", n):
        return True

    # Classic bench-lying lifts even when "bench" is omitted
    if re.search(r"pullover|skull\s*crush|french\s*press|\bjm\s*press\b", n):
        return True

    # Concentration curls (standing is the exception)
    if re.search(r"concentration\s*curl", n) and "standing" not in n:
        return True

    # Seated free-weight work needs a bench/seat; cable/machines provide their own
    if re.search(r"\bseated\b", n):
        if "cable" in eq or "machines" in eq:
            return False
        if re.search(r"cable|machine|smith|leg\s*press|hack\s*squat|pulldown", n):
            return False
        return True

    # Lying / prone / supine free-weight work is almost always on a bench
    if re.search(r"\b(lying|prone|supine)\b", n):
        if "stability-ball" in eq or "foam-roller" in eq:
            return False
        if "medicine ball" in n or "medicine-ball" in eq:
            return False
        if re.search(r"\b(throw|slam|toss)\b", n):
            return False
        if eq & {"dumbbells", "barbell", "ez-bar", "kettlebell", "bands", "cable"}:
            return True
        if re.search(r"dumbbell|barbell|ez[ -]?bar|kettlebell", n):
            return True

    return False


def enrich_equipment(name: str, equipment: list[str]) -> list[str]:
    eq = set(equipment or [])
    n = name.lower()

    if any(x in n for x in ("exercise ball", "stability ball", "swiss ball", "physio ball", "bosu")):
        eq.add("stability-ball")
    if "medicine ball" in n:
        eq.add("medicine-ball")
    if re.search(r"pull[ -]?up|chin[ -]?up|pullup|chinup", n):
        eq.add("pullup-bar")
    if "cable" in n:
        eq.add("cable")
    if any(x in n for x in ("smith", "leg press", "hack squat", "chest press machine", "pec deck")):
        eq.add("machines")
    if "kettlebell" in n:
        eq.add("kettlebell")
    if any(x in n for x in ("barbell", "ez-bar", "ez bar", "olympic bar", "trap bar", "hex bar")):
        eq.add("barbell")
    if "dumbbell" in n:
        eq.add("dumbbells")
    if re.search(r"\bbands?\b", n) or "band " in n:
        eq.add("bands")
    if "foam roll" in n or "foam roller" in n or "smr" in n:
        eq.add("foam-roller")
    if needs_bench(n, eq):
        eq.add("bench")

    if not eq:
        eq.add("bodyweight")
    return sorted(eq)


def load_source_by_name() -> dict[str, dict]:
    print(f"Downloading {FREE_DB_URL} ...")
    with urllib.request.urlopen(FREE_DB_URL) as resp:
        src = json.loads(resp.read().decode())
    by_name = {}
    for e in src:
        by_name[e["name"].lower()] = e
    return by_name


def main():
    data = json.loads(EXERCISES_PATH.read_text(encoding="utf-8"))
    try:
        source = load_source_by_name()
    except Exception as ex:
        print(f"Warning: could not load free-exercise-db ({ex}); reclassifying from local fields only")
        source = {}

    slot_before = {}
    for e in data:
        slot_before[e["id"]] = e.get("slot")

    changed = 0
    for e in data:
        src = source.get(e["name"].lower())
        force = normalize_force(src.get("force") if src else e.get("force"))
        mechanic = normalize_mechanic(src.get("mechanic") if src else e.get("mechanic"))
        primary = e.get("primary") or []
        if src and src.get("primaryMuscles") and not primary:
            primary = src["primaryMuscles"]
            e["primary"] = primary

        before_eq = list(e.get("equipment") or [])
        before_slot = e.get("slot")
        before_force = e.get("force")
        before_mech = e.get("mechanic")

        e["equipment"] = enrich_equipment(e["name"], before_eq)
        e["force"] = force if force != "unknown" else (e.get("force") or "unknown")
        e["mechanic"] = mechanic if mechanic != "unknown" else (e.get("mechanic") or "unknown")
        e["slot"] = infer_slot(primary, e["force"], e["name"])

        if (
            e["equipment"] != sorted(before_eq)
            or e["slot"] != before_slot
            or e.get("force") != before_force
            or e.get("mechanic") != before_mech
        ):
            changed += 1

    # stats
    from collections import Counter

    slots = Counter(e["slot"] for e in data)
    print("slots after:", dict(slots))
    print(f"updated {changed}/{len(data)} exercises")

    # sample incline curls
    print("sample incline curls:")
    for e in data:
        if "incline" in e["name"].lower() and "curl" in e["name"].lower():
            print(f"  {e['name']}: eq={e['equipment']} slot={e['slot']} force={e.get('force')}")

    print("former total-slot exercises:")
    for eid, old in slot_before.items():
        if old == "total":
            e = next(x for x in data if x["id"] == eid)
            print(f"  {e['name']}: total -> {e['slot']}")

    EXERCISES_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"wrote {EXERCISES_PATH}")


if __name__ == "__main__":
    main()
