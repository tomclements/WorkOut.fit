#!/usr/bin/env python3
"""Import exercises from yuhonas/free-exercise-db into the Workout Planner seed data.

Usage:
    python scripts/import-free-exercise-db.py
    python scripts/import-free-exercise-db.py <path-to-free-exercises.json>
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "WorkoutPlanner.Api" / "Data"
EXERCISES_PATH = DATA_DIR / "exercises.json"
EQUIPMENT_PATH = DATA_DIR / "equipment.json"
FREE_DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"

EQUIPMENT_MAP = {
    "body only": ["bodyweight"],
    "none": ["bodyweight"],
    "dumbbell": ["dumbbells"],
    "barbell": ["barbell"],
    "kettlebells": ["kettlebell"],
    "cable": ["cable"],
    "machine": ["machines"],
    "bands": ["bands"],
    "medicine ball": ["medicine-ball"],
    "exercise ball": ["stability-ball"],
    "e-z curl bar": ["ez-bar"],
    "foam roll": ["foam-roller"],
}

SLOT_MAP = {
    "chest": "push",
    "triceps": "push",
    "shoulders": "push",
    "lats": "pull",
    "biceps": "pull",
    "middle back": "pull",
    "traps": "pull",
    "forearms": "pull",
    "quadriceps": "legs",
    "hamstrings": "legs",
    "calves": "legs",
    "glutes": "legs",
    "adductors": "legs",
    "abductors": "legs",
    "abdominals": "core",
    "lower back": "core",
    "neck": "total",
}

CATEGORIES_TO_INCLUDE = {
    "strength",
    "plyometrics",
    "powerlifting",
    "olympic weightlifting",
    "strongman",
}

NEW_EQUIPMENT = [
    {"id": "cable", "name": "Cable machine", "category": "gym"},
    {"id": "medicine-ball", "name": "Medicine ball", "category": "accessories"},
    {"id": "stability-ball", "name": "Stability ball", "category": "accessories"},
    {"id": "ez-bar", "name": "EZ curl bar", "category": "free-weights"},
    {"id": "foam-roller", "name": "Foam roller", "category": "accessories"},
]


def normalize_id(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def map_level(level: str) -> str:
    return {"expert": "advanced"}.get(level, level)


def map_slot(primary_muscles: list[str]) -> str:
    for muscle in primary_muscles:
        if muscle in SLOT_MAP:
            return SLOT_MAP[muscle]
    return "total"


def map_equipment(equipment: str | None) -> list[str] | None:
    return EQUIPMENT_MAP.get((equipment or "").lower())


def build_demo_url(name: str) -> str:
    query = urllib.parse.quote(f"{name} exercise")
    return f"https://www.youtube.com/results?search_query={query}"


IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"


def build_image_url(images: list) -> str | None:
    if not images:
        return None
    # Source paths look like "Barbell_Curl/0.jpg"
    return IMAGE_BASE + images[0]


def map_avoid_for(primary_muscles: list[str], secondary_muscles: list[str], category: str) -> list[str]:
    avoid = []
    all_muscles = set(primary_muscles) | set(secondary_muscles)

    if "lower back" in all_muscles:
        avoid.append("lower-back")
    if "neck" in all_muscles:
        avoid.append("neck")
    if "shoulders" in all_muscles:
        avoid.append("shoulder")
    if any(m in all_muscles for m in {"biceps", "triceps", "forearms"}):
        avoid.extend(["elbow", "wrist"])
    if any(m in all_muscles for m in {"quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"}):
        avoid.append("knee")
    if category in {"plyometrics", "olympic weightlifting", "strongman"}:
        avoid.extend(["knee", "wrist", "elbow", "shoulder", "lower-back"])
    return sorted(set(avoid))


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def import_exercises(source_path: str | None = None):
    if source_path:
        with open(source_path, "r", encoding="utf-8") as f:
            source_exercises = json.load(f)
    else:
        print(f"Downloading {FREE_DB_URL} ...")
        with urllib.request.urlopen(FREE_DB_URL) as response:
            source_exercises = json.loads(response.read().decode("utf-8"))

    existing = load_json(EXERCISES_PATH)
    existing_ids = {ex["id"] for ex in existing}
    equipment = load_json(EQUIPMENT_PATH)
    existing_equipment_ids = {eq["id"] for eq in equipment}

    added = 0
    skipped = 0
    duplicate = 0

    for src in source_exercises:
        category = src.get("category", "")
        if category not in CATEGORIES_TO_INCLUDE:
            skipped += 1
            continue

        mapped_equipment = map_equipment(src.get("equipment"))
        if mapped_equipment is None:
            skipped += 1
            continue

        exercise_id = normalize_id(src["name"])
        if exercise_id in existing_ids:
            duplicate += 1
            continue

        existing_ids.add(exercise_id)
        added += 1

        exercise = {
            "id": exercise_id,
            "name": src["name"],
            "equipment": mapped_equipment,
            "level": map_level(src.get("level", "beginner")),
            "primary": src.get("primaryMuscles", []),
            "secondary": src.get("secondaryMuscles", []),
            "slot": map_slot(src.get("primaryMuscles", [])),
            "baseSets": 3,
            "repsMin": 8,
            "repsMax": 12,
            "isTimeBased": False,
            "workDuration": 30,
            "restSec": 60,
            "demoUrl": build_demo_url(src["name"]),
            "imageUrl": build_image_url(src.get("images") or []),
            "avoidFor": map_avoid_for(src.get("primaryMuscles", []), src.get("secondaryMuscles", []), category),
        }
        existing.append(exercise)

    for new_eq in NEW_EQUIPMENT:
        if new_eq["id"] not in existing_equipment_ids:
            equipment.append(new_eq)
            existing_equipment_ids.add(new_eq["id"])

    save_json(EXERCISES_PATH, existing)
    save_json(EQUIPMENT_PATH, equipment)

    print(f"Imported {added} exercises ({skipped} skipped, {duplicate} duplicates).")
    print(f"Total exercises: {len(existing)}")
    print(f"Total equipment options: {len(equipment)}")


if __name__ == "__main__":
    import_exercises(sys.argv[1] if len(sys.argv) > 1 else None)
